// Notes hub server entry — fetches advisors / clients / 200 most recent
// notes plus the current advisor (for "Me" filter chip + self-authored
// rail in the feed). All real wiring lives in <NotesView>.
//
// Phase 11.5.2 — archived clients' notes are hidden by default. The
// page accepts ?archived=1 to include them with a muted treatment in
// the feed. The composer's client dropdown ALWAYS shows only active +
// prospect clients regardless of the toggle (you don't add new notes
// to an archived client).

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NotesView } from "./_NotesView";

export default async function NotesPage({
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

  const [advisorsRes, clientsRes, meRes] = await Promise.all([
    supabase
      .from("advisors")
      .select("id, email, first_name, last_name")
      .order("first_name"),
    supabase
      .from("clients")
      .select("id, household_name, status")
      .order("household_name"),
    supabase
      .from("advisors")
      .select("id, email, first_name")
      .eq("id", user.id)
      .maybeSingle(),
  ]);
  const allClients = clientsRes.data ?? [];
  const archivedClientIds = allClients
    .filter((c) => c.status === "inactive")
    .map((c) => c.id);
  const composerClients = allClients
    .filter((c) => c.status !== "inactive")
    .map(({ id, household_name }) => ({ id, household_name }));

  // Server-side notes filter: exclude archived clients' notes by
  // default; include all when ?archived=1.
  const allowedClientIds = includeArchived
    ? allClients.map((c) => c.id)
    : composerClients.map((c) => c.id);

  let notesQuery = supabase
    .from("notes")
    .select(
      "id, body, tag, created_at, client_id, author_advisor_id, promoted_to_action_item_id",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  // .in() with an empty array would match everything in some adapters;
  // explicitly stub to the no-match sentinel so the query stays well-formed.
  notesQuery = notesQuery.in(
    "client_id",
    allowedClientIds.length > 0 ? allowedClientIds : ["__none__"],
  );
  const notesRes = await notesQuery;

  return (
    <NotesView
      advisors={advisorsRes.data ?? []}
      clients={allClients.map(({ id, household_name }) => ({
        id,
        household_name,
      }))}
      composerClients={composerClients}
      archivedClientIds={archivedClientIds}
      includeArchived={includeArchived}
      initialNotes={notesRes.data ?? []}
      meId={meRes.data?.id ?? null}
      meEmail={meRes.data?.email ?? null}
    />
  );
}
