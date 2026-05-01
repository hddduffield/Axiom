import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type Anthropic from "@anthropic-ai/sdk";
import { ZodError } from "zod";
import type { ClientProfile, AttemptHistoryEntry, StageMetadata } from "../schemas/clientProfile";
import {
  SelectedRecommendationsBodySchema,
  formatCrossRefErrors,
  validateCrossReferences,
  type SelectedRecommendations,
  type SelectedRecommendationsBody,
  type SelectedRecommendationsFailed,
} from "../schemas/selectedRecommendations";

// ────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────

const STAGE_VERSION = "2.0.1";
const MODEL = "claude-opus-4-7";
// Stage 2 output is large: up to 30 selected recs × structured JSON + capped
// auxiliary pools. 16K truncated mid-rec; 32K trips the SDK's "streaming
// required for >10 min" threshold; 24K still leaves the model room to emit
// malformed JSON when it tries to over-include candidates. 28K with streaming
// + auxiliary pool caps + field-length discipline gives clean headroom.
const MAX_TOKENS = 28000;

const SYSTEM_PROMPT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "stage2.system.md",
);

const DEFAULT_KB_PATH = "kb/v1_2";

// Stage1ApiClient sibling — same structural pattern lets a real Anthropic
// instance and test mocks both satisfy the contract without casts.
//
// Stage 2 uses streaming because Holloway-scale output (50 selected recs × full
// JSON shape) typically exceeds the SDK's "streaming required for >10 minute
// requests" threshold even at non-streaming-friendly max_tokens. The
// `messages.stream()` helper returns a MessageStream object whose
// `finalMessage()` resolves to the same `Anthropic.Message` shape as the
// non-streaming `create()` would have produced — so downstream consumers see
// no difference.
export interface Stage2MessageStream {
  finalMessage: () => Promise<Anthropic.Message>;
}

export interface Stage2ApiClient {
  messages: {
    stream: (
      params: Anthropic.MessageCreateParamsNonStreaming,
    ) => Stage2MessageStream;
  };
}

export interface LandmineAuthorization {
  recommendation_id: string;
  authorized_by: string;
}

export interface Stage2Options {
  apiClient: Stage2ApiClient;
  kbPath?: string;
  maxRetries?: number;
  referenceDate?: Date;
  landmineAuthorizations?: LandmineAuthorization[];
}

// ────────────────────────────────────────────────────────────────────────
// KB loader
// ────────────────────────────────────────────────────────────────────────

interface KBContext {
  registry: string;
  triggeringMatrix: string;
  hardSequencingRules: string;
  engagementArchetypes: string;
  independentRecs: string;
  registryIds: ReadonlySet<string>;
}

interface KBContextWithMaster extends KBContext {
  masterSequenceLabel: "pre_exit" | "post_exit" | "none";
  masterSequence: string | null;
}

const baseKBCache = new Map<string, KBContext>();
const masterSequenceCache = new Map<string, string>();

async function loadBaseKB(kbPath: string): Promise<KBContext> {
  const cached = baseKBCache.get(kbPath);
  if (cached) return cached;

  const read = (rel: string) => readFile(path.join(kbPath, rel), "utf8");
  const [registry, triggeringMatrix, hardSequencingRules, engagementArchetypes, independentRecs] =
    await Promise.all([
      read("00_master/02_RECOMMENDATION_ID_REGISTRY.md"),
      read("03_sequencing/05_triggering_matrix.md"),
      read("03_sequencing/03_hard_sequencing_rules.md"),
      read("03_sequencing/06_engagement_archetypes.md"),
      read("03_sequencing/04_independent_recommendations.md"),
    ]);

  const registryIds = new Set<string>();
  const idRe = /REC-[A-Z]{3}-\d{3}/g;
  for (const m of registry.matchAll(idRe)) registryIds.add(m[0]);

  const ctx: KBContext = {
    registry,
    triggeringMatrix,
    hardSequencingRules,
    engagementArchetypes,
    independentRecs,
    registryIds,
  };
  baseKBCache.set(kbPath, ctx);
  return ctx;
}

