// Phase 16.3 — POST /api/lens-runs/cash-flow/[id]/refresh-from-plan
//
// Re-runs extractCashFlowFromClientProfile against the LATEST finalized
// plan for the lens's client. Behavior:
//   - Look up latest finalized plan. If none, 409.
//   - Run the extractor to get a fresh seed.
//   - Merge fresh values onto the current lens output, preserving
//     anything the advisor has manually edited (output.source.edited_fields).
//   - Persist + return the updated row.
//
// Lens must be in 'draft' status (consistent with the cash-flow PATCH
// endpoint).

import { requireAdvisor } from "@/lib/api/auth";
import { err, ok } from "@/lib/api/respond";
import { dbErrorMessage, mapDbError } from "@/lib/api/db_queries";
import {
  isCashFlowLensOutput,
  type CashFlowLensOutput,
} from "@/lib/api/cash_flow_lens";
import {
  extractCashFlowFromClientProfile,
  getLatestFinalizedPlanForClient,
} from "@/lib/lens-prefill";
import { mergeRefresh } from "@/lib/lens-prefill/merge";
import type { Json } from "@/lib/supabase/database.types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const { data: lensRow, error: fetchErr } = await auth.supabase
    .from("lens_runs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return err(mapDbError(fetchErr), dbErrorMessage(fetchErr));
  if (!lensRow) return err("not_found", `No lens run with id ${id}.`);
  if (lensRow.lens_type !== "cash_flow") {
    return err("validation_failed", "Lens is not a cash_flow type.");
  }
  if (lensRow.status !== "draft") {
    return err("conflict", `Cannot refresh a ${lensRow.status} lens.`);
  }
  if (!isCashFlowLensOutput(lensRow.output)) {
    return err("validation_failed", "Lens output not in cash_flow shape.");
  }

  const latest = await getLatestFinalizedPlanForClient(auth.supabase, lensRow.client_id);
  if (!latest) {
    return err(
      "conflict",
      "No finalized plan available to refresh from. Generate a plan first.",
    );
  }

  const { data: client, error: clientErr } = await auth.supabase
    .from("clients")
    .select("household_name, archetype")
    .eq("id", lensRow.client_id)
    .maybeSingle();
  if (clientErr) return err(mapDbError(clientErr), dbErrorMessage(clientErr));
  if (!client) return err("not_found", "Client not found.");

  const { output: fresh, sourced_fields } = extractCashFlowFromClientProfile({
    profile: latest.client_profile,
    household_name: client.household_name,
    archetype: client.archetype ?? null,
  });

  const current = lensRow.output as CashFlowLensOutput;
  const merged = mergeRefresh<CashFlowLensOutput>({
    current,
    fresh,
    sourced_fields,
    plan_id: latest.plan_id,
    plan_generated_at: latest.generated_at,
  });

  const { data, error: updErr } = await auth.supabase
    .from("lens_runs")
    .update({ output: merged as unknown as Json })
    .eq("id", id)
    .select("*")
    .single();
  if (updErr) return err(mapDbError(updErr), dbErrorMessage(updErr));

  return ok(data);
}
