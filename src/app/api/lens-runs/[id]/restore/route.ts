// Phase 15 — POST /api/lens-runs/[id]/restore
//
// Inverse of /archive: flips an archived lens run back to draft status
// and clears archived_at. Works for any lens_type. UI surface is the
// _LensRunRestoreDialog on archived rows in the Lens Runs tab.

import { requireAdvisor } from "@/lib/api/auth";
import { err, ok } from "@/lib/api/respond";
import { dbErrorMessage, mapDbError } from "@/lib/api/db_queries";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const { data: existing, error: fetchErr } = await auth.supabase
    .from("lens_runs")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return err(mapDbError(fetchErr), dbErrorMessage(fetchErr));
  if (!existing) return err("not_found", `No lens run with id ${id}.`);
  if (existing.status !== "archived") {
    return err("conflict", `Cannot restore a lens that is ${existing.status}.`);
  }

  const { data, error } = await auth.supabase
    .from("lens_runs")
    .update({ status: "draft", archived_at: null })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return err(mapDbError(error), dbErrorMessage(error));
  if (!data) return err("not_found", `No lens run with id ${id}.`);

  return ok(data);
}
