import { createClient } from "@/lib/supabase/server";
import { ClientsView } from "./_ClientsView";

// Server-loads everything the polished ClientsList view needs:
//   1. Clients with joined lead-advisor name
//   2. Open-action-item counts per client (cheap aggregate; one query
//      across all action_items, summed in JS)
//   3. Active advisor list for the lead-advisor filter chips
//
// All filtering + sorting + the new-client dialog happens in
// _ClientsView (Client Component) since v1 has ≤ 20 clients and
// in-memory filtering avoids round-trips per chip click.
//
// Schema gaps vs Claude Design's reference (logged for v1.5):
//   - clients.aum column doesn't exist. The "AUM" column + dialog
//     field are dropped; see specs/v1_5_backlog.md.
//   - clients.last_activity_at doesn't exist. The "Last activity"
//     column uses created_at (renamed "Added"); v1.5 can compute
//     last_activity from notes/action_items/plans recency.
export default async function ClientsPage() {
  const supabase = await createClient();
  const [clientsRes, openCountsRes, advisorsRes] = await Promise.all([
    supabase
      .from("clients")
      .select(
        "id, household_name, lead_advisor_id, status, archetype, created_at, advisors:lead_advisor_id(first_name, last_name)",
      )
      .order("created_at", { ascending: false }),
    // Aggregate by hand: pull (id, client_id, status) for every non-complete
    // action item, count by client_id in JS. Cheap at v1 scale; avoids the
    // ergonomic awkwardness of supabase-js's group-by syntax.
    supabase
      .from("action_items")
      .select("client_id")
      .neq("status", "complete"),
    supabase
      .from("advisors")
      .select("id, first_name, last_name")
      .eq("active", true)
      .order("first_name"),
  ]);

  const openCountByClient = new Map<string, number>();
  for (const row of openCountsRes.data ?? []) {
    openCountByClient.set(
      row.client_id,
      (openCountByClient.get(row.client_id) ?? 0) + 1,
    );
  }

  const clients = (clientsRes.data ?? []).map((c) => ({
    ...c,
    open_items: openCountByClient.get(c.id) ?? 0,
  }));

  return (
    <ClientsView
      clients={clients}
      advisors={advisorsRes.data ?? []}
      loadError={clientsRes.error?.message ?? null}
    />
  );
}
