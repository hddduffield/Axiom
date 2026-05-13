"use client";

// Phase 14.3 — Tab 2: TRUST PLANNING CALCULATOR.
//
// 3-column layout matching the screenshot:
//   LEFT   "Current State" card mirroring Tab 1 inputs + Estate Trajectory
//          chart comparing No Planning vs With Trust Planning
//   CENTER big serif title + "New Planning Move" toggle (Note Sale / Gift)
//          + planning move inputs + italic explanation + Trust Outputs
//   RIGHT  "Aggregate Family Outcome" comparison table + gold savings
//          callout card
//
// All math is in calc.ts. Tooltips on every output. Compliance footer.

import { useMemo } from "react";
import {
  aggregateNoPlanning,
  aggregateWithPlanning,
  alternateMove,
  buildTrajectory,
  discountedFmvCents,
  familySavingsCents,
  formatUsd,
  formatUsdCompact,
  inEstateValueCents,
  inEstateValueWithMoveCents,
  netTrustToHeirsCents,
  noteFaceValueCents,
  trustCapGainCents,
  trustCapGainsTaxCents,
  trustCostBasisCents,
  trustFvCents,
} from "@/lib/estate-lens/calc";
import type {
  EstateLensOutput,
  PlanningMoveType,
} from "@/lib/estate-lens/types";

import { PanelCard } from "@/components/axiom/PanelCard";
import {
  ComplianceFooter,
  FieldLabel,
  FormulaTooltip,
  MoneyInput,
  NumberInput,
  OutputRow,
  PctInput,
} from "./_atoms";

interface Props {
  output: EstateLensOutput;
  onChange: (next: EstateLensOutput) => void;
  editable: boolean;
}

