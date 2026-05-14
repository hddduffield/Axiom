# [REC-RET-010] — SECURE 2.0 Roth Catch-Up Compliance (2026)

## METADATA
- **ID:** REC-RET-010
- **Status:** Active
- **Category:** Retirement
- **Engagement archetypes:** All with W-2 > $150K (2025)
- **Plan section placement:** "Recommendations — Retirement & Benefits / Compliance"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - Owner / participant prior-year (2025) FICA wages > $150,000
  - Plan participant age 50+ (eligible for catch-up)
  - Catch-up contributions intended in 2026

DISQUALIFY if:
  - Wages below threshold
  - Plan already fully Roth-capable AND administered correctly
  - Participant under 50 (not eligible for catch-up regardless)
```

### Natural-language explanation
SECURE 2.0 §603, effective for 2026: catch-up contributions to 401(k), 403(b), and governmental 457(b) plans MUST be Roth (after-tax) for participants whose prior-year FICA wages exceeded $150,000. Plans must support Roth contributions; if not, affected participants cannot make catch-up contributions at all. This is a 2026 implementation item.

### Hard disqualifiers
- Plan amended and operationalized
- Wages below threshold (use traditional or Roth catch-up at participant's choice)

## WHAT IT IS
A statutory mandate that overrides traditional pre-tax catch-up for high-earners. Mechanically:
1. Verify each catch-up-eligible participant's prior-year FICA wages
2. For those above $150K (2025) → Roth catch-up required in 2026
3. Plan must support Roth deferrals
4. Payroll must correctly categorize catch-up dollars as Roth (after-tax) for affected participants

## WHY WE RECOMMEND IT
Failure to comply: (a) plan operational failure; (b) high-earning participants lose catch-up capacity entirely if plan doesn't support Roth; (c) potential plan disqualification on accumulated failures.

## IMPLEMENTATION STEPS
1. Identify all catch-up-eligible participants (50+) in plan
2. Pull 2025 FICA wages for each (W-2 Box 3)
3. Flag those above $150K
4. Verify plan supports Roth deferrals — if not, REC-RET-007 plan amendment now
5. Coordinate with payroll for correct categorization in 2026 pay periods
6. Communicate to affected participants: their catch-up will be Roth, with consequences

## SEQUENCING DEPENDENCIES
- **PREREQUISITE:** REC-RET-007 (plan amendment if Roth not supported)
- **TIMING:** must be operational by January 1, 2026 (already past for new plans)

## DOCUMENTATION CHECKLIST
- [ ] Participant FICA wage analysis documented
- [ ] Plan supports Roth deferrals (verified)
- [ ] Payroll system flagged affected participants
- [ ] Participant communications sent

## COMMON MISTAKES
- Plan doesn't support Roth — affected participants miss catch-up
- Payroll fails to categorize correctly
- Failing to communicate to participants who expected pre-tax catch-up
- Failing to track wages annually (threshold $150K is 2025 FICA wages; threshold for future years indexed)

## COORDINATION NOTES
- **PSA Wealth:** annual participant flagging; verify plan support
- **Plan provider / Recordkeeper:** Roth feature operational; affected participant identification
- **Payroll provider:** categorization of catch-up
- **CPA:** confirm W-2 reporting

## CLIENT CONVERSATION FRAMING
> "Effective 2026, your catch-up contribution has to be Roth (after-tax) since your 2025 FICA wages were over $150K. Your plan {does | doesn't} support Roth — {if doesn't: 'we need to amend before year-end'}. Practical effect: your $8,000 catch-up loses the current-year tax deduction but grows tax-free in retirement. The math typically favors Roth at your age and bracket anyway."

## CAVEATS & DISQUALIFIERS
- Threshold updated annually (indexed)
- Failure modes affect specific participants, not necessarily the whole plan
- Implementation guidance still evolving (IRS Notice 2025-XX series)

## REFERENCES
- SECURE 2.0 §603
- IRC §414(v)(7)
- IRS Notice 2025-67 — confirms threshold and mechanics
- IRS Notice 2024-2 — initial implementation guidance

## PLAN OUTPUT TEMPLATE

> **SECURE 2.0 Roth catch-up compliance.** Your 2025 FICA wages exceeded $150K, so your 2026 catch-up contribution must be Roth (after-tax) under SECURE 2.0 §603. {If plan supports Roth: "Plan supports this; payroll has been coordinated."}. {If plan doesn't support Roth: "We're amending the plan now to add Roth (REC-RET-007) before year-end to preserve your catch-up capacity for 2026."}. The catch-up still grows tax-free in retirement — no real economic loss; just a different tax-treatment profile.
