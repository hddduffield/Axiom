// Phase 14.1 — Estate Lens deterministic math.
//
// EVERY formula in this module is also documented in math.md (alongside
// the source citation where applicable, e.g., IRC §2001(c), Treas. Reg.
// §20.2031-1, etc.). The UI surfaces these formulas as tooltips on each
// calculated output so advisors can verify before client delivery.
//
// All math in cents (integer arithmetic). Percentages converted to
// decimals (e.g., growth_rate_pct=7 → r=0.07) at the call site.

import type {
  AssetsOutOfEstate,
  EstateAssumptions,
  EstateLensOutput,
  LifeInsurancePlan,
  PlanningMove,
} from "./types";

// ────────────────────────────────────────────────────────────────────────
// Tab 1 — Estate Tax Projection
// ────────────────────────────────────────────────────────────────────────

/**
 * In-estate value at year n.
 *
 * The estate compounds at growth_rate; annual_spend is paid each year
 * from the principal (reducing it before the next year's growth).
 *
 * Closed form (geometric series):
 *   E_n = E_0 · (1+g)^n − S · ((1+g)^n − 1) / g
 *
 * Where:
 *   E_0 = estate_today
 *   g   = growth_rate (decimal)
 *   S   = annual_spend
 *   n   = years
 */
export function inEstateValueCents(assumptions: EstateAssumptions, year: number): number {
  const E0 = assumptions.estate_today_cents;
  const g = assumptions.growth_rate_pct / 100;
  const S = assumptions.annual_spend_cents;
  const n = year;
  if (g === 0) {
    return Math.max(0, E0 - S * n);
  }
  const growth = Math.pow(1 + g, n);
  const fv = E0 * growth - S * (growth - 1) / g;
  return Math.round(Math.max(0, fv));
}

/**
 * Indexed exemption at year n.
 *   X_n = X_0 · (1 + i)^n
 * Where i = exemption inflation rate.
 */
export function indexedExemptionCents(assumptions: EstateAssumptions, year: number): number {
  const X0 = assumptions.combined_exemption_cents;
  const i = assumptions.exemption_inflation_pct / 100;
  return Math.round(X0 * Math.pow(1 + i, year));
}

/**
 * Taxable estate at year n.
 *   T_n = max(0, E_n - X_n)
 */
export function taxableEstateCents(assumptions: EstateAssumptions, year: number): number {
  const E = inEstateValueCents(assumptions, year);
  const X = indexedExemptionCents(assumptions, year);
  return Math.max(0, E - X);
}

/**
 * Federal estate tax at year n.
 *   F_n = T_n · estate_tax_rate
 *
 * NOTE: v1 applies the top marginal rate to the entire taxable estate.
 * A real progressive bracket model (IRC §2001(c)) would compute slightly
 * less. Acceptable simplification because PSA's HNW clients sit at or
 * above the top bracket threshold.
 */
export function federalEstateTaxCents(assumptions: EstateAssumptions, year: number): number {
  const T = taxableEstateCents(assumptions, year);
  return Math.round(T * (assumptions.estate_tax_rate_pct / 100));
}

/**
 * State estate tax at year n.
 *   ST_n = T_n · state_rate
 *
 * Simplified: same taxable base as federal. Real state systems often
 * have their own (typically lower) exemption — the state_estate_tax_pct
 * input lets the advisor type in an effective rate that accounts for
 * the state exemption already. State exemption is NOT separately
 * subtracted in the math; advisor should reduce the rate to match.
 */
export function stateEstateTaxCents(assumptions: EstateAssumptions, year: number): number {
  const T = taxableEstateCents(assumptions, year);
  return Math.round(T * (assumptions.state_estate_tax_pct / 100));
}

/**
 * Cumulative spend at year n.
 *   C_n = annual_spend · n
 */
export function cumulativeSpendCents(assumptions: EstateAssumptions, year: number): number {
  return assumptions.annual_spend_cents * year;
}

