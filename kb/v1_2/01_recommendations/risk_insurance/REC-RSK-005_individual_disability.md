# [REC-RSK-005] — Maximum-Issue Individual Disability Insurance on Owners

## METADATA
- **ID:** REC-RSK-005
- **Status:** Active
- **Category:** Risk & Insurance
- **Engagement archetypes:** Pre-Exit, Active-No-Exit, Pre-Liquidity-Founder
- **Plan section placement:** "Recommendations — Personal Risk"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.has_business == True
  - Owner is actively involved in business operations (not passive)
  - FR.7.2.has_individual_di == False OR coverage materially below 60% income replacement
  - Owner is insurable (DI underwriting more stringent than life)
  - Owner age <= 60 (DI coverage limited above 60)

DISQUALIFY if:
  - Owner is fully passive (no income at risk)
  - Owner has substantial liquid wealth such that DI is moot (>$25M liquid AND no consumption gap)
```

### Natural-language explanation
The probability of disability before age 65 is multiple times the probability of death. Group LTD (typically 60% of base, capped at low monthly maximums) is materially insufficient for HNW owners whose income is largely K-1 or large W-2. Individual DI fills the gap with own-occupation, non-cancelable coverage at appropriate monthly benefit levels.

### Hard disqualifiers
- Uninsurable due to medical history (DI is harder to qualify for than life)
- Income structure makes DI underwriting impractical (heavy K-1 with little W-2)

## WHAT IT IS
Personally-owned, non-cancelable individual disability insurance. Pays a monthly benefit if insured cannot perform their own occupation due to injury or sickness. Benefit period typically to age 65 or 67. Own-occupation definition for the entire benefit period (not just 24 months) is the gold standard.

## WHY WE RECOMMEND IT
Disability is far more common than death during working years. For owner-clients, group LTD is materially inadequate (often $10K-$25K/month max; HNW clients are spending well above that). Individual DI fills the gap. Maximum-issue programs let HNW owners access $30K-$50K+/month benefits with own-occupation language.

## VARIATIONS
- **Standard individual DI:** monthly benefit, own-occ, to age 65/67; non-cancelable rates
- **Maximum issue programs:** for HNW owners, multi-life programs through MassMutual or similar carriers; $30K-$50K+/month benefit; own-occ; portable
- **Catastrophic supplement:** above standard issue limits, additional layer triggered by inability to perform 2+ ADLs
- **Buy/sell DI:** coordinates with REC-RSK-005-related buyout funding (if disability triggers buyout under buy/sell agreement)

## QUANTIFIED IMPACT FRAMEWORK

### Components
- Monthly income replacement during disability
- Difference between adequate coverage and group LTD shortfall

### Worked example
Owner-client age 45, current household spend $400K/year, group LTD covers $20K/month ($240K/year, much of which would be taxable since employer-paid):
- Coverage gap: ~$160K-$200K/year
- Individual DI: $25K/month own-occ to age 67
- Premium: ~$15K-$25K/year (depends on health, occupation class, riders)
- Coverage is tax-free if premiums paid post-tax (personal — yes if structured properly)

## IMPLEMENTATION STEPS
1. Audit current group LTD: monthly cap, own-occ vs any-occ definition, 24-month vs full-period own-occ, taxability
2. Identify gap to current spending and projected spending
3. Underwriting: medical exam, income documentation, occupation classification
4. Product selection — typically MassMutual through PSA's existing relationship; ensure own-occ to age 65 or 67
5. Coordinate with buy/sell disability trigger if applicable
6. Premium-payment coordination — pay personally so benefits are tax-free
7. Annual review with income changes

## SEQUENCING DEPENDENCIES
- **COORDINATED WITH:** REC-RSK-006 (BOE — different need, both important)
- **COORDINATED WITH:** REC-RSK-001/002/003 (buy/sell disability triggers)

## DOCUMENTATION CHECKLIST
- [ ] Coverage gap analysis documented
- [ ] Underwriting completed; policy issued
- [ ] Premium payment from personal account (for tax-free benefit)
- [ ] Annual review of income and coverage

## COMMON MISTAKES
- Buying any-occ rather than own-occ — defeats the purpose for specialists/professionals
- Letting employer pay premium → benefit is taxable
- 24-month own-occ then transitioning to any-occ — common in cheaper products
- Failure to update coverage as income grows

## COORDINATION NOTES
- **PSA Wealth:** product selection, underwriting coordination, annual review
- **CPA:** confirm tax-free status of benefit (premium payment source matters)
- **Attorney:** none unless disability triggers buy/sell

## CLIENT CONVERSATION FRAMING
> "Statistically, you're more likely to be unable to work for an extended period than to die before retirement. Your group LTD covers you to about ${group_max}/month — much of which is taxable since the company pays the premium. Your actual monthly spending is closer to ${actual_spending}. Individual disability fills the gap with own-occupation coverage that pays you ${monthly_benefit}/month if you can't do your specific job, tax-free. Premium is around ${annual_premium}/year. This is one of those decisions you make once and forget about until you need it."

## CAVEATS & DISQUALIFIERS
- DI premiums are not deductible (personal coverage); paying personally preserves tax-free benefit
- Underwriting is more stringent than life — health issues that wouldn't affect life insurance can affect DI
- Coverage limits drop substantially after age 60

## REFERENCES
- IRC §104(a)(3) — DI benefits tax-free if premiums paid post-tax
- IRC §105(b) — employer-paid DI taxability rules
- HIPAA pre-existing condition rules (limited application)

## PLAN OUTPUT TEMPLATE

> **Add maximum-issue individual disability coverage.** Your current group LTD covers approximately ${group_monthly}/month, much of which would be taxable. Your actual income replacement need is closer to ${target_monthly}/month. We recommend an own-occupation, non-cancelable individual DI policy with $${policy_monthly}/month benefit to age {65 or 67}, with premium paid personally to keep benefits tax-free. Annual premium approximately ${annual_premium}/year. This is in addition to (not in replacement of) group coverage; the two layers stack.
