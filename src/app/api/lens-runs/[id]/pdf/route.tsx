// GET /api/lens-runs/[id]/pdf — render a lens run as a PDF.
//
// Phase 13.6 — Cash flow lenses dispatch to CashFlowLensDocument with
// per-section include flags read from query params:
//
//   ?include_hub=1
//   ?include_triangle=1
//   ?include_distribution=1
//   ?include_recommendations=1
//   ?recommendation_ids=<comma-separated>   filter recs to include
//
// Defaults: all four sections included; all recommendations included.
//
// Other lens types (investment, insurance) still go through the
// minimal LensRunDocument placeholder.

import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { requireAdvisor } from "@/lib/api/auth";
import { err } from "@/lib/api/respond";
import { dbErrorMessage, mapDbError } from "@/lib/api/db_queries";
import { CashFlowLensDocument, EstateLensDocument, LensRunDocument } from "@/lib/pdf";
import {
  isCashFlowLensOutput,
  type CashFlowLensOutput,
} from "@/lib/api/cash_flow_lens";
import {
  isEstateLensOutput,
  type EstateLensOutput,
} from "@/lib/estate-lens/types";
import type { Database } from "@/lib/supabase/database.types";

type LensRunStatus = Database["public"]["Tables"]["lens_runs"]["Row"]["status"];

interface RouteContext {
  params: Promise<{ id: string }>;
}

const EXPORTABLE_STATUSES: LensRunStatus[] = ["approved", "archived", "draft"];

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

function readBoolFlag(
  url: URL,
  name: string,
  defaultValue: boolean,
): boolean {
  const v = url.searchParams.get(name);
  if (v === null) return defaultValue;
  return v === "1" || v === "true";
}

export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const url = new URL(request.url);

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
  const complianceId = `${FIRM_COMPLIANCE_FALLBACK}-${row.id.slice(0, 8)}`;
  const generatedDate = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  let buffer: Buffer;
  try {
    if (row.lens_type === "cash_flow" && isCashFlowLensOutput(row.output)) {
      const cfOutput = row.output as CashFlowLensOutput;
      const includeHub = readBoolFlag(url, "include_hub", true);
      const includeTriangle = readBoolFlag(url, "include_triangle", true);
      const includeDistribution = readBoolFlag(url, "include_distribution", true);
      const includeRecommendations = readBoolFlag(
        url,
        "include_recommendations",
        true,
      );
      const recIdParam = url.searchParams.get("recommendation_ids");
      const selectedRecommendationIds =
        recIdParam !== null
          ? new Set(
              recIdParam
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            )
          : undefined;

      buffer = await renderToBuffer(
        <CashFlowLensDocument
          output={cfOutput}
          clientHouseholdName={clientName}
          generatedDate={generatedDate}
          firmName={PSA_FIRM_NAME}
          complianceTrackingId={complianceId}
          includeHub={includeHub}
          includeTriangle={includeTriangle}
          includeDistribution={includeDistribution}
          includeRecommendations={includeRecommendations}
          selectedRecommendationIds={selectedRecommendationIds}
        />,
      );
    } else if (row.lens_type === "estate" && isEstateLensOutput(row.output)) {
      const estateOutput = row.output as EstateLensOutput;
      const includeProjection = readBoolFlag(url, "include_projection", true);
      const includeTrustPlanning = readBoolFlag(url, "include_trust_planning", true);
      const includeTaxPayment = readBoolFlag(url, "include_tax_payment", true);
      const recIdParam = url.searchParams.get("recommendation_ids");
      const selectedRecommendationIds =
        recIdParam !== null
          ? new Set(
              recIdParam
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            )
          : undefined;

      buffer = await renderToBuffer(
        <EstateLensDocument
          output={estateOutput}
          clientHouseholdName={clientName}
          generatedDate={generatedDate}
          firmName={PSA_FIRM_NAME}
          complianceTrackingId={estateOutput.tracking_id || complianceId}
          includeProjection={includeProjection}
          includeTrustPlanning={includeTrustPlanning}
          includeTaxPayment={includeTaxPayment}
          selectedRecommendationIds={selectedRecommendationIds}
        />,
      );
    } else {
      buffer = await renderToBuffer(
        <LensRunDocument
          lensRun={row}
          clientHouseholdName={clientName}
          firmName={PSA_FIRM_NAME}
          complianceTrackingId={complianceId}
        />,
      );
    }
  } catch (e) {
    return err("internal_error", `PDF render failed: ${(e as Error).message}`);
  }

  const filename =
    safeFilename([
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
