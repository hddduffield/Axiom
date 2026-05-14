# [REC-INV-001] — Tiered Business Cash Management

## METADATA
- **ID:** REC-INV-001
- **Status:** Active
- **Category:** Investment
- **Engagement archetypes:** Pre-Exit, Active-No-Exit
- **Plan section placement:** "Recommendations — Business" → "Cash Management"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.has_business == True
  - Business cash balance > $1M (idle capital)
  - Cash earning sub-market yield (typical: regional bank operating account at 0.1-0.5%)

DISQUALIFY if:
  - Business cash needed for short-term operations beyond reserve
  - Treasury management already optimized
```

### Natural-language explanation
Operating businesses often hold material cash in low-yield bank accounts because operating cash flow plans don't distinguish between transactional cash, working-capital reserve, and longer-term capital. Tiered structure: operating layer (transactional, low yield acceptable), reserve layer (3-6 months of opex, money market or short Treasuries), strategic layer (multi-year capital, slightly longer duration Treasuries / muni for tax-exempt growth).

### Hard disqualifiers
- All cash needed transactionally
- Existing optimization in place

## WHAT IT IS
Three-layer cash structure:
1. **Operating cash:** 1-2 months of payroll/AP — bank operating account; sweep to MMF if available; minimal yield optimization
2. **Working reserve:** 3-6 months of opex — money market fund or 4-13 week Treasury bills; targets 4-5% yield in current rate environment
3. **Strategic capital:** funds beyond 6-month reserve, not earmarked for opex within 12-24 months — short-duration Treasury portfolio (1-3 year), CD ladder, or municipal bond portfolio (tax-free if entity holds)

## WHY WE RECOMMEND IT
Business cash sitting in a bank operating account at 0.1% earns 50-100bps less than a 4-5% short Treasury yield. On $5M of idle business cash, that's $200K-$250K/year in foregone yield — pure economic waste.

## QUANTIFIED IMPACT FRAMEWORK

### Components
- Yield differential between current placement and optimized structure
- Capital preservation (Treasury direct holdings credit-risk-free)
- Liquidity matching to actual operational need

### Worked example
Operating business with $5M idle cash, currently in regional bank at 0.4%:
- Current annual yield: $20,000
- Optimized: $1M operating (0.5%), $1M working reserve (4.5% MMF), $3M strategic (4.7% short Treasuries)
  = $5,000 + $45,000 + $141,000 = $191,000
- Annual benefit: $171,000 of additional yield

## IMPLEMENTATION STEPS
1. Cash analysis: current balance, monthly OPS cycle, AP/AR pattern
2. Determine layer sizes based on operational need
3. Choose vehicles (bank MMF, brokerage MMF, Treasury Direct, CD ladder, muni portfolio if entity-tax-exempt)
4. Open accounts, fund layers, configure sweeps
5. Monthly monitoring; rebalance as cash grows

## SEQUENCING DEPENDENCIES
- **COORDINATED WITH:** REC-INV-002 (personal cash layering — same logic for personal)

## DOCUMENTATION CHECKLIST
- [ ] Cash analysis documented
- [ ] Layer targets defined and approved by board/owner
- [ ] Investment Policy Statement for business cash (if material balance)
- [ ] Authorized signatories on each account
- [ ] Monthly monitoring established

## COMMON MISTAKES
- Putting all cash in long-duration instruments — liquidity squeeze when working capital tight
- Ignoring AP/AR cycle — false sense of "extra" cash that's actually transactional
- Failing to update layer sizes as business grows
- Concentrating in single bank/MMF — counterparty risk

## COORDINATION NOTES
- **PSA Wealth:** structuring, ongoing management, reporting
- **CFO/Controller:** operational cash forecasting; AP/AR cycle visibility
- **Banker:** sweep account setup; treasury services
- **CPA:** state/federal tax treatment of muni interest if applicable

## CLIENT CONVERSATION FRAMING
> "{Business_name} is sitting on roughly $${cash_balance}M in operating cash, earning {current_yield}% at {current_bank}. We can structure that into operating, reserve, and strategic layers — keeping operating money fully liquid where you need it, and putting the rest into Treasuries or money market funds at 4-5%. Annual benefit: roughly $${annual_benefit}/year. PSA manages the structure; you continue to work with your treasury banker for transactional needs."

## CAVEATS & DISQUALIFIERS
- Treasury yields move with the rate environment; current ~4.5-4.8% may not persist
- FDIC insurance limited; brokerage MMF and Treasury direct holdings are credit risks (sovereign for Treasury)
- Tax treatment of yield (taxable; muni for tax-exempt entity context)

## REFERENCES
- US Treasury Direct
- Money market fund regulations (Rule 2a-7)
- Standard treasury management practices

## PLAN OUTPUT TEMPLATE

> **Restructure {business_name}'s cash management into tiered layers.** Current: $${cash_balance}M in operating account at {current_yield}% yielding $${current_yield_dollars}/year. Recommended: $${operating_layer}M operating (bank, 0.5%), $${reserve_layer}M working reserve (MMF, 4.5%), $${strategic_layer}M strategic (short Treasuries, 4.7%). Annual yield improvement: $${annual_benefit}/year. PSA structures and manages; treasury banker handles transactional services.
