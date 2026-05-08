// Phase 13.2 — PATCH /api/lens-runs/cash-flow/[id]
//
// Updates the cash-flow lens output JSONB. Body is the FULL replacement
// CashFlowLensOutput (not a partial diff) — the form re-sends the whole
// object on every Save, which is simpler and avoids merge bugs.
//
// Status is preserved unless explicitly set; only 'draft' status rows
// can be patched (you cannot edit an approved lens — restore to draft
// first via a hypothetical re-open flow, deferred to v1.5).

import { z } from "zod";
import { requireAdvisor } from "@/lib/api/auth";
import { err, ok } from "@/lib/api/respond";
import { dbErrorMessage, mapDbError } from "@/lib/api/db_queries";
import type { Json } from "@/lib/supabase/database.types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// We trust the shape from the client and persist as-is. Lightweight
// safety net: require schema_version=1 so an old client can't write
// stale shapes.
const patchSchema = z.object({
  output: z
    .object({ schema_version: z.literal(1) })
    .passthrough(),
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

  // Verify the lens exists, is cash_flow type, and is in draft state.
  const { data: existing, error: fetchErr } = await auth.supabase
    .from("lens_runs")
    .select("id, lens_type, status")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return err(mapDbError(fetchErr), dbErrorMessage(fetchErr));
  if (!existing) return err("not_found", `No lens run with id ${id}.`);
  if (existing.lens_type !== "cash_flow") {
    return err("validation_failed", "Lens run is not a cash_flow type.");
  }
  if (existing.status !== "draft") {
    return err("conflict", `Cannot edit a ${existing.status} lens. Restore to draft first.`);
  }

  const { data, error } = await auth.supabase
    .from("lens_runs")
    .update({ output: parsed.data.output as unknown as Json })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return err(mapDbError(error), dbErrorMessage(error));

  return ok(data);
}
