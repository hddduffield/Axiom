# [REC-RSK-006] — Business Overhead Expense (BOE) Disability

## METADATA
- **ID:** REC-RSK-006
- **Status:** Active
- **Category:** Risk & Insurance
- **Engagement archetypes:** Pre-Exit, Active-No-Exit
- **Plan section placement:** "Recommendations — Business" → "Risk & Continuity"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.has_business == True
  - Owner-operator critical to business operations
  - Business has fixed overhead (rent, payroll, utilities) that continues during owner disability
  - FR.7.2.has_boe == False
  - Owner age <= 60

DISQUALIFY if:
  - Business operates without owner involvement (passive)
  - Fixed overhead is trivial (e.g., 1099 consultants with no employees)
```

### Natural-language explanation
BOE is business-owned coverage that pays the business's fixed overhead (rent, payroll, utilities, loan payments) during the owner's disability. Distinct from individual DI (which replaces owner's personal income). BOE keeps the business operating while the owner recovers — preserving enterprise value during a 12-24 month disability.

### Hard disqualifiers
- Owner has no operational role; business runs without them
- Fixed overhead is minimal

## WHAT IT IS
Business-owned disability policy that reimburses defined fixed business overhead expenses if the owner becomes disabled. Benefit period typically 12-24 months. Eligible expenses generally: rent, employee compensation, utilities, professional services, business loan payments. Does NOT cover: owner's personal income (separate individual DI), inventory, raw materials, profit.

## WHY WE RECOMMEND IT
On owner disability, fixed overhead doesn't stop. Without BOE, the business burns reserves to keep operating; if reserves run out before owner returns, the business may be forced to wind down — destroying enterprise value worth millions. BOE typically costs 1-2% of covered expenses per year and preserves the business as a going concern through the disability period.

## QUANTIFIED IMPACT FRAMEWORK

### Components
- Monthly business overhead reimbursement
- Business continuity preservation
- Avoided forced sale or wind-down at distressed values

### Worked example
Operating business with $200K/month fixed overhead (rent $30K, payroll $150K, utilities/professional/loan $20K):
- BOE: $200K/month for 24 months ($4.8M maximum)
- Annual premium: ~$3K-$8K
- On owner disability, business doesn't bleed $200K/month from operating capital
- Business remains saleable; on owner return, ready to grow rather than rebuild

## IMPLEMENTATION STEPS
1. Identify and document covered overhead expenses (the policy reimburses ACTUAL expenses up to the elected maximum)
2. Underwriting on owner — same general process as individual DI but business-owned
3. Issue policy with appropriate monthly maximum and benefit period (24 months standard)
4. Premium paid by business — deductible business expense
5. Annual review: overhead expense growth, owner age impact

## SEQUENCING DEPENDENCIES
- **COORDINATED WITH:** REC-RSK-005 (individual DI — different need, both)
- **COORDINATED WITH:** REC-RSK-001/2/3 (buy/sell — disability triggers)

## DOCUMENTATION CHECKLIST
- [ ] Documented overhead expense inventory
- [ ] Underwriting completed
- [ ] Policy issued; business as owner and beneficiary
- [ ] Premium paid from business operating account
- [ ] Annual overhead recheck

## COMMON MISTAKES
- Confusing BOE with individual DI — they cover different needs; need both
- Selecting too-low monthly max — pays only actual covered expenses, capped at the max
- Forgetting to update as overhead grows
- Including non-eligible expenses in claim (e.g., owner comp during disability)

## COORDINATION NOTES
- **PSA Wealth:** product selection, underwriting, annual review
- **CPA:** confirm business deductibility of premium; benefit is taxable to business when received but offset by deductible expenses
- **Attorney:** none

## CLIENT CONVERSATION FRAMING
> "Individual DI replaces your paycheck if you're disabled. BOE keeps the business running — pays the rent, the team, the bank loan — while you recover. They cover different things; you need both. BOE costs about ${annual_premium}/year and pays up to ${monthly_max}/month for 24 months if you can't work. The alternative is bleeding business reserves at ${monthly_overhead}/month until you're back."

## CAVEATS & DISQUALIFIERS
- Reimburses ACTUAL covered expenses up to the policy max — not a flat benefit
- 24-month benefit period typical; longer disabilities require business plan B
- Owner must be the disabled party (not other key personnel — see key person life)

## REFERENCES
- IRC §162 — business expense deduction (BOE premiums deductible)
- IRC §104(a)(3) — taxability of received benefit (taxable; offsets deductible covered expenses)

## PLAN OUTPUT TEMPLATE

> **Add Business Overhead Expense (BOE) coverage.** Distinct from individual disability (which replaces your personal income), BOE keeps the business running during your disability — covering rent, payroll, utilities, and other fixed overhead. Documented monthly overhead is approximately ${monthly_overhead}; we recommend BOE with $${monthly_max}/month maximum benefit and 24-month benefit period. Annual premium approximately ${annual_premium}, paid by the business and deductible. This is on top of, not in place of, individual DI.
