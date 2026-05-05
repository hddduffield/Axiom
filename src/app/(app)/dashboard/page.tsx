// Dashboard server entry — fetches the universe needed by the polished
// view: my action items (filter pipeline runs in JS), clients lookup,
// plan-by-status counts, recent notes + lens runs (for the activity
// stream). All rendering / interaction lives in <DashboardView>.
//
// Phase 11.5.3 — archived clients (status='inactive') are excluded
// from every query feeding the dashboard. The dashboard is the clean
// working view; archived data is opt-in via deep navigation (the
// /clients list with the Archived chip selected, and the Include
// Archived toggles on /action-items and /notes).

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardView } from "./_DashboardView";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: advisor } = await supabase
    .from("advisors")
    .select("id, email, first_name, last_name")
    .eq("id", user.id)
    .maybeSingle();
  if (!advisor) redirect("/sign-in?error=not_authorized");

  // Pre-fetch clients to derive activeClientIds for downstream filters.
  // Cheap (small set) and unblocks the dashboard's "no archived data"
  // contract without per-query JOINs.
  const { data: allClients } = await supabase
    .from("clients")
    .select("id, household_name, status")
    .order("household_name");
  const visibleClients = (allClients ?? []).filter(
    (c) => c.status !== "inactive",
  );
  const activeClientIds = visibleClients.map((c) => c.id);
  // Sentinel for the empty-set edge case so .in() stays well-formed.
  const inFilter = activeClientIds.length > 0 ? activeClientIds : ["__none__"];

  const [
    myItemsRes,
    plansRes,
    recentNotesRes,
    lensRunsRes,
    completedRecentRes,
  ] = await Promise.all([
    supabase
      .from("action_items")
      .select("*")
      .eq("owner", advisor.email)
      .in("client_id", inFilter)
      .order("created_at", { ascending: true }),
    supabase
      .from("plans")
      .select("id, status, client_id")
      .in("client_id", inFilter),
    supabase
      .from("notes")
      .select(
        "id, body, tag, created_at, client_id, author_advisor_id, promoted_to_action_item_id, advisors:author_advisor_id(first_name, last_name)",
      )
      .in("client_id", inFilter)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("lens_runs")
      .select("id, lens_type, client_id, generated_at, context_input")
      .in("client_id", inFilter)
      .order("generated_at", { ascending: false })
      .limit(10),
    // Recent completes across the whole portfolio, for the activity stream.
    supabase
      .from("action_items")
      .select("id, description, client_id, completed_at")
      .eq("status", "complete")
      .in("client_id", inFilter)
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false })
      .limit(10),
  ]);

  return (
    <DashboardView
      advisor={advisor}
      myItems={myItemsRes.data ?? []}
      clients={visibleClients.map(({ id, household_name }) => ({
        id,
        household_name,
      }))}
      plans={plansRes.data ?? []}
      recentNotes={recentNotesRes.data ?? []}
      recentLensRuns={lensRunsRes.data ?? []}
      recentCompletes={completedRecentRes.data ?? []}
    />
  );
}
