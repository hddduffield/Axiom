# [REC-CHR-003] — Charitable Remainder Unitrust (CRUT)

## METADATA
- **ID:** REC-CHR-003
- **Status:** Advanced
- **Category:** Charitable
- **Engagement archetypes:** All HNW with charitable intent + income desire
- **Plan section placement:** "Recommendations — Charitable Planning"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - Highly appreciated asset (real estate, stock, business interest)
  - Owner wants income stream during lifetime AND charitable remainder
  - Long horizon (lifetime or term-of-years)
  - High AGI making deduction valuable

DISQUALIFY if:
  - Asset insufficiently appreciated to justify CRUT complexity
  - Owner cannot accept locked-in irrevocable structure
  - Income stream sub-optimal for needs
```

### Natural-language explanation
A CRUT (Charitable Remainder Unitrust) is an irrevocable trust that pays a fixed % of trust value (annually revalued) to non-charitable beneficiary (typically donor) for life or term, with remainder to charity. Sale of contributed asset by trust generates no immediate gain to donor; donor receives partial charitable deduction; trust pays out unitrust amount.

### Hard disqualifiers
- Asset already sold
- Cannot meet 10% remainder requirement

## WHAT IT IS
Irrevocable trust:
- Donor contributes appreciated asset; receives partial charitable deduction at funding
- Trust sells the asset (no gain to donor since trust is exempt from income tax under §664)
- Trust pays unitrust amount (fixed %, typically 5-7%) to non-charitable beneficiary annually, recomputed on annual valuation
- Term: lifetime, or 20-year max term-of-years
- At end of term, remaining corpus passes to charity (must be ≥10% of contribution)

## WHY WE RECOMMEND IT
- Sells appreciated asset without immediate gain (deferred via the CRUT structure; income stream taxable as it's received, but spread over decades)
- Income stream during lifetime
- Charitable deduction at funding (PV of charitable remainder)
- Charitable impact at end of term

## VARIATIONS
- **Standard CRUT:** unitrust amount paid annually
- **NIMCRUT (Net Income with Makeup):** pays lesser of fixed % or trust income; "makeup" provision tracks shortfall — useful for assets that don't generate income initially (raw real estate)
- **NICRUT (Net Income):** pays lesser; no makeup
- **FLIP CRUT:** starts as NIMCRUT; "flips" to standard CRUT on triggering event (typically sale of contributed asset) — common for funding with illiquid asset

## QUANTIFIED IMPACT FRAMEWORK

### Components
- Charitable deduction at funding (PV of remainder; affected by §7520 rate)
- Income stream during term (taxable to recipient per 4-tier rules)
- Capital gains tax deferred (paid out as part of income stream over time)
- Charitable impact at term end

### Worked example
$5M of appreciated stock contributed to FLIP CRUT, donor age 60, 5% unitrust:
- Charitable deduction at funding (PV of charitable remainder, depends on §7520 rate ~5%): ~$1.0M-$1.5M
- Year 1 income: $5M × 5% = $250K (taxable per 4-tier rules)
- Trust grows over 25-year horizon (donor's life expectancy)
- Total income to donor over life: roughly $5M-$8M depending on returns
- Charity receives remainder at death: roughly $5M-$10M

## IMPLEMENTATION STEPS
1. Specialist counsel for CRUT drafting (technical)
2. Asset appraisal (qualified appraiser if non-marketable)
3. Trust document execution
4. Asset transfer to trust
5. Trust sells asset (no immediate gain)
6. Annual unitrust calculation and payment
7. Annual K-1 to donor reflecting 4-tier income characterization
8. Annual Form 5227 (charitable trust return)

## SEQUENCING DEPENDENCIES
- **COORDINATED WITH:** REC-CHR-002 (pre-transaction gifting — alternative path)
- **MUST come BEFORE:** binding sale of contributed asset

## DOCUMENTATION CHECKLIST
- [ ] CRUT trust document
- [ ] Qualified appraisal
- [ ] Form 8283 (filed with personal return for funding year)
- [ ] Form 5227 annually
- [ ] K-1 to recipient annually
- [ ] §7520 rate documented for deduction calculation

## COMMON MISTAKES
- Funding past binding sale (anticipatory assignment of income to donor)
- Failing 10% remainder requirement (deduction lost)
- §664 violations (UBTI; private benefit; debt-financed assets)
- Improper §7520 rate use

## COORDINATION NOTES
- **PSA Wealth:** strategy
- **CPA:** Form 5227, K-1, AGI limits
- **Attorney:** specialist CRT counsel
- **Trustee:** typically institutional or specialist

## CLIENT CONVERSATION FRAMING
> "A CRUT lets you sell an appreciated asset without immediate tax, take a partial charitable deduction now, receive income for life, and benefit charity at the end. At your age, contributing $${crt_funding} to a 5% CRUT generates approximately $${deduction} of immediate deduction, $${annual_income} of annual income for life, and $${remainder} of charitable impact. Specialist counsel for drafting; institutional trustee for administration."

## CAVEATS & DISQUALIFIERS
- Irrevocable; donor cannot reverse
- Specialist counsel mandatory
- §7520 rate sensitivity
- 4-tier income characterization complex
- 10% remainder requirement strict

## REFERENCES
- IRC §664 — charitable remainder trust
- Treas. Reg. §1.664-3 — CRUT requirements
- IRC §170(b)(1)(A) — deduction limits
- §7520 rate (volatile rates lookup)

## PLAN OUTPUT TEMPLATE

> **Establish a Charitable Remainder Unitrust.** Contribute $${crt_funding} of {asset_type} to a {percent}% CRUT. Federal charitable deduction at funding: $${deduction} (PV of remainder at current §7520 rate of {7520_rate}%). Annual income stream: starts at $${first_year_income}, recomputed annually on trust value. At end of term, remaining corpus passes to charity. Specialist counsel drafts; institutional trustee administers. {If FLIP variant: "Use FLIP CRUT structure to handle illiquid contributed asset."}
