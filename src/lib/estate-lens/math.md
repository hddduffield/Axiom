# Estate Lens Math — Derivation Reference

Status: **DRAFT — REVERSE-ENGINEERED FROM SCREENSHOTS**
Last updated: 2026-05-13
Build phase: Phase 14 v1

This document explains every formula used in the Estate Lens. The math
was reverse-engineered from the screenshots Hayden provided; the input
values + output values in those screenshots were the only source of
truth. **Every formula here should be verified by qualified tax counsel
before client delivery.** No formula has been independently validated
against a textbook or IRS publication.

The compliance disclaimer surfaced on every screen + PDF page reflects
this status:

> Calculations are planning estimates only. Verify all figures with
> qualified tax counsel before client decisions.

The "?" tooltip on each calculated output renders the relevant section
below in shorthand. The implementations live in
`src/lib/estate-lens/calc.ts`.

---

## Conventions

- **Money**: stored in cents (integers). Display layer divides by 100.
- **Rates / percentages**: stored as percentages (e.g., `7` for 7%);
  divided by 100 inside the formula. Some intermediate rates are
  decimal (`g = pct / 100`).
- **Time**: `year` is years from today (0 = today, 30 = 30 years out).
- **All formulas are deterministic.** No randomness, no LLM.

---

## Tab 1 — Estate Tax Projection

### In-Estate Value at year n

**Source**: Standard time-value-of-money compounding with annuity
withdrawal (savings principal that earns interest while annual
withdrawals reduce it).

```
E_n = E_0 · (1+g)^n − S · ((1+g)^n − 1) / g
```

Where:
- `E_0` = estate today (cents)
- `g` = growth rate (decimal, e.g., 0.07 for 7%)
- `S` = annual lifestyle spend (cents)
- `n` = years out

**Edge case**: when `g = 0`, formula degenerates to
`E_n = max(0, E_0 - S·n)`.

**Floor**: returned value is clamped to `max(0, ...)` so a depleted
estate doesn't go negative.

**Verification note**: this assumes spend is paid at the start of each
year, so withdrawals don't earn that year's growth. Confirm whether
PSA's convention is start-of-year or end-of-year (which would tilt
the formula slightly).

---

### Indexed Exemption at year n

**Source**: IRC §2010(c)(3) — federal estate/gift tax exemption is
adjusted annually for inflation. Treas. Reg. §20.2010-1.

```
X_n = X_0 · (1 + i)^n
```

Where:
- `X_0` = combined exemption today (cents). For married couples this is
  typically 2× the per-decedent exemption ($30M default ≈ 2x the
  estimated 2026 per-decedent of ~$15M).
- `i` = exemption inflation (decimal, default 0.03)

**Verification note**: actual indexing uses the CPI-U with a one-year
lag (the exemption is announced each year ~November for the following
tax year). The model uses a simple geometric compound at the
advisor-set inflation rate — a reasonable approximation when the
horizon is 5+ years out, less reasonable for very near-term horizons.

---

### Taxable Estate at year n

```
T_n = max(0, E_n − X_n)
```

When the in-estate value is below the indexed exemption, taxable estate
is zero (no estate tax). When above, the excess is subject to estate
tax.

**Verification note**: NY uses a "cliff" mechanism where exceeding 105%
of the exemption results in the ENTIRE estate being taxed (not just
the excess). v1 does not model NY's cliff — the state-tax model
flattens this to a single effective rate.

---

### Federal Estate Tax at year n

**Source**: IRC §2001(c) progressive bracket schedule. v1 simplifies
to flat top marginal rate (40% as of 2026).

```
F_n = T_n · estate_tax_rate
```

Where `estate_tax_rate` is decimal (default 0.40).

**Verification note**: real progressive brackets produce slightly less
total tax due to the lower-bracket portions. For PSA's HNW client
base where most of the taxable estate is at the top bracket,
overshoot is minor (~$300K on a $50M taxable estate). Accept the
overestimate as conservative.