export function EstateTrustPlanningTab({ output, onChange }: Props) {
  const { assumptions, assets_out, planning_move } = output;

  const noPlan = useMemo(
    () => aggregateNoPlanning(assumptions, assets_out),
    [assumptions, assets_out],
  );
  const withPlan = useMemo(
    () => aggregateWithPlanning(assumptions, assets_out, planning_move),
    [assumptions, assets_out, planning_move],
  );
  const alternative = useMemo(() => alternateMove(planning_move), [planning_move]);
  const altAgg = useMemo(
    () => aggregateWithPlanning(assumptions, assets_out, alternative),
    [assumptions, assets_out, alternative],
  );

  const savings = familySavingsCents(noPlan, withPlan);
  const altSavings = familySavingsCents(noPlan, altAgg);
  const switchDelta = altSavings - savings;

  // ─── Trajectory comparison data ───
  const trajNoPlan = useMemo(
    () => buildTrajectory(assumptions, assets_out),
    [assumptions, assets_out],
  );
  // "With planning" trajectory: in-estate is reduced by the planning move
  // at t=0 and re-projected.
  const trajWithPlan = useMemo(() => {
    const out: { year: number; in_estate_cents: number }[] = [];
    for (let y = 0; y <= assumptions.years_out; y++) {
      out.push({
        year: y,
        in_estate_cents: inEstateValueWithMoveCents(assumptions, planning_move, y),
      });
    }
    return out;
  }, [assumptions, planning_move]);

  const updatePlanningMove = (patch: Partial<EstateLensOutput["planning_move"]>) =>
    onChange({ ...output, planning_move: { ...planning_move, ...patch } });

  const moveType: PlanningMoveType = planning_move.type;

  const trustBasisVal = trustCostBasisCents(planning_move);
  const trustFv = trustFvCents(planning_move, assumptions.years_out);
  const noteFace = noteFaceValueCents(planning_move);
  const capGain = trustCapGainCents(planning_move, assumptions.years_out);
  const capGainsTax = trustCapGainsTaxCents(planning_move, assumptions.years_out);
  const netTrust = netTrustToHeirsCents(planning_move, assumptions.years_out);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[320px_1fr_320px]">
        {/* ─────────────── LEFT COLUMN ─────────────── */}
        <div className="flex flex-col gap-4">
          <PanelCard title="Current State">
            <div className="grid grid-cols-2 gap-3">
              <Mirror label="Estate Today" value={formatUsdCompact(assumptions.estate_today_cents)} />
              <Mirror label="Annual Spend" value={formatUsdCompact(assumptions.annual_spend_cents)} />
              <Mirror label="Growth Rate" value={`${assumptions.growth_rate_pct}%`} />
              <Mirror label="Years Out" value={`${assumptions.years_out}`} />
              <Mirror label="Combined Exempt." value={formatUsdCompact(assumptions.combined_exemption_cents)} />
              <Mirror label="Exempt. Infl." value={`${assumptions.exemption_inflation_pct}%`} />
              <Mirror label="State Tax" value={`${assumptions.state_estate_tax_pct}%`} />
              <Mirror label="Out-of-Estate" value={formatUsdCompact(assets_out.fmv_out_today_cents)} />
            </div>
            <p
              className="mt-3 text-[11px] italic leading-relaxed"
              style={{ color: "var(--text-3)" }}
            >
              Edit these on Tab 01. Shown here for context.
            </p>
          </PanelCard>

          <PanelCard title="Estate Trajectory">
            <TrustComparisonChart
              years={assumptions.years_out}
              noPlan={trajNoPlan.map((t) => ({ year: t.year, value: t.in_estate_cents }))}
              withPlan={trajWithPlan.map((t) => ({ year: t.year, value: t.in_estate_cents }))}
            />
          </PanelCard>
        </div>

        {/* ─────────────── CENTER COLUMN ─────────────── */}
        <div className="flex flex-col gap-4">
          <div>
            <div
              className="text-[10px] uppercase"
              style={{
                color: "var(--text-3)",
                letterSpacing: "0.12em",
                fontFamily: "var(--font-mono)",
              }}
            >
              PSA WEALTH
            </div>
            <h2
              className="mt-1 text-2xl font-medium uppercase"
              style={{
                fontFamily: "var(--font-display)",
                letterSpacing: "0.04em",
                color: "var(--psa-navy)",
              }}
            >
              Trust Planning Calculator
            </h2>
            <p
              className="mt-1 text-[11px] uppercase"
              style={{
                color: "var(--text-3)",
                letterSpacing: "0.08em",
                fontFamily: "var(--font-mono)",
              }}
            >
              Move Additional Assets via Gift or Note Sale · Compare Outcomes
            </p>
          </div>

          <PanelCard title="New Planning Move">
            {/* Move type toggle */}
            <div className="mb-4 inline-flex rounded-md overflow-hidden border" style={{ borderColor: "var(--border)" }}>
              <button
                type="button"
                onClick={() => updatePlanningMove({ type: "note_sale" })}
                className="px-4 py-2 text-[11px] uppercase transition-colors"
                style={{
                  background: moveType === "note_sale" ? "var(--psa-navy)" : "var(--surface)",
                  color: moveType === "note_sale" ? "var(--n-100)" : "var(--text-2)",
                  letterSpacing: "0.08em",
                  fontFamily: "var(--font-mono)",
                  fontWeight: 600,
                }}
              >
                Note Sale
              </button>
              <button
                type="button"
                onClick={() => updatePlanningMove({ type: "gift" })}
                className="px-4 py-2 text-[11px] uppercase transition-colors"
                style={{
                  background: moveType === "gift" ? "var(--psa-navy)" : "var(--surface)",
                  color: moveType === "gift" ? "var(--n-100)" : "var(--text-2)",
                  letterSpacing: "0.08em",
                  fontFamily: "var(--font-mono)",
                  fontWeight: 600,
                  borderLeft: "1px solid var(--border)",
                }}
              >
                Gift to Trust
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>FMV Transferred ($)</FieldLabel>
                <MoneyInput
                  cents={planning_move.fmv_transferred_cents}
                  onChange={(c) => updatePlanningMove({ fmv_transferred_cents: c })}
                />
              </div>
              <div>
                <FieldLabel>Original Cost Basis ($)</FieldLabel>
                <MoneyInput
                  cents={planning_move.original_cost_basis_cents}
                  onChange={(c) => updatePlanningMove({ original_cost_basis_cents: c })}
                />
              </div>
              <div>
                <FieldLabel>Valuation Discount (%)</FieldLabel>
                <PctInput
                  value={planning_move.valuation_discount_pct}
                  onChange={(v) => updatePlanningMove({ valuation_discount_pct: v })}
                  max={70}
                />
              </div>
              <div>
                <FieldLabel>AFR Rate (%)</FieldLabel>
                <PctInput
                  value={planning_move.afr_rate_pct}
                  onChange={(v) => updatePlanningMove({ afr_rate_pct: v })}
                  max={20}
                />
              </div>
              <div>
                <FieldLabel>Trust Growth (%)</FieldLabel>
                <PctInput
                  value={planning_move.trust_growth_pct}
                  onChange={(v) => updatePlanningMove({ trust_growth_pct: v })}
                  max={50}
                />
              </div>
              <div>
                <FieldLabel>Years to Liquidation</FieldLabel>
                <NumberInput
                  value={planning_move.years_to_liquidation}
                  onChange={(v) => updatePlanningMove({ years_to_liquidation: v || 1 })}
                />
              </div>
              <div>
                <FieldLabel>% Liq. at Death</FieldLabel>
                <PctInput
                  value={planning_move.pct_liquidated_at_death}
                  onChange={(v) => updatePlanningMove({ pct_liquidated_at_death: v })}
                />
              </div>
              <div>
                <FieldLabel>Federal LTCG (%)</FieldLabel>
                <PctInput
                  value={planning_move.federal_ltcg_pct}
                  onChange={(v) => updatePlanningMove({ federal_ltcg_pct: v })}
                />
              </div>
              <div>
                <FieldLabel>NIIT (%)</FieldLabel>
                <PctInput
                  value={planning_move.niit_pct}
                  onChange={(v) => updatePlanningMove({ niit_pct: v })}
                  step={0.1}
                />
              </div>
              <div>
                <FieldLabel>State LTCG (%)</FieldLabel>
                <PctInput
                  value={planning_move.state_ltcg_pct}
                  onChange={(v) => updatePlanningMove({ state_ltcg_pct: v })}
                />
              </div>
            </div>

            <p
              className="mt-4 text-[12px] italic leading-relaxed"
              style={{ color: "var(--text-3)" }}
            >
              {moveType === "note_sale" ? (
                <>
                  <strong style={{ color: "var(--text-2)", fontStyle: "normal" }}>
                    Note Sale:
                  </strong>{" "}
                  Trust pays the seller a promissory note for the discounted FMV.
                  The trust takes a carryover basis from the seller (sale to a
                  grantor trust is income-tax-disregarded under Rev. Rul. 85-13).
                  AFR interest is paid annually back to the seller&apos;s estate.
                  The note&apos;s face value stays in the estate (frozen). No
                  exemption used.
                </>
              ) : (
                <>
                  <strong style={{ color: "var(--text-2)", fontStyle: "normal" }}>
                    Gift:
                  </strong>{" "}
                  Transferor uses lifetime exemption (IRC §2505) to remove the
                  discounted FMV from the estate. Trust takes a carryover basis
                  (IRC §1015). Cap gains apply on liquidation.
                </>
              )}
            </p>
          </PanelCard>

          <PanelCard title={`New Trust Outputs @ Year ${assumptions.years_out}`}>
            <div className="flex flex-col">
              <OutputRow
                label="Discounted FMV"
                value={formatUsd(discountedFmvCents(planning_move))}
                formula={{
                  title: "Discounted FMV",
                  formula: "D = FMV · (1 − discount)",
                  note: "Value removed from estate (Gift) or principal of promissory note (Note Sale).",
                }}
              />
              <OutputRow
                label="Trust Cost Basis"
                value={formatUsd(trustBasisVal)}
                formula={{
                  title: "Trust Cost Basis",
                  formula: "Trust inherits original cost basis (carryover).",
                  note: "Both Note Sale (Rev. Rul. 85-13) and Gift (IRC §1015) transfer basis unchanged.",
                }}
              />
              <OutputRow
                label="FV of Trust Assets"
                value={formatUsd(trustFv)}
                formula={{
                  title: "Trust Future Value",
                  formula: "TFV = D · (1 + trust_growth)^n",
                }}
              />
              {moveType === "note_sale" ? (
                <OutputRow
                  label="Note Face Value"
                  value={formatUsd(noteFace)}
                  formula={{
                    title: "Note Face Value",
                    formula: "NF = FMV · (1 − discount)",
                    note: "Stays in estate (frozen). Receives AFR interest annually.",
                  }}
                />
              ) : null}
              <OutputRow
                label="Cap Gain on Liq."
                value={formatUsd(capGain)}
                formula={{
                  title: "Cap Gain on Liquidation",
                  formula: "gain = (TFV · pct_liq) − (basis · pct_liq)",
                }}
              />
              <OutputRow
                label="Cap Gains Tax"
                value={formatUsd(capGainsTax)}
                formula={{
                  title: "Cap Gains Tax",
                  formula: "tax = gain · (fed_LTCG + NIIT + state_LTCG)",
                }}
              />
              <OutputRow
                label="Net Trust to Heirs"
                value={formatUsd(netTrust)}
                formula={{
                  title: "Net Trust to Heirs",
                  formula: "Net = TFV − cap_gains_tax",
                }}
                highlight
              />
            </div>
          </PanelCard>
        </div>

        {/* ─────────────── RIGHT COLUMN ─────────────── */}
        <div className="flex flex-col gap-4">
          <PanelCard
            title="Aggregate Family Outcome"
            action={
              <span
                className="text-[10px] uppercase"
                style={{
                  color: "var(--text-3)",
                  letterSpacing: "0.08em",
                  fontFamily: "var(--font-mono)",
                }}
              >
                Plan vs No Plan
              </span>
            }
          >
            <ComparisonTable noPlan={noPlan} withPlan={withPlan} />
            <p
              className="mt-4 text-[12px] leading-relaxed"
              style={{ color: "var(--text-2)" }}
            >
              If you switched to{" "}
              <strong>{moveType === "note_sale" ? "Gift" : "Note Sale"}</strong>,
              the family would{" "}
              {switchDelta >= 0 ? (
                <>
                  save an{" "}
                  <span style={{ color: "var(--gold)", fontWeight: 600 }}>
                    additional {formatUsd(Math.abs(switchDelta))}
                  </span>
                </>
              ) : (
                <>
                  receive{" "}
                  <span style={{ color: "var(--s-red)", fontWeight: 600 }}>
                    {formatUsd(Math.abs(switchDelta))} less
                  </span>
                </>
              )}
              .
            </p>
          </PanelCard>

          {/* Gold "FAMILY SAVES" card */}
          <div
            className="rounded-xl p-5"
            style={{
              background: "var(--gold)",
              color: "var(--psa-navy)",
            }}
          >
            <div
              className="text-[10px] uppercase"
              style={{
                letterSpacing: "0.12em",
                fontFamily: "var(--font-mono)",
                opacity: 0.7,
              }}
            >
              Family Saves
            </div>
            <div
              className="mt-1 flex items-baseline gap-2"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 38,
                fontWeight: 600,
                color: "var(--psa-navy)",
                lineHeight: 1,
              }}
            >
              {formatUsdCompact(Math.max(0, savings))}
              <FormulaTooltip
                title="Family Savings"
                formula={"savings = net_to_family[with_plan] − net_to_family[no_plan]"}
                note="Difference in Year-N net family wealth between the two scenarios."
              />
            </div>
            <p
              className="mt-2 text-[11px] leading-relaxed"
              style={{ color: "var(--psa-navy)", opacity: 0.75 }}
            >
              Year-{assumptions.years_out} delta. Includes federal estate tax,
              state estate tax, cap gains drag, and trust appreciation.
            </p>
          </div>
        </div>
      </div>

      <ComplianceFooter trackingId={output.tracking_id} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────

