// Phase 3.1c recovery — Call 1: Stage 3a.1 single-batch ceiling validation.
//
// Validates the post-fix configuration on a NON-Estate batch:
//   - batchSize=12 (the new orchestrator default; fits comfortably under
//     the 32K MAX_TOKENS output ceiling)
//   - Cross-category coverage: 1 rec from each of the 9 non-Estate
//     categories, plus 3 doubles to hit 12 total. Estate is already validated
//     (commit ae431d8); this run probes Tax, Entity Structure, Risk &
//     Insurance, Retirement, Investment, Succession & Continuity, Family,
//     Charitable, Specialty.
//   - maxRetries: 1 (safety net retry).
//   - Hard budget cap: $4 — single batch, expected ~$2.5–$3 first attempt,
//     plus retry only if needed. Truncation-abort guard short-circuits
//     wasted retries.
//
// Selection logic intentionally diverges from "first 12 non-Estate" because
// the Holloway fixture's natural order would have given only Entity Structure
// + Tax (the literal instruction's stated goal of cross-category coverage
// would have failed). One-per-category-plus-extras achieves what was
// described.
//
// Artifact write happens BEFORE budget evaluation. Diagnostic data is
// preserved on disk regardless of cost — failed runs are the most valuable
// learning material; we never orphan results to a budget guard again.

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
} from "../src/lib/orchestrator/stages/stage3a1BatchQuantifier";
import {
  isStage3a1ResultFailed,
  type BatchContext,
  type Stage3a1Result,
  type Stage3a1ResultFailed,
} from "../src/lib/orchestrator/schemas/stage3a1.types";
import type { ClientProfile } from "../src/lib/orchestrator/schemas/clientProfile";
import type {
  SelectedRecommendation,
  SelectedRecommendations,
} from "../src/lib/orchestrator/schemas/selectedRecommendations";

const HARD_BUDGET_CAP_CENTS = 400; // $4