---

### State Estate Tax at year n

```
ST_n = T_n · state_rate
```

Uses the same taxable base as federal. The state_rate is auto-populated
from `STATE_ESTATE_TAX_RATES` lookup when the advisor selects a state;
manually editable for cases where the state has its own (typically
smaller) exemption that the advisor wants to model.

**Verification note**: most state estate taxes have their own exemption
threshold (Massachusetts $2M, Oregon $1M, etc.). v1 doesn't subtract
this separately — instead the advisor should enter a lower
EFFECTIVE rate that already accounts for the state exemption against
the in-estate value. This is documented in the inline help text.

---

### Cumulative Spend

```
C_n = annual_spend · n
```

Trivial — used only as a display aid (advisor can see the total
lifestyle outlay assumed in the model).

---

### Out-of-Estate FV at year n

Assets already in irrevocable trusts (ILITs, GRATs, SLATs, etc.) that
grow outside the estate.

```
OE_n = FMV_out_today · (1 + g)^n
```

Uses the same `g` as the in-estate (assumption: trust holds the same
asset mix as the in-estate portfolio).

**Verification note**: if the client's trust assets are in a different
mix (e.g., concentrated low-basis stock vs the in-estate
diversified portfolio), the assumption breaks. v1.5 candidate: a
separate `out_of_estate_growth_rate_pct` input.

---

### Cap Gains Tax on Out-of-Estate Liquidation

**Source**: IRC §1015 (carryover basis for gifted property), §1014
(NO step-up at death for assets outside the estate — this is the
critical asymmetry that makes trust planning a tradeoff: you save
estate tax but lose step-up).

```
OE_FV = FMV_out · (1+g)^n
gain  = (OE_FV · pct_liq) − (basis · pct_liq)
tax   = gain · (federal_LTCG + NIIT + state_LTCG)
```

Where:
- `pct_liq` = `pct_liquidated_at_death / 100`
- `NIIT` = Net Investment Income Tax (default 3.8%, IRC §1411)

**Edge case**: gain is clamped to `max(0, ...)` to handle the case
where basis exceeds value (e.g., partial depreciation).

---

### Net to Family

```
Net = E_n − F_n − ST_n + OE_FV − CGT_out
```

The bottom-line wealth that passes to family after all taxes and
including trust assets net of cap-gains drag.

---

### Total Life Insurance Need

The headline number in the navy/gold card on Tab 1.

```
TaxBill = F_n + ST_n + CGT_out
```

This is the cash the family needs at death to settle the IRS + state
+ cap gains on trust liquidations. The Tab 3 strategies are
different ways to fund this number.

---

## Tab 2 — Trust Planning Calculator

### Discounted FMV

**Source**: valuation discount under Rev. Rul. 93-12 (FLP / FLLC
minority + marketability discount), confirmed by Holman v.
Commissioner and Estate of Bongard.

```
D = FMV · (1 − valuation_discount)
```

This is:
- (Gift) the value removed from the estate using exemption
- (Note Sale) the principal of the promissory note + the value
  conveyed to the trust

**Verification note**: valuation discounts of 25-40% are typical for
FLPs/FLLCs but require qualified appraisals and survive IRS scrutiny
case-by-case. Sec. 2704 anti-abuse rules limit discounts on family-
controlled entities.

---

### Trust Cost Basis

Both move types yield carryover basis:
- **Note Sale**: Rev. Rul. 85-13 — sale to a grantor trust is income-
  tax-disregarded (the grantor is treated as still owning the
  property), so no realized gain on transfer → carryover basis.
- **Gift**: IRC §1015(a) — donee's basis = donor's basis.

```
Trust_Basis = original_cost_basis
```

---

### Trust Future Value at year n

```
TFV = D · (1 + trust_growth)^n
```

The trust compounds at its own growth rate (typically the same as
the estate, but separately configurable to model different asset
mixes within the trust).

---

### Note Face Value (Note Sale only)

