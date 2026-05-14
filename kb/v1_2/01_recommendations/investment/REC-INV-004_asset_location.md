# [REC-INV-004] — Asset Location Optimization

## METADATA
- **ID:** REC-INV-004
- **Status:** Active
- **Category:** Investment
- **Engagement archetypes:** All HNW with mixed account types
- **Plan section placement:** "Recommendations — Personal Investment"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - Mixed account types: taxable + traditional pre-tax + Roth
  - Asset allocation requires multiple asset classes (equity + fixed income + alternatives)
  - Sub-optimal placement (e.g., bonds in taxable; high-turnover funds in pre-tax; tax-inefficient income in taxable)

DISQUALIFY if:
  - Single account type (e.g., all in 401(k))
  - Already optimized
```

### Natural-language explanation
Asset location places asset classes in the most tax-efficient account type:
- **Tax-inefficient (taxable bonds, high-yield, REITs, commodities, hedge funds): pre-tax (Traditional IRA/401(k))** — defer ordinary income
- **Tax-efficient equity (index funds, direct indexing, growth stocks): taxable** — benefit from LTCG rates and step-up at death
- **Highest expected return assets: Roth** — tax-free growth on the largest expected gains

Optimization can add 50-100bps per year on net-of-tax basis without changing overall asset allocation.

### Hard disqualifiers
- Already optimized
- Constraints prevent (e.g., 401(k) investment options limited)

## WHAT IT IS
Allocation by account type, not just by asset class. Same overall mix; different placement; better after-tax outcome.

## WHY WE RECOMMEND IT
Tax drag on bonds in taxable account: ~37% of yield. Same bonds in pre-tax: 0% drag during accumulation. Strategic placement saves ~50-100bps annually for typical HNW client.

## VARIATIONS
- Static allocation (place once, rebalance occasionally)
- Tax-loss-harvesting integrated (asset location coordinated with REC-INV-007)
- Account-by-account optimization or whole-portfolio optimization

## QUANTIFIED IMPACT FRAMEWORK

### Components
- Tax savings on income/gains in optimal location
- Compounded over investment horizon

### Worked example
$10M household portfolio, 60/40 mix, currently allocated equally across $5M taxable / $5M pre-tax:
- Suboptimal: $3M bonds in taxable earning 4.5% × 37% drag = $50K/year of tax drag avoidable
- Optimal: bonds shift to pre-tax; equity to taxable
- Annual benefit: ~$30K-$50K of after-tax improvement

## IMPLEMENTATION STEPS
1. Inventory current asset placement by account type
2. Identify tax-efficient and tax-inefficient asset classes
3. Determine optimal placement (subject to account-type investment options)
4. Execute (transfers, rebalances) with attention to gains realization
5. Annual review

## SEQUENCING DEPENDENCIES
- **COORDINATED WITH:** REC-INV-003 (direct indexing typically in taxable), REC-INV-007 (loss harvesting)

## DOCUMENTATION CHECKLIST
- [ ] Asset placement documented before/after
- [ ] IPS reflects placement strategy
- [ ] Annual review

## COMMON MISTAKES
- 401(k) investment options don't include needed asset classes — partial optimization only
- Realizing large gains during transition
- Forgetting to maintain through rebalances

## COORDINATION NOTES
- **PSA Wealth:** primary
- **CPA:** confirms tax treatment
- **Plan provider:** investment menu

## CLIENT CONVERSATION FRAMING
> "Same overall asset mix, different placement. Bonds in your 401(k); equity in your taxable. Annual after-tax benefit: ~${annual_benefit}/year, compounding. No change to the overall risk profile of your portfolio."

## CAVEATS & DISQUALIFIERS
- 401(k) menu may not support optimal placement
- Transitions can realize gains; pace appropriately

## REFERENCES
- Standard tax-efficiency literature
- Vanguard / Morningstar research on asset location alpha

## PLAN OUTPUT TEMPLATE

> **Optimize asset location.** Same target mix, different placement: tax-inefficient (bonds, REITs, alternatives) shift to pre-tax accounts; tax-efficient (index equity, growth) to taxable; highest-expected-return assets to Roth where available. Estimated annual after-tax benefit: $${annual_benefit}/year. PSA executes with attention to current-year gain realization.
