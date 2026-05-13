// Phase 16.1 — ClientProfile → lens-output extractors.
//
// Pure functions that map Stage 1's ClientProfile to a Partial<LensOutput>
// shape per lens type. The lens create endpoint merges this Partial onto
// the lens's `defaultXxxOutput()` seed so missing fields keep their
// defaults.
//
// Output bookkeeping:
//   - sourced_fields: dotted paths of fields we filled from the profile
//   - edited_fields: set to [] at create time; the UI appends when the
//     advisor mutates a sourced field
//
// NumericValueSchema gotchas:
//   - .value can be null (FR knew the field exists but couldn't read it)
//   - .value can be a [low, high] tuple (range) — we take the midpoint
//   - .unit is "USD" | "percent" | "count" | "years"
//   - .is_annual flag: only meaningful for USD; default depends on the
//     section convention (income.* is annual, cash_flow.monthly_* is monthly)

import type {
  ClientProfile,
  NumericValueClient,
} from "@/lib/orchestrator/schemas/clientProfile";
import {
  BUCKET_PRESETS,
  cryptoId,
  defaultCashFlowOutput,
  type CashFlowBucket,
  type CashFlowLensOutput,
  type TaxTreatment,
} from "@/lib/api/cash_flow_lens";
import {
  defaultEstateOutput,
  type EstateLensOutput,
} from "@/lib/estate-lens/types";
import { lookupStateEstateTax } from "@/lib/estate-lens/state-tax-table";

// ────────────────────────────────────────────────────────────────────────
// Number coercion helpers
// ────────────────────────────────────────────────────────────────────────

/** NumericValueClient → scalar number, or null if not extractable. */
function numericToScalar(nv: NumericValueClient | null | undefined): number | null {
  if (!nv) return null;
  if (nv.value === null || nv.value === undefined) return null;
  if (Array.isArray(nv.value)) {
    // tuple range — return midpoint
    return (nv.value[0] + nv.value[1]) / 2;
  }
  return nv.value;
}

/** USD-typed NumericValue → dollars (number) or null. */
function usdDollars(nv: NumericValueClient | null | undefined): number | null {
  if (!nv) return null;
  if (nv.unit !== "USD") return null;
  return numericToScalar(nv);
}

/** dollars → cents (integers) */
function dollarsToCents(d: number): number {
  return Math.round(d * 100);
}

/** Sum a list of NumericValue assets in USD; null entries contribute 0 dollars. */
function sumAssetValuesDollars(
  assets: { estimated_value: NumericValueClient | null }[],
): number {
  return assets.reduce((sum, a) => sum + (usdDollars(a.estimated_value) ?? 0), 0);
}

// ────────────────────────────────────────────────────────────────────────
// Cash Flow Lens extractor
// ────────────────────────────────────────────────────────────────────────

export interface CashFlowExtractResult {
  output: CashFlowLensOutput;
  sourced_fields: string[];
}

const RETIREMENT_BUCKET_GUESSES: Array<{
  match: RegExp;
  preset_id: string;
  tax_treatment: TaxTreatment;
  name: string;
}> = [
  { match: /401\s*k|four[\s-]?o[\s-]?one[\s-]?k/i, preset_id: "401k", tax_treatment: "tax_deferred", name: "401(k)" },
  { match: /roth\s*ira/i, preset_id: "roth_ira", tax_treatment: "tax_free", name: "Roth IRA" },
  { match: /traditional\s*ira|\bira\b/i, preset_id: "401k", tax_treatment: "tax_deferred", name: "Traditional IRA" },
  { match: /sep\s*ira/i, preset_id: "401k", tax_treatment: "tax_deferred", name: "SEP IRA" },
  { match: /403\s*b/i, preset_id: "401k", tax_treatment: "tax_deferred", name: "403(b)" },
  { match: /annuity/i, preset_id: "annuity", tax_treatment: "tax_deferred", name: "Annuity" },
];

const CASH_FLOW_PRESET_BY_ID = Object.fromEntries(
  BUCKET_PRESETS.map((p) => [p.id, p]),
);

function classifyRetirementBucket(description: string, category: string) {
  const hay = `${description} ${category}`;
  for (const guess of RETIREMENT_BUCKET_GUESSES) {
    if (guess.match.test(hay)) return guess;
  }
  // Fallback: assume tax-deferred (most common for unnamed retirement
  // account in a fact review).
  return { preset_id: "401k", tax_treatment: "tax_deferred" as TaxTreatment, name: "Retirement Account" };
}

