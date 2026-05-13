"use client";

// Phase 14.4 — Tab 3: TAX PAYMENT STRATEGY.
//
// 3-column layout matching the screenshot:
//   LEFT   navy "Tax Bill at Death" headline card + "Life Insurance Plan"
//          input card (3 inputs, rest auto)
//   CENTER big serif title + "How to Pay the Tax Bill" + 4 option cards
//          (Cash on Hand / LI Out of Estate / Liquidate Trust / + Mix)
//          with CHEAPEST / MOST EXPENSIVE badges
//   RIGHT  "Why not just invest the premium?" rebuttal + mortality leverage
//          chart + gold "Recommended Strategy" card
//
// Math: calc.ts pure. Tooltips. Compliance footer.

import { useMemo } from "react";
import {
  baselineTaxBillCents,
  buildMortalityLeverage,
  dollarsToFundTaxBillViaLiCents,
  effectiveTaxBillCents,
  formatUsd,
  formatUsdCompact,
  liAdvantageCents,
  liCostPerDollarOfTax,
  payOptionCashOnHandPct,
  payOptionLifeInsurancePct,
  payOptionLiquidateTrustCostCents,
  payOptionLiquidateTrustPct,
  selfInsureNetAfterEstateTaxCents,
  totalPremiumPaidCents,
} from "@/lib/estate-lens/calc";
import type { EstateLensOutput } from "@/lib/estate-lens/types";

import { PanelCard } from "@/components/axiom/PanelCard";
import { useParams } from "next/navigation";
import {
  ComplianceFooter,
  FieldLabel,
  MoneyInput,
  NumberInput,
  OutputRow,
} from "./_atoms";
import { EstateRecommendationsPanel } from "./_EstateRecommendations";

interface Props {
  output: EstateLensOutput;
  onChange: (next: EstateLensOutput) => void;
  editable: boolean;
}

