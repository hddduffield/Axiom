# [REC-EST-011] — Qualified Personal Residence Trust (QPRT)

## METADATA
- **ID:** REC-EST-011
- **Status:** Active-Cautioned
- **Category:** Estate
- **Engagement archetypes:** All HNW with high-value residence
- **Last verified:** April 2026

---

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.5.3.primary_residence_value > 2_000_000 (or material secondary residence)
  - FR.estate_exceeds_exemption == True
  - Donor in good health (mortality during term ruins benefit)
  - Donor willing to pay rent to children's trusts post-term
  - Higher §7520 rate environment (favors QPRT vs. lower-rate environment which doesn't)

DISQUALIFY if:
  - Mortality risk during term unacceptable
  - Donor unwilling to commit to long-term residence (move during term complicates)
  - Donor unwilling to pay rent post-term
```

### Natural-language explanation
Transfer personal residence to a Qualified Personal Residence Trust for term of years. Donor retains right to live in residence rent-free during term; at term end, residence passes to children. Gift value calculated using §7520 rate; higher §7520 = lower gift = better.

### Hard disqualifiers
- Donor dies during term — full residence value in estate
- Donor moves out — QPRT terminates with adverse consequences

---

## WHAT IT IS

A QPRT is a trust under IRC §2702(a)(3)(A) where the grantor transfers a personal residence (primary or secondary) and retains the right to live there for a fixed term. At term end, residence passes to remainder beneficiaries (typically children's trusts). Gift value at funding = residence value minus value of retained term (calculated via §7520 mortality + rate tables).

After term end, donor must pay fair-market rent to live in residence (or move out). Rent paid to children's trusts is additional wealth transfer outside estate.

---

## WHY WE RECOMMEND IT

In higher §7520 environments (like current 5%), the retained term is valued substantially, reducing the gift to remainder. Combined with strong appreciation expectation on residence, residence transfer at relatively low gift-tax cost.

For Holloway-style with $1.6M Big Canoe lake house: 12-year QPRT might transfer $1.6M residence at gift value of $400K (uses $400K of exemption). Future appreciation outside estate.

---

## QUANTIFIED IMPACT FRAMEWORK

### Worked example
- Residence value: $1.6M
- Term: 12 years
- §7520 rate: 5.0%
- Donor age 50
- Retained term value (from §7520 tables): ~$1.2M (75% of value)
- Gift value: $1.6M - $1.2M = $400K (uses lifetime exemption)
- After 12 years, residence appreciates to $2.5M+
- Future estate-tax avoidance: $2.1M ($2.5M - $400K already gifted) × 40% = **$840K of estate tax avoided**
- Plus: rent paid post-term is additional gift outside estate (no exemption used; flows to children's trusts as rental income)

### Range parameters
- `residence_value` = FR.5.3.primary_residence_value
- `term_years` = 8-15 typical (longer = lower gift but higher mortality risk)
- `s7520_rate` = current rate (higher favors QPRT)
- `donor_age` = drives mortality calc

---

## IMPLEMENTATION STEPS

1. Estate attorney drafts QPRT with proper §2702 qualifications.
2. Appraisal of residence at funding.
3. Transfer deed to QPRT (retitled to trust).
4. Form 709 reports gift of remainder interest.
5. During term: donor lives in residence rent-free; pays property tax, insurance, normal maintenance.
6. At term end: residence transfers to remainder; donor either moves or begins paying FMV rent.
7. Lease agreement at term end documenting market rent.

---

## SEQUENCING DEPENDENCIES
- Independent of business restructuring
- Coordinated WITH REC-EST-005 (Children's Trusts as remainder)

---

## DOCUMENTATION CHECKLIST
- [ ] QPRT trust document
- [ ] Appraisal at funding
- [ ] Deed transfer
- [ ] Form 709 with gift calculation
- [ ] Annual property records
- [ ] Term-end lease agreement (FMV rent)
- [ ] Continuing rent payments post-term

---

## COMMON MISTAKES & AUDIT TRIGGERS
- **Mortality during term** — full residence value in estate
- **Failure to pay rent post-term** — IRS attacks residence as still in donor's estate
- **Below-FMV rent** — additional gift, but enforcement-attractive
- **Move during term** — QPRT mechanics fail
- **Mortgage on property** — complicates QPRT structure; payments by donor on mortgage become additional gifts

---

## COORDINATION NOTES

### PSA Wealth role
Coordinates timing. Tracks term and post-term rent payments.

### CPA role
Form 709 at funding. Rent income tracking post-term.

### Attorney role
QPRT drafting. Specialist counsel.

### Appraiser
Residence valuation at funding and post-term.

---

## CLIENT CONVERSATION FRAMING

> "Qualified Personal Residence Trust on the Big Canoe lake house. We transfer the property to a 12-year QPRT — you continue to live there rent-free during the term, then either move or pay fair-market rent to the children's trusts. The gift value (using current §7520 of 5.0%) is roughly $400K of your lifetime exemption, but the residence appreciates outside your estate after the term. Net estate-tax savings on a 25-year horizon: roughly $800K."

---

## CAVEATS & DISQUALIFIERS
- **Mortality during term ruinous** — donor dies in year 8 of 12-year term, full residence value in estate
- **Post-term rent obligation** — donor must commit to either moving or paying FMV rent
- **§7520 rate sensitivity** — higher rate favors QPRT; lower disfavors
- **Mortgage complications** — coordinate with attorney

---

## REFERENCES
- **IRC §2702(a)(3)(A)** — QPRT exception to §2702 zero-valuation
- **Treas. Reg. §25.2702-5** — QPRT requirements
- **§7520** — hurdle rate

---

## PLAN OUTPUT TEMPLATE

> **Qualified Personal Residence Trust on {residence_descriptor}.** Transfer the {residence_descriptor} (current value ${residence_value_M}M) to a {term}-year QPRT. You continue to live there rent-free during the term; at term end, the residence belongs to the children's trusts. The gift value at current §7520 of {s7520}% is approximately ${gift_value_K}K of your lifetime exemption. Net estate-tax savings: approximately ${tax_savings_K}K.

**Variables:**
- `{residence_descriptor}` = derived from FR.5.3 (e.g., "Big Canoe lake house")
- `{residence_value_M}` = value in millions
- `{term}` = 8-15 typical
- `{s7520}` / `{gift_value_K}` / `{tax_savings_K}` = computed
