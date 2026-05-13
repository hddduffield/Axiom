// Phase 16.3 — POST /api/lens-runs/estate/[id]/refresh-from-plan
//
// Inverse symmetry with cash-flow's refresh endpoint. Same algorithm:
// merge fresh extractor output onto current lens output, preserving any
// fields the advisor has manually edited (output.source.edited_fields).

import { requireAdvisor } from "@/lib/api/auth";
import { err, ok } from "@/lib/api/respond";
import { dbErrorMessage, mapDbError } from "@/lib/api/db_queries";
import {
  isEstateLensOutput,
  type EstateLensOutput,
} from "@/lib/estate-lens/types";
import {
  extractEstateFromClientProfile,
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
  if (lensRow.lens_type !== "estate") {
    return err("validation_failed", "Lens is not an estate type.");
  }
  if (lensRow.status !== "draft") {
    return err("conflict", `Cannot refresh a ${lensRow.status} lens.`);
  }
  if (!isEstateLensOutput(lensRow.output)) {
    return err("validation_failed", "Lens output not in estate shape.");
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

  const current = lensRow.output as EstateLensOutput;
  const { output: fresh, sourced_fields } = extractEstateFromClientProfile({
    profile: latest.client_profile,
    household_name: client.household_name,
    archetype: client.archetype ?? null,
    scenario_name: current.scenario_name,
  });

  const merged = mergeRefresh<EstateLensOutput>({
    current,
    fresh,
    sourced_fields,
    plan_id: latest.plan_id,
    plan_generated_at: latest.generated_at,
  });
  // Re-stamp tracking_id from current (it's not part of the extractor's
  // output and shouldn't change on refresh).
  merged.tracking_id = current.tracking_id;

  const { data, error: updErr } = await auth.supabase
    .from("lens_runs")
    .update({ output: merged as unknown as Json })
    .eq("id", id)
    .select("*")
    .single();
  if (updErr) return err(mapDbError(updErr), dbErrorMessage(updErr));

  return ok(data);
}
