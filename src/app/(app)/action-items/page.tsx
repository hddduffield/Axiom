import { createClient } from "@/lib/supabase/server";
import { ActionItemsView } from "./_ActionItemsView";

// Server-load the lookup data (advisors + clients) once; the view itself
// is a Client Component because filters + status toggles + the detail
// dialog are all interactive.
export default async function ActionItemsPage() {
  const supabase = await createClient();
  const [advisorsRes, clientsRes] = await Promise.all([
    supabase.from("advisors").select("id, email, first_name, last_name").order("first_name"),
    supabase.from("clients").select("id, household_name").order("household_name"),
  ]);
  return (
    <ActionItemsView
      advisors={advisorsRes.data ?? []}
      clients={clientsRes.data ?? []}
    />
  );
}
