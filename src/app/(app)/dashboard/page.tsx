// Dashboard server entry — fetches the universe needed by the polished
// view: my action items (filter pipeline runs in JS), clients lookup,
// plan-by-status counts, recent notes + lens runs (for the activity
// stream). All rendering / interaction lives in <DashboardView>.

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

  const [
    myItemsRes,
    clientsRes,
    plansRes,
    recentNotesRes,
    lensRunsRes,
    completedRecentRes,
  ] = await Promise.all([
    supabase
      .from("action_items")
      .select("*")
      .eq("owner", advisor.email)
      .order("created_at", { ascending: true }),
    supabase.from("clients").select("id, household_name").order("household_name"),
    supabase.from("plans").select("id, status, client_id"),
    supabase
      .from("notes")
      .select(
        "id, body, tag, created_at, client_id, author_advisor_id, promoted_to_action_item_id, advisors:author_advisor_id(first_name, last_name)",
      )
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("lens_runs")
      .select("id, lens_type, client_id, generated_at, context_input")
      .order("generated_at", { ascending: false })
      .limit(10),
    // Recent completes across the whole portfolio, for the activity stream.
    supabase
      .from("action_items")
      .select("id, description, client_id, completed_at")
      .eq("status", "complete")
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false })
      .limit(10),
  ]);

  return (
    <DashboardView
      advisor={advisor}
      myItems={myItemsRes.data ?? []}
      clients={clientsRes.data ?? []}
      plans={plansRes.data ?? []}
      recentNotes={recentNotesRes.data ?? []}
      recentLensRuns={lensRunsRes.data ?? []}
      recentCompletes={completedRecentRes.data ?? []}
    />
  );
}
