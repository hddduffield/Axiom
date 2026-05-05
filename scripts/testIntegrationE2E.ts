// Phase 10B.9 — Local E2E test of the full Stage 0 → 5 pipeline.
//
// Runs the same chain that scripts/generatePending.ts runs in production,
// but against the local Holloway .docx fixture instead of a queued plan
// row. No database, no Storage — everything is on disk under
// artifacts/integration_v2/.
//
// Usage:
//   npm run test:integration:e2e
//
// Inputs:
//   tests/fixtures/Holloway_Fact_Review_FILLED.docx
//
// Outputs (all under artifacts/integration_v2/):
//   stage0.json           — Stage 0 validation report
//   stage1.json           — ClientProfile (or ClientProfileFailed)
//   stage2.json           — SelectedRecommendations (or *Failed)
//   stage3a.json          — QuantifiedRecommendations
//   stage3b.json          — SequencedPlan (or SequencedPlanFailed)
//   stage4.json           — Stage4Result (or Stage4ResultFailed)
//   stage5.json           — Stage5Result (or Stage5ResultFailed)
//   manifest.json         — per-stage cost / duration / status, cumulative
//
// Per-stage budget caps mirror generatePending.ts:
//   Stage 1:  $5
//   Stage 2:  $10
//   Stage 3a: $30
//   Stage 4:  $25
//   Stage 5:  $5
// Hard total cap per run: $150.
//
// Behavior on failure:
//   Each stage's output (success or failure envelope) is written BEFORE the
//   next stage fires, so partial runs preserve diagnostic data.
//   Per-stage cap breach: write the offending stage's output, write the
//   manifest with status="aborted_budget", exit non-zero.
//   Stage failure: write the failure envelope, write the manifest with
//   status="aborted_failure", exit non-zero.

import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import Anthropic from "@anthropic-ai/sdk";

import {
  validateFactReview,
  type Stage0LlmApiClient,
} from "../src/lib/orchestrator/glue/stage0Validator";
import {
  parseFactReview,
  type Stage1ApiClient,
} from "../src/lib/orchestrator/stages/stage1FactReviewParser";
import {
  selectRecommendations,
  type Stage2ApiClient,
} from "../src/lib/orchestrator/stages/stage2RecommendationSelector";
import { runStage3a } from "../src/lib/orchestrator/stages/stage3aOrchestration";
import type { Stage3a1ApiClient } from "../src/lib/orchestrator/stages/stage3a1BatchQuantifier";
import { assembleSequencedPlan } from "../src/lib/orchestrator/glue/stage3bAssembler";
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
} from "../src/lib/orchestrator/schemas/stage4.types";
import {
  isStage5ResultFailed,
  type Stage5Result,
} from "../src/lib/orchestrator/schemas/stage5.types";
import type {
  ClientProfile,
  ClientProfileFailed,
} from "../src/lib/orchestrator/schemas/clientProfile";
import type {
  SelectedRecommendations,
  SelectedRecommendationsFailed,
} from "../src/lib/orchestrator/schemas/selectedRecommendations";
import type {
  QuantifiedRecommendations,
  SequencedPlan,
  SequencedPlanFailed,
} from "../src/lib/orchestrator/schemas/pipelineTypes";

// ────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────

const STAGE_BUDGET_CAPS = {
  stage1: 500,
  stage2: 1000,
  stage3a: 3000,
  stage4: 2500,
  stage5: 500,
} as const;
const TOTAL_CAP_PER_RUN_CENTS = 15000;

const FIXTURE_FR = "tests/fixtures/Holloway_Fact_Review_FILLED.docx";
const ARTIFACT_DIR = "artifacts/integration_v2";
const KB_PATH = "kb/v1_2";
const ADVISOR_ID = "hayden-duffield";

const OPUS_INPUT_CENTS_PER_M = 1500;
const OPUS_OUTPUT_CENTS_PER_M = 7500;
const OPUS_CACHE_WRITE_CENTS_PER_M = 1875;
const OPUS_CACHE_READ_CENTS_PER_M = 150;

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function fmtCost(c: number): string {
  return `${c}c (~$${(c / 100).toFixed(2)})`;
}

