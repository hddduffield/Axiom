// Stage 3a.1 — Batch Quantifier.
//
// Takes a batch of 15–25 SelectedRecommendations and emits a SequencedRecommendation
// for each, with quantified_impact + action_items populated. The orchestrator
// (stage3aOrchestration.ts) calls this multiple times in parallel; Stage 3a.2
// (stage3a2CrossRecValidator.ts) merges and validates cross-batch references.
//
// Mirrors the Stage 1 module pattern: structural ApiClient interface for test
// injection, system prompt cached at module scope, retry loop on JSON parse and
// schema validation failures, attempt_history surfaced in metadata.

import { readFile, readdir } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type Anthropic from "@anthropic-ai/sdk";
import { ZodError } from "zod";
import {
  Stage3a1ResponseBodySchema,
  type BatchContext,
  type Stage3a1Metadata,
  type Stage3a1Result,
  type Stage3a1ResultFailed,
  type Stage3a1FailureType,
} from "../schemas/stage3a1.types";
import type { SelectedRecommendation } from "../schemas/selectedRecommendations";
import type { ClientProfile, AttemptHistoryEntry } from "../schemas/clientProfile";
import type { FirmPolicyQuestionId } from "../schemas/pipelineTypes";

// ────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────

const STAGE_VERSION = "3a.1-1.0.0";
const MODEL = "claude-opus-4-7";
// Per-batch output is ~6-10K tokens for a 25-rec batch. 16K leaves comfortable
// headroom for the State C-heavy / multi-action-item case.
const MAX_TOKENS = 16000;
const DEFAULT_KB_PATH = "kb/v1_2";
// Conservative input-token estimate cap. Opus 4.7 context is 200K but practical
// throughput suffers above ~150K. Fail-fast at 180K so the orchestrator can
// reduce batch size rather than burn an API call on doomed input.
const INPUT_TOKEN_CEILING = 180000;

// Opus 4.7 pricing (cents per million tokens). Used for cost computation in
// the harness (stage3aOrchestration.ts) but defined here so per-batch metadata
// callers can apply consistent rates.
export const OPUS_4_7_INPUT_CENTS_PER_M = 1500;        // $15/M
export const OPUS_4_7_OUTPUT_CENTS_PER_M = 7500;       // $75/M
export const OPUS_4_7_CACHE_WRITE_CENTS_PER_M = 1875;  // $18.75/M (5m TTL)
export const OPUS_4_7_CACHE_READ_CENTS_PER_M = 150;    // $1.50/M

const SYSTEM_PROMPT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "stage3a1.system.md",
);

let cachedSystemPrompt: string | null = null;
async function loadSystemPrompt(): Promise<string> {
  if (cachedSystemPrompt !== null) return cachedSystemPrompt;
  cachedSystemPrompt = await readFile(SYSTEM_PROMPT_PATH, "utf8");
  return cachedSystemPrompt;
}

// Module-scope reference KB cache (keyed by kbPath). Cleared via test reset.
interface ReferenceKBCache {
  federalIncomeTaxLimits: string;
  federalEstateGiftGst: string;
  georgiaSpecifics: string;
  obbbaChangesSummary: string;
  combined: string;
}
const referenceKBCache = new Map<string, ReferenceKBCache>();

// Rec-file directory map by ID prefix.
const CATEGORY_DIR_BY_PREFIX: Record<string, string> = {
  "REC-ENT": "entity_structure",
  "REC-EST": "estate",
  "REC-TAX": "tax",
  "REC-RSK": "risk_insurance",
  "REC-SUC": "succession_retention",
  "REC-INV": "investment",
  "REC-RET": "retirement",
  "REC-FAM": "family",
  "REC-CHR": "charitable",
  "REC-SPC": "specialty",
};

// Test-only cache reset (used in unit tests where the prompt file path varies).
export function _resetCachesForTesting(): void {
  cachedSystemPrompt = null;
  referenceKBCache.clear();
}

// ────────────────────────────────────────────────────────────────────────
// Stage3a1ApiClient — structural interface satisfied by both the real
// Anthropic SDK and test mocks. Mirrors Stage 1's pattern.
// ────────────────────────────────────────────────────────────────────────

export interface Stage3a1ApiClient {
  messages: {
    create: (
      params: Anthropic.MessageCreateParamsNonStreaming,
    ) => Promise<Anthropic.Message>;
  };
}

