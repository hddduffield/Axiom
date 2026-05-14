# [REC-RSK-007] — Key Person Life Insurance

## METADATA
- **ID:** REC-RSK-007
- **Status:** Active
- **Category:** Risk & Insurance
- **Engagement archetypes:** Pre-Exit, Active-No-Exit
- **Plan section placement:** "Recommendations — Business" → "Risk & Continuity"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.has_business == True
  - Identifiable key employee whose loss would materially harm enterprise value (typically: top operations leader, top sales producer, or owner if owner is heavily operational)
  - FR.7.4.has_key_person == False OR coverage materially below replacement-cost estimate
  - Key person is insurable

DISQUALIFY if:
  - No identifiable key person beyond owners (already covered by buy/sell)
  - Business large enough that no individual is "key" (rare in PSA's lane)
```

### Natural-language explanation
Beyond owner buy/sell coverage, businesses often have one or more non-owner key employees whose loss would create a real revenue or operational gap. Key person insurance is owned by the business on the key employee's life; the business is beneficiary. On death, the business uses proceeds to fund recruitment, transition, lost revenue, or temporarily replacement compensation.

### Hard disqualifiers
- Key person uninsurable
- Replacement cost vague/unquantifiable

## WHAT IT IS
Business-owned life insurance on a key non-owner employee. Business is policyholder, premium-payer, and beneficiary. Insured employee receives no benefit (must be informed and consent under §101(j)). On death, business receives tax-free proceeds (assuming §101(j) compliance).

## WHY WE RECOMMEND IT
The death of a key employee — top engineer, top salesperson, key operations leader — can disrupt revenue or operations for 12-36 months. Replacement candidates may demand premium compensation. Key person insurance covers the financial impact.

## QUANTIFIED IMPACT FRAMEWORK

### Components
- Replacement search and signing costs
- Lost revenue during transition (often 6-18 months at 20-50% impact)
- Premium for new hire to bridge gap
- Loss of customer relationships managed by key person

### Worked example
Owner-operator construction business; top project manager generates $5M of annual revenue, 25% margin = $1.25M of contribution. Replacement: 12-month gap at 50% impact = $625K of lost contribution; recruitment cost ~$50K; signing premium for replacement ~$100K. Total impact: ~$775K.

Recommendation: $1M term policy on key person, business-owned. Annual premium ~$1.5K-$3K (term). On death, $1M cushions transition.

## IMPLEMENTATION STEPS
1. Identify key person(s); quantify replacement-cost economic impact
2. **§101(j) notice-and-consent signed** by key employee BEFORE policy issuance
3. Underwrite key person; obtain coverage
4. Annual review — key persons change as business evolves
5. Consider portability if key person becomes owner (transitions to buy/sell)

## SEQUENCING DEPENDENCIES
- **COORDINATED WITH:** REC-RSK-001/2/3 (buy/sell on owners)

## DOCUMENTATION CHECKLIST
- [ ] Key person identification memo
- [ ] §101(j) notice-and-consent signed pre-issuance — non-negotiable
- [ ] Policy issued; business owner and beneficiary
- [ ] Form 8925 filed annually (employer-owned life insurance reporting)

## COMMON MISTAKES
- §101(j) failure (notice-and-consent missed) → death proceeds become taxable to business
- Form 8925 omission → audit-bait
- Failing to update as key persons change
- Confusing key person life with owner buy/sell

## COORDINATION NOTES
- **PSA Wealth:** key person identification, coverage sizing, §101(j) workflow
- **CPA:** Form 8925 annual filing
- **Attorney:** §101(j) consent template; rare otherwise

## CLIENT CONVERSATION FRAMING
> "Beyond your buy/sell, there are people in {business_name} whose loss would create a real revenue gap — {key_person_role(s)}. If you lost them, you'd spend 12-18 months recruiting, training, and rebuilding relationships, and you'd lose revenue along the way. Key person life on each of them is small premium money — about ${annual_premium}/year — and gives you a clean financial cushion if the worst happens."

## CAVEATS & DISQUALIFIERS
- §101(j) compliance is mandatory; without it, the strategy is destroyed
- Key person changes; coverage should reflect current bench
- For very-key persons, consider also stay-bonus arrangements (REC-SUC-002)

## REFERENCES
- IRC §101(j) — employer-owned life insurance
- IRC §101(a) — death benefit tax-free if §101(j) satisfied
- Form 8925 — annual EOLI reporting

## PLAN OUTPUT TEMPLATE

> **Add key person coverage on {key_person_role}.** {Key_person_name}'s loss would materially impact {specific_business_function}; estimated 12-18 month transition impact ~${impact}. We recommend $${face}M term coverage owned by {entity_name}, with §101(j) notice-and-consent executed before issuance and Form 8925 filed annually. Approximate annual premium: ${annual_premium}.
