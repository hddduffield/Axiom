# [REC-INV-008] — Roth Conversion Bracket Modeling

## METADATA
- **ID:** REC-INV-008
- **Status:** Active
- **Category:** Investment
- **Engagement archetypes:** Post-Exit, transition years (low-income year)
- **Plan section placement:** "Recommendations — Tax / Retirement"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - Material pre-tax IRA / 401(k) balance ($1M+)
  - Lower-income year ahead (post-exit gap, retirement transition, planned sabbatical)
  - Owner not yet at RMD age (76 currently for SECURE 2.0)

DISQUALIFY if:
  - Pre-tax balance small (immaterial benefit)
  - Income high in target year (no advantage)
  - State tax conversion drawback (some states tax conversion at high rates)
```

### Natural-language explanation
Convert pre-tax balances to Roth in years when marginal rate is lower than projected retirement rate. Common opportunity: post-exit gap year between business sale and Social Security/RMDs. Modeling identifies how much to convert each year to fill brackets without overflowing into higher rates.

### Hard disqualifiers
- No tax-rate-arbitrage opportunity
- State tax friction

## WHAT IT IS
Targeted conversion of traditional IRA / 401(k) to Roth. Conversion is taxable as ordinary income in conversion year. Strategy: convert just enough each year to fill the desired bracket without overflowing into higher rates.

## WHY WE RECOMMEND IT
Post-exit, owner often has a 1-3 year gap before SS/RMDs at much lower income. Converting at 22-24% rate during gap saves the difference vs. retirement at 32-37%. Roth grows tax-free; no RMDs from Roth.

## QUANTIFIED IMPACT FRAMEWORK

### Components
- Tax rate differential × conversion amount
- Tax-free growth on converted amount
- Future RMD avoidance

### Worked example
Marcus age 60 post-exit, $3M traditional IRA balance, 4 gap years before SS:
- Convert $200K/year × 4 years = $800K converted
- Tax in conversion years (gap year, low income): 22-24% bracket = ~$176K-$192K total tax
- Tax if held until retirement (37% bracket post-RMDs + state): ~$296K
- Tax savings: ~$104K-$120K
- Plus tax-free growth on Roth balance for life

## IMPLEMENTATION STEPS
1. Project taxable income in each gap year
2. Identify bracket fill targets
3. Convert at year-end after income certainty
4. Pay conversion tax from non-IRA cash (preserves IRA balance for compound)
5. Annual review with bracket update

## SEQUENCING DEPENDENCIES
- **COORDINATED WITH:** REC-INV-006 (post-transaction unwind), REC-INV-013 (bracket fill distributions)

## DOCUMENTATION CHECKLIST
- [ ] Multi-year tax projection
- [ ] Conversion targets per year
- [ ] Year-end conversion executed
- [ ] Form 8606 if non-deductible basis present
- [ ] Quarterly estimated tax payments adjusted

## COMMON MISTAKES
- Converting in high-income year (no rate arbitrage)
- Failing to pay tax from non-IRA cash → reduces Roth balance and the benefit
- State tax surprise (some states tax conversion fully)
- Triggering Medicare IRMAA surcharges through too-large conversion

## COORDINATION NOTES
- **PSA Wealth:** modeling and execution
- **CPA:** annual projection accuracy; quarterly estimates
- **Other:** Medicare advisor for IRMAA modeling if 63+

## CLIENT CONVERSATION FRAMING
> "After the sale, you'll have {gap_years} years of relatively low income before {Social Security, RMDs, etc.}. We use those years to convert pre-tax IRA balances to Roth at much lower tax rates than you'll pay in retirement. Each year's conversion: ${annual_conversion}; total over the gap: ${total_conversion}. Tax savings: roughly ${tax_savings} compared to leaving it alone, plus tax-free growth for life on the Roth balance."

## CAVEATS & DISQUALIFIERS
- IRMAA cliffs at certain MAGI thresholds (Medicare premium surcharges 2 years later)
- State tax treatment varies (Georgia conforms to federal here)
- No ability to undo conversion (recharacterization eliminated by TCJA)

## REFERENCES
- IRC §408A — Roth IRA
- IRC §408A(d)(3) — conversions
- 2026 IRMAA thresholds (CMS)

## PLAN OUTPUT TEMPLATE

> **Roth conversion strategy in gap years.** Project ${gap_years} year(s) post-{transition_event} of materially-lower income before {SS / RMDs / next stage}. Convert traditional IRA balance to Roth in those years targeting the {target_bracket}% bracket — $${annual_conversion}/year. Total conversion over the gap: $${total_conversion}; total tax cost: $${total_tax}. Compare to if held to retirement: ~$${alt_tax} of tax. Net savings: $${tax_savings}. Pay conversion tax from non-IRA cash to preserve full IRA balance for tax-free Roth compounding.
