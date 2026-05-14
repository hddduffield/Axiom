// Phase 13.2 — POST /api/lens-runs/cash-flow/[id]/finalize
//
// Flips a draft cash-flow lens to status='approved'. Idempotent on the
// approved state. UI labels this as "Generate plan" / "Finalize".

import { requireAdvisor } from "@/lib/api/auth";
import { err, ok } from "@/lib/api/respond";
import { dbErrorMessage, mapDbError } from "@/lib/api/db_queries";
import { recordMeaningfulTouch } from "@/lib/cadence/touchHelpers";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const { data: existing, error: fetchErr } = await auth.supabase
    .from("lens_runs")
    .select("id, lens_type, status")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return err(mapDbError(fetchErr), dbErrorMessage(fetchErr));
  if (!existing) return err("not_found", `No lens run with id ${id}.`);
  if (existing.lens_type !== "cash_flow") {
    return err("validation_failed", "Lens run is not a cash_flow type.");
  }
  if (existing.status === "archived") {
    return err("conflict", "Cannot finalize an archived lens.");
  }
  if (existing.status === "approved") {
    // Idempotent — return the row.
    const { data } = await auth.supabase.from("lens_runs").select("*").eq("id", id).single();
    return ok(data);
  }

  const { data, error } = await auth.supabase
    .from("lens_runs")
    .update({ status: "approved" })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return err(mapDbError(error), dbErrorMessage(error));

  // Phase 17.3 — finalizing a lens is a meaningful client touch.
  await recordMeaningfulTouch(
    auth.supabase,
    data.client_id,
    "lens_finalized",
    auth.advisor.id,
  );

  return ok(data);
}
