# [REC-INV-005] — Pre-Transaction Diversification Discipline

## METADATA
- **ID:** REC-INV-005
- **Status:** Active
- **Category:** Investment
- **Engagement archetypes:** Pre-Exit
- **Plan section placement:** "Pre-Transaction Sequence"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.is_pre_exit == True
  - FR.5.4.primary_owner_business_equity_value > 50% of net worth
  - FR.11.transaction_window_years > 1

DISQUALIFY if:
  - Concentration is intentional and acknowledged with documented strategy
  - Transaction within 90 days (insufficient time)
```

### Natural-language explanation
Owner-clients approaching exit are typically extremely concentrated — 60-90% of net worth in a single illiquid business. Pre-transaction discipline avoids increasing concentration further (don't add to the same sector via investments) and where possible begins to extract some chips off the table without compromising business value or transaction price.

### Hard disqualifiers
- Imminent transaction
- Owner committed to maintaining concentration

## WHAT IT IS
Investment discipline rather than a single transaction:
1. Stop adding capital to the operating business beyond what's strategically necessary
2. Personal portfolio: avoid concentration in same industry as business (e.g., don't load up on construction-sector ETFs if business is construction)
3. Where transaction permits, extract some pre-transaction value (dividend recap, partial owner financing) and diversify
4. Build investment portfolio infrastructure before liquidity event so post-transaction deployment is not a panic

## WHY WE RECOMMEND IT
Concentration risk dominates HNW family balance sheet pre-exit. Many transactions don't close at expected value or timing — sometimes don't close at all. Pre-transaction discipline builds resilience.

## QUANTIFIED IMPACT FRAMEWORK
- Concentration ratio reduction
- Counterfactual scenarios (transaction fails, business stalls, market shifts)
- Investment infrastructure ready for liquidity event

## IMPLEMENTATION STEPS
1. Concentration analysis: business equity / total net worth
2. Identify diversification levers (dividend recap, real estate spin-off, investment portfolio rebalancing)
3. Set discipline: no further investment additions to same sector
4. Build portfolio relationship if not in place (PSA's normal investment management)
5. Review quarterly through transaction window

## SEQUENCING DEPENDENCIES
- **COORDINATED WITH:** REC-INV-006 (post-transaction unwind — different timing, related logic)
- **COORDINATED WITH:** REC-ENT-001 (real estate separation can extract real estate value pre-transaction)

## DOCUMENTATION CHECKLIST
- [ ] Concentration analysis documented
- [ ] Diversification roadmap signed off
- [ ] Quarterly check-ins

## COMMON MISTAKES
- Buying more of own industry "because I understand it"
- Over-investment in business in last year (post-investment, value is gone if deal closes at independent appraisal)
- Failing to build investment infrastructure ahead of liquidity

## COORDINATION NOTES
- **PSA Wealth:** ongoing investment discipline; quarterly review
- **CPA:** tax modeling for any pre-transaction extraction
- **Banker:** structuring of any partial liquidity events

## CLIENT CONVERSATION FRAMING
> "{Percent}% of your net worth is in the operating business. The transaction is {window} years away and may or may not close. Between now and then, we want to avoid adding to that concentration — both not putting more capital into the business unless strategically necessary, and not loading the personal portfolio with similar-industry exposure. Where possible, we identify ways to take some chips off the table — partial dividend recap, real estate spin-off — without affecting transaction value."

## CAVEATS & DISQUALIFIERS
- Pre-transaction extraction must not signal financial distress to buyers
- Some buyers prefer owner has skin in the game — partial extraction may be misread

## REFERENCES
- Concentration risk research
- Standard pre-transaction posture for owner-led businesses

## PLAN OUTPUT TEMPLATE

> **Maintain pre-transaction diversification discipline.** Approximately ${concentration_pct}% of household net worth is in {business_name}. Through the transaction window, we maintain three disciplines: (1) no further capital into the business beyond strategic necessity, (2) personal portfolio avoids concentration in {business_industry} sector, (3) where transaction permits, partial pre-transaction value extraction (real estate separation per REC-ENT-001; dividend recap if appropriate) reduces concentration without compromising transaction price.