// Pick 12 cross-category non-Estate recs:
// - One from each of the 9 non-Estate categories.
// - Then pad to 12 with the second rec from the three lowest-id categories.
function pickCrossCategoryBatch(
  selected: SelectedRecommendation[],
): SelectedRecommendation[] {
  const nonEstate = selected.filter((r) => r.category !== "Estate");
  const byCategory = new Map<string, SelectedRecommendation[]>();
  for (const r of nonEstate) {
    if (!byCategory.has(r.category)) byCategory.set(r.category, []);
    byCategory.get(r.category)!.push(r);
  }
  // First pick: one per category.
  const firstPicks = [...byCategory.values()].map((arr) => arr[0]);
  // Second picks: take a second from categories with ≥2, sort by rec_id for
  // determinism, then take the first three.
  const secondPicks = [...byCategory.values()]
    .filter((arr) => arr.length > 1)
    .map((arr) => arr[1])
    .sort((a, b) => a.recommendation_id.localeCompare(b.recommendation_id))
    .slice(0, 3);
  return [...firstPicks, ...secondPicks].slice(0, 12);
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

  // 3. Pick cross-category batch
  const batch = pickCrossCategoryBatch(selected.selected);
  console.log(`Picked ${batch.length} cross-category recs:`);
  for (const r of batch) {
    console.log(`  ${r.recommendation_id} | ${r.category}`);
  }
  console.log("");
  if (batch.length !== 12) {
    console.error(
      `ERROR: expected 12 recs in batch, got ${batch.length}. Aborting before API call.`,
    );
    process.exit(1);
  }

  // 4. Single-batch context (batch_index 0 of 1)
  const batchContext: BatchContext = {
    batch_index: 0,
    total_batches: 1,
    preceding_batch_rec_ids: [],
    following_batch_rec_ids: [],
  };

  // 5. Real Anthropic client + options
  const apiClient = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  console.log("Firing Stage 3a.1 quantifyBatch (real API)...\n");
  const t0 = Date.now();
  const result = await quantifyBatch(clientProfile, batch, batchContext, {
    apiClient,
    kbPath: "kb/v1_2",
    referenceDate: new Date(),
    firmPolicyResolutions: [],
    landmineAuthorizations: [],
    maxRetries: 1,
  });
  const wallClockMs = Date.now() - t0;

  // 6. Save artifact FIRST (before budget evaluation). Diagnostic data is
  // preserved on disk no matter what — failed runs and budget overruns
  // both contain learning material we don't want to discard.
  const outputPath = resolve("artifacts/stage3a1_ceiling_validation_v1.json");
  const outputPayload = {
    _test_metadata: {
      ran_at: new Date().toISOString(),
      input_batch_rec_ids: batch.map((r) => r.recommendation_id),
      input_batch_categories: [...new Set(batch.map((r) => r.category))].sort(),
      wall_clock_ms: wallClockMs,
      script: "scripts/runStage3a1CeilingValidation.ts",
    },
    result,
  };
  await writeFile(outputPath, JSON.stringify(outputPayload, null, 2) + "\n");
  console.log(`Result written to: ${outputPath}\n`);

  // 7. Report (always, regardless of budget outcome).
  console.log("===== STAGE 3A.1 CEILING VALIDATION REPORT =====\n");
  if (isStage3a1ResultFailed(result)) {
    reportFailure(result, wallClockMs);
  } else {
    reportSuccess(result, wallClockMs, outputPath);
  }

  // 8. Budget guard (after artifact + report).
  const m = result._metadata;
  const inTokens = m.input_token_count ?? 0;
  const outTokens = m.output_token_count ?? 0;
  const cacheCreate = m.cache_creation_input_tokens ?? 0;
  const cacheRead = m.cache_read_input_tokens ?? 0;
  const costCents = computeCostCents(inTokens, outTokens, cacheCreate, cacheRead);
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
  r: Stage3a1Result,
  wallClockMs: number,
  outputPath: string,
) {
  console.log("STATUS: SUCCESS\n");

  console.log("--- Envelope ---");
  console.log(`batch_index: ${r.batch_index}`);
  console.log(`total_batches: ${r.total_batches}`);
  console.log(`recommendations.length: ${r.recommendations.length}`);

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
  console.log(`State A: ${stateCounts.A}`);
  console.log(`State B: ${stateCounts.B}`);
  console.log(`State C: ${stateCounts.C}`);
  console.log(`State D: ${stateCounts.D}`);
  if (stateCounts.unknown > 0) {
    console.log(`UNKNOWN: ${stateCounts.unknown} ⚠️`);
  }

  // Per-rec compact summary (rec_id | category | state | qual? | ai count)
  console.log("\n--- Per-rec summary ---");
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
      `  ${rec.recommendation_id} | ${rec.category.padEnd(22)} | state=${state} | ai=${rec.action_items.length}`,
    );
  }

  // ActionItem totals
  const allAIs = r.recommendations.flatMap((rec) => rec.action_items);
  console.log(`\n--- ActionItems ---`);
  console.log(`Total ActionItems: ${allAIs.length}`);
  const durationCounts: Record<string, number> = {
    point_in_time: 0,
    short_running: 0,
    long_running: 0,
  };
  for (const ai of allAIs) {
    durationCounts[ai.duration_class] =
      (durationCounts[ai.duration_class] ?? 0) + 1;
  }
  for (const [k, v] of Object.entries(durationCounts)) {
    console.log(`  ${k}: ${v}`);
  }

  // _stage_flags content
  console.log(`\n--- _stage_flags (non-empty arrays) ---`);
  const flagBag = r._stage_flags as unknown as Record<string, unknown[]>;
  let anyFlag = false;
  for (const [name, arr] of Object.entries(flagBag)) {
    if (Array.isArray(arr) && arr.length > 0) {
      console.log(`  ${name}: ${arr.length} entries`);
      anyFlag = true;
    }
  }
  if (!anyFlag) console.log("(all empty — clean run)");

  // Token / cost
  const m = r._metadata;
  const cost = computeCostCents(
    m.input_token_count,
    m.output_token_count,
    m.cache_creation_input_tokens,
    m.cache_read_input_tokens,
  );
  console.log(`\n--- Token usage ---`);
  console.log(`input_tokens:                 ${m.input_token_count.toLocaleString()}`);
  console.log(`output_tokens:                ${m.output_token_count.toLocaleString()}`);
  console.log(`cache_creation_input_tokens:  ${m.cache_creation_input_tokens.toLocaleString()}`);
  console.log(`cache_read_input_tokens:      ${m.cache_read_input_tokens.toLocaleString()}`);
  console.log(`cost estimate:                ${cost}c (~$${(cost / 100).toFixed(2)})`);

  console.log(`\n--- Timing ---`);
  console.log(`attempts_made: ${m.attempts_made}`);
  console.log(`module duration_ms: ${m.duration_ms}`);
  console.log(`wall-clock duration_ms: ${wallClockMs}`);

  // Output-token ceiling check — is the 12-rec batch comfortably below cap?
  const ceilingHeadroom = 32000 - m.output_token_count;
  console.log(`\n--- Ceiling check ---`);
  console.log(`output_tokens / 32000 cap: ${m.output_token_count} / 32000 (headroom: ${ceilingHeadroom})`);
  if (m.output_token_count >= 32000) {
    console.log(`⚠️  TRUNCATED — output hit cap. The truncation-abort guard should have fired.`);
  } else if (ceilingHeadroom < 4000) {
    console.log(`⚠️  TIGHT — under 4K headroom. Consider lowering batchSize further.`);
  } else {
    console.log(`✓ Comfortable headroom (>= 4K).`);
  }

  console.log(`\nResult artifact: ${outputPath}`);
}

function reportFailure(r: Stage3a1ResultFailed, wallClockMs: number) {
  console.log("STATUS: FAILED\n");
  console.log(`failure_type: ${r._failure_type}`);
  console.log(`failure_reason: ${r._failure_reason}`);
  console.log(`\nfailure_context:`);
  console.log(JSON.stringify(r._failure_context, null, 2));

  const m = r._metadata;
  const inTokens = m.input_token_count ?? 0;
  const outTokens = m.output_token_count ?? 0;
  console.log(`\n--- Token usage so far ---`);
  console.log(`input_tokens: ${inTokens}`);
  console.log(`output_tokens: ${outTokens}`);
  console.log(`attempts_made: ${m.attempts_made ?? 0}`);
  console.log(`wall-clock duration_ms: ${wallClockMs}`);

  if (r._failure_type === "context_overflow" && outTokens >= 32000) {
    console.log(
      `\nDiagnosis: output truncation at MAX_TOKENS=32000. The truncation-abort guard correctly aborted retry.`,
    );
    console.log(
      `Action: reduce batchSize for the next call (current default is 12 — consider 8-10).`,
    );
  }
}

main().catch((err) => {
  console.error("UNCAUGHT ERROR:", err);
  process.exit(2);
});