function fmtMinSec(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${String(r).padStart(2, "0")}s`;
}

function computeOpusCost(
  inputTokens: number,
  outputTokens: number,
  cacheCreation: number,
  cacheRead: number,
): number {
  const millicentsPerToken = (centsPerM: number) => centsPerM / 1000;
  const cost =
    inputTokens * millicentsPerToken(OPUS_INPUT_CENTS_PER_M) +
    outputTokens * millicentsPerToken(OPUS_OUTPUT_CENTS_PER_M) +
    cacheCreation * millicentsPerToken(OPUS_CACHE_WRITE_CENTS_PER_M) +
    cacheRead * millicentsPerToken(OPUS_CACHE_READ_CENTS_PER_M);
  return Math.round(cost / 1000);
}

async function writeArtifact(
  filename: string,
  data: unknown,
  durationMs: number,
  costCents: number,
): Promise<void> {
  const path = resolve(ARTIFACT_DIR, filename);
  const wrapped = {
    _metadata: {
      source_input: FIXTURE_FR,
      duration_ms: durationMs,
      cost_cents: costCents,
      script: "scripts/testIntegrationE2E.ts",
      written_at: new Date().toISOString(),
    },
    result: data,
  };
  await writeFile(path, JSON.stringify(wrapped, null, 2) + "\n");
}

// ────────────────────────────────────────────────────────────────────────
// Logging API client wrappers (mirror generatePending.ts)
// ────────────────────────────────────────────────────────────────────────

function makeStage1Client(real: Anthropic): Stage1ApiClient {
  let attempt = 0;
  return {
    messages: {
      create: async (params) => {
        attempt += 1;
        const t0 = Date.now();
        console.log(`  [s1 create #${attempt}] opened`);
        const msg = await real.messages.create(params);
        const dt = Date.now() - t0;
        const ai = msg.usage?.input_tokens ?? 0;
        const ao = msg.usage?.output_tokens ?? 0;
        const cw = msg.usage?.cache_creation_input_tokens ?? 0;
        const cr = msg.usage?.cache_read_input_tokens ?? 0;
        console.log(
          `  [s1 create #${attempt}] resolved ${dt}ms in=${ai.toLocaleString()} out=${ao.toLocaleString()} cw=${cw.toLocaleString()} cr=${cr.toLocaleString()} stop=${msg.stop_reason} cost~${fmtCost(computeOpusCost(ai, ao, cw, cr))}`,
        );
        return msg;
      },
    },
  };
}

function makeStage2Client(real: Anthropic): Stage2ApiClient {
  let opened = 0;
  return {
    messages: {
      stream: (params) => {
        const id = ++opened;
        const t0 = Date.now();
        console.log(`  [s2 stream #${id}] opened`);
        const stream = real.messages.stream(params);
        return {
          finalMessage: async () => {
            const msg = await stream.finalMessage();
            const dt = Date.now() - t0;
            const ai = msg.usage?.input_tokens ?? 0;
            const ao = msg.usage?.output_tokens ?? 0;
            const cw = msg.usage?.cache_creation_input_tokens ?? 0;
            const cr = msg.usage?.cache_read_input_tokens ?? 0;
            console.log(
              `  [s2 stream #${id}] resolved ${dt}ms in=${ai.toLocaleString()} out=${ao.toLocaleString()} cw=${cw.toLocaleString()} cr=${cr.toLocaleString()} stop=${msg.stop_reason} cost~${fmtCost(computeOpusCost(ai, ao, cw, cr))}`,
            );
            return msg;
          },
        };
      },
    },
  };
}

function makeStage3aClient(real: Anthropic): Stage3a1ApiClient {
  let opened = 0;
  let resolved = 0;
  return {
    messages: {
      stream: (params) => {
        const id = ++opened;
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
            resolved += 1;
            console.log(
              `  [s3a stream #${id}, batch ${batchIndex}] resolved ${dt}ms in=${ai} out=${ao} stop=${msg.stop_reason} (${resolved}/${opened})`,
            );
            return msg;
          },
        };
      },
    },
  };
}

