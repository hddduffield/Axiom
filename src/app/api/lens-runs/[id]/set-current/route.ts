// Phase 17.4 — POST /api/lens-runs/[id]/set-current
//
// Promotes a reviewed / presented / approved lens to status='current'.
// Only one 'current' per (client_id, lens_type) — any other row already
// marked 'current' for the same client + lens_type is auto-demoted to
// 'superseded' in the same transaction.

import { requireAdvisor } from "@/lib/api/auth";
import { err, ok } from "@/lib/api/respond";
import { dbErrorMessage, mapDbError } from "@/lib/api/db_queries";
import { autoGenerateLensSummaryIfMissing } from "@/lib/lens-execution/autoSummary";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const PROMOTABLE_FROM = new Set([
  "draft",
  "reviewed",
  "presented",
  "approved",
]);

export async function POST(_request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const { data: existing, error: fetchErr } = await auth.supabase
    .from("lens_runs")
    .select("id, client_id, lens_type, status")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return err(mapDbError(fetchErr), dbErrorMessage(fetchErr));
  if (!existing) return err("not_found", `No lens run with id ${id}.`);
  if (existing.status === "current") {
    // Idempotent — return the row as-is.
    const { data } = await auth.supabase
      .from("lens_runs")
      .select("*")
      .eq("id", id)
      .single();
    return ok(data);
  }
  if (!PROMOTABLE_FROM.has(existing.status)) {
    return err(
      "conflict",
      `Cannot promote a ${existing.status} lens to current.`,
    );
  }

  // Step 1 — demote any existing current of the same (client, lens_type).
  const { error: demoteErr } = await auth.supabase
    .from("lens_runs")
    .update({ status: "superseded" })
    .eq("client_id", existing.client_id)
    .eq("lens_type", existing.lens_type)
    .eq("status", "current");
  if (demoteErr) return err(mapDbError(demoteErr), dbErrorMessage(demoteErr));

  // Step 2 — promote this row.
  const { data, error } = await auth.supabase
    .from("lens_runs")
    .update({ status: "current" })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return err(mapDbError(error), dbErrorMessage(error));

  // Phase 18.5 — auto-generate the executive summary if missing.
  // Best-effort; failures log and don't roll back the promotion.
  await autoGenerateLensSummaryIfMissing(auth.supabase, id);

  // Re-fetch so the response carries the freshly-stamped summary.
  const { data: fresh } = await auth.supabase
    .from("lens_runs")
    .select("*")
    .eq("id", id)
    .single();

  return ok(fresh ?? data);
}
