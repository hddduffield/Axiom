# [REC-INV-009] — Treasury Direct Holdings for Cash Yield

## METADATA
- **ID:** REC-INV-009
- **Status:** Active
- **Category:** Investment
- **Engagement archetypes:** All
- **Plan section placement:** "Recommendations — Cash & Fixed Income"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - Material idle cash ($250K+) beyond operating need
  - State income tax drag relevant (Treasuries are state-tax-exempt)
  - Holding period > 4 weeks (Treasury Direct minimum)

DISQUALIFY if:
  - Need same-day liquidity (Treasury Direct has settlement timing)
  - Brokerage MMF preference for total convenience
```

### Natural-language explanation
Treasuries (T-bills, T-notes, T-bonds) are direct obligations of the federal government — no credit risk. Treasury Direct (treasurydirect.gov) allows direct purchase from US Treasury, no brokerage fees. Treasury interest is exempt from state income tax — meaningful for clients in higher-tax states (less so for Georgia at 5.19%).

### Hard disqualifiers
- Convenience priorities (brokerage MMF or HYSA more practical for some clients)

## WHAT IT IS
Direct ownership of US Treasury bills, notes, and bonds:
- T-bills: 4, 8, 13, 17, 26, 52 weeks
- T-notes: 2, 3, 5, 7, 10 years
- T-bonds: 20, 30 years
- TIPS: inflation-protected

Purchased at auction; held to maturity or sold on secondary market. Interest exempt from state tax.

## WHY WE RECOMMEND IT
For HNW clients with substantial cash holdings and state tax exposure, Treasury direct ownership saves the state tax drag on yield. Even in Georgia (5.19% state), $1M earning 4.7% saves $2,400/year vs. money market funds (taxable at state level).

## VARIATIONS
- T-bill ladder (3-13 weeks) for liquidity
- T-note ladder (1-5 years) for known horizons
- TIPS for inflation hedge
- Brokerage purchase (vs. Treasury Direct) — same security, slightly different mechanics

## QUANTIFIED IMPACT FRAMEWORK

### Components
- Federal yield captured (4.5-5% in current environment)
- State tax savings (state rate × federal yield × holding amount)

### Worked example
Georgia client, $1M in Treasuries vs. comparable yield in MMF:
- Treasury yield: 4.7%, $47,000 annual interest
- MMF yield: 4.7%, $47,000 annual interest
- Federal tax on both: same
- State tax (GA 5.19%) on MMF interest: $2,440
- State tax on Treasury interest: $0
- Annual state tax savings: $2,440

## IMPLEMENTATION STEPS
1. Open Treasury Direct account at treasurydirect.gov
2. Determine ladder structure based on cash needs
3. Place orders at scheduled auctions (weekly for T-bills)
4. Hold to maturity; coupon payments automatic
5. Reinvest at maturity
6. Annual 1099-INT reflects interest

## SEQUENCING DEPENDENCIES
- **COORDINATED WITH:** REC-INV-001 (business cash), REC-INV-002 (personal cash)

## DOCUMENTATION CHECKLIST
- [ ] Treasury Direct account or brokerage purchase setup
- [ ] Ladder structure documented
- [ ] Quarterly review

## COMMON MISTAKES
- Treasury Direct's interface is dated; brokerage purchase often easier
- Failing to ladder — single maturity creates reinvestment risk
- Forgetting state tax exemption when filing

## COORDINATION NOTES
- **PSA Wealth:** structuring and ongoing
- **CPA:** verify state tax exemption on filing

## CLIENT CONVERSATION FRAMING
> "For your cash beyond operating needs, Treasury direct holdings yield about the same as money market funds with one extra benefit: Treasury interest is exempt from state income tax. For Georgia at 5.19%, that's a small but real benefit; in higher-tax states, it's significant. PSA structures the ladder; held in your brokerage account for convenience."

## CAVEATS & DISQUALIFIERS
- State tax exemption applies to direct holdings; Treasury MMF gets partial exemption based on US-government-securities percentage
- TreasuryDirect interface less polished than brokerage; many clients buy via brokerage instead

## REFERENCES
- US Code Title 31 — Treasury authority
- IRC §103 — interest exclusions (note: §103 covers municipal bonds; Treasury exemption is statutory under different provisions)

## PLAN OUTPUT TEMPLATE

> **Use Treasury direct holdings for the cash layers.** Federal-tax obligation but state-tax-exempt; for Georgia, modest annual benefit of ~5.19% × yield. Build ladder appropriate to liquidity needs. Hold via {Treasury Direct | brokerage}. Annual state tax saving: $${state_tax_saving}.
