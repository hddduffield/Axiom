import { z } from "zod";
import { requireAdvisor } from "@/lib/api/auth";
import { err, noContent, ok } from "@/lib/api/respond";
import { MOCK_PARTNERS_BY_ID } from "@/lib/api/_mocks";
import type { Partner } from "@/lib/api/types";

const updateSchema = z.object({
  partner_type: z.string().min(1).optional(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  firm_name: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

// PATCH /api/partners/[id]
export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const partner = MOCK_PARTNERS_BY_ID[id];
  if (!partner) return err("not_found", `No partner with id ${id}.`);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return err("validation_failed", "Body must be valid JSON.");
  }
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) {
    return err("validation_failed", "Invalid partner patch.", parsed.error.issues);
  }
  const updated: Partner = { ...partner, ...parsed.data };
  return ok(updated);
}

// DELETE /api/partners/[id]
export async function DELETE(_request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const partner = MOCK_PARTNERS_BY_ID[id];
  if (!partner) return err("not_found", `No partner with id ${id}.`);
  return noContent();
}
