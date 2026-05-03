// Stage 3a — Orchestration / Harness.
//
// Chains Stage 3a.1 (LLM batch quantifier, runs once per batch) → Stage 3a.2
// (deterministic merger/validator) into a single logical Stage 3a invocation.
// Computes batch boundaries, invokes batches in parallel by default, merges
// per-batch metadata into a single Stage3aMetadata block, and emits the final
// QuantifiedRecommendations envelope.

import { quantifyBatch } from "./stage3a1BatchQuantifier";
import {
  OPUS_4_7_INPUT_CENTS_PER_M,
  OPUS_4_7_OUTPUT_CENTS_PER_M,
  OPUS_4_7_CACHE_WRITE_CENTS_PER_M,
  OPUS_4_7_CACHE_READ_CENTS_PER_M,
  type Stage3a1ApiClient,
  type Stage3a1Options,
  type FirmPolicyResolution,
  type LandmineAuthorization,
} from "./stage3a1BatchQuantifier";
import { validateAndMerge } from "./stage3a2CrossRecValidator";
import type {
  BatchContext,
  Stage3a1Result,
  Stage3a1ResultFailed,
} from "../schemas/stage3a1.types";
import { isStage3a1ResultFailed } from "../schemas/stage3a1.types";
import type {
  QuantifiedRecommendations,
  Stage3aMetadata,
  Stage3aPerBatchMetadata,
} from "../schemas/pipelineTypes";
import type { ClientProfile } from "../schemas/clientProfile";
import type { SelectedRecommendations } from "../schemas/selectedRecommendations";

const STAGE_VERSION = "3a-orchestration-1.0.0";
const MODEL = "claude-opus-4-7";
// Empirical cross-category per-rec output ≈ 2,434 tokens (Holloway non-Estate
// 12-rec sample, commit pending). 8 recs × 2,434 ≈ 19,472 output tokens,
// leaving 12,528 token headroom under the 32K MAX_TOKENS cap. Prior 12-rec
// setting hit 91% of the cap on the same sample (output 29,206; only ~2,800
// headroom). The 20-rec default before that truncated every Holloway batch
// at 32K and burned $33.50 on doomed retries. 8 protects against high-density
// outliers like REC-ENT-002 (11 ActionItems alone ≈ 16% of a batch's output)
// while keeping batch count tractable for typical 60–100-rec engagements.
const DEFAULT_BATCH_SIZE = 8;

// ────────────────────────────────────────────────────────────────────────
// Options
// ────────────────────────────────────────────────────────────────────────

