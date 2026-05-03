// Phase 3.1c recovery — Call 2: Stage 3a full-pipeline live test on Holloway.
//
// This script replaces the prior orchestrator-driven version with an explicit
// quantifyBatch + validateAndMerge flow so that EACH BATCH's result is written
// to disk the moment it resolves. If a later batch fails or the budget guard
// fires, every successful batch's data is already persisted — no diagnostic
// loss. This pattern is non-negotiable: the prior $33.50 burn taught us
// artifact preservation is more valuable than orchestration cleanliness.
//
// Layout:
//   - artifacts/stage3a_full_pipeline_test_v2_partial_b{N}.json — per-batch
//     Stage3a1Result | Stage3a1ResultFailed, written as soon as that batch
//     resolves (parallel-race semantics).
//   - artifacts/stage3a_full_pipeline_test_v2.json — final consolidated
//     QuantifiedRecommendations envelope after Stage 3a.2 merge.
//
// Default batchSize=8 (the post-Call-1 conservative ceiling): 81 recs →
// 11 batches of [8,8,8,8,8,8,8,8,8,8,1]. Hard budget cap: $35.

import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import {
  quantifyBatch,
  OPUS_4_7_INPUT_CENTS_PER_M,
  OPUS_4_7_OUTPUT_CENTS_PER_M,
  OPUS_4_7_CACHE_WRITE_CENTS_PER_M,
  OPUS_4_7_CACHE_READ_CENTS_PER_M,
  type Stage3a1ApiClient,
} from "../src/lib/orchestrator/stages/stage3a1BatchQuantifier";
import { validateAndMerge } from "../src/lib/orchestrator/stages/stage3a2CrossRecValidator";
import {
  isStage3a1ResultFailed,
  type BatchContext,
  type Stage3a1Result,
  type Stage3a1ResultFailed,
} from "../src/lib/orchestrator/schemas/stage3a1.types";
import type {
  QuantifiedRecommendations,
  Stage3aMetadata,
  Stage3aPerBatchMetadata,
  SequencedRecommendation,
} from "../src/lib/orchestrator/schemas/pipelineTypes";
import type { ClientProfile } from "../src/lib/orchestrator/schemas/clientProfile";
import type {
  SelectedRecommendation,
  SelectedRecommendations,
} from "../src/lib/orchestrator/schemas/selectedRecommendations";

const HARD_BUDGET_CAP_CENTS = 3500; // $35
const BATCH_SIZE = 8;
const MAX_TOKENS = 32000; // mirrors stage3a1BatchQuantifier.ts MAX_TOKENS
const STAGE_VERSION = "3a-orchestration-1.0.0";
const MODEL = "claude-opus-4-7";

// Wraps a real Anthropic client with batch-progress logging. The script
// fires all batches in parallel; this wrapper gives "stream open" / "stream
// resolved" signals tagged with batch_index + cumulative counter so the user
// sees liveness while waiting 8-15 minutes.
function makeLoggingClient(real: Stage3a1ApiClient): Stage3a1ApiClient {
  let callsOpened = 0;
  let callsResolved = 0;
  return {
    messages: {
      stream: (params) => {
        const id = ++callsOpened;
        const t0 = Date.now();
        const userMsg = params.messages[0];
        const content =
          typeof userMsg.content === "string"
            ? userMsg.content
            : JSON.stringify(userMsg.content);
        const m = content.match(/"batch_index":\s*(\d+)/);
        const batchIndex = m ? parseInt(m[1], 10) : -1;
        console.log(`  [stream #${id}, batch ${batchIndex}] opened`);
        const stream = real.messages.stream(params);
        return {
          finalMessage: async () => {
            const msg = await stream.finalMessage();
            const dt = Date.now() - t0;
            const ai = msg.usage?.input_tokens ?? 0;
            const ao = msg.usage?.output_tokens ?? 0;
            callsResolved += 1;
            console.log(
              `  [stream #${id}, batch ${batchIndex}] resolved ${dt}ms, in=${ai}, out=${ao} (${callsResolved}/${callsOpened})`,
            );
            return msg;
          },
        };
      },
    },
  };
}

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
  const millicentsPerToken = (centsPerM: number) => centsPerM / 1000;
  const cost =
    inputTokens * millicentsPerToken(OPUS_4_7_INPUT_CENTS_PER_M) +
    outputTokens * millicentsPerToken(OPUS_4_7_OUTPUT_CENTS_PER_M) +
    cacheCreation * millicentsPerToken(OPUS_4_7_CACHE_WRITE_CENTS_PER_M) +
    cacheRead * millicentsPerToken(OPUS_4_7_CACHE_READ_CENTS_PER_M);
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
    source_selected_recommendations_hash: null,
    parsed_at: new Date().toISOString(),
  };
}

