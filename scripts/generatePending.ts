// Phase 10B.5 — manual CLI processor for queued plan generations.
//
// Usage:
//   npm run generate-pending
//
// v1.5 chains the full pipeline Stage 0 → 1 → 2 → 3a → 3b → 4 → 5.
// Mode is chosen by which inputs the queued plan row carries:
//
//   FR mode (default):
//     plan.input_fact_review_path is set; the .docx/.pdf is in Storage.
//     CLI runs Stage 0 (re-validate, diagnostic) → Stage 1 (parse) →
//     Stage 2 (select) → Stage 3a → 3b (assemble, sanity check) → 4 → 5.
//
//   JSON fallback mode (power-user):
//     plan.input_clientprofile_path + plan.input_selected_recs_path are set
//     and plan.input_fact_review_path is NULL. CLI skips Stages 1 + 2 and
//     runs Stage 3a → 3b → 4 → 5 against the uploaded JSONs.
//
// Per-stage budget caps (in cents):
//   Stage 1:  500
//   Stage 2:  1000
//   Stage 3a: 3000
//   Stage 4:  2500
//   Stage 5:  500
//   Total cap per run: 15000 ($150)
//
// Skip-on-cache: each stage checks if its prior output is already persisted
// (DB column or Storage path). On hit, the stage is skipped and the cached
// output is used downstream — no LLM call, no cost. This makes a re-claim
// after a partial failure idempotent for already-completed stages.
//
// On any cap breach, fatal failure, or thrown error: catch, persist partial
// outputs to the plan row, set status='failed' with failure_reason, exit
// non-zero.

import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });

