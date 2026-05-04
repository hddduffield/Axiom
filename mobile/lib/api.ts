// Mobile API wrappers — thin functions over the shared Supabase client.
//
// Mobile reads/writes Supabase **directly** (not through the Next.js
// /api/* routes). The advisor's RLS gate is enforced server-side via
// the `is_active_advisor()` helper, so any signed-in user whose
// `advisors` row has `active=true` can read clients and write notes
// just like the web app.

import { supabase } from "./supabase";
import type { Advisor, Client, NewNoteInput, Note, NoteWithJoins } from "./types";

export async function getCurrentAdvisor(): Promise<Advisor | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("advisors")
    .select("id, email, first_name, last_name, active")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw new Error(`Could not load advisor: ${error.message}`);
  return data as Advisor | null;
}

export async function listClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from("clients")
    .select("id, household_name, status")
    .neq("status", "inactive")
    .order("household_name");
  if (error) throw new Error(`Could not list clients: ${error.message}`);
  return (data ?? []) as Client[];
}

export async function listRecentNotes(limit = 30): Promise<NoteWithJoins[]> {
  const { data, error } = await supabase
    .from("notes")
    .select(
      "id, client_id, author_advisor_id, body, tag, promoted_to_action_item_id, created_at, clients(household_name), advisors:author_advisor_id(first_name, last_name)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Could not load notes: ${error.message}`);
  return (data ?? []) as unknown as NoteWithJoins[];
}

export async function createNote(input: NewNoteInput): Promise<Note> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const { data, error } = await supabase
    .from("notes")
    .insert({
      client_id: input.client_id,
      author_advisor_id: user.id,
      body: input.body,
      tag: input.tag,
    })
    .select(
      "id, client_id, author_advisor_id, body, tag, promoted_to_action_item_id, created_at",
    )
    .single();
  if (error) throw new Error(`Could not save note: ${error.message}`);
  return data as Note;
}