async function main() {
  // 1. Env check
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ERROR: ANTHROPIC_API_KEY not set after dotenv load.");
    process.exit(1);
  }
  console.log(
    `✓ ANTHROPIC_API_KEY loaded (length: ${process.env.ANTHROPIC_API_KEY.length})\n`,
  );

  // 2. Load fixtures
  const clientProfile = JSON.parse(
    await readFile("artifacts/holloway_clientprofile.json", "utf8"),
  ) as ClientProfile;
  const selected = JSON.parse(
    await readFile("artifacts/holloway_selected_recommendations.json", "utf8"),
  ) as SelectedRecommendations;
  console.log(`Loaded Holloway: ${selected.selected.length} selected recs`);
  const byCategory = new Map<string, number>();
  for (const r of selected.selected) {
    byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + 1);
  }
  for (const [cat, n] of [...byCategory.entries()].sort()) {
    console.log(`    ${cat}: ${n}`);
  }
  console.log("");

  // 3. Compute batches + contexts (mirrors orchestrator logic)
  const allRecIds = selected.selected.map((r) => r.recommendation_id);
  const batches: SelectedRecommendation[][] = computeBatches(
    selected.selected,
    BATCH_SIZE,
  );
  const batchContexts = buildBatchContexts(
    allRecIds,
    BATCH_SIZE,
    batches.length,
  );
  console.log(
    `Sliced into ${batches.length} batches at batchSize=${BATCH_SIZE}: [${batches.map((b) => b.length).join(",")}]\n`,
  );

  // 4. Real API client wrapped with progress logging
  const realClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const apiClient = makeLoggingClient(realClient);

  // 5. Fire batches in parallel, each writing its own incremental artifact
  // the moment it resolves. Promise.all coordinates the join; per-batch
  // artifact writes happen inside each promise so a failure doesn't cost us
  // the data from earlier-resolved batches.
  console.log("Firing 11 batches in parallel...\n");
  const t0 = Date.now();
  const batchResults: Array<Stage3a1Result | Stage3a1ResultFailed> =
    await Promise.all(
      batches.map(async (batch, i) => {
        const ctx = batchContexts[i];
        const result = await quantifyBatch(clientProfile, batch, ctx, {
          apiClient,
          kbPath: "kb/v1_2",
          referenceDate: new Date(),
          firmPolicyResolutions: [],
          landmineAuthorizations: [],
          maxRetries: 1,
        });
        // Per-batch incremental artifact. Numeric padding so b00..b10 sort
        // lexicographically in the artifacts directory.
        const partialPath = resolve(
          `artifacts/stage3a_full_pipeline_test_v2_partial_b${String(i).padStart(2, "0")}.json`,
        );
        await writeFile(
          partialPath,
          JSON.stringify(
            {
              _partial_metadata: {
                batch_index: i,
                rec_ids: batch.map((r) => r.recommendation_id),
                resolved_at: new Date().toISOString(),
              },
              result,
            },
            null,
            2,
          ) + "\n",
        );
        const status = isStage3a1ResultFailed(result) ? "FAILED" : "OK";
        console.log(`  [batch ${i}] artifact written (${status})`);
        return result;
      }),
    );
  const totalDurationMs = Date.now() - t0;
  console.log(`\nAll batches resolved in ${totalDurationMs}ms`);

  // 6. Stage 3a.2 — deterministic merge / cross-batch validation
  console.log("\nMerging via Stage 3a.2 (validateAndMerge)...");
  const consolidated = validateAndMerge(batchResults, selected);
  const perBatchMetadata = buildPerBatchMetadata(batchResults);
  const sourceFrContentHash =
    (clientProfile._metadata?.source_fr_content_hash as string) ?? "";
  const metadata = buildAggregateMetadata(
    perBatchMetadata,
    totalDurationMs,
    sourceFrContentHash,
  );
  const result: QuantifiedRecommendations = {
    ...consolidated,
    _metadata: metadata,
  };

  // 7. Save final consolidated artifact FIRST. Even if budget is breached,
  // diagnostic data is preserved on disk. Failed runs are the most valuable
  // learning material; we never orphan results to a budget guard again.
  const outputPath = resolve("artifacts/stage3a_full_pipeline_test_v2.json");
  await writeFile(
    outputPath,
    JSON.stringify(
      {
        _test_metadata: {
          ran_at: new Date().toISOString(),
          input_selected_count: selected.selected.length,
          batch_size: BATCH_SIZE,
          total_batches: batches.length,
          wall_clock_ms: totalDurationMs,
          script: "scripts/runStage3aFullLive.ts",
        },
        result,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`Final artifact written to: ${outputPath}\n`);

  // 8. Report (always — diagnostic value applies regardless of cost gate)
  console.log("===== STAGE 3A FULL-PIPELINE LIVE REPORT =====\n");
  if (result._sequencer_status === "FAILED") {
    reportFailure(result, totalDurationMs, outputPath);
  } else {
    reportSuccess(result, totalDurationMs, outputPath, selected.selected.length);
  }

  // 9. Budget guard (LAST). Artifact + report are preserved regardless.
  const costCents = result._metadata?.cost_cents ?? 0;
  if (costCents > HARD_BUDGET_CAP_CENTS) {
    console.error(
      `\n!! BUDGET CAP BREACH: ${costCents}c (~$${(costCents / 100).toFixed(2)}) > $${HARD_BUDGET_CAP_CENTS / 100} cap`,
    );
    console.error(
      `Artifact preserved at ${outputPath}. Investigate cost source before re-running.`,
    );
    process.exit(3);
  }
}

function reportSuccess(
  r: QuantifiedRecommendations,
  totalDurationMs: number,
  outputPath: string,
  inputSelectedCount: number,
) {
  console.log("STATUS: SUCCESS\n");
  const m = r._metadata!;

  // Per-batch breakdown table
  console.log("--- Per-batch breakdown ---");
  console.log(
    "batch | status  | attempts | input  | output (% of cap) | cache_create | duration_ms | cost(c)",
  );
  for (const b of m.per_batch) {
    const pctOfCap = ((b.output_tokens / MAX_TOKENS) * 100).toFixed(1);
    const cost = computeCostCents(
      b.input_tokens,
      b.output_tokens,
      b.cache_creation_input_tokens,
      b.cache_read_input_tokens,
    );
    console.log(
      `  ${String(b.batch_index).padStart(2)}  | ${b.status.padEnd(7)} | ${String(b.attempts_made).padStart(2)}       | ${String(b.input_tokens).padStart(6)} | ${String(b.output_tokens).padStart(6)} (${pctOfCap.padStart(5)}%)    | ${String(b.cache_creation_input_tokens).padStart(12)} | ${String(b.duration_ms).padStart(11)} | ${String(cost).padStart(7)}`,
    );
  }

  // Aggregate totals
  console.log("\n--- Aggregate totals ---");
  console.log(
    `recommendations.length:               ${r.recommendations.length} (input selected: ${inputSelectedCount})`,
  );
  console.log(`total_attempts:                       ${m.total_attempts}`);
  console.log(
    `total_input_tokens:                   ${m.total_input_tokens.toLocaleString()}`,
  );
  console.log(
    `total_output_tokens:                  ${m.total_output_tokens.toLocaleString()}`,
  );
  console.log(
    `total_cache_creation_input_tokens:    ${m.total_cache_creation_input_tokens.toLocaleString()}`,
  );
  console.log(
    `total_cache_read_input_tokens:        ${m.total_cache_read_input_tokens.toLocaleString()}`,
  );
  console.log(
    `cost_cents:                           ${m.cost_cents} (~$${(m.cost_cents / 100).toFixed(2)})`,
  );
  console.log(`total_duration_ms (wall-clock):       ${m.total_duration_ms}`);

  // State distribution
  const stateCounts = { A: 0, B: 0, C: 0, D: 0, unknown: 0 };
  for (const rec of r.recommendations) {
    const qi = rec.quantified_impact;
    if (qi.estimate !== null) stateCounts.A += 1;
    else if (qi.alternative_values.length > 0) stateCounts.C += 1;
    else if (qi.blocked_inputs.length > 0) stateCounts.B += 1;
    else if (qi.reason_no_formula !== null) stateCounts.D += 1;
    else stateCounts.unknown += 1;
  }
  console.log("\n--- Quantification state distribution ---");
  console.log(`State A (computed):           ${stateCounts.A}`);
  console.log(`State B (blocked inputs):     ${stateCounts.B}`);
  console.log(`State C (firm-policy pending):${stateCounts.C}`);
  console.log(`State D (qualitative-only):   ${stateCounts.D}`);
  if (stateCounts.unknown > 0) {
    console.log(`UNKNOWN: ${stateCounts.unknown} ⚠️`);
  }

  // ActionItem totals
  const allAIs = r.recommendations.flatMap((rec) => rec.action_items);
  console.log(`\n--- ActionItems ---`);
  console.log(`Total ActionItems: ${allAIs.length}`);
  console.log(
    `Average per rec:    ${(allAIs.length / r.recommendations.length).toFixed(2)}`,
  );
  const durationCounts: Record<string, number> = {
    point_in_time: 0,
    short_running: 0,
    long_running: 0,
  };
  for (const ai of allAIs) {
    durationCounts[ai.duration_class] =
      (durationCounts[ai.duration_class] ?? 0) + 1;
  }
  console.log(`duration_class breakdown:`);
  for (const [k, v] of Object.entries(durationCounts)) {
    console.log(`  ${k}: ${v}`);
  }

  // Partner involvement
  const partnerYes = allAIs.filter((ai) => ai.partner_required);
  const partnerNo = allAIs.filter((ai) => !ai.partner_required);
  console.log(
    `\nPartner required: ${partnerYes.length} | not required: ${partnerNo.length}`,
  );
  if (partnerYes.length > 0) {
    const partnerTypeCounts = new Map<string, number>();
    for (const ai of partnerYes) {
      const pt = ai.partner_type ?? "<null>";
      partnerTypeCounts.set(pt, (partnerTypeCounts.get(pt) ?? 0) + 1);
    }
    console.log(`partner_type distribution:`);
    for (const [k, v] of [...partnerTypeCounts.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${k}: ${v}`);
    }
  }

  // Long-running cadences + reminder template biconditional
  const longRunning = allAIs.filter((ai) => ai.duration_class === "long_running");
  console.log(`\n--- Long-running ActionItems ---`);
  console.log(`count: ${longRunning.length}`);
  if (longRunning.length > 0) {
    const cadenceCounts = new Map<string, number>();
    for (const ai of longRunning) {
      const c = ai.check_in_cadence ?? "<null>";
      cadenceCounts.set(c, (cadenceCounts.get(c) ?? 0) + 1);
    }
    console.log(`check_in_cadence distribution:`);
    for (const [k, v] of [...cadenceCounts.entries()].sort()) {
      console.log(`  ${k}: ${v}`);
    }
    const withTemplate = longRunning.filter(
      (ai) => ai.auto_generated_reminder_template !== null,
    );
    const biconditional = withTemplate.length === longRunning.length;
    console.log(
      `auto_generated_reminder_template: ${withTemplate.length} of ${longRunning.length} ${biconditional ? "✓ biconditional invariant holds" : "⚠ biconditional violated"}`,
    );
  }

  // _sequencer_flags consolidated content
  console.log(`\n--- _sequencer_flags (non-empty arrays) ---`);
  const flagBag = r._sequencer_flags as unknown as Record<string, unknown[]>;
  let anyFlag = false;
  for (const [name, arr] of Object.entries(flagBag)) {
    if (Array.isArray(arr) && arr.length > 0) {
      console.log(`  ${name}: ${arr.length} entries`);
      anyFlag = true;
    }
  }
  if (!anyFlag) console.log("(all empty — clean run)");

  // Cross-batch validation surface
  console.log(`\n--- Cross-batch validation (Stage 3a.2 outputs) ---`);
  console.log(
    `orphan_action_item_dependencies:  ${r._sequencer_flags.orphan_action_item_dependencies.length}`,
  );
  console.log(
    `orphan_sequencing_references:     ${r._sequencer_flags.orphan_sequencing_references.length}`,
  );
  console.log(
    `batch_failures_summary:           ${r._sequencer_flags.batch_failures_summary.length}`,
  );
  console.log(
    `coverage_gaps:                    ${r._sequencer_flags.coverage_gaps.length}`,
  );
  if (r._sequencer_flags.batch_failures_summary.length > 0) {
    console.log(`\nbatch_failures_summary:`);
    for (const f of r._sequencer_flags.batch_failures_summary) {
      console.log(
        `  batch ${f.batch_index}: ${f.failure_type} — ${f.failure_reason}`,
      );
    }
  }
  if (r._sequencer_flags.coverage_gaps.length > 0) {
    console.log(`\ncoverage_gaps (rec_ids missing from output):`);
    for (const id of r._sequencer_flags.coverage_gaps) console.log(`  ${id}`);
  }

  // Per-rec compact summary
  console.log(
    `\n--- Per-rec compact summary (all ${r.recommendations.length} recs) ---`,
  );
  for (const rec of r.recommendations) {
    const qi = rec.quantified_impact;
    const state =
      qi.estimate !== null
        ? "A"
        : qi.alternative_values.length > 0
          ? "C"
          : qi.blocked_inputs.length > 0
            ? "B"
            : qi.reason_no_formula !== null
              ? "D"
              : "?";
    console.log(
      `  ${rec.recommendation_id} | ${rec.category.padEnd(22)} | state=${state} | ai=${rec.action_items.length} | landmine=${rec.landmine}`,
    );
  }

  // Spot-check 3 recs from different batches showing different states
  console.log(`\n--- Spot-check: full SequencedRecommendation entries (3 picks) ---`);
  const stateA = r.recommendations.find(
    (rec) => rec.quantified_impact.estimate !== null,
  );
  const stateBorC = r.recommendations.find(
    (rec) =>
      rec.quantified_impact.blocked_inputs.length > 0 ||
      rec.quantified_impact.alternative_values.length > 0,
  );
  const stateD = r.recommendations.find(
    (rec) =>
      rec.quantified_impact.estimate === null &&
      rec.quantified_impact.reason_no_formula !== null,
  );
  const picked: SequencedRecommendation[] = [];
  if (stateA) picked.push(stateA);
  if (stateBorC && !picked.includes(stateBorC)) picked.push(stateBorC);
  if (stateD && !picked.includes(stateD)) picked.push(stateD);
  while (picked.length < 3 && picked.length < r.recommendations.length) {
    const next = r.recommendations.find((rec) => !picked.includes(rec));
    if (next) picked.push(next);
    else break;
  }
  for (const rec of picked) {
    const state =
      rec.quantified_impact.estimate !== null
        ? "A"
        : rec.quantified_impact.alternative_values.length > 0
          ? "C"
          : rec.quantified_impact.blocked_inputs.length > 0
            ? "B"
            : rec.quantified_impact.reason_no_formula !== null
              ? "D"
              : "?";
    console.log(`\n--- ${rec.recommendation_id} (state ${state}) ---`);
    console.log(JSON.stringify(rec, null, 2));
  }

  // Diagnostic verdict on batch_size=8 ceiling utilization
  console.log(`\n===== DIAGNOSTIC VERDICT: batch_size=${BATCH_SIZE} =====`);
  const utils = m.per_batch.map((b) => ({
    idx: b.batch_index,
    pct: (b.output_tokens / MAX_TOKENS) * 100,
    out: b.output_tokens,
  }));
  const maxUtil = utils.reduce((a, b) => (a.pct > b.pct ? a : b));
  const minUtil = utils.reduce((a, b) => (a.pct < b.pct ? a : b));
  const truncated = utils.filter((u) => u.out >= MAX_TOKENS);
  const above80 = utils.filter((u) => u.pct >= 80);
  console.log(
    `max output utilization: ${maxUtil.pct.toFixed(1)}% (batch ${maxUtil.idx}, ${maxUtil.out} tokens)`,
  );
  console.log(
    `min output utilization: ${minUtil.pct.toFixed(1)}% (batch ${minUtil.idx}, ${minUtil.out} tokens)`,
  );
  console.log(
    `truncations (>= 32K):    ${truncated.length} ${truncated.length > 0 ? "⚠️" : "✓"}`,
  );
  console.log(
    `above-80%-utilization:   ${above80.length} ${above80.length > 0 ? "⚠️" : "✓"}`,
  );

  console.log("\nVerdict:");
  if (truncated.length > 0) {
    console.log(
      `  ❌ Truncations occurred. batch_size=${BATCH_SIZE} is still too large for some category mixes.`,
    );
    console.log(`  Suggest: lower default further (try 6 or 5).`);
    console.log(
      `  Truncated batches: ${truncated.map((u) => `b${u.idx}`).join(", ")}`,
    );
  } else if (above80.length > 0) {
    console.log(
      `  ⚠️  ${above80.length} batch(es) above 80% of cap — workable, but no margin for outlier categories.`,
    );
    console.log(
      `  Above-80% batches: ${above80.map((u) => `b${u.idx} (${u.pct.toFixed(1)}%)`).join(", ")}`,
    );
    console.log(`  Suggest: keep batch_size=${BATCH_SIZE} default, watch for category-density drift.`);
  } else if (maxUtil.pct < 60) {
    console.log(
      `  ✓ All batches under 60% of cap. batch_size=${BATCH_SIZE} may be over-conservative.`,
    );
    console.log(`  Suggest: consider raising default to 10 to reduce batch count + cost.`);
  } else {
    console.log(
      `  ✓ All batches between 60-80% of cap. batch_size=${BATCH_SIZE} is well-tuned.`,
    );
    console.log(`  Suggest: keep batch_size=${BATCH_SIZE} default.`);
  }

  console.log(`\nResult artifact: ${outputPath}`);
}

function reportFailure(
  r: QuantifiedRecommendations,
  totalDurationMs: number,
  outputPath: string,
) {
  console.log("STATUS: FAILED\n");
  console.log(
    `_sequencer_failures: ${(r._sequencer_failures ?? []).length} entries`,
  );
  for (const f of r._sequencer_failures ?? []) {
    console.log(
      `  stage=${f.stage} rec=${f.rec_id ?? "<none>"} reason=${f.reason}`,
    );
    console.log(`    context: ${f.context.slice(0, 300)}`);
  }
  console.log(
    `\nbatch_failures_summary: ${r._sequencer_flags.batch_failures_summary.length}`,
  );
  for (const f of r._sequencer_flags.batch_failures_summary) {
    console.log(
      `  batch ${f.batch_index}: ${f.failure_type} — ${f.failure_reason}`,
    );
  }
  console.log(
    `\ncoverage_gaps (${r._sequencer_flags.coverage_gaps.length}):`,
  );
  for (const id of r._sequencer_flags.coverage_gaps.slice(0, 30))
    console.log(`  ${id}`);

  if (r._metadata) {
    console.log(`\n--- Cost spent ---`);
    console.log(
      `cost_cents: ${r._metadata.cost_cents} (~$${(r._metadata.cost_cents / 100).toFixed(2)})`,
    );
    console.log(
      `total_input_tokens: ${r._metadata.total_input_tokens.toLocaleString()}`,
    );
    console.log(
      `total_output_tokens: ${r._metadata.total_output_tokens.toLocaleString()}`,
    );
    console.log(`total_attempts: ${r._metadata.total_attempts}`);

    console.log(`\n--- Per-batch breakdown ---`);
    console.log(
      "batch | status  | attempts | input  | output (% of cap) | duration_ms | failure_type",
    );
    for (const b of r._metadata.per_batch) {
      const pctOfCap = ((b.output_tokens / MAX_TOKENS) * 100).toFixed(1);
      console.log(
        `  ${String(b.batch_index).padStart(2)}  | ${b.status.padEnd(7)} | ${String(b.attempts_made).padStart(2)}       | ${String(b.input_tokens).padStart(6)} | ${String(b.output_tokens).padStart(6)} (${pctOfCap.padStart(5)}%)    | ${String(b.duration_ms).padStart(11)} | ${b.failure_type ?? "—"}`,
      );
    }
  }
  console.log(`\nwall_clock_ms: ${totalDurationMs}`);
  console.log(`Result artifact (with full diagnostic): ${outputPath}`);
}

main().catch((err) => {
  console.error("UNCAUGHT ERROR:", err);
  process.exit(2);
});