function Mirror({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        className="text-[10px] uppercase"
        style={{
          color: "var(--text-3)",
          letterSpacing: "0.06em",
          fontFamily: "var(--font-mono)",
        }}
      >
        {label}
      </div>
      <div
        className="mt-0.5 text-[13px]"
        style={{
          fontFamily: "var(--font-mono)",
          color: "var(--text)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function ComparisonTable({
  noPlan,
  withPlan,
}: {
  noPlan: ReturnType<typeof aggregateNoPlanning>;
  withPlan: ReturnType<typeof aggregateWithPlanning>;
}) {
  const rows = [
    {
      label: "Federal Estate Tax",
      a: noPlan.federal_estate_tax_cents,
      b: withPlan.federal_estate_tax_cents,
      betterLow: true,
    },
    {
      label: "Cap Gains (Combined)",
      a: noPlan.cap_gains_tax_combined_cents,
      b: withPlan.cap_gains_tax_combined_cents,
      betterLow: true,
    },
    {
      label: "Total Tax",
      a: noPlan.total_tax_cents,
      b: withPlan.total_tax_cents,
      betterLow: true,
      bold: true,
    },
    {
      label: "Net to Family",
      a: noPlan.net_to_family_cents,
      b: withPlan.net_to_family_cents,
      betterLow: false,
      bold: true,
    },
    {
      label: "Total LI Need",
      a: noPlan.total_li_need_cents,
      b: withPlan.total_li_need_cents,
      betterLow: true,
    },
  ];

  return (
    <table className="w-full text-[12px]">
      <thead>
        <tr style={{ borderBottom: "1px solid var(--border)" }}>
          <th />
          <th
            className="py-2 text-right text-[10px] uppercase"
            style={{
              color: "var(--text-3)",
              letterSpacing: "0.08em",
              fontFamily: "var(--font-mono)",
              fontWeight: 500,
            }}
          >
            No Planning
          </th>
          <th
            className="py-2 text-right text-[10px] uppercase"
            style={{
              color: "var(--psa-navy)",
              letterSpacing: "0.08em",
              fontFamily: "var(--font-mono)",
              fontWeight: 600,
            }}
          >
            With Trust Planning
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const delta = r.b - r.a;
          const improved = r.betterLow ? delta < 0 : delta > 0;
          return (
            <tr key={r.label} style={{ borderBottom: "1px solid var(--border)" }}>
              <td
                className="py-1.5 text-[10px] uppercase"
                style={{
                  color: r.bold ? "var(--text)" : "var(--text-3)",
                  letterSpacing: "0.06em",
                  fontFamily: "var(--font-mono)",
                  fontWeight: r.bold ? 600 : 500,
                }}
              >
                {r.label}
              </td>
              <td
                className="py-1.5 text-right"
                style={{
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-2)",
                  fontWeight: r.bold ? 600 : 500,
                }}
              >
                {formatUsdCompact(r.a)}
              </td>
              <td
                className="py-1.5 text-right"
                style={{
                  fontFamily: "var(--font-mono)",
                  color: improved ? "var(--gold)" : "var(--text)",
                  fontWeight: r.bold ? 600 : 500,
                }}
              >
                {formatUsdCompact(r.b)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Trust comparison SVG chart — two lines (No Planning vs With Planning).
// ────────────────────────────────────────────────────────────────────────

interface ChartProps {
  years: number;
  noPlan: { year: number; value: number }[];
  withPlan: { year: number; value: number }[];
}

function TrustComparisonChart({ years, noPlan, withPlan }: ChartProps) {
  const W = 280;
  const H = 200;
  const margin = { top: 12, right: 56, bottom: 24, left: 10 };

  const maxY = Math.max(
    ...noPlan.map((p) => p.value),
    ...withPlan.map((p) => p.value),
    1,
  );

  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;
  const x = (yr: number) => margin.left + (yr / Math.max(years, 1)) * innerW;
  const y = (v: number) => margin.top + innerH - (v / maxY) * innerH;

  const linePath = (pts: { year: number; value: number }[]) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.year)},${y(p.value)}`).join(" ");

  const lastA = noPlan[noPlan.length - 1];
  const lastB = withPlan[withPlan.length - 1];

  return (
    <div className="flex flex-col gap-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {/* gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
          <line
            key={i}
            x1={margin.left}
            x2={margin.left + innerW}
            y1={margin.top + innerH * (1 - t)}
            y2={margin.top + innerH * (1 - t)}
            stroke="var(--border)"
            strokeWidth={0.5}
          />
        ))}
        {/* X ticks at 0/half/full */}
        {[0, Math.floor(years / 2), years].map((t, i) => (
          <text
            key={i}
            x={x(t)}
            y={H - margin.bottom + 12}
            fontSize={8}
            fill="var(--text-3)"
            fontFamily="var(--font-mono)"
            textAnchor="middle"
          >
            {t}
          </text>
        ))}
        {/* No planning */}
        <path d={linePath(noPlan)} stroke="var(--text-3)" strokeWidth={1.5} fill="none" strokeDasharray="4 3" />
        {/* With planning */}
        <path d={linePath(withPlan)} stroke="var(--psa-navy)" strokeWidth={2} fill="none" />
        {/* Endpoint labels */}
        {lastA ? (
          <>
            <circle cx={x(lastA.year)} cy={y(lastA.value)} r={2.5} fill="var(--text-3)" />
            <text
              x={x(lastA.year) + 4}
              y={y(lastA.value) - 2}
              fontSize={8}
              fill="var(--text-3)"
              fontFamily="var(--font-mono)"
            >
              {formatUsdCompact(lastA.value)}
            </text>
          </>
        ) : null}
        {lastB ? (
          <>
            <circle cx={x(lastB.year)} cy={y(lastB.value)} r={2.5} fill="var(--psa-navy)" />
            <text
              x={x(lastB.year) + 4}
              y={y(lastB.value) + 10}
              fontSize={8}
              fill="var(--psa-navy)"
              fontFamily="var(--font-mono)"
              fontWeight="600"
            >
              {formatUsdCompact(lastB.value)}
            </text>
          </>
        ) : null}
      </svg>
      <div className="flex flex-col gap-1 text-[10px]" style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>
        <div style={{ color: "var(--text-3)" }}>
          <span className="mr-1.5 inline-block h-px w-3 align-middle" style={{ background: "var(--text-3)", borderTop: "1px dashed var(--text-3)" }} />
          NO PLANNING
        </div>
        <div style={{ color: "var(--psa-navy)" }}>
          <span className="mr-1.5 inline-block h-0.5 w-3 align-middle" style={{ background: "var(--psa-navy)" }} />
          WITH TRUST PLANNING
        </div>
      </div>
    </div>
  );
}
