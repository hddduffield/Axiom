"use client";

// Phase 14.2 — Tab 1: ESTATE TAX PROJECTION.
//
// Three-column layout matching the screenshot:
//
//   LEFT   "Estate Assumptions" (inputs) + "Assets Already Out of Estate"
//   CENTER big title + estate trajectory chart (SVG)
//   RIGHT  read-only outputs at year_out + navy footer card with the
//          TOTAL LIFE INSURANCE NEED in gold serif
//
// Every calculated output has a "?" tooltip showing its exact formula.
// Compliance disclaimer + tracking ID footer at the bottom.

import { useMemo } from "react";
import {
  buildTrajectory,
  capGainsTaxOutOfEstateCents,
  cumulativeSpendCents,
  federalEstateTaxCents,
  formatUsd,
  formatUsdCompact,
  inEstateValueCents,
  indexedExemptionCents,
  netToFamilyCents,
  outOfEstateFvCents,
  stateEstateTaxCents,
  taxableEstateCents,
  totalTaxBillCents,
} from "@/lib/estate-lens/calc";
import {
  STATE_OPTIONS,
  lookupStateEstateTax,
} from "@/lib/estate-lens/state-tax-table";
import type { EstateLensOutput } from "@/lib/estate-lens/types";

import { PanelCard } from "@/components/axiom/PanelCard";
import { FieldStatus } from "@/components/axiom/FieldStatus";
import { isEdited, isSourced } from "@/lib/lens-prefill";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ComplianceFooter,
  FieldLabel,
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

