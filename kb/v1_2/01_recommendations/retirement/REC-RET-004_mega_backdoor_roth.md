# [REC-RET-004] — Mega-Backdoor Roth

## METADATA
- **ID:** REC-RET-004
- **Status:** Active
- **Category:** Retirement
- **Engagement archetypes:** All (where plan supports)
- **Plan section placement:** "Recommendations — Retirement & Benefits"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - 401(k) plan in place
  - Plan supports after-tax (non-Roth) employee contributions
  - Plan supports in-service withdrawal (or in-plan Roth conversion)
  - Owner has cash flow to fund after-tax contributions
  - Owner's deferrals + employer match leave room under §415(c) ($72,000)

DISQUALIFY if:
  - Plan doesn't support after-tax contributions or in-service distributions (REC-RET-007 plan amendment first)
  - Cash flow constrained (deferrals are higher priority)
```

### Natural-language explanation
The "mega backdoor Roth" leverages the gap between the deferral cap ($24,500) and the §415(c) overall cap ($72,000). After deferrals and employer match, employee can contribute after-tax dollars up to the §415(c) cap, then convert in-plan to Roth. Result: tax-free growth on dollars beyond what's normally accessible to high-income earners.

### Hard disqualifiers
- Plan structural inadequacy (no after-tax contribution capability)
- IRS scrutiny suggests caution (Notice 2014-54 blessed the basic mechanic; ongoing minor refinement)

## WHAT IT IS
After-tax (non-Roth) employee contributions to 401(k), then in-service withdrawal or in-plan conversion to Roth 401(k) or Roth IRA. The after-tax contributions count toward §415(c) cap but are made with already-taxed dollars; conversion only taxes any earnings between contribution and conversion. With prompt conversion, tax cost is near zero.

## WHY WE RECOMMEND IT
Roth limit at $7,500/year (with $1,100 catch-up) is small. Mega backdoor multiplies that capacity by 5-10x for plan participants with after-tax capability. Tax-free growth for decades is meaningful.

## QUANTIFIED IMPACT FRAMEWORK

### Components
- After-tax contribution (post-tax dollars)
- In-service Roth conversion (tax only on earnings since contribution)
- Tax-free growth on converted Roth balance forever

### Worked example
Owner age 52, $360K comp:
- 401(k) deferral: $32,500 (incl. catch-up)
- Employer match (assume 4%): ~$10,000 (capped at lesser of formula and §401(a)(17))
- §415(c) cap: $72,000
- Available after-tax space: $72,000 − $32,500 − $10,000 = $29,500
- Plus catch-up on top: $8,000 → total deferral max $40,500 → after-tax space $21,500
- After-tax contribution + immediate Roth conversion: ~$20K-$30K/year of new Roth capacity
- 25-year compounding at 7%: ~$1.5M-$2M of tax-free Roth balance

## IMPLEMENTATION STEPS
1. Confirm plan supports after-tax contributions and in-service Roth conversions
2. If not, plan amendment (REC-RET-007)
3. Fund deferrals first, then add after-tax contributions (separate line on payroll)
4. Trigger in-service Roth conversion (typically same year, sometimes monthly)
5. 1099-R reporting at year-end shows conversion
6. Annual review

## SEQUENCING DEPENDENCIES
- **SEQUENCED WITH:** REC-RET-001 (deferrals max first — both part of same retirement-stack workplan)
- **PREREQUISITE:** REC-RET-007 if plan amendment needed
- **COORDINATED WITH:** REC-RET-005 (backdoor Roth IRA — different mechanism, complementary)

## DOCUMENTATION CHECKLIST
- [ ] Plan supports after-tax + in-service Roth (verified)
- [ ] After-tax contribution election filed
- [ ] Conversion request submitted
- [ ] 1099-R review at year-end
- [ ] Tax filing reflects conversion (Form 8606 may apply)

## COMMON MISTAKES
- Failing to convert promptly — earnings between contribution and conversion are taxable
- Misunderstanding §415(c) calculation; over-contributing
- Plan supports after-tax but not in-service withdrawal — funds trapped until separation
- Forgetting to verify plan amendment is operational at year-end

## COORDINATION NOTES
- **PSA Wealth:** verify plan capabilities, coordinate elections
- **CPA:** confirm tax reporting on conversion
- **Plan provider:** verify after-tax + in-service conversion mechanics

## CLIENT CONVERSATION FRAMING
> "Beyond your maxed deferrals, your plan allows after-tax contributions up to $${after_tax_capacity}/year, which we then convert in-plan to Roth. This is the 'mega backdoor Roth' — it multiplies your Roth capacity from $7,500/year (the regular IRA limit) to roughly ${total_roth}/year. Over 15-25 years, that compounds into substantial tax-free wealth."

## CAVEATS & DISQUALIFIERS
- Plan must specifically support both legs (after-tax AND in-service Roth conversion)
- §415(c) calculation includes match and profit-sharing; verify available space
- Must convert promptly to avoid taxable earnings

## REFERENCES
- IRS Notice 2014-54 — basic blessing of the strategy
- IRC §415(c) — overall cap
- IRC §402A — Roth 401(k) treatment
- IRC §72(e) — basis tracking

## PLAN OUTPUT TEMPLATE

> **Add mega-backdoor Roth contributions.** Beyond maxed deferrals, your plan supports after-tax contributions up to the §415(c) overall cap of $72,000 (or $80,000 with catch-up). Available after-tax capacity: approximately $${available_capacity}/year. Make the after-tax contribution; convert in-plan to Roth promptly to minimize taxable earnings. Annual Roth balance growth: ${capacity}/year at near-zero current tax cost; tax-free compounding for life.
