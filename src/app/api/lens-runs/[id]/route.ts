import { requireAdvisor } from "@/lib/api/auth";
import { err, ok } from "@/lib/api/respond";
import { MOCK_LENS_RUNS_BY_ID } from "@/lib/api/_mocks";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/lens-runs/[id]
// TODO: Phase 5 — supabase.from("lens_runs").select("*").eq("id", id).single()
export async function GET(_request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const lr = MOCK_LENS_RUNS_BY_ID[id];
  if (!lr) return err("not_found", `No lens run with id ${id}.`);
  return ok(lr);
}
