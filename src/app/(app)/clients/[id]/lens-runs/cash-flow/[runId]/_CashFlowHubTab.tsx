"use client";

// Phase 13.3 — Hub view. Hub-and-spoke flow chart with navy header band,
// cream emergency-fund tracker, white center w/ Household → Financial
// Foundation → bucket cards.

import { Home } from "lucide-react";

import {
  availableMonthlyAllocationCents,
  emergencyFundFunded,
  emergencyFundTargetCents,
  growthRateForBucket,
  netIncomeAnnualCents,
  netIncomeMonthlyCents,
  projectBucketBalanceCents,
  type CashFlowBucket,
  type CashFlowLensOutput,
  type TaxTreatment,
} from "@/lib/api/cash_flow_lens";

interface Props {
  output: CashFlowLensOutput;
  client: { household_name: string };
}

const TAX_TREATMENT_COLORS: Record<TaxTreatment, { fg: string; bg: string }> = {
  tax_free: { fg: "#0d6f3a", bg: "#d3f4e0" },
  tax_deferred: { fg: "#a25a00", bg: "#fde6c5" },
  taxable: { fg: "#1a52a8", bg: "#d2e2f8" },
  mixed: { fg: "#0a6571", bg: "#cae9ec" },
};

const TAX_TREATMENT_LABELS: Record<TaxTreatment, string> = {
  tax_free: "Tax-free",
  tax_deferred: "Tax-deferred",
  taxable: "Taxable",
  mixed: "Mixed",
};

function fmtCents(c: number, opts?: { showCents?: boolean }): string {
  if (c === 0) return "$0";
  const dollars = c / 100;
  return `$${dollars.toLocaleString("en-US", {
    minimumFractionDigits: opts?.showCents ? 2 : 0,
    maximumFractionDigits: opts?.showCents ? 2 : 0,
  })}`;
}

function fmtCentsShort(c: number): string {
  // Compact format for projections: $1.2M etc.
  const v = c / 100;
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `$${Math.round(v / 1_000).toLocaleString()}K`;
  return `$${Math.round(v).toLocaleString()}`;
}

