import { z } from "zod";
import { requireAdvisor } from "@/lib/api/auth";
import { err, noContent, ok } from "@/lib/api/respond";
import { MOCK_ACTION_ITEMS_BY_ID } from "@/lib/api/_mocks";
import type { ActionItem } from "@/lib/api/types";

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
  const item = MOCK_ACTION_ITEMS_BY_ID[id];
  if (!item) return err("not_found", `No action item with id ${id}.`);
  return ok(item);
}

// PATCH /api/action-items/[id]
// TODO: Phase 5 — supabase update; if status → complete, set completed_at + completed_by_advisor_id;
//                 audit_log insert ('updated' or 'completed').
export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const item = MOCK_ACTION_ITEMS_BY_ID[id];
  if (!item) return err("not_found", `No action item with id ${id}.`);

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

  const now = new Date().toISOString();
  const wantsComplete = parsed.data.status === "complete";
  const updated: ActionItem = {
    ...item,
    ...parsed.data,
    completed_at: wantsComplete ? (item.completed_at ?? now) : item.completed_at,
    completed_by_advisor_id: wantsComplete
      ? (item.completed_by_advisor_id ?? auth.advisor.id)
      : item.completed_by_advisor_id,
    updated_at: now,
  };
  return ok(updated);
}

// DELETE /api/action-items/[id]
// TODO: Phase 5 — supabase delete; cascade behavior + audit_log.
export async function DELETE(_request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const item = MOCK_ACTION_ITEMS_BY_ID[id];
  if (!item) return err("not_found", `No action item with id ${id}.`);
  return noContent();
}
