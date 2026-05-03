import { requireAdvisor } from "@/lib/api/auth";
import { err, list } from "@/lib/api/respond";
import { dbErrorMessage, mapDbError } from "@/lib/api/db_queries";
import type { PlansApi } from "@/lib/api/types";

// GET /api/plans/queued
//
// Slim view for the dashboard widget: plans currently in flight (status
// 'queued' or 'processing'), with the joined client household name and
// the submitting advisor's email so the UI can render a one-liner.
//
// Sort: oldest queued first (matches CLI claim order).
export async function GET() {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from("plans")
    .select(
      "id, client_id, generated_by_advisor_id, status, generated_at, processing_started_at, clients(household_name), advisors:generated_by_advisor_id(email)",
    )
    .in("status", ["queued", "processing"])
    .order("generated_at", { ascending: true })
    .limit(50);
  if (error) return err(mapDbError(error), dbErrorMessage(error));

  const items: PlansApi.QueuedPlanRow[] = (data ?? []).map((row) => ({
    id: row.id,
    client_id: row.client_id,
    client_household_name: row.clients?.household_name ?? "<unknown client>",
    generated_by_advisor_id: row.generated_by_advisor_id,
    generated_by_advisor_email: row.advisors?.email ?? "<unknown advisor>",
    status: row.status as "queued" | "processing",
    generated_at: row.generated_at,
    processing_started_at: row.processing_started_at,
  }));
  return list(items);
}
