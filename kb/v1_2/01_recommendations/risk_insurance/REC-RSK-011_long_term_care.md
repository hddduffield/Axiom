# [REC-RSK-011] — Long-Term Care Insurance

## METADATA
- **ID:** REC-RSK-011
- **Status:** Active
- **Category:** Risk & Insurance
- **Engagement archetypes:** Owners 50+ or aging-parent context
- **Plan section placement:** "Recommendations — Personal Risk" → "Long-Term Care"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.2.1.age >= 50 OR FR.2.2.age >= 50
  - No existing LTC coverage
  - Net worth between $2M-$15M (above this range, self-funding may be appropriate; below, Medicaid-planning conversation)
  - Healthy enough to qualify (LTC underwriting becomes restrictive after 65)

DISQUALIFY if:
  - Already self-funding (high liquid net worth, comfort with pay-as-you-go)
  - Uninsurable (LTC underwriting strict)
  - Existing hybrid LTC life policy (REC-RSK-012) provides coverage
```

### Natural-language explanation
Long-term care costs are substantial ($120K-$200K/year for skilled care; $60K-$80K for assisted living) and not covered by Medicare. For mid-affluent clients ($2M-$15M net worth), a long care event without insurance can deplete assets meaningfully. Standalone LTC insurance has gotten harder and more expensive; hybrid LTC life (REC-RSK-012) is increasingly preferred.

### Hard disqualifiers
- Family history of dementia or relevant chronic disease that prevents underwriting
- Already in care or with active diagnoses
- Net worth materially above $15M (self-fund) or below $2M (Medicaid framework)

## WHAT IT IS
Standalone LTC insurance: pays a daily or monthly benefit if insured cannot perform 2+ Activities of Daily Living (bathing, dressing, eating, toileting, transferring, continence) or has cognitive impairment. Benefit period typically 3-5 years; lifetime benefits hard to find now. Inflation rider essential.

## WHY WE RECOMMEND IT (when triggered)
Even moderate care events ($150K/year × 3 years = $450K) can compromise the portfolio's ability to support spouse's lifetime spending. LTC insurance shifts this risk to the carrier at premium that's typically modest relative to coverage.

## VARIATIONS
- **Standalone LTC:** dedicated coverage, "use it or lose it" if no claim; premiums no longer guaranteed (carriers have repriced repeatedly)
- **Hybrid LTC Life (REC-RSK-012):** life insurance with LTC rider; if no LTC needed, death benefit pays heirs; preferred structure now
- **Asset-based LTC:** lump-sum funded; smaller insurance industry; some niche carriers
- **Continuing Care Retirement Community entrance fees:** community-level coverage; different financial structure

## QUANTIFIED IMPACT FRAMEWORK

### Components
- Daily/monthly benefit during qualified care
- Inflation protection (typically 3-5% compound)
- Benefit period (3-5 years standard)
- Elimination period (90 days standard)

### Worked example
Both spouses age 55, healthy. Standalone LTC, $250/day benefit ($7,500/month), 5-year benefit period, 3% compound inflation, 90-day elimination:
- Joint annual premium: ~$5K-$10K (highly variable by carrier and state)
- At age 80, monthly benefit = $7,500 × 1.03^25 = ~$15,700/month
- 5 years × $15,700/mo × 12 = ~$942K of total covered care if needed in late life
- Premiums paid over 25 years: ~$125K-$250K cumulative

## IMPLEMENTATION STEPS
1. Underwriting feasibility check before quote
2. Compare carriers (smaller market; key carriers Mutual of Omaha, MassMutual, Northwestern, etc.)
3. Compare standalone vs. hybrid LTC life
4. Choose benefit, period, and inflation rider settings
5. Lock in coverage before age 60 (premium and qualification both deteriorate after)

## SEQUENCING DEPENDENCIES
- **COORDINATED WITH:** REC-FAM-005 (aging parent LTC modeling)
- **MUTUALLY EXCLUSIVE WITH:** REC-RSK-012 (hybrid LTC life) — pick one, not both

## DOCUMENTATION CHECKLIST
- [ ] Underwriting completed
- [ ] Policy issued
- [ ] Inflation rider confirmed
- [ ] Annual premium payment scheduled
- [ ] Family member(s) aware of coverage and how to claim

## COMMON MISTAKES
- Waiting too long to apply (after 60, premium and qualification harder)
- No inflation rider — coverage erodes meaningfully over decades
- Choosing 2-year benefit period to save premium — most claims under 2 years but catastrophic claims aren't
- Forgetting to update beneficiary contact for claim handling

## COORDINATION NOTES
- **PSA Wealth:** product analysis, underwriting, annual administration
- **CPA:** verify LTC premium deduction (limited; based on age-banded HSA-style limits)
- **Attorney:** none typically

## CLIENT CONVERSATION FRAMING
> "If you need extended care later in life — say 3 years in assisted living or skilled nursing — current costs are roughly $150K-$200K per year. With inflation, that's $300K-$400K/year by your 80s. Without insurance, that comes from your portfolio at the worst time. LTC insurance shifts most of this to the carrier. Standalone LTC: ~${standalone_premium}/year. Hybrid LTC life: ${hybrid_premium}/year, with a death benefit if no claim. We typically recommend hybrid these days."

## CAVEATS & DISQUALIFIERS
- Standalone LTC market has shrunk; hybrid is increasingly the firm's recommendation
- Premium increases on standalone LTC have been substantial historically; not guaranteed level
- LTC premiums partially deductible based on age (small benefit; not a primary driver)

## REFERENCES
- IRC §7702B — qualified LTC insurance treatment
- IRC §213(d)(1)(C) — LTC services as medical
- IRC §7702B(a)(1) — favorable income tax treatment of qualified LTC

## PLAN OUTPUT TEMPLATE

> **Add long-term care coverage.** Without coverage, an extended care event could draw $300K-$500K+ from the portfolio at exactly the wrong time. We recommend {standalone | hybrid_LTC_life — typically hybrid in current market}. {If hybrid: see REC-RSK-012}. Annual premium approximately ${premium}. Lock in now while you are qualifiable; underwriting tightens substantially after 60.
