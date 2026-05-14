# [REC-RSK-014] — Section 79 Group Term Carve-Out

## METADATA
- **ID:** REC-RSK-014
- **Status:** Active
- **Category:** Risk & Insurance / Executive Benefits
- **Engagement archetypes:** Pre-Exit, Active-No-Exit
- **Plan section placement:** "Recommendations — Business" → "Executive Benefits"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.has_business == True
  - Group term life plan in place OR being established
  - Owner-employees actively participating
  - Desire to provide tax-favored life insurance benefit at owner level
  - REC-EST-004 (ILIT) for cleanest implementation
```

### Natural-language explanation
A §79 plan provides employer-paid group term life insurance. The first $50K of coverage per employee is tax-free; coverage above $50K creates "imputed income" (Table I cost). A "carve-out" structure provides separate executive-class coverage to owners and key employees beyond the basic group plan, often with permanent insurance benefits.

### Hard disqualifiers
- No group term plan in place and unwilling to establish
- Owners not on company payroll
- Discriminatory plan design that fails §79 requirements

## WHAT IT IS
Two-tier structure:
- **Tier 1:** Standard group term life for all eligible employees (basic coverage)
- **Tier 2:** Carve-out for owners/executives — typically permanent insurance (whole life or UL) provided as a §79 benefit, with imputed-income tax to executive based on Table I (much lower than actual premium for HNW)

## WHY WE RECOMMEND IT (selectively)
For owner-clients in profitable businesses, §79 carve-outs can fund permanent life insurance with corporate dollars (deductible to business) at favorable individual tax cost (Table I imputed income). Critical: must satisfy §79 nondiscrimination rules to preserve favorable treatment.

## VARIATIONS
- **Pure §79:** all employees eligible at same terms (rarely used; not particularly tax-advantaged)
- **§79 Plan with Loan Regime Carve-Out:** advanced structure layering split-dollar mechanics (REC-RSK-015)
- **Discriminatory §79 (the carve-out):** different coverage tiers; owner gets permanent coverage; non-owner employees get less or different coverage; passes §79 only if structured carefully

## QUANTIFIED IMPACT FRAMEWORK

### Components
- Business deduction for premium (full)
- Owner imputed income (Table I cost — substantially lower than actual premium for older insureds)
- Tax arbitrage: business deduction at corporate rate; owner taxation at low Table I rate

### Worked example
Owner age 55, $1M policy face:
- Annual permanent insurance premium: ~$25K
- Table I imputed income for $1M: ~$8K
- Business deducts $25K (saves ~$5,250 at 21% C-Corp or flows through pass-through entity)
- Owner adds $8K to W-2 — taxed at ~37% = ~$2,960
- Net economic effect: $25K of permanent coverage premium for ~$2,960 personal tax cost (with business absorbing the rest as deductible benefit)

## IMPLEMENTATION STEPS
1. Establish §79 plan documentation
2. Determine eligibility classes (must satisfy §79 nondiscrimination)
3. Issue policies; carve-out for executive class includes permanent insurance feature
4. Annual W-2 reporting of imputed income
5. Annual nondiscrimination testing

## SEQUENCING DEPENDENCIES
- **COORDINATED WITH:** REC-EST-004 (ILIT — for estate-tax benefit if ownership transfer post-issuance)
- **COORDINATED WITH:** REC-RSK-015 (split-dollar — alternative structure)

## DOCUMENTATION CHECKLIST
- [ ] §79 plan document
- [ ] Nondiscrimination test
- [ ] Annual W-2 imputed income reporting
- [ ] Policy ownership and beneficiary documented

## COMMON MISTAKES
- §79 nondiscrimination failures — flunked plan loses favorable treatment
- Inadvertent §79 disqualification through ownership transfer
- Failure to report imputed income on W-2
- Misunderstanding Table I (much lower than commercial term rates)

## COORDINATION NOTES
- **PSA Wealth:** structuring, product selection, annual administration
- **CPA:** Table I calculation, W-2 reporting, nondiscrimination testing
- **Attorney:** §79 plan document; consider with overall executive comp design

## CLIENT CONVERSATION FRAMING
> "A §79 carve-out lets your business pay for permanent life insurance on you and key executives as a deductible business expense. You report Table I imputed income personally — much lower than the actual premium. The arbitrage is meaningful for owner-clients in your bracket. Annual administrative complexity is real but manageable."

## CAVEATS & DISQUALIFIERS
- §79 nondiscrimination rules limit how favorably owners can be treated relative to employees
- Permanent coverage structures inside §79 require careful design
- Some carriers don't actively support §79 carve-out; choose with specialist support

## REFERENCES
- IRC §79 — group term life exclusion
- Treas. Reg. §1.79-0 et seq.
- IRS Notice 89-110 — §79 imputed income tables (Table I)

## PLAN OUTPUT TEMPLATE

> **Add §79 group term carve-out for executive coverage.** Structure permanent insurance on {owner_name and key executives} as a §79 benefit. The business deducts the premium; you report Table I imputed income (substantially less than actual premium). At your age and target coverage of $${face}M, business deducts ~${premium}/year; you report imputed income of ~${table_i_imputed}, generating personal tax cost of ~${personal_tax}. Net: meaningful arbitrage for permanent coverage funded with business dollars.
