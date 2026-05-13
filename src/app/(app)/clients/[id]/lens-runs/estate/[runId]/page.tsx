// Phase 14.2 — Estate Lens detail page.
//
// Server-loads the lens + parent client. Hands off to the Client Component.

import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EstateLensView } from "./_EstateLensView";
import {
  defaultEstateOutput,
  isEstateLensOutput,
} from "@/lib/estate-lens/types";

interface RouteContext {
  params: Promise<{ id: string; runId: string }>;
}

export default async function EstateLensPage({ params }: RouteContext) {
  const { id: clientId, runId } = await params;
  const supabase = await createClient();

  const [lensRes, clientRes] = await Promise.all([
    supabase
      .from("lens_runs")
      .select(
        "*, advisors:generated_by_advisor_id(first_name, last_name, email)",
      )
      .eq("id", runId)
      .eq("client_id", clientId)
      .eq("lens_type", "estate")
      .maybeSingle(),
    supabase
      .from("clients")
      .select("id, household_name, archetype, status, created_at")
      .eq("id", clientId)
      .maybeSingle(),
  ]);

  if (!clientRes.data || !lensRes.data) {
    notFound();
  }

  const output = isEstateLensOutput(lensRes.data.output)
    ? lensRes.data.output
    : defaultEstateOutput({
        household_name: clientRes.data.household_name,
        archetype: clientRes.data.archetype ?? null,
        state_code: null,
      });

  return (
    <div className="flex flex-col gap-5">
      <nav
        className="flex items-center gap-1.5 text-[11px] uppercase"
        style={{ color: "var(--text-3)", letterSpacing: "0.06em" }}
      >
        <Link href="/clients" className="hover:underline" style={{ color: "var(--text-2)" }}>
          Clients
        </Link>
        <span>›</span>
        <Link
          href={`/clients/${clientId}`}
          className="hover:underline"
          style={{ color: "var(--text-2)" }}
        >
          {clientRes.data.household_name}
        </Link>
        <span>›</span>
        <span>Estate Lens · {output.scenario_name}</span>
      </nav>

      <EstateLensView
        lensRun={lensRes.data}
        client={clientRes.data}
        initialOutput={output}
      />
    </div>
  );
}
