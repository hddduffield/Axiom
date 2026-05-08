// Phase 13.6 — React-PDF document for a Cash Flow Lens.
//
// 7-page sequence:
//   1. Cover (client, date, PSA branding)
//   2. Hub view (Household → Financial Foundation → bucket cards)
//   3. Tax Triangle — Current
//   4. Tax Triangle — After Recommendations
//   5. Distribution Plan (year-by-year bar chart of recommended drawdown)
//   6. Recommendations list with timeline (advisor-selected only)
//   7. Compliance disclosure block
//
// Pages 3, 4, 5, 6 are conditional based on the include* props the route
// passes — the advisor selects which sections to include via the pre-export
// modal.

import { Document, Page, Path, Polyline, Polygon, Rect, Svg, Text, View, Line, Circle } from "@react-pdf/renderer";
import { styles, COLORS, SIZE, FONT } from "./styles";
import { PageFooter, PageHeader, TitlePageFooter } from "./components/PageChrome";
import { H1, H2, H3, Paragraph } from "./components/Atoms";
import {
  buildYearlyDistribution,
  currentTaxMix,
  type CashFlowDistributionRecommendation,
  type CashFlowLensOutput,
} from "@/lib/api/cash_flow_lens";

const SHORT_DISCLOSURE =
  "For informational purposes only. Not a guarantee of investment performance. Consult your tax/legal advisor before acting.";

const TAX_TREATMENT_HEX: Record<string, string> = {
  tax_free: "#0d6f3a",
  tax_deferred: "#a25a00",
  taxable: "#1a52a8",
  mixed: "#0a6571",
};

const TAX_TREATMENT_LABEL: Record<string, string> = {
  tax_free: "Tax-free",
  tax_deferred: "Tax-deferred",
  taxable: "Taxable",
  mixed: "Mixed",
};

interface CashFlowLensDocumentProps {
  output: CashFlowLensOutput;
  clientHouseholdName: string;
  generatedDate: string;
  firmName: string;
  complianceTrackingId: string;
  includeHub: boolean;
  includeTriangle: boolean;
  includeDistribution: boolean;
  includeRecommendations: boolean;
  selectedRecommendationIds?: Set<string>;
}

function fmtCents(c: number, opts?: { showCents?: boolean }): string {
  const dollars = c / 100;
  return `$${dollars.toLocaleString("en-US", {
    minimumFractionDigits: opts?.showCents ? 2 : 0,
    maximumFractionDigits: opts?.showCents ? 2 : 0,
  })}`;
}

function fmtCentsShort(c: number): string {
  const v = c / 100;
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `$${Math.round(v / 1_000).toLocaleString()}K`;
  return `$${Math.round(v).toLocaleString()}`;
}

