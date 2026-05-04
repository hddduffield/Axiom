// Notes hub server entry — fetches advisors / clients / 200 most recent
// notes plus the current advisor (for "Me" filter chip + self-authored
// rail in the feed). All real wiring lives in <NotesView>.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NotesView } from "./_NotesView";

export default async function NotesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const [advisorsRes, clientsRes, notesRes, meRes] = await Promise.all([
    supabase
      .from("advisors")
      .select("id, email, first_name, last_name")
      .order("first_name"),
    supabase.from("clients").select("id, household_name").order("household_name"),
    // No global notes API endpoint yet — read direct (matches dashboard).
    supabase
      .from("notes")
      .select(
        "id, body, tag, created_at, client_id, author_advisor_id, promoted_to_action_item_id",
      )
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("advisors")
      .select("id, first_name")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  return (
    <NotesView
      advisors={advisorsRes.data ?? []}
      clients={clientsRes.data ?? []}
      initialNotes={notesRes.data ?? []}
      meId={meRes.data?.id ?? null}
    />
  );
}
