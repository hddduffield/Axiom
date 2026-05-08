// Phase 13 — Cash Flow Lens canonical types + presets + pure calculation
// helpers. The JSONB stored at lens_runs.output (when lens_type='cash_flow')
// matches CashFlowLensOutput exactly.
//
// All money values are stored in CENTS (integers) to avoid float drift on
// hydration/persistence round-trips. Conversion to dollars happens at the
// presentation layer.
//
// All percentages are stored as basis-100 integers (e.g., 65 = 65%) to
// match advisor mental model and avoid 0.65 vs 65 ambiguity in the UI.
//
// Growth rates and inflation are stored as decimal floats (0.07 = 7%)
// because they multiply.

import type { ActionItem } from "./types";

// ────────────────────────────────────────────────────────────────────────
// Bucket presets — the 5 starter buckets advisors get out of the box.
// Custom buckets reference preset_id = null and the advisor picks
// tax_treatment manually.
// ────────────────────────────────────────────────────────────────────────

export type TaxTreatment = "tax_free" | "tax_deferred" | "taxable" | "mixed";

export interface BucketPreset {
  id: string;
  name: string;
  tax_treatment: TaxTreatment;
  description: string;
  default_growth_rate: number; // decimal e.g. 0.06
}

export const BUCKET_PRESETS: BucketPreset[] = [
  {
    id: "401k",
    name: "401(k)",
    tax_treatment: "tax_deferred",
    description:
      "Employer-sponsored retirement plan. Pre-tax contributions reduce current taxable income; withdrawals taxed as ordinary income in retirement.",
    default_growth_rate: 0.06,
  },
  {
    id: "roth_ira",
    name: "Roth IRA",
    tax_treatment: "tax_free",
    description:
      "Individual retirement account funded with after-tax dollars. Qualified withdrawals (including growth) are tax-free.",
    default_growth_rate: 0.065,
  },
  {
    id: "brokerage",
    name: "Brokerage",
    tax_treatment: "taxable",
    description:
      "Taxable investment account. Dividends/interest taxed annually; gains taxed at capital-gains rate when realized. Maximum control, no contribution limits.",
    default_growth_rate: 0.07,
  },
  {
    id: "whole_life",
    name: "Whole Life Insurance",
    tax_treatment: "tax_free",
    description:
      "Permanent life insurance with cash value that grows tax-deferred. Loans/withdrawals up to basis are tax-free; death benefit passes income-tax-free.",
    default_growth_rate: 0.045,
  },
  {
    id: "annuity",
    name: "Annuity",
    tax_treatment: "tax_deferred",
    description:
      "Tax-deferred insurance contract designed for retirement income. Growth not taxed until withdrawn; withdrawals taxed as ordinary income.",
    default_growth_rate: 0.05,
  },
];

export const BUCKET_PRESETS_BY_ID = Object.fromEntries(
  BUCKET_PRESETS.map((p) => [p.id, p]),
) as Record<string, BucketPreset>;

// ────────────────────────────────────────────────────────────────────────
// Stored shape (lens_runs.output JSONB)
// ────────────────────────────────────────────────────────────────────────

export interface CashFlowBucket {
  id: string;
  name: string;
  preset_id: string | null;
  tax_treatment: TaxTreatment;
  current_balance_cents: number;
  monthly_contribution_target_cents: number;
  description: string;
  sort_order: number;
}

export interface TimeHorizon {
  id: string;
  type: "year" | "event";
  year: number; // absolute year e.g. 2046
  label: string; // "10 years" or "At Retirement (2046)"
}

export interface CashFlowAssumptions {
  growth_rate_taxable: number;
  growth_rate_tax_deferred: number;
  growth_rate_tax_free: number;
  growth_rate_emergency: number;
  inflation_rate: number;
  effective_tax_rate_now: number; // 0..1 — current marginal/effective combined
  effective_tax_rate_retirement: number;
  capital_gains_rate: number;
  retirement_age: number;
  retirement_income_target_annual_cents: number;
}

export interface CashFlowEmergencyFund {
  target_months: number;
  current_balance_cents: number;
  monthly_contribution_cents: number;
}

export interface CashFlowDistributionPlan {
  slider_state: {
    tax_free_pct: number;
    tax_deferred_pct: number;
    taxable_pct: number;
  };
}

export interface CashFlowAllocationSuggestionItem {
  bucket_id: string;
  recommended_pct: number; // 0..100
  reasoning: string;
}

