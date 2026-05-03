import { z } from "zod";
import { requireAdvisor } from "@/lib/api/auth";
import { created, err } from "@/lib/api/respond";
import { dbErrorMessage, mapDbError } from "@/lib/api/db_queries";

const createSchema = z.object({
  client_id: z.string().uuid(),
  partner_type: z.string().min(1),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  firm_name: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// POST /api/partners — create a partner attached to a client.
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

  const { data, error } = await auth.supabase
    .from("partners")
    .insert({
      client_id: parsed.data.client_id,
      partner_type: parsed.data.partner_type,
      first_name: parsed.data.first_name ?? null,
      last_name: parsed.data.last_name ?? null,
      firm_name: parsed.data.firm_name ?? null,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
      notes: parsed.data.notes ?? null,
    })
    .select("*")
    .single();
  if (error) return err(mapDbError(error), dbErrorMessage(error));
  // TODO: Phase 5e — audit_log insert (entity='partner', action='created').
  return created(data);
}
