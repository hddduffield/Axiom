import { requireAdvisor } from "@/lib/api/auth";
import { err, list } from "@/lib/api/respond";
import { LIST_NOTES, MOCK_CLIENTS_BY_ID } from "@/lib/api/_mocks";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/clients/[id]/notes — list notes for a client (newest first).
// TODO: Phase 5 — supabase.from("notes").select("*").eq("client_id", id).order("created_at", { ascending: false })
export async function GET(_request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!MOCK_CLIENTS_BY_ID[id]) {
    return err("not_found", `No client with id ${id}.`);
  }
  const items = LIST_NOTES.filter((n) => n.client_id === id).sort(
    (a, b) => b.created_at.localeCompare(a.created_at),
  );
  return list(items);
}
