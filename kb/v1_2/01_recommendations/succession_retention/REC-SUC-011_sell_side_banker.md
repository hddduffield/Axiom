# [REC-SUC-011] — Sell-Side M&A Banker Engagement

## METADATA
- **ID:** REC-SUC-011
- **Status:** Active
- **Category:** Succession & Retention / Pre-Transaction
- **Engagement archetypes:** Pre-Exit
- **Plan section placement:** "Pre-Transaction Sequence" → "T-12 months"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.is_pre_exit == True
  - Transaction window 6-15 months
  - FR.11.ma_counsel_engaged == False (or just M&A counsel without banker)
  - Business size supports banker engagement (typically $10M+ EBITDA)

DISQUALIFY if:
  - Direct buyer relationship; transaction structured without market check
  - Business too small for banker economics (under ~$2M EBITDA — different intermediary path)
```

### Natural-language explanation
Sell-side M&A bankers run a competitive process to maximize transaction value. Engagement involves preparing CIM (confidential information memorandum), buyer outreach, managing competitive dynamics, deal structuring, and closing facilitation. Typical fees: 1-2% of transaction value with success fees and minimums.

### Hard disqualifiers
- Pre-committed to single buyer
- Business too small

## WHAT IT IS
M&A advisory engagement (typically 4-9 month timeline):
- Banker prepares CIM and teaser
- Identifies and reaches out to qualified buyers
- Manages first-round indications of interest
- Manages second-round LOIs
- Facilitates due diligence
- Closes transaction
- Fees: success-based; engagement minimum + retainer + success fee

## WHY WE RECOMMEND IT
Competitive process typically increases transaction value 15-30% vs. direct sale to single buyer. For $30M+ transactions, banker fees ($300K-$600K typical) pay for themselves several times over.

## QUANTIFIED IMPACT FRAMEWORK

### Components
- Premium from competitive process
- Banker fees (typical 1-2%)
- Process management value (deal-killer prevention)
- Buyer pool expansion

### Worked example
$30M baseline transaction:
- Direct sale: $30M, no banker fee, but no market check
- Competitive process via banker: $35-40M typical, banker fee $400K-$700K
- Net to seller: $34M-$39M+ vs. $30M direct

## IMPLEMENTATION STEPS
1. Banker selection (typically 2-3 finalists; reference checks; specialty fit)
2. Engagement letter (success-fee structure; minimums; expense reimbursement)
3. CIM development (banker drafts; client reviews)
4. Buyer outreach
5. First round indications
6. Second-round LOIs
7. Diligence and closing

## SEQUENCING DEPENDENCIES
- **SEQUENCED WITH:** REC-SUC-010 (QofE), REC-ENT-001/002 (restructuring), REC-SUC-002 (stay bonus) — pre-transaction workplan with explicit ordering
- **COORDINATED WITH:** REC-SUC-012 (fractional CFO if needed)

## DOCUMENTATION CHECKLIST
- [ ] Banker selection memo
- [ ] Engagement letter
- [ ] CIM finalized
- [ ] Buyer outreach list
- [ ] LOI evaluation matrix
- [ ] Closing documents

## COMMON MISTAKES
- Selecting on lowest fee rather than best fit
- Failing to specialize (industry banker matters)
- Vague success-fee waterfall
- No carve-out for specific buyers if owner has direct relationship

## COORDINATION NOTES
- **PSA Wealth:** banker referrals, owner advocacy
- **CPA:** financial information for CIM
- **Attorney:** banker engagement letter; transaction docs
- **Banker:** primary

## CLIENT CONVERSATION FRAMING
> "Going to market with a sell-side banker. They'll prep the CIM, run a competitive process with multiple buyers, manage diligence, and close. Their fee — typically 1-2% of transaction value — pays back many times over through the competitive premium. We've shortlisted {banker_count} firms with specific industry expertise. Selecting in next 60 days; banker engaged 9-12 months before close."

## CAVEATS & DISQUALIFIERS
- Banker fees on success-only basis means alignment with seller's outcome
- Industry specialization matters substantially
- Mid-market vs. boutique fit varies by deal size

## REFERENCES
- Standard sell-side M&A practices

## PLAN OUTPUT TEMPLATE

> **Engage sell-side M&A banker 9-12 months pre-transaction.** Competitive process maximizes transaction value vs. direct sale to single buyer. Shortlist banker candidates with {industry} specialty; engagement letter with 1-2% success fee; banker prepares CIM, manages buyer outreach, facilitates LOIs and diligence. Estimated banker fees: ${banker_fees}; expected premium captured: ${expected_premium}. PSA helps with banker selection and owner advocacy throughout.
