import { requireAdvisor } from "@/lib/api/auth";
import { err, ok } from "@/lib/api/respond";
import { dbErrorMessage, mapDbError } from "@/lib/api/db_queries";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/plans/[id]/archive — set status='archived' + archived_at=now().
//
// No status guard: we accept archiving from draft or approved. Re-archiving
// an already-archived plan is a no-op (the new archived_at overwrites the
// old, which is correct — archiving represents the most recent decision).
export async function POST(_request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const { data, error } = await auth.supabase
    .from("plans")
    .update({ status: "archived", archived_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) return err(mapDbError(error), dbErrorMessage(error));
  if (!data) return err("not_found", `No plan with id ${id}.`);
  // TODO: Phase 5e — audit_log insert (entity='plan', action='updated').
  return ok(data);
}