/**
 * Future value of out-of-estate trust assets at year n.
 *   OE_n = FMV_out · (1 + g)^n
 * Uses the estate growth rate (trust holds same asset mix).
 */
export function outOfEstateFvCents(
  assumptions: EstateAssumptions,
  assetsOut: AssetsOutOfEstate,
  year: number,
): number {
  const g = assumptions.growth_rate_pct / 100;
  return Math.round(assetsOut.fmv_out_today_cents * Math.pow(1 + g, year));
}

/**
 * Cap gains tax on liquidation of out-of-estate assets at death.
 *
 *   OE_FV = fmv_out · (1+g)^n
 *   gain = (OE_FV · pct_liq) − (cost_basis · pct_liq)
 *   tax  = gain · (federal_ltcg + niit + state_ltcg)
 *
 * Carryover basis: trust does NOT get a step-up at death.
 */
export function capGainsTaxOutOfEstateCents(
  assumptions: EstateAssumptions,
  assetsOut: AssetsOutOfEstate,
  year: number,
): number {
  const fv = outOfEstateFvCents(assumptions, assetsOut, year);
  const pctLiq = assetsOut.pct_liquidated_at_death / 100;
  const realizedValue = fv * pctLiq;
  const basisLiquidated = assetsOut.cost_basis_cents * pctLiq;
  const gain = Math.max(0, realizedValue - basisLiquidated);
  const taxRate =
    (assetsOut.federal_ltcg_pct + assetsOut.niit_pct + assetsOut.state_ltcg_pct) / 100;
  return Math.round(gain * taxRate);
}

/**
 * Net to family at year n (Tab 1 baseline — no new planning move).
 *
 *   Net = E_n − F_n − ST_n + OE_FV − CGT_out
 */
export function netToFamilyCents(
  assumptions: EstateAssumptions,
  assetsOut: AssetsOutOfEstate,
  year: number,
): number {
  const E = inEstateValueCents(assumptions, year);
  const F = federalEstateTaxCents(assumptions, year);
  const ST = stateEstateTaxCents(assumptions, year);
  const OE = outOfEstateFvCents(assumptions, assetsOut, year);
  const CGT = capGainsTaxOutOfEstateCents(assumptions, assetsOut, year);
  return E - F - ST + OE - CGT;
}

/**
 * Total tax bill at death (Tab 1 baseline).
 *   TaxBill = F + ST + CGT
 */
export function totalTaxBillCents(
  assumptions: EstateAssumptions,
  assetsOut: AssetsOutOfEstate,
  year: number,
): number {
  return (
    federalEstateTaxCents(assumptions, year) +
    stateEstateTaxCents(assumptions, year) +
    capGainsTaxOutOfEstateCents(assumptions, assetsOut, year)
  );
}

// Year-by-year trajectory for the Tab 1 chart.
export interface TrajectoryYear {
  year: number;
  in_estate_cents: number;
  out_of_estate_cents: number;
  indexed_exemption_cents: number;
  taxable_estate_cents: number;
}