async function loadMasterSequenceForArchetype(
  kbPath: string,
  archetype: ClientProfile["engagement"]["archetype"],
): Promise<{ label: KBContextWithMaster["masterSequenceLabel"]; content: string | null }> {
  let rel: string | null = null;
  let label: KBContextWithMaster["masterSequenceLabel"] = "none";
  if (archetype === "PRE") {
    rel = "03_sequencing/01_master_sequence_pre_exit.md";
    label = "pre_exit";
  } else if (archetype === "POST") {
    rel = "03_sequencing/02_master_sequence_post_exit.md";
    label = "post_exit";
  } else {
    return { label: "none", content: null };
  }
  const cacheKey = `${kbPath}|${label}`;
  const cached = masterSequenceCache.get(cacheKey);
  if (cached !== undefined) return { label, content: cached };
  const content = await readFile(path.join(kbPath, rel), "utf8");
  masterSequenceCache.set(cacheKey, content);
  return { label, content };
}

export function _resetKBCacheForTesting(): void {
  baseKBCache.clear();
  masterSequenceCache.clear();
}

// ────────────────────────────────────────────────────────────────────────
// System prompt loader
// ────────────────────────────────────────────────────────────────────────

let cachedSystemPrompt: string | null = null;
async function loadSystemPrompt(): Promise<string> {
  if (cachedSystemPrompt !== null) return cachedSystemPrompt;
  cachedSystemPrompt = await readFile(SYSTEM_PROMPT_PATH, "utf8");
  return cachedSystemPrompt;
}

export function _resetSystemPromptCacheForTesting(): void {
  cachedSystemPrompt = null;
}

// ────────────────────────────────────────────────────────────────────────
// User-turn construction
// ────────────────────────────────────────────────────────────────────────

function buildInitialUserTurn(
  clientProfile: ClientProfile,
  kb: KBContextWithMaster,
  landmineAuthorizations: LandmineAuthorization[] | undefined,
): string {
  const parts: string[] = [];
  parts.push("<client_profile>");
  parts.push(JSON.stringify(clientProfile, null, 2));
  parts.push("</client_profile>");
  parts.push("");
  parts.push("<kb_recommendation_id_registry>");
  parts.push(kb.registry);
  parts.push("</kb_recommendation_id_registry>");
  parts.push("");
  parts.push("<kb_triggering_matrix>");
  parts.push(kb.triggeringMatrix);
  parts.push("</kb_triggering_matrix>");
  parts.push("");
  parts.push("<kb_hard_sequencing_rules>");
  parts.push(kb.hardSequencingRules);
  parts.push("</kb_hard_sequencing_rules>");
  parts.push("");
  parts.push("<kb_engagement_archetypes>");
  parts.push(kb.engagementArchetypes);
  parts.push("</kb_engagement_archetypes>");
  parts.push("");
  parts.push("<kb_independent_recommendations>");
  parts.push(kb.independentRecs);
  parts.push("</kb_independent_recommendations>");
  parts.push("");
  if (kb.masterSequence !== null) {
    parts.push(`<kb_master_sequence_${kb.masterSequenceLabel}>`);
    parts.push(kb.masterSequence);
    parts.push(`</kb_master_sequence_${kb.masterSequenceLabel}>`);
    parts.push("");
  }
  if (landmineAuthorizations && landmineAuthorizations.length > 0) {
    parts.push("<landmine_authorizations>");
    parts.push(JSON.stringify(landmineAuthorizations, null, 2));
    parts.push("</landmine_authorizations>");
    parts.push("");
  }
  parts.push(
    "Run the three-pass selection per your system prompt. Output the SelectedRecommendations JSON now — no preamble, no commentary, no markdown code fences.",
  );
  return parts.join("\n");
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

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
    "Your previous response did not match the SelectedRecommendations schema OR violated the cross-reference constraints. Errors:",
    ...errors.map((e) => `- ${e}`),
    "",
    "Output a corrected JSON object now — no preamble, no commentary, no markdown code fences. Pay particular attention to: (1) every recommendation_id must be in the registry, (2) every sequencing-relation rec_id must be in selected[], (3) selected[] must have between 5 and 50 entries.",
  ].join("\n");
}