export interface FirmPolicyResolution {
  question_id: FirmPolicyQuestionId | string;
  resolved_value: unknown;
  resolved_by: string;
  resolved_at: string;
}

export interface LandmineAuthorization {
  recommendation_id: string;
  authorized_by: string;
  authorized_at: string;
}

export interface Stage3a1Options {
  apiClient: Stage3a1ApiClient;
  kbPath?: string;
  referenceDate?: Date;
  firmPolicyResolutions?: FirmPolicyResolution[];
  landmineAuthorizations?: LandmineAuthorization[];
  maxRetries?: number;
}

// ────────────────────────────────────────────────────────────────────────
// KB loading helpers
// ────────────────────────────────────────────────────────────────────────

async function loadReferenceKB(kbPath: string): Promise<ReferenceKBCache> {
  const cached = referenceKBCache.get(kbPath);
  if (cached) return cached;

  const read = (rel: string) => readFile(path.join(kbPath, rel), "utf8");
  const [
    federalIncomeTaxLimits,
    federalEstateGiftGst,
    georgiaSpecifics,
    obbbaChangesSummary,
  ] = await Promise.all([
    read("02_reference/02_federal_income_tax_limits.md"),
    read("02_reference/01_federal_estate_gift_gst.md"),
    read("02_reference/07_georgia_specifics.md"),
    read("02_reference/05_obbba_changes_summary.md"),
  ]);

  const combined = [
    "<reference_federal_income_tax_limits>",
    federalIncomeTaxLimits,
    "</reference_federal_income_tax_limits>",
    "",
    "<reference_federal_estate_gift_gst>",
    federalEstateGiftGst,
    "</reference_federal_estate_gift_gst>",
    "",
    "<reference_georgia_specifics>",
    georgiaSpecifics,
    "</reference_georgia_specifics>",
    "",
    "<reference_obbba_changes_summary>",
    obbbaChangesSummary,
    "</reference_obbba_changes_summary>",
  ].join("\n");

  const ctx: ReferenceKBCache = {
    federalIncomeTaxLimits,
    federalEstateGiftGst,
    georgiaSpecifics,
    obbbaChangesSummary,
    combined,
  };
  referenceKBCache.set(kbPath, ctx);
  return ctx;
}

async function loadVolatileRates(kbPath: string): Promise<{
  content: string;
  lastRefreshed: string | null;
}> {
  const content = await readFile(
    path.join(kbPath, "02_reference/08_volatile_rates_lookup.md"),
    "utf8",
  );
  // Extract "Last refreshed" date from the file header. Real KB uses the
  // markdown-friendly form `**Last refreshed:** April 16, 2026`. We capture
  // the entire date phrase up to end-of-line so Date.parse can interpret it.
  const m =
    content.match(/\*\*Last refreshed:\*\*\s*([^\n*]+)/i) ??
    content.match(/last_refreshed:\s*([^\n]+)/i);
  return { content, lastRefreshed: m?.[1]?.trim() ?? null };
}

