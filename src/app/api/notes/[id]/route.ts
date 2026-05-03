import { z } from "zod";
import { requireAdvisor } from "@/lib/api/auth";
import { err, noContent, ok } from "@/lib/api/respond";
import { MOCK_NOTES_BY_ID } from "@/lib/api/_mocks";
import type { Note } from "@/lib/api/types";

const updateSchema = z.object({
  body: z.string().min(1).optional(),
  tag: z.string().nullable().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

// PATCH /api/notes/[id]
export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const note = MOCK_NOTES_BY_ID[id];
  if (!note) return err("not_found", `No note with id ${id}.`);

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
  const updated: Note = { ...note, ...parsed.data };
  return ok(updated);
}

// DELETE /api/notes/[id]
export async function DELETE(_request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const note = MOCK_NOTES_BY_ID[id];
  if (!note) return err("not_found", `No note with id ${id}.`);
  return noContent();
}
