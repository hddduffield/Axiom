# [REC-INV-006] — Post-Transaction Concentration Unwind

## METADATA
- **ID:** REC-INV-006
- **Status:** Active
- **Category:** Investment
- **Engagement archetypes:** Post-Exit
- **Plan section placement:** "Post-Transaction Deployment"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.is_post_exit == True
  - Material concentration remains (rollover equity, restricted stock, equity in seller financing)
  - Concentration > 25% of post-transaction net worth

DISQUALIFY if:
  - Already diversified
  - Lock-up restrictions prevent unwind
```

### Natural-language explanation
Post-transaction, the owner often retains some concentration: rolled-over equity in the buyer, seller financing, restricted public stock if buyer is public. These create lingering concentration risk that should be unwound on a defensible schedule once restrictions allow.

### Hard disqualifiers
- All concentration already unwound
- Strategy specifically holds for tax or other reason

## WHAT IT IS
Disciplined unwinding of post-transaction concentration:
- Rollover equity: liquidate at next available windows (typically tied to acquirer milestones)
- Seller financing: hold to term or refinance/sell secondary
- Public restricted stock: 10b5-1 plan for systematic disposal during open windows
- Earnout: hedge if material; structure for tax efficiency

## WHY WE RECOMMEND IT
Concentration that justified a transaction is replaced by different concentration. Unwinding aligns the portfolio with target asset allocation rather than transactional residue.

## VARIATIONS
- 10b5-1 plans for public restricted stock (REC-SPC-005 for hedging)
- Secondary market sales for private rollover equity
- Structured charitable dispositions of low-basis residual stakes (REC-CHR-002, REC-CHR-009)

## QUANTIFIED IMPACT FRAMEWORK

### Components
- Risk reduction from concentration unwind
- Tax management on disposition
- Reinvestment into target asset allocation

## IMPLEMENTATION STEPS
1. Inventory post-transaction holdings: equity, notes, restricted stock, earnout
2. Identify lock-ups, restrictions, vesting schedules
3. Build unwind schedule (10b5-1 plan for public; tranches for private)
4. Coordinate tax planning (REC-INV-008 Roth conversion bracket modeling, REC-INV-007 loss harvesting)
5. Reinvest proceeds into target asset allocation

## SEQUENCING DEPENDENCIES
- **COORDINATED WITH:** REC-INV-008 (Roth conversion modeling), REC-INV-007 (loss harvesting), REC-CHR-002 (charitable disposition)

## DOCUMENTATION CHECKLIST
- [ ] Inventory of all post-transaction holdings
- [ ] Restriction calendar
- [ ] 10b5-1 plan if public stock involved
- [ ] Quarterly unwind progress

## COMMON MISTAKES
- Holding rollover equity hoping for second exit when first exit was the right time
- Failing to use 10b5-1 plan for public stock (insider trading concerns at corner-of-window sales)
- Realizing entire concentrated position in one tax year

## COORDINATION NOTES
- **PSA Wealth:** primary
- **CPA:** annual tax modeling
- **M&A counsel:** restriction compliance for any private rollover

## CLIENT CONVERSATION FRAMING
> "Of the post-transaction proceeds, ${concentration_dollars} is still concentrated in {form — rollover equity / restricted stock / seller note}. We unwind on a disciplined schedule as restrictions permit, coordinating with tax planning. Goal: reach target allocation within 24-36 months post-close."

## CAVEATS & DISQUALIFIERS
- Lock-ups dictate timing
- Public stock requires 10b5-1 for disciplined exit
- Tax planning and unwind interact

## REFERENCES
- Rule 10b5-1 (SEC)
- Standard post-transaction wealth management practices

## PLAN OUTPUT TEMPLATE

> **Unwind post-transaction concentration on a disciplined schedule.** Post-close, ${concentration_dollars} remains in {form}. Build unwind schedule respecting restrictions: {schedule_summary}. Coordinate with annual tax planning and target asset allocation. Reinvest proceeds into the diversified portfolio per Investment Policy Statement.