export interface CashFlowAllocationSuggestion {
  generated_at: string;
  cost_cents: number;
  buckets: CashFlowAllocationSuggestionItem[];
}

export interface CashFlowDistributionRecommendation {
  id: string; // uuid for tracking pushes
  year: number;
  timeframe_label: string; // "Year 1" | "Years 1-5" etc
  action: string;
  estimated_tax_impact_cents: number; // negative = savings
  reason: string;
  from_bucket_id: string | null;
  to_bucket_id: string | null;
}

export interface CashFlowDistributionRecommendations {
  generated_at: string;
  cost_cents: number;
  slider_state: CashFlowDistributionPlan["slider_state"];
  recommendations: CashFlowDistributionRecommendation[];
}

export interface CashFlowAiSuggestions {
  allocation: CashFlowAllocationSuggestion | null;
  distribution_recommendations: CashFlowDistributionRecommendations | null;
}

export interface CashFlowClientSnapshot {
  household_name: string;
  archetype: string | null;
  age: number | null;
}

export interface CashFlowLensOutput {
  schema_version: 1;
  client_snapshot: CashFlowClientSnapshot;
  gross_income_annual_cents: number;
  expenses_annual_cents: number;
  goals_narrative: string;
  emergency_fund: CashFlowEmergencyFund;
  time_horizons: TimeHorizon[];
  assumptions: CashFlowAssumptions;
  buckets: CashFlowBucket[];
  allocation_pct: Record<string, number>;
  distribution_plan: CashFlowDistributionPlan;
  ai_suggestions: CashFlowAiSuggestions;
  pushed_action_item_ids: string[];
}

// ────────────────────────────────────────────────────────────────────────
// Default seed — used when the lens is first created and the advisor
// hasn't typed anything yet.
// ────────────────────────────────────────────────────────────────────────

const DEFAULT_GOALS_NARRATIVE =
  "Accumulate as much money as possible while reducing tax bill in retirement and maintaining maximum control.";

