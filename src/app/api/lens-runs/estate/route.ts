// Phase 14.2 — POST /api/lens-runs/estate
//
// Creates a new draft estate lens run for a client. Returns the new row
// so the UI can navigate to /clients/[id]/lens-runs/estate/[runId].
//
// Supports multiple scenarios per client — each create is a fresh row.

import { z } from "zod";
import { requireAdvisor } from "@/lib/api/auth";
import { created, err } from "@/lib/api/respond";
import { dbErrorMessage, mapDbError } from "@/lib/api/db_queries";
import { defaultEstateOutput } from "@/lib/estate-lens/types";
import type { Json } from "@/lib/supabase/database.types";

const createSchema = z.object({
  client_id: z.string().uuid(),
  scenario_name: z.string().min(1).max(120).optional(),
  state_code: z.string().length(2).optional(),
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

  const { data: client, error: clientErr } = await auth.supabase
    .from("clients")
    .select("id, household_name, archetype")
    .eq("id", parsed.data.client_id)
    .maybeSingle();
  if (clientErr) return err(mapDbError(clientErr), dbErrorMessage(clientErr));
  if (!client) return err("not_found", "Client not found.");

  // Count existing scenarios so default name = "Scenario N".
  const { count } = await auth.supabase
    .from("lens_runs")
    .select("id", { count: "exact", head: true })
    .eq("client_id", client.id)
    .eq("lens_type", "estate");

  const scenarioName =
    parsed.data.scenario_name ?? `Scenario ${(count ?? 0) + 1}`;

  const seed = defaultEstateOutput({
    household_name: client.household_name,
    archetype: client.archetype ?? null,
    state_code: parsed.data.state_code ?? null,
    scenario_name: scenarioName,
  });

  const { data, error } = await auth.supabase
    .from("lens_runs")
    .insert({
      client_id: client.id,
      generated_by_advisor_id: auth.advisor.id,
      lens_type: "estate",
      status: "draft",
      output: seed as unknown as Json,
      cost_cents: 0,
      context_input: scenarioName,
    })
    .select("*")
    .single();
  if (error) return err(mapDbError(error), dbErrorMessage(error));

  return created(data);
}
