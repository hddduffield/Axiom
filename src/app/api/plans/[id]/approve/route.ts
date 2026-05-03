import { requireAdvisor } from "@/lib/api/auth";
import { err, ok } from "@/lib/api/respond";
import { dbErrorMessage, mapDbError } from "@/lib/api/db_queries";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/plans/[id]/approve — transition ready_for_review → approved.
//
// Two-step: load to validate the source state, then update with status +
// approved_at. The transition guard prevents accidental approval of plans
// that haven't completed the AI engine pipeline (status='processing',
// 'failed', 'queued') or that are already past approval ('approved',
// 'archived').
export async function POST(_request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const { data: existing, error: fetchErr } = await auth.supabase
    .from("plans")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return err(mapDbError(fetchErr), dbErrorMessage(fetchErr));
  if (!existing) return err("not_found", `No plan with id ${id}.`);
  if (existing.status !== "ready_for_review") {
    return err(
      "conflict",
      `Plan ${id} is ${existing.status}; only ready_for_review plans can be approved.`,
    );
  }

  const { data, error } = await auth.supabase
    .from("plans")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return err(mapDbError(error), dbErrorMessage(error));
  // TODO: Phase 5e — audit_log insert (entity='plan', action='approved').
  return ok(data);
}
