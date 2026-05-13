// Phase 13.2 — POST /api/lens-runs/cash-flow
//
// Creates a new draft cash-flow lens run for a client. Returns the new
// row so the UI can navigate to /clients/[id]/lens-runs/cash-flow/[runId].

import { z } from "zod";
import { requireAdvisor } from "@/lib/api/auth";
import { created, err } from "@/lib/api/respond";
import { dbErrorMessage, mapDbError } from "@/lib/api/db_queries";
import { defaultCashFlowOutput, type CashFlowLensOutput } from "@/lib/api/cash_flow_lens";
import {
  extractCashFlowFromClientProfile,
  getLatestFinalizedPlanForClient,
} from "@/lib/lens-prefill";
import type { Json } from "@/lib/supabase/database.types";

const createSchema = z.object({
  client_id: z.string().uuid(),
});

export async function POST(request: Request) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return err("validation_failed", "Body must be valid JSON.");
  }
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return err("validation_failed", "Invalid payload.", parsed.error.issues);
  }

  // Fetch client snapshot for default seed.
  const { data: client, error: clientErr } = await auth.supabase
    .from("clients")
    .select("id, household_name, archetype")
    .eq("id", parsed.data.client_id)
    .maybeSingle();
  if (clientErr) return err(mapDbError(clientErr), dbErrorMessage(clientErr));
  if (!client) return err("not_found", "Client not found.");

  // Phase 16 — try to pre-fill from the latest finalized plan's
  // ClientProfile. If none exists, fall back to the default seed.
  let seed: CashFlowLensOutput;
  const latest = await getLatestFinalizedPlanForClient(auth.supabase, client.id);
  if (latest) {
    const { output, sourced_fields } = extractCashFlowFromClientProfile({
      profile: latest.client_profile,
      household_name: client.household_name,
      archetype: client.archetype ?? null,
    });
    seed = {
      ...output,
      source: {
        plan_id: latest.plan_id,
        plan_generated_at: latest.generated_at,
        sourced_fields,
        edited_fields: [],
      },
    };
  } else {
    seed = defaultCashFlowOutput({
      household_name: client.household_name,
      archetype: client.archetype ?? null,
      age: null,
    });
  }

  const { data, error } = await auth.supabase
    .from("lens_runs")
    .insert({
      client_id: client.id,
      generated_by_advisor_id: auth.advisor.id,
      lens_type: "cash_flow",
      status: "draft",
      output: seed as unknown as Json,
      cost_cents: 0,
      context_input: null,
    })
    .select("*")
    .single();
  if (error) return err(mapDbError(error), dbErrorMessage(error));

  return created(data);
}