export function EstateProjectionTab({ output, onChange, editable }: Props) {
  const { assumptions, assets_out } = output;
  const year = assumptions.years_out;

  // ───── Outputs at horizon year ─────
  const inEstate = inEstateValueCents(assumptions, year);
  const exemption = indexedExemptionCents(assumptions, year);
  const taxable = taxableEstateCents(assumptions, year);
  const fedTax = federalEstateTaxCents(assumptions, year);
  const stateTax = stateEstateTaxCents(assumptions, year);
  const cumSpend = cumulativeSpendCents(assumptions, year);
  const outFv = outOfEstateFvCents(assumptions, assets_out, year);
  const cgt = capGainsTaxOutOfEstateCents(assumptions, assets_out, year);
  const net = netToFamilyCents(assumptions, assets_out, year);
  const taxBillTotal = totalTaxBillCents(assumptions, assets_out, year);

  const trajectory = useMemo(
    () => buildTrajectory(assumptions, assets_out),
    [assumptions, assets_out],
  );

  // ───── Field helpers ─────
  const updateAssumptions = (
    patch: Partial<EstateLensOutput["assumptions"]>,
  ) => onChange({ ...output, assumptions: { ...assumptions, ...patch } });

  const updateAssetsOut = (
    patch: Partial<EstateLensOutput["assets_out"]>,
  ) => onChange({ ...output, assets_out: { ...assets_out, ...patch } });

  const updateState = (code: string) => {
    const lookup = lookupStateEstateTax(code);
    onChange({
      ...output,
      client_snapshot: { ...output.client_snapshot, state_code: code },
      assumptions: { ...assumptions, state_estate_tax_pct: lookup.rate_pct },
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[320px_1fr_320px]">
        {/* ─────────────── LEFT COLUMN — INPUTS ─────────────── */}
        <div className="flex flex-col gap-4">
          <PanelCard
            title="Estate Assumptions"
            action={
              <span
                className="text-[10px] uppercase"
                style={{
                  color: "var(--text-3)",
                  letterSpacing: "0.08em",
                  fontFamily: "var(--font-mono)",
                }}
              >
                Inputs
              </span>
            }
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>
                  <span className="inline-flex items-center gap-2">
                    Estate Today ($)
                    <FieldStatus
                      sourced={isSourced(output, "assumptions.estate_today_cents")}
                      edited={isEdited(output, "assumptions.estate_today_cents")}
                    />
                  </span>
                </FieldLabel>
                <MoneyInput
                  cents={assumptions.estate_today_cents}
                  onChange={(c) => updateAssumptions({ estate_today_cents: c })}
                />
              </div>
              <div>
                <FieldLabel>
                  <span className="inline-flex items-center gap-2">
                    Annual Spend ($)
                    <FieldStatus
                      sourced={isSourced(output, "assumptions.annual_spend_cents")}
                      edited={isEdited(output, "assumptions.annual_spend_cents")}
                    />
                  </span>
                </FieldLabel>
                <MoneyInput
                  cents={assumptions.annual_spend_cents}
                  onChange={(c) => updateAssumptions({ annual_spend_cents: c })}
                />
              </div>
              <div>
                <FieldLabel>Growth Rate (%)</FieldLabel>
                <PctInput
                  value={assumptions.growth_rate_pct}
                  onChange={(v) => updateAssumptions({ growth_rate_pct: v })}
                  max={50}
                />
              </div>
              <div>
                <FieldLabel>Years Out</FieldLabel>
                <NumberInput
                  value={assumptions.years_out}
                  onChange={(v) => updateAssumptions({ years_out: v || 1 })}
                />
              </div>
              <div>
                <FieldLabel>Combined Exemption ($)</FieldLabel>
                <MoneyInput
                  cents={assumptions.combined_exemption_cents}
                  onChange={(c) =>
                    updateAssumptions({ combined_exemption_cents: c })
                  }
                />
              </div>
              <div>
                <FieldLabel>Exemption Inflation (%)</FieldLabel>
                <PctInput
                  value={assumptions.exemption_inflation_pct}
                  onChange={(v) =>
                    updateAssumptions({ exemption_inflation_pct: v })
                  }
                  max={20}
                />
              </div>
              <div>
                <FieldLabel>Estate Tax Rate (%)</FieldLabel>
                <PctInput
                  value={assumptions.estate_tax_rate_pct}
                  onChange={(v) => updateAssumptions({ estate_tax_rate_pct: v })}
                />
              </div>
              <div>
                <FieldLabel>
                  <span className="inline-flex items-center gap-2">
                    Client Age Today
                    <FieldStatus
                      sourced={isSourced(output, "assumptions.client_age_today")}
                      edited={isEdited(output, "assumptions.client_age_today")}
                    />
                  </span>
                </FieldLabel>
                <NumberInput
                  value={assumptions.client_age_today}
                  onChange={(v) =>
                    updateAssumptions({ client_age_today: v || 1 })
                  }
                />
              </div>
              <div className="col-span-2">
                <FieldLabel>
                  <span className="inline-flex items-center gap-2">
                    State (auto-fills tax rate)
                    <FieldStatus
                      sourced={isSourced(output, "client_snapshot.state_code")}
                      edited={isEdited(output, "client_snapshot.state_code")}
                    />
                  </span>
                </FieldLabel>
                <Select
                  value={output.client_snapshot.state_code ?? undefined}
                  onValueChange={(v) => updateState(v ?? "")}
                  disabled={!editable}
                >
                  <SelectTrigger className="h-9 text-[13px]">
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATE_OPTIONS.map((s) => (
                      <SelectItem key={s.code} value={s.code}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <FieldLabel>State Estate Tax (%)</FieldLabel>
                <PctInput
                  value={assumptions.state_estate_tax_pct}
                  onChange={(v) =>
                    updateAssumptions({ state_estate_tax_pct: v })
                  }
                />
              </div>
            </div>
          </PanelCard>

          <PanelCard
            title="Assets Already Out of Estate"
            action={
              <span
                className="text-[10px] uppercase"
                style={{
                  color: "var(--text-3)",
                  letterSpacing: "0.08em",
                  fontFamily: "var(--font-mono)",
                }}
              >
                Existing Trusts
              </span>
            }
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>FMV Out Today ($)</FieldLabel>
                <MoneyInput
                  cents={assets_out.fmv_out_today_cents}
                  onChange={(c) => updateAssetsOut({ fmv_out_today_cents: c })}
                />
              </div>
              <div>
                <FieldLabel>Cost Basis ($)</FieldLabel>
                <MoneyInput
                  cents={assets_out.cost_basis_cents}
                  onChange={(c) => updateAssetsOut({ cost_basis_cents: c })}
                />
              </div>
              <div>
                <FieldLabel>% Liq. at Death</FieldLabel>
                <PctInput
                  value={assets_out.pct_liquidated_at_death}
                  onChange={(v) =>
                    updateAssetsOut({ pct_liquidated_at_death: v })
                  }
                />
              </div>
              <div>
                <FieldLabel>Federal LTCG (%)</FieldLabel>
                <PctInput
                  value={assets_out.federal_ltcg_pct}
                  onChange={(v) => updateAssetsOut({ federal_ltcg_pct: v })}
                />
              </div>
              <div>
                <FieldLabel>NIIT (%)</FieldLabel>
                <PctInput
                  value={assets_out.niit_pct}
                  onChange={(v) => updateAssetsOut({ niit_pct: v })}
                  step={0.1}
                />
              </div>
              <div>
                <FieldLabel>State LTCG (%)</FieldLabel>
                <PctInput
                  value={assets_out.state_ltcg_pct}
                  onChange={(v) => updateAssetsOut({ state_ltcg_pct: v })}
                />
              </div>
            </div>
            <p
              className="mt-3 text-[11px] italic leading-relaxed"
              style={{ color: "var(--text-3)" }}
            >
              Out-of-estate assets are projected at the estate growth rate. On
              liquidation at death, the trust&apos;s existing cost basis is
              used to compute realized gain — the trust does not get a step-up
              in basis. Cap-gains tax applies to the % liquidated.
            </p>
          </PanelCard>
        </div>

        {/* ─────────────── CENTER COLUMN — CHART ─────────────── */}
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
              Estate Tax Projection
            </h2>
            <p
              className="mt-1 text-[11px] uppercase"
              style={{
                color: "var(--text-3)",
                letterSpacing: "0.08em",
                fontFamily: "var(--font-mono)",
              }}
            >
              Current Trajectory · Federal Estate Tax + Cap Gains on Liquidation
            </p>
          </div>

          <PanelCard title="Estate Trajectory">
            <EstateTrajectoryChart trajectory={trajectory} />
          </PanelCard>
        </div>

        {/* ─────────────── RIGHT COLUMN — OUTPUTS ─────────────── */}
        <div className="flex flex-col gap-4">
          <PanelCard
            title={`Projected at Year ${year}`}
            action={
              <span
                className="text-[10px] uppercase"
                style={{
                  color: "var(--text-3)",
                  letterSpacing: "0.08em",
                  fontFamily: "var(--font-mono)",
                }}
              >
                Outputs
              </span>
            }
          >
            <div className="flex flex-col divide-y" style={{}}>
              <OutputRow
                label="In-Estate Value"
                value={formatUsd(inEstate)}
                formula={{
                  title: "In-Estate Value",
                  formula:
                    "E_n = E_0·(1+g)^n − S·((1+g)^n − 1)/g\n\nE_0 = estate today\ng   = growth rate (decimal)\nS   = annual spend\nn   = years",
                  note: "Annual spend reduces the estate before the next year compounds.",
                }}
              />
              <OutputRow
                label="Indexed Exemption"
                value={formatUsd(exemption)}
                formula={{
                  title: "Indexed Exemption",
                  formula: "X_n = X_0 · (1+i)^n\n\nX_0 = combined exemption\ni   = exemption inflation",
                }}
              />
              <OutputRow
                label="Taxable Estate"
                value={formatUsd(taxable)}
                formula={{
                  title: "Taxable Estate",
                  formula: "T_n = max(0, E_n − X_n)",
                }}
              />
              <OutputRow
                label="Federal Estate Tax"
                value={formatUsd(fedTax)}
                formula={{
                  title: "Federal Estate Tax",
                  formula: "F_n = T_n · estate_tax_rate",
                  note: "v1 uses the top marginal rate flat. Real IRC §2001(c) brackets produce slightly lower effective rates.",
                }}
              />
              {stateTax > 0 ? (
                <OutputRow
                  label="State Estate Tax"
                  value={formatUsd(stateTax)}
                  formula={{
                    title: "State Estate Tax",
                    formula: "ST_n = T_n · state_rate",
                    note: "State exemption is NOT separately subtracted; use a lower effective rate to account for the state exemption.",
                  }}
                />
              ) : null}
              <OutputRow
                label="Cumulative Spend"
                value={formatUsd(cumSpend)}
                formula={{
                  title: "Cumulative Spend",
                  formula: "C_n = annual_spend · n",
                }}
              />
              <OutputRow
                label="Out-of-Estate FV"
                value={formatUsd(outFv)}
                formula={{
                  title: "Out-of-Estate Future Value",
                  formula: "OE_n = FMV_out · (1+g)^n",
                  note: "Trust holds the same asset mix → same growth rate.",
                }}
              />
              <OutputRow
                label="Cap Gains Tax"
                value={formatUsd(cgt)}
                formula={{
                  title: "Cap Gains Tax (Out-of-Estate Liquidation)",
                  formula:
                    "gain = (OE_FV · pct_liq) − (basis · pct_liq)\ntax  = gain · (fed_LTCG + NIIT + state_LTCG)",
                  note: "Carryover basis — no step-up at death.",
                }}
              />
              <OutputRow
                label="Net to Family"
                value={formatUsd(net)}
                formula={{
                  title: "Net to Family",
                  formula: "Net = E_n − F_n − ST_n + OE_FV − CGT_out",
                }}
              />
            </div>
          </PanelCard>

          {/* Navy summary card */}
          <div
            className="rounded-xl p-5"
            style={{
              background: "var(--psa-navy)",
              color: "var(--n-100)",
            }}
          >
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <span
                  className="text-[10px] uppercase opacity-70"
                  style={{ letterSpacing: "0.08em", fontFamily: "var(--font-mono)" }}
                >
                  Estate Tax
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 14 }}>
                  {formatUsdCompact(fedTax + stateTax)}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span
                  className="text-[10px] uppercase opacity-70"
                  style={{ letterSpacing: "0.08em", fontFamily: "var(--font-mono)" }}
                >
                  + Cap Gains Tax
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 14 }}>
                  {formatUsdCompact(cgt)}
                </span>
              </div>
            </div>
            <div
              className="mt-4 border-t pt-4"
              style={{ borderColor: "rgba(255,255,255,0.18)" }}
            >
              <div
                className="text-[10px] uppercase opacity-80"
                style={{
                  letterSpacing: "0.12em",
                  fontFamily: "var(--font-mono)",
                  color: "var(--gold)",
                }}
              >
                Total Life Insurance Need
              </div>
              <div
                className="mt-1"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 32,
                  fontWeight: 500,
                  color: "var(--gold)",
                  lineHeight: 1,
                }}
              >
                {formatUsdCompact(taxBillTotal)}
              </div>
              <p
                className="mt-2 text-[10px] opacity-70"
                style={{ lineHeight: 1.5 }}
              >
                Tax bill the family needs to fund at death.
              </p>
            </div>
          </div>
        </div>
      </div>

      <ComplianceFooter trackingId={output.tracking_id} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Estate Trajectory Chart — pure SVG.