export function CashFlowLensDocument(props: CashFlowLensDocumentProps) {
  const {
    output,
    clientHouseholdName,
    generatedDate,
    firmName,
    complianceTrackingId,
    includeHub,
    includeTriangle,
    includeDistribution,
    includeRecommendations,
    selectedRecommendationIds,
  } = props;

  const headerLeft = `PSA Wealth — Cash Flow Plan for ${clientHouseholdName}`;
  const headerRight = generatedDate;

  return (
    <Document
      title={`PSA Wealth Cash Flow Plan — ${clientHouseholdName}`}
      author={firmName}
      creator={firmName}
      subject="Cash Flow Plan"
    >
      {/* ── Page 1: Cover ──────────────────────────────────────── */}
      <Page size="LETTER" style={styles.page}>
        <CoverPage
          clientHouseholdName={clientHouseholdName}
          generatedDate={generatedDate}
        />
        <TitlePageFooter
          firmName={firmName}
          complianceTrackingId={complianceTrackingId}
        />
      </Page>

      {/* ── Page 2: Hub ─────────────────────────────────────────── */}
      {includeHub ? (
        <Page size="LETTER" style={styles.page}>
          <PageHeader leftLabel={headerLeft} rightLabel={headerRight} />
          <PageFooter
            firmName={firmName}
            planId={complianceTrackingId}
            complianceTrackingId={complianceTrackingId}
            shortDisclosure={SHORT_DISCLOSURE}
          />
          <H1>Hub View</H1>
          <HubPdfBlock output={output} clientHouseholdName={clientHouseholdName} />
        </Page>
      ) : null}

      {/* ── Pages 3 + 4: Tax Triangle (Current + After) ───────── */}
      {includeTriangle ? (
        <Page size="LETTER" style={styles.page}>
          <PageHeader leftLabel={headerLeft} rightLabel={headerRight} />
          <PageFooter
            firmName={firmName}
            planId={complianceTrackingId}
            complianceTrackingId={complianceTrackingId}
            shortDisclosure={SHORT_DISCLOSURE}
          />
          <H1>Tax Triangle — Current Allocation</H1>
          <TrianglePdf
            mix={currentTaxMix(output)}
            label="Current Allocation"
            tone="current"
          />
          <TaxBillSummary output={output} mix={currentTaxMix(output)} kind="current" />
        </Page>
      ) : null}

      {includeTriangle ? (
        <Page size="LETTER" style={styles.page}>
          <PageHeader leftLabel={headerLeft} rightLabel={headerRight} />
          <PageFooter
            firmName={firmName}
            planId={complianceTrackingId}
            complianceTrackingId={complianceTrackingId}
            shortDisclosure={SHORT_DISCLOSURE}
          />
          <H1>Tax Triangle — After Recommendations</H1>
          <TrianglePdf
            mix={output.distribution_plan.slider_state}
            label="After Recommendations"
            tone="recommended"
          />
          <TaxBillSummary
            output={output}
            mix={output.distribution_plan.slider_state}
            kind="recommended"
          />
        </Page>
      ) : null}

      {/* ── Page 5: Distribution Plan ────────────────────────── */}
      {includeDistribution ? (
        <Page size="LETTER" style={styles.page}>
          <PageHeader leftLabel={headerLeft} rightLabel={headerRight} />
          <PageFooter
            firmName={firmName}
            planId={complianceTrackingId}
            complianceTrackingId={complianceTrackingId}
            shortDisclosure={SHORT_DISCLOSURE}
          />
          <H1>Distribution Plan</H1>
          <DistributionPdf output={output} />
        </Page>
      ) : null}

      {/* ── Page 6: Recommendations ─────────────────────────── */}
      {includeRecommendations &&
      output.ai_suggestions.distribution_recommendations ? (
        <Page size="LETTER" style={styles.page}>
          <PageHeader leftLabel={headerLeft} rightLabel={headerRight} />
          <PageFooter
            firmName={firmName}
            planId={complianceTrackingId}
            complianceTrackingId={complianceTrackingId}
            shortDisclosure={SHORT_DISCLOSURE}
          />
          <H1>Recommendations &amp; Timeline</H1>
          <RecommendationsPdf
            recs={output.ai_suggestions.distribution_recommendations.recommendations.filter(
              (r) =>
                !selectedRecommendationIds || selectedRecommendationIds.has(r.id),
            )}
          />
        </Page>
      ) : null}

      {/* ── Page 7: Disclosures ──────────────────────────────── */}
      <Page size="LETTER" style={styles.page}>
        <PageHeader leftLabel={headerLeft} rightLabel={headerRight} />
        <PageFooter
          firmName={firmName}
          planId={complianceTrackingId}
          complianceTrackingId={complianceTrackingId}
          shortDisclosure={SHORT_DISCLOSURE}
        />
        <H1>Disclosures</H1>
        <Paragraph>
          This Cash Flow Plan is prepared for {clientHouseholdName} on{" "}
          {generatedDate} by {firmName}. The projections, allocations, and
          recommendations contained herein are for informational and planning
          purposes only and do not constitute tax, legal, or investment advice.
        </Paragraph>
        <Paragraph>
          Forward-looking projections rely on advisor-input assumptions
          including but not limited to compound growth rates per asset class,
          inflation, and effective tax rates. Actual results will vary; market
          performance, tax law, and personal circumstances change over time.
        </Paragraph>
        <Paragraph>
          Tax-bill projections use simplified federal+state effective rates
          and a half-basis approximation for capital-gains taxation on
          taxable accounts. This is not a substitute for a CPA-prepared tax
          analysis. Consult your tax advisor before executing any
          recommendation that triggers a taxable event (Roth conversions,
          asset relocations, distribution timing).
        </Paragraph>
        <Paragraph>
          PSA Wealth is a registered investment advisor. Past performance is
          not a guarantee of future results. The compliance tracking ID
          for this document is {complianceTrackingId}.
        </Paragraph>
      </Page>
    </Document>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Page sub-components
// ────────────────────────────────────────────────────────────────────────

function CoverPage({
  clientHouseholdName,
  generatedDate,
}: {
  clientHouseholdName: string;
  generatedDate: string;
}) {
  return (
    <View style={styles.titlePageWrapper}>
      <Text style={styles.titleFirm}>PSA WEALTH · CASH FLOW PLAN</Text>
      <Text style={styles.titleHeading}>Cash Flow Plan</Text>
      <Text style={styles.titleSubheading}>{clientHouseholdName}</Text>
      <View style={styles.titleMetaRow}>
        <Text style={styles.titleMetaLabel}>Prepared for</Text>
        <Text style={styles.titleMetaValue}>{clientHouseholdName}</Text>
      </View>
      <View style={styles.titleMetaRow}>
        <Text style={styles.titleMetaLabel}>Prepared on</Text>
        <Text style={styles.titleMetaValue}>{generatedDate}</Text>
      </View>
      <View style={styles.titleMetaRow}>
        <Text style={styles.titleMetaLabel}>Prepared by</Text>
        <Text style={styles.titleMetaValue}>PSA Wealth</Text>
      </View>
    </View>
  );
}

function HubPdfBlock({
  output,
  clientHouseholdName,
}: {
  output: CashFlowLensOutput;
  clientHouseholdName: string;
}) {
  const grossAnnual = output.gross_income_annual_cents;
  const expensesAnnual = output.expenses_annual_cents;
  const netAnnual = grossAnnual - expensesAnnual;
  const monthlyNet = Math.round(netAnnual / 12);
  const monthlySavings = Math.max(
    monthlyNet - output.emergency_fund.monthly_contribution_cents,
    0,
  );
  const efTarget =
    Math.round(expensesAnnual / 12) * output.emergency_fund.target_months;
  const efPct =
    efTarget > 0
      ? Math.min(
          Math.round(
            (output.emergency_fund.current_balance_cents / efTarget) * 100,
          ),
          100,
        )
      : 0;
  const efFunded = output.emergency_fund.current_balance_cents >= efTarget;

  return (
    <View>
      {/* Top stats row */}
      <View
        style={{
          flexDirection: "row",
          backgroundColor: COLORS.header,
          color: "#ffffff",
          marginTop: 4,
          marginBottom: 12,
        }}
      >
        <PdfMetric label="Gross" primary={fmtCentsShort(grossAnnual)} />
        <PdfMetric label="Expenses" primary={fmtCentsShort(expensesAnnual)} />
        <PdfMetric label="Net" primary={fmtCentsShort(netAnnual)} />
        <PdfMetric label="Savings" primary={`${fmtCentsShort(monthlySavings)}/mo`} />
        <PdfMetric label="EF" primary={efFunded ? "FUNDED" : `${efPct}%`} />
      </View>

      {/* EF tracker */}
      <View
        style={{
          padding: 8,
          backgroundColor: "#fbf6ed",
          marginBottom: 14,
        }}
      >
        <Text style={{ fontSize: 9, color: COLORS.metaLabel, fontFamily: FONT.familyBold }}>
          EMERGENCY FUND
        </Text>
        <Text style={{ fontSize: 12, marginTop: 2, color: COLORS.body }}>
          {fmtCents(output.emergency_fund.current_balance_cents)} of{" "}
          {fmtCents(efTarget)} target ·{" "}
          {output.emergency_fund.target_months} months · {efPct}%
        </Text>
        <View
          style={{
            marginTop: 4,
            height: 6,
            backgroundColor: "#ddd",
            borderRadius: 3,
          }}
        >
          <View
            style={{
              width: `${efPct}%`,
              height: "100%",
              backgroundColor: efFunded ? "#0d6f3a" : "#1a52a8",
              borderRadius: 3,
            }}
          />
        </View>
      </View>

      {/* Hub: text-based — Household → Financial Foundation → Buckets */}
      <H3>Cash Flow → Financial Foundation</H3>
      <Text style={{ fontSize: SIZE.bodySmall, color: COLORS.body, marginBottom: 8 }}>
        {clientHouseholdName} routes {fmtCents(monthlySavings)} per month
        ({fmtCents(monthlySavings * 12)} annually) into the Financial Foundation
        across {output.buckets.length} buckets.
      </Text>

      {/* Bucket list as compact rows */}
      {output.buckets
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((b, i) => (
          <View
            key={b.id}
            wrap={false}
            style={{
              flexDirection: "row",
              padding: 6,
              borderBottomWidth: 0.5,
              borderColor: COLORS.rule,
              alignItems: "center",
            }}
          >
            <View style={{ width: 22 }}>
              <Text
                style={{
                  fontSize: 10,
                  fontFamily: FONT.familyBold,
                  color: COLORS.header,
                }}
              >
                {i + 1}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10.5, fontFamily: FONT.familyBold, color: COLORS.body }}>
                {b.name}
              </Text>
              <Text style={{ fontSize: 9, color: COLORS.metaLabel }}>
                Balance {fmtCentsShort(b.current_balance_cents)} ·{" "}
                {fmtCentsShort(b.monthly_contribution_target_cents)}/mo ·{" "}
                {fmtCentsShort(b.monthly_contribution_target_cents * 12)}/yr
              </Text>
            </View>
            <View style={{ width: 90 }}>
              <Text
                style={{
                  fontSize: 9,
                  textAlign: "right",
                  color: TAX_TREATMENT_HEX[b.tax_treatment] ?? COLORS.metaLabel,
                  fontFamily: FONT.familyBold,
                }}
              >
                {TAX_TREATMENT_LABEL[b.tax_treatment] ?? b.tax_treatment}
              </Text>
            </View>
          </View>
        ))}
    </View>
  );
}

