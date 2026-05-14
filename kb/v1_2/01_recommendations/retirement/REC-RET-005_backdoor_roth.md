# [REC-RET-005] — Backdoor Roth IRA

## METADATA
- **ID:** REC-RET-005
- **Status:** Active
- **Category:** Retirement
- **Engagement archetypes:** All HNW
- **Plan section placement:** "Recommendations — Retirement & Benefits"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - Owner income > Roth IRA phase-out ($242K MFJ in 2026)
  - Owner has earned income (or spouse does)
  - No (or minimal) pre-tax IRA balances (otherwise pro-rata rule causes issues)

DISQUALIFY if:
  - Substantial pre-tax IRA balances triggering pro-rata rule (would partially tax conversion)
  - No earned income
```

### Natural-language explanation
For HNW clients above Roth phase-out, contribute non-deductible to traditional IRA, then convert promptly to Roth. The conversion is essentially tax-free (no deduction taken originally, and prompt conversion avoids gain). Annual Roth space: $7,500 + $1,100 catch-up = $8,600 (2026).

### Hard disqualifiers
- Pre-tax IRA balances (rollover IRA, SEP-IRA) — pro-rata rule taxes portion of conversion
- No earned income

## WHAT IT IS
1. Contribute up to $7,500 ($8,600 if 50+) to traditional IRA — NOT deducted (income above limit)
2. Convert traditional IRA to Roth IRA (taxable to extent of pre-tax basis; here, $0 if no other pre-tax IRA balance)
3. File Form 8606 documenting basis

## WHY WE RECOMMEND IT
Tax-free Roth growth even for high-income earners. Modest annual amount but compounds meaningfully over decades. Both spouses can do.

## QUANTIFIED IMPACT FRAMEWORK
- Annual Roth contribution: $7,500 + $1,100 catch-up
- Both spouses: $17,200 (50+ both)
- Tax-free growth at 7%: ~$1.0M-$1.4M after 30 years (combined)

## IMPLEMENTATION STEPS
1. Verify no/minimal pre-tax IRA balance for the spouse who will execute (pro-rata rule check)
2. Open traditional IRA if not present
3. Contribute non-deductibly (post-tax)
4. Convert to Roth promptly (next business day or shortly after)
5. File Form 8606 documenting basis

## SEQUENCING DEPENDENCIES
- **COORDINATED WITH:** REC-RET-004 (mega backdoor — different mechanism)
- **CAUTION:** if pre-tax IRA exists, consider rolling it INTO 401(k) first to clear pro-rata issue (workplace plans don't count for pro-rata rule)

## DOCUMENTATION CHECKLIST
- [ ] No pre-tax IRA balance verification
- [ ] Non-deductible traditional IRA contribution made
- [ ] Roth conversion executed
- [ ] Form 8606 filed
- [ ] Annual repetition

## COMMON MISTAKES
- **Pro-rata rule violation:** any pre-tax IRA balance contaminates the conversion; partial taxation
- Failing to file Form 8606 — basis not tracked, future conversions may be taxed
- Inadvertent SEP-IRA or rollover IRA contamination
- Spousal contamination (only the contributing spouse's pre-tax IRA matters)

## COORDINATION NOTES
- **PSA Wealth:** mechanic execution
- **CPA:** Form 8606 filing

## CLIENT CONVERSATION FRAMING
> "Backdoor Roth gets ${both_spouses_roth}/year of Roth contributions for both of you — $7,500 each plus catch-up if 50+ — even though you're well above the income phase-out. The mechanic: contribute non-deductibly to a traditional IRA, then immediately convert to Roth. Annual move; takes 5 minutes."

## CAVEATS & DISQUALIFIERS
- Pro-rata rule must be cleared for the contributing spouse
- Step-transaction doctrine (theoretical concern; rarely cited)
- Some commentators concerned about future legislative restriction

## REFERENCES
- IRC §408A — Roth IRA
- IRC §408(d) — pro-rata rule on conversion
- Form 8606 — non-deductible contribution and basis tracking

## PLAN OUTPUT TEMPLATE

> **Backdoor Roth IRA — both spouses.** Annual non-deductible traditional IRA contribution ($7,500 + $1,100 catch-up = $8,600 in 2026 if 50+) followed by immediate Roth conversion. Combined household Roth capacity: ~$17,200/year. {if pre-tax IRA exists for either spouse: "First step: roll {name}'s pre-tax IRA into the 401(k) to clear the pro-rata rule before executing backdoor Roth."}.
