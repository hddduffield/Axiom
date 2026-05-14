// Phase 14.2 — POST /api/lens-runs/estate/[id]/push-action-items
//
// Body: { recommendation_ids: string[] }
//
// Inserts each recommended action into action_items with
// category='ESTATE', source_lens_run_id=lens.id. Idempotent on rec id:
// already-pushed recs are skipped (pushed_action_item_ids tracks).

import { z } from "zod";
import { requireAdvisor } from "@/lib/api/auth";
import { err, ok } from "@/lib/api/respond";
import { dbErrorMessage, mapDbError } from "@/lib/api/db_queries";
import {
  isEstateLensOutput,
  type EstateLensOutput,
} from "@/lib/estate-lens/types";
import { recordMeaningfulTouch } from "@/lib/cadence/touchHelpers";
import type { Json } from "@/lib/supabase/database.types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const bodySchema = z.object({
  recommendation_ids: z.array(z.string()).min(1),
});

function timingBucketForYearOffset(offset: number): string {
  if (offset <= 0) return "this_week";
  if (offset === 1) return "next_30_days";
  if (offset <= 2) return "next_90_days";
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
  if (lensRow.lens_type !== "estate") {
    return err("validation_failed", "Lens is not an estate type.");
  }
  if (!isEstateLensOutput(lensRow.output)) {
    return err("validation_failed", "Lens output not in estate shape.");
  }
  const output = lensRow.output as EstateLensOutput;

  const alreadyPushed = new Set(output.pushed_action_item_ids);
  const toPush = parsed.data.recommendation_ids
    .filter((rid) => !alreadyPushed.has(rid))
    .map((rid) => output.recommendations.find((r) => r.id === rid))
    .filter((r): r is NonNullable<typeof r> => Boolean(r));

  if (toPush.length === 0) {
    return ok({
      created: [],
      skipped: parsed.data.recommendation_ids.length,
    });
  }

  const inserts = toPush.map((rec) => ({
    client_id: lensRow.client_id,
    source_lens_run_id: lensRow.id,
    description: rec.description ?? rec.label,
    category: "ESTATE",
    duration_class: "one_time" as const,
    timing_bucket: timingBucketForYearOffset(rec.year_offset),
    owner: auth.advisor.email,
    partner_required: false,
    status: "not_started" as const,
  }));

  const { data: createdRows, error: insertErr } = await auth.supabase
    .from("action_items")
    .insert(inserts)
    .select("*");
  if (insertErr) return err(mapDbError(insertErr), dbErrorMessage(insertErr));

  const newOutput: EstateLensOutput = {
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

  // Phase 17.3 — promoting lens recs counts as a meaningful client touch.
  await recordMeaningfulTouch(
    auth.supabase,
    lensRow.client_id,
    "lens_finalized",
    auth.advisor.id,
  );

  return ok({
    created: createdRows ?? [],
    skipped: parsed.data.recommendation_ids.length - toPush.length,
  });
}
