# [REC-SUC-006] — Stock Appreciation Rights (SARs)

## METADATA
- **ID:** REC-SUC-006
- **Status:** Active
- **Category:** Succession & Retention / Executive Equity
- **Engagement archetypes:** Pre-Exit, Active-No-Exit
- **Plan section placement:** "Recommendations — Business" → "Executive Equity Path"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - Phantom-equity-style upside desired but only on appreciation (not full value)
  - Want to base cost on date of grant rather than full equity value
  - §409A-compliant design feasible

DISQUALIFY if:
  - Need full-equity-value participation (use REC-SUC-005)
```

### Natural-language explanation
SARs are equivalent to options without strike-price purchase: holder receives cash (or stock equivalent) equal to appreciation above grant-date value at trigger event. No purchase by holder; no equity issuance.

### Hard disqualifiers
- Same as phantom equity

## WHAT IT IS
Contract giving holder right to receive cash payment equal to (current value − grant value) × number of SARs at trigger. Operates like an option without strike-price funding.

## WHY WE RECOMMEND IT
Aligns executives with future appreciation only. Cheaper than full-value phantom equity (only the increment is paid). Captures upside without giving away today's value.

## QUANTIFIED IMPACT FRAMEWORK

### Worked example
COO awarded 250 SARs, each representing 0.02% of business equity (5% total economic stake). At a $25M business valuation, grant-date value per SAR = 0.02% × $25M = $5,000; total grant-date value = $1.25M.

At transaction at $50M (so 0.02% per SAR = $10,000):
- Appreciation per SAR: $10,000 − $5,000 = $5,000
- Total payout: 250 × $5,000 = **$1.25M to COO**, ordinary income; deductible to business

Compare REC-SUC-005 phantom equity (full-value) on the same 5% stake: $2.5M payout. SAR pays only the increment above grant-date value, so it's roughly half the cost in this scenario — appropriate when the goal is aligning executives with future appreciation rather than current value.

## IMPLEMENTATION STEPS
Same as phantom equity but with appreciation-only computation.

## SEQUENCING DEPENDENCIES
- **MUTUALLY EXCLUSIVE WITH:** REC-SUC-005 phantom equity (full-value); pick one

## DOCUMENTATION CHECKLIST
Same as phantom equity.

## COMMON MISTAKES
- §409A on grant-date value (must be FMV)
- Failure to use qualified appraisal or formula

## COORDINATION NOTES
Same as REC-SUC-005.

## CLIENT CONVERSATION FRAMING
> "SARs are a slim version of phantom equity: {executive_name} only gets the appreciation above today's value, not full value. Effectively cheaper for you because you're only paying out future growth. At expected transaction, their payout would be roughly $${expected_payout}."

## CAVEATS & DISQUALIFIERS
- §409A grant-date FMV requirement
- Specialist counsel for plan document

## REFERENCES
- IRC §409A
- IRS Notice 2005-1 (and successors)

## PLAN OUTPUT TEMPLATE

> **Award SARs to {executive_list} representing appreciation above today's value.** {Executive_name(s)} receive(s) {number} SARs each representing approximately {pct}% of {entity_name}'s appreciation. Vesting {vesting_schedule}; payable at {triggers}. Today's grant-date value: ${grant_value}. At expected transaction value, payout: ${expected_payout}. Cheaper than phantom equity since only appreciation is paid out.