export function defaultCashFlowOutput(args: {
  household_name: string;
  archetype: string | null;
  age: number | null;
}): CashFlowLensOutput {
  const today = new Date();
  const currentYear = today.getFullYear();
  // Default to 65 if age unknown.
  const retirementAge = 65;
  const retirementYear =
    args.age !== null ? currentYear + (retirementAge - args.age) : currentYear + 25;

  return {
    schema_version: 1,
    client_snapshot: {
      household_name: args.household_name,
      archetype: args.archetype,
      age: args.age,
    },
    gross_income_annual_cents: 0,
    expenses_annual_cents: 0,
    goals_narrative: DEFAULT_GOALS_NARRATIVE,
    emergency_fund: {
      target_months: 6,
      current_balance_cents: 0,
      monthly_contribution_cents: 0,
    },
    time_horizons: [
      {
        id: cryptoId(),
        type: "year",
        year: currentYear + 5,
        label: "5 years",
      },
      {
        id: cryptoId(),
        type: "year",
        year: currentYear + 10,
        label: "10 years",
      },
      {
        id: cryptoId(),
        type: "event",
        year: retirementYear,
        label: `At Retirement (${retirementYear})`,
      },
    ],
    assumptions: {
      growth_rate_taxable: 0.07,
      growth_rate_tax_deferred: 0.06,
      growth_rate_tax_free: 0.065,
      growth_rate_emergency: 0.04,
      inflation_rate: 0.025,
      effective_tax_rate_now: 0.32,
      effective_tax_rate_retirement: 0.24,
      capital_gains_rate: 0.15,
      retirement_age: retirementAge,
      retirement_income_target_annual_cents: 0,
    },
    buckets: BUCKET_PRESETS.map((preset, index) => ({
      id: cryptoId(),
      name: preset.name,
      preset_id: preset.id,
      tax_treatment: preset.tax_treatment,
      current_balance_cents: 0,
      monthly_contribution_target_cents: 0,
      description: preset.description,
      sort_order: index,
    })),
    allocation_pct: {},
    distribution_plan: {
      slider_state: {
        tax_free_pct: 33,
        tax_deferred_pct: 34,
        taxable_pct: 33,
      },
    },
    ai_suggestions: {
      allocation: null,
      distribution_recommendations: null,
    },
    pushed_action_item_ids: [],
  };
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

export function cryptoId(): string {
  // crypto.randomUUID is available in modern Node + browsers.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback shouldn't fire on supported platforms but keeps SSR safe.
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Net income (cents)
export function netIncomeAnnualCents(out: CashFlowLensOutput): number {
  return out.gross_income_annual_cents - out.expenses_annual_cents;
}

export function netIncomeMonthlyCents(out: CashFlowLensOutput): number {
  return Math.round(netIncomeAnnualCents(out) / 12);
}

// Emergency fund target dollars (based on monthly expenses)
export function emergencyFundTargetCents(out: CashFlowLensOutput): number {
  const monthlyExpensesCents = Math.round(out.expenses_annual_cents / 12);
  return monthlyExpensesCents * out.emergency_fund.target_months;
}

export function emergencyFundFunded(out: CashFlowLensOutput): boolean {
  return out.emergency_fund.current_balance_cents >= emergencyFundTargetCents(out);
}

// Available to allocate after EF contribution
export function availableMonthlyAllocationCents(out: CashFlowLensOutput): number {
  const monthlyNet = netIncomeMonthlyCents(out);
  const efContrib = emergencyFundFunded(out)
    ? 0
    : out.emergency_fund.monthly_contribution_cents;
  return Math.max(monthlyNet - efContrib, 0);
}

// Future value of a present sum + monthly contributions, compounded annually,
// over `years`. Months within a year are bucketed annually using a simple
// (PMT * 12) approximation so this stays fast in the UI.
//   FV = PV * (1+r)^n  +  AnnualContrib * ((1+r)^n - 1) / r
export function projectBucketBalanceCents(
  bucket: CashFlowBucket,
  years: number,
  growthRate: number,
): number {
  const r = growthRate;
  const n = years;
  const PV = bucket.current_balance_cents;
  const annualContribCents = bucket.monthly_contribution_target_cents * 12;
  if (r === 0) return PV + annualContribCents * n;
  const pvGrown = PV * Math.pow(1 + r, n);
  const annuityFactor = (Math.pow(1 + r, n) - 1) / r;
  return Math.round(pvGrown + annualContribCents * annuityFactor);
}

export function growthRateForBucket(
  bucket: CashFlowBucket,
  assumptions: CashFlowAssumptions,
): number {
  switch (bucket.tax_treatment) {
    case "tax_free":
      return assumptions.growth_rate_tax_free;
    case "tax_deferred":
      return assumptions.growth_rate_tax_deferred;
    case "taxable":
      return assumptions.growth_rate_taxable;
    case "mixed":
      return (
        (assumptions.growth_rate_tax_free +
          assumptions.growth_rate_tax_deferred +
          assumptions.growth_rate_taxable) /
        3
      );
  }
}

// Sum balances by tax treatment — used by Tax Triangle to position the
// "Current" dot.
export interface TaxTreatmentMix {
  tax_free_pct: number;
  tax_deferred_pct: number;
  taxable_pct: number;
}

export function currentTaxMix(out: CashFlowLensOutput): TaxTreatmentMix {
  let tf = 0;
  let td = 0;
  let tx = 0;
  for (const b of out.buckets) {
    const v = b.current_balance_cents;
    if (b.tax_treatment === "tax_free") tf += v;
    else if (b.tax_treatment === "tax_deferred") td += v;
    else if (b.tax_treatment === "taxable") tx += v;
    else {
      // mixed → split evenly
      tf += v / 3;
      td += v / 3;
      tx += v / 3;
    }
  }
  const total = tf + td + tx;
  if (total === 0) {
    return { tax_free_pct: 33, tax_deferred_pct: 34, taxable_pct: 33 };
  }
  return {
    tax_free_pct: Math.round((tf / total) * 100),
    tax_deferred_pct: Math.round((td / total) * 100),
    taxable_pct: Math.round((tx / total) * 100),
  };
}

// Project the same mix at retirement age — using each treatment's growth
// rate applied to the aggregated balance + ongoing contributions.
export function projectedTaxMixAtRetirement(out: CashFlowLensOutput): TaxTreatmentMix {
  const yearsToRet = Math.max(out.assumptions.retirement_age - (out.client_snapshot.age ?? 40), 1);
  let tf = 0;
  let td = 0;
  let tx = 0;
  for (const b of out.buckets) {
    const r = growthRateForBucket(b, out.assumptions);
    const fv = projectBucketBalanceCents(b, yearsToRet, r);
    if (b.tax_treatment === "tax_free") tf += fv;
    else if (b.tax_treatment === "tax_deferred") td += fv;
    else if (b.tax_treatment === "taxable") tx += fv;
    else {
      tf += fv / 3;
      td += fv / 3;
      tx += fv / 3;
    }
  }
  const total = tf + td + tx;
  if (total === 0) {
    return { tax_free_pct: 33, tax_deferred_pct: 34, taxable_pct: 33 };
  }
  return {
    tax_free_pct: Math.round((tf / total) * 100),
    tax_deferred_pct: Math.round((td / total) * 100),
    taxable_pct: Math.round((tx / total) * 100),
  };
}

// Simple federal+state retirement tax-bill model. NOT a real bracket
// engine — applies the effective_tax_rate_retirement to tax-deferred
// withdrawals and capital_gains_rate to taxable; tax-free is $0.
//
// Returns ANNUAL tax bill for the given mix at the given target income.
export function annualRetirementTaxBillCents(args: {
  target_income_cents: number;
  mix: TaxTreatmentMix;
  assumptions: CashFlowAssumptions;
}): number {
  const { target_income_cents, mix, assumptions } = args;
  const fromTaxFree = (target_income_cents * mix.tax_free_pct) / 100;
  const fromTaxDeferred = (target_income_cents * mix.tax_deferred_pct) / 100;
  const fromTaxable = (target_income_cents * mix.taxable_pct) / 100;
  // Tax-deferred: ordinary income rate.
  const taxDeferredTax = fromTaxDeferred * assumptions.effective_tax_rate_retirement;
  // Taxable brokerage: assume gains portion at capital gains. Simplification:
  // half the withdrawal is taxable gain on average (cost basis half).
  const taxableTax = fromTaxable * 0.5 * assumptions.capital_gains_rate;
  // Tax-free: zero.
  void fromTaxFree;
  return Math.round(taxDeferredTax + taxableTax);
}

// Year-by-year retirement bar chart data — drawing target_income from the
// recommended mix for `years` years. Each entry is {year, components, taxBill}.
export interface YearlyDistributionEntry {
  year: number;
  tax_free_cents: number;
  tax_deferred_cents: number;
  taxable_cents: number;
  tax_bill_cents: number;
}

export function buildYearlyDistribution(args: {
  start_year: number;
  years: number;
  target_income_cents: number;
  mix: TaxTreatmentMix;
  assumptions: CashFlowAssumptions;
}): YearlyDistributionEntry[] {
  const out: YearlyDistributionEntry[] = [];
  for (let i = 0; i < args.years; i++) {
    const inflated =
      args.target_income_cents *
      Math.pow(1 + args.assumptions.inflation_rate, i);
    const tf = (inflated * args.mix.tax_free_pct) / 100;
    const td = (inflated * args.mix.tax_deferred_pct) / 100;
    const tx = (inflated * args.mix.taxable_pct) / 100;
    out.push({
      year: args.start_year + i,
      tax_free_cents: Math.round(tf),
      tax_deferred_cents: Math.round(td),
      taxable_cents: Math.round(tx),
      tax_bill_cents: annualRetirementTaxBillCents({
        target_income_cents: Math.round(inflated),
        mix: args.mix,
        assumptions: args.assumptions,
      }),
    });
  }
  return out;
}

// Cumulative tax savings = (current-mix tax) - (recommended-mix tax) over `years`.
export function cumulativeTaxSavingsCents(args: {
  years: number;
  target_income_cents: number;
  current_mix: TaxTreatmentMix;
  recommended_mix: TaxTreatmentMix;
  assumptions: CashFlowAssumptions;
}): number {
  const today = new Date().getFullYear();
  const cur = buildYearlyDistribution({
    start_year: today,
    years: args.years,
    target_income_cents: args.target_income_cents,
    mix: args.current_mix,
    assumptions: args.assumptions,
  });
  const rec = buildYearlyDistribution({
    start_year: today,
    years: args.years,
    target_income_cents: args.target_income_cents,
    mix: args.recommended_mix,
    assumptions: args.assumptions,
  });
  let total = 0;
  for (let i = 0; i < args.years; i++) {
    total += cur[i].tax_bill_cents - rec[i].tax_bill_cents;
  }
  return total;
}

// ────────────────────────────────────────────────────────────────────────
// Type guards / safety helpers
// ────────────────────────────────────────────────────────────────────────

export function isCashFlowLensOutput(value: unknown): value is CashFlowLensOutput {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<CashFlowLensOutput>;
  return v.schema_version === 1 && Array.isArray(v.buckets) && Array.isArray(v.time_horizons);
}

// Action-item sourced from a cash-flow recommendation.
export interface PushedActionItem extends ActionItem {
  source_lens_run_id: string;
}