function makeStage4Client(real: Anthropic): Stage4ApiClient {
  let opened = 0;
  return {
    messages: {
      countTokens: async (params) => {
        const r = await real.messages.countTokens(params);
        console.log(`  [s4 countTokens] real=${r.input_tokens.toLocaleString()}`);
        return r;
      },
      stream: (params) => {
        const id = ++opened;
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
            console.log(
              `  [s4 stream #${id}, ${passLabel}] resolved ${dt}ms in=${msg.usage?.input_tokens ?? 0} out=${msg.usage?.output_tokens ?? 0} stop=${msg.stop_reason}`,
            );
            return msg;
          },
        };
      },
    },
  };
}

function makeStage5Client(real: Anthropic): Stage5ApiClient {
  let opened = 0;
  return {
    messages: {
      countTokens: async (params) => {
        const r = await real.messages.countTokens(params);
        console.log(`  [s5 countTokens] real=${r.input_tokens.toLocaleString()}`);
        return r;
      },
      stream: (params) => {
        const id = ++opened;
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
            console.log(
              `  [s5 stream #${id}, ${toolName}] resolved ${dt}ms in=${msg.usage?.input_tokens ?? 0} out=${msg.usage?.output_tokens ?? 0} stop=${msg.stop_reason}`,
            );
            return msg;
          },
        };
      },
    },
  };
}

// ────────────────────────────────────────────────────────────────────────
// Type guards
// ────────────────────────────────────────────────────────────────────────

function isStage1Failed(
  r: ClientProfile | ClientProfileFailed,
): r is ClientProfileFailed {
  return (r as { _stage_status?: string })._stage_status === "FAILED";
}

function isStage2Failed(
  r: SelectedRecommendations | SelectedRecommendationsFailed,
): r is SelectedRecommendationsFailed {
  return (r as { _stage_status?: string })._stage_status === "FAILED";
}

function isStage3bFailed(
  r: SequencedPlan | SequencedPlanFailed,
): r is SequencedPlanFailed {
  const st = (r as { _sequencer_status?: string })._sequencer_status;
  return st === "FAILED" || st === "STAGE_3B_FAILED";
}

// ────────────────────────────────────────────────────────────────────────
// Manifest
// ────────────────────────────────────────────────────────────────────────

interface StageReport {
  stage: string;
  status: "SUCCESS" | "FAILED" | "ABORTED_BUDGET";
  cost_cents: number;
  duration_ms: number;
  details: string;
}

interface Manifest {
  test: "integration_v2_holloway_e2e";
  status: "SUCCESS" | "ABORTED_FAILURE" | "ABORTED_BUDGET";
  source_fr: string;
  total_cost_cents: number;
  total_wall_clock_ms: number;
  per_stage: StageReport[];
  abort_reason: string | null;
  written_at: string;
}

async function writeManifest(m: Manifest): Promise<void> {
  await writeFile(
    resolve(ARTIFACT_DIR, "manifest.json"),
    JSON.stringify(m, null, 2) + "\n",
  );
}

