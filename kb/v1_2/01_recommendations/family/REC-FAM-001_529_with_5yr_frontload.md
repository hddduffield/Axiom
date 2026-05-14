# [REC-FAM-001] — 529 Plan Funding (with 5-Year Front-Load)

## METADATA
- **ID:** REC-FAM-001
- **Status:** Active
- **Category:** Family
- **Engagement archetypes:** All with children/grandchildren
- **Plan section placement:** "Recommendations — Family"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.has_children_at_all == True OR client has grandchildren
  - Children/grandchildren under age 30
  - Owner has annual exclusion capacity (FR.9.2 not at limit)

DISQUALIFY if:
  - Children all college-completed and 30+ with stable financial situation
```

### Natural-language explanation
529 plans provide tax-deferred growth and tax-free distribution for qualified education expenses. The 5-year front-load lets a donor contribute 5 years of annual exclusion gifts in a single year ($95,000 per beneficiary in 2026; $190,000 if gift-split with spouse) without using lifetime exemption. SECURE 2.0 added the 529-to-Roth rollover option, increasing flexibility.

### Hard disqualifiers
- All beneficiaries beyond reasonable education timeline
- Existing 529s already funded to projected need

## WHAT IT IS
State-sponsored education savings vehicle:
- Contributions are after-tax federally (some states give state deduction)
- Tax-deferred growth
- Tax-free distribution for qualified education expenses (tuition, fees, room/board, books, K-12 tuition up to $10K/year)
- Owner retains control; can change beneficiary
- 5-year front-load: $19,000 × 5 = $95,000 single donor; $190,000 couple gift-splitting
- Subject to gift-tax return Form 709 if front-loaded (allocated over 5 years)
- SECURE 2.0: $35,000 lifetime rollover from 529 to Roth IRA (15-year-old account, beneficiary's Roth, subject to annual Roth limits)

## WHY WE RECOMMEND IT
Tax-free education funding for children/grandchildren. Front-loading captures 5 years of compound growth at one time. Georgia provides Georgia Higher Education Savings Plan deduction up to $4,000 per beneficiary (single)/$8,000 MFJ for residents.

## VARIATIONS
- **In-state plan (Georgia Path2College 529):** state tax deduction
- **Out-of-state plan:** sometimes superior investment options or lower fees (e.g., Utah, Nevada, NY); state tax deduction lost
- **Front-load (5-year):** maximize early deposit
- **Annual gifting only:** simpler, no Form 709

## QUANTIFIED IMPACT FRAMEWORK

### Components
- Annual contribution × growth × tax-free distribution
- 5-year front-load benefit (compound longer)
- Georgia state deduction (modest)
- Eventual 529-to-Roth rollover capacity

### Worked example
Two children (ages 5 and 7):
- 5-year front-load: $190K each (parents gift-split) = $380K total at year 1
- Growth at 7% over 13-15 years to college: ~$700K-$900K combined
- Education costs: $300K-$500K combined for in-state public + private mix
- Excess flows to next-gen (beneficiary change) or 529-to-Roth (each $35K)

## IMPLEMENTATION STEPS
1. Open 529 accounts (one per beneficiary, owner = parent or grandparent)
2. Front-load contribution (year 1)
3. File Form 709 electing 5-year averaging
4. No additional gifts to same beneficiary in years 2-5 (would exceed combined exclusion)
5. Investment selection (age-based or static portfolio)
6. Annual review

## SEQUENCING DEPENDENCIES
- **COORDINATED WITH:** REC-EST-003 (annual exclusion gifting — same exclusion pool)
- **COORDINATED WITH:** REC-FAM-002 (529-to-Roth)

## DOCUMENTATION CHECKLIST
- [ ] 529 accounts opened
- [ ] Front-load contribution made
- [ ] Form 709 with 5-year election filed
- [ ] Annual review

## COMMON MISTAKES
- Front-loading and then making additional gifts in years 2-5 (over-contribution)
- Failing to file Form 709 with 5-year election
- Missing Georgia deduction for in-state plan choice
- Owner-as-grandparent triggering FAFSA issues (consider grandparent-owned timing)

## COORDINATION NOTES
- **PSA Wealth:** plan selection, contribution coordination
- **CPA:** Form 709 with election; state deduction
- **Other:** financial aid advisor if material to family

## CLIENT CONVERSATION FRAMING
> "Front-load the 529s — $190K per beneficiary, both of you gift-splitting, captures 5 years of annual exclusion in one shot. The earlier the deposit, the more compound growth before college. For your two kids, that's $380K deployed today; with 13 years of growth, more than enough for college plus excess for next-gen or Roth rollover. Form 709 needs to be filed reflecting the 5-year election."

## CAVEATS & DISQUALIFIERS
- Front-loading uses 5 years of exclusion — no other gifts to that beneficiary years 2-5
- FAFSA treatment varies by ownership (parent-owned vs grandparent-owned)
- Investment risk during accumulation
- Plan transfers possible but with restrictions

## REFERENCES
- IRC §529 — qualified tuition program
- IRC §529(c)(2)(B) — 5-year averaging
- SECURE 2.0 §126 — 529-to-Roth rollover
- Georgia Path2College 529

## PLAN OUTPUT TEMPLATE

> **Front-load 529 plans for {children/grandchildren names}.** Use the 5-year averaging election: $${frontload_per_beneficiary} per beneficiary in year 1 (gift-split between you and {spouse}). Total deployment: $${total_frontload}. File Form 709 electing 5-year averaging. {If GA: "Use Georgia Path2College 529 to capture the state deduction."} Investment in age-based portfolio; tax-free growth and distribution for qualified education. SECURE 2.0 also enables $35,000 of lifetime rollover from 529 to beneficiary's Roth IRA after 15 years.
