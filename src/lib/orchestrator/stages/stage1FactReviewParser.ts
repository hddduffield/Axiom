import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type Anthropic from "@anthropic-ai/sdk";
import { ZodError } from "zod";
import {
  ClientProfileBodySchema,
  type AttemptHistoryEntry,
  type ClientProfile,
  type ClientProfileFailed,
  type StageMetadata,
} from "../schemas/clientProfile";
import {
  computeFactReviewHash,
  extractFactReviewText,
} from "../utils/factReviewIO";

// ────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────

const STAGE_VERSION = "1.0.1";
const MODEL = "claude-opus-4-7";
// 16K leaves headroom for the full ClientProfile + extensive advisor_observations.
// Holloway empirically produces ~14,760 output tokens; raising the cap prevents
// mid-string truncation that would force a doomed retry loop.
const MAX_TOKENS = 16000;

// Resolve the system prompt path relative to this module so the parser works
// no matter where the runtime cwd is.
const SYSTEM_PROMPT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "stage1.system.md",
);

let cachedSystemPrompt: string | null = null;
async function loadSystemPrompt(): Promise<string> {
  if (cachedSystemPrompt !== null) return cachedSystemPrompt;
  cachedSystemPrompt = await readFile(SYSTEM_PROMPT_PATH, "utf8");
  return cachedSystemPrompt;
}

// Test-only cache reset (used in unit tests where the prompt file path varies).
export function _resetSystemPromptCacheForTesting(): void {
  cachedSystemPrompt = null;
}

// ────────────────────────────────────────────────────────────────────────
// Stage1ApiClient is a structural interface satisfied by both the real
// Anthropic SDK and test mocks. Subsequent LLM stages should use the same
// pattern to keep test injection clean without type casts.
// ────────────────────────────────────────────────────────────────────────

export interface Stage1ApiClient {
  messages: {
    create: (
      params: Anthropic.MessageCreateParamsNonStreaming,
    ) => Promise<Anthropic.Message>;
  };
}

export interface Stage1Options {
  apiClient: Stage1ApiClient;
  referenceDate?: Date;
  maxRetries?: number;
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function buildInitialUserTurn(factReviewText: string): string {
  return [
    "Parse the following Fact Review into structured ClientProfile JSON per the schema in your system prompt.",
    "Return ONLY the JSON object — no preamble, no commentary, no markdown code fences.",
    "",
    "<fact_review_text>",
    factReviewText,
    "</fact_review_text>",
    "",
    "Output the ClientProfile JSON now.",
  ].join("\n");
}

function extractResponseText(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

function formatZodIssues(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const at = issue.path.length > 0 ? issue.path.join(".") : "<root>";
    return `${at}: ${issue.message}`;
  });
}

function buildJsonRetryUserTurn(parseError: string): string {
  return `Your previous response was not valid JSON. The error was: ${parseError}. Output ONLY a JSON object now — no preamble, no commentary, no markdown code fences.`;
}

function buildSchemaRetryUserTurn(errors: string[]): string {
  return [
    "Your previous response did not match the ClientProfile schema. Errors:",
    ...errors.map((e) => `- ${e}`),
    "",
    "Output a corrected JSON object now — no preamble, no commentary, no markdown code fences.",
  ].join("\n");
}

