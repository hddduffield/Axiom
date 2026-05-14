# [REC-CHR-001] — Donor-Advised Fund (DAF)

## METADATA
- **ID:** REC-CHR-001
- **Status:** Active
- **Category:** Charitable
- **Engagement archetypes:** All with charitable intent
- **Plan section placement:** "Recommendations — Charitable Planning"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.13.1.has_goal_charitable == True OR client makes regular charitable gifts
  - Owner in 32%+ federal bracket (DAF benefit material)
  - Lump-sum charitable capacity desired (timing flexibility)

DISQUALIFY if:
  - Charitable intent is single-event, single-charity (direct gift simpler)
  - Below 24% bracket (deduction less impactful)
```

### Natural-language explanation
A DAF is a charitable account at a sponsoring organization (Fidelity Charitable, Schwab Charitable, NPT, community foundation). Donor contributes; gets deduction in contribution year; recommends grants to charities over time. Useful for: lump-sum deduction in high-income year (transaction year), donating appreciated securities, ongoing charitable strategy without admin burden.

### Hard disqualifiers
- All charitable giving structured for single annual recipient

## WHAT IT IS
A 501(c)(3) public charity sponsor holds the DAF; donor has advisory privileges over investments and grants but no legal control. Contributions are completed gifts at deposit; deductible at FMV (for cash and appreciated securities held >1 year). Sponsor administers grant distribution to charities as recommended.

## WHY WE RECOMMEND IT
- Bunching deductions: contribute multiple years' worth in a high-income year (transaction year), deduct now, grant over time
- Appreciated securities: fund DAF with appreciated stock — full FMV deduction (subject to 30% AGI limit), NO capital gain to donor
- Simplifies multi-charity giving (one tax document)
- Grandparent / next-gen engagement (advisory roles teach next-gen)

## VARIATIONS
- **Commercial DAF:** Fidelity, Schwab, Vanguard Charitable; low minimum, low fees, broad grant flexibility
- **Community foundation DAF:** local impact focus; higher fees but local engagement
- **Mission-aligned DAF:** values-screened or impact investing options

## QUANTIFIED IMPACT FRAMEWORK

### Components
- Federal tax deduction × marginal rate
- State tax deduction (varies)
- Avoided capital gains tax on appreciated securities
- Tax-free internal investment growth
- Eventual grant distribution to charities

### Worked example
$500K of appreciated stock (basis $100K) contributed to DAF in transaction year:
- Federal deduction: $500K × 37% = $185K saved (subject to 30% AGI limit; carryforward 5 years)
- Capital gains avoided: $400K gain × 23.8% = $95K saved
- Combined federal benefit: $280K
- Charity receives: $500K (vs. ~$405K if owner sold first and gifted cash)
- Marginal benefit: $95K (the avoided cap gain) — pure efficiency

## IMPLEMENTATION STEPS
1. Choose sponsor (commercial DAF most common)
2. Open DAF account; appoint advisors and successors
3. Fund (cash, appreciated securities, complex assets via specialized DAFs)
4. Investment selection (sponsor-provided menu)
5. Grant recommendations as desired
6. Annual review

## SEQUENCING DEPENDENCIES
- **COORDINATED WITH:** REC-CHR-002 (pre-transaction charitable gifting), REC-INV-007 (loss harvesting integration)

## DOCUMENTATION CHECKLIST
- [ ] DAF sponsor selected
- [ ] Account established with advisors and successors
- [ ] Funding documentation (Form 8283 for non-cash contributions over $500)
- [ ] Qualified appraisal for non-cash contributions over $5K (single asset / aggregate)
- [ ] Annual giving log

## COMMON MISTAKES
- Funding with cash when appreciated securities available (loses the cap gain efficiency)
- Form 8283 omission for non-cash gifts
- Failing to capture qualified appraisal for >$5K non-cash gifts
- Granting to non-501(c)(3) recipients (DAF can't grant to private benefit, individuals, certain pledges)

## COORDINATION NOTES
- **PSA Wealth:** strategy and ongoing
- **CPA:** Form 8283; AGI limit tracking; carryforward
- **Sponsor:** account administration

## CLIENT CONVERSATION FRAMING
> "A donor-advised fund is the workhorse of charitable planning. Especially in a transaction year, you contribute appreciated stock or cash, take the full deduction now, and grant to charities over the years following. Funding with appreciated stock is highly efficient — full FMV deduction, no capital gain. For your transaction year, contributing $${daf_amount} to a DAF saves approximately $${combined_savings} in federal tax."

## CAVEATS & DISQUALIFIERS
- AGI deduction limits (60% cash, 30% appreciated securities to public charity)
- Carryforward 5 years
- DAF "irrevocable" once contributed; donor has only advisory privileges
- Some pledges and personal benefits cannot be satisfied via DAF grants

## REFERENCES
- IRC §170 — charitable deduction
- IRC §170(b)(1)(C) — 30% AGI limit
- IRC §170(f)(8) — substantiation
- Form 8283 — non-cash charitable contribution
- Pension Protection Act of 2006 — DAF regulations

## PLAN OUTPUT TEMPLATE

> **Step 6 — Donor-Advised Fund and eventual private foundation.** Establish a DAF in {start_year} for current-year giving (target ${target_low}K–${target_high}K/year). The DAF becomes the primary giving vehicle through the transaction window. {if has_foundation_intent: "Post-liquidity, fund a private family foundation with the children involved — meeting {spouse_first_name}'s specific goal of using philanthropy as a values-formation mechanism for the kids."} Sponsor: {Fidelity Charitable | Schwab Charitable | community foundation}. Family advisory structure includes you and {spouse_first_name} as primary advisors, the children as successors.

**Variables:**
- `{start_year}` = current tax year
- `{target_low}/{target_high}` = $50–$100 typical for HNW pre-transaction (Holloway values)
- `{spouse_first_name}` = parsed from FR.2.2
- `{has_foundation_intent}` = TRUE if FR.13.3.hard_constraints or FR.13.1 mention private/family foundation
- Sponsor selection: defer to firm-policy default (Tier 3 open item)

### Holloway-section reference for depth target

Holloway plan, Estate Planning Step 6 — specifies:
1. Sequencing: "Establish a DAF in 2026 for current-year giving"
2. Funding target: "$50K–$100K/year"
3. Role: "primary giving vehicle through the transaction window"
4. Post-liquidity transition to family foundation
5. Values framing: "values-formation mechanism for the kids" — Catherine's goal

Original template had the structure but lacked the sequencing-through-transaction-window framing, the post-liquidity foundation transition, and the values-formation language.