export function buildTrajectory(
  assumptions: EstateAssumptions,
  assetsOut: AssetsOutOfEstate,
): TrajectoryYear[] {
  const out: TrajectoryYear[] = [];
  for (let y = 0; y <= assumptions.years_out; y++) {
    out.push({
      year: y,
      in_estate_cents: inEstateValueCents(assumptions, y),
      out_of_estate_cents: outOfEstateFvCents(assumptions, assetsOut, y),
      indexed_exemption_cents: indexedExemptionCents(assumptions, y),
      taxable_estate_cents: taxableEstateCents(assumptions, y),
    });
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────
// Tab 2 — Trust Planning Calculator
// ────────────────────────────────────────────────────────────────────────

/**
 * Discounted FMV (after valuation discount).
 *   D = FMV · (1 − discount)
 *
 * Used as: the value removed from the estate (Gift) or the principal of
 * the promissory note (Note Sale).
 */
export function discountedFmvCents(move: PlanningMove): number {
  return Math.round(move.fmv_transferred_cents * (1 - move.valuation_discount_pct / 100));
}

/**
 * Trust cost basis for the new planning move.
 * Note Sale: carryover basis (sale to a grantor trust is income-tax-
 *            disregarded under Rev. Rul. 85-13).
 * Gift:      carryover basis (IRC §1015).
 *
 * Both move types yield the same: original cost basis transfers to trust.
 */
export function trustCostBasisCents(move: PlanningMove): number {
  return move.original_cost_basis_cents;
}

/**
 * Future value of new trust assets at year n.
 *   TFV = FMV · (1 − discount) · (1 + trust_growth)^n
 *
 * Note: the discount applies because the transfer is at discounted FMV;
 * the asset's "real" basis-like value compounds from that starting point.
 */
export function trustFvCents(move: PlanningMove, year: number): number {
  const D = discountedFmvCents(move);
  const g = move.trust_growth_pct / 100;
  return Math.round(D * Math.pow(1 + g, year));
}

/**
 * Note face value (Note Sale only). The note's face stays in the estate
 * (frozen at the discounted FMV), accruing AFR interest annually.
 *   NF = FMV · (1 − discount)
 *
 * (Same numerical value as discountedFmvCents but conceptually a different
 * quantity: this represents the note receivable on the seller's balance
 * sheet, which is included in the estate at death.)
 */
export function noteFaceValueCents(move: PlanningMove): number {
  if (move.type !== "note_sale") return 0;
  return discountedFmvCents(move);
}

/**
 * Cap gain on liquidation at death.
 *   gain = (TFV · pct_liq) − (basis · pct_liq)
 */
export function trustCapGainCents(move: PlanningMove, year: number): number {
  const TFV = trustFvCents(move, year);
  const basis = trustCostBasisCents(move);
  const pctLiq = move.pct_liquidated_at_death / 100;
  return Math.max(0, Math.round(TFV * pctLiq - basis * pctLiq));
}

/**
 * Cap gains tax on trust liquidation.
 *   tax = gain · (federal_ltcg + niit + state_ltcg)
 */
export function trustCapGainsTaxCents(move: PlanningMove, year: number): number {
  const gain = trustCapGainCents(move, year);
  const taxRate = (move.federal_ltcg_pct + move.niit_pct + move.state_ltcg_pct) / 100;
  return Math.round(gain * taxRate);
}

/**
 * Net trust to heirs after cap gains.
 *   Net = TFV − tax
 */
export function netTrustToHeirsCents(move: PlanningMove, year: number): number {
  return trustFvCents(move, year) - trustCapGainsTaxCents(move, year);
}

// ────────────────────────────────────────────────────────────────────────
// Tab 2 — "With planning" recalc of the in-estate value.
//
// When the advisor adds a planning move, the in-estate dynamics change:
//
// Gift to trust:
//   The transferor's exemption is used. The estate is REDUCED today by
//   the discounted FMV. Subsequent growth + spend dynamics proceed from
//   the reduced principal.
//   E_0_planned = E_0 − D
//
// Note Sale:
//   The estate is reduced by the discounted FMV (the asset leaves)
//   BUT the note face value (= D) stays as an estate asset, accruing
//   AFR interest. Net: principal value unchanged at t=0 (asset swap),
//   so estate trajectory matches baseline EXCEPT:
//     - Interest income flow: AFR · D paid back into the estate each
//       year (but this is income to the seller, so it's already
//       included in the lifestyle dynamics — we treat the note's
//       income as offsetting the difference between trust growth and
//       AFR. Net effect on the estate's nominal trajectory: the note
//       face stays frozen, while the rest of the estate continues
//       compounding.
//
// Simplified Tab 2 model: treat both moves the same — reduce the
// in-estate starting value by D. The Note Sale's frozen-note + AFR
// dynamics are approximated by the deterministic-growth path; the
// SPREAD between trust_growth (which is bigger than AFR) and AFR is
// what creates the savings, and that spread is captured by the trust's
// independent compounding.
// ────────────────────────────────────────────────────────────────────────

export function inEstateValueWithMoveCents(
  assumptions: EstateAssumptions,
  move: PlanningMove,
  year: number,
): number {
  const D = discountedFmvCents(move);
  const reducedAssumptions: EstateAssumptions = {
    ...assumptions,
    estate_today_cents: Math.max(0, assumptions.estate_today_cents - D),
  };
  // For Note Sale, the note face value comes back into the estate as a
  // frozen receivable. Add it back as a final-year line item (no growth).
  const baseFv = inEstateValueCents(reducedAssumptions, year);
  if (move.type === "note_sale") {
    return baseFv + noteFaceValueCents(move);
  }
  return baseFv;
}

export function taxableEstateWithMoveCents(
  assumptions: EstateAssumptions,
  move: PlanningMove,
  year: number,
): number {
  const E = inEstateValueWithMoveCents(assumptions, move, year);
  // Exemption: Gift uses some of the exemption (D). The exemption
  // remaining for death is X_n − D.
  // Note Sale: exemption is not used.
  let X = indexedExemptionCents(assumptions, year);
  if (move.type === "gift") {
    const D = discountedFmvCents(move);
    X = Math.max(0, X - D);
  }
  return Math.max(0, E - X);
}

export function federalEstateTaxWithMoveCents(
  assumptions: EstateAssumptions,
  move: PlanningMove,
  year: number,
): number {
  const T = taxableEstateWithMoveCents(assumptions, move, year);
  return Math.round(T * (assumptions.estate_tax_rate_pct / 100));
}

export function stateEstateTaxWithMoveCents(
  assumptions: EstateAssumptions,
  move: PlanningMove,
  year: number,
): number {
  const T = taxableEstateWithMoveCents(assumptions, move, year);
  return Math.round(T * (assumptions.state_estate_tax_pct / 100));
}

export interface AggregateFamilyOutcome {
  federal_estate_tax_cents: number;
  cap_gains_tax_combined_cents: number;
  state_estate_tax_cents: number;
  total_tax_cents: number;
  net_to_family_cents: number;
  total_li_need_cents: number;
}

export function aggregateNoPlanning(
  assumptions: EstateAssumptions,
  assetsOut: AssetsOutOfEstate,
): AggregateFamilyOutcome {
  const year = assumptions.years_out;
  const fed = federalEstateTaxCents(assumptions, year);
  const st = stateEstateTaxCents(assumptions, year);
  const cgt = capGainsTaxOutOfEstateCents(assumptions, assetsOut, year);
  const inE = inEstateValueCents(assumptions, year);
  const outE = outOfEstateFvCents(assumptions, assetsOut, year);
  const net = inE - fed - st + outE - cgt;
  return {
    federal_estate_tax_cents: fed,
    state_estate_tax_cents: st,
    cap_gains_tax_combined_cents: cgt,
    total_tax_cents: fed + st + cgt,
    net_to_family_cents: net,
    total_li_need_cents: fed + st + cgt,
  };
}

export function aggregateWithPlanning(
  assumptions: EstateAssumptions,
  assetsOut: AssetsOutOfEstate,
  move: PlanningMove,
): AggregateFamilyOutcome {
  const year = assumptions.years_out;
  const fed = federalEstateTaxWithMoveCents(assumptions, move, year);
  const st = stateEstateTaxWithMoveCents(assumptions, move, year);
  const cgtOut = capGainsTaxOutOfEstateCents(assumptions, assetsOut, year);
  const cgtTrust = trustCapGainsTaxCents(move, year);
  const cgtCombined = cgtOut + cgtTrust;
  const inE = inEstateValueWithMoveCents(assumptions, move, year);
  const outE = outOfEstateFvCents(assumptions, assetsOut, year);
  const trustFv = trustFvCents(move, year);
  const net = inE - fed - st + outE - cgtOut + trustFv - cgtTrust;
  return {
    federal_estate_tax_cents: fed,
    state_estate_tax_cents: st,
    cap_gains_tax_combined_cents: cgtCombined,
    total_tax_cents: fed + st + cgtCombined,
    net_to_family_cents: net,
    total_li_need_cents: fed + st + cgtCombined,
  };
}

export function familySavingsCents(
  noPlan: AggregateFamilyOutcome,
  withPlan: AggregateFamilyOutcome,
): number {
  return withPlan.net_to_family_cents - noPlan.net_to_family_cents;
}

// ────────────────────────────────────────────────────────────────────────
// Tab 2 — Counterfactual: what if you switched move type?
// ────────────────────────────────────────────────────────────────────────

export function alternateMove(move: PlanningMove): PlanningMove {
  return { ...move, type: move.type === "note_sale" ? "gift" : "note_sale" };
}

// ────────────────────────────────────────────────────────────────────────
// Tab 3 — Tax Payment Strategy
// ────────────────────────────────────────────────────────────────────────

/** Total premium paid = annual × years. */
export function totalPremiumPaidCents(li: LifeInsurancePlan): number {
  return li.annual_premium_cents * li.years_of_premium;
}

/**
 * Life insurance leverage: LI cost per $1 of tax = total_premium / death_benefit.
 * If DB ≥ tax_bill, the LI premium is the cost of pre-funding the tax.
 */
export function liCostPerDollarOfTax(li: LifeInsurancePlan): number {
  if (li.death_benefit_cents === 0) return 0;
  return totalPremiumPaidCents(li) / li.death_benefit_cents;
}

/**
 * $ to fund the active tax bill at this leverage ratio.
 *   = (total_premium / death_benefit) · tax_bill
 */
export function dollarsToFundTaxBillViaLiCents(
  li: LifeInsurancePlan,
  taxBillCents: number,
): number {
  return Math.round(liCostPerDollarOfTax(li) * taxBillCents);
}

/**
 * Cost percentage for each payment option, normalized as %-of-tax-bill.
 *
 * Cash on hand: 100% (dollar-for-dollar; pay from estate or trust).
 * Life insurance: (premiums paid) / tax_bill · 100.
 *   The premium total covers the tax bill via leverage.
 * Liquidate trust assets: 100% + cap-gains-drag — to net $X after cap
 *   gains, you must liquidate $X / (1 − cap_gains_rate).
 */
export function payOptionCashOnHandPct(): number {
  return 100;
}

export function payOptionLifeInsurancePct(
  li: LifeInsurancePlan,
  taxBillCents: number,
): number {
  if (taxBillCents === 0) return 0;
  const fund = dollarsToFundTaxBillViaLiCents(li, taxBillCents);
  return (fund / taxBillCents) * 100;
}

export function payOptionLiquidateTrustPct(
  capGainsRatePct: number, // combined LTCG + NIIT + state
): number {
  const r = capGainsRatePct / 100;
  if (r >= 1) return 100; // sanity guard
  return (1 / (1 - r)) * 100;
}

export function payOptionLiquidateTrustCostCents(
  taxBillCents: number,
  capGainsRatePct: number,
): number {
  const r = capGainsRatePct / 100;
  if (r >= 1) return taxBillCents;
  return Math.round(taxBillCents / (1 - r));
}

/**
 * Self-insure value at year n: invest the premium each year at growth rate.
 * Ordinary annuity FV:
 *   FV = P · ((1+g)^n − 1) / g
 * (with P paid for `years_of_premium`, then no further contributions but
 * principal continues to compound until year n)
 */
export function selfInsureValueCents(
  li: LifeInsurancePlan,
  yearAtDeath: number,
): number {
  const g = li.self_insure_growth_pct / 100;
  const P = li.annual_premium_cents;
  const Y = li.years_of_premium;
  if (g === 0) return P * Math.min(Y, yearAtDeath);

  // FV of annuity (premiums paid years 1..min(Y, yearAtDeath))
  const yearsPaid = Math.min(Y, yearAtDeath);
  const fvAtEndOfPayments = (P * (Math.pow(1 + g, yearsPaid) - 1)) / g;

  // Then compound the principal forward to yearAtDeath if death is later
  if (yearAtDeath > Y) {
    return Math.round(fvAtEndOfPayments * Math.pow(1 + g, yearAtDeath - Y));
  }
  return Math.round(fvAtEndOfPayments);
}

/**
 * Self-insure NET to heirs after estate tax @ estate_tax_rate. Death
 * benefit (LI held out of estate) is paid in full to heirs; self-insure
 * principal is subject to estate tax.
 */
export function selfInsureNetAfterEstateTaxCents(
  li: LifeInsurancePlan,
  estateTaxRatePct: number,
  yearAtDeath: number,
): number {
  const gross = selfInsureValueCents(li, yearAtDeath);
  return Math.round(gross * (1 - estateTaxRatePct / 100));
}

/** LI advantage to heirs at year n = DB − self-insure-net. */
export function liAdvantageCents(
  li: LifeInsurancePlan,
  estateTaxRatePct: number,
  yearAtDeath: number,
): number {
  return li.death_benefit_cents - selfInsureNetAfterEstateTaxCents(li, estateTaxRatePct, yearAtDeath);
}

// Build the mortality-leverage chart data over years 1..max_year.
export interface MortalityLeverageYear {
  year: number;
  death_benefit_cents: number;
  self_insure_after_tax_cents: number;
  li_advantage_cents: number;
}

export function buildMortalityLeverage(
  li: LifeInsurancePlan,
  estateTaxRatePct: number,
  maxYear: number,
): MortalityLeverageYear[] {
  const out: MortalityLeverageYear[] = [];
  for (let y = 1; y <= maxYear; y++) {
    const si = selfInsureNetAfterEstateTaxCents(li, estateTaxRatePct, y);
    out.push({
      year: y,
      death_benefit_cents: li.death_benefit_cents,
      self_insure_after_tax_cents: si,
      li_advantage_cents: li.death_benefit_cents - si,
    });
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────
// Convenience — pull the relevant tax-bill from Tab 1 or Tab 2 for Tab 3.
// ────────────────────────────────────────────────────────────────────────

export function effectiveTaxBillCents(output: EstateLensOutput): number {
  // Default behavior: use Tab 2 "with planning" figure when planning move
  // has any FMV; else Tab 1 baseline.
  if (output.planning_move.fmv_transferred_cents > 0) {
    const agg = aggregateWithPlanning(output.assumptions, output.assets_out, output.planning_move);
    return agg.total_tax_cents;
  }
  return totalTaxBillCents(output.assumptions, output.assets_out, output.assumptions.years_out);
}

export function baselineTaxBillCents(output: EstateLensOutput): number {
  return totalTaxBillCents(output.assumptions, output.assets_out, output.assumptions.years_out);
}

// ────────────────────────────────────────────────────────────────────────
// Display helpers — cents → USD formatted string.
// ────────────────────────────────────────────────────────────────────────

const COMPACT_FMT = new Intl.NumberFormat("en-US", {
  notation: "compact",
  compactDisplay: "short",
  maximumFractionDigits: 1,
});

const FULL_FMT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatUsd(cents: number): string {
  return FULL_FMT.format(Math.round(cents / 100));
}

export function formatUsdCompact(cents: number): string {
  return "$" + COMPACT_FMT.format(cents / 100);
}

export function formatPct(pct: number, decimals = 1): string {
  return `${pct.toFixed(decimals)}%`;
}
