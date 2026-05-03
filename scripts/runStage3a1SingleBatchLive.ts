// Phase 3.1c Step 2 — Live single-batch RE-TEST for Stage 3a.1.
//
// Same shape as Step 1 (11 Estate recs from Holloway fixture, single batch),
// but exercising the post-Step-1 schema-compression refactor:
//   - 5 always-null/derivable fields stripped from LLM output
//   - max_tokens raised 16K → 32K
//   - maxRetries: 0 (single attempt only — we want to see clean first-attempt
//     behavior before re-enabling retry)
//
// Budget: $3 hard ceiling per script run. Step 1 burned $5.22 on truncation
// retry; the compressed schema + higher max_tokens cap should land in one
// attempt at ~$0.50–$1.00.

import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { quantifyBatch } from "../src/lib/orchestrator/stages/stage3a1BatchQuantifier";
import {
  isStage3a1ResultFailed,
  type BatchContext,
  type Stage3a1Result,
  type Stage3a1ResultFailed,
} from "../src/lib/orchestrator/schemas/stage3a1.types";
import {
  OPUS_4_7_INPUT_CENTS_PER_M,
  OPUS_4_7_OUTPUT_CENTS_PER_M,
  OPUS_4_7_CACHE_WRITE_CENTS_PER_M,
  OPUS_4_7_CACHE_READ_CENTS_PER_M,
} from "../src/lib/orchestrator/stages/stage3a1BatchQuantifier";
import type { ClientProfile } from "../src/lib/orchestrator/schemas/clientProfile";
import type { SelectedRecommendations } from "../src/lib/orchestrator/schemas/selectedRecommendations";

