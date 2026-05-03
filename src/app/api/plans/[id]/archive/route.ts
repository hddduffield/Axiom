import { requireAdvisor } from "@/lib/api/auth";
import { err, ok } from "@/lib/api/respond";
import { MOCK_PLANS_BY_ID } from "@/lib/api/_mocks";
import type { Plan } from "@/lib/api/types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/plans/[id]/archive — archive a plan.
// TODO: Phase 5 — supabase update + audit_log insert.
export async function POST(_request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const plan = MOCK_PLANS_BY_ID[id];
  if (!plan) return err("not_found", `No plan with id ${id}.`);
  const updated: Plan = {
    ...plan,
    status: "archived",
    archived_at: new Date().toISOString(),
  };
  return ok(updated);
}
