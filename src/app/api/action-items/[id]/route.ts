import { z } from "zod";
import { requireAdvisor } from "@/lib/api/auth";
import { err, noContent, ok } from "@/lib/api/respond";
import { dbErrorMessage, mapDbError } from "@/lib/api/db_queries";
import type { Database } from "@/lib/supabase/database.types";

type ActionItemUpdate = Database["public"]["Tables"]["action_items"]["Update"];

const updateSchema = z.object({
  description: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  duration_class: z.enum(["one_time", "long_running"]).optional(),
  timing_bucket: z.string().min(1).optional(),
  owner: z.string().min(1).optional(),
  partner_required: z.boolean().optional(),
  partner_type: z.string().nullable().optional(),
  status: z.enum(["not_started", "in_progress", "pending_decision", "complete"]).optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/action-items/[id]
export async function GET(_request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const { data, error } = await auth.supabase
    .from("action_items")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return err(mapDbError(error), dbErrorMessage(error));
  if (!data) return err("not_found", `No action item with id ${id}.`);
  return ok(data);
}

// PATCH /api/action-items/[id]
//
// When status flips to 'complete', server-side stamps completed_at +
// completed_by_advisor_id (only on the first transition — re-PATCH to
// 'complete' on an already-complete item is a no-op for those fields).
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
    return err("validation_failed", "Invalid action item patch.", parsed.error.issues);
  }

  // Need the current row to decide whether to stamp completed_at.
  const { data: current, error: fetchErr } = await auth.supabase
    .from("action_items")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return err(mapDbError(fetchErr), dbErrorMessage(fetchErr));
  if (!current) return err("not_found", `No action item with id ${id}.`);

  const patch: ActionItemUpdate = { ...parsed.data };
  if (parsed.data.status === "complete" && current.status !== "complete") {
    patch.completed_at = new Date().toISOString();
    patch.completed_by_advisor_id = auth.advisor.id;
  }

  const { data, error } = await auth.supabase
    .from("action_items")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return err(mapDbError(error), dbErrorMessage(error));
  // TODO: Phase 5e — audit_log insert (action='completed' if status flipped, else 'updated').
  return ok(data);
}

// DELETE /api/action-items/[id] — hard delete (cascades to children via
// parent_action_item_id ON DELETE CASCADE in the schema).
export async function DELETE(_request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const { data, error } = await auth.supabase
    .from("action_items")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return err(mapDbError(error), dbErrorMessage(error));
  if (!data) return err("not_found", `No action item with id ${id}.`);
  // TODO: Phase 5e — audit_log insert (entity='action_item', action='deleted').
  return noContent();
}
