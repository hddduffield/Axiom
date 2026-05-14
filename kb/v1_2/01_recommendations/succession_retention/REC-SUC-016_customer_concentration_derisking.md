# [REC-SUC-016] — Customer Concentration De-Risking

## METADATA
- **ID:** REC-SUC-016
- **Status:** Active
- **Category:** Succession & Retention / Pre-Transaction
- **Engagement archetypes:** Pre-Exit
- **Plan section placement:** "Pre-Transaction Sequence"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.has_business == True
  - FR.3.4.has_concentration_risk == True (Top 3 > 40% OR largest single > 20%)
  - Transaction window > 12 months (need time to diversify)

DISQUALIFY if:
  - Concentration is structural (e.g., government contracting business; concentration may be inherent)
  - Transaction too imminent
```

### Natural-language explanation
Buyer-applied valuation discounts for customer concentration are often severe — 20-40%+ value reduction when single-customer concentration exceeds 25-30%. Pre-transaction, the firm helps identify and pursue strategies to diversify the customer base over 12-24 months: new customer acquisition, geographic expansion, account expansion within existing customers, intentional product mix shifts.

### Hard disqualifiers
- Concentration inherent and unavoidable

## WHAT IT IS
A 12-24 month strategic initiative to reduce concentration risk pre-transaction. Combines:
- Sales team focus on net-new customer acquisition
- Geographic or vertical expansion
- Account expansion within existing accounts (broaden footprint vs. depth in one)
- Product/service mix changes that broaden appeal
- Long-term contracts with concentration customers (buyer values predictability)

## WHY WE RECOMMEND IT
Concentration discount can be 20-40% of transaction value. Two years of focused diversification + long-term contracts on remaining concentration can recover most of that.

## QUANTIFIED IMPACT FRAMEWORK

### Components
- Concentration ratio reduction
- Long-term contract coverage on concentrated customers
- Direct multiple expansion at transaction

### Worked example
$30M business with #1 customer at 40%:
- Estimated discount: 25-35% = $7.5M-$10.5M of transaction value at risk
- 24-month diversification: target #1 customer to 25% via #2/#3/#4 expansion
- Long-term contract with #1 (3-year minimum take)
- Estimated value recovery: $5M-$7M

## IMPLEMENTATION STEPS
1. Concentration analysis
2. Sales-team objectives aligned with diversification (incentive structure)
3. Customer expansion plans (depth and breadth in non-concentrated accounts)
4. Long-term contracts with concentrated customers (terms favorable to seller for buyer comfort)
5. Quarterly metrics tracking

## SEQUENCING DEPENDENCIES
- **MUST come BEFORE:** REC-SUC-011 (banker engagement)
- **COORDINATED WITH:** REC-SUC-013 (management bench)

## DOCUMENTATION CHECKLIST
- [ ] Concentration tracking
- [ ] Sales team incentive alignment
- [ ] Long-term contracts negotiated
- [ ] Quarterly KPI dashboard

## COMMON MISTAKES
- Starting too late
- Sales team incentives still favor depth in concentrated accounts
- Failing to negotiate long-term contracts pre-banker engagement
- Underestimating buyer's discount on concentration

## COORDINATION NOTES
- **PSA Wealth:** strategic
- **CRO/Sales leader:** primary execution
- **Banker:** receives diversified profile at market

## CLIENT CONVERSATION FRAMING
> "{Customer_name} is {concentration_pct}% of revenue. Buyers will discount the business 25-35% for that concentration alone. Over the next {months}, we focus sales on diversification — both depth in existing non-concentrated accounts and net-new customers. Where possible, lock {customer_name} into a 3-year contract that buyers value as predictability rather than concentration risk. Estimated value recovery: ${recovery_estimate}."

## CAVEATS & DISQUALIFIERS
- Sales team alignment critical
- Some concentration is structural
- Long-term contracts require customer negotiation; may be difficult

## REFERENCES
- Standard pre-transaction risk reduction practices

## PLAN OUTPUT TEMPLATE

> **De-risk customer concentration over the transaction window.** Current top-customer concentration: {top_customer_pct}%; top-3: {top3_pct}%. Buyer discount potential: 20-40% of transaction value. 24-month plan: sales-team focus on net-new and account-broadening; long-term contracts with concentrated customers; quarterly metric tracking. Estimated transaction value recovery: ${recovery_estimate}.
