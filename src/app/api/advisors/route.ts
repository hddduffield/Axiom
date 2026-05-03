import { requireAdvisor } from "@/lib/api/auth";
import { err, list } from "@/lib/api/respond";
import { dbErrorMessage, mapDbError } from "@/lib/api/db_queries";

// GET /api/advisors — list advisors.
//
// Default returns active advisors only (the typical "owner selector" use
// case). Pass `?active=false` to include deactivated ones, or omit the
// param to get the v1 default of active-only.
export async function GET(request: Request) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const activeParam = url.searchParams.get("active");

  let query = auth.supabase.from("advisors").select("*").order("created_at", { ascending: true });
  if (activeParam !== null) {
    query = query.eq("active", activeParam === "true");
  }

  const { data, error } = await query;
  if (error) return err(mapDbError(error), dbErrorMessage(error));
  return list(data ?? []);
}
