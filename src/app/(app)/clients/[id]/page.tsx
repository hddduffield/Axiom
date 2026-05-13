// Server entrypoint for /clients/[id] — fetches all six tabs' data in
// parallel and hands off to <ClientDetailView> (Client Component) which
// owns tab state + the ActionItemDrawer.

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ClientDetailView } from "./_ClientDetailView";

interface RouteContext {
  params: Promise<{ id: string }>;
  // Phase 15.3 — ?archived=1 widens the Lens Runs tab query to include
  // archived rows. The toggle Chip is on the Lens Runs tab; URL state
  // makes it shareable and survives a refresh.
  searchParams?: Promise<{ archived?: string }>;
}

export default async function ClientDetailPage({ params, searchParams }: RouteContext) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const includeArchivedLensRuns = sp.archived === "1";
  const supabase = await createClient();

  const [
    clientRes,
    plansRes,
    actionItemsRes,
    notesRes,
    partnersRes,
    lensRunsRes,
    advisorsRes,
  ] = await Promise.all([
    supabase
      .from("clients")
      .select("*, advisors:lead_advisor_id(first_name, last_name, email)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("plans")
      .select(
        "id, status, generated_at, approved_at, fact_review_filename, cost_cents",
      )
      .eq("client_id", id)
      .order("generated_at", { ascending: false }),
    supabase
      .from("action_items")
      .select("*")
      .eq("client_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("notes")
      .select(
        "*, advisors:author_advisor_id(first_name, last_name)",
      )
      .eq("client_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("partners")
      .select("*")
      .eq("client_id", id)
      .order("created_at", { ascending: false }),
    includeArchivedLensRuns
      ? supabase
          .from("lens_runs")
          .select("id, lens_type, status, generated_at, cost_cents, context_input")
          .eq("client_id", id)
          .order("generated_at", { ascending: false })
      : supabase
          .from("lens_runs")
          .select("id, lens_type, status, generated_at, cost_cents, context_input")
          .eq("client_id", id)
          .neq("status", "archived")
          .order("generated_at", { ascending: false }),
    // Phase 11.1 — advisor list for the Edit dialog's lead-advisor dropdown.
    supabase
      .from("advisors")
      .select("id, first_name, last_name")
      .eq("active", true)
      .order("first_name"),
  ]);

  if (clientRes.error || !clientRes.data) {
    notFound();
  }

  return (
    <ClientDetailView
      client={clientRes.data}
      plans={plansRes.data ?? []}
      actionItems={actionItemsRes.data ?? []}
      notes={notesRes.data ?? []}
      partners={partnersRes.data ?? []}
      lensRuns={lensRunsRes.data ?? []}
      advisors={advisorsRes.data ?? []}
      includeArchivedLensRuns={includeArchivedLensRuns}
    />
  );
}
