import { requireAdvisor } from "@/lib/api/auth";
import { err, ok } from "@/lib/api/respond";
import { MOCK_PLANS_BY_ID } from "@/lib/api/_mocks";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/plans/[id]
// TODO: Phase 5 — supabase.from("plans").select("*").eq("id", id).single()
export async function GET(_request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const plan = MOCK_PLANS_BY_ID[id];
  if (!plan) return err("not_found", `No plan with id ${id}.`);
  return ok(plan);
}