export function CashFlowHubTab({ output, client }: Props) {
  const today = new Date();
  const generatedDate = today.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const grossAnnual = output.gross_income_annual_cents;
  const expensesAnnual = output.expenses_annual_cents;
  const netAnnual = netIncomeAnnualCents(output);
  const netMonthly = netIncomeMonthlyCents(output);
  const efTargetCents = emergencyFundTargetCents(output);
  const efFunded = emergencyFundFunded(output);
  const efPct = Math.min(
    Math.round(
      (output.emergency_fund.current_balance_cents / Math.max(efTargetCents, 1)) * 100,
    ),
    100,
  );
  const monthlySavingsCents = availableMonthlyAllocationCents(output);
  const annualSavingsCents = monthlySavingsCents * 12;
  const monthsToEf = efFunded
    ? 0
    : Math.ceil(
        (efTargetCents - output.emergency_fund.current_balance_cents) /
          Math.max(output.emergency_fund.monthly_contribution_cents, 1),
      );

  const sortedBuckets = output.buckets
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);

  // First time horizon used for the per-bucket projection row.
  const firstHorizon = output.time_horizons
    .slice()
    .sort((a, b) => a.year - b.year)[0];
  const horizonYears = firstHorizon
    ? Math.max(firstHorizon.year - today.getFullYear(), 0)
    : 10;
  const horizonLabel = firstHorizon ? firstHorizon.label : "10 years";

  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{
        borderColor: "var(--border)",
        background: "var(--surface)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      {/* ── Navy header band ──────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-6 py-5"
        style={{
          background: "var(--psa-navy)",
          color: "#ffffff",
        }}
      >
        <div>
          <div
            className="text-[10px] uppercase opacity-70"
            style={{ letterSpacing: "0.08em", fontFamily: "var(--font-mono)" }}
          >
            Financial Plan
          </div>
          <h2
            className="mt-1 text-3xl font-medium"
            style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.01em" }}
          >
            Cash Flow Plan
          </h2>
          <p className="mt-0.5 text-sm opacity-80">
            {client.household_name} · {generatedDate}
          </p>
        </div>
        <div className="text-right">
          <div className="text-sm" style={{ fontFamily: "var(--font-display)" }}>
            PSA Wealth
          </div>
          <div
            className="text-[10px] uppercase opacity-70"
            style={{ letterSpacing: "0.08em" }}
          >
            Advisor OS
          </div>
        </div>
      </div>

      {/* ── Navy metrics row ──────────────────────────────────────── */}
      <div
        className="grid grid-cols-2 gap-px md:grid-cols-5"
        style={{ background: "var(--psa-navy)", color: "#ffffff" }}
      >
        <NavyStat
          label="Gross"
          primary={fmtCentsShort(grossAnnual)}
          secondary={`${fmtCentsShort(Math.round(grossAnnual / 12))} / mo`}
        />
        <NavyStat
          label="Expenses"
          primary={fmtCentsShort(expensesAnnual)}
          secondary={`${fmtCentsShort(Math.round(expensesAnnual / 12))} / mo`}
        />
        <NavyStat
          label="Net Income"
          primary={fmtCentsShort(netAnnual)}
          secondary={`${fmtCentsShort(netMonthly)} / mo`}
          accent
        />
        <NavyStat
          label="Monthly Savings"
          primary={fmtCentsShort(monthlySavingsCents)}
          secondary={`${fmtCentsShort(annualSavingsCents)} / yr`}
        />
        <NavyStat
          label="EF Status"
          primary={efFunded ? "FUNDED" : `${efPct}%`}
          secondary={
            efFunded
              ? `${output.emergency_fund.target_months}-month target`
              : `${monthsToEf} mo to fund`
          }
        />
      </div>

      {/* ── Cream EF tracker band ─────────────────────────────────── */}
      <div
        className="px-6 py-4"
        style={{ background: "var(--bg)", borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span
                className="text-[10px] uppercase"
                style={{
                  color: "var(--text-3)",
                  letterSpacing: "0.06em",
                  fontFamily: "var(--font-mono)",
                }}
              >
                Emergency Fund
              </span>
              {efFunded ? (
                <span
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
                  style={{
                    background: TAX_TREATMENT_COLORS.tax_free.bg,
                    color: TAX_TREATMENT_COLORS.tax_free.fg,
                    letterSpacing: "0.06em",
                  }}
                >
                  Funded
                </span>
              ) : null}
            </div>
            <div className="mt-1 flex items-baseline gap-3">
              <span
                className="text-2xl font-medium"
                style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}
              >
                {fmtCents(output.emergency_fund.current_balance_cents)}
              </span>
              <span className="text-sm" style={{ color: "var(--text-3)" }}>
                of {fmtCents(efTargetCents)} target ·{" "}
                {output.emergency_fund.target_months} months expenses
              </span>
            </div>
          </div>
          <div className="w-64">
            <div
              className="h-2 w-full overflow-hidden rounded-full"
              style={{ background: "var(--surface-2)" }}
            >
              <div
                className="h-full transition-all"
                style={{
                  width: `${efPct}%`,
                  background: efFunded ? TAX_TREATMENT_COLORS.tax_free.fg : "var(--s-blue)",
                }}
              />
            </div>
            <p
              className="mt-1 text-right text-[11px]"
              style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)" }}
            >
              {efPct}%
            </p>
          </div>
        </div>
      </div>

      {/* ── White center: hub-and-spoke ───────────────────────────── */}
      <div className="px-6 py-8" style={{ background: "var(--surface)" }}>
        <div className="grid grid-cols-[140px_1fr_auto] items-stretch gap-6">
          {/* Left — Household */}
          <div className="flex flex-col items-center justify-center">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full"
              style={{ background: "var(--surface-2)", color: "var(--psa-navy)" }}
            >
              <Home className="h-7 w-7" />
            </div>
            <div
              className="mt-2 text-center text-[10px] uppercase"
              style={{
                color: "var(--text-3)",
                letterSpacing: "0.08em",
                fontFamily: "var(--font-mono)",
              }}
            >
              Household
            </div>
            <div
              className="mt-1 text-center text-[12px] font-medium"
              style={{ color: "var(--text)" }}
            >
              {client.household_name}
            </div>
          </div>

          {/* Center — flow + Financial Foundation pillar */}
          <div className="flex items-center justify-center">
            <FlowArrow amountCents={monthlySavingsCents} />
            <div
              className="flex flex-col items-center justify-center rounded-lg px-6 py-8"
              style={{
                background: "var(--psa-navy)",
                color: "#ffffff",
                minWidth: 200,
              }}
            >
              <div
                className="text-[10px] uppercase opacity-70"
                style={{ letterSpacing: "0.08em", fontFamily: "var(--font-mono)" }}
              >
                Financial Foundation
              </div>
              <div
                className="mt-2 text-3xl font-medium"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {fmtCentsShort(monthlySavingsCents)}
              </div>
              <div className="text-xs opacity-70">/ month</div>
              <div className="mt-3 text-[11px] opacity-80">
                {fmtCentsShort(annualSavingsCents)} / year
              </div>
            </div>
          </div>

          {/* Right — bucket stack */}
          <div className="flex flex-col gap-3" style={{ minWidth: 380 }}>
            {sortedBuckets.length === 0 ? (
              <div
                className="rounded-md border p-4 text-center text-[12px]"
                style={{ borderColor: "var(--border)", color: "var(--text-3)" }}
              >
                No buckets configured. Open the Input tab to add some.
              </div>
            ) : (
              sortedBuckets.map((bucket, i) => (
                <BucketHubCard
                  key={bucket.id}
                  bucket={bucket}
                  index={i + 1}
                  output={output}
                  horizonYears={horizonYears}
                  horizonLabel={horizonLabel}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Bottom cream band: summary metrics ───────────────────── */}
      <div
        className="grid grid-cols-2 gap-px md:grid-cols-4"
        style={{ background: "var(--bg)", borderTop: "1px solid var(--border)" }}
      >
        <SummaryStat
          label="Monthly Savings"
          value={fmtCentsShort(monthlySavingsCents)}
        />
        <SummaryStat
          label="Annual Savings"
          value={fmtCentsShort(annualSavingsCents)}
        />
        <SummaryStat
          label="Months to EF"
          value={efFunded ? "—" : `${monthsToEf}`}
          unit={efFunded ? "funded" : "months"}
        />
        <SummaryStat
          label="Net Income"
          value={fmtCentsShort(netAnnual)}
          unit="/ year"
        />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────

function NavyStat({
  label,
  primary,
  secondary,
  accent = false,
}: {
  label: string;
  primary: string;
  secondary?: string;
  accent?: boolean;
}) {
  return (
    <div
      className="px-5 py-4"
      style={{
        background: accent ? "rgba(255,255,255,0.08)" : "transparent",
      }}
    >
      <div
        className="text-[10px] uppercase opacity-70"
        style={{ letterSpacing: "0.08em", fontFamily: "var(--font-mono)" }}
      >
        {label}
      </div>
      <div
        className="mt-1.5 text-2xl font-medium"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {primary}
      </div>
      {secondary ? (
        <div className="text-[11px] opacity-70">{secondary}</div>
      ) : null}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="px-5 py-3">
      <div
        className="text-[10px] uppercase"
        style={{
          color: "var(--text-3)",
          letterSpacing: "0.08em",
          fontFamily: "var(--font-mono)",
        }}
      >
        {label}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span
          className="text-xl font-medium"
          style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}
        >
          {value}
        </span>
        {unit ? (
          <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
            {unit}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function FlowArrow({ amountCents }: { amountCents: number }) {
  return (
    <div className="flex items-center px-2">
      <svg width="100" height="40" viewBox="0 0 100 40" aria-hidden>
        <line
          x1="0"
          y1="20"
          x2="92"
          y2="20"
          stroke="var(--psa-navy)"
          strokeWidth="2"
          strokeDasharray="4 3"
        />
        <polygon points="92,14 100,20 92,26" fill="var(--psa-navy)" />
        <text
          x="50"
          y="14"
          textAnchor="middle"
          fontSize="10"
          fontFamily="var(--font-mono)"
          fill="var(--text-3)"
        >
          {amountCents > 0
            ? `$${Math.round(amountCents / 100).toLocaleString()}/mo`
            : ""}
        </text>
      </svg>
    </div>
  );
}

function BucketHubCard({
  bucket,
  index,
  output,
  horizonYears,
  horizonLabel,
}: {
  bucket: CashFlowBucket;
  index: number;
  output: CashFlowLensOutput;
  horizonYears: number;
  horizonLabel: string;
}) {
  const moContrib = bucket.monthly_contribution_target_cents;
  const yrContrib = moContrib * 12;
  const tone = TAX_TREATMENT_COLORS[bucket.tax_treatment];
  const projectedCents = projectBucketBalanceCents(
    bucket,
    horizonYears,
    growthRateForBucket(bucket, output.assumptions),
  );

  return (
    <div
      className="rounded-md border px-4 py-3"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-1 items-center gap-2.5">
          <span
            className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium"
            style={{
              background: "var(--psa-navy)",
              color: "#ffffff",
              fontFamily: "var(--font-mono)",
            }}
          >
            {index}
          </span>
          <div>
            <div
              className="text-[14px] font-medium"
              style={{ color: "var(--text)" }}
            >
              {bucket.name}
            </div>
            <div
              className="text-[11px]"
              style={{ color: "var(--text-3)" }}
            >
              Balance {fmtCentsShort(bucket.current_balance_cents)}
            </div>
          </div>
        </div>
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase"
          style={{
            background: tone.bg,
            color: tone.fg,
            letterSpacing: "0.06em",
          }}
        >
          {TAX_TREATMENT_LABELS[bucket.tax_treatment]}
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-2 text-[12px]">
        <span style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}>
          {fmtCentsShort(moContrib)} / mo
        </span>
        <span style={{ color: "var(--text-3)" }}>·</span>
        <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>
          {fmtCentsShort(yrContrib)} / yr
        </span>
      </div>
      <div
        className="mt-2 flex items-center justify-between rounded px-2 py-1.5 text-[11px]"
        style={{ background: "var(--surface-2)" }}
      >
        <span style={{ color: "var(--text-3)" }}>
          Projected at {horizonLabel}
        </span>
        <span
          style={{
            fontFamily: "var(--font-display)",
            color: "var(--text)",
            fontWeight: 500,
          }}
        >
          {fmtCentsShort(projectedCents)}
        </span>
      </div>
    </div>
  );
}
