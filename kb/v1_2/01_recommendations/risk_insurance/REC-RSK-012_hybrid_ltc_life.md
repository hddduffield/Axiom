# [REC-RSK-012] — Hybrid LTC Life Insurance (Asset-Based LTC)

## METADATA
- **ID:** REC-RSK-012
- **Status:** Active
- **Category:** Risk & Insurance
- **Engagement archetypes:** Owners 50+
- **Plan section placement:** "Recommendations — Personal Risk" → "Long-Term Care"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.2.1.age >= 50 OR FR.2.2.age >= 50
  - LTC need triggered (REC-RSK-011)
  - Standalone LTC unavailable, expensive, or rejected by client
  - Healthy enough to qualify

DISQUALIFY if:
  - Already standalone-LTC-insured
  - Uninsurable
```

### Natural-language explanation
Hybrid LTC life is a permanent life insurance policy with an LTC rider. The death benefit can be accelerated to pay LTC expenses; if no LTC claim, heirs receive death benefit. Eliminates the "use it or lose it" objection of standalone LTC.

### Hard disqualifiers
- Uninsurable for life or LTC underwriting
- Existing standalone LTC duplicates need

## WHAT IT IS
Permanent life insurance (typically whole life or guaranteed UL) with an LTC acceleration rider. Mechanics:
- Premium funds policy (single-pay, 10-pay, or lifetime)
- Death benefit grows
- If LTC need triggers (2+ ADLs or cognitive impairment), monthly LTC benefit drawn against death benefit
- If no LTC claim, full death benefit to heirs
- Some products have separate LTC pool that doesn't deplete death benefit

## WHY WE RECOMMEND IT
Solves the standalone LTC objections: premiums recoverable as death benefit if unused; underwriting may be more lenient than dedicated LTC; carrier solvency typically stronger (life insurers).

## VARIATIONS
- **Single-premium hybrid:** lump-sum at issue; typical $100K-$500K
- **10-pay hybrid:** premium for 10 years
- **Lifetime-pay hybrid:** ongoing premium for life
- **LTC pool separate from death benefit:** preserves both (more expensive)
- **LTC rider that accelerates death benefit:** uses death benefit for LTC (cheaper)

## QUANTIFIED IMPACT FRAMEWORK

### Components
- LTC benefit pool (typically 2-3× death benefit on better products)
- Death benefit retained if no LTC need
- Cash value buildup (small but present)

### Worked example (Holloway-style aging parent context, single-pay hybrid)
Client age 55, single $100K premium:
- Death benefit: ~$200K-$300K
- LTC benefit pool: ~$400K-$700K (2-3× DB on top products)
- Monthly LTC benefit: ~$6K-$10K
- If no claim: full death benefit to heirs at death
- If claim: LTC pool drawn, remainder (if any) to heirs

## IMPLEMENTATION STEPS
1. Compare standalone LTC vs hybrid by total cost over time
2. Choose premium structure (single-pay vs multi-year)
3. Underwriting: typically requires both life and LTC qualifying
4. Issue policy; coordinate with overall life insurance plan (may stack with ILIT-owned coverage)
5. Annual policy statement review

## SEQUENCING DEPENDENCIES
- **MUTUALLY EXCLUSIVE WITH:** REC-RSK-011 (standalone LTC)
- **COORDINATED WITH:** overall life insurance plan

## DOCUMENTATION CHECKLIST
- [ ] Coverage comparison documented (standalone vs hybrid)
- [ ] Underwriting completed for both life and LTC
- [ ] Policy issued
- [ ] Beneficiary designations verified
- [ ] Family informed of LTC trigger mechanics

## COMMON MISTAKES
- Believing LTC pool is in addition to death benefit when it's an acceleration of it (read the policy carefully)
- Buying without inflation rider on LTC component
- Funding from wrong source for tax efficiency

## COORDINATION NOTES
- **PSA Wealth:** product comparison, underwriting, annual review
- **CPA:** confirm tax treatment of premium and LTC benefit
- **Attorney:** rare unless ownership structuring

## CLIENT CONVERSATION FRAMING
> "Hybrid LTC life solves the 'what if I never need it' objection that pushes people away from standalone LTC. You fund a life-insurance policy; if you need long-term care, you accelerate the death benefit to pay for it; if you don't, your heirs get the full death benefit. Premium can be single-payment or spread over 10 years. For your age and health, $${premium} of single-pay funds approximately $${ltc_pool} of LTC coverage and $${death_benefit} of death benefit if unused."

## CAVEATS & DISQUALIFIERS
- Acceleration of death benefit reduces what heirs receive
- "Pool of LTC benefits separate from death benefit" products are more expensive but cleaner
- Inflation riders on hybrid LTC vary by product
- Shop multiple carriers; product structures vary

## REFERENCES
- IRC §7702B — qualified LTC
- IRC §101(g) — accelerated death benefits
- Pension Protection Act of 2006 — tax treatment of hybrid LTC

## PLAN OUTPUT TEMPLATE

> **Use hybrid LTC life for long-term care funding.** Rather than standalone LTC (which has gotten harder and more expensive, with no benefit if unused), a hybrid policy combines life insurance with an LTC acceleration rider. ${premium_structure} of premium funds approximately $${ltc_pool} of LTC benefit pool and $${death_benefit} of death benefit. If you never need LTC, the death benefit goes to your heirs. If you do, the policy accelerates to pay covered care. Underwriting handled through PSA's MassMutual relationship; competitive carrier alternatives also evaluated.
