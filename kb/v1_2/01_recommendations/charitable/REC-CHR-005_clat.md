# [REC-CHR-005] — Charitable Lead Annuity Trust (CLAT)

## METADATA
- **ID:** REC-CHR-005
- **Status:** Advanced
- **Category:** Charitable / Estate
- **Engagement archetypes:** All HNW with multi-gen + charitable intent
- **Plan section placement:** "Recommendations — Charitable / Estate Planning"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - Donor in high estate-tax exposure territory
  - Charitable intent for next ~20 years
  - Wants to transfer remainder to family with reduced gift/estate tax
  - LOW §7520 environment favorable
  - Asset expected to outperform §7520 rate

DISQUALIFY if:
  - §7520 too high (rate kills strategy)
  - No charitable lead intent
  - Asset performance uncertain
```

### Natural-language explanation
The mirror image of a CRT: charity gets payments DURING the term, remainder goes to family at end. Properly structured (zeroed-out grantor CLAT), the gift tax at funding is near zero; if asset outperforms §7520 hurdle, family receives substantial remainder gift-tax-free.

### Hard disqualifiers
- §7520 environment unfavorable
- Asset can't realistically outperform §7520

## WHAT IT IS
Trust pays charity an annuity for term (10-20 years typical); at term end, remainder to family. "Zeroed out" structure: annuity sized so PV of charitable lead = full contribution, making gift tax = $0. Family receives anything that exceeds the §7520 hurdle on the contributed asset.

## WHY WE RECOMMEND IT (when triggered)
Like a GRAT but with charitable beneficiary during term. Lower §7520 rates favor CLAT (cheaper to "zero out"). Useful when donor has both charitable intent and family transfer goals.

## VARIATIONS
- **Grantor CLAT:** donor pays income tax on trust earnings (effectively additional gift to family); upfront income tax deduction
- **Non-grantor CLAT:** trust pays its own income tax (with charitable deduction); no upfront income deduction; less complex

## QUANTIFIED IMPACT FRAMEWORK

### Components
- Charitable annuity for term (deduction or non-grantor charitable deduction)
- Family remainder at term end (gift-tax-free if zeroed out and asset performs)
- §7520 hurdle critical

### Worked example
$5M to 20-year zeroed-out grantor CLAT at §7520 = 5%, charitable annuity = $400K/year:
- Gift tax at funding: $0 (zeroed out)
- Charity receives $8M total over 20 years ($400K × 20)
- If trust assets earn 8%: ending value ~$10M
- Family remainder: $10M, gift-tax-free
- If asset earns only 5% (matches §7520): family remainder = $0
- Strategy depends on asset outperformance

## IMPLEMENTATION STEPS
1. Specialist counsel for CLAT drafting
2. §7520 rate analysis (is current environment favorable?)
3. Asset selection (high expected return)
4. Trust document, annuity calculation
5. Annual charitable distribution
6. Annual administration (Form 5227 if grantor; Form 1041 if non-grantor)

## SEQUENCING DEPENDENCIES
- **COORDINATED WITH:** REC-EST-006 (GRAT — similar mechanic without charity)

## DOCUMENTATION CHECKLIST
- [ ] CLAT trust document
- [ ] §7520 rate at funding documented
- [ ] Annuity payment schedule
- [ ] Annual administration

## COMMON MISTAKES
- Funding when §7520 is high (defeats strategy)
- Asset selected without realistic outperformance expectation
- Grantor / non-grantor selection error

## COORDINATION NOTES
- **PSA Wealth:** strategy
- **CPA:** annual returns; income tax planning if grantor
- **Attorney:** specialist
- **Charity:** confirms acceptance of annuity

## CLIENT CONVERSATION FRAMING
> "A CLAT pays charity an annuity for {term} years; whatever's left then goes to {beneficiary} gift-tax-free. Properly sized, it's like a GRAT for the family with charitable lead. Best in low-§7520 environments. At current rates, modest favorability; specific asset choice critical."

## CAVEATS & DISQUALIFIERS
- §7520 sensitivity
- Asset outperformance critical
- 20-year duration; long commitment

## REFERENCES
- IRC §170(f)(2)(B) — charitable lead deduction
- IRC §2522(c)(2)(B) — gift tax deduction
- Rev. Rul. 2003-53 — CLAT mechanics

## PLAN OUTPUT TEMPLATE

> **Establish a CLAT.** Contribute $${clat_funding} to a {term}-year zeroed-out grantor Charitable Lead Annuity Trust. Annual charitable annuity: $${annuity} (sized to zero out gift tax at funding). At term end, remaining corpus passes to {beneficiaries} gift-tax-free. Effectiveness depends on asset outperforming current §7520 hurdle of {7520_rate}%; expected family remainder if asset earns 8%: $${expected_remainder}.