export function EstateTaxPaymentTab({ output, onChange, editable }: Props) {
  const params = useParams<{ runId: string }>();
  const lensId = params.runId;
  const { assumptions, life_insurance, planning_move } = output;

  // Effective tax bill: from Tab 2 (with planning) or Tab 1 (baseline).
  const taxBill = effectiveTaxBillCents(output);
  const baseline = baselineTaxBillCents(output);
  const taxSavings = Math.max(0, baseline - taxBill);

  // Combined cap-gains rate for liquidate-trust option.
  const combinedCapGains =
    planning_move.federal_ltcg_pct +
    planning_move.niit_pct +
    planning_move.state_ltcg_pct;

  const totalPremium = totalPremiumPaidCents(life_insurance);
  const liCost = liCostPerDollarOfTax(life_insurance);
  const liFundsTax = dollarsToFundTaxBillViaLiCents(life_insurance, taxBill);

  // 4 payment options
  const optCash = {
    label: "Cash on Hand (Estate or Trust)",
    pct: payOptionCashOnHandPct(),
    cost: taxBill,
    description:
      "Pay the tax bill dollar-for-dollar from liquid assets at death.",
  };
  const optLi = {
    label: "Life Insurance (Held Out of Estate)",
    pct: payOptionLifeInsurancePct(life_insurance, taxBill),
    cost: liFundsTax,
    description:
      "Pre-fund via permanent LI held in an ILIT. Death benefit passes income- and estate-tax-free.",
  };
  const optLiq = {
    label: "Liquidate Trust Assets",
    pct: payOptionLiquidateTrustPct(combinedCapGains),
    cost: payOptionLiquidateTrustCostCents(taxBill, combinedCapGains),
    description:
      "Sell additional trust assets to cover the tax. Cap-gains drag means you must liquidate more than the tax bill.",
  };
  const optMix = {
    label: "Mix: Half LI + Half Cash",
    pct: (optCash.pct + optLi.pct) / 2,
    cost: (optCash.cost + optLi.cost) / 2,
    description:
      "Hybrid — partially insured, partially funded from estate liquidity at death.",
  };

  const options = [optCash, optLi, optLiq, optMix];
  const cheapest = options.reduce((a, b) => (b.cost < a.cost ? b : a), options[0]);
  const priciest = options.reduce((a, b) => (b.cost > a.cost ? b : a), options[0]);

  // Mortality leverage chart data
  const leverageData = useMemo(
    () => buildMortalityLeverage(life_insurance, assumptions.estate_tax_rate_pct, assumptions.years_out),
    [life_insurance, assumptions.estate_tax_rate_pct, assumptions.years_out],
  );

  const liAdvantageAtYearsOut = liAdvantageCents(
    life_insurance,
    assumptions.estate_tax_rate_pct,
    assumptions.years_out,
  );

  const selfInsureNet = selfInsureNetAfterEstateTaxCents(
    life_insurance,
    assumptions.estate_tax_rate_pct,
    assumptions.years_out,
  );

  const updateLi = (patch: Partial<EstateLensOutput["life_insurance"]>) =>
    onChange({ ...output, life_insurance: { ...life_insurance, ...patch } });

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[320px_1fr_320px]">
        {/* ─────────────── LEFT COLUMN ─────────────── */}
        <div className="flex flex-col gap-4">
          {/* Tax Bill at Death — navy headline */}
          <div
            className="rounded-xl p-5"
            style={{
              background: "var(--psa-navy)",
              color: "var(--n-100)",
            }}
          >
            <div
              className="text-[10px] uppercase"
              style={{
                letterSpacing: "0.12em",
                fontFamily: "var(--font-mono)",
                color: "var(--gold)",
                opacity: 0.9,
              }}
            >
              With Plan: {planning_move.type === "note_sale" ? "Note Sale" : "Gift"}
            </div>
            <div
              className="mt-1"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 32,
                fontWeight: 500,
                color: "var(--n-100)",
                lineHeight: 1,
              }}
            >
              {formatUsdCompact(taxBill)}
            </div>
            <div className="mt-4 space-y-1.5 text-[11px]" style={{ fontFamily: "var(--font-mono)" }}>
              <div className="flex items-baseline justify-between opacity-70">
                <span style={{ letterSpacing: "0.04em" }}>WITHOUT TRUST PLANNING</span>
                <span>{formatUsdCompact(baseline)}</span>
              </div>
              <div
                className="flex items-baseline justify-between"
                style={{ color: "var(--gold)" }}
              >
                <span style={{ letterSpacing: "0.04em" }}>TAX SAVINGS FROM PLANNING</span>
                <span>{formatUsdCompact(taxSavings)}</span>
              </div>
            </div>
          </div>

          {/* Life Insurance Plan */}
          <PanelCard
            title="Life Insurance Plan"
            action={
              <span
                className="text-[10px] uppercase"
                style={{
                  color: "var(--text-3)",
                  letterSpacing: "0.08em",
                  fontFamily: "var(--font-mono)",
                }}
              >
                3 Inputs · Rest is Auto
              </span>
            }
          >
            <div className="grid grid-cols-1 gap-3">
              <div>
                <FieldLabel>Annual Premium ($)</FieldLabel>
                <MoneyInput
                  cents={life_insurance.annual_premium_cents}
                  onChange={(c) => updateLi({ annual_premium_cents: c })}
                />
              </div>
              <div>
                <FieldLabel>Years of Premium</FieldLabel>
                <NumberInput
                  value={life_insurance.years_of_premium}
                  onChange={(v) => updateLi({ years_of_premium: v || 1 })}
                />
              </div>
              <div>
                <FieldLabel>Death Benefit ($)</FieldLabel>
                <MoneyInput
                  cents={life_insurance.death_benefit_cents}
                  onChange={(c) => updateLi({ death_benefit_cents: c })}
                />
              </div>
            </div>
            <div
              className="mt-4 flex flex-col border-t pt-3"
              style={{ borderColor: "var(--border)" }}
            >
              <OutputRow
                label="Total Premium Paid"
                value={formatUsd(totalPremium)}
                formula={{
                  title: "Total Premium Paid",
                  formula: "T = annual_premium · years_of_premium",
                }}
              />
              <OutputRow
                label="LI Cost / $1 of Tax"
                value={liCost.toFixed(3)}
                formula={{
                  title: "LI Cost Per Dollar of Tax",
                  formula: "C = total_premium / death_benefit",
                  note: "Lower is better. ~0.20 = $1 of LI for 20¢ of premium.",
                }}
              />
              <OutputRow
                label="$ to Fund Tax Bill"
                value={formatUsd(liFundsTax)}
                formula={{
                  title: "Dollars to Fund Tax Bill via LI",
                  formula: "= (total_premium / death_benefit) · tax_bill",
                  note: "Premium required to pre-fund the tax via LI leverage.",
                }}
              />
            </div>
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
              Tax Payment Strategy
            </h2>
            <p
              className="mt-1 text-[11px] uppercase"
              style={{
                color: "var(--text-3)",
                letterSpacing: "0.08em",
                fontFamily: "var(--font-mono)",
              }}
            >
              Funding Estate Tax + Cap Gains at Death · Cost Comparison
            </p>
          </div>

          <PanelCard
            title="How to Pay the Tax Bill"
            action={
              <span
                className="text-[10px] uppercase"
                style={{
                  color: "var(--text-3)",
                  letterSpacing: "0.08em",
                  fontFamily: "var(--font-mono)",
                }}
              >
                4 Options Compared
              </span>
            }
          >
            <p
              className="mb-4 text-[12px] leading-relaxed"
              style={{ color: "var(--text-2)" }}
            >
              The estate tax + cap gains tax bill at death needs to be funded by
              one of these mechanisms. Each has a different cost-per-dollar
              ratio. Life insurance held out of estate consistently provides the
              cheapest leverage when the insured lives a normal-to-long
              actuarial life — the death benefit is paid in full, while the
              total premium paid is a fraction of the benefit.
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {options.map((opt) => {
                const isCheapest = opt === cheapest;
                const isPriciest = opt === priciest;
                return (
                  <div
                    key={opt.label}
                    className="rounded-lg border p-4"
                    style={{
                      background: isCheapest
                        ? "rgba(212, 175, 55, 0.08)"
                        : "var(--surface)",
                      borderColor: isCheapest
                        ? "var(--gold)"
                        : "var(--border)",
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div
                        className="text-[11px] uppercase"
                        style={{
                          color: "var(--text-3)",
                          letterSpacing: "0.06em",
                          fontFamily: "var(--font-mono)",
                          fontWeight: 600,
                        }}
                      >
                        {opt.label}
                      </div>
                      {isCheapest ? (
                        <span
                          className="inline-flex rounded-full px-2 py-0.5 text-[9px] uppercase"
                          style={{
                            background: "var(--gold)",
                            color: "var(--psa-navy)",
                            letterSpacing: "0.08em",
                            fontFamily: "var(--font-mono)",
                            fontWeight: 700,
                          }}
                        >
                          Cheapest
                        </span>
                      ) : isPriciest ? (
                        <span
                          className="inline-flex rounded-full px-2 py-0.5 text-[9px] uppercase"
                          style={{
                            background: "var(--s-red-bg)",
                            color: "var(--s-red)",
                            letterSpacing: "0.08em",
                            fontFamily: "var(--font-mono)",
                            fontWeight: 700,
                          }}
                        >
                          Most Expensive
                        </span>
                      ) : null}
                    </div>
                    <div
                      className="mt-2"
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: 22,
                        fontWeight: 500,
                        color: isCheapest ? "var(--gold)" : "var(--text)",
                      }}
                    >
                      {opt.pct.toFixed(1)}%
                    </div>
                    <div
                      className="mt-0.5 text-[12px]"
                      style={{
                        fontFamily: "var(--font-mono)",
                        color: "var(--text-2)",
                      }}
                    >
                      {formatUsdCompact(opt.cost)}
                    </div>
                    <p
                      className="mt-2 text-[11px] leading-relaxed"
                      style={{ color: "var(--text-3)" }}
                    >
                      {opt.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </PanelCard>
        </div>

        {/* ─────────────── RIGHT COLUMN ─────────────── */}
        <div className="flex flex-col gap-4">
          <PanelCard title="Why not just invest the premium?">
            <p
              className="text-[12px] leading-relaxed"
              style={{ color: "var(--text-2)" }}
            >
              Self-insure: invest the same premium dollars at the estate growth
              rate. The principal is taxable at the estate marginal rate at
              death — and only catches the death benefit if the insured lives
              well past actuarial expectations.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div
                className="rounded-lg p-3"
                style={{
                  background: "var(--surface-2)",
                }}
              >
                <div
                  className="text-[10px] uppercase"
                  style={{
                    color: "var(--text-3)",
                    letterSpacing: "0.06em",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  Self-Insure @ Y{assumptions.years_out}
                </div>
                <div
                  className="mt-1"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 18,
                    fontWeight: 500,
                    color: "var(--text)",
                  }}
                >
                  {formatUsdCompact(selfInsureNet)}
                </div>
                <div
                  className="mt-0.5 text-[10px]"
                  style={{ color: "var(--text-3)" }}
                >
                  After estate tax
                </div>
              </div>
              <div
                className="rounded-lg p-3"
                style={{
                  background: "rgba(212, 175, 55, 0.1)",
                  border: "1px solid var(--gold)",
                }}
              >
                <div
                  className="text-[10px] uppercase"
                  style={{
                    color: "var(--text-3)",
                    letterSpacing: "0.06em",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  Life Insurance @ Y{assumptions.years_out}
                </div>
                <div
                  className="mt-1"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 18,
                    fontWeight: 500,
                    color: "var(--gold)",
                  }}
                >
                  {formatUsdCompact(life_insurance.death_benefit_cents)}
                </div>
                <div
                  className="mt-0.5 text-[10px]"
                  style={{ color: "var(--text-3)" }}
                >
                  Out of estate
                </div>
              </div>
            </div>

            <div
              className="mt-4 rounded-lg border p-3"
              style={{ borderColor: "var(--border)" }}
            >
              <div
                className="text-[10px] uppercase"
                style={{
                  color: "var(--gold)",
                  letterSpacing: "0.08em",
                  fontFamily: "var(--font-mono)",
                  fontWeight: 600,
                }}
              >
                LI Advantage to Heirs (Death at Year {assumptions.years_out})
              </div>
              <div
                className="mt-1"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 26,
                  fontWeight: 600,
                  color: "var(--gold)",
                  lineHeight: 1,
                }}
              >
                {formatUsdCompact(Math.max(0, liAdvantageAtYearsOut))}
              </div>
            </div>

            <MortalityLeverageChart
              data={leverageData}
              years={assumptions.years_out}
            />
            <p
              className="mt-3 text-[11px] italic leading-relaxed"
              style={{ color: "var(--text-3)" }}
            >
              Mortality leverage visualized: LI pays the full death benefit at
              any death year. Self-insure (after estate tax) only catches up if
              death is very late.
            </p>
          </PanelCard>

          {/* Gold "Recommended Strategy" */}
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
              Recommended Strategy
            </div>
            <div
              className="mt-1"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 18,
                fontWeight: 600,
                color: "var(--psa-navy)",
                lineHeight: 1.15,
              }}
            >
              {cheapest.label}
            </div>
            <div
              className="mt-2"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 32,
                fontWeight: 600,
                color: "var(--psa-navy)",
                lineHeight: 1,
              }}
            >
              {formatUsdCompact(cheapest.cost)}
            </div>
            <p
              className="mt-3 text-[11px] leading-relaxed"
              style={{ color: "var(--psa-navy)", opacity: 0.75 }}
            >
              {cheapest.description}
            </p>
          </div>
        </div>
      </div>

      {/* Action item recommendations + push */}
      <div className="mt-2 grid grid-cols-1 gap-5 xl:grid-cols-[1fr_320px]">
        <EstateRecommendationsPanel
          lensId={lensId}
          output={output}
          onChange={onChange}
          editable={editable}
        />
        <div className="flex flex-col gap-4">
          <PanelCard title="Plan Linkage">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={output.linked_to_main_plan}
                onChange={(e) =>
                  onChange({ ...output, linked_to_main_plan: e.target.checked })
                }
                disabled={!editable}
                className="mt-1"
              />
              <div>
                <div className="text-[13px]" style={{ color: "var(--text)" }}>
                  Link to main plan
                </div>
                <p className="mt-1 text-[11px]" style={{ color: "var(--text-3)" }}>
                  Reference this scenario in the client&apos;s next generated
                  plan body. Useful when this scenario will be presented
                  alongside the full advisory plan.
                </p>
              </div>
            </label>
          </PanelCard>
        </div>
      </div>

      <ComplianceFooter trackingId={output.tracking_id} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Mortality Leverage SVG chart — gold-filled LI advantage area.
