// Phase 13 — Cash Flow Lens detail page.
//
// Server-loads the lens row + parent client. Hands off to the Client
// Component which owns local state for in-progress edits + AI suggestion
// flow.

import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CashFlowLensView } from "./_CashFlowLensView";
import { defaultCashFlowOutput, isCashFlowLensOutput } from "@/lib/api/cash_flow_lens";

interface RouteContext {
  params: Promise<{ id: string; runId: string }>;
}

export default async function CashFlowLensPage({ params }: RouteContext) {
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
      .eq("lens_type", "cash_flow")
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

  // Defensive seed: an old row missing schema_version 1 gets re-seeded with
  // the client snapshot embedded so the form renders rather than 500s.
  const output = isCashFlowLensOutput(lensRes.data.output)
    ? lensRes.data.output
    : defaultCashFlowOutput({
        household_name: clientRes.data.household_name,
        archetype: clientRes.data.archetype ?? null,
        age: null,
      });

  return (
    <div className="flex flex-col gap-5">
      {/* Crumbs */}
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
        <span>Cash Flow Lens</span>
      </nav>

      <CashFlowLensView
        lensRun={lensRes.data}
        client={clientRes.data}
        initialOutput={output}
      />
    </div>
  );
}