function PdfMetric({
  label,
  primary,
}: {
  label: string;
  primary: string;
}) {
  return (
    <View style={{ flex: 1, padding: 8 }}>
      <Text style={{ fontSize: 8, opacity: 0.7, fontFamily: FONT.familyBold }}>
        {label.toUpperCase()}
      </Text>
      <Text style={{ fontSize: 13, marginTop: 2, fontFamily: FONT.familyBold }}>
        {primary}
      </Text>
    </View>
  );
}

function TrianglePdf({
  mix,
  label,
  tone,
}: {
  mix: { tax_free_pct: number; tax_deferred_pct: number; taxable_pct: number };
  label: string;
  tone: "current" | "recommended";
}) {
  const W = 240;
  const H = (Math.sqrt(3) / 2) * W;
  const padX = 30;
  const padY = 20;

  const tf = mix.tax_free_pct / 100;
  const td = mix.tax_deferred_pct / 100;
  const tx = mix.taxable_pct / 100;
  const total = tf + td + tx;
  const a = total > 0 ? tf / total : 1 / 3;
  const b = total > 0 ? td / total : 1 / 3;
  const c = total > 0 ? tx / total : 1 / 3;

  const top = { x: padX + W / 2, y: padY };
  const bl = { x: padX, y: padY + H };
  const br = { x: padX + W, y: padY + H };

  const dotX = a * top.x + b * bl.x + c * br.x;
  const dotY = a * top.y + b * bl.y + c * br.y;
  const dotColor = tone === "recommended" ? "#0d6f3a" : "#1a52a8";

  return (
    <View style={{ alignItems: "center", marginVertical: 12 }}>
      <Svg width={W + padX * 2} height={H + padY * 2 + 30}>
        <Polygon
          points={`${top.x},${top.y} ${bl.x},${bl.y} ${br.x},${br.y}`}
          fill="#fafafa"
          stroke="#1a3a5f"
          strokeWidth={1.5}
        />
        <Circle cx={dotX} cy={dotY} r={6} fill={dotColor} stroke="#ffffff" strokeWidth={1.5} />
        {/* Labels */}
        <Text
          x={top.x}
          y={top.y - 6}
          style={{ fontSize: 8, fontFamily: FONT.familyBold }}
        >
          {`Tax-Free ${mix.tax_free_pct}%`}
        </Text>
        <Text
          x={bl.x}
          y={bl.y + 12}
          style={{ fontSize: 8, fontFamily: FONT.familyBold }}
        >
          {`Tax-Def ${mix.tax_deferred_pct}%`}
        </Text>
        <Text
          x={br.x - 60}
          y={br.y + 12}
          style={{ fontSize: 8, fontFamily: FONT.familyBold }}
        >
          {`Taxable ${mix.taxable_pct}%`}
        </Text>
      </Svg>
      <Text
        style={{
          marginTop: 4,
          fontSize: 10,
          color: COLORS.metaLabel,
          fontFamily: FONT.familyItalic,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function TaxBillSummary({
  output,
  mix,
  kind,
}: {
  output: CashFlowLensOutput;
  mix: { tax_free_pct: number; tax_deferred_pct: number; taxable_pct: number };
  kind: "current" | "recommended";
}) {
  const startYear = new Date().getFullYear();
  const dist = buildYearlyDistribution({
    start_year: startYear,
    years: 20,
    target_income_cents: output.assumptions.retirement_income_target_annual_cents,
    mix,
    assumptions: output.assumptions,
  });
  const cumulative = dist.reduce((acc, d) => acc + d.tax_bill_cents, 0);

  return (
    <View style={{ marginTop: 12 }}>
      <H3>Annual tax bill — distribution schedule</H3>
      <View style={styles.table}>
        <View style={styles.tableHeaderRow}>
          <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Year</Text>
          <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: "right" }]}>Income</Text>
          <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: "right" }]}>Tax Bill</Text>
          <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: "right" }]}>Effective</Text>
        </View>
        {[1, 5, 10, 20].map((y) => {
          const idx = y - 1;
          if (idx >= dist.length) return null;
          const d = dist[idx];
          const totalIncome =
            d.tax_free_cents + d.tax_deferred_cents + d.taxable_cents;
          const eff =
            totalIncome > 0
              ? Math.round((d.tax_bill_cents / totalIncome) * 100)
              : 0;
          return (
            <View key={y} style={styles.tableRow}>
              <Text style={[styles.tableCell, { flex: 1 }]}>Year {y}</Text>
              <Text style={[styles.tableCell, { flex: 1, textAlign: "right" }]}>
                {fmtCentsShort(totalIncome)}
              </Text>
              <Text style={[styles.tableCell, { flex: 1, textAlign: "right" }]}>
                {fmtCentsShort(d.tax_bill_cents)}
              </Text>
              <Text style={[styles.tableCell, { flex: 1, textAlign: "right" }]}>
                {eff}%
              </Text>
            </View>
          );
        })}
      </View>
      <Text
        style={{
          marginTop: 6,
          fontSize: SIZE.bodySmall,
          color: COLORS.metaLabel,
          fontFamily: FONT.familyItalic,
        }}
      >
        Cumulative {kind} 20-year tax: {fmtCentsShort(cumulative)}
      </Text>
    </View>
  );
}

