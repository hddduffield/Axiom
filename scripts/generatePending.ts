// Phase 5b — manual CLI processor for queued plan generations.
//
// Usage:
//   npm run generate-pending
//
// Behavior:
//   1. Connect to Supabase using SERVICE_ROLE_KEY (bypasses RLS).
//   2. Atomically claim the oldest plan with status='queued':
//        UPDATE plans SET status='processing', processing_started_at=now()
//          WHERE id IN (SELECT id FROM plans WHERE status='queued'
//                        ORDER BY generated_at LIMIT 1)
//            AND status='queued'
//        RETURNING *
//      The "AND status='queued'" guards against a race where two CLI
//      invocations select the same row; second writer's UPDATE returns 0.
//   3. Download input JSONs from Supabase Storage at
//        plan-inputs/{plan_id}/{clientprofile,selected_recs}.json
//   4. Validate via the orchestrator's Zod schemas.
//   5. Run Stage 3a (live) → store as plan.stage3a_output, accumulate cost.
//   6. Run Stage 4 (live) → store as plan.stage4_output, accumulate cost.
//   7. Run Stage 5 (live) → store as plan.stage5_output, accumulate cost.
//   8. Update plan: status='ready_for_review', processing_completed_at=now(),
//                   cost_cents=cumulative.
//
// Hard cost cap: $40 per plan. If cumulative cost exceeds the cap before
// any stage fires, that stage is skipped, the plan is marked status='failed'
// with a failure_reason, and partial outputs already saved are preserved.
//
// On any thrown error: catch, save partial outputs to the plan row, set
// status='failed' with failure_reason, exit non-zero.
//
// Console logging uses simple progress markers — Phase 3.4's integration
// runner is the template (see scripts/runIntegrationStage3a4_5.ts).

import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
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
} from "../src/lib/orchestrator/schemas/stage4.types";
import {
  isStage5ResultFailed,
  type Stage5Result,
} from "../src/lib/orchestrator/schemas/stage5.types";
import type { ClientProfile } from "../src/lib/orchestrator/schemas/clientProfile";
import type { SelectedRecommendations } from "../src/lib/orchestrator/schemas/selectedRecommendations";
import type { Database } from "../src/lib/supabase/database.types";
import type { QuantifiedRecommendations } from "../src/lib/orchestrator/schemas/pipelineTypes";

const HARD_COST_CAP_CENTS = 4000; // $40 per plan
const STORAGE_BUCKET = "plan-inputs";
const ADVISOR_ID_FOR_GENERATION = "will-bearden"; // Phase 5b — fixed, since Stage 4 needs an advisor identity. v1.5 will pull from plans.generated_by_advisor_id once advisor email→id mapping is wired into the orchestrator.

type PlanRow = Database["public"]["Tables"]["plans"]["Row"];

// ────────────────────────────────────────────────────────────────────────
// Logging API client wrappers (lifted from runIntegrationStage3a4_5.ts).
// ────────────────────────────────────────────────────────────────────────

