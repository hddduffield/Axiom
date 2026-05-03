import { z } from "zod";
import { requireAdvisor } from "@/lib/api/auth";
import { err, ok } from "@/lib/api/respond";
import { MOCK_NOTES_BY_ID } from "@/lib/api/_mocks";
import type { ActionItem, Note } from "@/lib/api/types";

const promoteSchema = z.object({
  description: z.string().min(1).optional(),
  category: z.string().min(1),
  duration_class: z.enum(["one_time", "long_running"]),
  timing_bucket: z.string().min(1),
  owner: z.string().min(1),
  partner_required: z.boolean().optional(),
  partner_type: z.string().nullable().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/notes/[id]/promote-to-action — manual promotion to an action item.
// TODO: Phase 5 — atomic transaction: insert action_item, update note's
//                 promoted_to_action_item_id, audit_log row.
export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const note = MOCK_NOTES_BY_ID[id];
  if (!note) return err("not_found", `No note with id ${id}.`);
  if (note.promoted_to_action_item_id) {
    return err(
      "conflict",
      `Note ${id} is already promoted to action item ${note.promoted_to_action_item_id}.`,
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return err("validation_failed", "Body must be valid JSON.");
  }
  const parsed = promoteSchema.safeParse(raw);
  if (!parsed.success) {
    return err("validation_failed", "Invalid promotion payload.", parsed.error.issues);
  }

  const now = new Date().toISOString();
  const newAction: ActionItem = {
    id: `mock-ai-promo-${Math.random().toString(36).slice(2, 8)}`,
    client_id: note.client_id,
    source_plan_id: null,
    source_lens_run_id: null,
    parent_action_item_id: null,
    description: parsed.data.description ?? note.body,
    category: parsed.data.category,
    duration_class: parsed.data.duration_class,
    timing_bucket: parsed.data.timing_bucket,
    owner: parsed.data.owner,
    partner_required: parsed.data.partner_required ?? false,
    partner_type: parsed.data.partner_type ?? null,
    status: "not_started",
    completed_at: null,
    completed_by_advisor_id: null,
    is_derivative_reminder: false,
    auto_generated_reminder_template: null,
    created_at: now,
    updated_at: now,
  };
  const updatedNote: Note = { ...note, promoted_to_action_item_id: newAction.id };
  return ok({ note: updatedNote, action_item: newAction });
}
