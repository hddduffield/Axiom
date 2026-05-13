// React-PDF document for a lens run. Minimal v1 — Phase 5c will define
// the canonical lens output shape (Investment / Insurance / Cash Flow);
// until then this renders the lens metadata + a structured dump of
// `lens_runs.output` so the export endpoint produces *something*
// reasonable rather than 404'ing on lens-run PDFs.
//
// When Phase 5c lands, this file gets per-lens-type renderers similar to
// how PlanDocument breaks out per Stage 4 section.

import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { Database } from "@/lib/supabase/database.types";
import { COLORS, SIZE, styles } from "./styles";
import { PageFooter, PageHeader } from "./components/PageChrome";
import { H1, H3, Paragraph } from "./components/Atoms";

type LensRun = Database["public"]["Tables"]["lens_runs"]["Row"];

const SHORT_DISCLOSURE =
  "For informational purposes only. Not a guarantee of investment performance. Consult your tax/legal advisor before acting.";

const LENS_TYPE_LABELS: Record<LensRun["lens_type"], string> = {
  investment: "Investment Lens",
  insurance: "Insurance Lens",
  cash_flow: "Cash Flow Lens",
  estate: "Estate Lens",
};

interface LensRunDocumentProps {
  lensRun: LensRun;
  // Joined client name for the page header — not on the lens_run row
  // itself. Caller does the join.
  clientHouseholdName: string;
  // PSA Wealth (or the firm name from the originating advisor's context).
  // For v1, hardcoded by the route handler.
  firmName: string;
  complianceTrackingId: string;
}

export function LensRunDocument({
  lensRun,
  clientHouseholdName,
  firmName,
  complianceTrackingId,
}: LensRunDocumentProps) {
  const typeLabel = LENS_TYPE_LABELS[lensRun.lens_type];
  const headerLeft = `PSA Wealth — ${typeLabel} for ${clientHouseholdName}`;
  const headerRight = formatDate(lensRun.generated_at);

  return (
    <Document
      title={`PSA Wealth ${typeLabel} — ${clientHouseholdName}`}
      author={firmName}
      creator={firmName}
      subject={typeLabel}
    >
      <Page size="LETTER" style={styles.page}>
        <PageHeader leftLabel={headerLeft} rightLabel={headerRight} />
        <PageFooter
          firmName={firmName}
          planId={lensRun.id}
          complianceTrackingId={complianceTrackingId}
          shortDisclosure={SHORT_DISCLOSURE}
        />

        <H1>{typeLabel}</H1>
        <Paragraph>
          Prepared for {clientHouseholdName} — generated{" "}
          {formatDate(lensRun.generated_at)}.
        </Paragraph>

        {lensRun.context_input ? (
          <View>
            <H3>Advisor Context</H3>
            <Paragraph>{lensRun.context_input}</Paragraph>
          </View>
        ) : null}

        <H3>Lens Output</H3>
        {lensRun.output ? (
          // Placeholder rendering until Phase 5c defines lens output shape.
          // JSON dump in monospace so the data is at least inspectable.
          <Text
            style={{
              fontFamily: "Courier",
              fontSize: 8.5,
              lineHeight: 1.35,
              color: COLORS.body,
            }}
          >
            {JSON.stringify(lensRun.output, null, 2)}
          </Text>
        ) : (
          <Paragraph>
            <Text style={{ color: COLORS.metaLabel }}>
              (Lens run is in {lensRun.status} state — output not yet
              available. Re-run the lens once Phase 5c wiring lands.)
            </Text>
          </Paragraph>
        )}

        <Text
          style={{ fontSize: SIZE.bodySmall, color: COLORS.metaLabel, marginTop: 18 }}
        >
          Lens run ID: {lensRun.id} · Status: {lensRun.status}
        </Text>
      </Page>
    </Document>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}
