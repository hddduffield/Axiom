// Phase 14.5 — React-PDF document for an Estate Lens scenario.
//
// 5-page sequence:
//   1. Cover (client, scenario name, date, PSA branding)
//   2. Tab 1 — Estate Tax Projection (year-N outputs + tax bill summary)
//   3. Tab 2 — Trust Planning Calculator (comparison table + savings)
//   4. Tab 3 — Tax Payment Strategy (4 options + recommendation)
//   5. Compliance disclosure + tracking ID
//
// Pages 2, 3, 4 are conditional based on include flags from query params.

import { Document, Page, Text, View } from "@react-pdf/renderer";
import { styles, COLORS, SIZE, FONT } from "./styles";
import { PageFooter, PageHeader, TitlePageFooter } from "./components/PageChrome";
import { H1, H2, Paragraph } from "./components/Atoms";
import {
  aggregateNoPlanning,
  aggregateWithPlanning,
  baselineTaxBillCents,
  buildMortalityLeverage,
  capGainsTaxOutOfEstateCents,
  cumulativeSpendCents,
  dollarsToFundTaxBillViaLiCents,
  effectiveTaxBillCents,
  familySavingsCents,
  federalEstateTaxCents,
  formatUsdCompact,
  inEstateValueCents,
  indexedExemptionCents,
  liAdvantageCents,
  liCostPerDollarOfTax,
  netToFamilyCents,
  outOfEstateFvCents,
  payOptionCashOnHandPct,
  payOptionLifeInsurancePct,
  payOptionLiquidateTrustCostCents,
  payOptionLiquidateTrustPct,
  selfInsureNetAfterEstateTaxCents,
  stateEstateTaxCents,
  taxableEstateCents,
  totalPremiumPaidCents,
  totalTaxBillCents,
} from "@/lib/estate-lens/calc";
import type { EstateLensOutput } from "@/lib/estate-lens/types";

const SHORT_DISCLOSURE =
  "Calculations are planning estimates only. Verify all figures with qualified tax counsel before client decisions.";

const COMPLIANCE_BODY =
  "The information provided is not written or intended as specific tax or legal advice. " +
  "Neither PSA Wealth nor MassMutual, its subsidiaries, employees and representatives are " +
  "authorized to give tax or legal advice. Individuals are encouraged to seek advice from " +
  "their own tax or legal counsel.";

interface EstateLensDocumentProps {
  output: EstateLensOutput;
  clientHouseholdName: string;
  generatedDate: string;
  firmName: string;
  complianceTrackingId: string;
  includeProjection: boolean;
  includeTrustPlanning: boolean;
  includeTaxPayment: boolean;
  selectedRecommendationIds?: Set<string>;
}

