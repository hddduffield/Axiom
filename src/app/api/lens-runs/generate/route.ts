import { z } from "zod";
import { requireAdvisor } from "@/lib/api/auth";
import { err } from "@/lib/api/respond";
import { MOCK_CLIENTS_BY_ID } from "@/lib/api/_mocks";
import { NextResponse } from "next/server";
import type { LensRunsApi } from "@/lib/api/types";

const generateSchema = z.object({
  client_id: z.string().min(1),
  lens_type: z.enum(["investment", "insurance", "cash_flow"]),
  context_input: z.string().nullable().optional(),
});

// POST /api/lens-runs/generate — kick off a lens run.
// Phase 4 mock: validates inputs, returns 202 with synthetic id. Phase 5
// wires the lens generator (Stage 4 + lens-specific prompt) to a worker
// and the queued draft id is the polling handle.
export async function POST(request: Request) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return err("validation_failed", "Body must be valid JSON.");
  }
  const parsed = generateSchema.safeParse(raw);
  if (!parsed.success) {
    return err("validation_failed", "Invalid lens run payload.", parsed.error.issues);
  }
  if (!MOCK_CLIENTS_BY_ID[parsed.data.client_id]) {
    return err("not_found", `No client with id ${parsed.data.client_id}.`);
  }

  const body: LensRunsApi.GenerateAcceptedResponse = {
    lens_run_id: `mock-lens-run-queued-${Math.random().toString(36).slice(2, 8)}`,
    status: "draft",
    queued_at: new Date().toISOString(),
  };
  return NextResponse.json(body, { status: 202 });
}
