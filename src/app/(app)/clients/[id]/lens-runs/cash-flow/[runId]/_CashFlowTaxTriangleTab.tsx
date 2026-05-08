"use client";

// Phase 13.4 — Tax Triangle. Side-by-side Current vs After-Recommendations
// equilateral triangles with a dot positioned via barycentric coordinates
// from (tax_free%, tax_deferred%, taxable%). Below each triangle, a tax
// bill projection table (Year 1 / 5 / 10 / 20 of retirement) using the
// distribution-plan slider state for "After" and current bucket
// distribution for "Current".

import { PanelCard } from "@/components/axiom/PanelCard";
import {
  annualRetirementTaxBillCents,
  buildYearlyDistribution,
  cumulativeTaxSavingsCents,
  currentTaxMix,
  type CashFlowAssumptions,
  type CashFlowLensOutput,
  type TaxTreatmentMix,
} from "@/lib/api/cash_flow_lens";

interface Props {
  output: CashFlowLensOutput;
}

const TRIANGLE_SIZE = 280;
const TRIANGLE_PAD = 30;

// Barycentric → cartesian for an equilateral triangle.
// Top vertex (tax_free), bottom-left (tax_deferred), bottom-right (taxable).
function barycentricToXY(mix: TaxTreatmentMix): { x: number; y: number } {
  const tf = Math.max(mix.tax_free_pct, 0) / 100;
  const td = Math.max(mix.tax_deferred_pct, 0) / 100;
  const tx = Math.max(mix.taxable_pct, 0) / 100;
  const total = tf + td + tx;
  const a = total > 0 ? tf / total : 1 / 3;
  const b = total > 0 ? td / total : 1 / 3;
  const c = total > 0 ? tx / total : 1 / 3;

  const W = TRIANGLE_SIZE;
  const H = (Math.sqrt(3) / 2) * W;
  const top = { x: W / 2, y: TRIANGLE_PAD };
  const bottomLeft = { x: 0, y: H + TRIANGLE_PAD };
  const bottomRight = { x: W, y: H + TRIANGLE_PAD };

  const x = a * top.x + b * bottomLeft.x + c * bottomRight.x;
  const y = a * top.y + b * bottomLeft.y + c * bottomRight.y;
  return { x, y };
}

function fmtCentsShort(c: number): string {
  const v = c / 100;
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `$${Math.round(v / 1_000).toLocaleString()}K`;
  return `$${Math.round(v).toLocaleString()}`;
}

function fmtPct(p: number): string {
  return `${p}%`;
}