async function loadRecFile(
  kbPath: string,
  recId: string,
): Promise<{ filePath: string; content: string }> {
  const prefix = recId.slice(0, 7); // "REC-XXX"
  const dir = CATEGORY_DIR_BY_PREFIX[prefix];
  if (!dir) {
    throw new Error(`Unknown rec_id prefix: ${prefix} (rec_id: ${recId})`);
  }
  const dirPath = path.join(kbPath, "01_recommendations", dir);
  const entries = await readdir(dirPath);
  // Find file matching `<recId>_*.md`
  const match = entries.find((f) => f.startsWith(`${recId}_`) && f.endsWith(".md"));
  if (!match) {
    throw new Error(`Rec file not found for ${recId} in ${dirPath}`);
  }
  const filePath = path.join(dirPath, match);
  const content = await readFile(filePath, "utf8");
  return { filePath, content };
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function buildInitialUserTurn(
  clientProfile: ClientProfile,
  batch: SelectedRecommendation[],
  batchContext: BatchContext,
  volatileRates: string,
  referenceKB: string,
  firmPolicyResolutions: FirmPolicyResolution[],
  landmineAuthorizations: LandmineAuthorization[],
  recFiles: Array<{ recId: string; content: string }>,
): string {
  const recBlocks = recFiles
    .map((rf) => `<rec id="${rf.recId}">\n${rf.content}\n</rec>`)
    .join("\n\n");

  return [
    "<client_profile>",
    JSON.stringify(clientProfile, null, 2),
    "</client_profile>",
    "",
    "<batch_context>",
    JSON.stringify(batchContext, null, 2),
    "</batch_context>",
    "",
    "<batch>",
    JSON.stringify(batch, null, 2),
    "</batch>",
    "",
    "<volatile_rates>",
    volatileRates,
    "</volatile_rates>",
    "",
    "<reference_kb>",
    referenceKB,
    "</reference_kb>",
    "",
    "<firm_policy_resolutions>",
    JSON.stringify(firmPolicyResolutions, null, 2),
    "</firm_policy_resolutions>",
    "",
    "<landmine_authorizations>",
    JSON.stringify(landmineAuthorizations, null, 2),
    "</landmine_authorizations>",
    "",
    "<rec_files>",
    recBlocks,
    "</rec_files>",
    "",
    "For every recommendation in <batch>, produce a SequencedRecommendation with quantified_impact and action_items per your system prompt. Output ONLY the JSON object now — no preamble, no commentary, no markdown code fences.",
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
    "Your previous response did not match the Stage3a1Result schema. Errors:",
    ...errors.map((e) => `- ${e}`),
    "",
    "Output a corrected JSON object now — no preamble, no commentary, no markdown code fences.",
  ].join("\n");
}

function makeFailure(
  failureType: Stage3a1FailureType,
  reason: string,
  context: Stage3a1ResultFailed["_failure_context"],
  partialMetadata: Partial<Stage3a1Metadata>,
): Stage3a1ResultFailed {
  return {
    _stage_status: "FAILED",
    _failure_type: failureType,
    _failure_reason: reason,
    _failure_context: context,
    _metadata: partialMetadata,
  };
}

// Crude character-count token estimate (≈4 chars/token). Used for the
// pre-flight context-overflow check; the actual API call returns the precise
// `usage.input_tokens` count we record in metadata.
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function emptyFlags() {
  return {
    unenumerated_question_ids: [],
    formula_yielded_unviable_value: [],
    cluster_closer_skipped: [],
    section_assignment_ambiguity: [],
    timing_bucket_inferred: [],
    qualitative_fallback_used: [],
    blocked_inputs_summary: [],
    orphan_action_item_dependencies: [],
    orphan_sequencing_references: [],
    batch_failures_summary: [],
    coverage_gaps: [],
    volatile_rates_stale: [],
  };
}

// ────────────────────────────────────────────────────────────────────────
// Main entry
// ────────────────────────────────────────────────────────────────────────

export async function quantifyBatch(
  clientProfile: ClientProfile,
  batch: SelectedRecommendation[],
  batchContext: BatchContext,
  options: Stage3a1Options,
): Promise<Stage3a1Result | Stage3a1ResultFailed> {
  const startTime = Date.now();
  const kbPath = options.kbPath ?? DEFAULT_KB_PATH;
  const referenceDate = options.referenceDate ?? new Date();
  const firmPolicyResolutions = options.firmPolicyResolutions ?? [];
  const landmineAuthorizations = options.landmineAuthorizations ?? [];
  const maxRetries = options.maxRetries ?? 1;
  const maxAttempts = maxRetries + 1;
  const attemptHistory: AttemptHistoryEntry[] = [];

  const partialMetadata = (
    attemptsMade: number,
    inputTokens = 0,
    outputTokens = 0,
    cacheCreation = 0,
    cacheRead = 0,
  ): Partial<Stage3a1Metadata> => ({
    stage_version: STAGE_VERSION,
    model_used: MODEL,
    input_token_count: inputTokens,
    output_token_count: outputTokens,
    cache_creation_input_tokens: cacheCreation,
    cache_read_input_tokens: cacheRead,
    attempts_made: attemptsMade,
    attempt_history: [...attemptHistory],
    duration_ms: Date.now() - startTime,
    source_fr_content_hash:
      (clientProfile._metadata?.source_fr_content_hash as string) ?? "",
    parsed_at: new Date().toISOString(),
    batch_index: batchContext.batch_index,
    total_batches: batchContext.total_batches,
  });

  // Step 1.1 — Load rec files for every rec in the batch
  const recFiles: Array<{ recId: string; content: string }> = [];
  for (const rec of batch) {
    try {
      const { content } = await loadRecFile(kbPath, rec.recommendation_id);
      recFiles.push({ recId: rec.recommendation_id, content });
    } catch (err) {
      return makeFailure(
        "kb_load_failed",
        `Could not load rec file: ${(err as Error).message}`,
        {
          batch_index: batchContext.batch_index,
          missing_rec_id: rec.recommendation_id,
          attempts_made: 0,
        },
        partialMetadata(0),
      );
    }
  }

  // Step 1.2 — Load volatile rates
  let volatileRatesContent: string;
  let lastRefreshed: string | null;
  try {
    const v = await loadVolatileRates(kbPath);
    volatileRatesContent = v.content;
    lastRefreshed = v.lastRefreshed;
  } catch (err) {
    return makeFailure(
      "kb_load_failed",
      `Could not load volatile rates: ${(err as Error).message}`,
      { batch_index: batchContext.batch_index, attempts_made: 0 },
      partialMetadata(0),
    );
  }

  // Step 1.3 — Load reference KB
  let referenceKB: ReferenceKBCache;
  try {
    referenceKB = await loadReferenceKB(kbPath);
  } catch (err) {
    return makeFailure(
      "kb_load_failed",
      `Could not load reference KB: ${(err as Error).message}`,
      { batch_index: batchContext.batch_index, attempts_made: 0 },
      partialMetadata(0),
    );
  }

  // Step 2.1 — Build user turn, check pre-flight context budget
  const userTurn = buildInitialUserTurn(
    clientProfile,
    batch,
    batchContext,
    volatileRatesContent,
    referenceKB.combined,
    firmPolicyResolutions,
    landmineAuthorizations,
    recFiles,
  );

  let systemPrompt: string;
  try {
    systemPrompt = await loadSystemPrompt();
  } catch (err) {
    return makeFailure(
      "fr_extraction_failed",
      `Could not load Stage 3a.1 system prompt: ${(err as Error).message}`,
      { batch_index: batchContext.batch_index, attempts_made: 0 },
      partialMetadata(0),
    );
  }

  const estimatedInputTokens =
    estimateTokens(userTurn) + estimateTokens(systemPrompt);
  if (estimatedInputTokens > INPUT_TOKEN_CEILING) {
    return makeFailure(
      "context_overflow",
      `Estimated input tokens (${estimatedInputTokens}) exceeds ceiling (${INPUT_TOKEN_CEILING}). Reduce batch size and retry.`,
      {
        batch_index: batchContext.batch_index,
        estimated_input_tokens: estimatedInputTokens,
        attempts_made: 0,
      },
      partialMetadata(0),
    );
  }

  // Step 1.4 — Volatile-rates staleness check (warning, not failure)
  let staleness: { last_refreshed: string; days_since_refresh: number } | null =
    null;
  if (lastRefreshed) {
    const refreshedDate = new Date(lastRefreshed);
    if (!Number.isNaN(refreshedDate.getTime())) {
      const ms = referenceDate.getTime() - refreshedDate.getTime();
      const days = Math.floor(ms / (1000 * 60 * 60 * 24));
      if (days > 30) {
        staleness = { last_refreshed: lastRefreshed, days_since_refresh: days };
      }
    }
  }

  // Step 2.2/2.3 — API call + retry loop
  const conversation: Anthropic.MessageParam[] = [
    { role: "user", content: userTurn },
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

    let response: Anthropic.Message;
    try {
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
      return makeFailure(
        "api_error",
        `Anthropic API call failed: ${apiErr}`,
        {
          batch_index: batchContext.batch_index,
          api_error: apiErr,
          attempts_made: attempt,
        },
        partialMetadata(
          attempt,
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

    const responseText = extractResponseText(response);

    // Step 2.3 — JSON parse
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
      conversation.push({ role: "user", content: buildJsonRetryUserTurn(parseError) });
      continue;
    }

    // Step 3.1 — schema validation (per-batch, scoped)
    const validation = Stage3a1ResponseBodySchema.safeParse(parsed);
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
      conversation.push({ role: "user", content: buildSchemaRetryUserTurn(errors) });
      continue;
    }

    // Step 3.1 — additional per-batch invariants beyond zod shape:
    // every recommendation_id MUST be in batch[].
    const batchRecIds = new Set(batch.map((b) => b.recommendation_id));
    const foreignIds = validation.data.recommendations
      .map((r) => r.recommendation_id)
      .filter((id) => !batchRecIds.has(id));
    if (foreignIds.length > 0) {
      const errMsg = `Recommendation IDs in output not present in this batch: ${foreignIds.join(", ")}`;
      lastRetryFailure = {
        type: "schema_validation_failed",
        validation_errors: [errMsg],
        parsed_response: parsed,
        raw_response: responseText,
      };
      attemptHistory.push({
        attempt_number: attempt,
        outcome: "schema_validation_failed",
        failure_details: errMsg,
        duration_ms: Date.now() - attemptStart,
        input_tokens: attemptInputTokens,
        output_tokens: attemptOutputTokens,
      });
      if (attempt === maxAttempts) break;
      conversation.push({ role: "assistant", content: responseText });
      conversation.push({
        role: "user",
        content: buildSchemaRetryUserTurn([errMsg]),
      });
      continue;
    }

    // Success — build final result.
    attemptHistory.push({
      attempt_number: attempt,
      outcome: "success",
      failure_details: null,
      duration_ms: Date.now() - attemptStart,
      input_tokens: attemptInputTokens,
      output_tokens: attemptOutputTokens,
    });

    const flags = {
      ...validation.data._stage_flags,
      // Preserve any volatile-rates-stale entry from the harness check; LLM
      // may also emit (defensively merge).
      volatile_rates_stale: staleness
        ? [
            {
              batch_index: batchContext.batch_index,
              last_refreshed: staleness.last_refreshed,
              days_since_refresh: staleness.days_since_refresh,
            },
            ...validation.data._stage_flags.volatile_rates_stale,
          ]
        : validation.data._stage_flags.volatile_rates_stale,
    };

    const metadata: Stage3a1Metadata = {
      stage_version: STAGE_VERSION,
      model_used: MODEL,
      input_token_count: totalInputTokens,
      output_token_count: totalOutputTokens,
      cache_creation_input_tokens: totalCacheCreation,
      cache_read_input_tokens: totalCacheRead,
      attempts_made: attempt,
      attempt_history: attemptHistory,
      duration_ms: Date.now() - startTime,
      source_fr_content_hash:
        (clientProfile._metadata?.source_fr_content_hash as string) ?? "",
      parsed_at: new Date().toISOString(),
      batch_index: batchContext.batch_index,
      total_batches: batchContext.total_batches,
    };

    return {
      batch_index: validation.data.batch_index,
      total_batches: validation.data.total_batches,
      recommendations:
        validation.data.recommendations as unknown as Stage3a1Result["recommendations"],
      _stage_flags: flags,
      _metadata: metadata,
    };
  }

  // All attempts exhausted with retryable failures.
  const partial = partialMetadata(
    maxAttempts,
    totalInputTokens,
    totalOutputTokens,
    totalCacheCreation,
    totalCacheRead,
  );
  if (lastRetryFailure) {
    if (maxAttempts > 1) {
      const baseContext: Stage3a1ResultFailed["_failure_context"] = {
        batch_index: batchContext.batch_index,
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
    if (lastRetryFailure.type === "json_parse_failed") {
      return makeFailure(
        "json_parse_failed",
        "Model response was not valid JSON.",
        {
          batch_index: batchContext.batch_index,
          parse_error: lastRetryFailure.parse_error,
          raw_response: lastRetryFailure.raw_response,
          attempts_made: maxAttempts,
        },
        partial,
      );
    }
    return makeFailure(
      "schema_validation_failed",
      "Model response did not match the Stage3a1Result schema.",
      {
        batch_index: batchContext.batch_index,
        validation_errors: lastRetryFailure.validation_errors,
        parsed_response: lastRetryFailure.parsed_response,
        raw_response: lastRetryFailure.raw_response,
        attempts_made: maxAttempts,
      },
      partial,
    );
  }

  // Defensive fallback.
  return makeFailure(
    "max_retries_exceeded",
    "quantifyBatch retry loop exited without recording a failure — unreachable in normal flow.",
    { batch_index: batchContext.batch_index, attempts_made: maxAttempts },
    partial,
  );
}

// Re-export emptyFlags for use by Stage 3a.2 when constructing fallback flag bags.
export { emptyFlags };
