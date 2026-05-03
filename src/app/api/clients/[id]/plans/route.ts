import { requireAdvisor } from "@/lib/api/auth";
import { err, list } from "@/lib/api/respond";
import { LIST_PLANS, MOCK_CLIENTS_BY_ID } from "@/lib/api/_mocks";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/clients/[id]/plans — list plans for a client.
// TODO: Phase 5 — supabase.from("plans").select("*").eq("client_id", id).order("generated_at", { ascending: false })
export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!MOCK_CLIENTS_BY_ID[id]) {
    return err("not_found", `No client with id ${id}.`);
  }
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  let items = LIST_PLANS.filter((p) => p.client_id === id);
  if (status) items = items.filter((p) => p.status === status);
  return list(items);
}
