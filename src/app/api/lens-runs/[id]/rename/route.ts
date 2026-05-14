// Phase 18.7 — POST /api/lens-runs/[id]/rename
//
// Updates the lens scenario's display name (stored in context_input).
// For estate lenses, also mirrors into output.scenario_name so the PDF
// and any compliance footer use the new name. For cash flow lenses the
// name lives only in context_input.
//
// Body: { name: string } — non-empty, ≤120 chars.

import { z } from "zod";
import { requireAdvisor } from "@/lib/api/auth";
import { err, ok } from "@/lib/api/respond";
import { dbErrorMessage, mapDbError } from "@/lib/api/db_queries";
import type { Json } from "@/lib/supabase/database.types";

const bodySchema = z.object({
  name: z.string().min(1).max(120),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return err("validation_failed", "Body must be valid JSON.");
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return err("validation_failed", "Invalid payload.", parsed.error.issues);
  }

  const { data: existing, error: fetchErr } = await auth.supabase
    .from("lens_runs")
    .select("id, lens_type, output")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return err(mapDbError(fetchErr), dbErrorMessage(fetchErr));
  if (!existing) return err("not_found", `No lens run with id ${id}.`);

  const newName = parsed.data.name.trim();
  const updateBody: { context_input: string; output?: Json } = {
    context_input: newName,
  };

  // For estate lenses, also reflect in output.scenario_name so the PDF
  // header stays in sync.
  if (existing.lens_type === "estate") {
    const current = (existing.output as Record<string, unknown> | null) ?? {};
    updateBody.output = {
      ...current,
      scenario_name: newName,
    } as unknown as Json;
  }

  const { data, error } = await auth.supabase
    .from("lens_runs")
    .update(updateBody)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return err(mapDbError(error), dbErrorMessage(error));

  return ok(data);
}
