import { z } from "zod";
import { requireAdvisor } from "@/lib/api/auth";
import { created, err } from "@/lib/api/respond";
import { dbErrorMessage, mapDbError } from "@/lib/api/db_queries";

const createSchema = z.object({
  client_id: z.string().uuid(),
  body: z.string().min(1),
  tag: z.string().nullable().optional(),
});

// POST /api/notes — create. author_advisor_id is set server-side from
// the current session, never trusted from the body.
export async function POST(request: Request) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return err("validation_failed", "Body must be valid JSON.");
  }
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return err("validation_failed", "Invalid note payload.", parsed.error.issues);
  }

  const { data, error } = await auth.supabase
    .from("notes")
    .insert({
      client_id: parsed.data.client_id,
      author_advisor_id: auth.advisor.id,
      body: parsed.data.body,
      tag: parsed.data.tag ?? null,
    })
    .select("*")
    .single();
  if (error) return err(mapDbError(error), dbErrorMessage(error));
  // TODO: Phase 5e — audit_log insert (entity='note', action='created').
  return created(data);
}