function makeFailure(
  failureType: SelectedRecommendationsFailed["_failure_type"],
  reason: string,
  context: SelectedRecommendationsFailed["_failure_context"],
  partialMetadata: Partial<StageMetadata>,
): SelectedRecommendationsFailed {
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

export async function selectRecommendations(
  clientProfile: ClientProfile,
  options: Stage2Options,
): Promise<SelectedRecommendations | SelectedRecommendationsFailed> {
  const startTime = Date.now();
  const maxRetries = options.maxRetries ?? 1;
  const maxAttempts = maxRetries + 1;
  const kbPath = options.kbPath ?? DEFAULT_KB_PATH;
  const attemptHistory: AttemptHistoryEntry[] = [];

  const partialMetadata = (
    attemptsMade: number,
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
    source_fr_content_hash: clientProfile._metadata?.source_fr_content_hash ?? "",
    parsed_at: new Date().toISOString(),
  });

  // Load KB context.
  let baseKB: KBContext;
  let masterSequenceLabel: KBContextWithMaster["masterSequenceLabel"];
  let masterSequence: string | null;
  try {
    baseKB = await loadBaseKB(kbPath);
    const ms = await loadMasterSequenceForArchetype(
      kbPath,
      clientProfile.engagement.archetype,
    );
    masterSequenceLabel = ms.label;
    masterSequence = ms.content;
  } catch (err) {
    return makeFailure(
      "kb_load_failed",
      `Could not load KB context from ${kbPath}: ${(err as Error).message}`,
      { kb_load_error: (err as Error).message, attempts_made: 0 },
      partialMetadata(0),
    );
  }

  const kbWithMaster: KBContextWithMaster = {
    ...baseKB,
    masterSequenceLabel,
    masterSequence,
  };

  let systemPrompt: string;
  try {
    systemPrompt = await loadSystemPrompt();
  } catch (err) {
    return makeFailure(
      "kb_load_failed",
      `Could not load Stage 2 system prompt: ${(err as Error).message}`,
      { kb_load_error: (err as Error).message, attempts_made: 0 },
      partialMetadata(0),
    );
  }

  const initialUserTurn = buildInitialUserTurn(
    clientProfile,
    kbWithMaster,
    options.landmineAuthorizations,
  );
  const conversation: Anthropic.MessageParam[] = [
    { role: "user", content: initialUserTurn },
  ];

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheCreation = 0;
  let totalCacheRead = 0;

  type LastRetryFailure =
    | { type: "json_parse_failed"; parse_error: string; raw_response: string }
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

    if (process.env.DEBUG_LLM_WIRE) {
      console.log(`\n========== STAGE 2 WIRE SHAPE (attempt ${attempt}) ==========`);
      console.log(
        JSON.stringify(
          {
            attempt,
            model: params.model,
            max_tokens: params.max_tokens,
            system: Array.isArray(params.system)
              ? params.system.map((b) => ({
                  type: b.type,
                  cache_control: b.cache_control ?? null,
                  text_length: "text" in b ? b.text.length : null,
                }))
              : null,
            messages: params.messages.map((m, i) => ({
              index: i,
              role: m.role,
              content_length:
                typeof m.content === "string"
                  ? m.content.length
                  : Array.isArray(m.content)
                  ? `array[${m.content.length}]`
                  : "?",
            })),
          },
          null,
          2,
        ),
      );
      console.log("===========================================================\n");
    }

    let response: Anthropic.Message;
    try {
      const stream = options.apiClient.messages.stream(params);
      response = await stream.finalMessage();
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
      return makeFailure(
        "api_error",
        `Anthropic API call failed: ${apiErr}`,
        { api_error: apiErr, attempts_made: attempt },
        partialMetadata(attempt, totalInputTokens, totalOutputTokens, totalCacheCreation, totalCacheRead),
      );
    }

    const aIn = response.usage?.input_tokens ?? 0;
    const aOut = response.usage?.output_tokens ?? 0;
    totalInputTokens += aIn;
    totalOutputTokens += aOut;
    totalCacheCreation += response.usage?.cache_creation_input_tokens ?? 0;
    totalCacheRead += response.usage?.cache_read_input_tokens ?? 0;

    const responseText = extractResponseText(response);

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
        input_tokens: aIn,
        output_tokens: aOut,
      });
      if (attempt === maxAttempts) break;
      conversation.push({ role: "assistant", content: responseText });
      conversation.push({ role: "user", content: buildJsonRetryUserTurn(parseError) });
      continue;
    }

    // Zod shape validation.
    const shape = SelectedRecommendationsBodySchema.safeParse(parsed);
    if (!shape.success) {
      const errors = formatZodIssues(shape.error);
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
        input_tokens: aIn,
        output_tokens: aOut,
      });
      if (attempt === maxAttempts) break;
      conversation.push({ role: "assistant", content: responseText });
      conversation.push({ role: "user", content: buildSchemaRetryUserTurn(errors) });
      continue;
    }

    // Cross-reference validation (orphan IDs / orphan sequencing / count cap).
    const xrefErrors = validateCrossReferences(shape.data, baseKB.registryIds);
    if (xrefErrors.length > 0) {
      const formatted = formatCrossRefErrors(xrefErrors);
      lastRetryFailure = {
        type: "schema_validation_failed",
        validation_errors: formatted,
        parsed_response: parsed,
        raw_response: responseText,
      };
      attemptHistory.push({
        attempt_number: attempt,
        outcome: "schema_validation_failed",
        failure_details: formatted.join("; "),
        duration_ms: Date.now() - attemptStart,
        input_tokens: aIn,
        output_tokens: aOut,
      });
      if (attempt === maxAttempts) break;
      conversation.push({ role: "assistant", content: responseText });
      conversation.push({ role: "user", content: buildSchemaRetryUserTurn(formatted) });
      continue;
    }

    // Success.
    attemptHistory.push({
      attempt_number: attempt,
      outcome: "success",
      failure_details: null,
      duration_ms: Date.now() - attemptStart,
      input_tokens: aIn,
      output_tokens: aOut,
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
      source_fr_content_hash: clientProfile._metadata?.source_fr_content_hash ?? "",
      parsed_at: new Date().toISOString(),
    };
    return { ...shape.data, _metadata: metadata };
  }

  // Retries exhausted.
  if (lastRetryFailure) {
    const partial = partialMetadata(
      maxAttempts,
      totalInputTokens,
      totalOutputTokens,
      totalCacheCreation,
      totalCacheRead,
    );
    if (maxAttempts > 1) {
      const ctx: SelectedRecommendationsFailed["_failure_context"] = {
        attempts_made: maxAttempts,
        last_failure_type: lastRetryFailure.type,
        raw_response: lastRetryFailure.raw_response,
      };
      if (lastRetryFailure.type === "json_parse_failed") {
        ctx.parse_error = lastRetryFailure.parse_error;
      } else {
        ctx.validation_errors = lastRetryFailure.validation_errors;
        ctx.parsed_response = lastRetryFailure.parsed_response;
      }
      return makeFailure(
        "max_retries_exceeded",
        `All ${maxAttempts} attempts failed; last failure was ${lastRetryFailure.type}.`,
        ctx,
        partial,
      );
    }
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
      "Model response did not match the SelectedRecommendations schema or violated cross-references.",
      {
        validation_errors: lastRetryFailure.validation_errors,
        parsed_response: lastRetryFailure.parsed_response,
        raw_response: lastRetryFailure.raw_response,
        attempts_made: maxAttempts,
      },
      partial,
    );
  }

  return makeFailure(
    "max_retries_exceeded",
    "selectRecommendations retry loop exited without recording a failure — unreachable in normal flow.",
    { attempts_made: maxAttempts },
    partialMetadata(maxAttempts, totalInputTokens, totalOutputTokens, totalCacheCreation, totalCacheRead),
  );
}
