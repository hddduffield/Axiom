import { z } from "zod";
import { requireAdvisor } from "@/lib/api/auth";
import { err, noContent, ok } from "@/lib/api/respond";
import { MOCK_CLIENTS_BY_ID } from "@/lib/api/_mocks";
import type { Client } from "@/lib/api/types";

const updateSchema = z.object({
  lead_advisor_id: z.string().uuid().optional(),
  household_name: z.string().min(1).optional(),
  status: z.enum(["active", "inactive", "prospect"]).optional(),
  archetype: z.enum(["PRE", "MID", "POST", "NONE"]).nullable().optional(),
  notes: z.string().nullable().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/clients/[id]
export async function GET(_request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const c = MOCK_CLIENTS_BY_ID[id];
  if (!c) return err("not_found", `No client with id ${id}.`);
  return ok(c);
}

// PATCH /api/clients/[id]
// TODO: Phase 5 — supabase.from("clients").update(...).eq("id", id).select().single()
export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const c = MOCK_CLIENTS_BY_ID[id];
  if (!c) return err("not_found", `No client with id ${id}.`);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return err("validation_failed", "Body must be valid JSON.");
  }
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) {
    return err("validation_failed", "Invalid client patch.", parsed.error.issues);
  }

  const updated: Client = {
    ...c,
    ...parsed.data,
    updated_at: new Date().toISOString(),
  };
  return ok(updated);
}

// DELETE /api/clients/[id] — soft delete (status → inactive).
// TODO: Phase 5 — soft-delete via UPDATE; full DELETE only for prospects with no plans.
export async function DELETE(_request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const c = MOCK_CLIENTS_BY_ID[id];
  if (!c) return err("not_found", `No client with id ${id}.`);
  return noContent();
}