/**
 * Build a CashFlowLensOutput by overlaying ClientProfile-sourced values
 * on top of the default seed. Returns the merged output + list of dotted
 * paths that came from the profile (for the sourced_fields bookkeeping).
 */
export function extractCashFlowFromClientProfile(args: {
  profile: ClientProfile;
  household_name: string;
  archetype: string | null;
}): CashFlowExtractResult {
  const { profile, household_name, archetype } = args;
  const sourced: string[] = [];

  // Start from the default seed so unsourced fields keep their defaults.
  const age = profile.client_and_family.primary_owner.age;
  const base = defaultCashFlowOutput({
    household_name,
    archetype,
    age,
  });

  // ── Income ──
  // ClientProfile.income.agi is USD; treat as annual (Stage 1 convention).
  const agiDollars = usdDollars(profile.income.agi);
  if (agiDollars !== null) {
    base.gross_income_annual_cents = dollarsToCents(agiDollars);
    sourced.push("gross_income_annual_cents");
  }

  // ── Expenses (monthly_outflows × 12) ──
  const monthlyOutflowsDollars = usdDollars(profile.cash_flow.monthly_outflows);
  if (monthlyOutflowsDollars !== null) {
    base.expenses_annual_cents = dollarsToCents(monthlyOutflowsDollars * 12);
    sourced.push("expenses_annual_cents");
  }

  // ── Goals (narrative) ──
  const goals = profile.goals_and_values.financial_goals?.trim();
  if (goals) {
    base.goals_narrative = goals;
    sourced.push("goals_narrative");
  }

  // ── Client snapshot age — defaultCashFlowOutput already used `age` ──
  if (age !== null) sourced.push("client_snapshot.age");

  // ── Buckets ──
  // Replace the default 5 preset buckets with one bucket per retirement
  // account + liquid-asset brokerage + whole-life with cash value.
  const buckets: CashFlowBucket[] = [];

  // 1. Retirement accounts: classify each
  for (const acct of profile.personal_balance_sheet.retirement_accounts) {
    const balanceDollars = usdDollars(acct.estimated_value);
    if (balanceDollars === null) continue;
    const cls = classifyRetirementBucket(acct.description, acct.category);
    const preset = CASH_FLOW_PRESET_BY_ID[cls.preset_id];
    buckets.push({
      id: cryptoId(),
      name: cls.name,
      preset_id: cls.preset_id,
      tax_treatment: cls.tax_treatment,
      current_balance_cents: dollarsToCents(balanceDollars),
      monthly_contribution_target_cents: 0,
      description:
        acct.notes ??
        preset?.description ??
        "Retirement account sourced from Fact Review.",
      sort_order: buckets.length,
    });
  }

  // 2. Brokerage / taxable liquid assets
  for (const asset of profile.personal_balance_sheet.liquid_assets) {
    const lowerCat = `${asset.category} ${asset.description}`.toLowerCase();
    const isBrokerage =
      lowerCat.includes("broker") ||
      lowerCat.includes("taxable") ||
      lowerCat.includes("investment account");
    if (!isBrokerage) continue;
    const balanceDollars = usdDollars(asset.estimated_value);
    if (balanceDollars === null) continue;
    buckets.push({
      id: cryptoId(),
      name: asset.description || "Brokerage",
      preset_id: "brokerage",
      tax_treatment: "taxable",
      current_balance_cents: dollarsToCents(balanceDollars),
      monthly_contribution_target_cents: 0,
      description:
        asset.notes ??
        CASH_FLOW_PRESET_BY_ID["brokerage"]?.description ??
        "Brokerage account sourced from Fact Review.",
      sort_order: buckets.length,
    });
  }

  // 3. Whole-life policies with cash value
  for (const policy of profile.insurance.life_insurance_policies) {
    const cashDollars = usdDollars(policy.cash_value);
    if (cashDollars === null || cashDollars === 0) continue;
    buckets.push({
      id: cryptoId(),
      name: `${policy.carrier ?? "Whole Life"} (${policy.policy_type})`,
      preset_id: "whole_life",
      tax_treatment: "tax_free",
      current_balance_cents: dollarsToCents(cashDollars),
      monthly_contribution_target_cents: 0,
      description:
        policy.notes ??
        CASH_FLOW_PRESET_BY_ID["whole_life"]?.description ??
        "Whole life cash value sourced from Fact Review.",
      sort_order: buckets.length,
    });
  }

  if (buckets.length > 0) {
    base.buckets = buckets;
    buckets.forEach((_, i) => {
      sourced.push(`buckets[${i}].current_balance_cents`);
      sourced.push(`buckets[${i}].name`);
      sourced.push(`buckets[${i}].tax_treatment`);
    });
  }

  // ── Emergency fund balance (savings / emergency in liquid_assets) ──
  let efDollars = 0;
  let efFound = false;
  for (const asset of profile.personal_balance_sheet.liquid_assets) {
    const lowerCat = `${asset.category} ${asset.description}`.toLowerCase();
    if (
      lowerCat.includes("emergency") ||
      lowerCat.includes("savings") ||
      lowerCat.includes("checking") ||
      lowerCat.includes("money market")
    ) {
      const dollars = usdDollars(asset.estimated_value);
      if (dollars !== null) {
        efDollars += dollars;
        efFound = true;
      }
    }
  }
  if (efFound) {
    base.emergency_fund.current_balance_cents = dollarsToCents(efDollars);
    sourced.push("emergency_fund.current_balance_cents");
  }

  // ── Effective tax rate (rough — use marginal as a proxy for "now") ──
  const marginal = numericToScalar(profile.tax_status.federal_marginal_rate);
  if (marginal !== null) {
    // marginal is a percent (e.g., 32 → 32%). Convert to decimal.
    const dec = marginal > 1 ? marginal / 100 : marginal;
    base.assumptions.effective_tax_rate_now = Math.min(Math.max(dec, 0), 1);
    sourced.push("assumptions.effective_tax_rate_now");
  }

  return { output: base, sourced_fields: sourced };
}

