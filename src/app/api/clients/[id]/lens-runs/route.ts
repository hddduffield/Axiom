import { requireAdvisor } from "@/lib/api/auth";
import { err, list } from "@/lib/api/respond";
import { LIST_LENS_RUNS, MOCK_CLIENTS_BY_ID } from "@/lib/api/_mocks";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/clients/[id]/lens-runs — list lens runs for a client.
// TODO: Phase 5 — supabase.from("lens_runs").select("*").eq("client_id", id)
export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!MOCK_CLIENTS_BY_ID[id]) {
    return err("not_found", `No client with id ${id}.`);
  }
  const url = new URL(request.url);
  const lensType = url.searchParams.get("lens_type");
  const status = url.searchParams.get("status");
  let items = LIST_LENS_RUNS.filter((l) => l.client_id === id);
  if (lensType) items = items.filter((l) => l.lens_type === lensType);
  if (status) items = items.filter((l) => l.status === status);
  return list(items);
}
