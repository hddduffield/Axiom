import { createClient } from "@/lib/supabase/server";
import { NotesView } from "./_NotesView";

export default async function NotesPage() {
  const supabase = await createClient();
  const [advisorsRes, clientsRes, notesRes] = await Promise.all([
    supabase.from("advisors").select("id, email, first_name, last_name").order("first_name"),
    supabase.from("clients").select("id, household_name").order("household_name"),
    // No global notes API endpoint — read direct (same pattern as the
    // dashboard widget). Phase 9 may promote to /api/notes if needed.
    supabase
      .from("notes")
      .select(
        "id, body, tag, created_at, client_id, author_advisor_id, promoted_to_action_item_id",
      )
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  return (
    <NotesView
      advisors={advisorsRes.data ?? []}
      clients={clientsRes.data ?? []}
      initialNotes={notesRes.data ?? []}
    />
  );
}
