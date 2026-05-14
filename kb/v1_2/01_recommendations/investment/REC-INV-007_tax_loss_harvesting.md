# [REC-INV-007] — Tax-Loss Harvesting Coordination

## METADATA
- **ID:** REC-INV-007
- **Status:** Active
- **Category:** Investment
- **Engagement archetypes:** All HNW with taxable balances
- **Plan section placement:** "Recommendations — Personal Investment"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - Taxable account balance > $250K
  - Active gain or loss positions
  - High marginal bracket making losses valuable

DISQUALIFY if:
  - All positions in retirement accounts
  - Already integrated harvesting via direct indexing (REC-INV-003)
```

### Natural-language explanation
Tax-loss harvesting realizes losses in declining positions to offset gains elsewhere or, up to $3,000 per year, ordinary income. Coordinated across taxable holdings and integrated with direct indexing where present, the practice generates "tax alpha" of 50-100bps/year for HNW investors. Carryforward of unused losses is unlimited.

### Hard disqualifiers
- Wash sale concerns from related accounts
- All gains in retirement accounts (no tax to offset)

## WHAT IT IS
Systematic identification and realization of unrealized losses, with replacement in similar (but not "substantially identical" under wash sale rule) positions to maintain market exposure. Realized losses offset:
- Other capital gains (no limit)
- Up to $3,000 of ordinary income per year
- Carryforward indefinitely

## WHY WE RECOMMEND IT
Realizes losses without changing strategic exposure. Generates ~50-100 bps of after-tax return enhancement annually for HNW. Larger benefit when integrated with direct indexing.

## VARIATIONS
- Stand-alone harvesting (across existing positions)
- Direct-indexing-integrated (REC-INV-003)
- Year-end harvesting concentrated review
- Continuous harvesting throughout year

## QUANTIFIED IMPACT FRAMEWORK

### Components
- Loss realization × marginal rate (when offset by gains in current year)
- $3,000/year ordinary income offset
- Carryforward bank for future use

### Worked example
$2M taxable portfolio, 7% return, harvest 2% of value annually as losses:
- $40K of losses realized; offsets $40K of other gains (or $3K against ordinary + $37K carry)
- At 23.8% gain rate: $9,500 of tax savings
- Tax alpha: ~50 bps

## IMPLEMENTATION STEPS
1. Quarterly portfolio review
2. Identify losses; verify wash-sale safe replacement
3. Execute trades
4. Coordinate across all accounts (retirement plan harvesting in taxable triggers wash sale)
5. Year-end review for realized gain offset
6. Tax filing reflects all activity

## SEQUENCING DEPENDENCIES
- **COORDINATED WITH:** REC-INV-003 (direct indexing — primary harvesting vehicle), REC-INV-006 (post-transaction unwind)

## DOCUMENTATION CHECKLIST
- [ ] Quarterly review documented
- [ ] Wash-sale tracking across accounts
- [ ] Loss carryforward tracked
- [ ] CPA coordination at tax filing

## COMMON MISTAKES
- Wash sale violations across accounts (spouse's IRA buying same security within 30 days)
- "Substantially identical" interpretation issues (S&P 500 ETFs from different providers)
- Double-counting losses across accounts
- Forgetting carryforward in subsequent years

## COORDINATION NOTES
- **PSA Wealth:** execution and monitoring
- **CPA:** tax filing and carryforward tracking
- **Other accounts:** awareness of cross-account positions

## CLIENT CONVERSATION FRAMING
> "We harvest losses across your taxable accounts to offset gains and reduce your tax bill. Done systematically — particularly through direct indexing — adds about 50-100 basis points to your after-tax return per year. Wash sale rules require careful attention; PSA tracks across all your accounts."

## CAVEATS & DISQUALIFIERS
- Wash sale rule (30 days before/after, all accounts including spouse's)
- "Substantially identical" not always clear
- Tax-loss carryforwards do NOT step up at death (different from gains)

## REFERENCES
- IRC §1091 — wash sale
- IRC §1211 — capital loss limit
- IRC §1212 — capital loss carryover

## PLAN OUTPUT TEMPLATE

> **Implement systematic tax-loss harvesting.** {If REC-INV-003 is also recommended: "Direct indexing is the primary harvesting vehicle."} Coordinated quarterly review across all taxable accounts with wash-sale awareness. Expected annual tax alpha: 50-100 basis points = $${annual_benefit}/year on the $${taxable_balance} balance. Loss carryforward bank built for future gains realization.