export interface Stage3aOrchestrationOptions {
  apiClient: Stage3a1ApiClient;
  kbPath?: string;
  referenceDate?: Date;
  firmPolicyResolutions?: FirmPolicyResolution[];
  landmineAuthorizations?: LandmineAuthorization[];
  maxRetriesPerBatch?: number;
  batchSize?: number;
  parallelism?: "serial" | "parallel";
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function computeBatches<T>(items: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}

function buildBatchContexts(
  allRecIds: string[],
  batchSize: number,
  totalBatches: number,
): BatchContext[] {
  const contexts: BatchContext[] = [];
  for (let i = 0; i < totalBatches; i += 1) {
    const startIndex = i * batchSize;
    const endIndex = Math.min(startIndex + batchSize, allRecIds.length);
    contexts.push({
      batch_index: i,
      total_batches: totalBatches,
      preceding_batch_rec_ids: allRecIds.slice(0, startIndex),
      following_batch_rec_ids: allRecIds.slice(endIndex),
    });
  }
  return contexts;
}

function computeCostCents(
  inputTokens: number,
  outputTokens: number,
  cacheCreation: number,
  cacheRead: number,
): number {
  // Costs in millicents to preserve precision; converted back to cents.
  const millicentsPerToken = (centsPerM: number) => centsPerM / 1000;
  const cost =
    inputTokens * millicentsPerToken(OPUS_4_7_INPUT_CENTS_PER_M) +
    outputTokens * millicentsPerToken(OPUS_4_7_OUTPUT_CENTS_PER_M) +
    cacheCreation * millicentsPerToken(OPUS_4_7_CACHE_WRITE_CENTS_PER_M) +
    cacheRead * millicentsPerToken(OPUS_4_7_CACHE_READ_CENTS_PER_M);
  // Round to nearest cent.
  return Math.round(cost / 1000);
}

function buildPerBatchMetadata(
  batchResults: Array<Stage3a1Result | Stage3a1ResultFailed>,
): Stage3aPerBatchMetadata[] {
  return batchResults
    .map((r): Stage3aPerBatchMetadata => {
      if (isStage3a1ResultFailed(r)) {
        const m = r._metadata;
        return {
          batch_index: r._failure_context.batch_index,
          status: "failed",
          failure_type: r._failure_type,
          attempts_made: m.attempts_made ?? 0,
          input_tokens: m.input_token_count ?? 0,
          output_tokens: m.output_token_count ?? 0,
          cache_creation_input_tokens: m.cache_creation_input_tokens ?? 0,
          cache_read_input_tokens: m.cache_read_input_tokens ?? 0,
          duration_ms: m.duration_ms ?? 0,
        };
      }
      const m = r._metadata;
      return {
        batch_index: r.batch_index,
        status: "success",
        failure_type: null,
        attempts_made: m.attempts_made,
        input_tokens: m.input_token_count,
        output_tokens: m.output_token_count,
        cache_creation_input_tokens: m.cache_creation_input_tokens,
        cache_read_input_tokens: m.cache_read_input_tokens,
        duration_ms: m.duration_ms,
      };
    })
    .sort((a, b) => a.batch_index - b.batch_index);
}

function buildAggregateMetadata(
  perBatch: Stage3aPerBatchMetadata[],
  totalDurationMs: number,
  sourceFrContentHash: string,
  sourceSelectedRecsHash: string | null,
): Stage3aMetadata {
  const totals = perBatch.reduce(
    (acc, b) => {
      acc.input += b.input_tokens;
      acc.output += b.output_tokens;
      acc.cacheCreation += b.cache_creation_input_tokens;
      acc.cacheRead += b.cache_read_input_tokens;
      acc.attempts += b.attempts_made;
      return acc;
    },
    { input: 0, output: 0, cacheCreation: 0, cacheRead: 0, attempts: 0 },
  );

  return {
    stage_version: STAGE_VERSION,
    model_used: MODEL,
    total_input_tokens: totals.input,
    total_output_tokens: totals.output,
    total_cache_creation_input_tokens: totals.cacheCreation,
    total_cache_read_input_tokens: totals.cacheRead,
    total_attempts: totals.attempts,
    cost_cents: computeCostCents(
      totals.input,
      totals.output,
      totals.cacheCreation,
      totals.cacheRead,
    ),
    total_duration_ms: totalDurationMs,
    per_batch: perBatch,
    source_fr_content_hash: sourceFrContentHash,
    source_selected_recommendations_hash: sourceSelectedRecsHash,
    parsed_at: new Date().toISOString(),
  };
}

// ────────────────────────────────────────────────────────────────────────
// Main entry
// ────────────────────────────────────────────────────────────────────────

export async function runStage3a(
  clientProfile: ClientProfile,
  selectedRecommendations: SelectedRecommendations,
  options: Stage3aOrchestrationOptions,
): Promise<QuantifiedRecommendations> {
  const startTime = Date.now();
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const parallelism = options.parallelism ?? "parallel";
  const allRecIds = selectedRecommendations.selected.map(
    (r) => r.recommendation_id,
  );

  // Step 1 — Compute batch boundaries
  const batches = computeBatches(selectedRecommendations.selected, batchSize);
  const batchContexts = buildBatchContexts(allRecIds, batchSize, batches.length);

  const perBatchOptions: Stage3a1Options = {
    apiClient: options.apiClient,
    kbPath: options.kbPath,
    referenceDate: options.referenceDate,
    firmPolicyResolutions: options.firmPolicyResolutions,
    landmineAuthorizations: options.landmineAuthorizations,
    maxRetries: options.maxRetriesPerBatch,
  };

  // Step 2/3 — Invoke Stage 3a.1 per batch
  let batchResults: Array<Stage3a1Result | Stage3a1ResultFailed>;
  if (parallelism === "parallel") {
    batchResults = await Promise.all(
      batches.map((batch, i) =>
        quantifyBatch(clientProfile, batch, batchContexts[i], perBatchOptions),
      ),
    );
  } else {
    batchResults = [];
    for (let i = 0; i < batches.length; i += 1) {
      batchResults.push(
        await quantifyBatch(
          clientProfile,
          batches[i],
          batchContexts[i],
          perBatchOptions,
        ),
      );
    }
  }

  // Step 4 — Merge via Stage 3a.2
  const consolidated = validateAndMerge(batchResults, selectedRecommendations);

  // Step 5 — Build aggregate metadata
  const perBatchMetadata = buildPerBatchMetadata(batchResults);
  const totalDurationMs = Date.now() - startTime;
  const sourceFrContentHash =
    (clientProfile._metadata?.source_fr_content_hash as string) ?? "";
  const sourceSelectedRecsHash = null; // Stage 2's metadata doesn't currently expose a stable hash field; placeholder.

  const metadata = buildAggregateMetadata(
    perBatchMetadata,
    totalDurationMs,
    sourceFrContentHash,
    sourceSelectedRecsHash,
  );

  return {
    ...consolidated,
    _metadata: metadata,
  };
}
