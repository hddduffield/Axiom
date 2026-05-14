// Phase 18.2 — POST /api/lens-runs/[id]/reopen
//
// Corrective fix: once a lens transitioned past draft (reviewed,
// presented, current, superseded, or legacy approved), there was no
// way back. Advisors needed to be able to edit a finalized scenario
// and re-finalize.
//
// Reopens reset status to 'draft'. Existing action items spawned
// from this lens (via push-action-items or Finalize & Promote) are
// NOT deleted — they live independently of the lens's lifecycle.
// Re-finalizing afterward can promote any newly-added recs, with the
// per-rec push idempotency tracking unchanged.
//
// Status guard: only reviewed / presented / current / superseded /
// approved can reopen. draft (already there) and archived (must
// restore first) reject with 409.

import { requireAdvisor } from "@/lib/api/auth";
import { err, ok } from "@/lib/api/respond";
import { dbErrorMessage, mapDbError } from "@/lib/api/db_queries";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const REOPENABLE_FROM = new Set([
  "reviewed",
  "presented",
  "current",
  "superseded",
  "approved",
]);

export async function POST(_request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const { data: existing, error: fetchErr } = await auth.supabase
    .from("lens_runs")
    .select("id, status, client_id, lens_type")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return err(mapDbError(fetchErr), dbErrorMessage(fetchErr));
  if (!existing) return err("not_found", `No lens run with id ${id}.`);
  if (existing.status === "draft") {
    // Idempotent — return the row.
    const { data } = await auth.supabase
      .from("lens_runs")
      .select("*")
      .eq("id", id)
      .single();
    return ok(data);
  }
  if (!REOPENABLE_FROM.has(existing.status)) {
    return err(
      "conflict",
      `Cannot reopen a ${existing.status} lens. Restore archived lenses first.`,
    );
  }

  const { data, error } = await auth.supabase
    .from("lens_runs")
    .update({ status: "draft" })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return err(mapDbError(error), dbErrorMessage(error));

  // Audit trail — entity_type='lens_run', action='updated' with the
  // reopen detail. Same pattern recordMeaningfulTouch uses for
  // touches. No new enum value needed.
  try {
    await auth.supabase.from("audit_log").insert({
      actor_advisor_id: auth.advisor.id,
      entity_type: "lens_run",
      entity_id: id,
      action: "updated",
      details: { kind: "reopen", prior_status: existing.status },
    });
  } catch (e) {
    console.warn("[lens-reopen] audit_log insert failed:", (e as Error).message);
  }

  return ok(data);
}