// ────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ERROR: ANTHROPIC_API_KEY must be set in .env.local.");
    return 1;
  }

  await mkdir(resolve(ARTIFACT_DIR), { recursive: true });
  console.log(`Phase 10B.11 — Holloway local E2E (Stage 0 → 5)`);
  console.log(`Fixture: ${FIXTURE_FR}`);
  console.log(`Artifacts: ${ARTIFACT_DIR}`);
  console.log(`Caps: ${JSON.stringify(STAGE_BUDGET_CAPS)} | total ${TOTAL_CAP_PER_RUN_CENTS}c\n`);

  // Sanity: fixture exists.
  try {
    await readFile(resolve(FIXTURE_FR));
  } catch {
    console.error(`ERROR: fixture not found at ${FIXTURE_FR}`);
    return 2;
  }

  const real = new Anthropic({ apiKey });
  const reports: StageReport[] = [];
  let cumulative = 0;
  const overallT0 = Date.now();

  function gateFn(stageName: keyof typeof STAGE_BUDGET_CAPS, stageCost: number): string | null {
    if (stageCost > STAGE_BUDGET_CAPS[stageName]) {
      return `Stage ${stageName} cost ${fmtCost(stageCost)} exceeded its per-stage cap ${fmtCost(STAGE_BUDGET_CAPS[stageName])}`;
    }
    if (cumulative + stageCost > TOTAL_CAP_PER_RUN_CENTS) {
      return `Cumulative cost would reach ${fmtCost(cumulative + stageCost)}, exceeding the per-run cap ${fmtCost(TOTAL_CAP_PER_RUN_CENTS)}`;
    }
    return null;
  }

  async function abortBudget(stageName: string, reason: string): Promise<number> {
    console.error(`\n!! BUDGET BREACH at ${stageName}: ${reason}`);
    await writeManifest({
      test: "integration_v2_holloway_e2e",
      status: "ABORTED_BUDGET",
      source_fr: FIXTURE_FR,
      total_cost_cents: cumulative,
      total_wall_clock_ms: Date.now() - overallT0,
      per_stage: reports,
      abort_reason: reason,
      written_at: new Date().toISOString(),
    });
    return 3;
  }

  async function abortFailure(stageName: string, reason: string): Promise<number> {
    console.error(`\n!! STAGE FAILURE at ${stageName}: ${reason}`);
    await writeManifest({
      test: "integration_v2_holloway_e2e",
      status: "ABORTED_FAILURE",
      source_fr: FIXTURE_FR,
      total_cost_cents: cumulative,
      total_wall_clock_ms: Date.now() - overallT0,
      per_stage: reports,
      abort_reason: reason,
      written_at: new Date().toISOString(),
    });
    return 4;
  }

  // ────────────────────────────────────────────────────────────────────
  // Stage 0
  // ────────────────────────────────────────────────────────────────────
  console.log(`========== STAGE 0 ==========`);
  let s0t = Date.now();
  // Phase 10C.2 — Stage 0 now accepts a Haiku 4.5 fallback client.
  const stage0LlmClient: Stage0LlmApiClient = {
    messages: { create: (params) => real.messages.create(params) },
  };
  const stage0 = await validateFactReview(resolve(FIXTURE_FR), {
    apiClient: stage0LlmClient,
  });
  let s0d = Date.now() - s0t;
  await writeArtifact("stage0.json", stage0, s0d, 0);
  console.log(`Stage 0: ${stage0.status} (${stage0.failures.length} failures, ${stage0.warnings.length} warnings) ${fmtMinSec(s0d)}`);
  reports.push({
    stage: "stage0",
    status: stage0.status === "failed" ? "FAILED" : "SUCCESS",
    cost_cents: 0,
    duration_ms: s0d,
    details: `${stage0.status} — ${stage0.failures.length} failures, ${stage0.warnings.length} warnings`,
  });
  if (stage0.status === "failed") {
    return abortFailure(
      "stage0",
      stage0.failures.map((f) => f.reason).join("; "),
    );
  }

  // ────────────────────────────────────────────────────────────────────
  // Stage 1
  // ────────────────────────────────────────────────────────────────────
  console.log(`\n========== STAGE 1 ==========`);
  s0t = Date.now();
  const stage1Result = await parseFactReview(resolve(FIXTURE_FR), {
    apiClient: makeStage1Client(real),
    referenceDate: new Date(),
    maxRetries: 1,
  });
  s0d = Date.now() - s0t;
  if (isStage1Failed(stage1Result)) {
    await writeArtifact("stage1.json", stage1Result, s0d, 0);
    reports.push({ stage: "stage1", status: "FAILED", cost_cents: 0, duration_ms: s0d, details: `${stage1Result._failure_type}: ${stage1Result._failure_reason.slice(0, 200)}` });
    return abortFailure("stage1", `${stage1Result._failure_type}: ${stage1Result._failure_reason}`);
  }
  const clientProfile: ClientProfile = stage1Result;
  const stage1Cost = computeOpusCost(
    clientProfile._metadata?.input_token_count ?? 0,
    clientProfile._metadata?.output_token_count ?? 0,
    clientProfile._metadata?.cache_creation_input_tokens ?? 0,
    clientProfile._metadata?.cache_read_input_tokens ?? 0,
  );
  await writeArtifact("stage1.json", clientProfile, s0d, stage1Cost);
  const s1Breach = gateFn("stage1", stage1Cost);
  if (s1Breach) {
    cumulative += stage1Cost;
    reports.push({ stage: "stage1", status: "ABORTED_BUDGET", cost_cents: stage1Cost, duration_ms: s0d, details: s1Breach });
    return abortBudget("stage1", s1Breach);
  }
  cumulative += stage1Cost;
  reports.push({ stage: "stage1", status: "SUCCESS", cost_cents: stage1Cost, duration_ms: s0d, details: `archetype=${clientProfile.engagement?.archetype} advisor=${clientProfile.engagement?.advisor_id}` });
  console.log(`Stage 1: SUCCESS ${fmtCost(stage1Cost)} ${fmtMinSec(s0d)} | cumulative ${fmtCost(cumulative)}`);

  // ────────────────────────────────────────────────────────────────────
  // Stage 2
  // ────────────────────────────────────────────────────────────────────
  console.log(`\n========== STAGE 2 ==========`);
  s0t = Date.now();
  const stage2Result = await selectRecommendations(clientProfile, {
    apiClient: makeStage2Client(real),
    kbPath: KB_PATH,
    referenceDate: new Date(),
    landmineAuthorizations: [],
    maxRetries: 1,
  });
  s0d = Date.now() - s0t;
  if (isStage2Failed(stage2Result)) {
    await writeArtifact("stage2.json", stage2Result, s0d, 0);
    reports.push({ stage: "stage2", status: "FAILED", cost_cents: 0, duration_ms: s0d, details: `${stage2Result._failure_type}: ${stage2Result._failure_reason.slice(0, 200)}` });
    return abortFailure("stage2", `${stage2Result._failure_type}: ${stage2Result._failure_reason}`);
  }
  const selectedRecs: SelectedRecommendations = stage2Result;
  const stage2Cost = computeOpusCost(
    selectedRecs._metadata?.input_token_count ?? 0,
    selectedRecs._metadata?.output_token_count ?? 0,
    selectedRecs._metadata?.cache_creation_input_tokens ?? 0,
    selectedRecs._metadata?.cache_read_input_tokens ?? 0,
  );
  await writeArtifact("stage2.json", selectedRecs, s0d, stage2Cost);
  const s2Breach = gateFn("stage2", stage2Cost);
  if (s2Breach) {
    cumulative += stage2Cost;
    reports.push({ stage: "stage2", status: "ABORTED_BUDGET", cost_cents: stage2Cost, duration_ms: s0d, details: s2Breach });
    return abortBudget("stage2", s2Breach);
  }
  cumulative += stage2Cost;
  reports.push({ stage: "stage2", status: "SUCCESS", cost_cents: stage2Cost, duration_ms: s0d, details: `${selectedRecs.selected.length} recs selected` });
  console.log(`Stage 2: SUCCESS ${fmtCost(stage2Cost)} ${fmtMinSec(s0d)} | ${selectedRecs.selected.length} recs | cumulative ${fmtCost(cumulative)}`);

  // ────────────────────────────────────────────────────────────────────
  // Stage 3a
  // ────────────────────────────────────────────────────────────────────
  console.log(`\n========== STAGE 3a ==========`);
  s0t = Date.now();
  const stage3a: QuantifiedRecommendations = await runStage3a(
    clientProfile,
    selectedRecs,
    {
      apiClient: makeStage3aClient(real),
      kbPath: KB_PATH,
      referenceDate: new Date(),
      firmPolicyResolutions: [],
      landmineAuthorizations: [],
      maxRetriesPerBatch: 1,
    },
  );
  s0d = Date.now() - s0t;
  const stage3aCost = stage3a._metadata?.cost_cents ?? 0;
  await writeArtifact("stage3a.json", stage3a, s0d, stage3aCost);
  if (stage3a._sequencer_status === "FAILED") {
    cumulative += stage3aCost;
    reports.push({ stage: "stage3a", status: "FAILED", cost_cents: stage3aCost, duration_ms: s0d, details: (stage3a._sequencer_failures ?? []).map((f) => f.reason).join("; ") });
    return abortFailure("stage3a", `sequencer FAILED: ${(stage3a._sequencer_failures ?? []).map((f) => f.reason).join("; ")}`);
  }
  const s3aBreach = gateFn("stage3a", stage3aCost);
  if (s3aBreach) {
    cumulative += stage3aCost;
    reports.push({ stage: "stage3a", status: "ABORTED_BUDGET", cost_cents: stage3aCost, duration_ms: s0d, details: s3aBreach });
    return abortBudget("stage3a", s3aBreach);
  }
  cumulative += stage3aCost;
  reports.push({ stage: "stage3a", status: "SUCCESS", cost_cents: stage3aCost, duration_ms: s0d, details: `${stage3a.recommendations.length} recs quantified` });
  console.log(`Stage 3a: SUCCESS ${fmtCost(stage3aCost)} ${fmtMinSec(s0d)} | ${stage3a.recommendations.length} recs | cumulative ${fmtCost(cumulative)}`);

  // ────────────────────────────────────────────────────────────────────
  // Stage 3b
  // ────────────────────────────────────────────────────────────────────
  console.log(`\n========== STAGE 3b ==========`);
  s0t = Date.now();
  const sequencedPlan = assembleSequencedPlan(stage3a, selectedRecs, {
    firm_policy_resolutions: [],
    landmine_authorizations: [],
    advisor_id: ADVISOR_ID,
  });
  s0d = Date.now() - s0t;
  await writeArtifact("stage3b.json", sequencedPlan, s0d, 0);
  if (isStage3bFailed(sequencedPlan)) {
    const fails = sequencedPlan._failures ?? [];
    reports.push({ stage: "stage3b", status: "FAILED", cost_cents: 0, duration_ms: s0d, details: fails.map((f) => f.reason).join("; ") });
    return abortFailure("stage3b", `Stage 3b FAILED: ${fails.map((f) => f.reason).join("; ")}`);
  }
  reports.push({ stage: "stage3b", status: "SUCCESS", cost_cents: 0, duration_ms: s0d, details: `deterministic; ${sequencedPlan.sequenced_recommendations.length} sequenced recs` });
  console.log(`Stage 3b: SUCCESS ${fmtMinSec(s0d)} | ${sequencedPlan.sequenced_recommendations.length} sequenced recs`);

  // ────────────────────────────────────────────────────────────────────
  // Stage 4
  // ────────────────────────────────────────────────────────────────────
  console.log(`\n========== STAGE 4 ==========`);
  s0t = Date.now();
  const stage4Result = await generatePlan(clientProfile, stage3a, {
    apiClient: makeStage4Client(real),
    kbPath: KB_PATH,
    advisorId: ADVISOR_ID,
    generatedDate: new Date(),
    referenceDate: new Date(),
    maxRetries: 1,
  });
  s0d = Date.now() - s0t;
  if (isStage4ResultFailed(stage4Result)) {
    const stage4Cost = stage4Result._metadata?.cost_cents ?? 0;
    await writeArtifact("stage4.json", stage4Result, s0d, stage4Cost);
    cumulative += stage4Cost;
    reports.push({ stage: "stage4", status: "FAILED", cost_cents: stage4Cost, duration_ms: s0d, details: `${stage4Result._failure_type}: ${stage4Result._failure_reason.slice(0, 200)}` });
    return abortFailure("stage4", `${stage4Result._failure_type}: ${stage4Result._failure_reason}`);
  }
  const stage4: Stage4Result = stage4Result;
  const stage4Cost = stage4._metadata.cost_cents ?? 0;
  await writeArtifact("stage4.json", stage4, s0d, stage4Cost);
  const s4Breach = gateFn("stage4", stage4Cost);
  if (s4Breach) {
    cumulative += stage4Cost;
    reports.push({ stage: "stage4", status: "ABORTED_BUDGET", cost_cents: stage4Cost, duration_ms: s0d, details: s4Breach });
    return abortBudget("stage4", s4Breach);
  }
  cumulative += stage4Cost;
  reports.push({ stage: "stage4", status: "SUCCESS", cost_cents: stage4Cost, duration_ms: s0d, details: `plan body generated` });
  console.log(`Stage 4: SUCCESS ${fmtCost(stage4Cost)} ${fmtMinSec(s0d)} | cumulative ${fmtCost(cumulative)}`);

  // ────────────────────────────────────────────────────────────────────
  // Stage 5
  // ────────────────────────────────────────────────────────────────────
  console.log(`\n========== STAGE 5 ==========`);
  s0t = Date.now();
  const stage5Result = await auditPlan(stage4, stage3a, clientProfile, {
    apiClient: makeStage5Client(real),
    kbPath: KB_PATH,
    advisorId: ADVISOR_ID,
    referenceDate: new Date(),
    maxRetries: 1,
    runLlmChecks: true,
  });
  s0d = Date.now() - s0t;
  if (isStage5ResultFailed(stage5Result)) {
    const stage5Cost = stage5Result._metadata?.cost_cents ?? 0;
    await writeArtifact("stage5.json", stage5Result, s0d, stage5Cost);
    cumulative += stage5Cost;
    reports.push({ stage: "stage5", status: "FAILED", cost_cents: stage5Cost, duration_ms: s0d, details: `${stage5Result._failure_type}: ${stage5Result._failure_reason.slice(0, 200)}` });
    return abortFailure("stage5", `${stage5Result._failure_type}: ${stage5Result._failure_reason}`);
  }
  const stage5: Stage5Result = stage5Result;
  const stage5Cost = stage5._metadata.cost_cents ?? 0;
  await writeArtifact("stage5.json", stage5, s0d, stage5Cost);
  const s5Breach = gateFn("stage5", stage5Cost);
  if (s5Breach) {
    cumulative += stage5Cost;
    reports.push({ stage: "stage5", status: "ABORTED_BUDGET", cost_cents: stage5Cost, duration_ms: s0d, details: s5Breach });
    return abortBudget("stage5", s5Breach);
  }
  cumulative += stage5Cost;
  reports.push({ stage: "stage5", status: "SUCCESS", cost_cents: stage5Cost, duration_ms: s0d, details: `${stage5.findings.length} findings` });
  console.log(`Stage 5: SUCCESS ${fmtCost(stage5Cost)} ${fmtMinSec(s0d)} | ${stage5.findings.length} findings | cumulative ${fmtCost(cumulative)}`);

  // ────────────────────────────────────────────────────────────────────
  // Final manifest
  // ────────────────────────────────────────────────────────────────────
  const totalMs = Date.now() - overallT0;
  await writeManifest({
    test: "integration_v2_holloway_e2e",
    status: "SUCCESS",
    source_fr: FIXTURE_FR,
    total_cost_cents: cumulative,
    total_wall_clock_ms: totalMs,
    per_stage: reports,
    abort_reason: null,
    written_at: new Date().toISOString(),
  });

  console.log(`\n\n=========================================`);
  console.log(`✓ HOLLOWAY E2E PIPELINE — SUCCESS`);
  console.log(`=========================================`);
  console.log(`Total cost:       ${fmtCost(cumulative)}`);
  console.log(`Total wall clock: ${fmtMinSec(totalMs)}`);
  console.log(`Artifacts:        ${ARTIFACT_DIR}/`);
  console.log(`\nPer-stage:`);
  for (const r of reports) {
    console.log(
      `  ${r.stage.padEnd(8)}  ${r.status.padEnd(15)}  ${fmtCost(r.cost_cents).padEnd(16)}  ${fmtMinSec(r.duration_ms)}  ${r.details}`,
    );
  }
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("UNCAUGHT TOP-LEVEL ERROR:", err);
    process.exit(2);
  });