// ────────────────────────────────────────────────────────────────────────
// Estate Lens extractor
// ────────────────────────────────────────────────────────────────────────

export interface EstateExtractResult {
  output: EstateLensOutput;
  sourced_fields: string[];
}

/**
 * Federal estate/gift tax exemption for the active year. Snapshotted
 * here for the same reason `volatileRates.ts` exists: the value changes
 * annually and a hardcoded source-of-truth keeps the lens deterministic.
 *
 * 2026 per-decedent basic exclusion (post-OBBBA): ~$15M. Married couples
 * with portability use 2× → $30M combined.
 */
const FEDERAL_COMBINED_EXEMPTION_DOLLARS = 30_000_000;

/**
 * Build an EstateLensOutput by overlaying ClientProfile-sourced values
 * on top of the default seed.
 */
export function extractEstateFromClientProfile(args: {
  profile: ClientProfile;
  household_name: string;
  archetype: string | null;
  scenario_name?: string;
}): EstateExtractResult {
  const { profile, household_name, archetype, scenario_name } = args;
  const sourced: string[] = [];

  // ── State of residence (drives state estate tax) ──
  const stateCode = profile.client_and_family.primary_owner.state_of_residence;
  // Normalize: profile may have full name like "Georgia" instead of "GA".
  const normalizedState = stateCode ? normalizeStateCode(stateCode) : null;

  const base = defaultEstateOutput({
    household_name,
    archetype,
    state_code: normalizedState,
    scenario_name,
  });

  if (normalizedState) {
    sourced.push("client_snapshot.state_code");
    const lookup = lookupStateEstateTax(normalizedState);
    base.assumptions.state_estate_tax_pct = lookup.rate_pct;
    sourced.push("assumptions.state_estate_tax_pct");
  }

  // ── estate_today = net worth ──
  const netWorthDollars = usdDollars(profile.personal_balance_sheet.net_worth);
  if (netWorthDollars !== null && netWorthDollars > 0) {
    base.assumptions.estate_today_cents = dollarsToCents(netWorthDollars);
    sourced.push("assumptions.estate_today_cents");
  }

  // ── annual_spend = monthly_outflows × 12 ──
  const monthlyOutflowsDollars = usdDollars(profile.cash_flow.monthly_outflows);
  if (monthlyOutflowsDollars !== null && monthlyOutflowsDollars > 0) {
    base.assumptions.annual_spend_cents = dollarsToCents(monthlyOutflowsDollars * 12);
    sourced.push("assumptions.annual_spend_cents");
  }

  // ── client_age_today ──
  const age = profile.client_and_family.primary_owner.age;
  if (age !== null && age > 0) {
    base.assumptions.client_age_today = age;
    sourced.push("assumptions.client_age_today");
    // Set years_out to a sensible horizon (life expectancy ~age 85,
    // capped at 50yr default).
    const horizon = Math.max(15, Math.min(50, 85 - age));
    base.assumptions.years_out = horizon;
    sourced.push("assumptions.years_out");
  }

  // ── Combined exemption (federal snapshot) ──
  // Always set — the default is also $30M, but stamp as sourced so the
  // refresh-from-plan flow knows this was set by extraction (vs hand-
  // edited).
  base.assumptions.combined_exemption_cents = dollarsToCents(
    FEDERAL_COMBINED_EXEMPTION_DOLLARS,
  );
  sourced.push("assumptions.combined_exemption_cents");

  // ── Federal LTCG (use 20% top bracket as default; derive from
  //    marginal income rate as a weak proxy if marginal is in long-term
  //    capital gains bracket territory) ──
  const marginal = numericToScalar(profile.tax_status.federal_marginal_rate);
  if (marginal !== null) {
    const margPct = marginal > 1 ? marginal : marginal * 100;
    // If marginal income rate is >= 32%, taxpayer is likely in the 20%
    // LTCG bracket. Below that, 15%. Below 12% income, 0% LTCG.
    let ltcg = 20;
    if (margPct < 12) ltcg = 0;
    else if (margPct < 32) ltcg = 15;
    base.assets_out.federal_ltcg_pct = ltcg;
    base.planning_move.federal_ltcg_pct = ltcg;
    sourced.push("assets_out.federal_ltcg_pct");
    sourced.push("planning_move.federal_ltcg_pct");
  }

  // ── Assets already out of estate: sum funded irrevocable trust assets ──
  // The trust record has `funded: boolean | null` but no balance — the
  // best signal is to count funded ILITs / IDGTs / SLATs as a flag and
  // leave fmv_out_today_cents at 0 (advisor enters the appraised value).
  // We surface a banner note in the UI if any funded trust is present
  // without a manual fmv_out entry.
  // For v1: keep fmv_out_today_cents at 0 and don't claim sourced_fields
  // here. The "Some fields unpopulated" banner will surface this.

  return { output: base, sourced_fields: sourced };
}

