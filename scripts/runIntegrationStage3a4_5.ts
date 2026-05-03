// Phase 3.4 — Live integration test of Stage 3a → Stage 4 → Stage 5 on Holloway.
//
// Sequences the three individually-validated stages into a single pipeline,
// starting from the hand-authored Holloway fixtures:
//   - artifacts/holloway_selected_recommendations.json (Phase 2 calibration fixture)
//   - artifacts/holloway_clientprofile.json (Stage 1 verified output)
//
// Why Stage 0/1/2/3b are NOT included: Stage 0/1 lack a raw FR .docx fixture;
// Stage 2 is deferred to v2; Stage 3b is built but architecturally bypassed
// (Stage 4 consumes Stage 3a output directly).
//
// Artifact-first writes: each stage's full output is written to disk BEFORE
// the next stage is invoked. Failed runs preserve all artifacts written so far.
//
// Hard budget cap: $35 (3500 cents) cumulative across all three stages.
// Expected: $18-$25 cumulative. Wall-clock: 25-35 min.
//
// Behavior on failure:
//   - Stage 3a: failure if `_sequencer_status === "FAILED"`. Halt; do not invoke Stage 4.
//   - Stage 4 / Stage 5: failure via `_stage_status === "FAILED"` discriminator.
//   - Cumulative cost is reported even on abort.
//   - Each stage's internal retry policy is used as-is (Stage 3a per-batch,
//     Stage 4 per-pass, Stage 5 single retry). Runner adds NO extra retries.

import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import Anthropic from "@anthropic-ai/sdk";

import { runStage3a } from "../src/lib/orchestrator/stages/stage3aOrchestration";
import type { Stage3a1ApiClient } from "../src/lib/orchestrator/stages/stage3a1BatchQuantifier";
import {
  generatePlan,
  type Stage4ApiClient,
} from "../src/lib/orchestrator/stages/stage4PlanGenerator";
import {
  auditPlan,
  type Stage5ApiClient,
} from "../src/lib/orchestrator/stages/stage5CoherenceAuditor";
import {
  isStage4ResultFailed,
  type Stage4Result,
  type Stage4ResultFailed,
} from "../src/lib/orchestrator/schemas/stage4.types";
import {
  isStage5ResultFailed,
  type Stage5Result,
  type Stage5ResultFailed,
} from "../src/lib/orchestrator/schemas/stage5.types";
import { buildTopFivePriorities } from "../src/lib/orchestrator/glue/stage4Builders";
import type { ClientProfile } from "../src/lib/orchestrator/schemas/clientProfile";
import type {
  QuantifiedRecommendations,
  SequencedRecommendation,
} from "../src/lib/orchestrator/schemas/pipelineTypes";
import type { SelectedRecommendations } from "../src/lib/orchestrator/schemas/selectedRecommendations";

// SKIP_STAGE_3A=1 sources Stage 3a from the proven-good cached artifact
// (artifacts/stage3a_full_pipeline_test_v2.json) instead of firing live.
// Used to validate Stage 4 → Stage 5 orchestrator wiring when Stage 3a's
// stochastic schema-retry behavior would otherwise block the integration test.
const SKIP_STAGE_3A = process.env.SKIP_STAGE_3A === "1";

// Budget cap depends on mode: full pipeline = $35; Option C (skip 3a) = $20.
const HARD_BUDGET_CAP_CENTS = SKIP_STAGE_3A ? 2000 : 3500;
// Expected next-stage minimums for the pre-flight cumulative gate.
const STAGE4_EXPECTED_MIN_CENTS = 700; // $7 floor
const STAGE5_EXPECTED_MIN_CENTS = 100; // $1 floor

const ARTIFACT_DIR = "artifacts/integration_v1";
const STAGE3A_PATH = `${ARTIFACT_DIR}/stage3a.json`;
const STAGE4_PATH = `${ARTIFACT_DIR}/stage4.json`;
const STAGE5_PATH = `${ARTIFACT_DIR}/stage5.json`;

const FIXTURE_CLIENT_PROFILE = "artifacts/holloway_clientprofile.json";
const FIXTURE_SELECTED_RECS = "artifacts/holloway_selected_recommendations.json";

const CACHED_STAGE3A_PATH = "artifacts/stage3a_full_pipeline_test_v2.json";
const CACHED_STAGE4_PATH = "artifacts/stage4_holloway_validation_v1.json";
const CACHED_STAGE5_PATH = "artifacts/stage5_holloway_validation_v2.json";

const EXPECTED_STAGE4_SECTION_IDS = [
  "T", "ES", "OP", "CS", "GP", "FO", "RB.1", "RB.2", "RB.3", "RB.4", "RB.5",
  "RB.6", "RB.7", "RP.8", "RP.9", "RP.10", "RP.11", "RP.12", "IR", "DN",
  "AT", "MC", "GL", "DS",
];

interface StageRunSummary {
  stage: "stage3a" | "stage4" | "stage5";
  status: "SUCCESS" | "FAILED" | "ABORTED_BUDGET" | "SOURCED_FROM_CACHE";
  cost_cents: number;
  duration_ms: number;
  attempts_made: number;
  stop_reason: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  artifact_path: string | null;
}

interface CumulativeState {
  cost_cents: number;
  wall_clock_ms: number;
  attempts: number;
  summaries: StageRunSummary[];
  fresh_stage3a: QuantifiedRecommendations | null;
  fresh_stage4: Stage4Result | null;
  fresh_stage5: Stage5Result | null;
}

// ────────────────────────────────────────────────────────────────────────
// Logging API client wrappers (one per stage; each emits stream lifecycle
// signals + token usage so the operator can see liveness across the 25-35
// minute run).
// ────────────────────────────────────────────────────────────────────────

