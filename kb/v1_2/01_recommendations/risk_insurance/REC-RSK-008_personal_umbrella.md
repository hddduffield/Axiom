# [REC-RSK-008] — Personal Umbrella Coverage Increase

## METADATA
- **ID:** REC-RSK-008
- **Status:** Active
- **Category:** Risk & Insurance
- **Engagement archetypes:** All HNW
- **Plan section placement:** "Recommendations — Personal Risk"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.5.total_net_worth > $5,000,000
  - FR.7.3.umbrella_amount < target (target = max(net_worth, $5M) at minimum)

DISQUALIFY if:
  - Existing coverage already at appropriate level relative to net worth
```

### Natural-language explanation
Personal umbrella liability extends above auto, homeowner, and similar primary liability coverages. For HNW clients, $1M-$2M umbrellas are wholly inadequate; lawsuits regularly demand far more. Floor recommendation: equal to or greater than net worth, with additional cushion for income earnings power.

### Hard disqualifiers
- Net worth fully captured in protected entities (FLP, business interests, retirement) — but practically, every client has personal assets at risk
- Carrier non-renewal pending

## WHAT IT IS
Personal umbrella liability coverage that sits above auto, homeowner, watercraft, ATV, etc. primary liability. Covers personal liability claims (auto accidents, property liability, defamation) above primary policy limits. Generally inexpensive per million of coverage.

## WHY WE RECOMMEND IT
HNW clients are litigation targets. A $5M judgment against an inadequately-covered HNW client comes out of personal assets — including the operating business, investment accounts, real estate. Adequate umbrella coverage shifts that risk to the carrier at modest premium.

## VARIATIONS
- **Standard umbrella:** $1M-$10M, common floor
- **Excess umbrella:** beyond $10M, layered coverage from specialty carriers (Chubb, AIG, Pure)
- **Umbrella with UM/UIM:** uninsured/underinsured motorist within umbrella — fills auto-coverage gaps

## QUANTIFIED IMPACT FRAMEWORK

### Components
- Maximum single-event coverage limit
- Defense costs (typically outside policy limits)
- Excess UM/UIM (if elected)

### Worked example
Net worth $25M; current umbrella $1M:
- Recommended coverage: $25M minimum, $50M defensible target
- Premium: ~$2K-$5K/year for $5M; ~$8K-$15K/year for $25M; specialty carrier for >$10M
- On a $20M judgment with $1M umbrella, $19M comes from personal assets including business equity
- With $25M umbrella, judgment fully covered; assets protected

## IMPLEMENTATION STEPS
1. Audit current primary policies (auto, homeowner, watercraft) — confirm meeting umbrella's underlying requirement (often $300K-$500K liability minimum)
2. Quote umbrella at multiple levels (often $5M, $10M, $25M+)
3. For coverage above $10M, engage specialty carrier
4. Confirm policy includes UM/UIM where appropriate
5. Annual review with net worth growth

## SEQUENCING DEPENDENCIES
- **COORDINATED WITH:** REC-RSK-009 (valued articles), REC-RSK-010 (auto/home liability limits)
- **COORDINATED WITH:** REC-RSK-018 (D&O for board service)

## DOCUMENTATION CHECKLIST
- [ ] Primary policy liability limits at or above carrier's umbrella minimum
- [ ] Umbrella policy issued at appropriate level
- [ ] Coverage limit annually reviewed against net worth growth

## COMMON MISTAKES
- Underlying primary policies have lower-than-required liability limits → umbrella excludes
- Failing to scale umbrella with growth (the $5M umbrella from 5 years ago is now inadequate)
- Excluding watercraft, ATV, rental property from umbrella scope
- Forgetting to add UM/UIM coverage for inadequate other-driver insurance

## COORDINATION NOTES
- **PSA Wealth:** confirms recommendation; refers to client's P&C broker for execution
- **P&C broker:** primary specialist; PSA does not place P&C
- **CPA / Attorney:** none typically

## CLIENT CONVERSATION FRAMING
> "Your current umbrella is ${current}M. Your net worth is closer to ${net_worth}M. A serious lawsuit can easily exceed your current limit; the difference comes out of your operating business, investment accounts, and real estate. Increasing the umbrella to ${target}M costs about ${premium}/year — minor money for a major risk shift. Your P&C broker handles the placement; we'll review the result."

## CAVEATS & DISQUALIFIERS
- Doesn't cover business liability (separate D&O, GL, professional E&O)
- Defense-cost coverage varies by policy
- Some carriers exclude certain activities (rental properties, watercraft over a size, etc.)

## REFERENCES
- Carrier underwriting guidelines (varies)
- ISO standard umbrella policy forms

## PLAN OUTPUT TEMPLATE

> **Increase personal umbrella to $${target}M.** Your net worth (~${net_worth}M) is materially above your current umbrella coverage (${current}M). For HNW clients, the floor is at least the value of personal assets exposed in a lawsuit, with a defensible target equal to or above net worth. Premium for ${target}M is approximately ${premium}/year. Coordinate with your P&C broker; PSA does not place P&C directly.