//
// 3 series:
//   - IN-ESTATE VALUE (navy line + pink fill above exemption line)
//   - OUT-OF-ESTATE TRUST (cream dashed)
//   - INDEXED EXEMPTION (gold dashed)
//
// X: 0..years_out (5-year ticks)
// Y: 0..max (rounded up); compact $ labels at quartiles
// ────────────────────────────────────────────────────────────────────────

interface ChartProps {
  trajectory: ReturnType<typeof buildTrajectory>;
}

function EstateTrajectoryChart({ trajectory }: ChartProps) {
  const W = 560;
  const H = 320;
  const margin = { top: 16, right: 76, bottom: 28, left: 16 };

  const maxY = Math.max(
    ...trajectory.map((t) =>
      Math.max(t.in_estate_cents, t.out_of_estate_cents, t.indexed_exemption_cents),
    ),
  );
  const maxYears = trajectory.length === 0 ? 1 : trajectory[trajectory.length - 1].year;

  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;

  const x = (yr: number) => margin.left + (yr / Math.max(maxYears, 1)) * innerW;
  const y = (cents: number) =>
    margin.top + innerH - (cents / Math.max(maxY, 1)) * innerH;

  // Path builders
  const linePath = (key: "in_estate_cents" | "out_of_estate_cents" | "indexed_exemption_cents") =>
    trajectory.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.year)},${y(p[key])}`).join(" ");

  // Pink "taxable estate" fill: between in_estate (top) and indexed_exemption (bottom)
  // only where in_estate > indexed_exemption. We build a polygon by walking
  // forward along in_estate and back along indexed_exemption, but only over
  // the segment where in_estate > exemption.
  const taxableArea = (() => {
    const top: string[] = [];
    const bottom: string[] = [];
    for (const p of trajectory) {
      const showTax = p.in_estate_cents > p.indexed_exemption_cents;
      if (showTax) {
        top.push(`${x(p.year)},${y(p.in_estate_cents)}`);
        bottom.unshift(`${x(p.year)},${y(p.indexed_exemption_cents)}`);
      }
    }
    if (top.length === 0) return "";
    return `M${top.join(" L")} L${bottom.join(" L")} Z`;
  })();

  // Y-axis ticks at 0, 25%, 50%, 75%, 100%
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    v: t * maxY,
    y: y(t * maxY),
    label: formatUsdCompact(t * maxY),
  }));

  // X-axis ticks every 5 years
  const xTicks: number[] = [];
  for (let yr = 0; yr <= maxYears; yr += 5) xTicks.push(yr);
  if (xTicks[xTicks.length - 1] !== maxYears) xTicks.push(maxYears);

  const last = trajectory[trajectory.length - 1];

  return (
    <div className="flex flex-col gap-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 360 }}>
        {/* Y gridlines */}
        {yTicks.map((t, i) => (
          <line
            key={i}
            x1={margin.left}
            x2={margin.left + innerW}
            y1={t.y}
            y2={t.y}
            stroke="var(--border)"
            strokeWidth={0.5}
          />
        ))}
        {/* Y labels (right side) */}
        {yTicks.map((t, i) => (
          <text
            key={`yl-${i}`}
            x={margin.left + innerW + 4}
            y={t.y + 3}
            fontSize={9}
            fill="var(--text-3)"
            fontFamily="var(--font-mono)"
          >
            {t.label}
          </text>
        ))}
        {/* X labels */}
        {xTicks.map((t, i) => (
          <text
            key={`xl-${i}`}
            x={x(t)}
            y={H - margin.bottom + 14}
            fontSize={9}
            fill="var(--text-3)"
            fontFamily="var(--font-mono)"
            textAnchor="middle"
          >
            {t}
          </text>
        ))}
        {/* Taxable estate pink area */}
        {taxableArea ? (
          <path d={taxableArea} fill="rgba(244, 114, 130, 0.30)" stroke="none" />
        ) : null}
        {/* Out-of-estate (cream dashed) */}
        <path
          d={linePath("out_of_estate_cents")}
          stroke="var(--cream-700, #c8a878)"
          strokeWidth={1.5}
          strokeDasharray="5 4"
          fill="none"
        />
        {/* Indexed exemption (gold dashed) */}
        <path
          d={linePath("indexed_exemption_cents")}
          stroke="var(--gold)"
          strokeWidth={1.5}
          strokeDasharray="3 3"
          fill="none"
        />
        {/* In-estate value (navy solid) */}
        <path
          d={linePath("in_estate_cents")}
          stroke="var(--psa-navy)"
          strokeWidth={2}
          fill="none"
        />
        {/* Endpoint dots */}
        {last ? (
          <>
            <circle cx={x(last.year)} cy={y(last.in_estate_cents)} r={3} fill="var(--psa-navy)" />
            <circle cx={x(last.year)} cy={y(last.out_of_estate_cents)} r={3} fill="var(--cream-700, #c8a878)" />
            <circle cx={x(last.year)} cy={y(last.indexed_exemption_cents)} r={3} fill="var(--gold)" />
          </>
        ) : null}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px]" style={{ color: "var(--text-2)", fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>
        <LegendDot color="var(--psa-navy)" /> IN-ESTATE VALUE
        <LegendDot color="rgba(244, 114, 130, 0.40)" /> TAXABLE ESTATE
        <LegendDot color="var(--cream-700, #c8a878)" dashed /> OUT-OF-ESTATE TRUST
        <LegendDot color="var(--gold)" dashed /> INDEXED EXEMPTION
      </div>
    </div>
  );
}

function LegendDot({ color, dashed }: { color: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {dashed ? (
        <svg width={18} height={2}>
          <line x1={0} y1={1} x2={18} y2={1} stroke={color} strokeWidth={1.5} strokeDasharray="3 2" />
        </svg>
      ) : (
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: color }}
        />
      )}
    </span>
  );
}