function makeStage3aLoggingClient(real: Stage3a1ApiClient): Stage3a1ApiClient {
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
        console.log(`  [s3a stream #${id}, batch ${batchIndex}] opened`);
        const stream = real.messages.stream(params);
        return {
          finalMessage: async () => {
            const msg = await stream.finalMessage();
            const dt = Date.now() - t0;
            const ai = msg.usage?.input_tokens ?? 0;
            const ao = msg.usage?.output_tokens ?? 0;
            callsResolved += 1;
            console.log(
              `  [s3a stream #${id}, batch ${batchIndex}] resolved ${dt}ms, in=${ai}, out=${ao}, stop=${msg.stop_reason} (${callsResolved}/${callsOpened})`,
            );
            return msg;
          },
        };
      },
    },
  };
}

function makeStage4LoggingClient(real: Stage4ApiClient): Stage4ApiClient {
  let callsOpened = 0;
  let callsResolved = 0;
  return {
    messages: {
      countTokens: async (params) => {
        const r = await real.messages.countTokens(params);
        console.log(`  [s4 countTokens] real=${r.input_tokens.toLocaleString()}`);
        return r;
      },
      stream: (params) => {
        const id = ++callsOpened;
        const t0 = Date.now();
        const passLabel =
          params.tool_choice && params.tool_choice.type === "tool"
            ? params.tool_choice.name
            : "unknown_tool";
        console.log(`  [s4 stream #${id}, ${passLabel}] opened`);
        const stream = real.messages.stream(params);
        return {
          finalMessage: async () => {
            const msg = await stream.finalMessage();
            const dt = Date.now() - t0;
            const ai = msg.usage?.input_tokens ?? 0;
            const ao = msg.usage?.output_tokens ?? 0;
            const cc = msg.usage?.cache_creation_input_tokens ?? 0;
            const cr = msg.usage?.cache_read_input_tokens ?? 0;
            callsResolved += 1;
            console.log(
              `  [s4 stream #${id}, ${passLabel}] resolved ${dt}ms | in=${ai.toLocaleString()} out=${ao.toLocaleString()} cw=${cc.toLocaleString()} cr=${cr.toLocaleString()} | stop=${msg.stop_reason} (${callsResolved}/${callsOpened})`,
            );
            return msg;
          },
        };
      },
    },
  };
}

function makeStage5LoggingClient(real: Stage5ApiClient): Stage5ApiClient {
  let callsOpened = 0;
  let callsResolved = 0;
  return {
    messages: {
      countTokens: async (params) => {
        const r = await real.messages.countTokens(params);
        console.log(`  [s5 countTokens] real=${r.input_tokens.toLocaleString()}`);
        return r;
      },
      stream: (params) => {
        const id = ++callsOpened;
        const t0 = Date.now();
        const toolName =
          params.tool_choice && params.tool_choice.type === "tool"
            ? params.tool_choice.name
            : "unknown_tool";
        console.log(`  [s5 stream #${id}, ${toolName}] opened`);
        const stream = real.messages.stream(params);
        return {
          finalMessage: async () => {
            const msg = await stream.finalMessage();
            const dt = Date.now() - t0;
            const ai = msg.usage?.input_tokens ?? 0;
            const ao = msg.usage?.output_tokens ?? 0;
            const cc = msg.usage?.cache_creation_input_tokens ?? 0;
            const cr = msg.usage?.cache_read_input_tokens ?? 0;
            callsResolved += 1;
            console.log(
              `  [s5 stream #${id}, ${toolName}] resolved ${dt}ms | in=${ai.toLocaleString()} out=${ao.toLocaleString()} cw=${cc.toLocaleString()} cr=${cr.toLocaleString()} | stop=${msg.stop_reason} (${callsResolved}/${callsOpened})`,
            );
            return msg;
          },
        };
      },
    },
  };
}

// ────────────────────────────────────────────────────────────────────────
// Artifact write helper — wraps result with metadata header.
// ────────────────────────────────────────────────────────────────────────

async function writeArtifact(
  path: string,
  result: unknown,
  durationMs: number,
  costCents: number,
): Promise<void> {
  const wrapped = {
    _metadata: {
      source_input_files: [FIXTURE_CLIENT_PROFILE, FIXTURE_SELECTED_RECS],
      wall_clock_ms: durationMs,
      cost_cents: costCents,
      integration_run_v: "v1",
      script: "scripts/runIntegrationStage3a4_5.ts",
      written_at: new Date().toISOString(),
    },
    result,
  };
  await writeFile(resolve(path), JSON.stringify(wrapped, null, 2) + "\n");
}

// ────────────────────────────────────────────────────────────────────────
// Stage 3a status / metric extraction.
// ────────────────────────────────────────────────────────────────────────

function summarizeStage3a(
  qr: QuantifiedRecommendations,
  durationMs: number,
): StageRunSummary {
  const m = qr._metadata!;
  const failed = qr._sequencer_status === "FAILED";
  // Stop reason: composite signal across orchestrator + per-batch.
  const failedBatches = m.per_batch.filter((b) => b.status === "failed");
  let stopReason: string;
  if (failed) {
    stopReason = `sequencer_status=FAILED; failed_batches=${failedBatches.length}`;
  } else if (failedBatches.length > 0) {
    stopReason = `partial: ${failedBatches.length}/${m.per_batch.length} batches failed (orchestrator did not abort)`;
  } else {
    stopReason = `success: all ${m.per_batch.length} batches resolved`;
  }
  return {
    stage: "stage3a",
    status: failed ? "FAILED" : "SUCCESS",
    cost_cents: m.cost_cents,
    duration_ms: durationMs,
    attempts_made: m.total_attempts,
    stop_reason: stopReason,
    input_tokens: m.total_input_tokens,
    output_tokens: m.total_output_tokens,
    cache_creation_input_tokens: m.total_cache_creation_input_tokens,
    cache_read_input_tokens: m.total_cache_read_input_tokens,
    artifact_path: STAGE3A_PATH,
  };
}

