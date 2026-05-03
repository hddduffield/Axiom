import { z } from "zod";
import { requireAdvisor } from "@/lib/api/auth";
import { err, ok } from "@/lib/api/respond";
import { dbErrorMessage, mapDbError } from "@/lib/api/db_queries";

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

// POST /api/notes/[id]/promote-to-action — create the action item AND
// link the note's promoted_to_action_item_id in two sequential queries.
//
// Not a true Postgres transaction (Supabase JS doesn't expose one); on
// the rare case where the second update fails we'd leave a stranded
// action_item with no linked note. Phase 5e can promote this to an RPC
// for atomicity once the audit_log + Inngest plumbing is in place.
export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  // Fetch the note (also gives us client_id + the conflict signal).
  const { data: note, error: noteErr } = await auth.supabase
    .from("notes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (noteErr) return err(mapDbError(noteErr), dbErrorMessage(noteErr));
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

  // 1) Insert the action item.
  const { data: action, error: actionErr } = await auth.supabase
    .from("action_items")
    .insert({
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
    })
    .select("*")
    .single();
  if (actionErr) return err(mapDbError(actionErr), dbErrorMessage(actionErr));

  // 2) Update the note with the new action_item id.
  const { data: updatedNote, error: noteUpdateErr } = await auth.supabase
    .from("notes")
    .update({ promoted_to_action_item_id: action.id })
    .eq("id", id)
    .select("*")
    .single();
  if (noteUpdateErr) {
    return err(
      mapDbError(noteUpdateErr),
      `Action item ${action.id} created but failed to link to note ${id}: ${dbErrorMessage(noteUpdateErr)}`,
    );
  }
  // TODO: Phase 5e — audit_log inserts (entity='action_item', 'created' + entity='note', 'updated').
  return ok({ note: updatedNote, action_item: action });
}