function DistributionPdf({ output }: { output: CashFlowLensOutput }) {
  const startYear = new Date().getFullYear();
  const yearly = buildYearlyDistribution({
    start_year: startYear,
    years: 30,
    target_income_cents: output.assumptions.retirement_income_target_annual_cents,
    mix: output.distribution_plan.slider_state,
    assumptions: output.assumptions,
  });
  const maxStacked = Math.max(
    ...yearly.map((y) => y.tax_free_cents + y.tax_deferred_cents + y.taxable_cents),
  );
  const W = 460;
  const H = 160;
  const padL = 40;
  const padR = 20;
  const padT = 10;
  const padB = 24;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const barW = Math.max(innerW / yearly.length - 1, 2);
  const x = (i: number) => padL + i * (innerW / yearly.length);
  const stackY = (cents: number) =>
    maxStacked > 0 ? (cents / maxStacked) * innerH : 0;

  return (
    <View>
      <Text style={{ fontSize: SIZE.bodySmall, color: COLORS.body, marginBottom: 6 }}>
        Year-by-year retirement income, stacked by tax treatment, target{" "}
        {fmtCents(output.assumptions.retirement_income_target_annual_cents)}/yr
        inflated 2.5%/yr.
      </Text>
      <Svg width={W} height={H + 30}>
        {/* Bars */}
        {yearly.map((y, i) => {
          const xPos = x(i);
          const tfH = stackY(y.tax_free_cents);
          const tdH = stackY(y.tax_deferred_cents);
          const txH = stackY(y.taxable_cents);
          const baseY = padT + innerH;
          return (
            <View key={i}>
              <Rect x={xPos} y={baseY - txH} width={barW} height={txH} fill="#1a52a8" />
              <Rect
                x={xPos}
                y={baseY - txH - tdH}
                width={barW}
                height={tdH}
                fill="#a25a00"
              />
              <Rect
                x={xPos}
                y={baseY - txH - tdH - tfH}
                width={barW}
                height={tfH}
                fill="#0d6f3a"
              />
            </View>
          );
        })}
        {/* X labels every 5 years */}
        {yearly
          .filter((_, i) => i % 5 === 0)
          .map((y, ii) => (
            <Text
              key={y.year}
              x={x(ii * 5) + barW / 2}
              y={H - padB + 12}
              style={{ fontSize: 7, fontFamily: FONT.familyMono }}
            >
              {y.year}
            </Text>
          ))}
      </Svg>
      <View style={{ flexDirection: "row", marginTop: 6, gap: 10 }}>
        <LegendBlock color="#0d6f3a" label="Tax-Free" />
        <LegendBlock color="#a25a00" label="Tax-Deferred" />
        <LegendBlock color="#1a52a8" label="Taxable" />
      </View>
    </View>
  );
}

