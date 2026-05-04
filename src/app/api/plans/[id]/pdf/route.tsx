// GET /api/plans/[id]/pdf — render a plan's stage4_output as a PDF and
// stream it to the browser as a download.
//
// Auth: requireAdvisor.
// Status guard: only plans in `ready_for_review`, `approved`, or
// `archived` are exportable. `queued` and `processing` plans don't have
// stage4_output yet; `failed` plans may have a partial body but exporting
// a failed plan is misleading.
//
// React-PDF's renderToBuffer renders the entire document in memory before
// responding. For Holloway-scale plans (~30-40 pages) this takes a few
// seconds and produces a ~200-400 KB buffer — acceptable for v1
// on-demand. If a future plan exceeds Vercel's serverless timeout
// (60s on pro tier), promote to renderToStream.

import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { requireAdvisor } from "@/lib/api/auth";
import { err } from "@/lib/api/respond";
import { dbErrorMessage, mapDbError } from "@/lib/api/db_queries";
import { PlanDocument } from "@/lib/pdf";
import type { Stage4Result } from "@/lib/orchestrator/schemas/stage4.types";
import type { Database } from "@/lib/supabase/database.types";

type PlanRow = Database["public"]["Tables"]["plans"]["Row"];

interface RouteContext {
  params: Promise<{ id: string }>;
}

const EXPORTABLE_STATUSES: PlanRow["status"][] = [
  "ready_for_review",
  "approved",
  "archived",
];

function safeFilename(parts: string[]): string {
  return parts
    .map((p) =>
      p
        .normalize("NFKD")
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "_"),
    )
    .filter(Boolean)
    .join("-");
}

export async function GET(_request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const { data: plan, error: fetchErr } = await auth.supabase
    .from("plans")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return err(mapDbError(fetchErr), dbErrorMessage(fetchErr));
  if (!plan) return err("not_found", `No plan with id ${id}.`);

  if (!EXPORTABLE_STATUSES.includes(plan.status)) {
    return err(
      "validation_failed",
      `Plan ${id} is ${plan.status}; only ready_for_review / approved / archived plans can be exported.`,
    );
  }

  if (!plan.stage4_output) {
    return err(
      "validation_failed",
      `Plan ${id} has no stage4_output yet. Wait for the CLI to complete processing.`,
    );
  }

  // The CLI writes the full Stage4Result envelope (or a Stage4ResultFailed
  // envelope on failure). We've already gated to non-failed statuses, but
  // belt-and-suspenders verify the result has the success-shape llm_sections.
  const stage4 = plan.stage4_output as unknown as Stage4Result;
  if (!stage4.llm_sections || !stage4.deterministic_sections) {
    return err(
      "internal_error",
      `Plan ${id} stage4_output is not in the expected Stage4Result shape (this can happen if a failed plan was retro-marked as ready_for_review).`,
    );
  }

  let buffer: Buffer;
  try {
    buffer = await renderToBuffer(<PlanDocument plan={stage4} />);
  } catch (e) {
    return err("internal_error", `PDF render failed: ${(e as Error).message}`);
  }

  const tp = stage4.deterministic_sections.title_page;
  const filename = safeFilename([
    "PSA-Plan",
    tp.client_full_name ?? "Client",
    tp.prepared_date ?? new Date().toISOString().slice(0, 10),
  ]) + ".pdf";

  // Convert Node Buffer to Uint8Array — NextResponse types accept the
  // latter cleanly across runtimes.
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.byteLength),
      "Cache-Control": "private, no-store",
    },
  });
}
