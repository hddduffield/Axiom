// Action items kanban server entry — fetches the universe needed for
// the kanban + backlog view: active advisors (column headers), clients
// (filter dropdown + card join), and all action items in scope.
//
// Owner-shape note (Phase 9.18): action_items.owner is a free-form
// string. Stage 3a writes advisor email addresses ("hayden@psawealth.com")
// for advisor-owned items, and literals like "client" / "cpa" /
// "attorney" for non-advisor-owned items. The kanban matches by email
// so existing data continues to work; advisor.id is used only as the
// React key. Migrating owner to a UUID FK is a separate task with
// schema + Stage 3a prompt implications.
//
// Phase 11.5.1 — archived clients' action items are hidden by default.
// `?archived=1` search param re-runs the query without the client-status
// filter and renders archived items with a muted treatment so the
// advisor can see what's there without it cluttering the working view.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { KanbanView } from "./_KanbanView";

export default async function ActionItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const params = await searchParams;
  const includeArchived = params.archived === "1";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  // Fetch clients first so we can compute allowed_ids for the items query.
  // The split is cheap — clients table is small (1-3 rows in v1.5).
  const advisorsRes = await Promise.all([
    supabase
      .from("advisors")
      .select("id, email, first_name, last_name")
      .eq("active", true)
      .order("first_name"),
    supabase
      .from("clients")
      .select("id, household_name, status")
      .order("household_name"),
  ]);
  const [advisorsData, clientsData] = advisorsRes;
  const allClients = clientsData.data ?? [];

  // Default-hide archived; opt-in via ?archived=1 to include them.
  const visibleClients = includeArchived
    ? allClients
    : allClients.filter((c) => c.status !== "inactive");
  const allowedClientIds = visibleClients.map((c) => c.id);
  const archivedClientIds = allClients
    .filter((c) => c.status === "inactive")
    .map((c) => c.id);

  let itemsQuery = supabase
    .from("action_items")
    .select("*")
    .order("created_at", { ascending: false });
  if (!includeArchived && allowedClientIds.length > 0) {
    itemsQuery = itemsQuery.in("client_id", allowedClientIds);
  }
  // Edge case: if includeArchived is false AND there are no non-archived
  // clients, .in() with an empty array would match nothing — but we still
  // call it explicitly so the query is well-formed.
  if (!includeArchived && allowedClientIds.length === 0) {
    itemsQuery = itemsQuery.in("client_id", ["__none__"]);
  }
  const itemsRes = await itemsQuery;

  return (
    <KanbanView
      advisors={advisorsData.data ?? []}
      clients={visibleClients.map(({ id, household_name }) => ({
        id,
        household_name,
      }))}
      initialItems={itemsRes.data ?? []}
      includeArchived={includeArchived}
      archivedClientIds={archivedClientIds}
      archivedCount={archivedClientIds.length}
    />
  );
}
