// Phase 18.1 — POST /api/plans/[id]/promote-recommendations
//
// Corrective fix: plans approved BEFORE Phase 17 shipped never had
// their REC- recommendations auto-promoted to action items. This
// endpoint lets the advisor trigger promotion on any approved plan
// retroactively.
//
// Idempotent — the unique index (source_plan_id,
// source_recommendation_id) plus the pre-load skip in
// promotePlanRecsToActionItems guarantee re-running this endpoint on
// the same plan creates only the missing rows.
//
// Status guard: only 'approved' plans qualify. ready_for_review goes
// through the existing /approve endpoint which already promotes.
// queued / processing / failed / archived all reject with 409.

import { requireAdvisor } from "@/lib/api/auth";
import { err, ok } from "@/lib/api/respond";
import { dbErrorMessage, mapDbError } from "@/lib/api/db_queries";
import { promotePlanRecsToActionItems } from "@/lib/plan-execution/promoteRecsToActionItems";
import { recordMeaningfulTouch } from "@/lib/cadence/touchHelpers";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const { data: plan, error: fetchErr } = await auth.supabase
    .from("plans")
    .select("id, status, client_id")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return err(mapDbError(fetchErr), dbErrorMessage(fetchErr));
  if (!plan) return err("not_found", `No plan with id ${id}.`);
  if (plan.status !== "approved") {
    return err(
      "conflict",
      `Plan ${id} is ${plan.status}; only approved plans can have recommendations promoted retroactively. Use the standard Approve flow for ready_for_review plans.`,
    );
  }

  const promotion = await promotePlanRecsToActionItems(auth.supabase, id);

  // A retroactive promotion is itself a meaningful touch — advisor is
  // working that client right now.
  if (promotion.count > 0) {
    await recordMeaningfulTouch(
      auth.supabase,
      plan.client_id,
      "plan_approved",
      auth.advisor.id,
    );
  }

  return ok({
    new_count: promotion.count,
    existing_count: promotion.skipped_existing,
    total_recs: promotion.total_recs,
    action_item_ids: promotion.action_item_ids,
    promotion_errors: promotion.errors,
  });
}
