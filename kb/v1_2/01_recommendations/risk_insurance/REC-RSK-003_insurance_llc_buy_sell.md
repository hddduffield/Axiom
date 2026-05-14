# [REC-RSK-003] — Insurance LLC / Partnership-Owned Buy/Sell

## METADATA
- **ID:** REC-RSK-003
- **Status:** Advanced
- **Category:** Risk & Insurance
- **Engagement archetypes:** Pre-Exit, Active-No-Exit (3+ owner businesses)
- **Plan section placement:** "Recommendations — Business" → "Buy/Sell & Continuity"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.has_business == True
  - FR.3.2.owner_count >= 3 (often 4+)
  - Cross-purchase impractical due to policy count (n × (n-1))
  - Redemption inappropriate due to basis-step-up loss

DISQUALIFY if:
  - Owner count is 2 (use cross-purchase)
  - Owners cannot agree to fund a separate entity
```

### Natural-language explanation
A separate LLC (the "Insurance LLC") is formed and owned by the same individuals as the operating company, in proportions matching their operating-company ownership. The Insurance LLC owns the life-insurance policies on each owner. On a death event, the Insurance LLC receives the proceeds and distributes them to surviving members, who then purchase the deceased's interest in the operating company. This bridges the gap: cross-purchase mechanics with single-policy-set administration.

### Hard disqualifiers
- §101(j) treatment risk (must be carefully structured to avoid EOLI taxation)
- Owners with materially different insurability that creates ownership-distortion within Insurance LLC

## WHAT IT IS
A separate LLC owns life policies on each member. Each member's economic interest in the Insurance LLC roughly mirrors operating-company ownership but is structured to avoid transfer-for-value problems. On death, the LLC distributes proceeds to surviving members, who use them to cross-purchase the deceased's interest in the operating entity.

## WHY WE RECOMMEND IT
Solves the "many owner" problem of cross-purchase: 4 owners requires 12 policies under cross-purchase; 1 set of 4 policies in an Insurance LLC. Preserves basis step-up for surviving owners. Avoids §101(j) issues that arise with operating-company ownership.

## VARIATIONS
- **Equal-share LLC:** members hold equal interest in Insurance LLC regardless of operating-company % — simplifies but creates value mismatch
- **Pro-rata LLC:** Insurance LLC interests mirror operating-company ownership exactly
- **Custom-allocation:** advanced; matches each member's policy purchase obligation to their buyout obligation

## QUANTIFIED IMPACT FRAMEWORK

### Components
- Cross-purchase basis step-up preserved
- Single policy set; lower admin cost vs. true cross-purchase
- Avoids §101(j) on operating company

### Worked example
4-owner consulting business, 25% each, $20M total value:
- Cross-purchase would require 12 policies; Insurance LLC has 4
- Each owner contributes pro-rata to Insurance LLC; LLC pays premiums
- On death of Owner A: LLC receives $5M, distributes per LLC operating agreement to surviving members; survivors each buy 1/3 of Owner A's interest from estate
- Surviving owners get basis step-up (acquired interest at FMV)

## IMPLEMENTATION STEPS
1. Form Insurance LLC (separate entity, same owners as operating company in pro-rata or designed proportions)
2. Insurance LLC obtains policies; each member contributes pro-rata to fund premiums
3. Buy/sell agreement updated to coordinate operating-company transfer mechanics with Insurance LLC distribution mechanics
4. Confirm §101(j) is NOT triggered (Insurance LLC is owner; not the operating company employer)
5. Annual valuation, premium tracking, distribution event documentation

## SEQUENCING DEPENDENCIES
- **MUTUALLY EXCLUSIVE WITH:** REC-RSK-001, REC-RSK-002
- **COORDINATED WITH:** operating company buy/sell agreement, attorney drafting

## DOCUMENTATION CHECKLIST
- [ ] Insurance LLC formed; operating agreement signed
- [ ] Operating company buy/sell agreement coordinated
- [ ] Policies issued to Insurance LLC
- [ ] Premium contribution schedule documented
- [ ] §101(j) analysis confirms no EOLI status

## COMMON MISTAKES
- Pretending the operating company "really owns" the policies — destroys the structure
- Failing to coordinate the LLC operating agreement with the buy/sell mechanics
- §101(j) trap if Insurance LLC is treated as alter ego of operating company

## COORDINATION NOTES
- **PSA Wealth:** structuring, product selection, premium logistics
- **CPA:** §101(j) opinion; tax treatment of premium contributions
- **Attorney:** Insurance LLC formation, operating agreement, buy/sell coordination — specialist work; not generalist business attorney

## CLIENT CONVERSATION FRAMING
> "Because there are {N} of you, neither pure cross-purchase nor pure redemption works cleanly. The Insurance LLC is the bridge: it owns the policies, your ownership of the LLC mirrors your ownership of the operating business, and on a death event the proceeds flow through to surviving owners who then complete the buyout. You preserve the basis step-up of cross-purchase without the {N×(N-1)} policy count."

## CAVEATS & DISQUALIFIERS
- Specialist counsel mandatory — generalist execution creates audit risk
- Must be properly funded (no implicit-loan treatment)
- Coordination complexity at every triggering event

## REFERENCES
- IRC §101(j) — application to non-employer owners
- Treas. Reg. §1.83-3 — partnership interest structure
- Common-law partnership-owned life insurance treatment

## PLAN OUTPUT TEMPLATE

> **Form an Insurance LLC to fund the buy/sell.** With {N} owners, neither cross-purchase nor redemption is the right answer; both create either administrative complexity or basis step-up loss. The Insurance LLC bridges the gap: a separate entity, owned by the same individuals as {operating_entity_name}, holds the life policies. On a death event, the LLC distributes proceeds to surviving members who complete the operating-company buyout. You get the basis step-up benefits of cross-purchase with single-policy-set administration. Specialist counsel required for structuring; PSA coordinates with attorney throughout.