// ────────────────────────────────────────────────────────────────────────
// State code normalization — Stage 1 sometimes emits full name
// ("Georgia") or two-letter ("GA"). Lens lookups need two-letter.
// ────────────────────────────────────────────────────────────────────────

const STATE_NAME_TO_CODE: Record<string, string> = {
  ALABAMA: "AL", ALASKA: "AK", ARIZONA: "AZ", ARKANSAS: "AR", CALIFORNIA: "CA",
  COLORADO: "CO", CONNECTICUT: "CT", DELAWARE: "DE", "DISTRICT OF COLUMBIA": "DC",
  FLORIDA: "FL", GEORGIA: "GA", HAWAII: "HI", IDAHO: "ID", ILLINOIS: "IL",
  INDIANA: "IN", IOWA: "IA", KANSAS: "KS", KENTUCKY: "KY", LOUISIANA: "LA",
  MAINE: "ME", MARYLAND: "MD", MASSACHUSETTS: "MA", MICHIGAN: "MI",
  MINNESOTA: "MN", MISSISSIPPI: "MS", MISSOURI: "MO", MONTANA: "MT",
  NEBRASKA: "NE", NEVADA: "NV", "NEW HAMPSHIRE": "NH", "NEW JERSEY": "NJ",
  "NEW MEXICO": "NM", "NEW YORK": "NY", "NORTH CAROLINA": "NC",
  "NORTH DAKOTA": "ND", OHIO: "OH", OKLAHOMA: "OK", OREGON: "OR",
  PENNSYLVANIA: "PA", "RHODE ISLAND": "RI", "SOUTH CAROLINA": "SC",
  "SOUTH DAKOTA": "SD", TENNESSEE: "TN", TEXAS: "TX", UTAH: "UT",
  VERMONT: "VT", VIRGINIA: "VA", WASHINGTON: "WA", "WEST VIRGINIA": "WV",
  WISCONSIN: "WI", WYOMING: "WY",
};

function normalizeStateCode(raw: string): string | null {
  const trimmed = raw.trim().toUpperCase();
  if (trimmed.length === 2 && /^[A-Z]{2}$/.test(trimmed)) return trimmed;
  if (trimmed in STATE_NAME_TO_CODE) return STATE_NAME_TO_CODE[trimmed];
  return null;
}

// ────────────────────────────────────────────────────────────────────────
// Used? — silence unused-export linter for sumAssetValuesDollars (kept
// for future v1.5 use when summing across asset categories).
// ────────────────────────────────────────────────────────────────────────
void sumAssetValuesDollars;