export function EstateLensDocument(props: EstateLensDocumentProps) {
  const {
    output,
    clientHouseholdName,
    generatedDate,
    firmName,
    complianceTrackingId,
    includeProjection,
    includeTrustPlanning,
    includeTaxPayment,
    selectedRecommendationIds,
  } = props;

  const headerLeft = `PSA Wealth — Estate Plan for ${clientHouseholdName}`;
  const headerRight = generatedDate;

  return (
    <Document
      title={`PSA Wealth Estate Plan — ${clientHouseholdName} — ${output.scenario_name}`}
      author={firmName}
      creator={firmName}
      subject="Estate Plan Scenario"
    >
      {/* ── Page 1: Cover ─────────────────────────────────────── */}
      <Page size="LETTER" style={styles.page}>
        <View style={styles.titlePageWrapper}>
          <Text style={styles.titleFirm}>{firmName}</Text>
          <Text style={styles.titleHeading}>Estate Plan</Text>
          <Text style={styles.titleSubheading}>{output.scenario_name}</Text>
          <View style={styles.titleMetaRow}>
            <Text style={styles.titleMetaLabel}>Household</Text>
            <Text style={styles.titleMetaValue}>{clientHouseholdName}</Text>
          </View>
          <View style={styles.titleMetaRow}>
            <Text style={styles.titleMetaLabel}>Generated</Text>
            <Text style={styles.titleMetaValue}>{generatedDate}</Text>
          </View>
          <View style={styles.titleMetaRow}>
            <Text style={styles.titleMetaLabel}>Tracking ID</Text>
            <Text style={styles.titleMetaValue}>{complianceTrackingId}</Text>
          </View>
        </View>
        <TitlePageFooter
          firmName={firmName}
          complianceTrackingId={complianceTrackingId}
        />
      </Page>

      {/* ── Page 2: Tab 1 — Estate Tax Projection ─────────────── */}
      {includeProjection ? (
        <Page size="LETTER" style={styles.page}>
          <PageHeader leftLabel={headerLeft} rightLabel={headerRight} />
          <PageFooter
            firmName={firmName}
            planId={complianceTrackingId}
            complianceTrackingId={complianceTrackingId}
            shortDisclosure={SHORT_DISCLOSURE}
          />
          <H1>01. Estate Tax Projection</H1>
          <Paragraph>
            Current trajectory at {output.assumptions.years_out}-year horizon —
            federal estate tax + cap gains on liquidation. Inputs include
            estate today, annual spend, growth and exemption inflation
            assumptions.
          </Paragraph>
          <ProjectionTable output={output} />
        </Page>
      ) : null}

      {/* ── Page 3: Tab 2 — Trust Planning Calculator ────────── */}
      {includeTrustPlanning ? (
        <Page size="LETTER" style={styles.page}>
          <PageHeader leftLabel={headerLeft} rightLabel={headerRight} />
          <PageFooter
            firmName={firmName}
            planId={complianceTrackingId}
            complianceTrackingId={complianceTrackingId}
            shortDisclosure={SHORT_DISCLOSURE}
          />
          <H1>02. Trust Planning Calculator</H1>
          <Paragraph>
            Proposed planning move:{" "}
            {output.planning_move.type === "note_sale"
              ? "Note Sale to a grantor trust at discounted FMV with carryover basis."
              : "Gift to a grantor trust using lifetime exemption; carryover basis."}
          </Paragraph>
          <TrustPlanningTable output={output} />
        </Page>
      ) : null}

      {/* ── Page 4: Tab 3 — Tax Payment Strategy ─────────────── */}
      {includeTaxPayment ? (
        <Page size="LETTER" style={styles.page}>
          <PageHeader leftLabel={headerLeft} rightLabel={headerRight} />
          <PageFooter
            firmName={firmName}
            planId={complianceTrackingId}
            complianceTrackingId={complianceTrackingId}
            shortDisclosure={SHORT_DISCLOSURE}
          />
          <H1>03. Tax Payment Strategy</H1>
          <Paragraph>
            The estate tax + cap gains tax bill at death needs to be funded.
            Comparison of the four primary mechanisms — cash on hand, life
            insurance, asset liquidation, and a hybrid mix.
          </Paragraph>
          <TaxPaymentTable output={output} />
        </Page>
      ) : null}

      {/* ── Page 5: Recommendations ─────────────────────────── */}
      {output.recommendations.length > 0 ? (
        <Page size="LETTER" style={styles.page}>
          <PageHeader leftLabel={headerLeft} rightLabel={headerRight} />
          <PageFooter
            firmName={firmName}
            planId={complianceTrackingId}
            complianceTrackingId={complianceTrackingId}
            shortDisclosure={SHORT_DISCLOSURE}
          />
          <H1>Recommendations &amp; Timeline</H1>
          <RecommendationsList
            recommendations={output.recommendations.filter(
              (r) =>
                !selectedRecommendationIds || selectedRecommendationIds.has(r.id),
            )}
          />
        </Page>
      ) : null}

      {/* ── Final: Disclosures ──────────────────────────────── */}
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
          This Estate Plan scenario is prepared for {clientHouseholdName} on{" "}
          {generatedDate} by {firmName}. Tracking ID: {complianceTrackingId}.
        </Paragraph>
        <Paragraph>{COMPLIANCE_BODY}</Paragraph>
        <Paragraph>
          Forward-looking projections rely on advisor-input assumptions
          including estate today, annual spend, growth rates, exemption
          inflation, valuation discounts, AFR, and other inputs. Actual
          results will differ. Estate tax law (IRC §§ 2001, 2010, 2031,
          2503, 2505) and state-level rules change frequently. Confirm all
          figures with qualified tax and legal counsel before client
          decisions or implementation.
        </Paragraph>
      </Page>
    </Document>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Tables (React-PDF View-based)
// ────────────────────────────────────────────────────────────────────────

function Row({
  label,
  value,
  bold = false,
  emphasis,
}: {
  label: string;
  value: string;
  bold?: boolean;
  emphasis?: "good" | "bad";
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        paddingVertical: 4,
        borderBottomWidth: 0.5,
        borderBottomColor: COLORS.rule,
      }}
    >
      <Text
        style={{
          fontSize: SIZE.bodySmall,
          fontFamily: bold ? FONT.familyBold : FONT.family,
          color: COLORS.metaLabel,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: SIZE.bodySmall,
          fontFamily: bold ? FONT.familyBold : FONT.familyMono,
          color:
            emphasis === "good"
              ? "#0d6f3a"
              : emphasis === "bad"
                ? "#c33"
                : COLORS.body,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function ProjectionTable({ output }: { output: EstateLensOutput }) {
  const year = output.assumptions.years_out;
  const inEstate = inEstateValueCents(output.assumptions, year);
  const exempt = indexedExemptionCents(output.assumptions, year);
  const taxable = taxableEstateCents(output.assumptions, year);
  const fed = federalEstateTaxCents(output.assumptions, year);
  const state = stateEstateTaxCents(output.assumptions, year);
  const cum = cumulativeSpendCents(output.assumptions, year);
  const outFv = outOfEstateFvCents(output.assumptions, output.assets_out, year);
  const cgt = capGainsTaxOutOfEstateCents(output.assumptions, output.assets_out, year);
  const net = netToFamilyCents(output.assumptions, output.assets_out, year);
  const tax = totalTaxBillCents(output.assumptions, output.assets_out, year);

  return (
    <View style={{ marginTop: 8 }}>
      <H2>Projected at Year {year}</H2>
      <Row label="In-Estate Value" value={formatUsdCompact(inEstate)} />
      <Row label="Indexed Exemption" value={formatUsdCompact(exempt)} />
      <Row label="Taxable Estate" value={formatUsdCompact(taxable)} />
      <Row label="Federal Estate Tax" value={formatUsdCompact(fed)} />
      {state > 0 ? (
        <Row label="State Estate Tax" value={formatUsdCompact(state)} />
      ) : null}
      <Row label="Cumulative Spend" value={formatUsdCompact(cum)} />
      <Row label="Out-of-Estate FV" value={formatUsdCompact(outFv)} />
      <Row label="Cap Gains Tax" value={formatUsdCompact(cgt)} />
      <Row label="Net to Family" value={formatUsdCompact(net)} bold />
      <View style={{ marginTop: 12 }}>
        <Row label="TOTAL LIFE INSURANCE NEED" value={formatUsdCompact(tax)} bold emphasis="bad" />
      </View>
    </View>
  );
}

function TrustPlanningTable({ output }: { output: EstateLensOutput }) {
  const noPlan = aggregateNoPlanning(output.assumptions, output.assets_out);
  const withPlan = aggregateWithPlanning(
    output.assumptions,
    output.assets_out,
    output.planning_move,
  );
  const savings = familySavingsCents(noPlan, withPlan);

  return (
    <View style={{ marginTop: 8 }}>
      <H2>Aggregate Family Outcome — Plan vs No Plan</H2>
      <View
        style={{
          flexDirection: "row",
          paddingVertical: 4,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.header,
        }}
      >
        <Text style={{ flex: 2, fontSize: SIZE.bodySmall, fontFamily: FONT.familyBold, color: COLORS.header }}></Text>
        <Text style={{ flex: 1, textAlign: "right", fontSize: SIZE.bodySmall, fontFamily: FONT.familyBold, color: COLORS.metaLabel }}>
          NO PLANNING
        </Text>
        <Text style={{ flex: 1, textAlign: "right", fontSize: SIZE.bodySmall, fontFamily: FONT.familyBold, color: COLORS.header }}>
          WITH PLAN
        </Text>
      </View>
      <CompareRow label="Federal Estate Tax" a={noPlan.federal_estate_tax_cents} b={withPlan.federal_estate_tax_cents} betterLow />
      <CompareRow label="Cap Gains (Combined)" a={noPlan.cap_gains_tax_combined_cents} b={withPlan.cap_gains_tax_combined_cents} betterLow />
      <CompareRow label="Total Tax" a={noPlan.total_tax_cents} b={withPlan.total_tax_cents} betterLow bold />
      <CompareRow label="Net to Family" a={noPlan.net_to_family_cents} b={withPlan.net_to_family_cents} bold />
      <CompareRow label="Total LI Need" a={noPlan.total_li_need_cents} b={withPlan.total_li_need_cents} betterLow />

      <View style={{ marginTop: 14 }}>
        <Row label="FAMILY SAVES" value={formatUsdCompact(Math.max(0, savings))} bold emphasis="good" />
      </View>
    </View>
  );
}

function CompareRow({
  label,
  a,
  b,
  betterLow,
  bold,
}: {
  label: string;
  a: number;
  b: number;
  betterLow?: boolean;
  bold?: boolean;
}) {
  const delta = b - a;
  const improved = betterLow ? delta < 0 : delta > 0;
  return (
    <View
      style={{
        flexDirection: "row",
        paddingVertical: 4,
        borderBottomWidth: 0.5,
        borderBottomColor: COLORS.rule,
      }}
    >
      <Text style={{ flex: 2, fontSize: SIZE.bodySmall, fontFamily: bold ? FONT.familyBold : FONT.family, color: bold ? COLORS.body : COLORS.metaLabel }}>
        {label}
      </Text>
      <Text style={{ flex: 1, textAlign: "right", fontSize: SIZE.bodySmall, fontFamily: FONT.familyMono, color: COLORS.metaLabel }}>
        {formatUsdCompact(a)}
      </Text>
      <Text style={{ flex: 1, textAlign: "right", fontSize: SIZE.bodySmall, fontFamily: FONT.familyMono, color: improved ? "#0d6f3a" : COLORS.body, fontWeight: 700 }}>
        {formatUsdCompact(b)}
      </Text>
    </View>
  );
}

function TaxPaymentTable({ output }: { output: EstateLensOutput }) {
  const taxBill = effectiveTaxBillCents(output);
  const baseline = baselineTaxBillCents(output);
  const taxSavings = Math.max(0, baseline - taxBill);

  const combinedCapGains =
    output.planning_move.federal_ltcg_pct +
    output.planning_move.niit_pct +
    output.planning_move.state_ltcg_pct;

  const totalPremium = totalPremiumPaidCents(output.life_insurance);
  const liFundsTax = dollarsToFundTaxBillViaLiCents(output.life_insurance, taxBill);

  const optCash = { label: "Cash on Hand", pct: payOptionCashOnHandPct(), cost: taxBill };
  const optLi = { label: "Life Insurance (Out of Estate)", pct: payOptionLifeInsurancePct(output.life_insurance, taxBill), cost: liFundsTax };
  const optLiq = { label: "Liquidate Trust Assets", pct: payOptionLiquidateTrustPct(combinedCapGains), cost: payOptionLiquidateTrustCostCents(taxBill, combinedCapGains) };

  const cheapest = [optCash, optLi, optLiq].reduce((a, b) => (b.cost < a.cost ? b : a));

  const selfInsureNet = selfInsureNetAfterEstateTaxCents(
    output.life_insurance,
    output.assumptions.estate_tax_rate_pct,
    output.assumptions.years_out,
  );
  const liAdvantage = liAdvantageCents(
    output.life_insurance,
    output.assumptions.estate_tax_rate_pct,
    output.assumptions.years_out,
  );

  return (
    <View style={{ marginTop: 8 }}>
      <H2>Tax Bill at Death</H2>
      <Row label="With Plan" value={formatUsdCompact(taxBill)} bold />
      <Row label="Without Trust Planning" value={formatUsdCompact(baseline)} />
      <Row label="Tax Savings from Planning" value={formatUsdCompact(taxSavings)} emphasis="good" />

      <View style={{ height: 14 }} />
      <H2>Funding Options</H2>
      <Row label={`${optCash.label} — ${optCash.pct.toFixed(1)}%`} value={formatUsdCompact(optCash.cost)} />
      <Row label={`${optLi.label} — ${optLi.pct.toFixed(1)}%`} value={formatUsdCompact(optLi.cost)} />
      <Row label={`${optLiq.label} — ${optLiq.pct.toFixed(1)}%`} value={formatUsdCompact(optLiq.cost)} />

      <View style={{ height: 14 }} />
      <H2>Mortality Leverage</H2>
      <Row label={`Self-Insure @ Y${output.assumptions.years_out} (after estate tax)`} value={formatUsdCompact(selfInsureNet)} />
      <Row label={`Life Insurance Death Benefit @ Y${output.assumptions.years_out}`} value={formatUsdCompact(output.life_insurance.death_benefit_cents)} />
      <Row label="LI Advantage to Heirs" value={formatUsdCompact(Math.max(0, liAdvantage))} emphasis="good" />

      <View style={{ height: 14 }} />
      <H2>Recommended Strategy</H2>
      <View
        style={{
          padding: 10,
          backgroundColor: "#f9f4e6",
          borderWidth: 0.5,
          borderColor: COLORS.rule,
        }}
      >
        <Text style={{ fontSize: SIZE.bodySmall, fontFamily: FONT.familyBold, color: COLORS.header }}>
          {cheapest.label}
        </Text>
        <Text style={{ fontSize: SIZE.h3, fontFamily: FONT.familyBold, color: COLORS.header, marginTop: 4 }}>
          {formatUsdCompact(cheapest.cost)} ({cheapest.pct.toFixed(1)}% of tax bill)
        </Text>
      </View>
    </View>
  );
}

function RecommendationsList({
  recommendations,
}: {
  recommendations: EstateLensOutput["recommendations"];
}) {
  return (
    <View style={{ marginTop: 8 }}>
      {recommendations.map((r) => (
        <View
          key={r.id}
          style={{
            marginBottom: 10,
            paddingLeft: 8,
            borderLeftWidth: 2,
            borderLeftColor: COLORS.header,
          }}
        >
          <Text style={{ fontSize: SIZE.body, fontFamily: FONT.familyBold, color: COLORS.body }}>
            {r.label}
          </Text>
          <Text style={{ fontSize: SIZE.bodySmall, color: COLORS.metaLabel, marginTop: 2 }}>
            {r.description}
          </Text>
          {r.estimated_tax_savings_cents > 0 ? (
            <Text style={{ fontSize: SIZE.bodySmall, fontFamily: FONT.familyMono, color: "#0d6f3a", marginTop: 2 }}>
              Est. tax savings: {formatUsdCompact(r.estimated_tax_savings_cents)}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

// Suppress unused-import lint for buildMortalityLeverage (kept available
// for future inline chart rendering).
void buildMortalityLeverage;