import { mkdtemp, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

import { validateFactReview } from "../src/lib/orchestrator/glue/stage0Validator";
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
import type { Database } from "../src/lib/supabase/database.types";
import type { QuantifiedRecommendations } from "../src/lib/orchestrator/schemas/pipelineTypes";

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

// ────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────

const STAGE_BUDGET_CAPS = {
  stage1: 500,    // $5
  stage2: 1000,   // $10
  stage3a: 3000,  // $30
  stage4: 2500,   // $25
  stage5: 500,    // $5
} as const;
const TOTAL_CAP_PER_RUN_CENTS = 15000; // $150

const STORAGE_BUCKET = "plan-inputs";

// Opus 4.7 token pricing — mirrors the constants in stage3a1BatchQuantifier.
// Used for Stage 1 + Stage 2 cost computation (those stages don't ship
// their own cost_cents in the response shape).
const OPUS_INPUT_CENTS_PER_M = 1500;
const OPUS_OUTPUT_CENTS_PER_M = 7500;
const OPUS_CACHE_WRITE_CENTS_PER_M = 1875;
const OPUS_CACHE_READ_CENTS_PER_M = 150;

// ────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────

type PlanRow = Database["public"]["Tables"]["plans"]["Row"];
type SupabaseAdmin = ReturnType<typeof createClient<Database>>;

interface PartialOutputs {
  stage3a?: QuantifiedRecommendations;
  stage4?: Stage4Result;
  stage5?: Stage5Result;
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function fmtCost(cents: number): string {
  return `${cents}c (~$${(cents / 100).toFixed(2)})`;
}

function stripBucketPrefix(path: string): string {
  const prefix = `${STORAGE_BUCKET}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
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

// Map an advisors row to the KB advisor_id slug. Falls back to the v1
// default ("hayden-duffield") if the slug doesn't match a known KB id.
function resolveKbAdvisorId(
  first_name: string | null | undefined,
  last_name: string | null | undefined,
  email: string | null | undefined,
): string {
  const KNOWN_KB_IDS = ["hayden-duffield", "will-bearden", "third-advisor-placeholder"];
  if (first_name && last_name) {
    const slug = `${first_name}-${last_name}`
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    if (KNOWN_KB_IDS.includes(slug)) return slug;
  }
  if (email) {
    const local = email.split("@")[0];
    const slug = local.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
    const match = KNOWN_KB_IDS.find((k) => k.startsWith(slug));
    if (match) return match;
  }
  return "hayden-duffield";
}

async function fetchAdvisorKbId(
  admin: SupabaseAdmin,
  advisorId: string,
): Promise<string> {
  const { data } = await admin
    .from("advisors")
    .select("first_name, last_name, email")
    .eq("id", advisorId)
    .maybeSingle();
  return resolveKbAdvisorId(data?.first_name, data?.last_name, data?.email);
}

// ────────────────────────────────────────────────────────────────────────
// Storage helpers
// ────────────────────────────────────────────────────────────────────────

async function downloadJsonRaw<T>(
  admin: SupabaseAdmin,
  fullPath: string,
  label: string,
): Promise<T> {
  const objectPath = stripBucketPrefix(fullPath);
  const { data, error } = await admin.storage.from(STORAGE_BUCKET).download(objectPath);
  if (error) throw new Error(`Storage download failed for ${label} (${objectPath}): ${error.message}`);
  const text = await data.text();
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    throw new Error(`JSON parse failed for ${label}: ${(e as Error).message}`);
  }
}

async function uploadJson(
  admin: SupabaseAdmin,
  objectPath: string,
  payload: unknown,
): Promise<void> {
  const { error } = await admin.storage
    .from(STORAGE_BUCKET)
    .upload(objectPath, JSON.stringify(payload), {
      contentType: "application/json",
      upsert: true,
    });
  if (error) throw new Error(`Storage upload failed for ${objectPath}: ${error.message}`);
}

async function downloadFrToTmp(
  admin: SupabaseAdmin,
  fullPath: string,
): Promise<{ tmpPath: string; cleanup: () => Promise<void> }> {
  const objectPath = stripBucketPrefix(fullPath);
  const { data, error } = await admin.storage.from(STORAGE_BUCKET).download(objectPath);
  if (error) throw new Error(`Storage download failed for FR (${objectPath}): ${error.message}`);
  const buffer = Buffer.from(await data.arrayBuffer());
  const ext = objectPath.slice(objectPath.lastIndexOf(".")) || ".docx";
  const dir = await mkdtemp(join(tmpdir(), "plan-fr-cli-"));
  const tmpPath = join(dir, `fact_review${ext}`);
  await writeFile(tmpPath, buffer);
  return {
    tmpPath,
    cleanup: async () => {
      try {
        await unlink(tmpPath);
      } catch {
        /* ignore */
      }
    },
  };
}

// ────────────────────────────────────────────────────────────────────────
// Plan claim + DB helpers
// ────────────────────────────────────────────────────────────────────────

async function claimNextPlan(admin: SupabaseAdmin): Promise<PlanRow | null> {
  const { data: candidate, error: selectErr } = await admin
    .from("plans")
    .select("id")
    .eq("status", "queued")
    .order("generated_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (selectErr) throw new Error(`Could not select queued plan: ${selectErr.message}`);
  if (!candidate) return null;

  const { data: claimed, error: claimErr } = await admin
    .from("plans")
    .update({ status: "processing", processing_started_at: new Date().toISOString() })
    .eq("id", candidate.id)
    .eq("status", "queued")
    .select("*")
    .maybeSingle();
  if (claimErr) throw new Error(`Could not claim plan ${candidate.id}: ${claimErr.message}`);
  return claimed;
}

async function markFailed(
  admin: SupabaseAdmin,
  planId: string,
  reason: string,
  costCents: number,
  partial: PartialOutputs,
): Promise<void> {
  const update: Database["public"]["Tables"]["plans"]["Update"] = {
    status: "failed",
    failure_reason: reason,
    processing_completed_at: new Date().toISOString(),
    cost_cents: costCents > 0 ? costCents : null,
  };
  if (partial.stage3a)
    update.stage3a_output = partial.stage3a as unknown as Database["public"]["Tables"]["plans"]["Update"]["stage3a_output"];
  if (partial.stage4)
    update.stage4_output = partial.stage4 as unknown as Database["public"]["Tables"]["plans"]["Update"]["stage4_output"];
  if (partial.stage5)
    update.stage5_output = partial.stage5 as unknown as Database["public"]["Tables"]["plans"]["Update"]["stage5_output"];
  await admin.from("plans").update(update).eq("id", planId);
}

// ────────────────────────────────────────────────────────────────────────
// Stage 0/1/2 wrappers: run, persist, return result
// ────────────────────────────────────────────────────────────────────────

interface StageGate {
  name: keyof typeof STAGE_BUDGET_CAPS | "stage0";
  cap: number; // cents; 0 means deterministic / no LLM cost
}

function gateOrAbort(
  cumulativeCost: number,
  stageCost: number,
  gate: StageGate,
): { ok: true } | { ok: false; reason: string } {
  // Per-stage cap check.
  if (gate.cap > 0 && stageCost > gate.cap) {
    return {
      ok: false,
      reason: `Stage ${gate.name} cost ${fmtCost(stageCost)} exceeded its per-stage cap ${fmtCost(gate.cap)}`,
    };
  }
  // Total per-run cap check.
  const projected = cumulativeCost + stageCost;
  if (projected > TOTAL_CAP_PER_RUN_CENTS) {
    return {
      ok: false,
      reason: `Cumulative cost would reach ${fmtCost(projected)}, exceeding the per-run cap ${fmtCost(TOTAL_CAP_PER_RUN_CENTS)}`,
    };
  }
  return { ok: true };
}

// ────────────────────────────────────────────────────────────────────────
// Plan processing
// ────────────────────────────────────────────────────────────────────────

async function processPlan(admin: SupabaseAdmin, plan: PlanRow): Promise<number> {
  const overallT0 = Date.now();
  console.log(`\n=== Processing plan ${plan.id} (client_id=${plan.client_id}) ===`);
  console.log(`fact_review_filename: ${plan.fact_review_filename ?? "<unset>"}`);

  const real = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Resolve advisor identity for Stage 4.
  const kbAdvisorId = await fetchAdvisorKbId(admin, plan.generated_by_advisor_id);
  console.log(`Stage 4 advisor identity: ${kbAdvisorId} (resolved from ${plan.generated_by_advisor_id})`);

  // Determine pipeline mode.
  const hasFrUpload = !!plan.input_fact_review_path;
  const hasJsonFallback =
    !!plan.input_clientprofile_path && !!plan.input_selected_recs_path;
  if (!hasFrUpload && !hasJsonFallback) {
    const reason = `Plan is missing inputs — neither input_fact_review_path nor (input_clientprofile_path + input_selected_recs_path) are set.`;
    await markFailed(admin, plan.id, reason, 0, {});
    throw new Error(reason);
  }
  console.log(
    `Pipeline mode: ${hasFrUpload ? "FR upload (Stage 0→5)" : "JSON fallback (Stage 3a→5; skips 1+2)"}`,
  );

  // Cumulative cost honors prior attempts so re-claims can't burn 2× the cap.
  let cumulativeCost = plan.cost_cents ?? 0;
  console.log(`Starting cumulative cost: ${fmtCost(cumulativeCost)} (cap ${fmtCost(TOTAL_CAP_PER_RUN_CENTS)})`);

  // ────────────────────────────────────────────────────────────────────
  // Stage 0 — re-run for diagnostic (FR mode only). Already gated
  // server-side at submission; re-running here surfaces volatile-rates
  // staleness drift, but does NOT block.
  // ────────────────────────────────────────────────────────────────────
  let cleanupFr: (() => Promise<void>) | null = null;
  let frTmpPath: string | null = null;
  if (hasFrUpload) {
    console.log("\n--- Stage 0 (re-validate; diagnostic only) ---");
    const dl = await downloadFrToTmp(admin, plan.input_fact_review_path!);
    frTmpPath = dl.tmpPath;
    cleanupFr = dl.cleanup;
    const stage0 = await validateFactReview(frTmpPath);
    console.log(`Stage 0: ${stage0.status} (${stage0.failures.length} failures, ${stage0.warnings.length} warnings)`);
    if (stage0.status === "failed") {
      console.warn(
        `Stage 0 reports failed (form-side gate was bypassed?). Failures: ${stage0.failures.map((f) => f.reason).join("; ")}`,
      );
      // Honor the diagnostic — abort with clear reason. Form-side preflight
      // should have caught this; this is the second line of defence.
      const reason = `Stage 0 re-validation failed at CLI: ${stage0.failures.map((f) => f.reason).join("; ")}`;
      await markFailed(admin, plan.id, reason, cumulativeCost, {});
      if (cleanupFr) await cleanupFr();
      throw new Error(reason);
    }
  }

  try {
    // ──────────────────────────────────────────────────────────────────
    // Stage 1 — Fact Review parser (FR mode only; cached → skip)
    // ──────────────────────────────────────────────────────────────────
    let clientProfile: ClientProfile;

    if (!hasFrUpload) {
      // JSON fallback mode — load ClientProfile from Storage.
      console.log("\n--- Stage 1 (skipped — JSON fallback mode) ---");
      clientProfile = await downloadJsonRaw<ClientProfile>(
        admin,
        plan.input_clientprofile_path!,
        "clientprofile",
      );
      console.log(`  Loaded ClientProfile (advisor=${clientProfile.engagement?.advisor_id ?? "?"}, archetype=${clientProfile.engagement?.archetype ?? "?"})`);
    } else if (plan.stage1_output !== null && plan.input_clientprofile_path) {
      // Cache hit — Stage 1 already ran on a prior attempt.
      console.log(`\n--- Stage 1 (cached from prior attempt; cumulativeCost=${fmtCost(cumulativeCost)}) ---`);
      clientProfile = plan.stage1_output as unknown as ClientProfile;
      console.log(`  Loaded ClientProfile from plan.stage1_output (no LLM cost)`);
    } else {
      // Live Stage 1 run.
      console.log("\n--- Stage 1 (live) ---");
      const gateBefore = gateOrAbort(cumulativeCost, 0, { name: "stage1", cap: STAGE_BUDGET_CAPS.stage1 });
      if (!gateBefore.ok) {
        await markFailed(admin, plan.id, gateBefore.reason, cumulativeCost, {});
        throw new Error(gateBefore.reason);
      }
      const result = await parseFactReview(frTmpPath!, {
        apiClient: makeStage1ApiClient(real),
        referenceDate: new Date(),
        maxRetries: 1,
      });
      if (isStage1Failed(result)) {
        const reason = `Stage 1 FAILED: ${result._failure_type} — ${result._failure_reason}`;
        // Persist failed envelope.
        await admin
          .from("plans")
          .update({
            stage1_output: result as unknown as Database["public"]["Tables"]["plans"]["Update"]["stage1_output"],
          })
          .eq("id", plan.id);
        await markFailed(admin, plan.id, reason, cumulativeCost, {});
        throw new Error(reason);
      }
      clientProfile = result;
      const stage1Cost = computeOpusCost(
        clientProfile._metadata?.input_token_count ?? 0,
        clientProfile._metadata?.output_token_count ?? 0,
        clientProfile._metadata?.cache_creation_input_tokens ?? 0,
        clientProfile._metadata?.cache_read_input_tokens ?? 0,
      );
      const gateAfter = gateOrAbort(cumulativeCost, stage1Cost, { name: "stage1", cap: STAGE_BUDGET_CAPS.stage1 });
      if (!gateAfter.ok) {
        // Cap breach ON THE STAGE'S OWN COST — abort + persist what we have.
        await admin
          .from("plans")
          .update({
            stage1_output: clientProfile as unknown as Database["public"]["Tables"]["plans"]["Update"]["stage1_output"],
            cost_cents: cumulativeCost + stage1Cost,
          })
          .eq("id", plan.id);
        await markFailed(admin, plan.id, gateAfter.reason, cumulativeCost + stage1Cost, {});
        throw new Error(gateAfter.reason);
      }
      cumulativeCost += stage1Cost;
      console.log(`Stage 1 done: ${fmtCost(stage1Cost)} (cumulative ${fmtCost(cumulativeCost)})`);

      // Persist Stage 1 output to BOTH JSONB column AND Storage. Storage upload
      // uses upsert: true so re-running overwrites cleanly.
      const cpObjectPath = `${plan.id}/clientprofile.json`;
      await uploadJson(admin, cpObjectPath, clientProfile);
      await admin
        .from("plans")
        .update({
          stage1_output: clientProfile as unknown as Database["public"]["Tables"]["plans"]["Update"]["stage1_output"],
          input_clientprofile_path: `${STORAGE_BUCKET}/${cpObjectPath}`,
          cost_cents: cumulativeCost,
        })
        .eq("id", plan.id);
    }

    // ──────────────────────────────────────────────────────────────────
    // Stage 2 — Recommendation selector (FR mode only; cached → skip)
    // ──────────────────────────────────────────────────────────────────
    let selectedRecs: SelectedRecommendations;

    if (!hasFrUpload) {
      console.log("\n--- Stage 2 (skipped — JSON fallback mode) ---");
      selectedRecs = await downloadJsonRaw<SelectedRecommendations>(
        admin,
        plan.input_selected_recs_path!,
        "selected_recommendations",
      );
      console.log(`  Loaded SelectedRecommendations (${selectedRecs.selected.length} recs, no LLM cost)`);
    } else if (plan.input_selected_recs_path) {
      console.log(`\n--- Stage 2 (cached from prior attempt) ---`);
      selectedRecs = await downloadJsonRaw<SelectedRecommendations>(
        admin,
        plan.input_selected_recs_path,
        "selected_recommendations",
      );
      console.log(`  Loaded ${selectedRecs.selected.length} recs from cached path (no LLM cost)`);
    } else {
      console.log("\n--- Stage 2 (live) ---");
      const gateBefore = gateOrAbort(cumulativeCost, 0, { name: "stage2", cap: STAGE_BUDGET_CAPS.stage2 });
      if (!gateBefore.ok) {
        await markFailed(admin, plan.id, gateBefore.reason, cumulativeCost, {});
        throw new Error(gateBefore.reason);
      }
      const result = await selectRecommendations(clientProfile, {
        apiClient: makeStage2ApiClient(real),
        kbPath: "kb/v1_2",
        referenceDate: new Date(),
        landmineAuthorizations: [],
        maxRetries: 1,
      });
      if (isStage2Failed(result)) {
        const reason = `Stage 2 FAILED: ${result._failure_type} — ${result._failure_reason}`;
        await markFailed(admin, plan.id, reason, cumulativeCost, {});
        throw new Error(reason);
      }
      selectedRecs = result;
      const stage2Cost = computeOpusCost(
        selectedRecs._metadata?.input_token_count ?? 0,
        selectedRecs._metadata?.output_token_count ?? 0,
        selectedRecs._metadata?.cache_creation_input_tokens ?? 0,
        selectedRecs._metadata?.cache_read_input_tokens ?? 0,
      );
      const gateAfter = gateOrAbort(cumulativeCost, stage2Cost, { name: "stage2", cap: STAGE_BUDGET_CAPS.stage2 });
      if (!gateAfter.ok) {
        const recsObjectPath = `${plan.id}/selected_recs.json`;
        await uploadJson(admin, recsObjectPath, selectedRecs);
        await admin
          .from("plans")
          .update({
            input_selected_recs_path: `${STORAGE_BUCKET}/${recsObjectPath}`,
            cost_cents: cumulativeCost + stage2Cost,
          })
          .eq("id", plan.id);
        await markFailed(admin, plan.id, gateAfter.reason, cumulativeCost + stage2Cost, {});
        throw new Error(gateAfter.reason);
      }
      cumulativeCost += stage2Cost;
      console.log(`Stage 2 done: ${selectedRecs.selected.length} recs, ${fmtCost(stage2Cost)} (cumulative ${fmtCost(cumulativeCost)})`);

      const recsObjectPath = `${plan.id}/selected_recs.json`;
      await uploadJson(admin, recsObjectPath, selectedRecs);
      await admin
        .from("plans")
        .update({
          input_selected_recs_path: `${STORAGE_BUCKET}/${recsObjectPath}`,
          cost_cents: cumulativeCost,
        })
        .eq("id", plan.id);
    }

    // ──────────────────────────────────────────────────────────────────
    // Stage 3a — Quantification (cached → skip)
    // ──────────────────────────────────────────────────────────────────
    let stage3a: QuantifiedRecommendations;
    if (plan.stage3a_output !== null) {
      console.log(`\n--- Stage 3a (cached from prior attempt; cumulativeCost=${fmtCost(cumulativeCost)}) ---`);
      stage3a = plan.stage3a_output as unknown as QuantifiedRecommendations;
      console.log(`  Loaded ${stage3a.recommendations.length} recs from plan.stage3a_output`);
    } else {
      console.log("\n--- Stage 3a (live) ---");
      const gateBefore = gateOrAbort(cumulativeCost, 0, { name: "stage3a", cap: STAGE_BUDGET_CAPS.stage3a });
      if (!gateBefore.ok) {
        await markFailed(admin, plan.id, gateBefore.reason, cumulativeCost, {});
        throw new Error(gateBefore.reason);
      }
      stage3a = await runStage3a(clientProfile, selectedRecs, {
        apiClient: makeStage3aApiClient(real),
        kbPath: "kb/v1_2",
        referenceDate: new Date(),
        firmPolicyResolutions: [],
        landmineAuthorizations: [],
        maxRetriesPerBatch: 1,
      });
      const stage3aCost = stage3a._metadata?.cost_cents ?? 0;
      const gateAfter = gateOrAbort(cumulativeCost, stage3aCost, { name: "stage3a", cap: STAGE_BUDGET_CAPS.stage3a });
      if (!gateAfter.ok) {
        await admin
          .from("plans")
          .update({
            stage3a_output: stage3a as unknown as Database["public"]["Tables"]["plans"]["Update"]["stage3a_output"],
            cost_cents: cumulativeCost + stage3aCost,
          })
          .eq("id", plan.id);
        await markFailed(admin, plan.id, gateAfter.reason, cumulativeCost + stage3aCost, { stage3a });
        throw new Error(gateAfter.reason);
      }
      cumulativeCost += stage3aCost;
      console.log(`Stage 3a done: ${stage3a.recommendations.length} recs, ${fmtCost(stage3aCost)} (cumulative ${fmtCost(cumulativeCost)})`);
      await admin
        .from("plans")
        .update({
          stage3a_output: stage3a as unknown as Database["public"]["Tables"]["plans"]["Update"]["stage3a_output"],
          cost_cents: cumulativeCost,
        })
        .eq("id", plan.id);
      if (stage3a._sequencer_status === "FAILED") {
        const reason = `Stage 3a sequencer FAILED: ${(stage3a._sequencer_failures ?? []).map((f) => f.reason).join("; ")}`;
        await markFailed(admin, plan.id, reason, cumulativeCost, { stage3a });
        throw new Error(reason);
      }
    }

    // ──────────────────────────────────────────────────────────────────
    // Stage 3b — Deterministic assembler (sanity check; no LLM cost)
    // ──────────────────────────────────────────────────────────────────
    console.log("\n--- Stage 3b (deterministic assembler; sanity check) ---");
    const sequencedPlan = assembleSequencedPlan(stage3a, selectedRecs, {
      firm_policy_resolutions: [],
      landmine_authorizations: [],
      advisor_id: kbAdvisorId,
    });
    if ("_sequencer_status" in sequencedPlan && sequencedPlan._sequencer_status !== undefined) {
      const status = (sequencedPlan as { _sequencer_status: string })._sequencer_status;
      if (status === "FAILED" || status === "STAGE_3B_FAILED") {
        const failures = (sequencedPlan as { _failures?: Array<{ reason?: string }> })._failures ?? [];
        const reason = `Stage 3b FAILED: ${failures.map((f) => f.reason).join("; ")}`;
        await markFailed(admin, plan.id, reason, cumulativeCost, { stage3a });
        throw new Error(reason);
      }
    }
    console.log(`Stage 3b passed: deterministic assembler validated dependency graph + cluster compaction`);

    // ──────────────────────────────────────────────────────────────────
    // Stage 4 — Plan body generation (Stage 4 reads QR directly,
    // not the SequencedPlan from Stage 3b — preserves the existing path)
    // ──────────────────────────────────────────────────────────────────
    let stage4: Stage4Result | undefined;
    console.log("\n--- Stage 4 (live) ---");
    const stage4GateBefore = gateOrAbort(cumulativeCost, 0, { name: "stage4", cap: STAGE_BUDGET_CAPS.stage4 });
    if (!stage4GateBefore.ok) {
      await markFailed(admin, plan.id, stage4GateBefore.reason, cumulativeCost, { stage3a });
      throw new Error(stage4GateBefore.reason);
    }
    const stage4Result = await generatePlan(clientProfile, stage3a, {
      apiClient: makeStage4ApiClient(real),
      kbPath: "kb/v1_2",
      advisorId: kbAdvisorId,
      generatedDate: new Date(),
      referenceDate: new Date(),
      maxRetries: 1,
    });
    if (isStage4ResultFailed(stage4Result)) {
      cumulativeCost += stage4Result._metadata?.cost_cents ?? 0;
      const reason = `Stage 4 FAILED: ${stage4Result._failure_type} — ${stage4Result._failure_reason}`;
      await admin
        .from("plans")
        .update({
          stage4_output: stage4Result as unknown as Database["public"]["Tables"]["plans"]["Update"]["stage4_output"],
        })
        .eq("id", plan.id);
      await markFailed(admin, plan.id, reason, cumulativeCost, { stage3a });
      throw new Error(reason);
    }
    stage4 = stage4Result;
    const stage4Cost = stage4._metadata.cost_cents ?? 0;
    const stage4GateAfter = gateOrAbort(cumulativeCost, stage4Cost, { name: "stage4", cap: STAGE_BUDGET_CAPS.stage4 });
    if (!stage4GateAfter.ok) {
      await admin
        .from("plans")
        .update({
          stage4_output: stage4 as unknown as Database["public"]["Tables"]["plans"]["Update"]["stage4_output"],
          cost_cents: cumulativeCost + stage4Cost,
        })
        .eq("id", plan.id);
      await markFailed(admin, plan.id, stage4GateAfter.reason, cumulativeCost + stage4Cost, { stage3a, stage4 });
      throw new Error(stage4GateAfter.reason);
    }
    cumulativeCost += stage4Cost;
    console.log(`Stage 4 done: ${fmtCost(stage4Cost)} (cumulative ${fmtCost(cumulativeCost)})`);
    await admin
      .from("plans")
      .update({
        stage4_output: stage4 as unknown as Database["public"]["Tables"]["plans"]["Update"]["stage4_output"],
        cost_cents: cumulativeCost,
      })
      .eq("id", plan.id);

    // ──────────────────────────────────────────────────────────────────
    // Stage 5 — Coherence audit
    // ──────────────────────────────────────────────────────────────────
    console.log("\n--- Stage 5 (live) ---");
    const stage5GateBefore = gateOrAbort(cumulativeCost, 0, { name: "stage5", cap: STAGE_BUDGET_CAPS.stage5 });
    if (!stage5GateBefore.ok) {
      await markFailed(admin, plan.id, stage5GateBefore.reason, cumulativeCost, { stage3a, stage4 });
      throw new Error(stage5GateBefore.reason);
    }
    const stage5Result = await auditPlan(stage4, stage3a, clientProfile, {
      apiClient: makeStage5ApiClient(real),
      kbPath: "kb/v1_2",
      advisorId: kbAdvisorId,
      referenceDate: new Date(),
      maxRetries: 1,
      runLlmChecks: true,
    });
    if (isStage5ResultFailed(stage5Result)) {
      cumulativeCost += stage5Result._metadata?.cost_cents ?? 0;
      const reason = `Stage 5 FAILED: ${stage5Result._failure_type} — ${stage5Result._failure_reason}`;
      await admin
        .from("plans")
        .update({
          stage5_output: stage5Result as unknown as Database["public"]["Tables"]["plans"]["Update"]["stage5_output"],
        })
        .eq("id", plan.id);
      await markFailed(admin, plan.id, reason, cumulativeCost, { stage3a, stage4 });
      throw new Error(reason);
    }
    const stage5Cost = stage5Result._metadata.cost_cents ?? 0;
    const stage5GateAfter = gateOrAbort(cumulativeCost, stage5Cost, { name: "stage5", cap: STAGE_BUDGET_CAPS.stage5 });
    if (!stage5GateAfter.ok) {
      await admin
        .from("plans")
        .update({
          stage5_output: stage5Result as unknown as Database["public"]["Tables"]["plans"]["Update"]["stage5_output"],
          cost_cents: cumulativeCost + stage5Cost,
        })
        .eq("id", plan.id);
      await markFailed(admin, plan.id, stage5GateAfter.reason, cumulativeCost + stage5Cost, { stage3a, stage4, stage5: stage5Result });
      throw new Error(stage5GateAfter.reason);
    }
    cumulativeCost += stage5Cost;
    console.log(`Stage 5 done: ${stage5Result.findings.length} findings, ${fmtCost(stage5Cost)} (cumulative ${fmtCost(cumulativeCost)})`);

    // Final write — flip to ready_for_review.
    await admin
      .from("plans")
      .update({
        status: "ready_for_review",
        stage5_output: stage5Result as unknown as Database["public"]["Tables"]["plans"]["Update"]["stage5_output"],
        cost_cents: cumulativeCost,
        processing_completed_at: new Date().toISOString(),
      })
      .eq("id", plan.id);

    const wallSec = ((Date.now() - overallT0) / 1000).toFixed(1);
    console.log(
      `\n✓ Plan ${plan.id} ready_for_review. Total cost: ${fmtCost(cumulativeCost)} | wall-clock ${wallSec}s`,
    );
    return cumulativeCost;
  } finally {
    if (cleanupFr) await cleanupFr();
  }
}

// ────────────────────────────────────────────────────────────────────────
// Per-stage API client wrappers — Phase 10B.5 ships pass-through wrappers
// for Stage 1 + Stage 2; Phase 10B.6 will replace these with logging
// versions that mirror makeStage3aApiClient.
// ────────────────────────────────────────────────────────────────────────

function makeStage1ApiClient(real: Anthropic): Stage1ApiClient {
  return {
    messages: {
      create: (params) => real.messages.create(params),
    },
  };
}

function makeStage2ApiClient(real: Anthropic): Stage2ApiClient {
  return {
    messages: {
      stream: (params) => real.messages.stream(params),
    },
  };
}

function makeStage3aApiClient(real: Anthropic): Stage3a1ApiClient {
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

function makeStage4ApiClient(real: Anthropic): Stage4ApiClient {
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

function makeStage5ApiClient(real: Anthropic): Stage5ApiClient {
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
// Main
// ────────────────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!url || !serviceKey) {
    console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local.");
    return 1;
  }
  if (!apiKey) {
    console.error("ERROR: ANTHROPIC_API_KEY must be set in .env.local.");
    return 1;
  }

  const admin = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log("Looking for queued plans...");
  let plan: PlanRow | null;
  try {
    plan = await claimNextPlan(admin);
  } catch (e) {
    console.error(`Claim failed: ${(e as Error).message}`);
    return 2;
  }
  if (!plan) {
    console.log("No pending plans. Exiting.");
    return 0;
  }

  console.log(`Claimed plan ${plan.id}.`);
  try {
    const cost = await processPlan(admin, plan);
    if (cost > TOTAL_CAP_PER_RUN_CENTS) {
      console.warn(
        `\n!! Cumulative cost ${fmtCost(cost)} exceeded cap ${fmtCost(TOTAL_CAP_PER_RUN_CENTS)}. Plan is ready_for_review but flagged for review.`,
      );
    }
    return 0;
  } catch (e) {
    const reason = (e as Error).message;
    console.error(`\n✗ Plan ${plan.id} processing FAILED: ${reason}`);
    const { data: current } = await admin.from("plans").select("status").eq("id", plan.id).maybeSingle();
    if (current?.status === "processing") {
      await markFailed(admin, plan.id, `Uncaught: ${reason}`, 0, {});
    }
    return 3;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("UNCAUGHT TOP-LEVEL ERROR:", err);
    process.exit(2);
  });
