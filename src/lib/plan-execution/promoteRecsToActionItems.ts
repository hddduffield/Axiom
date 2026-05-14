// Phase 17.5 — Promote a plan's REC- recommendations into action items.
//
// Called from POST /api/plans/[id]/approve after the plan transitions
// to status='approved'. Walks plan.stage3a_output.result.recommendations
// and inserts one action_items row per recommendation (one row per REC-
// identifier, not per nested action_item). The unique index
// (source_plan_id, source_recommendation_id) makes re-approval
// idempotent — a duplicate upsert is dropped silently and the existing
// row is preserved.
//
// Mappings (orchestrator → DB):
//   timing_bucket: "0-30 days" → "next_30_days", "30-60 days" →
//     "next_60_days", "60-120 days" → "next_90_days", "4-6 months" |
//     "6-12 months" | "12-24 months" → "this_year", "Ongoing" → "ongoing"
//   category:    RecommendationCategory → SCREAMING_SNAKE
//   owner:       PSA → advisor's email; CPA/Attorney/Banker/Insurance
//                Broker/Other/Client → literal lowercase
//   duration_class: "point_in_time" | "short_running" → "one_time";
//                "long_running" → "long_running"
//
// Description: synthesized from the recommendation's first action_item
// description (which is the high-level imperative the advisor reads in
// the plan body). Falls back to a generic "Implement REC-XXX" if the
// rec has no action_items.

import type { AppSupabaseClient } from "@/lib/api/auth";
import type { Database } from "@/lib/supabase/database.types";
import type {
  ActionItem as OrchestratorActionItem,
  RecommendationCategory,
  SequencedRecommendation,
  TimingBucket as OrchestratorTimingBucket,
  DurationClass as OrchestratorDurationClass,
  ActionOwner,
  PartnerType,
} from "@/lib/orchestrator/schemas/pipelineTypes";

type DbActionItemInsert =
  Database["public"]["Tables"]["action_items"]["Insert"];
type DbActionItemRow =
  Database["public"]["Tables"]["action_items"]["Row"];

const CATEGORY_MAP: Record<RecommendationCategory, string> = {
  Tax: "TAX",
  Estate: "ESTATE",
  "Entity Structure": "ENTITY",
  "Risk & Insurance": "RISK",
  Retirement: "RETIREMENT",
  Investment: "INVESTMENT",
  "Succession & Continuity": "SUCCESSION",
  Family: "FAMILY",
  Charitable: "CHARITY",
  Specialty: "SPECIALTY",
};

const TIMING_MAP: Record<OrchestratorTimingBucket, string> = {
  "0-30 days": "next_30_days",
  "30-60 days": "next_60_days",
  "60-120 days": "next_90_days",
  "4-6 months": "this_year",
  "6-12 months": "this_year",
  "12-24 months": "this_year",
  Ongoing: "ongoing",
};

function mapDuration(d: OrchestratorDurationClass): "one_time" | "long_running" {
  return d === "long_running" ? "long_running" : "one_time";
}

function mapOwner(owner: ActionOwner, fallbackAdvisorEmail: string): string {
  switch (owner) {
    case "PSA":
      return fallbackAdvisorEmail;
    case "CPA":
      return "cpa";
    case "Attorney":
      return "attorney";
    case "Banker":
      return "banker";
    case "Insurance Broker":
      return "insurance";
    case "Client":
      return "client";
    case "Other":
    default:
      return "other";
  }
}

// Aggregate the nested action_items into a single recommendation-level
// row. The row's description uses the FIRST sub-action-item's
// description as the imperative summary. partner_required / partner_type
// roll up from any sub-action-item that requires a partner. Timing,
// owner, and duration use the rec-level fields directly (the
// recommendation header carries these).
function buildRowFromRecommendation(
  rec: SequencedRecommendation,
  planId: string,
  clientId: string,
  fallbackAdvisorEmail: string,
): DbActionItemInsert {
  const firstActionItem: OrchestratorActionItem | undefined = rec.action_items[0];
  const description =
    firstActionItem?.description ??
    `Implement ${rec.recommendation_id} (${rec.category})`;

  // Any sub-action-item requiring a partner forces partner_required=true
  // on the parent row, with the first partner_type encountered.
  let partnerRequired = false;
  let partnerType: PartnerType | null = null;
  for (const ai of rec.action_items) {
    if (ai.partner_required) {
      partnerRequired = true;
      partnerType = ai.partner_type ?? partnerType;
    }
  }

  // Duration class: if ANY sub-action-item is long_running, the
  // umbrella row is long_running too (so the Phase 5d derivative-
  // reminder hooks fire on it). Otherwise one_time.
  const anyLongRunning = rec.action_items.some(
    (ai) => ai.duration_class === "long_running",
  );
  const durationClass: "one_time" | "long_running" = anyLongRunning
    ? "long_running"
    : mapDuration(firstActionItem?.duration_class ?? "point_in_time");

  return {
    client_id: clientId,
    source_plan_id: planId,
    source_recommendation_id: rec.recommendation_id,
    description,
    category: CATEGORY_MAP[rec.category] ?? "OTHER",
    duration_class: durationClass,
    timing_bucket: TIMING_MAP[rec.timing_bucket] ?? "this_year",
    owner: mapOwner(rec.owner, fallbackAdvisorEmail),
    partner_required: partnerRequired,
    partner_type: partnerType,
    status: "not_started",
    is_derivative_reminder: false,
  };
}