function makeFailure(
  failureType: ClientProfileFailed["_failure_type"],
  reason: string,
  context: ClientProfileFailed["_failure_context"],
  partialMetadata: Partial<StageMetadata>,
): ClientProfileFailed {
  return {
    _stage_status: "FAILED",
    _failure_type: failureType,
    _failure_reason: reason,
    _failure_context: context,
    _metadata: partialMetadata,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Main entry
// ────────────────────────────────────────────────────────────────────────

export async function parseFactReview(
  factReviewPath: string,
  options: Stage1Options,
): Promise<ClientProfile | ClientProfileFailed> {
  const startTime = Date.now();
  const maxRetries = options.maxRetries ?? 1;
  const maxAttempts = maxRetries + 1;
  const attemptHistory: AttemptHistoryEntry[] = [];
  const partialMetadata = (
    attemptsMade: number,
    contentHash = "",
    inputTokens = 0,
    outputTokens = 0,
    cacheCreation = 0,
    cacheRead = 0,
  ): Partial<StageMetadata> => ({
    stage_version: STAGE_VERSION,
    model_used: MODEL,
    input_token_count: inputTokens,
    output_token_count: outputTokens,
    cache_creation_input_tokens: cacheCreation,
    cache_read_input_tokens: cacheRead,
    attempts_made: attemptsMade,
    attempt_history: [...attemptHistory],
    duration_ms: Date.now() - startTime,
    source_fr_content_hash: contentHash,
    parsed_at: new Date().toISOString(),
  });

  // Step 1 — extract FR text
  let extractedText: string;
  let contentHash: string;
  try {
    const extraction = await extractFactReviewText(factReviewPath);
    extractedText = extraction.text;
    contentHash = computeFactReviewHash(extractedText);
  } catch (err) {
    return makeFailure(
      "fr_extraction_failed",
      `Could not extract Fact Review text: ${(err as Error).message}`,
      { attempts_made: 0 },
      partialMetadata(0),
    );
  }

  // Step 2 — initial user turn
  const userTurn = buildInitialUserTurn(extractedText);
  const conversation: Anthropic.MessageParam[] = [
    { role: "user", content: userTurn },
  ];

  let systemPrompt: string;
  try {
    systemPrompt = await loadSystemPrompt();
  } catch (err) {
    return makeFailure(
      "fr_extraction_failed",
      `Could not load Stage 1 system prompt: ${(err as Error).message}`,
      { attempts_made: 0 },
      partialMetadata(0, contentHash),
    );
  }

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheCreation = 0;
  let totalCacheRead = 0;

  // Track the most-recent retryable failure so we can wrap it in
  // max_retries_exceeded once all attempts are spent.
  type LastRetryFailure =
    | {
        type: "json_parse_failed";
        parse_error: string;
        raw_response: string;
      }
    | {
        type: "schema_validation_failed";
        validation_errors: string[];
        parsed_response: unknown;
        raw_response: string;
      };
  let lastRetryFailure: LastRetryFailure | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const attemptStart = Date.now();
    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: conversation,
    };

    // Diagnostic logging — set DEBUG_LLM_WIRE=1 to see exactly what is sent.
    // The body of system + messages is summarized (lengths only) so the FR
    // text and prompt body don't flood the console.
    if (process.env.DEBUG_LLM_WIRE) {
      const wireSummary = {
        attempt,
        model: params.model,
        max_tokens: params.max_tokens,
        system: Array.isArray(params.system)
          ? params.system.map((b) => ({
              type: b.type,
              cache_control: b.cache_control ?? null,
              text_length: "text" in b ? b.text.length : null,
              text_token_estimate:
                "text" in b ? Math.ceil(b.text.length / 4) : null,
            }))
          : { type: "string", text_length: (params.system as string)?.length },
        messages: params.messages.map((m, i) => ({
          index: i,
          role: m.role,
          content_type: typeof m.content,
          content_length:
            typeof m.content === "string" ? m.content.length : Array.isArray(m.content) ? `array[${m.content.length}]` : "?",
          cache_control_present:
            typeof m.content === "string"
              ? false
              : Array.isArray(m.content)
              ? m.content.some((b: { cache_control?: unknown }) => b.cache_control !== undefined)
              : false,
        })),
      };
      console.log(`\n========== STAGE 1 WIRE SHAPE (attempt ${attempt}) ==========`);
      console.log(JSON.stringify(wireSummary, null, 2));
      console.log("===========================================================\n");
    }

    // Step 3 — API call (with prompt caching on the system prompt).
    let response: Anthropic.Message;
    try {
      // Note: temperature is deprecated for claude-opus-4-7. The API returns
      // 400 invalid_request_error if temperature is set. Omit entirely.
      response = await options.apiClient.messages.create(params);
    } catch (err) {
      const apiErr = (err as Error).message;
      attemptHistory.push({
        attempt_number: attempt,
        outcome: "api_error",
        failure_details: apiErr,
        duration_ms: Date.now() - attemptStart,
        input_tokens: 0,
        output_tokens: 0,
      });
      // API errors are not retried — they short-circuit immediately.
      return makeFailure(
        "api_error",
        `Anthropic API call failed: ${apiErr}`,
        { api_error: apiErr, attempts_made: attempt },
        partialMetadata(
          attempt,
          contentHash,
          totalInputTokens,
          totalOutputTokens,
          totalCacheCreation,
          totalCacheRead,
        ),
      );
    }

    const attemptInputTokens = response.usage?.input_tokens ?? 0;
    const attemptOutputTokens = response.usage?.output_tokens ?? 0;
    totalInputTokens += attemptInputTokens;
    totalOutputTokens += attemptOutputTokens;
    totalCacheCreation += response.usage?.cache_creation_input_tokens ?? 0;
    totalCacheRead += response.usage?.cache_read_input_tokens ?? 0;

    // Step 4 — extract response text
    const responseText = extractResponseText(response);

    // Step 5 — parse JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(responseText);
    } catch (err) {
      const parseError = (err as Error).message;
      lastRetryFailure = {
        type: "json_parse_failed",
        parse_error: parseError,
        raw_response: responseText,
      };
      attemptHistory.push({
        attempt_number: attempt,
        outcome: "json_parse_failed",
        failure_details: parseError,
        duration_ms: Date.now() - attemptStart,
        input_tokens: attemptInputTokens,
        output_tokens: attemptOutputTokens,
      });
      if (attempt === maxAttempts) break;
      conversation.push({ role: "assistant", content: responseText });
      conversation.push({
        role: "user",
        content: buildJsonRetryUserTurn(parseError),
      });
      continue;
    }

    // Step 6 — schema validation
    const validation = ClientProfileBodySchema.safeParse(parsed);
    if (!validation.success) {
      const errors = formatZodIssues(validation.error);
      lastRetryFailure = {
        type: "schema_validation_failed",
        validation_errors: errors,
        parsed_response: parsed,
        raw_response: responseText,
      };
      attemptHistory.push({
        attempt_number: attempt,
        outcome: "schema_validation_failed",
        failure_details: errors.join("; "),
        duration_ms: Date.now() - attemptStart,
        input_tokens: attemptInputTokens,
        output_tokens: attemptOutputTokens,
      });
      if (attempt === maxAttempts) break;
      conversation.push({ role: "assistant", content: responseText });
      conversation.push({
        role: "user",
        content: buildSchemaRetryUserTurn(errors),
      });
      continue;
    }

    // Step 7 — build metadata, return ClientProfile
    attemptHistory.push({
      attempt_number: attempt,
      outcome: "success",
      failure_details: null,
      duration_ms: Date.now() - attemptStart,
      input_tokens: attemptInputTokens,
      output_tokens: attemptOutputTokens,
    });
    const metadata: StageMetadata = {
      stage_version: STAGE_VERSION,
      model_used: MODEL,
      input_token_count: totalInputTokens,
      output_token_count: totalOutputTokens,
      cache_creation_input_tokens: totalCacheCreation,
      cache_read_input_tokens: totalCacheRead,
      attempts_made: attempt,
      attempt_history: attemptHistory,
      duration_ms: Date.now() - startTime,
      source_fr_content_hash: contentHash,
      parsed_at: new Date().toISOString(),
    };
    return {
      ...validation.data,
      _metadata: metadata,
    };
  }

  // All attempts exhausted with retryable failures.
  if (lastRetryFailure) {
    const partial = partialMetadata(
      maxAttempts,
      contentHash,
      totalInputTokens,
      totalOutputTokens,
      totalCacheCreation,
      totalCacheRead,
    );
    if (maxAttempts > 1) {
      // Wrap in max_retries_exceeded with the underlying issue.
      const baseContext: ClientProfileFailed["_failure_context"] = {
        attempts_made: maxAttempts,
        last_failure_type: lastRetryFailure.type,
        raw_response: lastRetryFailure.raw_response,
      };
      if (lastRetryFailure.type === "json_parse_failed") {
        baseContext.parse_error = lastRetryFailure.parse_error;
      } else {
        baseContext.validation_errors = lastRetryFailure.validation_errors;
        baseContext.parsed_response = lastRetryFailure.parsed_response;
      }
      return makeFailure(
        "max_retries_exceeded",
        `All ${maxAttempts} attempts failed; last failure was ${lastRetryFailure.type}.`,
        baseContext,
        partial,
      );
    }
    // Single-attempt failure (maxRetries: 0) — surface the immediate type.
    if (lastRetryFailure.type === "json_parse_failed") {
      return makeFailure(
        "json_parse_failed",
        "Model response was not valid JSON.",
        {
          parse_error: lastRetryFailure.parse_error,
          raw_response: lastRetryFailure.raw_response,
          attempts_made: maxAttempts,
        },
        partial,
      );
    }
    return makeFailure(
      "schema_validation_failed",
      "Model response did not match the ClientProfile schema.",
      {
        validation_errors: lastRetryFailure.validation_errors,
        parsed_response: lastRetryFailure.parsed_response,
        raw_response: lastRetryFailure.raw_response,
        attempts_made: maxAttempts,
      },
      partial,
    );
  }

  // Defensive: loop should always either return success or set lastRetryFailure.
  return makeFailure(
    "max_retries_exceeded",
    "parseFactReview retry loop exited without recording a failure — unreachable in normal flow.",
    { attempts_made: maxAttempts },
    partialMetadata(
      maxAttempts,
      contentHash,
      totalInputTokens,
      totalOutputTokens,
      totalCacheCreation,
      totalCacheRead,
    ),
  );
}
