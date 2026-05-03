import { z } from "zod";
import { requireAdvisor } from "@/lib/api/auth";
import { created, err } from "@/lib/api/respond";
import { MOCK_CLIENTS_BY_ID } from "@/lib/api/_mocks";
import type { Partner } from "@/lib/api/types";

const createSchema = z.object({
  client_id: z.string().min(1),
  partner_type: z.string().min(1),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  firm_name: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// POST /api/partners — create a partner attached to a client.
// TODO: Phase 5 — supabase.from("partners").insert(...).select().single()
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
    return err("validation_failed", "Invalid partner payload.", parsed.error.issues);
  }
  if (!MOCK_CLIENTS_BY_ID[parsed.data.client_id]) {
    return err("not_found", `No client with id ${parsed.data.client_id}.`);
  }

  const newPartner: Partner = {
    id: `mock-partner-new-${Math.random().toString(36).slice(2, 8)}`,
    client_id: parsed.data.client_id,
    partner_type: parsed.data.partner_type,
    first_name: parsed.data.first_name ?? null,
    last_name: parsed.data.last_name ?? null,
    firm_name: parsed.data.firm_name ?? null,
    email: parsed.data.email ?? null,
    phone: parsed.data.phone ?? null,
    notes: parsed.data.notes ?? null,
    created_at: new Date().toISOString(),
  };
  return created(newPartner);
}
