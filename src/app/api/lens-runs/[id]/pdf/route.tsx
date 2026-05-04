// GET /api/lens-runs/[id]/pdf — render a lens run as a PDF.
//
// v1 export is intentionally minimal (LensRunDocument is a placeholder
// renderer until Phase 5c defines the per-lens-type output shape). Status
// guard mirrors the plan endpoint: only `ready_for_review`, `approved`,
// `archived` are exportable.

import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { requireAdvisor } from "@/lib/api/auth";
import { err } from "@/lib/api/respond";
import { dbErrorMessage, mapDbError } from "@/lib/api/db_queries";
import { LensRunDocument } from "@/lib/pdf";
import type { Database } from "@/lib/supabase/database.types";

type LensRunStatus = Database["public"]["Tables"]["lens_runs"]["Row"]["status"];

interface RouteContext {
  params: Promise<{ id: string }>;
}

const EXPORTABLE_STATUSES: LensRunStatus[] = ["approved", "archived", "draft"];
// `draft` is included for lens runs (unlike plans) because a draft lens
// run typically has populated `output` even before approval — the lens
// flow is "advisor reviews, then approves" rather than "system generates,
// then advisor reviews".

const PSA_FIRM_NAME = "PSA Wealth";
const FIRM_COMPLIANCE_FALLBACK = "PSA-LENS";

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

  // Pull the lens run + the joined client name in one round-trip.
  const { data: row, error: fetchErr } = await auth.supabase
    .from("lens_runs")
    .select("*, clients(household_name)")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return err(mapDbError(fetchErr), dbErrorMessage(fetchErr));
  if (!row) return err("not_found", `No lens run with id ${id}.`);

  if (!EXPORTABLE_STATUSES.includes(row.status)) {
    return err(
      "validation_failed",
      `Lens run ${id} is ${row.status}; only draft / approved / archived lens runs can be exported.`,
    );
  }

  const clientName = row.clients?.household_name ?? "<unknown client>";
  // Compliance ID for lens runs: derive a stable per-run identifier so
  // the page footer is always populated (Phase 5c may add a real
  // compliance_tracking_id column on lens_runs analogous to plans).
  const complianceId = `${FIRM_COMPLIANCE_FALLBACK}-${row.id.slice(0, 8)}`;

  let buffer: Buffer;
  try {
    buffer = await renderToBuffer(
      <LensRunDocument
        lensRun={row}
        clientHouseholdName={clientName}
        firmName={PSA_FIRM_NAME}
        complianceTrackingId={complianceId}
      />,
    );
  } catch (e) {
    return err("internal_error", `PDF render failed: ${(e as Error).message}`);
  }

  const filename = safeFilename([
    "PSA-LensRun",
    row.lens_type,
    clientName,
    row.generated_at.slice(0, 10),
  ]) + ".pdf";

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
