import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GenerateForm } from "./_GenerateForm";

// Server-loads the client list with archetype + status so the form's
// <Select> can render Claude Design's `name · archetype · status`
// formatted options without a per-keystroke fetch.
export default async function GeneratePlanPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("clients")
    .select("id, household_name, archetype, status, lead_advisor_id, advisors:lead_advisor_id(first_name, last_name)")
    .neq("status", "inactive")
    .order("household_name");

  return (
    <div className="flex flex-col gap-6">
      {/* Crumbs + heading per Claude Design's PageHead */}
      <div>
        <nav
          className="flex items-center gap-1.5 text-[11px] uppercase"
          style={{ color: "var(--text-3)", letterSpacing: "0.06em" }}
        >
          <Link href="/clients" className="hover:underline" style={{ color: "var(--text-2)" }}>
            Plans
          </Link>
          <span>›</span>
          <span>Generate</span>
        </nav>
        <h1
          className="mt-2 text-3xl font-medium"
          style={{
            fontFamily: "var(--font-display)",
            letterSpacing: "-0.01em",
            color: "var(--text)",
          }}
        >
          Generate plan
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-2)" }}>
          Queue a new comprehensive wealth plan for orchestrator processing.
        </p>
      </div>

      <GenerateForm clients={data ?? []} />
    </div>
  );
}
