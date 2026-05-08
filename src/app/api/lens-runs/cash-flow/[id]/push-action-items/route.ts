// Phase 13.5 — POST /api/lens-runs/cash-flow/[id]/push-action-items
//
// Body: { recommendation_ids: string[] }
//
// For each id (referencing ai_suggestions.distribution_recommendations.recommendations[].id),
// inserts a row into action_items with source_lens_run_id = lens.id. Tracks
// which recommendation ids have been pushed in pushed_action_item_ids so
// the UI can disable already-pushed items.
//
// Idempotent on the rec id: if a rec id is already in pushed_action_item_ids,
// it's skipped.

import { z } from "zod";
import { requireAdvisor } from "@/lib/api/auth";
import { err, ok } from "@/lib/api/respond";
import { dbErrorMessage, mapDbError } from "@/lib/api/db_queries";
import {
  isCashFlowLensOutput,
  type CashFlowLensOutput,
} from "@/lib/api/cash_flow_lens";
import type { Json } from "@/lib/supabase/database.types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const bodySchema = z.object({
  recommendation_ids: z.array(z.string().uuid()).min(1),
});

function timingBucketForYear(year: number): string {
  const today = new Date().getFullYear();
  if (year <= today) return "this_week";
  const delta = year - today;
  if (delta <= 0) return "this_week";
  if (delta === 1) return "next_30_days";
  if (delta <= 2) return "next_90_days";
  return "this_year";
}

export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return err("validation_failed", "Body must be valid JSON.");
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return err("validation_failed", "Invalid payload.", parsed.error.issues);
  }

  const { data: lensRow, error: fetchErr } = await auth.supabase
    .from("lens_runs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return err(mapDbError(fetchErr), dbErrorMessage(fetchErr));
  if (!lensRow) return err("not_found", `No lens run with id ${id}.`);
  if (lensRow.lens_type !== "cash_flow") {
    return err("validation_failed", "Lens is not a cash_flow type.");
  }
  if (!isCashFlowLensOutput(lensRow.output)) {
    return err("validation_failed", "Lens output not in cash_flow shape.");
  }
  const output = lensRow.output as CashFlowLensOutput;

  const distRec = output.ai_suggestions.distribution_recommendations;
  if (!distRec) {
    return err("validation_failed", "No distribution recommendations to push.");
  }

  const alreadyPushed = new Set(output.pushed_action_item_ids);
  const toPush = parsed.data.recommendation_ids
    .filter((rid) => !alreadyPushed.has(rid))
    .map((rid) => distRec.recommendations.find((r) => r.id === rid))
    .filter((r): r is NonNullable<typeof r> => Boolean(r));

  if (toPush.length === 0) {
    return ok({ created: [], skipped: parsed.data.recommendation_ids.length });
  }

  const inserts = toPush.map((rec) => ({
    client_id: lensRow.client_id,
    source_lens_run_id: lensRow.id,
    description: rec.action,
    category: "CASH_FLOW",
    duration_class: "one_time" as const,
    timing_bucket: timingBucketForYear(rec.year),
    owner: auth.advisor.email,
    partner_required: false,
    status: "not_started" as const,
  }));

  const { data: created, error: insertErr } = await auth.supabase
    .from("action_items")
    .insert(inserts)
    .select("*");
  if (insertErr) return err(mapDbError(insertErr), dbErrorMessage(insertErr));

  // Persist push tracking back into output JSONB.
  const newOutput: CashFlowLensOutput = {
    ...output,
    pushed_action_item_ids: [
      ...output.pushed_action_item_ids,
      ...toPush.map((r) => r.id),
    ],
  };

  const { error: updErr } = await auth.supabase
    .from("lens_runs")
    .update({ output: newOutput as unknown as Json })
    .eq("id", id);
  if (updErr) return err(mapDbError(updErr), dbErrorMessage(updErr));

  return ok({ created: created ?? [], skipped: parsed.data.recommendation_ids.length - toPush.length });
}
