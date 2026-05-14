# [REC-CHR-009] — Charitable Bargain Sale

## METADATA
- **ID:** REC-CHR-009
- **Status:** Active-Cautioned
- **Category:** Charitable
- **Engagement archetypes:** When client owns donatable appreciated asset
- **Plan section placement:** "Recommendations — Charitable Planning"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - Highly appreciated asset (real estate, business interest, securities)
  - Owner wants partial liquidity AND charitable impact
  - Asset value well above basis

DISQUALIFY if:
  - Pure charitable gift sufficient
  - Pure sale needed
  - Asset valuation difficult (audit risk)
```

### Natural-language explanation
A bargain sale: donor sells asset to charity at below-FMV price. Difference between sale price and FMV is charitable deduction. Donor gets some cash; charity gets asset at discount; partial deduction; partial capital gain (allocated between sale and gift portions).

### Hard disqualifiers
- Charity unwilling to participate
- Asset too complex to value

## WHAT IT IS
A combined sale-and-gift transaction. Donor sells asset to charity at agreed sale price below FMV (e.g., asset worth $1M sold for $400K). Sale portion: $400K cash + allocated basis ($400K/$1M × original basis) → may have small gain. Gift portion: $600K of FMV minus allocated basis → charitable deduction.

## WHY WE RECOMMEND IT
Useful when donor needs partial liquidity but wants substantial charitable impact, AND charity has interest in the asset (often nonprofit acquiring real estate it can use).

## QUANTIFIED IMPACT FRAMEWORK

### Worked example
Real estate FMV $1M, basis $200K, sold to charity for $400K (40%):
- Sale portion: $400K cash to donor
- Allocated basis: $200K × 40% = $80K
- Sale-portion gain: $400K - $80K = $320K (taxable LTCG)
- Gift portion: $600K
- Allocated basis: $200K × 60% = $120K
- Charitable deduction: $600K (FMV) [limited by 30% AGI]
- Compared to pure sale: $1M proceeds, $800K gain, no deduction
- Compared to pure gift: $0 cash, $1M deduction, $0 gain

## IMPLEMENTATION STEPS
1. Charity expresses interest in asset
2. Qualified appraisal at FMV
3. Sale price negotiation (typically % of FMV)
4. Document sale (treats sale and gift portions appropriately)
5. Donor reports gain on sale portion; takes deduction on gift portion
6. Form 8283 for non-cash gift portion

## SEQUENCING DEPENDENCIES
- **COORDINATED WITH:** other charitable strategies; see CHR-001/002

## DOCUMENTATION CHECKLIST
- [ ] Qualified appraisal
- [ ] Sale documentation
- [ ] Form 8283
- [ ] Allocation of basis between sale and gift portions

## COMMON MISTAKES
- Sale price too close to FMV (limited deduction; mostly sale)
- Sale price too low (charity may have UBTI issues)
- Failing to file Form 8283
- Mortgaged property (debt-encumbered creates gain even on gift portion)

## COORDINATION NOTES
- **PSA Wealth:** strategy
- **CPA:** allocation, gain calculation, deduction tracking
- **Attorney:** transaction documents
- **Appraiser:** mandatory

## CLIENT CONVERSATION FRAMING
> "If {charity_name} can use the {asset_type}, we structure a bargain sale: you sell to them at {pct}% of FMV. You get $${cash_proceeds} of liquidity, take a $${deduction} charitable deduction, and recognize $${gain} of capital gain on the sale portion. Charity gets the asset at $${discount} below FMV."

## CAVEATS & DISQUALIFIERS
- Charity acceptance and use case
- Mortgaged property complicates
- Allocation rules technical

## REFERENCES
- IRC §1011(b) — bargain sale to charity
- Treas. Reg. §1.1011-2

## PLAN OUTPUT TEMPLATE

> **Bargain sale of {asset_description} to {charity_name}.** FMV $${fmv}; sale price $${sale_price}. Cash to donor: $${cash}. Charitable deduction: $${deduction}. Capital gain on sale portion: $${gain}. Qualified appraisal and Form 8283 required.
