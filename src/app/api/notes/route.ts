import { z } from "zod";
import { requireAdvisor } from "@/lib/api/auth";
import { created, err } from "@/lib/api/respond";
import { MOCK_CLIENTS_BY_ID } from "@/lib/api/_mocks";
import type { Note } from "@/lib/api/types";

const createSchema = z.object({
  client_id: z.string().min(1),
  body: z.string().min(1),
  tag: z.string().nullable().optional(),
});

// POST /api/notes — create a note attached to a client.
// TODO: Phase 5 — supabase.from("notes").insert(...).select().single() +
//                 audit_log insert ('created', entity='note').
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
  if (!MOCK_CLIENTS_BY_ID[parsed.data.client_id]) {
    return err("not_found", `No client with id ${parsed.data.client_id}.`);
  }

  const newNote: Note = {
    id: `mock-note-new-${Math.random().toString(36).slice(2, 8)}`,
    client_id: parsed.data.client_id,
    author_advisor_id: auth.advisor.id,
    body: parsed.data.body,
    tag: parsed.data.tag ?? null,
    promoted_to_action_item_id: null,
    created_at: new Date().toISOString(),
  };
  return created(newNote);
}