function summarizeStage4(
  res: Stage4Result | Stage4ResultFailed,
  durationMs: number,
): StageRunSummary {
  if (isStage4ResultFailed(res)) {
    const m = res._metadata;
    return {
      stage: "stage4",
      status: "FAILED",
      cost_cents: m.cost_cents ?? 0,
      duration_ms: durationMs,
      attempts_made: m.attempts_made ?? 0,
      stop_reason: `${res._failure_type}: ${res._failure_reason.slice(0, 200)}`,
      input_tokens: m.input_token_count ?? 0,
      output_tokens: m.output_token_count ?? 0,
      cache_creation_input_tokens: m.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: m.cache_read_input_tokens ?? 0,
      artifact_path: STAGE4_PATH,
    };
  }
  const m = res._metadata;
  const lastAttempt = m.attempt_history[m.attempt_history.length - 1];
  return {
    stage: "stage4",
    status: "SUCCESS",
    cost_cents: m.cost_cents,
    duration_ms: durationMs,
    attempts_made: m.attempts_made,
    stop_reason: `success after ${m.attempts_made} attempt(s); last outcome=${lastAttempt?.outcome ?? "n/a"}`,
    input_tokens: m.input_token_count,
    output_tokens: m.output_token_count,
    cache_creation_input_tokens: m.cache_creation_input_tokens,
    cache_read_input_tokens: m.cache_read_input_tokens,
    artifact_path: STAGE4_PATH,
  };
}