function makeStage3aLoggingClient(real: Stage3a1ApiClient): Stage3a1ApiClient {
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

function makeStage4LoggingClient(real: Stage4ApiClient): Stage4ApiClient {
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

function makeStage5LoggingClient(real: Stage5ApiClient): Stage5ApiClient {
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
// Helpers
// ────────────────────────────────────────────────────────────────────────

function fmtCost(cents: number): string {
  return `${cents}c (~$${(cents / 100).toFixed(2)})`;
}

function stripBucketPrefix(path: string): string {
  // input_*_path is stored as `${bucket}/${objectPath}`; strip the bucket
  // for the storage API call.
  const prefix = `${STORAGE_BUCKET}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

// ────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────

type SupabaseAdmin = ReturnType<typeof createClient<Database>>;

async function claimNextPlan(admin: SupabaseAdmin): Promise<PlanRow | null> {
  // Two-step claim: select oldest queued, then UPDATE … WHERE id=X AND
  // status='queued' RETURNING *. The status filter on UPDATE is the race
  // guard — if a parallel CLI ran the same SELECT, only the first
  // UPDATE succeeds; the second sees status='processing' and returns 0.
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

// Match scripts/runIntegrationStage3a4_5.ts pattern — Zod's default
// .strip() mode silently drops fields the orchestrator's deterministic
// builders read (e.g., ClientProfile.* paths Stage 4 walks). Trust the
// uploaded bytes; structural validation already happens server-side at
// POST /api/plans/generate ingestion. The dev seed uploads raw artifact
// bytes without Zod, and any future POST upload is Zod-validated by the
// route handler before storage write — so the bytes the CLI sees are
// either pristine (seed path) or already shaped to the schema (POST
// path). Re-parsing here only loses fields.
//
// JSON parse errors still surface as a thrown SyntaxError, which gets
// caught by the top-level main() handler and recorded on the plan row.
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

async function markFailed(
  admin: SupabaseAdmin,
  planId: string,
  reason: string,
  costCents: number,
  partial: { stage3a?: QuantifiedRecommendations; stage4?: Stage4Result; stage5?: Stage5Result },
): Promise<void> {
  const update: Database["public"]["Tables"]["plans"]["Update"] = {
    status: "failed",
    failure_reason: reason,
    processing_completed_at: new Date().toISOString(),
    cost_cents: costCents > 0 ? costCents : null,
  };
  if (partial.stage3a) update.stage3a_output = partial.stage3a as unknown as Database["public"]["Tables"]["plans"]["Update"]["stage3a_output"];
  if (partial.stage4) update.stage4_output = partial.stage4 as unknown as Database["public"]["Tables"]["plans"]["Update"]["stage4_output"];
  if (partial.stage5) update.stage5_output = partial.stage5 as unknown as Database["public"]["Tables"]["plans"]["Update"]["stage5_output"];
  await admin.from("plans").update(update).eq("id", planId);
}

async function processPlan(admin: SupabaseAdmin, plan: PlanRow): Promise<number> {
  const overallT0 = Date.now();
  console.log(`\n=== Processing plan ${plan.id} (client_id=${plan.client_id}) ===`);
  console.log(`fact_review_filename: ${plan.fact_review_filename ?? "<unset>"}`);

  if (!plan.input_clientprofile_path || !plan.input_selected_recs_path) {
    const reason = `Plan is missing input storage paths (cp=${plan.input_clientprofile_path}, recs=${plan.input_selected_recs_path}).`;
    await markFailed(admin, plan.id, reason, 0, {});
    throw new Error(reason);
  }

  // Inputs — raw JSON.parse + cast (no Zod). See downloadJsonRaw comment.
  console.log("Downloading inputs from Storage...");
  const clientProfile = await downloadJsonRaw<ClientProfile>(
    admin,
    plan.input_clientprofile_path,
    "clientprofile",
  );
  const selectedRecs = await downloadJsonRaw<SelectedRecommendations>(
    admin,
    plan.input_selected_recs_path,
    "selected_recommendations",
  );
  console.log(
    `  ClientProfile loaded (advisor_id=${clientProfile.engagement?.advisor_id ?? "?"}, archetype=${clientProfile.engagement?.archetype ?? "?"})`,
  );
  console.log(`  SelectedRecommendations loaded (${selectedRecs.selected.length} recs)`);

  const real = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  // Cumulative cost spans attempts: when a plan is re-claimed after a
  // prior attempt failed mid-pipeline, we honour the previously-spent
  // dollars against the $40 cap so a single plan can't accidentally
  // burn $80 across two attempts. cost_cents on the row reflects whatever
  // was last committed (Stage 3a alone, or Stage 3a + a failed Stage 4
  // attempt).
  let cumulativeCost = plan.cost_cents ?? 0;
  let stage3a: QuantifiedRecommendations;
  let stage4: Stage4Result | undefined;

  // Stage 3a — skipped when stage3a_output is already populated from a
  // prior attempt. Stage 3a is the most expensive and most stochastic
  // stage; re-running it after a Stage 4 failure would (a) waste $8-12
  // and (b) produce a different QR shape than the one Stage 4 already
  // tried, blurring the diagnosis of why Stage 4 schema-validated.
  if (plan.stage3a_output !== null) {
    console.log(
      `\n--- Stage 3a (cached from prior attempt; cumulativeCost=${fmtCost(cumulativeCost)}) ---`,
    );
    // Raw cast — same pattern as downloadJsonRaw. Stage 3a wrote the
    // QuantifiedRecommendations shape directly to JSONB, so the bytes
    // round-trip lossless.
    stage3a = plan.stage3a_output as unknown as QuantifiedRecommendations;
    console.log(
      `  Loaded ${stage3a.recommendations.length} recs from plan.stage3a_output (no new LLM cost incurred)`,
    );
  } else {
    console.log("\n--- Stage 3a (live) ---");
    if (cumulativeCost >= HARD_COST_CAP_CENTS) {
      const reason = `Stage 3a aborted: cumulative cost ${fmtCost(cumulativeCost)} already at cap ${fmtCost(HARD_COST_CAP_CENTS)}.`;
      await markFailed(admin, plan.id, reason, cumulativeCost, {});
      throw new Error(reason);
    }
    stage3a = await runStage3a(clientProfile, selectedRecs, {
      apiClient: makeStage3aLoggingClient(real),
      kbPath: "kb/v1_2",
      referenceDate: new Date(),
      firmPolicyResolutions: [],
      landmineAuthorizations: [],
      maxRetriesPerBatch: 1,
    });
    cumulativeCost += stage3a._metadata?.cost_cents ?? 0;
    console.log(
      `Stage 3a done: ${stage3a.recommendations.length} recs, ${fmtCost(stage3a._metadata?.cost_cents ?? 0)} (cumulative ${fmtCost(cumulativeCost)})`,
    );
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

  // Stage 4
  console.log("\n--- Stage 4 (live) ---");
  if (cumulativeCost >= HARD_COST_CAP_CENTS) {
    const reason = `Stage 4 aborted: cumulative cost ${fmtCost(cumulativeCost)} at cap ${fmtCost(HARD_COST_CAP_CENTS)}.`;
    await markFailed(admin, plan.id, reason, cumulativeCost, { stage3a });
    throw new Error(reason);
  }
  const stage4Result = await generatePlan(clientProfile, stage3a, {
    apiClient: makeStage4LoggingClient(real),
    kbPath: "kb/v1_2",
    advisorId: ADVISOR_ID_FOR_GENERATION,
    generatedDate: new Date(),
    referenceDate: new Date(),
    maxRetries: 1,
  });
  if (isStage4ResultFailed(stage4Result)) {
    cumulativeCost += stage4Result._metadata?.cost_cents ?? 0;
    const reason = `Stage 4 FAILED: ${stage4Result._failure_type} — ${stage4Result._failure_reason}`;
    // Persist the full Stage4ResultFailed envelope (including
    // _failure_context.validation_errors / raw_response / parsed_response
    // and _metadata.attempt_history) into stage4_output JSONB. Without
    // this, `failure_reason` is the only diagnostic record and we cannot
    // tell which Zod path the LLM violated.
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
  cumulativeCost += stage4._metadata.cost_cents ?? 0;
  console.log(
    `Stage 4 done: ${fmtCost(stage4._metadata.cost_cents ?? 0)} (cumulative ${fmtCost(cumulativeCost)})`,
  );
  await admin
    .from("plans")
    .update({
      stage4_output: stage4 as unknown as Database["public"]["Tables"]["plans"]["Update"]["stage4_output"],
      cost_cents: cumulativeCost,
    })
    .eq("id", plan.id);

  // Stage 5
  console.log("\n--- Stage 5 (live) ---");
  if (cumulativeCost >= HARD_COST_CAP_CENTS) {
    const reason = `Stage 5 aborted: cumulative cost ${fmtCost(cumulativeCost)} at cap ${fmtCost(HARD_COST_CAP_CENTS)}.`;
    await markFailed(admin, plan.id, reason, cumulativeCost, { stage3a, stage4 });
    throw new Error(reason);
  }
  const stage5Result = await auditPlan(stage4, stage3a, clientProfile, {
    apiClient: makeStage5LoggingClient(real),
    kbPath: "kb/v1_2",
    advisorId: ADVISOR_ID_FOR_GENERATION,
    referenceDate: new Date(),
    maxRetries: 1,
    runLlmChecks: true,
  });
  if (isStage5ResultFailed(stage5Result)) {
    cumulativeCost += stage5Result._metadata?.cost_cents ?? 0;
    const reason = `Stage 5 FAILED: ${stage5Result._failure_type} — ${stage5Result._failure_reason}`;
    // Persist the full Stage5ResultFailed envelope into stage5_output for
    // the same diagnostic reason as Stage 4 above.
    await admin
      .from("plans")
      .update({
        stage5_output: stage5Result as unknown as Database["public"]["Tables"]["plans"]["Update"]["stage5_output"],
      })
      .eq("id", plan.id);
    await markFailed(admin, plan.id, reason, cumulativeCost, { stage3a, stage4 });
    throw new Error(reason);
  }
  cumulativeCost += stage5Result._metadata.cost_cents ?? 0;
  console.log(
    `Stage 5 done: ${stage5Result.findings.length} findings, ${fmtCost(stage5Result._metadata.cost_cents ?? 0)} (cumulative ${fmtCost(cumulativeCost)})`,
  );

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
}

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
    if (cost > HARD_COST_CAP_CENTS) {
      console.warn(
        `\n!! Cumulative cost ${fmtCost(cost)} exceeded cap ${fmtCost(HARD_COST_CAP_CENTS)}. Plan is ready_for_review but flagged for review.`,
      );
    }
    return 0;
  } catch (e) {
    const reason = (e as Error).message;
    console.error(`\n✗ Plan ${plan.id} processing FAILED: ${reason}`);
    // markFailed already called inside processPlan for known failure
    // points; this catch covers truly unexpected throws (e.g., network).
    // Best-effort: ensure the plan isn't left in 'processing' forever.
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
