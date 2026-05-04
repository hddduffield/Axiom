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

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { KanbanView } from "./_KanbanView";

export default async function ActionItemsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const [advisorsRes, clientsRes, itemsRes] = await Promise.all([
    supabase
      .from("advisors")
      .select("id, email, first_name, last_name")
      .eq("active", true)
      .order("first_name"),
    supabase
      .from("clients")
      .select("id, household_name")
      .order("household_name"),
    supabase
      .from("action_items")
      .select("*")
      .order("created_at", { ascending: false }),
  ]);

  return (
    <KanbanView
      advisors={advisorsRes.data ?? []}
      clients={clientsRes.data ?? []}
      initialItems={itemsRes.data ?? []}
    />
  );
}
