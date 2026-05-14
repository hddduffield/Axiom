# [REC-RSK-013] — Private Placement Life Insurance (PPLI)

## METADATA
- **ID:** REC-RSK-013
- **Status:** Advanced
- **Category:** Risk & Insurance
- **Engagement archetypes:** Post-Exit, Family-Office (high-net-worth)
- **Plan section placement:** "Recommendations — Wealth Wrapper Strategies"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.is_post_exit == True OR FR.has_high_net_worth == True with $25M+ liquid
  - Substantial taxable investment portfolio expected to be high-turnover or tax-inefficient
  - Client qualified purchaser ($5M+ investments) AND accredited investor
  - Client healthy enough to qualify for life insurance
  - Long-term holding period (10+ years for PPLI to outperform after costs)

DISQUALIFY if:
  - Liquid net worth below ~$10M (PPLI cost structure inefficient at smaller scale)
  - Investment time horizon under 10 years
  - Uninsurable
  - Client wants direct asset ownership and control (PPLI has indirect-ownership mechanics)
```

### Natural-language explanation
PPLI is institutionally-priced life insurance designed to wrap an investment portfolio inside a life-insurance policy structure. Investment growth inside the policy is tax-deferred (or tax-free if structured as MEC-avoiding); on death, full proceeds pass income-tax-free under §101. For HNW clients with substantial taxable portfolios that would otherwise face high turnover taxation, PPLI offers a meaningful tax-deferred wrapper.

### Hard disqualifiers
- Net worth below qualified purchaser threshold
- Investment-control mandates incompatible with insurance dedicated separate accounts (DSAs)
- Short-time-horizon planning

## WHAT IT IS
A life insurance policy structured under offshore or onshore institutional carriers, with investments held in dedicated separate accounts (DSAs) chosen by the policyholder/insured (subject to investor-control rules — IRS challenges policies where holder has too-direct investment control). Premium is paid into the policy; investment grows tax-deferred; loans against cash value can provide tax-free liquidity; on death, proceeds pass income-tax-free.

## WHY WE RECOMMEND IT (when triggered)
For clients with substantial taxable investment activity (hedge funds, private credit, high-turnover strategies), the annual tax drag can be 1-2% of NAV. PPLI's tax-deferred wrapper, after policy costs, often produces 50-100bps net annual benefit — meaningful at $10M+ scale.

## VARIATIONS
- **Onshore PPLI:** US carriers; simpler regulatory; somewhat higher cost
- **Offshore PPLI:** Bermuda, Cayman, etc.; lower cost typically; FATCA reporting required
- **Frozen Cash Value (FCV) PPLI:** further cost optimization
- **Variable PPLI:** investment options chosen by holder within DSAs
- **Single-life vs. survivorship:** survivorship can reduce mortality cost for couples

## QUANTIFIED IMPACT FRAMEWORK

### Components
- Annual tax drag avoided on investment growth
- Tax-free death benefit
- Income-tax-free policy loans for liquidity
- vs. cost: mortality charges, M&E (mortality and expense) fees, asset management fees

### Worked example
$10M investment portfolio, currently 100% taxable, generating 8% gross / 6% after-tax (2% annual tax drag from turnover):
- 25-year horizon: $10M × 1.06^25 = $42.9M after-tax outside PPLI
- Inside PPLI: $10M × 1.075^25 = $61.0M (assumes 50bps PPLI cost drag), then tax-free at death
- Difference: ~$18M of additional after-tax wealth, tax-free to heirs

Sensitivity:
- If tax drag is 1% (lower-turnover portfolio): PPLI advantage is much smaller
- If tax drag is 3% (high-turnover or all-ordinary income from credit/hedge): PPLI advantage is larger
- If horizon is 10 years: advantage shrinks
- If horizon is 30+ years: advantage compounds significantly

## IMPLEMENTATION STEPS
1. Confirm qualified purchaser / accredited investor status
2. Engage specialist counsel (PPLI legal specialty — small bar)
3. Compare carriers (Bermuda, Cayman, US-onshore options)
4. Underwrite insured(s); life insurance qualification mandatory
5. Choose investment platform / DSAs aligned with overall portfolio
6. Fund the policy (typically over 4-7 years to optimize §7702 / MEC mechanics)
7. Annual review: policy performance, asset allocation, premium payments

## SEQUENCING DEPENDENCIES
- **COORDINATED WITH:** REC-INV-011 (private markets framework — PPLI can hold private investments)
- **COORDINATED WITH:** REC-EST-004 (ILIT — PPLI can be ILIT-owned for further estate-tax benefit)

## DOCUMENTATION CHECKLIST
- [ ] Specialist counsel engagement
- [ ] Qualified purchaser / accredited investor verification
- [ ] Underwriting completed
- [ ] Policy issued; ownership structure documented
- [ ] DSA investment selection documented
- [ ] §7702 / MEC compliance documented at funding
- [ ] Annual policy statement review

## COMMON MISTAKES
- **Investor control violations:** if policyholder/insured has too much direct investment authority, IRS may invalidate the insurance treatment. Investments must be selected from a menu and managed by an independent manager.
- **MEC inadvertent:** Modified Endowment Contract treatment can apply if premium paid too quickly; reduces tax benefits substantially. Funding schedule matters.
- **Carrier selection without specialist counsel:** offshore vs. onshore choice has long-tail consequences
- **Underestimating ongoing costs:** mortality charges plus M&E fees plus asset management; total can be 0.5%-1.5%/year

## COORDINATION NOTES
- **PSA Wealth:** sponsorship, ongoing administration, annual review
- **CPA:** §7702 / MEC compliance; FATCA filings if offshore
- **Attorney:** specialist PPLI counsel mandatory; ILIT structuring if applicable
- **Other:** PPLI carrier; investment manager (if separate from PSA)

## CLIENT CONVERSATION FRAMING
> "PPLI is institutional-grade life insurance built specifically as a tax wrapper for investment portfolios. For your taxable balance, current annual tax drag is approximately ${tax_drag}. Inside a PPLI structure, investment growth is tax-deferred and the death benefit is income-tax-free. Net of all costs, the structure typically saves 50-100 basis points per year — meaningful at your scale. This is a 10+ year strategy with material complexity; we would only recommend pursuing it after substantial diligence with specialist counsel."

## CAVEATS & DISQUALIFIERS
- Long-term commitment; surrender penalties early
- Investor control rules require careful compliance
- IRS scrutiny on aggressive PPLI structures has increased
- Carrier solvency matters substantially over long horizons
- Reporting (FATCA for offshore) required

## REFERENCES
- IRC §7702 — life insurance contract definition
- IRC §7702A — modified endowment contract
- IRC §72 — annuity / life insurance taxation
- IRC §817(h) — diversification of insurance contract investments
- Christoffersen v. Commissioner, 749 F.2d 513 (8th Cir. 1984) — investor control doctrine
- Rev. Rul. 2003-91 — investor control bright lines
- IRS Notice 2003-34 — investor control guidance

## PLAN OUTPUT TEMPLATE

> **Evaluate Private Placement Life Insurance for the taxable portfolio.** Given the size of your taxable balance (~$${taxable_balance}M) and the tax-drag profile of the investment strategy (~${tax_drag}% annually), a PPLI wrapper merits evaluation. PPLI provides tax-deferred growth on investments held inside the policy and an income-tax-free death benefit; net of costs, the structure typically improves after-tax returns by 50-100 basis points annually for portfolios with this profile.
>
> **Posture:** This is an Advanced strategy with material complexity. We recommend a specialist diligence engagement (specialist PPLI counsel + comparison of 2-3 carrier proposals) before pursuing. Decision point: after diligence, pursue or not.
