# [REC-RSK-002] — Redemption-Based Buy/Sell

## METADATA
- **ID:** REC-RSK-002
- **Status:** Active-Cautioned
- **Category:** Risk & Insurance
- **Engagement archetypes:** Pre-Exit, Active-No-Exit (specific cases)
- **Plan section placement:** "Recommendations — Business" → "Buy/Sell & Continuity"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.has_business == True
  - FR.3.2.owner_count >= 2
  - Cross-purchase structure determined inappropriate (one owner uninsurable; substantial age/value asymmetry making cross-purchase premiums unworkable; or owner preference)
  - Entity has the cash flow to fund premiums at the corporate level

DISQUALIFY if:
  - C-Corp without §101(j) notice-and-consent properly executed (would taxify death benefit)
  - Closely-held S-Corp where AAA mechanics make redemption messy
```

### Natural-language explanation
The corporation owns life-insurance policies on each owner; on death, the corporation receives the proceeds and uses them to redeem (buy back) the deceased's interest. Surviving owners' percentages increase proportionally without out-of-pocket cost.

### Hard disqualifiers
- §101(j) compliance not feasible
- Owners cannot agree the entity should hold the policies
- C-Corp AMT exposure on cash-value life insurance growth (legacy concern)

## WHAT IT IS
Same buy/sell function as cross-purchase (REC-RSK-001) but the corporation is the policyholder, premium-payer, and beneficiary. On a triggering event, the corporation uses the death proceeds to redeem the deceased's interest from the estate. Surviving owners do not receive funds; their ownership grows proportionally.

## WHY WE RECOMMEND IT (when triggered)
- Simpler administration — one set of policies owned by entity, not n × (n-1) policies
- Avoids cross-purchase premium asymmetry when one owner is much older or holds much larger %
- Single source of premium payment (entity cash flow vs. owner personal funds)
- Avoids transfer-for-value risk that can arise when cross-purchase ownership changes mid-stream

The trade-offs vs. cross-purchase: surviving owners do NOT get basis step-up in the redeemed interest (a real cost at future sale); §101(j) compliance is mandatory; possible AMT issues for C-Corps holding cash-value life.

## VARIATIONS
- **Hybrid (Wait-and-See):** agreement allows election between redemption and cross-purchase at the triggering event — flexibility but execution complexity
- **Stock redemption under §303:** allows post-death redemption to pay estate tax/admin without dividend treatment when business is >35% of adjusted gross estate

## QUANTIFIED IMPACT FRAMEWORK

### Components
- Same buyout liquidity to deceased's family as cross-purchase
- LOST: basis step-up to surviving owners — meaningful at future sale
- Premium predictability and entity-level deductibility considerations (premiums NOT deductible regardless of owner)

### Worked example
2-owner S-Corp, 50/50 split, $20M value, both owners age 50.
- Entity buys $10M policy on each owner, pays ~$120K-$180K combined premium
- On Owner A's death: entity receives $10M, redeems Owner A's 50% interest from estate at $10M
- Owner B now owns 100%, basis unchanged
- Compare cross-purchase: Owner B's basis would have stepped up by $10M, saving $2.0M+ at future $20M+ sale at 23.8% LTCG

The basis step-up loss is the explicit cost of redemption structure — worth it only when cross-purchase is unworkable.

## IMPLEMENTATION STEPS
1. Buy/sell agreement drafted/updated with redemption mechanics
2. **§101(j) notice-and-consent** signed by every employee/owner being insured BEFORE policy issuance — non-negotiable
3. Entity obtains policies, pays premiums from operating account
4. Annual valuation update; coverage scaled with growth
5. Annual §101(j) certification on Form 8925 with corporate return

## SEQUENCING DEPENDENCIES
- **MUTUALLY EXCLUSIVE WITH:** REC-RSK-001 (cross-purchase) — pick one
- **COORDINATED WITH:** REC-ENT-004 (operating agreement reflects redemption mechanics)

## DOCUMENTATION CHECKLIST
- [ ] Updated buy/sell with redemption mechanics
- [ ] §101(j) notice-and-consent signed by each insured PRE-issuance
- [ ] Form 8925 filed annually with corporate return
- [ ] Policy ownership/beneficiary correctly entity
- [ ] Operating agreement reflects redemption mechanics

## COMMON MISTAKES & AUDIT TRIGGERS
- §101(j) failure: notice-and-consent missed → death proceeds become taxable income to corporation
- Form 8925 omitted → audit-bait for §101(j) inquiry
- Policy ownership transferred between related entities → transfer-for-value risk
- Stale valuation in agreement
- Failing to coordinate redemption with §302/§303 to avoid dividend treatment

## COORDINATION NOTES
- **PSA Wealth:** product selection, premium administration, §101(j) workflow
- **CPA:** §101(j) compliance, Form 8925 filing, §302/§303 modeling
- **Attorney:** buy/sell drafting, §101(j) consents, operating agreement coordination

## CLIENT CONVERSATION FRAMING
> "We're using a redemption structure rather than cross-purchase because {reason — typically: insurability gap, premium asymmetry, or admin complexity at owner count}. The mechanics are simpler — the company owns the insurance and uses it to buy out a deceased owner's family. The cost is real: surviving owners don't get the basis step-up they'd get under cross-purchase. We're comfortable with that trade-off here because {specific reason}."

## CAVEATS & DISQUALIFIERS
- Always verify §101(j) compliance before issuing
- Re-evaluate annually if cross-purchase becomes feasible
- Watch for owner % changes that would have implications for proportional buy-back

## REFERENCES
- IRC §101(j) — employer-owned life insurance taxability
- IRC §302 — redemptions treated as exchanges
- IRC §303 — post-death redemptions for estate tax
- Form 8925 — annual EOLI reporting
- Rev. Rul. 92-105 — redemption-style buy/sell

## PLAN OUTPUT TEMPLATE

> **Update the buy/sell as a redemption structure.** Given {specific reason — e.g., insurability gap, premium asymmetry}, a redemption-funded structure works better here than cross-purchase. {Entity_name} owns life-insurance policies on each owner sized to fund the buyout at agreed valuation. On a death event, the entity uses the proceeds to redeem the deceased's interest; surviving owners' ownership percentages grow proportionally.
>
> **Critical compliance — §101(j).** Each insured must sign written notice-and-consent BEFORE policy issuance, and Form 8925 must be filed annually with the corporate return. Without this, the death benefit becomes taxable income to the company.
>
> **Trade-off acknowledged.** This structure does NOT give surviving owners the basis step-up they'd get under cross-purchase. We've quantified that trade-off at approximately ${stepup_value} of forgone future tax benefit; given the structural reasons above, we accept it.
