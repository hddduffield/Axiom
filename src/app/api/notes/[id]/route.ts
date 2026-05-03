import { z } from "zod";
import { requireAdvisor } from "@/lib/api/auth";
import { err, noContent, ok } from "@/lib/api/respond";
import { dbErrorMessage, mapDbError } from "@/lib/api/db_queries";

const updateSchema = z.object({
  body: z.string().min(1).optional(),
  tag: z.string().nullable().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

// PATCH /api/notes/[id] — author-only edit at the API layer. RLS allows
// any active advisor to UPDATE any row; we add the author check so notes
// can't be edited out from under their author. (v1.5+ may move this into
// a stricter RLS policy once we have more consumers.)
export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const { data: existing, error: fetchErr } = await auth.supabase
    .from("notes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return err(mapDbError(fetchErr), dbErrorMessage(fetchErr));
  if (!existing) return err("not_found", `No note with id ${id}.`);
  if (existing.author_advisor_id !== auth.advisor.id) {
    return err("not_authorized", "Only the note's author can edit it.");
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return err("validation_failed", "Body must be valid JSON.");
  }
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) {
    return err("validation_failed", "Invalid note patch.", parsed.error.issues);
  }

  const { data, error } = await auth.supabase
    .from("notes")
    .update(parsed.data)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return err(mapDbError(error), dbErrorMessage(error));
  // TODO: Phase 5e — audit_log insert (entity='note', action='updated').
  return ok(data);
}

// DELETE /api/notes/[id] — author-only.
export async function DELETE(_request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const { data: existing, error: fetchErr } = await auth.supabase
    .from("notes")
    .select("id, author_advisor_id")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return err(mapDbError(fetchErr), dbErrorMessage(fetchErr));
  if (!existing) return err("not_found", `No note with id ${id}.`);
  if (existing.author_advisor_id !== auth.advisor.id) {
    return err("not_authorized", "Only the note's author can delete it.");
  }

  const { error } = await auth.supabase.from("notes").delete().eq("id", id);
  if (error) return err(mapDbError(error), dbErrorMessage(error));
  // TODO: Phase 5e — audit_log insert (entity='note', action='deleted').
  return noContent();
}
