// Phase 18.5 — POST /api/lens-runs/[id]/update-summary
//
// Persists an advisor-edited executive summary. Marks
// generated_by='manual' so the UI can hide the "Regenerate" affordance
// (or warn the advisor that regenerating will overwrite their text).
//
// Body: { text: string } — must be non-empty.

import { z } from "zod";
import { requireAdvisor } from "@/lib/api/auth";
import { err, ok } from "@/lib/api/respond";
import { dbErrorMessage, mapDbError } from "@/lib/api/db_queries";
import type { Json } from "@/lib/supabase/database.types";

const bodySchema = z.object({
  text: z.string().min(1).max(4000),
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

  const { data: lensRow, error: fetchErr } = await auth.supabase
    .from("lens_runs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return err(mapDbError(fetchErr), dbErrorMessage(fetchErr));
  if (!lensRow) return err("not_found", `No lens run with id ${id}.`);

  const summary = {
    text: parsed.data.text.trim(),
    generated_at: new Date().toISOString(),
    generated_by: "manual" as const,
  };

  const newOutput = {
    ...(lensRow.output as Record<string, unknown>),
    executive_summary: summary,
  };

  const { data: updated, error: updErr } = await auth.supabase
    .from("lens_runs")
    .update({ output: newOutput as unknown as Json })
    .eq("id", id)
    .select("*")
    .single();
  if (updErr) return err(mapDbError(updErr), dbErrorMessage(updErr));

  return ok(updated);
}
