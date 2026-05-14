# [REC-RET-007] — Plan Amendment for Roth/After-Tax Capability

## METADATA
- **ID:** REC-RET-007
- **Status:** Active
- **Category:** Retirement
- **Engagement archetypes:** All
- **Plan section placement:** "Recommendations — Retirement & Benefits"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ANY of:
  - Plan does NOT support Roth deferrals AND (REC-RET-001 needs Roth catch-up under SECURE 2.0 OR client wants Roth optionality)
  - Plan does NOT support after-tax (non-Roth) contributions AND REC-RET-004 (mega backdoor) is desired
  - Plan does NOT support in-service Roth conversion AND REC-RET-004 desired
  - Plan does NOT support in-service withdrawal AND REC-RET-004 desired

DISQUALIFY if:
  - Plan already supports needed features
  - Plan is too small for amendment cost to be economical (rare; amendment is usually inexpensive)
```

### Natural-language explanation
Many older plan documents lack Roth or after-tax features. Adding these features through plan amendment unlocks SECURE 2.0 Roth catch-up compliance, mega-backdoor Roth, and Roth deferral optionality. Cost is typically a few hundred dollars; recordkeeper may handle for free as part of regular maintenance.

### Hard disqualifiers
- Cannot identify plan provider's amendment process

## WHAT IT IS
Formal amendment to plan document adding:
- Roth 401(k) deferral feature (so participants can choose Roth on regular deferrals and catch-up)
- After-tax (non-Roth) contribution feature (enables mega backdoor)
- In-service Roth conversion feature (enables in-plan conversion)
- In-service withdrawal of after-tax contributions (alternative path to Roth)

## WHY WE RECOMMEND IT
SECURE 2.0 effective 2026 mandates Roth catch-up for participants with prior-year FICA wages > $150K. Plans without Roth feature cannot offer catch-up to those participants — they lose that contribution capacity. Mega backdoor Roth (REC-RET-004) requires after-tax + in-service conversion; without these features, the strategy isn't available.

## QUANTIFIED IMPACT FRAMEWORK

### Components
- Plan amendment cost (typically modest)
- Unlocks downstream contribution capacity (REC-RET-001 Roth catch-up; REC-RET-004 mega backdoor)
- Recovers SECURE 2.0 compliance for high earners

## IMPLEMENTATION STEPS
1. Identify plan provider/recordkeeper and TPA
2. Request amendment proposal
3. Adopt amendment (board resolution; participant notice)
4. Update participant communications
5. Coordinate payroll for new contribution sources

## SEQUENCING DEPENDENCIES
- **PREREQUISITE FOR:** REC-RET-001 (Roth catch-up), REC-RET-004 (mega backdoor Roth)

## DOCUMENTATION CHECKLIST
- [ ] Amendment adopted with effective date
- [ ] Participant notice
- [ ] Updated plan document
- [ ] Payroll integration for new contribution sources

## COMMON MISTAKES
- Failing to amend in time for SECURE 2.0 effective date (2026)
- Adding Roth without after-tax (need both for mega backdoor)
- Not communicating to participants

## COORDINATION NOTES
- **PSA Wealth:** identifies need; coordinates with TPA
- **TPA / Recordkeeper:** drafts amendment
- **CPA:** confirms tax treatment
- **Attorney:** review amendment if non-standard

## CLIENT CONVERSATION FRAMING
> "Your plan doesn't currently support {specific_feature}. We need to amend it to {add_features}. Without the amendment, {consequence — typically: SECURE 2.0 catch-up failure or mega backdoor not available}. Cost is minimal — a few hundred dollars through your recordkeeper."

## CAVEATS & DISQUALIFIERS
- Some recordkeepers don't support all features; may require switching providers
- Plan amendment timing requires coordination with payroll setup

## REFERENCES
- SECURE 2.0 §603 — Roth catch-up mandate
- IRC §402A — Roth treatment
- IRS Notice 2014-54 — mega backdoor

## PLAN OUTPUT TEMPLATE

> **Amend the 401(k) plan to add {feature_list}.** Required to support {downstream — typically Roth catch-up SECURE 2.0 compliance and/or mega backdoor Roth}. Coordinate with {plan_provider}; amendment cost typically modest. Adopt before {effective_date_target} to support 2026 contribution year.
