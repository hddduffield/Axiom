# [REC-RET-003] — Profit-Sharing Layer (Cross-Tested)

## METADATA
- **ID:** REC-RET-003
- **Status:** Active
- **Category:** Retirement
- **Engagement archetypes:** Pre-Exit, Active-No-Exit
- **Plan section placement:** "Recommendations — Retirement & Benefits"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - 401(k) plan in place
  - Owner age 40+ (cross-testing favors older HCEs)
  - Workforce composition allows owner-favorable cross-testing (typically: small senior team + younger junior employees)
  - Profit available to allocate
  - FR.10.has_profit_sharing_layer == False (or layer is non-cross-tested)

DISQUALIFY if:
  - Workforce so flat that cross-testing produces no advantage (only ~2-5% to owner)
  - Plan can't be amended to add cross-testing (rare; most modern plans support it)
```

### Natural-language explanation
A cross-tested profit-sharing component allocates contributions in different percentages to different employee groups, subject to non-discrimination testing on a benefits-equivalent basis (rather than allocation-equivalent). This lets owners receive substantially more than the 1-3% an "across-the-board" formula would generate.

### Hard disqualifiers
- Plan document doesn't permit cross-testing (amend first)
- Workforce skewed too HCE-heavy (cross-testing math fails)

## WHAT IT IS
A profit-sharing component to the 401(k) plan that uses cross-testing (also called "new comparability" testing) to allocate contributions in age-weighted or class-weighted patterns. Owner-clients can receive 25%+ of compensation as profit sharing; non-owner employees receive lesser allocation that satisfies nondiscrimination testing.

## WHY WE RECOMMEND IT
Bridges between 401(k) deferral cap ($24,500-$35,750) and §415(c) overall cap ($72,000). For a 50-year-old owner deferring $32,500, profit sharing of $39,500 fills the gap to $72,000 — all employer-paid, fully deductible to the business.

## VARIATIONS
- **Pro-rata profit sharing:** same percentage to all eligible employees; simple but not owner-favorable
- **Cross-tested (new comparability):** different rates to different classes; favors older HCEs
- **Age-weighted:** explicit age weighting in allocation
- **Integrated (Social Security):** higher allocation above SS wage base

## QUANTIFIED IMPACT FRAMEWORK

### Components
- Profit-sharing contribution (deductible to business)
- Tax-deferred growth on contributions
- §415(c) cap utilization

### Worked example (Holloway-style, owner age 52, $360K comp cap)
- 401(k) deferral: $24,500 + $8,000 catch-up = $32,500
- Profit-sharing layer: $39,500 (filling to $72,000 §415(c) cap)
- Total: $72,000 in employer-employee combined contributions
- Add catch-up on top: $80,000 effective total at 50+
- Business deducts profit-sharing portion ($39,500); owner reports nothing additional (employer contribution)

## IMPLEMENTATION STEPS
1. Plan amendment to add or modify profit-sharing formula (cross-tested if not already)
2. Workforce analysis to determine cross-testing groups
3. Annual nondiscrimination testing
4. Funding by tax-filing deadline (incl. extensions)
5. Allocation reporting on participant statements

## SEQUENCING DEPENDENCIES
- **SEQUENCED WITH:** REC-RET-001 (max deferrals first — both part of same retirement-stack workplan)
- **COORDINATED WITH:** REC-RET-002 (cash balance — combined cross-testing for owner-favorable)
- **PREREQUISITE:** REC-RET-007 if plan amendment needed

## DOCUMENTATION CHECKLIST
- [ ] Plan document allows cross-tested profit sharing
- [ ] Annual cross-testing analysis
- [ ] Form 5500 reflects allocation
- [ ] Participant statements

## COMMON MISTAKES
- Cross-testing failures forcing larger employee allocations
- Forgetting profit-sharing fund timing (must be by tax extension deadline)
- Confusing match (per deferral) with profit sharing (separate)

## COORDINATION NOTES
- **PSA Wealth:** modeling, design, annual review
- **TPA:** plan amendment, testing, allocation
- **CPA:** deduction timing
- **Attorney:** plan amendment if structural change

## CLIENT CONVERSATION FRAMING
> "Add a cross-tested profit-sharing layer to the plan. Combined with your maxed deferrals, this gets your total 401(k)-side savings to ${total} per year, with ~${employer_portion} of that being employer contribution (deductible to {business_name}). Employee allocation cost: ~${employee_cost}/year. Combined with the cash balance plan we discussed, your annual tax-deferred retirement saving reaches $${grand_total}."

## CAVEATS & DISQUALIFIERS
- Annual nondiscrimination testing required
- Workforce changes affect testing year-over-year
- Plan amendment fees for design changes

## REFERENCES
- IRC §401(a)(4) — nondiscrimination
- Treas. Reg. §1.401(a)(4)-8 — cross-testing
- IRC §415(c) — §415 limit

## PLAN OUTPUT TEMPLATE

> **Add a cross-tested profit-sharing layer.** With deferrals maxed, fill to the $72,000 §415(c) overall cap with profit-sharing — approximately ${ps_amount}/year for you. {if cash_balance_layered: "Combined with the cash-balance plan, total annual tax-deferred retirement contribution is approximately ${grand_total}."}. Cross-testing produces favorable owner allocations; employee allocation cost approximately ${employee_cost}/year for nondiscrimination compliance.