async function main() {
  // 1. Env check
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ERROR: ANTHROPIC_API_KEY not set after dotenv load.");
    process.exit(1);
  }
  console.log(
    `✓ ANTHROPIC_API_KEY loaded (length: ${process.env.ANTHROPIC_API_KEY.length})\n`,
  );

  // 2. Load inputs
  const clientProfileText = await readFile(
    "artifacts/holloway_clientprofile.json",
    "utf8",
  );
  const clientProfile = JSON.parse(clientProfileText) as ClientProfile;

  const selectedText = await readFile(
    "artifacts/holloway_selected_recommendations.json",
    "utf8",
  );
  const selected = JSON.parse(selectedText) as SelectedRecommendations;

  // 3. Filter to Estate batch
  const estateBatch = selected.selected.filter((r) => r.category === "Estate");
  console.log(`Estate batch size: ${estateBatch.length}`);
  console.log(
    `Estate rec_ids: ${estateBatch.map((r) => r.recommendation_id).join(", ")}\n`,
  );
  if (estateBatch.length === 0) {
    console.error("ERROR: no Estate recs found in selectedRecommendations.");
    process.exit(1);
  }

  // 4. BatchContext (single batch in isolation)
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

  console.log("Firing Stage 3a.1 with real Anthropic API call...\n");
  const t0 = Date.now();

  const result = await quantifyBatch(clientProfile, estateBatch, batchContext, {
    apiClient,
    kbPath: "kb/v1_2",
    referenceDate: new Date(),
    firmPolicyResolutions: [],
    landmineAuthorizations: [],
    // Step 2 round 3: maxRetries: 1 — allow one retry. Round 2 (commit bb2d1cc)
    // showed tool-use eliminated structural drift; remaining failures are
    // cross-field rules that zod catches post-validation. With the State A
    // prompt sharpening landed, the corrective user turn from a single retry
    // should converge on the second attempt.
    maxRetries: 1,
  });

  const wallClockMs = Date.now() - t0;

  // 6. Save result — v5 path so we don't overwrite v1/v2/v3/v4 diagnostic records.
  const outputPath = resolve("artifacts/stage3a1_single_batch_test_v5.json");
  const outputPayload = {
    _test_metadata: {
      ran_at: new Date().toISOString(),
      input_batch_rec_ids: estateBatch.map((r) => r.recommendation_id),
      wall_clock_ms: wallClockMs,
      script: "scripts/runStage3a1SingleBatchLive.ts",
    },
    result,
  };
  await writeFile(outputPath, JSON.stringify(outputPayload, null, 2) + "\n");
  console.log(`Result written to: ${outputPath}\n`);

  // 7. Report
  console.log("===== STAGE 3A.1 SINGLE-BATCH LIVE REPORT =====\n");

  if (isStage3a1ResultFailed(result)) {
    reportFailure(result, wallClockMs);
  } else {
    reportSuccess(result, wallClockMs, outputPath);
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

  // Quantification state distribution
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
  console.log(`State A (computed): ${stateCounts.A}`);
  console.log(`State B (blocked inputs): ${stateCounts.B}`);
  console.log(`State C (firm-policy pending): ${stateCounts.C}`);
  console.log(`State D (qualitative-only): ${stateCounts.D}`);
  if (stateCounts.unknown > 0) {
    console.log(`UNKNOWN (no state matches): ${stateCounts.unknown} ⚠️`);
  }

  // Per-rec summary
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
    let estimateStr = "";
    if (qi.estimate !== null) {
      const v = qi.estimate.value;
      estimateStr =
        Array.isArray(v)
          ? ` est=[${v[0].toLocaleString()}–${v[1].toLocaleString()}] ${qi.estimate.unit}`
          : ` est=${v.toLocaleString()} ${qi.estimate.unit}`;
    }
    console.log(
      `  ${rec.recommendation_id} | state=${state} | action_items=${rec.action_items.length}${estimateStr}`,
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
    durationCounts[ai.duration_class] = (durationCounts[ai.duration_class] ?? 0) + 1;
  }
  console.log(`duration_class breakdown:`);
  for (const [k, v] of Object.entries(durationCounts)) {
    console.log(`  ${k}: ${v}`);
  }

  // Partner involvement
  const partnerYes = allAIs.filter((ai) => ai.partner_required);
  const partnerNo = allAIs.filter((ai) => !ai.partner_required);
  console.log(`\nPartner required: ${partnerYes.length} | not required: ${partnerNo.length}`);
  if (partnerYes.length > 0) {
    const partnerTypeCounts = new Map<string, number>();
    for (const ai of partnerYes) {
      const pt = ai.partner_type ?? "<null>";
      partnerTypeCounts.set(pt, (partnerTypeCounts.get(pt) ?? 0) + 1);
    }
    console.log(`partner_type distribution:`);
    for (const [k, v] of [...partnerTypeCounts.entries()].sort()) {
      console.log(`  ${k}: ${v}`);
    }
  }

  // check_in_cadence for long_running
  const longRunning = allAIs.filter((ai) => ai.duration_class === "long_running");
  console.log(`\n--- Long-running ActionItem cadences ---`);
  if (longRunning.length === 0) {
    console.log(`(none)`);
  } else {
    const cadenceCounts = new Map<string, number>();
    for (const ai of longRunning) {
      const c = ai.check_in_cadence ?? "<null>";
      cadenceCounts.set(c, (cadenceCounts.get(c) ?? 0) + 1);
    }
    for (const [k, v] of [...cadenceCounts.entries()].sort()) {
      console.log(`  ${k}: ${v}`);
    }
    const withTemplate = longRunning.filter(
      (ai) => ai.auto_generated_reminder_template !== null,
    );
    console.log(`auto_generated_reminder_template populated: ${withTemplate.length} of ${longRunning.length}`);
    if (withTemplate.length > 0) {
      console.log(`  recs with reminder templates:`);
      const recsWithTemplates = new Set(
        withTemplate.map((ai) => ai.source_recommendation_id),
      );
      for (const id of [...recsWithTemplates].sort()) {
        console.log(`    ${id}`);
      }
    }
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
  if (!anyFlag) console.log(`(all empty — clean run)`);

  // Token / cost
  console.log(`\n--- Token usage ---`);
  console.log(`input_tokens:                 ${r._metadata.input_token_count.toLocaleString()}`);
  console.log(`output_tokens:                ${r._metadata.output_token_count.toLocaleString()}`);
  console.log(`cache_creation_input_tokens:  ${r._metadata.cache_creation_input_tokens.toLocaleString()}`);
  console.log(`cache_read_input_tokens:      ${r._metadata.cache_read_input_tokens.toLocaleString()}`);
  const costMillicents =
    (r._metadata.input_token_count * OPUS_4_7_INPUT_CENTS_PER_M) / 1000 +
    (r._metadata.output_token_count * OPUS_4_7_OUTPUT_CENTS_PER_M) / 1000 +
    (r._metadata.cache_creation_input_tokens * OPUS_4_7_CACHE_WRITE_CENTS_PER_M) / 1000 +
    (r._metadata.cache_read_input_tokens * OPUS_4_7_CACHE_READ_CENTS_PER_M) / 1000;
  const costCents = costMillicents / 1000;
  console.log(`cost estimate:                ${costCents.toFixed(2)} cents ($${(costCents / 100).toFixed(4)})`);

  console.log(`\n--- Timing ---`);
  console.log(`attempts_made: ${r._metadata.attempts_made}`);
  console.log(`module duration_ms: ${r._metadata.duration_ms}`);
  console.log(`wall-clock duration_ms: ${wallClockMs}`);

  // Budget warning — soft check well under the $3 hard ceiling.
  if (costCents > 300) {
    console.log(`\n⚠️  BUDGET WARNING: ${costCents.toFixed(2)} cents exceeds $3.00 soft cap.`);
  }

  // Spot-check: pick first State A and first State D rec (or first 2 if both unavailable)
  const stateA = r.recommendations.find(
    (rec) => rec.quantified_impact.estimate !== null,
  );
  const stateD = r.recommendations.find(
    (rec) => rec.quantified_impact.reason_no_formula !== null,
  );
  const picked: typeof r.recommendations = [];
  if (stateA) picked.push(stateA);
  if (stateD && stateD.recommendation_id !== stateA?.recommendation_id) picked.push(stateD);
  while (picked.length < 2 && picked.length < r.recommendations.length) {
    const next = r.recommendations.find((rec) => !picked.includes(rec));
    if (next) picked.push(next);
    else break;
  }

  console.log(`\n--- Spot-check: full SequencedRecommendation entries ---`);
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

  console.log(`\nResult artifact: ${outputPath}`);
}

function reportFailure(r: Stage3a1ResultFailed, wallClockMs: number) {
  console.log("STATUS: FAILED\n");
  console.log(`failure_type: ${r._failure_type}`);
  console.log(`failure_reason: ${r._failure_reason}`);
  console.log(`\nfailure_context:`);
  console.log(JSON.stringify(r._failure_context, null, 2));
  console.log(`\n--- Token usage so far ---`);
  console.log(`input_tokens: ${r._metadata.input_token_count ?? 0}`);
  console.log(`output_tokens: ${r._metadata.output_token_count ?? 0}`);
  console.log(`attempts_made: ${r._metadata.attempts_made ?? 0}`);
  console.log(`wall-clock duration_ms: ${wallClockMs}`);

  console.log(`\n--- Diagnosis hints ---`);
  switch (r._failure_type) {
    case "kb_load_failed":
      console.log("- Check that all rec files exist in kb/v1_2/01_recommendations/");
      console.log("- Check missing_rec_id field in failure_context");
      break;
    case "json_parse_failed":
      console.log("- Inspect raw_response in failure_context — likely truncation or markdown fence leakage");
      console.log("- Consider raising max_tokens above 16000 if output was cut off");
      break;
    case "schema_validation_failed":
      console.log("- Inspect validation_errors in failure_context");
      console.log("- Likely a state-shape invariant or ActionItem lifecycle invariant violation");
      console.log("- May indicate system prompt needs tightening on the failing rule");
      break;
    case "max_retries_exceeded":
      console.log("- last_failure_type indicates which class repeated across attempts");
      console.log("- Same diagnosis as the underlying type");
      break;
    case "api_error":
      console.log("- Check api_error field — could be auth, rate limit, model availability, or context overflow");
      break;
    case "context_overflow":
      console.log("- estimated_input_tokens exceeded the 180K ceiling");
      console.log("- Reduce batch size or trim rec files");
      break;
    case "fr_extraction_failed":
      console.log("- Internal error loading system prompt — check stage3a1.system.md exists");
      break;
  }
}

main().catch((err) => {
  console.error("UNCAUGHT ERROR:", err);
  process.exit(2);
});
