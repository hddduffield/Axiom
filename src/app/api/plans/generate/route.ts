import { requireAdvisor } from "@/lib/api/auth";
import { err } from "@/lib/api/respond";
import { MOCK_CLIENTS_BY_ID } from "@/lib/api/_mocks";
import { NextResponse } from "next/server";
import type { PlansApi } from "@/lib/api/types";

const ACCEPTED_MIME = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
]);
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB ceiling for a Fact Review.docx

// POST /api/plans/generate
// Accepts multipart/form-data:
//   client_id: text (form field)
//   fact_review: File (.docx)
//
// Phase 4 mock: validates inputs, returns 202 with a synthetic plan_id +
// "draft" status. Phase 5 wires the AI engine pipeline (Stages 0/1 → 3a → 4
// → 5) to a background worker; the queued draft id is the polling handle.
export async function POST(request: Request) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("multipart/form-data")) {
    return err(
      "validation_failed",
      "Expected multipart/form-data; got " + contentType,
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return err("validation_failed", "Could not parse multipart body.");
  }

  const clientId = formData.get("client_id");
  const factReview = formData.get("fact_review");

  if (typeof clientId !== "string" || clientId.length === 0) {
    return err("validation_failed", "Missing client_id form field.");
  }
  if (!MOCK_CLIENTS_BY_ID[clientId]) {
    return err("not_found", `No client with id ${clientId}.`);
  }
  if (!(factReview instanceof File)) {
    return err("validation_failed", "Missing fact_review file upload.");
  }
  if (!ACCEPTED_MIME.has(factReview.type)) {
    return err(
      "validation_failed",
      `fact_review must be a .docx file (got MIME ${factReview.type || "<unknown>"}).`,
    );
  }
  if (factReview.size > MAX_BYTES) {
    return err(
      "validation_failed",
      `fact_review exceeds ${MAX_BYTES} bytes (got ${factReview.size}).`,
    );
  }

  // TODO: Phase 5 — upload to Supabase Storage, insert plans row with
  // status='draft', enqueue background pipeline job, return the real id.
  const body: PlansApi.GenerateAcceptedResponse = {
    plan_id: `mock-plan-queued-${Math.random().toString(36).slice(2, 8)}`,
    status: "draft",
    queued_at: new Date().toISOString(),
  };
  return NextResponse.json(body, { status: 202 });
}