```
NF = FMV · (1 − valuation_discount)
```

The promissory note's face value stays in the estate (frozen),
accruing AFR interest annually. The note's value is the same number
as the Discounted FMV, but conceptually represents a different
quantity (an estate-included receivable rather than an out-of-estate
asset).

**Verification note**: AFR interest income to the grantor's estate is
NOT modeled in v1 — Tab 2's simplified math treats the spread between
trust growth and AFR as captured by the trust's independent
compounding. The full SCIN / IDGT cash-flow dynamics (note payments,
interest income, deferred-payment structures) are deferred to v1.5.

---

### Cap Gain on Liquidation (Trust)

```
gain = (TFV · pct_liq) − (basis · pct_liq)
```

Trust gets carryover basis (no step-up), so the gain at liquidation
includes all appreciation since the trust was funded — the cost of
removing assets from the estate.

---

### Cap Gains Tax (Trust)

```
tax = gain · (federal_LTCG + NIIT + state_LTCG)
```

---

### Net Trust to Heirs

```
Net_Trust = TFV − cap_gains_tax
```

---

### In-Estate Value WITH Planning Move

For Tab 2's "with planning" trajectory, the in-estate value is reduced
by the discounted FMV at t=0 and projected forward from there.

```
E_0_planned = E_0 − D                  (for both Gift and Note Sale)
E_n_planned = (E_0_planned)(1+g)^n − S·((1+g)^n − 1)/g
```

For **Note Sale specifically**, the note face value comes back into
the estate as a frozen receivable. v1 approximates by adding it back
at the horizon year (no growth):

```
E_n_planned_note_sale = E_n_planned_base + NF
```

**Verification note**: this is a SIMPLIFICATION. In reality, the note
pays AFR interest annually back to the seller's estate, which gets
spent or reinvested. The full dynamics are time-consuming to model;
v1 captures the "frozen note returns to estate" first-order effect
without modeling the interest cash flow.

---

### Taxable Estate WITH Planning Move

For **Gift**: lifetime exemption is used up by D.
```
X_n_planned = max(0, X_n − D)
T_n_planned = max(0, E_n_planned − X_n_planned)
```

For **Note Sale**: no exemption used.
```
T_n_planned = max(0, E_n_planned − X_n)
```

---

### Aggregate Family Outcome — With Plan

Re-run the entire Tab 1 model with `E_n_planned`, `X_n_planned`,
plus the trust's separate appreciation + cap gains:

```
Net_planned = E_n_planned
              − F_n_planned
              − ST_n_planned
              + OE_FV
              − CGT_out
              + TFV
              − CGT_trust
```

---

### Family Savings

```
savings = Net_with_plan − Net_no_plan
```

The headline number in the gold "FAMILY SAVES" card.

---

## Tab 3 — Tax Payment Strategy

### Total Premium Paid (LI Plan)

```
T = annual_premium · years_of_premium
```

Total dollars the client pays for life insurance.

---

### LI Cost per $1 of Tax (Leverage Ratio)

```
C = total_premium / death_benefit
```

This is the inverse of the policy's mortality leverage. C = 0.20
means $0.20 of premium buys $1.00 of death benefit; if death occurs
within actuarial expectations, the family received a 5× return.

---

### $ to Fund Tax Bill via LI

```
fund_via_li = C · tax_bill = (total_premium / death_benefit) · tax_bill
```

How much premium the client must pay TODAY to pre-fund the future
tax bill at the leverage ratio of the proposed policy.

---

### Pay-Option Cost Percentages

#### Cash on Hand
```
cost_pct = 100%
cost     = tax_bill
```
Dollar-for-dollar — no leverage, no drag.

#### Life Insurance (Out of Estate)
```
cost_pct = (total_premium / death_benefit) · 100%
cost     = total_premium     (when DB ≥ tax_bill — typical case)
```
Pre-funded via leverage. Death benefit passes income- and estate-
tax-free under IRC §101.

