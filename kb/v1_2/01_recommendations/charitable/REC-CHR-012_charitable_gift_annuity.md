# [REC-CHR-012] — Charitable Gift Annuity (CGA)

## METADATA
- **ID:** REC-CHR-012
- **Status:** Active-Cautioned
- **Category:** Charitable
- **Engagement archetypes:** Older clients with charitable + income need
- **Plan section placement:** "Recommendations — Charitable Planning"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - Older donor (typically 65+; older = better rates)
  - Charitable intent + need for guaranteed lifetime income
  - Smaller scale than CRT (typical $25K-$500K per CGA)
  - Charity offers CGA program

DISQUALIFY if:
  - CRT scale appropriate
  - Donor too young (rates unfavorable)
```

### Natural-language explanation
A CGA is a contract between donor and charity: donor gives cash/securities; charity pays donor (and possibly spouse) a fixed annuity for life; remainder belongs to charity. American Council on Gift Annuities (ACGA) publishes recommended rates by age. Simpler than CRT; smaller scale; partial charitable deduction.

### Hard disqualifiers
- CRT structure preferable
- Charity not in CGA business

## WHAT IT IS
Contract: donor gives charity asset; charity pays donor fixed annuity for life. Charity assumes mortality risk. Annuity rate based on donor age (ACGA tables; older = higher).

Tax treatment:
- Partial charitable deduction (PV of charitable remainder)
- Annuity payments: partly tax-free return of principal, partly ordinary income, partly capital gain (if appreciated asset contributed)
- At donor's death: charity keeps remainder

## WHY WE RECOMMEND IT (when triggered)
For older donors at smaller scale ($25K-$500K), CGA is simpler than CRT and provides guaranteed income. Rates favorable at older ages.

## QUANTIFIED IMPACT FRAMEWORK

### Components
- Annuity rate × principal = annual payment
- Charitable deduction (PV of remainder)
- Income tax efficiency on annuity payments

### Worked example
75-year-old donor, $100K to CGA at ACGA-recommended rate (~6.7% for age 75 in current rates):
- Annual annuity: $6,700 for life
- Charitable deduction at funding: ~$40K (varies by §7520)
- Annuity tax treatment: ~$3K tax-free return of principal annually for life expectancy years

## IMPLEMENTATION STEPS
1. Identify charity offering CGA at ACGA rates
2. Determine funding amount
3. Sign CGA contract
4. Charity issues annuity payments
5. Annual 1099-R reporting

## SEQUENCING DEPENDENCIES
- **COORDINATED WITH:** REC-CHR-013 (QCD — different mechanism for older donors)

## DOCUMENTATION CHECKLIST
- [ ] CGA contract
- [ ] Funding documented
- [ ] Annual annuity payments tracked
- [ ] 1099-R received

## COMMON MISTAKES
- Funding too young — rates unfavorable
- Confusing CGA with commercial annuity (different vehicle, different protection)

## COORDINATION NOTES
- **PSA Wealth:** evaluation
- **CPA:** annuity tax treatment
- **Charity:** primary administrator

## CLIENT CONVERSATION FRAMING
> "CGA — gift to charity in exchange for lifetime fixed annuity. At age {age}, charity pays approximately {rate}% per year for life. Smaller scale than CRT, simpler. Useful for {use_case}."

## CAVEATS & DISQUALIFIERS
- Charity solvency matters (long-tail commitment)
- Rates revised periodically by ACGA
- Less flexibility than CRT

## REFERENCES
- IRC §501(m) — CGA exemption (maintains charity tax-exempt status)
- IRC §72 — annuity taxation
- American Council on Gift Annuities recommended rates

## PLAN OUTPUT TEMPLATE

> **Charitable Gift Annuity.** $${cga_funding} to {charity_name}'s CGA program at ACGA-recommended rate of {rate}% for age {age}. Annual annuity: $${annuity}. Charitable deduction at funding: ~$${deduction}. Annuity payments partly tax-free for life expectancy.