function LegendBlock({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginRight: 12 }}>
      <View
        style={{
          width: 10,
          height: 10,
          backgroundColor: color,
          marginRight: 4,
        }}
      />
      <Text style={{ fontSize: 8.5, color: COLORS.body }}>{label}</Text>
    </View>
  );
}

function RecommendationsPdf({
  recs,
}: {
  recs: CashFlowDistributionRecommendation[];
}) {
  if (recs.length === 0) {
    return (
      <Paragraph>No recommendations selected for inclusion in this export.</Paragraph>
    );
  }

  const sorted = recs.slice().sort((a, b) => a.year - b.year);

  return (
    <View>
      <Text style={{ fontSize: SIZE.bodySmall, color: COLORS.body, marginBottom: 8 }}>
        Sequenced action items derived from the recommended distribution mix.
        Estimated tax impact is shown per item; negative figures indicate
        savings.
      </Text>
      {sorted.map((r, i) => (
        <View
          key={r.id}
          wrap={false}
          style={{
            marginBottom: 8,
            paddingTop: 6,
            paddingBottom: 6,
            borderBottomWidth: 0.5,
            borderColor: COLORS.rule,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
            <Text
              style={{
                fontSize: 9,
                fontFamily: FONT.familyBold,
                color: COLORS.header,
              }}
            >
              {i + 1}.
            </Text>
            <Text
              style={{
                fontSize: 9,
                fontFamily: FONT.familyMono,
                color: COLORS.metaLabel,
                marginLeft: 4,
              }}
            >
              {r.timeframe_label.toUpperCase()}
            </Text>
            <Text
              style={{
                fontSize: 9,
                fontFamily: FONT.familyMono,
                color:
                  r.estimated_tax_impact_cents <= 0 ? "#0d6f3a" : "#a25a00",
                marginLeft: "auto",
              }}
            >
              {r.estimated_tax_impact_cents <= 0 ? "−" : "+"}
              {fmtCentsShort(Math.abs(r.estimated_tax_impact_cents))}
            </Text>
          </View>
          <Text
            style={{
              fontSize: 11,
              marginTop: 2,
              fontFamily: FONT.familyBold,
              color: COLORS.body,
            }}
          >
            {r.action}
          </Text>
          <Text style={{ fontSize: 9.5, marginTop: 2, color: COLORS.body }}>
            {r.reason}
          </Text>
        </View>
      ))}
    </View>
  );
}