interface PromoteResult {
  count: number;
  action_item_ids: string[];
  skipped_existing: number;
  // Phase 18.1 — total REC- entries in the plan's stage3a_output.
  // `count + skipped_existing` should equal this on a clean run; a
  // mismatch indicates Stage3a structure variance or a bug.
  total_recs: number;
  errors: string[];
}

interface MinimalPlan {
  id: string;
  client_id: string;
  stage3a_output: Database["public"]["Tables"]["plans"]["Row"]["stage3a_output"];
  generated_by_advisor_id: string;
}

interface MinimalAdvisor {
  email: string;
}

// Top-level shape of stage3a_output JSONB — only what we read.
interface Stage3aShape {
  result?: {
    recommendations?: SequencedRecommendation[];
  };
}

export async function promotePlanRecsToActionItems(
  supabase: AppSupabaseClient,
  planId: string,
): Promise<PromoteResult> {
  const result: PromoteResult = {
    count: 0,
    action_item_ids: [],
    skipped_existing: 0,
    total_recs: 0,
    errors: [],
  };

  const { data: plan, error: planErr } = await supabase
    .from("plans")
    .select("id, client_id, stage3a_output, generated_by_advisor_id")
    .eq("id", planId)
    .maybeSingle<MinimalPlan>();
  if (planErr || !plan) {
    result.errors.push(planErr?.message ?? "Plan not found.");
    return result;
  }

  // Resolve the generating advisor's email — that's the literal we
  // stamp on "PSA"-owned items so the kanban can find it. If the
  // advisor record can't be loaded (deleted/inactive), fall back to a
  // generic "psa" string; the row still inserts and is reassignable.
  let fallbackEmail = "psa";
  const { data: advisor } = await supabase
    .from("advisors")
    .select("email")
    .eq("id", plan.generated_by_advisor_id)
    .maybeSingle<MinimalAdvisor>();
  if (advisor?.email) fallbackEmail = advisor.email;

  const stage3a = plan.stage3a_output as Stage3aShape | null;
  const recs = stage3a?.result?.recommendations ?? [];
  result.total_recs = recs.length;
  if (recs.length === 0) {
    result.errors.push(
      "Plan has no stage3a_output.result.recommendations to promote.",
    );
    return result;
  }

  // Pre-load existing source_recommendation_ids for this plan so we
  // can skip duplicates BEFORE attempting an insert. The unique index
  // makes this redundant from a correctness standpoint, but skipping
  // pre-emptively gives us a clean count of "actually inserted".
  const { data: existing } = await supabase
    .from("action_items")
    .select("source_recommendation_id")
    .eq("source_plan_id", planId)
    .not("source_recommendation_id", "is", null);
  const seen = new Set(
    (existing ?? [])
      .map((r) => r.source_recommendation_id)
      .filter((s): s is string => !!s),
  );

  const rows: DbActionItemInsert[] = [];
  for (const rec of recs) {
    if (seen.has(rec.recommendation_id)) {
      result.skipped_existing += 1;
      continue;
    }
    rows.push(
      buildRowFromRecommendation(rec, planId, plan.client_id, fallbackEmail),
    );
  }

  if (rows.length === 0) return result;

  // One bulk insert. The unique index acts as a final safety net even
  // if a concurrent approval attempt slipped past the pre-load.
  const { data: inserted, error: insertErr } = await supabase
    .from("action_items")
    .insert(rows)
    .select<"id", Pick<DbActionItemRow, "id">>("id");
  if (insertErr) {
    result.errors.push(`Bulk insert failed: ${insertErr.message}`);
    return result;
  }

  result.count = inserted?.length ?? 0;
  result.action_item_ids = (inserted ?? []).map((r) => r.id);
  return result;
}
