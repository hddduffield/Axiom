import { createClient } from "@/lib/supabase/server";
import { GenerateForm } from "./_GenerateForm";

// Server-loads the client list so the form's <Select> doesn't need its
// own fetch round-trip.
export default async function GeneratePlanPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("clients")
    .select("id, household_name")
    .neq("status", "inactive")
    .order("household_name");
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-semibold tracking-tight">Generate Plan</h1>
      <p className="mt-2 text-muted-foreground">
        v1 skips Stages 0/1/2 — upload pre-prepared <code>ClientProfile</code>
        {" "}and <code>SelectedRecommendations</code> JSON. The CLI processes
        queued plans (run <code>npm run generate-pending</code> locally).
      </p>
      <div className="mt-6">
        <GenerateForm clients={data ?? []} />
      </div>
    </div>
  );
}
