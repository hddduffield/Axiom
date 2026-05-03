import { requireAdvisor } from "@/lib/api/auth";
import { err, list } from "@/lib/api/respond";
import { LIST_PARTNERS, MOCK_CLIENTS_BY_ID } from "@/lib/api/_mocks";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/clients/[id]/partners — list partners for a client.
// TODO: Phase 5 — supabase.from("partners").select("*").eq("client_id", id)
export async function GET(_request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!MOCK_CLIENTS_BY_ID[id]) {
    return err("not_found", `No client with id ${id}.`);
  }
  const items = LIST_PARTNERS.filter((p) => p.client_id === id);
  return list(items);
}
