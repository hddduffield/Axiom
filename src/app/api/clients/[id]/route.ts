import { z } from "zod";
import { requireAdvisor } from "@/lib/api/auth";
import { err, noContent, ok } from "@/lib/api/respond";
import { dbErrorMessage, mapDbError } from "@/lib/api/db_queries";

const updateSchema = z.object({
  lead_advisor_id: z.string().uuid().optional(),
  household_name: z.string().min(1).optional(),
  status: z.enum(["active", "inactive", "prospect"]).optional(),
  archetype: z.enum(["PRE", "MID", "POST", "NONE"]).nullable().optional(),
  notes: z.string().nullable().optional(),
  cadence_target_days: z.number().int().min(1).max(3650).nullable().optional(),
  cadence_custom_label: z.string().max(120).nullable().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/clients/[id]
export async function GET(_request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const { data, error } = await auth.supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return err(mapDbError(error), dbErrorMessage(error));
  if (!data) return err("not_found", `No client with id ${id}.`);
  return ok(data);
}

// PATCH /api/clients/[id]
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
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) {
    return err("validation_failed", "Invalid client patch.", parsed.error.issues);
  }

  const { data, error } = await auth.supabase
    .from("clients")
    .update(parsed.data)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) return err(mapDbError(error), dbErrorMessage(error));
  if (!data) return err("not_found", `No client with id ${id}.`);
  // TODO: Phase 5e — audit_log insert (entity='client', action='updated').
  return ok(data);
}

// DELETE /api/clients/[id] — soft-delete (status → inactive). Phase 5
// keeps the row so plan / action_item history is preserved.
export async function DELETE(_request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const { data, error } = await auth.supabase
    .from("clients")
    .update({ status: "inactive" })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return err(mapDbError(error), dbErrorMessage(error));
  if (!data) return err("not_found", `No client with id ${id}.`);
  // TODO: Phase 5e — audit_log insert (entity='client', action='deleted').
  return noContent();
}
