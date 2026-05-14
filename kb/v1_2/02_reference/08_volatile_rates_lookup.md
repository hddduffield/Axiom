# VOLATILE RATES LOOKUP

**THIS FILE MUST BE REFRESHED MONTHLY BEFORE PLAN GENERATION.**

The §7520 rate and AFRs are published by the IRS each month and are used to compute GRAT, IDGT, intra-family loan, CRT, CLT, QPRT, SCIN, and private annuity values. Generating planning output with stale rates produces incorrect numbers.

**Source:** IRS publishes monthly Revenue Rulings (Rev. Rul. 20XX-NN) approximately the 18th of the prior month.

**Refresh procedure:**
1. On the 19th of each month (or first business day after), pull the new month's rates from IRS Rev. Rul. for the upcoming month
2. Update the table below
3. Update "Current Month" pointer
4. Commit with date stamp

---

## CURRENT MONTH

**Active month:** May 2026
**§7520 rate:** **5.00%**
**Last refreshed:** April 16, 2026

---

## §7520 RATE HISTORY (recent)

| Month | §7520 Rate |
|---|---|
| **May 2026** | **5.00%** |
| April 2026 | 4.60% |
| March 2026 | 4.80% |
| February 2026 | 4.60% |
| January 2026 | 4.60% |
| December 2025 | 4.60% |
| November 2025 | 4.80% |
| October 2025 | 4.60% |
| September 2025 | 4.80% |
| August 2025 | 5.00% |
| July 2025 | 5.00% |
| June 2025 | 5.00% |
| May 2025 | 5.00% |
| April 2025 | 5.00% |
| March 2025 | 5.40% |
| February 2025 | 5.40% |
| January 2025 | 5.20% |

---

## AFR HISTORY (recent — May 2026 example)

For each month, the IRS publishes:
- **Short-term AFR** — debt instruments ≤ 3 years
- **Mid-term AFR** — debt instruments > 3 years and ≤ 9 years
- **Long-term AFR** — debt instruments > 9 years
- **§7520 rate** — 120% of mid-term AFR, rounded to nearest 0.2%

Each comes in annual / semi-annual / quarterly / monthly compounding flavors. **Annual compounding is what is typically used for IDGT installment notes** (matched to annual interest payments).

| Month | Short Annual | Mid Annual | Long Annual | §7520 |
|---|---|---|---|---|
| May 2026 | [VERIFY — pull from Rev. Rul. 2026-N] | [VERIFY] | [VERIFY] | 5.00% |
| April 2026 | [VERIFY] | [VERIFY] | [VERIFY] | 4.60% |
| March 2026 | [VERIFY] | [VERIFY] | [VERIFY] | 4.80% |

**Current source:** Each month's Revenue Ruling (e.g., Rev. Rul. 2026-NN). Available at https://www.irs.gov/applicable-federal-rates and https://www.irs.gov/businesses/small-businesses-self-employed/section-7520-interest-rates

---

## IMPLICATIONS

### Higher §7520 favors:
- Qualified Personal Residence Trust (QPRT) — higher rate increases value of retained term, reducing gift
- Charitable Remainder Annuity Trust (CRAT) — higher rate increases value of charitable remainder
- Charitable Gift Annuity (CGA) — affects payout-rate vs. charitable-deduction balance

### Lower §7520 favors:
- Grantor Retained Annuity Trust (GRAT) — lower hurdle rate makes it easier to outperform
- Charitable Lead Annuity Trust (CLAT) — lower rate increases value of charitable lead, reducing taxable remainder
- Private annuity transactions

### IDGT Note Rate (uses AFR, not §7520)
- **Standard practice:** mid-term AFR (compounded annually) when note term is 3–9 years
- **Long-term AFR:** if note term > 9 years
- **Short-term AFR:** if note term ≤ 3 years
- **Demand note:** can use blended annual rate under IRC §7872(e)(2)
- The note must bear interest at AT LEAST the AFR to avoid imputation as a gift

### Intra-Family Loans (IRC §7872 / §1274)
- AFR for the term of the loan
- Below-AFR loans: shortfall imputed as gift income to lender, deemed gift to borrower
- Demand loans: can use blended annual rate

---

## §382 LONG-TERM TAX-EXEMPT RATE (for NOL carryforwards in M&A)

May 2026: 3.65%

Used to compute the §382 limitation when there's an ownership change in a corporation with NOL carryforwards. Relevant in M&A contexts where the acquirer wants to use the target's NOLs.

---

## REFRESH CHECKLIST

When refreshing this file:
- [ ] Pull current month from IRS website
- [ ] Update "Current Month" pointer
- [ ] Add new row to §7520 history (if not yet present)
- [ ] Add new row to AFR history with all four rates
- [ ] Update "Last refreshed" timestamp
- [ ] If GRAT/IDGT/CRT/CLT planning is in progress for any active client, alert advisor that rates have moved
- [ ] If §7520 has moved >0.6% from prior month, flag — material valuation impact possible

---

## HISTORICAL §7520 EXTREMES (FOR CONTEXT)

- **All-time low:** 0.4% (December 2020)
- **All-time high:** 11.6% (August 1989, near program inception)
- **Pre-2008-financial-crisis range:** 4.0%–6.0%
- **Post-2008 / ZIRP era:** 1.0%–3.0%
- **Post-2022 inflation:** rose back to 4.0%–6.0% range

The current ~5% range is historically average. GRAT performance currently requires asset growth above 5% to transfer value — well within reach for most operating businesses but tighter than the ZIRP-era 1-2% hurdle.

---

## NOTES TO GENERATOR

When producing GRAT, IDGT, CRT, CLT, QPRT, SCIN, or intra-family loan content:

1. **Always read the current §7520 rate from this file** — do not infer from training data
2. **Always cite the rate as "current at funding"** in the plan output (e.g., "the §7520 hurdle rate at GRAT funding is currently 5.0%")
3. **If this file is more than 30 days stale, fail closed** — do not generate the planning output; surface as error to senior advisor

The team's monthly process for refreshing this file is documented in operations playbook (separate from this KB).