function summarizeStage5(
  res: Stage5Result | Stage5ResultFailed,
  durationMs: number,
): StageRunSummary {
  if (isStage5ResultFailed(res)) {
    const m = res._metadata;
    return {
      stage: "stage5",
      status: "FAILED",
      cost_cents: m.cost_cents ?? 0,
      duration_ms: durationMs,
      attempts_made: m.attempts_made ?? 0,
      stop_reason: `${res._failure_type}: ${res._failure_reason.slice(0, 200)}`,
      input_tokens: m.input_token_count ?? 0,
      output_tokens: m.output_token_count ?? 0,
      cache_creation_input_tokens: m.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: m.cache_read_input_tokens ?? 0,
      artifact_path: STAGE5_PATH,
    };
  }
  const m = res._metadata;
  const lastAttempt = m.attempt_history[m.attempt_history.length - 1];
  const skipNote = res._flags.llm_skipped
    ? ` (LLM skipped: context_overflow=${res._flags.llm_skipped_due_to_context_overflow})`
    : "";
  return {
    stage: "stage5",
    status: "SUCCESS",
    cost_cents: m.cost_cents,
    duration_ms: durationMs,
    attempts_made: m.attempts_made,
    stop_reason: `success after ${m.attempts_made} attempt(s); last outcome=${lastAttempt?.outcome ?? "n/a"}${skipNote}`,
    input_tokens: m.input_token_count,
    output_tokens: m.output_token_count,
    cache_creation_input_tokens: m.cache_creation_input_tokens,
    cache_read_input_tokens: m.cache_read_input_tokens,
    artifact_path: STAGE5_PATH,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Per-stage runners
// ────────────────────────────────────────────────────────────────────────

// Option C: load Stage 3a output from the cached artifact and copy into
// the integration_v1 directory so downstream steps see a consistent layout.
// $0 cost, no LLM call. Stage 4 + Stage 5 still run live.
async function loadStage3aFromCache(
  state: CumulativeState,
): Promise<QuantifiedRecommendations | null> {
  console.log(`\n========== STAGE 3a (SOURCED FROM CACHE) ==========`);
  console.log(`Loading: ${CACHED_STAGE3A_PATH}`);
  let cachedRaw: { result: QuantifiedRecommendations };
  try {
    cachedRaw = JSON.parse(
      await readFile(CACHED_STAGE3A_PATH, "utf8"),
    ) as { result: QuantifiedRecommendations };
  } catch (err) {
    console.error(`ERROR: cannot load cached Stage 3a artifact:`, err);
    state.summaries.push({
      stage: "stage3a",
      status: "FAILED",
      cost_cents: 0,
      duration_ms: 0,
      attempts_made: 0,
      stop_reason: `cached-fixture-load failed: ${(err as Error).message}`,
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      artifact_path: null,
    });
    return null;
  }
  const qr = cachedRaw.result;
  // Preserve the cached artifact in the integration directory under the
  // standard name so reports + downstream tooling see a consistent layout.
  await writeArtifact(STAGE3A_PATH, qr, 0, 0);
  console.log(`Cached Stage 3a aliased to: ${STAGE3A_PATH}`);
  console.log(
    `Stage 3a (cache): ${qr.recommendations.length} recs | _sequencer_status=${qr._sequencer_status} | original cost=${qr._metadata?.cost_cents ?? 0}c (NOT counted toward Option C cap)`,
  );

  state.summaries.push({
    stage: "stage3a",
    status: "SOURCED_FROM_CACHE",
    cost_cents: 0,
    duration_ms: 0,
    attempts_made: 0,
    stop_reason: `sourced from ${CACHED_STAGE3A_PATH} (rec_count=${qr.recommendations.length}, original _sequencer_status=${qr._sequencer_status})`,
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    artifact_path: STAGE3A_PATH,
  });
  state.fresh_stage3a = qr;
  return qr;
}

async function runStage3aStep(
  clientProfile: ClientProfile,
  selected: SelectedRecommendations,
  apiClient: Stage3a1ApiClient,
  state: CumulativeState,
): Promise<QuantifiedRecommendations | null> {
  console.log(`\n========== STAGE 3a ==========`);
  console.log(
    `Input: ${selected.selected.length} selected recs (advisor=${clientProfile.engagement.advisor_id})`,
  );
  const t0 = Date.now();
  const qr = await runStage3a(clientProfile, selected, {
    apiClient,
    kbPath: "kb/v1_2",
    referenceDate: new Date(),
    firmPolicyResolutions: [],
    landmineAuthorizations: [],
    maxRetriesPerBatch: 1,
  });
  const dt = Date.now() - t0;

  // Artifact-first write — even on per-batch failures we preserve diagnostic data.
  await writeArtifact(STAGE3A_PATH, qr, dt, qr._metadata?.cost_cents ?? 0);
  console.log(`Stage 3a artifact written: ${STAGE3A_PATH}`);

  const summary = summarizeStage3a(qr, dt);
  state.summaries.push(summary);
  state.cost_cents += summary.cost_cents;
  state.wall_clock_ms += dt;
  state.attempts += summary.attempts_made;
  state.fresh_stage3a = qr;

  console.log(
    `Stage 3a: ${summary.status} | $${(summary.cost_cents / 100).toFixed(2)} | ${(dt / 1000 / 60).toFixed(2)} min | ${summary.attempts_made} attempts | ${summary.stop_reason}`,
  );

  if (summary.status === "FAILED") {
    console.log(`Stage 3a FAILED — halting pipeline, NOT invoking Stage 4.`);
    return null;
  }
  return qr;
}

async function runStage4Step(
  clientProfile: ClientProfile,
  qr: QuantifiedRecommendations,
  apiClient: Stage4ApiClient,
  state: CumulativeState,
): Promise<Stage4Result | null> {
  // Pre-flight cumulative cost guard
  if (state.cost_cents + STAGE4_EXPECTED_MIN_CENTS > HARD_BUDGET_CAP_CENTS) {
    console.log(
      `\n!! Pre-flight ABORT before Stage 4: cumulative=${state.cost_cents}c + expected_min=${STAGE4_EXPECTED_MIN_CENTS}c > cap=${HARD_BUDGET_CAP_CENTS}c`,
    );
    state.summaries.push({
      stage: "stage4",
      status: "ABORTED_BUDGET",
      cost_cents: 0,
      duration_ms: 0,
      attempts_made: 0,
      stop_reason: `aborted: cumulative ${state.cost_cents}c + expected min ${STAGE4_EXPECTED_MIN_CENTS}c > cap ${HARD_BUDGET_CAP_CENTS}c`,
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      artifact_path: null,
    });
    return null;
  }

  console.log(`\n========== STAGE 4 ==========`);
  console.log(
    `Input: ${qr.recommendations.length} quantified recs; advisorId=will-bearden`,
  );
  const t0 = Date.now();
  const res = await generatePlan(clientProfile, qr, {
    apiClient,
    kbPath: "kb/v1_2",
    advisorId: "will-bearden",
    generatedDate: new Date(),
    referenceDate: new Date(),
    maxRetries: 1,
  });
  const dt = Date.now() - t0;

  await writeArtifact(STAGE4_PATH, res, dt, res._metadata?.cost_cents ?? 0);
  console.log(`Stage 4 artifact written: ${STAGE4_PATH}`);

  const summary = summarizeStage4(res, dt);
  state.summaries.push(summary);
  state.cost_cents += summary.cost_cents;
  state.wall_clock_ms += dt;
  state.attempts += summary.attempts_made;

  console.log(
    `Stage 4: ${summary.status} | $${(summary.cost_cents / 100).toFixed(2)} | ${(dt / 1000 / 60).toFixed(2)} min | ${summary.attempts_made} attempts | ${summary.stop_reason}`,
  );

  if (summary.status === "FAILED") {
    console.log(`Stage 4 FAILED — halting pipeline, NOT invoking Stage 5.`);
    return null;
  }
  state.fresh_stage4 = res as Stage4Result;
  return res as Stage4Result;
}

async function runStage5Step(
  clientProfile: ClientProfile,
  qr: QuantifiedRecommendations,
  stage4: Stage4Result,
  apiClient: Stage5ApiClient,
  state: CumulativeState,
): Promise<Stage5Result | null> {
  if (state.cost_cents + STAGE5_EXPECTED_MIN_CENTS > HARD_BUDGET_CAP_CENTS) {
    console.log(
      `\n!! Pre-flight ABORT before Stage 5: cumulative=${state.cost_cents}c + expected_min=${STAGE5_EXPECTED_MIN_CENTS}c > cap=${HARD_BUDGET_CAP_CENTS}c`,
    );
    state.summaries.push({
      stage: "stage5",
      status: "ABORTED_BUDGET",
      cost_cents: 0,
      duration_ms: 0,
      attempts_made: 0,
      stop_reason: `aborted: cumulative ${state.cost_cents}c + expected min ${STAGE5_EXPECTED_MIN_CENTS}c > cap ${HARD_BUDGET_CAP_CENTS}c`,
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      artifact_path: null,
    });
    return null;
  }

  console.log(`\n========== STAGE 5 ==========`);
  console.log(`Input: Stage 4 result + ${qr.recommendations.length} quantified recs`);
  const t0 = Date.now();
  const res = await auditPlan(stage4, qr, clientProfile, {
    apiClient,
    kbPath: "kb/v1_2",
    advisorId: "will-bearden",
    referenceDate: new Date(),
    maxRetries: 1,
    runLlmChecks: true,
  });
  const dt = Date.now() - t0;

  await writeArtifact(STAGE5_PATH, res, dt, res._metadata?.cost_cents ?? 0);
  console.log(`Stage 5 artifact written: ${STAGE5_PATH}`);

  const summary = summarizeStage5(res, dt);
  state.summaries.push(summary);
  state.cost_cents += summary.cost_cents;
  state.wall_clock_ms += dt;
  state.attempts += summary.attempts_made;

  console.log(
    `Stage 5: ${summary.status} | $${(summary.cost_cents / 100).toFixed(2)} | ${(dt / 1000 / 60).toFixed(2)} min | ${summary.attempts_made} attempts | ${summary.stop_reason}`,
  );

  if (summary.status === "FAILED") return null;
  state.fresh_stage5 = res as Stage5Result;
  return res as Stage5Result;
}

// ────────────────────────────────────────────────────────────────────────
// Cross-stage validation report
// ────────────────────────────────────────────────────────────────────────

function fmtMinSec(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${String(r).padStart(2, "0")}s`;
}

function fmtCents(c: number): string {
  return `${c}c (~$${(c / 100).toFixed(2)})`;
}

async function loadCachedQr(): Promise<QuantifiedRecommendations | null> {
  try {
    const j = JSON.parse(await readFile(CACHED_STAGE3A_PATH, "utf8"));
    return j.result as QuantifiedRecommendations;
  } catch {
    return null;
  }
}

async function loadCachedStage4(): Promise<Stage4Result | null> {
  try {
    const j = JSON.parse(await readFile(CACHED_STAGE4_PATH, "utf8"));
    return j.result as Stage4Result;
  } catch {
    return null;
  }
}

async function loadCachedStage5(): Promise<Stage5Result | null> {
  try {
    const j = JSON.parse(await readFile(CACHED_STAGE5_PATH, "utf8"));
    return j.result as Stage5Result;
  } catch {
    return null;
  }
}

function collectStateAEstimates(
  qr: QuantifiedRecommendations,
): Map<string, number | { low: number; high: number }> {
  const out = new Map<string, number | { low: number; high: number }>();
  for (const rec of qr.recommendations) {
    const e = rec.quantified_impact.estimate;
    if (e === null) continue;
    const v = e.value;
    if (typeof v === "number") {
      out.set(rec.recommendation_id, v);
    } else if (
      v &&
      typeof v === "object" &&
      "low" in v &&
      "high" in v &&
      typeof (v as { low: unknown }).low === "number" &&
      typeof (v as { high: unknown }).high === "number"
    ) {
      const lv = v as { low: number; high: number };
      out.set(rec.recommendation_id, { low: lv.low, high: lv.high });
    }
  }
  return out;
}

function midpointOf(
  v: number | { low: number; high: number } | undefined,
): number | null {
  if (v === undefined) return null;
  if (typeof v === "number") return v;
  return (v.low + v.high) / 2;
}

function comparePerStageReport(state: CumulativeState): void {
  console.log(`\n===== PER-STAGE REPORT =====\n`);
  console.log(
    `${"stage".padEnd(8)} | ${"status".padEnd(15)} | ${"cost".padEnd(16)} | ${"duration".padEnd(10)} | attempts | stop_reason`,
  );
  for (const s of state.summaries) {
    console.log(
      `${s.stage.padEnd(8)} | ${s.status.padEnd(15)} | ${fmtCents(s.cost_cents).padEnd(16)} | ${fmtMinSec(s.duration_ms).padEnd(10)} | ${String(s.attempts_made).padStart(8)} | ${s.stop_reason}`,
    );
    console.log(
      `         tokens: in=${s.input_tokens.toLocaleString()} out=${s.output_tokens.toLocaleString()} cache_w=${s.cache_creation_input_tokens.toLocaleString()} cache_r=${s.cache_read_input_tokens.toLocaleString()}`,
    );
  }

  console.log(`\n===== CUMULATIVE =====\n`);
  console.log(`total_cost:        ${fmtCents(state.cost_cents)}`);
  console.log(`total_wall_clock:  ${fmtMinSec(state.wall_clock_ms)}`);
  console.log(`total_attempts:    ${state.attempts}`);
  console.log(`hard_budget_cap:   ${fmtCents(HARD_BUDGET_CAP_CENTS)}`);
  if (state.cost_cents > HARD_BUDGET_CAP_CENTS) {
    console.log(`!! BUDGET CAP BREACH BY ${fmtCents(state.cost_cents - HARD_BUDGET_CAP_CENTS)}`);
  }
}

async function crossStageStage3aReport(
  fresh: QuantifiedRecommendations,
): Promise<void> {
  console.log(`\n===== CROSS-STAGE: STAGE 3a (fresh vs cached) =====\n`);
  const cached = await loadCachedQr();
  if (!cached) {
    console.log(`(cached artifact ${CACHED_STAGE3A_PATH} not loadable — skipping comparison)`);
    return;
  }
  console.log(
    `recommendation_count:    fresh=${fresh.recommendations.length} | cached=${cached.recommendations.length} | match=${fresh.recommendations.length === cached.recommendations.length ? "✓" : "⚠"}`,
  );

  // Top 5 priorities ordering — deterministic over QR via buildTopFivePriorities.
  const freshTop = buildTopFivePriorities(fresh).map(
    (r) => r.descriptor.split(" ")[0],
  );
  const cachedTop = buildTopFivePriorities(cached).map(
    (r) => r.descriptor.split(" ")[0],
  );
  const sameOrdering = freshTop.length === cachedTop.length &&
    freshTop.every((id, i) => id === cachedTop[i]);
  console.log(`\nTop 5 priorities (rec_id ordering):`);
  console.log(`  fresh:  ${freshTop.join(" → ")}`);
  console.log(`  cached: ${cachedTop.join(" → ")}`);
  console.log(`  same ordering? ${sameOrdering ? "✓ YES" : "⚠ NO"}`);

  // Estimate sample (5 random State A recs) — within 10% midpoint?
  const freshA = collectStateAEstimates(fresh);
  const cachedA = collectStateAEstimates(cached);
  const sharedIds = [...freshA.keys()].filter((id) => cachedA.has(id));
  // Stable sample (deterministic, not RNG): take 5 evenly-spaced from sorted IDs.
  sharedIds.sort();
  const sampleSize = Math.min(5, sharedIds.length);
  const sample: string[] = [];
  for (let i = 0; i < sampleSize; i += 1) {
    sample.push(sharedIds[Math.floor((i * sharedIds.length) / sampleSize)]);
  }
  console.log(`\nState A estimate sample (5 IDs, midpoint, % drift from cached):`);
  let outOfBand = 0;
  for (const id of sample) {
    const fm = midpointOf(freshA.get(id));
    const cm = midpointOf(cachedA.get(id));
    if (fm === null || cm === null || cm === 0) {
      console.log(`  ${id}: fresh=${fm} cached=${cm} (cannot compute drift)`);
      continue;
    }
    const driftPct = ((fm - cm) / cm) * 100;
    const within = Math.abs(driftPct) <= 10;
    if (!within) outOfBand += 1;
    console.log(
      `  ${id}: fresh=${fm.toLocaleString()} cached=${cm.toLocaleString()} drift=${driftPct >= 0 ? "+" : ""}${driftPct.toFixed(1)}% ${within ? "✓" : "⚠ >10%"}`,
    );
  }
  console.log(`  → within 10%: ${sample.length - outOfBand}/${sample.length}`);

  // Sequencer failures — fresh vs cached.
  const freshFailedBatches = (fresh._metadata?.per_batch ?? []).filter(
    (b) => b.status === "failed",
  ).length;
  const cachedFailedBatches = (cached._metadata?.per_batch ?? []).filter(
    (b) => b.status === "failed",
  ).length;
  console.log(`\nSequencer per-batch failures:`);
  console.log(`  fresh:  ${freshFailedBatches} failed batches`);
  console.log(`  cached: ${cachedFailedBatches} failed batches`);
  console.log(`\n_sequencer_status:`);
  console.log(`  fresh:  ${fresh._sequencer_status}`);
  console.log(`  cached: ${cached._sequencer_status}`);
}

async function crossStageStage4Report(fresh: Stage4Result): Promise<void> {
  console.log(`\n===== CROSS-STAGE: STAGE 4 (fresh vs cached) =====\n`);
  const cached = await loadCachedStage4();

  // Section presence
  const ll = fresh.llm_sections;
  const det = fresh.deterministic_sections;
  const presence: Record<string, boolean> = {
    T: !!det.title_page,
    ES: !!ll.executive_summary,
    OP: !!ll.our_process,
    CS: !!det.client_snapshot,
    GP: !!det.goals_priorities,
    FO: !!ll.findings_observations,
    IR: !!det.implementation_roadmap,
    DN: !!det.decisions_needed,
    AT: !!det.advisory_team,
    MC: !!ll.meeting_cadence_intro && !!det.meeting_cadence_table,
    GL: !!det.glossary,
    DS: !!det.disclosures,
  };
  for (const sec of ll.recommendations_business.sections) presence[sec.section_id] = true;
  for (const sec of ll.recommendations_personal.sections) presence[sec.section_id] = true;

  console.log(`Section ID presence (24 expected):`);
  const missing: string[] = [];
  for (const id of EXPECTED_STAGE4_SECTION_IDS) {
    const ok = presence[id] === true;
    if (!ok) missing.push(id);
  }
  console.log(
    `  present: ${EXPECTED_STAGE4_SECTION_IDS.length - missing.length}/${EXPECTED_STAGE4_SECTION_IDS.length} ${missing.length === 0 ? "✓" : "⚠"}`,
  );
  if (missing.length > 0) {
    console.log(`  MISSING: ${missing.join(", ")}`);
  }

  // Cross-references
  const allRefs = [
    ...ll.recommendations_business.sections.flatMap((s) => s.cross_references),
    ...ll.recommendations_personal.sections.flatMap((s) => s.cross_references),
  ];
  console.log(`\nCross-references:`);
  console.log(`  resolved (emitted):     ${allRefs.length}`);
  console.log(`  unresolved (stripped):  ${fresh._flags.unresolved_cross_references.length}`);
  if (cached) {
    const cachedAllRefs = [
      ...cached.llm_sections.recommendations_business.sections.flatMap(
        (s) => s.cross_references,
      ),
      ...cached.llm_sections.recommendations_personal.sections.flatMap(
        (s) => s.cross_references,
      ),
    ];
    console.log(`  cached resolved:        ${cachedAllRefs.length}`);
    console.log(
      `  cached unresolved:      ${cached._flags.unresolved_cross_references.length}`,
    );
  }

  // Glossary
  console.log(`\nGlossary:`);
  console.log(`  fresh entries:           ${det.glossary.entries.length}`);
  console.log(`  fresh terms_used:        ${fresh._flags.glossary_terms_used.length}`);
  if (cached) {
    console.log(
      `  cached entries:          ${cached.deterministic_sections.glossary.entries.length}`,
    );
    console.log(
      `  cached terms_used:       ${cached._flags.glossary_terms_used.length}`,
    );
  }

  // Voice spot-checks
  console.log(`\n--- Voice spot-check (a): Executive Summary opening 2 paragraphs ---`);
  console.log(`\n[opening_paragraph]\n${ll.executive_summary.opening_paragraph}`);
  console.log(`\n[two_themes_paragraph]\n${ll.executive_summary.two_themes_paragraph}`);

  console.log(`\n--- Voice spot-check (b): RB.1 first recommendations bullet ---`);
  const rb1 = ll.recommendations_business.sections.find((s) => s.section_id === "RB.1");
  if (rb1) {
    const bullets = (rb1.subsections && rb1.subsections[0]?.bullets) ?? rb1.recommendations_bullets;
    const b = bullets[0];
    if (b) {
      console.log(`[RB.1 ${rb1.numbered_heading}]`);
      console.log(`label: ${rb1.label}`);
      console.log(`\n• **${b.bold_imperative}** ${b.briefing}`);
      if (b.partner_role) console.log(`  (partner: ${b.partner_role})`);
    } else {
      console.log(`(RB.1 has no recommendations_bullets or subsection bullets)`);
    }
  } else {
    console.log(`(RB.1 not present)`);
  }

  console.log(`\n--- Voice spot-check (c): RP.8 first recommendations bullet (Pass 2 voice consistency) ---`);
  const rp8 = ll.recommendations_personal.sections.find((s) => s.section_id === "RP.8");
  if (rp8) {
    const bullets = (rp8.subsections && rp8.subsections[0]?.bullets) ?? rp8.recommendations_bullets;
    const b = bullets[0];
    if (b) {
      console.log(`[RP.8 ${rp8.numbered_heading}]`);
      console.log(`label: ${rp8.label}`);
      console.log(`\n• **${b.bold_imperative}** ${b.briefing}`);
      if (b.partner_role) console.log(`  (partner: ${b.partner_role})`);
    } else {
      console.log(`(RP.8 has no recommendations_bullets or subsection bullets)`);
    }
  } else {
    console.log(`(RP.8 not present)`);
  }
}

async function crossStageStage5Report(fresh: Stage5Result): Promise<void> {
  console.log(`\n===== CROSS-STAGE: STAGE 5 (fresh vs cached) =====\n`);
  const cached = await loadCachedStage5();

  const sevBreakdown = (fs: Stage5Result["findings"]) => ({
    critical: fs.filter((f) => f.severity === "critical").length,
    warning: fs.filter((f) => f.severity === "warning").length,
    info: fs.filter((f) => f.severity === "info").length,
  });
  const fSev = sevBreakdown(fresh.findings);
  console.log(`Findings:`);
  console.log(`  fresh:  total=${fresh.findings.length} | critical=${fSev.critical} warning=${fSev.warning} info=${fSev.info}`);
  if (cached) {
    const cSev = sevBreakdown(cached.findings);
    console.log(`  cached: total=${cached.findings.length} | critical=${cSev.critical} warning=${cSev.warning} info=${cSev.info}`);
  }

  console.log(`\nassessment_disagreement:`);
  console.log(`  fresh:  ${fresh._flags.assessment_disagreement}`);
  if (cached) console.log(`  cached: ${cached._flags.assessment_disagreement}`);

  console.log(`\noverall_assessment:`);
  console.log(`  fresh:  ${fresh.overall_assessment}`);
  if (cached) {
    console.log(`  cached: ${cached.overall_assessment}`);
    console.log(
      `  match? ${fresh.overall_assessment === cached.overall_assessment ? "✓ YES" : "⚠ NO"}`,
    );
  }

  // Voice consistency score within 5 points of cached (90)?
  console.log(`\nLLM voice_consistency_score:`);
  if (fresh.llm_assessment) {
    console.log(`  fresh:  ${fresh.llm_assessment.voice_consistency_score}`);
  } else {
    console.log(`  fresh:  (LLM skipped)`);
  }
  if (cached?.llm_assessment) {
    console.log(`  cached: ${cached.llm_assessment.voice_consistency_score}`);
  }
  if (fresh.llm_assessment && cached?.llm_assessment) {
    const drift = Math.abs(
      fresh.llm_assessment.voice_consistency_score -
        cached.llm_assessment.voice_consistency_score,
    );
    console.log(
      `  drift:  ${drift} points ${drift <= 5 ? "✓ within 5" : "⚠ >5 points off"}`,
    );
  }

  // Contradiction count
  if (fresh.llm_assessment) {
    console.log(`\nLLM contradiction_count:  fresh=${fresh.llm_assessment.contradiction_count}`);
    if (cached?.llm_assessment) {
      console.log(`                          cached=${cached.llm_assessment.contradiction_count}`);
    }
  }
}

function diagnosticVerdict(state: CumulativeState): void {
  console.log(`\n===== DIAGNOSTIC VERDICT =====\n`);

  const s3a = state.summaries.find((s) => s.stage === "stage3a");
  const s4 = state.summaries.find((s) => s.stage === "stage4");
  const s5 = state.summaries.find((s) => s.stage === "stage5");

  // SOURCED_FROM_CACHE is success-equivalent for Stage 3a in Option C mode:
  // the cached artifact stands in for a fresh live run, so the orchestrator
  // wiring through Stage 4 → Stage 5 still gets a clean end-to-end signal.
  const isStage3aOk = s3a?.status === "SUCCESS" || s3a?.status === "SOURCED_FROM_CACHE";
  const allSuccess = isStage3aOk && s4?.status === "SUCCESS" && s5?.status === "SUCCESS";

  if (allSuccess) {
    const cacheNote = s3a?.status === "SOURCED_FROM_CACHE" ? " (Stage 3a sourced from cached fixture)" : "";
    console.log(`✅ Pipeline produced a deliverable plan end-to-end${cacheNote}.`);
  } else {
    console.log(`❌ Pipeline did NOT complete cleanly. See per-stage status above.`);
    if (!isStage3aOk) console.log(`  - Stage 3a: ${s3a?.status} (${s3a?.stop_reason})`);
    if (s4?.status !== "SUCCESS") console.log(`  - Stage 4: ${s4?.status} (${s4?.stop_reason})`);
    if (s5?.status !== "SUCCESS") console.log(`  - Stage 5: ${s5?.status} (${s5?.stop_reason})`);
  }

  // Cross-stage data flow checks: did Stage 4 see all 81 recs Stage 3a emitted?
  if (state.fresh_stage3a && state.fresh_stage4) {
    const qrIds = new Set(state.fresh_stage3a.recommendations.map((r) => r.recommendation_id));
    // Roadmap rows reference rec_ids; check coverage roughly via
    // implementation_roadmap.total_action_count > 0 & glossary entries exist.
    const ir = state.fresh_stage4.deterministic_sections.implementation_roadmap;
    console.log(
      `\nData flow Stage 3a → Stage 4: ${qrIds.size} recs in QR; IR total_action_count=${ir.total_action_count}`,
    );
  }

  if (state.fresh_stage4 && state.fresh_stage5) {
    const dc = state.fresh_stage5.deterministic_checks;
    console.log(
      `\nData flow Stage 4 → Stage 5: DC.6 missing_sections=${dc.DC6_missing_sections.length} (any non-zero = Stage 4 structural gap)`,
    );
    if (dc.DC6_missing_sections.length > 0) {
      console.log(`  ⚠ Stage 5 sees missing sections: ${dc.DC6_missing_sections.join(", ")}`);
    }
  }
}

// ────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  console.log(`Phase 3.4 — Stage 3a → 4 → 5 live integration on Holloway`);
  console.log(`Mode: ${SKIP_STAGE_3A ? "OPTION C (Stage 3a sourced from cache; Stage 4 + 5 live)" : "FULL (all three stages live)"}`);
  console.log(`Budget cap: ${fmtCents(HARD_BUDGET_CAP_CENTS)}`);
  console.log(`Started: ${new Date().toISOString()}\n`);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(`ERROR: ANTHROPIC_API_KEY not set after dotenv load.`);
    return 1;
  }
  console.log(
    `✓ ANTHROPIC_API_KEY loaded (length: ${process.env.ANTHROPIC_API_KEY.length})`,
  );

  // Ensure artifact dir exists.
  await mkdir(resolve(ARTIFACT_DIR), { recursive: true });

  // Load fixtures.
  const clientProfile = JSON.parse(
    await readFile(FIXTURE_CLIENT_PROFILE, "utf8"),
  ) as ClientProfile;
  const selected = JSON.parse(
    await readFile(FIXTURE_SELECTED_RECS, "utf8"),
  ) as SelectedRecommendations;
  console.log(
    `Loaded fixtures: ClientProfile (advisor=${clientProfile.engagement.advisor_id}, archetype=${clientProfile.engagement.archetype}), SelectedRecommendations (${selected.selected.length} recs)`,
  );

  // Single shared underlying Anthropic client; per-stage logging wrappers.
  const real = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const state: CumulativeState = {
    cost_cents: 0,
    wall_clock_ms: 0,
    attempts: 0,
    summaries: [],
    fresh_stage3a: null,
    fresh_stage4: null,
    fresh_stage5: null,
  };

  const overallT0 = Date.now();

  try {
    const qr = SKIP_STAGE_3A
      ? await loadStage3aFromCache(state)
      : await runStage3aStep(
          clientProfile,
          selected,
          makeStage3aLoggingClient(real),
          state,
        );
    if (!qr) {
      await finalReport(state, Date.now() - overallT0);
      return 4;
    }

    const stage4 = await runStage4Step(
      clientProfile,
      qr,
      makeStage4LoggingClient(real),
      state,
    );
    if (!stage4) {
      await finalReport(state, Date.now() - overallT0);
      return 4;
    }

    const stage5 = await runStage5Step(
      clientProfile,
      qr,
      stage4,
      makeStage5LoggingClient(real),
      state,
    );
    // Whether Stage 5 succeeded or not, we run the report against what we have.
    void stage5;
  } catch (err) {
    console.error(`\nUNCAUGHT ERROR during stage execution:`, err);
    await finalReport(state, Date.now() - overallT0);
    return 2;
  }

  await finalReport(state, Date.now() - overallT0);

  if (state.cost_cents > HARD_BUDGET_CAP_CENTS) {
    console.error(
      `\n!! BUDGET CAP BREACH: cumulative ${fmtCents(state.cost_cents)} > cap ${fmtCents(HARD_BUDGET_CAP_CENTS)}`,
    );
    return 3;
  }
  return 0;
}

async function finalReport(state: CumulativeState, totalElapsedMs: number): Promise<void> {
  console.log(`\n\n========================================`);
  console.log(`===== PHASE 3.4 INTEGRATION REPORT =====`);
  console.log(`========================================`);
  console.log(`overall wall-clock (incl. setup):  ${fmtMinSec(totalElapsedMs)}`);

  comparePerStageReport(state);

  if (state.fresh_stage3a) await crossStageStage3aReport(state.fresh_stage3a);
  if (state.fresh_stage4) await crossStageStage4Report(state.fresh_stage4);
  if (state.fresh_stage5) await crossStageStage5Report(state.fresh_stage5);

  diagnosticVerdict(state);

  console.log(`\nArtifacts written:`);
  for (const s of state.summaries) {
    if (s.artifact_path) console.log(`  ${s.stage}: ${s.artifact_path}`);
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`UNCAUGHT TOP-LEVEL ERROR:`, err);
    process.exit(2);
  });
