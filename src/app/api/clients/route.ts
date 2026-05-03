import { z } from "zod";
import { requireAdvisor } from "@/lib/api/auth";
import { created, err, list } from "@/lib/api/respond";
import { LIST_CLIENTS } from "@/lib/api/_mocks";
import type { Client } from "@/lib/api/types";

const createSchema = z.object({
  lead_advisor_id: z.string().uuid(),
  household_name: z.string().min(1),
  status: z.enum(["active", "inactive", "prospect"]).optional(),
  archetype: z.enum(["PRE", "MID", "POST", "NONE"]).nullable().optional(),
  notes: z.string().nullable().optional(),
});

// GET /api/clients — list clients (filter by status, lead_advisor_id).
// TODO: Phase 5 — supabase.from("clients").select("*").match(filters)
export async function GET(request: Request) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const leadAdvisorId = url.searchParams.get("lead_advisor_id");
  let items = LIST_CLIENTS;
  if (status) items = items.filter((c) => c.status === status);
  if (leadAdvisorId) items = items.filter((c) => c.lead_advisor_id === leadAdvisorId);
  return list(items);
}

// POST /api/clients — create a new client.
// TODO: Phase 5 — supabase.from("clients").insert(...).select().single()
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
    return err("validation_failed", "Invalid client payload.", parsed.error.issues);
  }

  const now = new Date().toISOString();
  const newClient: Client = {
    id: `mock-client-new-${Math.random().toString(36).slice(2, 8)}`,
    lead_advisor_id: parsed.data.lead_advisor_id,
    household_name: parsed.data.household_name,
    status: parsed.data.status ?? "prospect",
    archetype: parsed.data.archetype ?? null,
    notes: parsed.data.notes ?? null,
    created_at: now,
    updated_at: now,
  };
  return created(newClient);
}