// ────────────────────────────────────────────────────────────────────────

interface ChartProps {
  data: ReturnType<typeof buildMortalityLeverage>;
  years: number;
}

function MortalityLeverageChart({ data, years }: ChartProps) {
  const W = 280;
  const H = 160;
  const margin = { top: 10, right: 12, bottom: 24, left: 10 };

  const maxY = Math.max(
    ...data.map((d) => Math.max(d.death_benefit_cents, d.self_insure_after_tax_cents)),
    1,
  );
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;
  const x = (yr: number) => margin.left + (yr / Math.max(years, 1)) * innerW;
  const y = (v: number) => margin.top + innerH - (v / maxY) * innerH;

  const dbLine = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(d.year)},${y(d.death_benefit_cents)}`).join(" ");
  const siLine = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(d.year)},${y(d.self_insure_after_tax_cents)}`).join(" ");

  // Gold advantage area: between DB (top) and self-insure (bottom)
  const top = data.map((d) => `${x(d.year)},${y(d.death_benefit_cents)}`).join(" L");
  const bottom = [...data].reverse().map((d) => `${x(d.year)},${y(d.self_insure_after_tax_cents)}`).join(" L");
  const advArea = `M${top} L${bottom} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full">
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
      {/* Advantage area */}
      <path d={advArea} fill="rgba(212, 175, 55, 0.30)" stroke="none" />
      {/* DB line */}
      <path d={dbLine} stroke="var(--gold)" strokeWidth={2} fill="none" />
      {/* Self-insure line */}
      <path d={siLine} stroke="var(--text-3)" strokeWidth={1.5} fill="none" strokeDasharray="4 3" />
      {/* X labels */}
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
    </svg>
  );
}