#### Liquidate Trust Assets
```
combined_LTCG = federal_LTCG + NIIT + state_LTCG
cost_pct     = 1 / (1 − combined_LTCG) · 100%
cost         = tax_bill / (1 − combined_LTCG)
```

To NET the tax bill after cap gains, you must SELL more than the
tax bill (you "gross up" the sale to cover the gains tax that the
sale itself triggers).

For example: combined LTCG of 23.8% (20% federal + 3.8% NIIT) →
cost_pct = 131.2%. Must sell $1.312 of trust to get $1.00 of after-
tax proceeds.

---

### Self-Insure Future Value at year n

Invest the same premium dollars at the estate growth rate instead of
buying LI.

```
P = annual_premium
g = self_insure_growth_pct / 100
Y = years_of_premium

# FV of ordinary annuity over years 1..min(Y, n)
yearsPaid = min(Y, n)
fv_at_end_of_payments = P · ((1+g)^yearsPaid − 1) / g

# If death occurs after premium payments stop, principal continues
# to compound until year n
if n > Y:
  self_insure_fv = fv_at_end_of_payments · (1+g)^(n − Y)
else:
  self_insure_fv = fv_at_end_of_payments
```

---

### Self-Insure Net After Estate Tax

Self-insure principal is estate-included; LI DB is not.

```
self_insure_net = self_insure_fv · (1 − estate_tax_rate)
```

---

### LI Advantage to Heirs

```
li_advantage = death_benefit − self_insure_net
```

The Tab 3 "Why not just invest the premium?" panel shows this delta
visualized as the gold-shaded area in the mortality leverage chart.
Positive values mean LI wins (typical for normal/short lifespans);
negative means self-insure wins (very late death past the breakeven).

---

## Things NOT modeled in v1

These would change the math materially in some edge cases. Document as
v1.5 candidates:

1. **NY cliff exemption** (entire estate taxed if > 105% of exemption)
2. **Connecticut $15M tax cap**
3. **MA / CT / NY-specific bracket schedules** (v1 flat top rate)
4. **Federal progressive bracket schedule** (IRC §2001(c))
5. **AFR interest income on Note Sale** (paid back to seller's estate)
6. **SCIN-specific risk premium**
7. **GST tax allocations** (IRC §2641 et seq.)
8. **State inheritance taxes** (NE, NJ, PA, KY, MD): flagged in lookup
   but not computed
9. **DSUE / portability** between spouses (IRC §2010(c)(4))
10. **Generation-skipping considerations on trust assets**
11. **Income tax on grantor trust during grantor's life** (not estate
    tax, but a related planning consideration)
12. **Spousal Lifetime Access Trust (SLAT) reciprocal issue**
13. **Section 7520 valuation tables for GRAT / CLT / QPRT** (the AFR
    input here is a simplification)

---

## Sources / further reading

- **IRC §2001** — Estate tax imposition and rate schedule
- **IRC §2010** — Unified credit, exemption, indexing
- **IRC §2031, 2032** — Valuation
- **IRC §1014** — Stepped-up basis at death (does NOT apply to out-of-
  estate property)
- **IRC §1015** — Carryover basis for gifts
- **IRC §1411** — Net Investment Income Tax (NIIT, 3.8%)
- **IRC §101** — Life insurance proceeds income-tax exclusion
- **Rev. Rul. 85-13** — Grantor trust transactions are income-tax-
  disregarded
- **Rev. Rul. 93-12** — Valuation discounts on intra-family transfers
- **Treas. Reg. §20.2031-1** — FMV definition
- **Treas. Reg. §20.2010-1** — Exemption rules
- **§7520** — Applicable Federal Rates (AFR) tables (IRS publishes
  monthly)
- **Holman v. Commissioner** — FLP / FLLC discount jurisprudence
- **AICPA State Estate, Inheritance, and Gift Tax Chart** (2026)
- **Hodgson Russ State Estate Tax Tracker** (annual update)
