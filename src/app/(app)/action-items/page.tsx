// Action items server entry — loads advisors + clients lookup + the
// current advisor's id/email for "Me" + "My open" / "My overdue"
// saved views. The view component owns the in-memory filter pipeline.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ActionItemsView } from "./_ActionItemsView";

export default async function ActionItemsPage() {
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
    supabase.from("clients").select("id, household_name").order("household_name"),
    supabase
      .from("advisors")
      .select("id, email")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  return (
    <ActionItemsView
      advisors={advisorsRes.data ?? []}
      clients={clientsRes.data ?? []}
      meEmail={meRes.data?.email ?? null}
    />
  );
}
