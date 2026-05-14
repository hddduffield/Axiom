# [REC-EST-003] — Annual Exclusion Gifting Program

## METADATA
- **ID:** REC-EST-003
- **Status:** Active
- **Category:** Estate
- **Engagement archetypes:** All
- **Plan section placement:** "Estate Planning → Step 2 — Annual Exclusion Gifts"
- **Last verified:** April 2026 (annual exclusion at $19,000 confirmed for 2026)

---

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.estate_exceeds_exemption == True OR
  - FR.has_high_net_worth == True (gifting establishes architecture even before exemption-exceeding)
  - Donees identified (children, grandchildren, parents from FR.2.3 / FR.2.4)
  - FR.9.2.annual_exclusion_gifts_last_3y indicates "None systematic" OR no program
```

### Natural-language explanation
Establish systematic annual gifting using $19,000/donor/donee exclusion (2026). For a couple, $38,000/donee/year. Across multiple donees over 20+ years, removes substantial value from estate without using lifetime exemption.

### Hard disqualifiers
- No identified donees (rare)
- Donor cannot afford the gifting from cash flow

---

## WHAT IT IS

Annual gifts within the §2503(b) annual exclusion ($19,000 per donor per donee for 2026; gift-splitting between spouses doubles to $38,000 per donee). Gifts can be cash, securities, or contributions to Crummey-noticed irrevocable trusts.

Direct payments for tuition or medical care under §2503(e) are unlimited and don't count against annual exclusion.

---

## WHY WE RECOMMEND IT

The simplest, most consistent estate-reduction tool. Every $38K gifted is removed from taxable estate. Compounds over 20+ years across multiple donees.

For Holloway-style: 4 donees (3 children + Marcus's mother) × $38K/year = $152K/year × 20 years = $3.04M of estate removal + compound growth on gifted assets outside estate.

---

## QUANTIFIED IMPACT FRAMEWORK

### Worked example
- Donees: 3 children, 1 parent = 4 donees
- Annual capacity: $19K × 2 spouses × 4 donees = **$152K/year**
- Over 20 years: **$3.04M of estate removal** (without using exemption)
- Plus compound growth on gifted assets outside estate (assumes 7% return): cumulative value transferred ~$6.6M
- Federal estate tax saved at 40%: $3.04M × 40% = **$1.22M of avoided estate tax** (just on gifts; ignoring growth)
- Including growth outside estate: ~$2.6M+ of estate tax avoided

### Range parameters
- `donee_count` = parsed from FR.2.3 + FR.2.4 + spouse if relevant
- `annual_capacity` = $19K × 2 (couples) × donee_count
- `years_of_program` = years to anticipated estate event

---

## IMPLEMENTATION STEPS

1. Identify donees (per-individual gift caps applied per donee).
2. Determine gifting vehicles: direct cash, custodial accounts (UTMA/UGMA — limited; transfers at 21 in Georgia), Crummey-noticed irrevocable trusts (preferred for HNW).
3. **Calendar gifts annually** — typically January, capturing full year of exclusion immediately.
4. If gifting to trusts: coordinate Crummey notice mechanics (see `02_reference/09_crummey_mechanics.md`).
5. Track cumulative gifting per donee per year (avoid accidental excess).
6. CPA reports gifts on Form 709 if required (gift-splitting always requires Form 709).
7. Coordinate gifts of appreciated securities (basis carryover; donee receives donor's basis).

---

## SEQUENCING DEPENDENCIES

- **SEQUENCED WITH:** REC-EST-005 (Children's Trusts) when gifting to trusts — both in same plan
- **Coordinated WITH:** REC-EST-004 (ILIT) — premium funding via Crummey gifts
- **Independent of business restructuring**

---

## DOCUMENTATION CHECKLIST

- [ ] Annual gift schedule (donees, amounts, vehicles)
- [ ] Crummey notices (if gifting to trusts) with proof of receipt
- [ ] Bank/brokerage records of transfers
- [ ] Form 709 filings (CPA)
- [ ] Cumulative-gift tracking (per donee, per year)

---

## COMMON MISTAKES & AUDIT TRIGGERS

- **Failure to gift before December 31** — exclusion does not roll forward
- **Gift-splitting without Form 709** — election requires filing
- **Crummey notices missing or inadequate** — disqualifies the gift from present-interest treatment
- **Gifts above exclusion without Form 709** — required even if no tax due
- **Check timing** — gift complete when check clears, not when written; December checks must clear before year-end

---

## COORDINATION NOTES

### PSA Wealth role
- Coordinates the program. Calendars annual gifts. Tracks cumulative.

### CPA role
- Files Form 709. Reports gift-splitting.

### Attorney role
- Drafts trust language for Crummey-eligible gifts.

---

## CLIENT CONVERSATION FRAMING

> "Annual exclusion gifts to trusts for the children. Establish three irrevocable trusts (one per child), with Crummey provisions. Use the ${annual_capacity}K of combined annual exclusion capacity to fund them, beginning in {start_year}. Trustees other than parents (a corporate trustee or a sibling) maintain estate-tax exclusion. Trust terms restrict distributions for support, education, and health until age 35, with broader distribution standards thereafter."

---

## CAVEATS & DISQUALIFIERS

- **Present-interest requirement** — direct gifts to minors via UTMA/UGMA work but transfer at 21 in Georgia (often conflicts with hard constraint of "no unrestricted access before 35"); Crummey trusts preferred for HNW
- **Annual exclusion does not roll forward** — unused capacity is lost
- **Gift to non-citizen spouse** — limited to $194,000/year (2026)
- **Direct §2503(e) tuition/medical payments** — unlimited and separate from annual exclusion

---

## REFERENCES

- **IRC §2503(b)** — annual gift exclusion
- **IRC §2503(c)** — minor's trust
- **IRC §2503(e)** — direct tuition / medical payments
- **IRC §2513** — gift-splitting election
- **IRC §2514** — lapse of withdrawal power
- **Crummey v. Commissioner, 397 F.2d 82 (9th Cir. 1968)**

---

## PLAN OUTPUT TEMPLATE

> **Annual exclusion gifts to trusts for the children.** Establish {trust_count} irrevocable trusts ({per_child_or_pot}), with Crummey provisions. Use the ${annual_capacity_K}K of combined annual exclusion capacity to fund them, beginning in {start_year}. Trustees other than parents (a corporate trustee or a sibling) maintain estate-tax exclusion. Trust terms restrict distributions for support, education, and health until age {distribution_age}, with broader distribution standards thereafter.

**Variables:**
- `{trust_count}` = count of children (per-child) or 1 (pot trust)
- `{per_child_or_pot}` = "one per child" or "single pot trust" per firm-policy default [CONFIRM WITH WILL]
- `{annual_capacity_K}` = annual exclusion × 2 spouses × donee count, in thousands
- `{start_year}` = current year
- `{distribution_age}` = parsed from FR.13.3 hard constraints (typically 35)
