# [REC-TAX-004] — Family-Employed Children with Custodial Roths

## METADATA
- **ID:** REC-TAX-004
- **Status:** Active-Cautioned (heavy documentation requirements; audit-prone)
- **Category:** Tax / Retirement / Family
- **Engagement archetypes:** Pre-Exit, Active-No-Exit
- **Plan section placement:** "Tax Strategy → 3A. Implement This Year"
- **Last verified:** April 2026

---

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.has_business == True
  - FR.has_minor_children == True OR (FR.2.3.children[].age between 14 and 22 with no current employment)
  - FR.is_high_income == True (parents in high tax bracket)
  - Legitimate age-appropriate work exists for the children at the business

DISQUALIFY if:
  - Children are too young for any legitimate work (typically <12; varies by state child-labor law)
  - Business is one where minor children cannot legally work (heavy machinery, etc.)
  - Family will not document the work rigorously (audit-prone strategy)
```

### Natural-language explanation
Employ the children at defensible W-2 rates for legitimate work. Open custodial Roth IRAs and contribute their earned income (up to $7,500 in 2026). Wages are deductible at the business level and tax-free at the child's level (under standard deduction). Lifetime Roth compounding produces extraordinary value.

### Hard disqualifiers
- Family unwilling to document work performed (this is the most-audited strategy in the playbook)
- Operating S-Corp without family-management LLC structure (FICA is owed on S-Corp wages to children — see Variations)
- State child-labor restrictions prohibit the work

---

## WHAT IT IS

Employ the children at defensible W-2 rates for legitimate work — file organization, social media management, basic facilities work, tech support, photography. Open custodial Roth IRAs at a discount broker (Schwab, Fidelity, Vanguard) and contribute the earned income up to the annual limit ($7,500 in 2026 + $1,100 catch-up at 50+, but children are minors so just $7,500). The wages are deductible at the business level and effectively tax-free at the child's level (under the $16,100 standard deduction in 2026).

---

## WHY WE RECOMMEND IT

It is one of the only ways to fund tax-free retirement savings for minor children using business deductions. Compounded over 50+ years, $7,500/year from age 14 to 18 grows to extraordinary amounts.

**The math:** $7,500/year × 5 years (ages 14-18) = $37,500 of contributions. Compounded at 7% to age 75 (57 years from age 18): grows to approximately **$1.9 million per child**, all tax-free in retirement.

For the parents: $7,500 wage × marginal rate (~37% federal + 5.19% GA) = ~$3,170/year in business-level tax savings per child.

For the child: $7,500 wage is well below the $16,100 standard deduction, so the child owes $0 federal income tax on the earned income. The Roth contribution is post-tax (no deduction at child's level — they have no tax to offset anyway), and all future qualified withdrawals are tax-free.

The business deducts the wage at parent's marginal rate; the child receives the wage tax-free; the Roth grows tax-free; qualified distributions are tax-free. **Triple-tax-free** at the child's level.

This also models work and money for the children, which most HNW families value for non-financial reasons.

---

## VARIATIONS AND STRUCTURAL OPTIONS

### Variation A — Wages from family management LLC (FICA-exempt)
Best practice for S-Corp operating businesses. Wages from an LLC taxed as partnership (where parents are the only owners) to children under 18 are FICA-exempt under IRC §3121(b)(3)(A). The family LLC can be a separate entity that contracts with the operating S-Corp.

**Pros:** No FICA on wages to children under 18; no FUTA. Deduction flows through to parents at marginal rate.

**Cons:** Adds entity complexity; LLC must have a real business purpose (typically management services to operating entity).

**When to use:** Default for Holloway-scale clients with an S-Corp operating business and an LLC umbrella.

### Variation B — Wages directly from operating S-Corp (FICA owed)
Simpler structure but children's wages are FICA-subject. Less optimal but still beneficial when net of FICA the math works.

**When to use:** When complexity of family-management LLC isn't justified for small total wages.

### Variation C — Wages from operating sole proprietorship or partnership where both parents are partners
FICA-exempt for children under 18. Rare in PSA's lane (most clients are S-Corps or LLCs taxed as S-Corps).

### Variation D — Multi-year programs with role progression
Structured progression: at 12, photography for marketing; at 14, social media; at 16, file organization; at 18, summer office work. Each role documented and age-appropriate.

---

## QUANTIFIED IMPACT FRAMEWORK

### Worked numerical example
**Holloway scenario:** James (16), Sophie (12). Each child performs legitimate work for the family management LLC.

**Per child per year:**
- W-2 wage: $7,500 (matched to Roth contribution capacity)
- Business deduction at parents' marginal rate: $7,500 × 42% combined = **$3,150 tax savings to parents**
- Child federal tax: **$0** (under $16,100 standard deduction)
- Child Roth IRA contribution: $7,500
- FICA cost (if family LLC structure): **$0** (under-18 exemption)
- FICA cost (if S-Corp wages): $7,500 × 15.3% = $1,148 (still net positive)

**Compounded growth (50 years at 7%):**
- $7,500 contribution at age 14 grows to ~$220,000 by age 64
- 4 years of contributions ($30,000 total) grows to ~$880,000
- Tax-free in retirement

**Across two children over 5 years:** $75,000 of contributions, ~$1.8M+ of compounded tax-free wealth in retirement.

### Range parameters
- `child_wage_per_year` = lesser of $7,500 (Roth limit) or fair-market wage for documented work
- `business_deduction_value` = wage × parents' combined federal+state marginal rate
- `compounded_value_at_65` = wage × ((1.07)^(65-current_age))

---

## IMPLEMENTATION STEPS

1. **Document each child's role.** Job description, hours, tasks, deliverables. Per child, per year.
2. **Set defensible wage rate.** Federal/state minimum wage compliance. Comparable to what an unrelated person would charge for the work.
3. **Process through payroll** like any other employee. W-2 issued. Federal/state withholding (typically minimal due to standard deduction).
4. **Open custodial Roth IRA** at discount broker. Parent acts as custodian until child reaches majority (age 18 or 21 depending on state — Georgia: age 21 under UTMA).
5. **Fund the Roth** with the wages (or equivalent — child's actual paycheck can go to a savings account; parent gifts $7,500 to Roth from family funds). The IRS cares about the earned-income existence, not whether the Roth contribution is literally those dollars.
6. **Coordinate with CPA on annual filing.** Child files own return if income exceeds threshold (typically only for kiddie-tax-purposes if there's also unearned income).
7. **Repeat annually** with documented work.

---

## SEQUENCING DEPENDENCIES

- **Best implemented AFTER:** REC-TAX-003 (Spouse on Payroll) — establishes clean family-business administrative pattern
- **Coordinated WITH:** REC-FAM-003 (Custodial Roth IRA via Family Employment) — same recommendation viewed from family side
- **Coordinated WITH:** REC-FAM-001 (529 Plan Funding) — both children-funding strategies; complementary

---

## DOCUMENTATION CHECKLIST (CRITICAL — THIS IS THE MOST AUDITED RECOMMENDATION)

- [ ] Per-child job description with role, tasks, hours, deliverables
- [ ] Time logs (or equivalent — emails, photos of work product, deliverable artifacts)
- [ ] Wage rationale (defensible against industry minimum wage and comparable role)
- [ ] Payroll records (W-2, withholding, etc.)
- [ ] Custodial Roth IRA account documentation
- [ ] Annual contribution records matching earned income
- [ ] Child's annual tax return if filing required
- [ ] Family-management LLC operating agreement (if Variation A used)

**The IRS pursues this strategy actively when documentation is weak.** The firm's house position: never recommend without committing to the documentation discipline.

---

## COMMON MISTAKES & AUDIT TRIGGERS

- **No documentation** — by far the most common attack point. Audit-bait.
- **Wages exceeding fair market value** — paying a 12-year-old $7,500 for "social media work" requires the work to actually exist
- **Wages from S-Corp without considering FICA** — Variation B works but reduces benefit
- **Failure to actually do the work** — paper position
- **Wages used directly for the child's expenses** — okay but optics matter; Roth contribution from family funds (with wages going to a separate account) is cleaner
- **Treating child as 1099 contractor** — generally NOT acceptable; child is a W-2 employee
- **Below-minimum-wage pay** — child-labor law violations; pay at or above minimum

---

## COORDINATION NOTES

### PSA Wealth role
- Frames the strategy. Provides documentation framework. Tracks Roth IRA setup. Coordinates with CPA on annual filing.
- **Critical:** PSA's job is to ensure the family commits to documentation discipline. Without that, the strategy should not be recommended.

### CPA role
- Confirms entity structure for FICA optimization. Files payroll. Files child's return if needed.

### Attorney role
- Drafts family management LLC operating agreement if Variation A used.

---

## CLIENT CONVERSATION FRAMING

> "{Child1_first_name} ({age}) and {Child2_first_name} ({age}) can both perform legitimate work for the business — file organization, social media, basic facilities work — at defensible W-2 rates. Combined with custodial Roth IRAs, you fund $14,000–$15,000/year of tax-advantaged retirement savings for them, deductible at the business level, with the wages essentially tax-free at their level (under the standard deduction). Compounded for 50 years, that becomes around $4M of tax-free retirement assets per child. The catch is documentation — the work must be real, the records must be kept, and we need to commit to that discipline because the IRS audits this aggressively. We'll provide the framework."

---

## CAVEATS & DISQUALIFIERS

- **Child-labor law compliance:** state and federal restrictions on hours and tasks for minors. Verify per state. **Georgia child-labor restrictions [VERIFY 2026 — confirm current rules for ages 14–17].**
- **Documentation must be real, not paper:** if family won't commit, don't recommend
- **FICA for S-Corp variant:** wages from S-Corp to under-18 children ARE FICA-subject (no exemption). Family-management LLC variant gets the exemption.
- **Kiddie tax doesn't apply to earned income** — this is a clean exception
- **State income tax:** Georgia conforms; verify in other states

---

## REFERENCES

- **IRC §3121(b)(3)(A)** — FICA exemption for minor children of sole prop / partnership / family LLC (NOT S-Corp)
- **IRC §219** — Roth/IRA earned-income requirement
- **IRC §401(c)** — earned income definition
- **Reg. §31.3121(b)(3)-1** — family employment FICA rules
- **Federal Fair Labor Standards Act (FLSA)** — child-labor restrictions
- **Georgia child-labor regulations** [VERIFY 2026]

---

## PLAN OUTPUT TEMPLATE

> **Employ the children where age-appropriate.** {Child_listing} can {all/each} perform legitimate work for the business — file organization, social media, basic facilities work — at defensible W-2 rates. Combined with custodial Roth IRAs, you fund ${total_annual_capacity}/year of tax-advantaged retirement savings for them, deductible at the business level, with the wages essentially tax-free at their level (under the standard deduction). This requires careful documentation; we will provide the framework.

**Variables:**
- `{child_listing}` = parsed list of eligible children from FR.2.3.children[]
- `{total_annual_capacity}` = sum of $7,500 (or current Roth limit) per eligible child
