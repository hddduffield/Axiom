# [REC-SUC-010] — Pre-Transaction Quality of Earnings Engagement

## METADATA
- **ID:** REC-SUC-010
- **Status:** Active
- **Category:** Succession & Retention / Pre-Transaction
- **Engagement archetypes:** Pre-Exit
- **Plan section placement:** "Pre-Transaction Sequence" → "T-12 to T-18 months"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.is_pre_exit == True
  - Transaction window 12-24 months
  - FR.3.5.qofe_performed == False (or older than 18 months)
  - Business of size supporting QofE economics ($10M+ revenue or $2M+ EBITDA)
```

### Natural-language explanation
A Q-of-E (quality of earnings) study performed pre-transaction by an independent CPA firm validates the business's reported EBITDA, identifies normalizing adjustments, and surfaces issues that would otherwise emerge in buyer diligence. Going to market with a Q-of-E in hand reduces deal-killer surprises and supports premium valuations.

### Hard disqualifiers
- Recent QofE in hand
- Transaction too distant (work goes stale)

## WHAT IT IS
A focused due-diligence-style engagement by independent accounting firm:
- Validates revenue recognition, customer concentration, margin trends
- Identifies one-time / non-recurring items requiring add-back
- Surfaces accounting issues (revenue recognition, working capital quirks)
- Quantifies "adjusted EBITDA" the buyer will base offers on
- Costs $50K-$150K depending on business size and complexity

## WHY WE RECOMMEND IT
Buyer's QofE will happen anyway during diligence. Better to do your own first: surfaces and addresses issues before they're discovered by an unfriendly party. Going to market with QofE in hand: smoother process, fewer "surprise" reductions, often higher final transaction value.

## QUANTIFIED IMPACT FRAMEWORK

### Components
- Premium captured by clean diligence-ready presentation
- Issues identified and addressed pre-market
- Reduced surprise re-trade risk

### Worked example
$30M projected transaction:
- QofE cost: $75K-$125K
- Typical impact: 5-15% improvement in final transaction value via cleaner process and pre-emptive issue resolution
- Expected ROI: $1.5M-$4.5M of preserved value vs. $100K cost

## IMPLEMENTATION STEPS
1. Engage QofE firm 12-18 months pre-transaction
2. Provide financial records, customer data, revenue detail
3. QofE report 6-10 weeks
4. Address issues identified (clean up books, normalize accounting, document customer concentration)
5. Refresh QofE 6 months later if material time elapsed before going to market

## SEQUENCING DEPENDENCIES
- **MUST come BEFORE:** REC-SUC-011 (banker engagement)
- **COORDINATED WITH:** REC-ENT-001/002 (real estate separation, F-reorg)

## DOCUMENTATION CHECKLIST
- [ ] QofE firm engagement letter
- [ ] QofE report
- [ ] Issue resolution log
- [ ] Refresh as needed before market

## COMMON MISTAKES
- Engaging too late (no time to address issues found)
- Using existing CPA (independence questioned by buyer)
- Failing to address issues identified
- Going stale before going to market

## COORDINATION NOTES
- **PSA Wealth:** quarterback role; QofE firm referral
- **CPA (existing):** cooperation with QofE firm
- **CFO/Controller:** primary engagement contact
- **Banker:** receives QofE before market

## CLIENT CONVERSATION FRAMING
> "Before we go to market, we run our own Q-of-E. The buyer's team will do one anyway during diligence; the question is whether we surface and fix issues now (where we control the narrative) or wait for unfriendly discovery. Cost: ~${qofe_cost}; impact: typically 5-15% of transaction value preserved through cleaner process. Banker won't take you to market without a credible QofE."

## CAVEATS & DISQUALIFIERS
- QofE firm independence — separate from existing CPA
- Cost vs. transaction value (small businesses sub-$5M EBITDA may not justify)
- Refresh required if too long between QofE and going to market

## REFERENCES
- Standard M&A due diligence practices

## PLAN OUTPUT TEMPLATE

> **Pre-transaction Quality of Earnings.** 12–18 months before a likely transaction, engage a sell-side QofE firm. This is not optional in any modern lower-middle-market deal — buyers will do their own; doing yours first prevents surprises and arms you with negotiation positions. Independent CPA-firm validation of EBITDA, normalizing adjustments, customer/margin trends. Estimated cost: ${qofe_cost}. Expected impact: 5-15% of transaction value preserved through cleaner process. We recommend {firm_name | firms_to_evaluate}.

**Variables:**
- `{qofe_cost}` = $50K-$120K typical for $20M-$50M revenue businesses
- `{firm_name | firms_to_evaluate}` = firm-policy default list (Tier 3 open item)

### Holloway-section reference for depth target

Holloway plan, Section 7, "Pre-transaction Quality of Earnings" bullet — specifies:
1. Timing: "12–18 months before a likely transaction"
2. Non-optional framing: "not optional in any modern lower-middle-market deal"
3. Strategic rationale: "buyers will do their own; doing yours first prevents surprises and arms you with negotiation positions"

Original template had the mechanics but lacked the "not optional" framing and the dual rationale (prevent surprises, gain negotiation positions).