export function CashFlowTaxTriangleTab({ output }: Props) {
  const currentMix = currentTaxMix(output);
  const recommendedMix = output.distribution_plan.slider_state;

  const targetIncomeCents = output.assumptions.retirement_income_target_annual_cents;

  // Tax bill table rows: Year 1, 5, 10, 20 of retirement.
  const checkpointYears = [1, 5, 10, 20];

  const currentDist = buildYearlyDistribution({
    start_year: new Date().getFullYear(),
    years: 30,
    target_income_cents: targetIncomeCents,
    mix: currentMix,
    assumptions: output.assumptions,
  });
  const recommendedDist = buildYearlyDistribution({
    start_year: new Date().getFullYear(),
    years: 30,
    target_income_cents: targetIncomeCents,
    mix: recommendedMix,
    assumptions: output.assumptions,
  });

  const cumulativeSavings20 = cumulativeTaxSavingsCents({
    years: 20,
    target_income_cents: targetIncomeCents,
    current_mix: currentMix,
    recommended_mix: recommendedMix,
    assumptions: output.assumptions,
  });

  return (
    <div className="flex flex-col gap-4">
      <PanelCard title="Tax Triangle">
        <p className="mb-4 text-[12px]" style={{ color: "var(--text-2)" }}>
          The dot inside each triangle shows the bucket-mix center of mass.
          Closer to a corner = more concentrated in that tax treatment.
          Annual tax bills below assume drawing{" "}
          <span style={{ fontFamily: "var(--font-mono)" }}>
            {fmtCentsShort(targetIncomeCents)}
          </span>{" "}
          / year in retirement, inflated 2.5%/yr.
        </p>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <TriangleCard
            label="Current Allocation"
            mix={currentMix}
            tone="current"
          />
          <TriangleCard
            label="After Recommendations"
            mix={recommendedMix}
            tone="recommended"
          />
        </div>
      </PanelCard>

      <PanelCard title="Tax bill projection — distribution schedule">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TaxBillTable
            label="Current"
            distribution={currentDist}
            checkpointYears={checkpointYears}
            mix={currentMix}
            assumptions={output.assumptions}
            targetIncomeCents={targetIncomeCents}
          />
          <TaxBillTable
            label="Recommended"
            distribution={recommendedDist}
            checkpointYears={checkpointYears}
            mix={recommendedMix}
            assumptions={output.assumptions}
            targetIncomeCents={targetIncomeCents}
          />
        </div>

        <div
          className="mt-5 rounded-md p-4"
          style={{
            background:
              cumulativeSavings20 > 0 ? "var(--s-green-bg)" : "var(--s-amber-bg)",
            border: `1px solid ${cumulativeSavings20 > 0 ? "var(--s-green)" : "var(--s-amber)"}`,
          }}
        >
          <div
            className="text-[10px] uppercase"
            style={{
              color: cumulativeSavings20 > 0 ? "var(--s-green)" : "var(--s-amber)",
              letterSpacing: "0.06em",
              fontFamily: "var(--font-mono)",
            }}
          >
            Current vs Recommended — 20-year cumulative tax differential
          </div>
          <div
            className="mt-1 text-3xl font-medium"
            style={{
              fontFamily: "var(--font-display)",
              color: cumulativeSavings20 > 0 ? "var(--s-green)" : "var(--s-amber)",
            }}
          >
            {cumulativeSavings20 > 0 ? "−" : "+"}
            {fmtCentsShort(Math.abs(cumulativeSavings20))}
          </div>
          <p className="mt-1 text-[12px]" style={{ color: "var(--text-2)" }}>
            {cumulativeSavings20 > 0
              ? "Estimated tax savings under the recommended allocation."
              : "Estimated additional tax under the recommended allocation. Reconsider slider state."}
          </p>
        </div>
      </PanelCard>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────

function TriangleCard({
  label,
  mix,
  tone,
}: {
  label: string;
  mix: TaxTreatmentMix;
  tone: "current" | "recommended";
}) {
  const dot = barycentricToXY(mix);
  const dotColor = tone === "recommended" ? "#0d6f3a" : "#1a52a8";

  const W = TRIANGLE_SIZE;
  const H = (Math.sqrt(3) / 2) * W;
  const top = { x: W / 2, y: TRIANGLE_PAD };
  const bottomLeft = { x: 0, y: H + TRIANGLE_PAD };
  const bottomRight = { x: W, y: H + TRIANGLE_PAD };

  return (
    <div
      className="rounded-md border p-4"
      style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
    >
      <div
        className="text-[11px] uppercase"
        style={{
          color: "var(--text-3)",
          letterSpacing: "0.06em",
          fontFamily: "var(--font-mono)",
        }}
      >
        {label}
      </div>
      <div className="mt-2 flex justify-center">
        <svg
          width={W + 60}
          height={H + 80}
          viewBox={`-30 0 ${W + 60} ${H + 80}`}
          aria-label={`${label} triangle`}
        >
          {/* Triangle outline */}
          <polygon
            points={`${top.x},${top.y} ${bottomLeft.x},${bottomLeft.y} ${bottomRight.x},${bottomRight.y}`}
            fill="var(--surface)"
            stroke="var(--psa-navy)"
            strokeWidth="2"
          />
          {/* Inner gridlines (subdivision) */}
          {[0.25, 0.5, 0.75].map((t) => (
            <g key={t}>
              <line
                x1={top.x + (bottomLeft.x - top.x) * t}
                y1={top.y + (bottomLeft.y - top.y) * t}
                x2={top.x + (bottomRight.x - top.x) * t}
                y2={top.y + (bottomRight.y - top.y) * t}
                stroke="var(--border)"
                strokeWidth="0.6"
                strokeDasharray="2 2"
              />
            </g>
          ))}
          {/* Dot */}
          <circle cx={dot.x} cy={dot.y} r={9} fill={dotColor} stroke="#ffffff" strokeWidth={2.5} />
          {/* Labels */}
          <text
            x={top.x}
            y={top.y - 12}
            textAnchor="middle"
            fontSize="11"
            fontFamily="var(--font-mono)"
            fill="var(--text-2)"
          >
            TAX-FREE {fmtPct(mix.tax_free_pct)}
          </text>
          <text
            x={bottomLeft.x - 4}
            y={bottomLeft.y + 16}
            textAnchor="end"
            fontSize="11"
            fontFamily="var(--font-mono)"
            fill="var(--text-2)"
          >
            TAX-DEF {fmtPct(mix.tax_deferred_pct)}
          </text>
          <text
            x={bottomRight.x + 4}
            y={bottomRight.y + 16}
            textAnchor="start"
            fontSize="11"
            fontFamily="var(--font-mono)"
            fill="var(--text-2)"
          >
            TAXABLE {fmtPct(mix.taxable_pct)}
          </text>
        </svg>
      </div>
    </div>
  );
}

function TaxBillTable({
  label,
  distribution,
  checkpointYears,
  mix,
  assumptions,
  targetIncomeCents,
}: {
  label: string;
  distribution: ReturnType<typeof buildYearlyDistribution>;
  checkpointYears: number[];
  mix: TaxTreatmentMix;
  assumptions: CashFlowAssumptions;
  targetIncomeCents: number;
}) {
  // Use checkpoint indices (0-based: Year 1 = index 0)
  const cumulativeAtYear20 = distribution
    .slice(0, 20)
    .reduce((acc, d) => acc + d.tax_bill_cents, 0);

  const year1Bill = annualRetirementTaxBillCents({
    target_income_cents: targetIncomeCents,
    mix,
    assumptions,
  });
  void year1Bill;

  return (
    <div
      className="rounded-md border"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <div
        className="border-b px-4 py-3"
        style={{ borderColor: "var(--border)" }}
      >
        <div
          className="text-[11px] uppercase"
          style={{
            color: "var(--text-3)",
            letterSpacing: "0.06em",
            fontFamily: "var(--font-mono)",
          }}
        >
          {label} · annual tax bill
        </div>
      </div>
      <table className="w-full text-[13px]">
        <thead>
          <tr
            className="border-b"
            style={{ borderColor: "var(--border)", color: "var(--text-3)" }}
          >
            <th
              className="px-3 py-2 text-left text-[11px] font-medium uppercase"
              style={{ letterSpacing: "0.04em" }}
            >
              Year of retirement
            </th>
            <th
              className="px-3 py-2 text-right text-[11px] font-medium uppercase"
              style={{ letterSpacing: "0.04em" }}
            >
              Income drawn
            </th>
            <th
              className="px-3 py-2 text-right text-[11px] font-medium uppercase"
              style={{ letterSpacing: "0.04em" }}
            >
              Tax bill
            </th>
            <th
              className="px-3 py-2 text-right text-[11px] font-medium uppercase"
              style={{ letterSpacing: "0.04em" }}
            >
              Effective %
            </th>
          </tr>
        </thead>
        <tbody>
          {checkpointYears.map((y) => {
            const idx = y - 1;
            if (idx >= distribution.length) return null;
            const d = distribution[idx];
            const totalIncome =
              d.tax_free_cents + d.tax_deferred_cents + d.taxable_cents;
            const effectivePct =
              totalIncome > 0
                ? Math.round((d.tax_bill_cents / totalIncome) * 100)
                : 0;
            return (
              <tr
                key={y}
                className="border-b"
                style={{ borderColor: "var(--border)" }}
              >
                <td className="px-3 py-2" style={{ color: "var(--text)" }}>
                  Year {y}
                </td>
                <td
                  className="px-3 py-2 text-right"
                  style={{ fontFamily: "var(--font-mono)", color: "var(--text-2)" }}
                >
                  {fmtCentsShort(totalIncome)}
                </td>
                <td
                  className="px-3 py-2 text-right"
                  style={{ fontFamily: "var(--font-mono)", color: "var(--s-amber)" }}
                >
                  {fmtCentsShort(d.tax_bill_cents)}
                </td>
                <td
                  className="px-3 py-2 text-right"
                  style={{ fontFamily: "var(--font-mono)", color: "var(--text-3)" }}
                >
                  {effectivePct}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div
        className="border-t px-3 py-2"
        style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
            Cumulative · 20-year
          </span>
          <span
            className="text-base font-medium"
            style={{
              fontFamily: "var(--font-display)",
              color: "var(--text)",
            }}
          >
            {fmtCentsShort(cumulativeAtYear20)}
          </span>
        </div>
      </div>
    </div>
  );
}
