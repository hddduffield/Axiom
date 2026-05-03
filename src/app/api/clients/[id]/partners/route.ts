import { requireAdvisor } from "@/lib/api/auth";
import { err, list } from "@/lib/api/respond";
import { dbErrorMessage, mapDbError } from "@/lib/api/db_queries";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/clients/[id]/partners — list partners for a client.
export async function GET(_request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const { data: clientRow, error: clientErr } = await auth.supabase
    .from("clients")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (clientErr) return err(mapDbError(clientErr), dbErrorMessage(clientErr));
  if (!clientRow) return err("not_found", `No client with id ${id}.`);

  const { data, error } = await auth.supabase
    .from("partners")
    .select("*")
    .eq("client_id", id)
    .order("created_at", { ascending: false });
  if (error) return err(mapDbError(error), dbErrorMessage(error));
  return list(data ?? []);
}
