// Phase 14.2 — PATCH /api/lens-runs/estate/[id]
//
// Updates the estate lens output JSONB. Body is the FULL replacement
// EstateLensOutput. Only 'draft' lenses can be patched — finalized must
// be unfinalized first (deferred to v1.5).

import { z } from "zod";
import { requireAdvisor } from "@/lib/api/auth";
import { err, ok } from "@/lib/api/respond";
import { dbErrorMessage, mapDbError } from "@/lib/api/db_queries";
import type { Json } from "@/lib/supabase/database.types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const patchSchema = z.object({
  output: z.object({ schema_version: z.literal(1) }).passthrough(),
  scenario_name: z.string().min(1).max(120).optional(),
});

export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return err("validation_failed", "Body must be valid JSON.");
  }
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return err("validation_failed", "Invalid payload.", parsed.error.issues);
  }

  const { data: existing, error: fetchErr } = await auth.supabase
    .from("lens_runs")
    .select("id, lens_type, status")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return err(mapDbError(fetchErr), dbErrorMessage(fetchErr));
  if (!existing) return err("not_found", `No lens run with id ${id}.`);
  if (existing.lens_type !== "estate") {
    return err("validation_failed", "Lens run is not an estate type.");
  }
  if (existing.status !== "draft") {
    return err(
      "conflict",
      `Cannot edit a ${existing.status} lens. Restore to draft first.`,
    );
  }

  const updateRow: { output: Json; context_input?: string } = {
    output: parsed.data.output as unknown as Json,
  };
  if (parsed.data.scenario_name) {
    updateRow.context_input = parsed.data.scenario_name;
  }

  const { data, error } = await auth.supabase
    .from("lens_runs")
    .update(updateRow)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return err(mapDbError(error), dbErrorMessage(error));

  return ok(data);
}
