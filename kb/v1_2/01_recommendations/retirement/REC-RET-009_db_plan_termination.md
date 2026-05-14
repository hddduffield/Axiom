# [REC-RET-009] — Defined-Benefit Plan Termination Strategy

## METADATA
- **ID:** REC-RET-009
- **Status:** Advanced
- **Category:** Retirement
- **Engagement archetypes:** Post-Exit, retirement transition
- **Plan section placement:** "Recommendations — Retirement Transition"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - DB or cash-balance plan in place
  - Owner approaching retirement OR business sale
  - Plan no longer needed going forward
  - Funded status manageable (under-funded plans more complex)

DISQUALIFY if:
  - Plan continues to serve productive purpose
  - Severely under-funded (termination requires full funding to PBGC standards)
  - Plan termination conflicts with sale negotiation timing
```

### Natural-language explanation
Defined-benefit plans (including cash-balance) eventually terminate. Termination process involves full funding to satisfy benefit obligations, IRS submission, PBGC coordination (if covered), and rollover of participant balances to IRAs or successor plans. Timing matters — pre-sale termination may be cleaner; post-sale handover to buyer often impractical.

### Hard disqualifiers
- Plan continues to serve productive purpose
- Severe under-funding without ability to fully fund

## WHAT IT IS
Formal termination of DB plan:
- Notice of intent to terminate
- Final actuarial valuation
- Full funding to satisfy all accrued benefits (top-up if under-funded)
- Distribution of benefits (typically lump-sum rollovers to IRAs)
- IRS approval (Form 5310 final determination)
- PBGC filing if covered
- Excess assets handling — 50% reversion tax to employer if plan over-funded; alternatively, transfer to qualified replacement plan or to participants

## WHY WE RECOMMEND IT (when triggered)
Plans don't run forever. At retirement / sale, termination must be done correctly to preserve qualified status, transfer balances cleanly, and handle any over-funding without unnecessary tax cost.

## VARIATIONS
- **Standard termination:** PBGC Form 500 series; covered plans only
- **Distress termination:** plan unable to fund benefits; PBGC takeover
- **Spin-off + termination:** for transactions where buyer takes a piece

## QUANTIFIED IMPACT FRAMEWORK

### Components
- Distribution of accrued benefits to participants (rollover-eligible)
- Excess asset handling (reversion tax 50% + income tax = nearly 100% confiscation; alternatives)
- IRS / PBGC fees and submission costs
- Over-funded plan: transfer to qualified replacement plan over 7 years; or distribute to participants pro-rata

## IMPLEMENTATION STEPS
1. Decide termination date (typically end of plan year)
2. Adopt board resolution to terminate
3. Notice of Intent to Terminate to participants (60 days before termination)
4. Final actuarial valuation
5. Top-up funding if needed
6. Notice of Plan Benefits to participants
7. PBGC Form 500 (if covered)
8. IRS Form 5310 (request for determination)
9. Distribute benefits (lump-sum rollovers most common)
10. Final Form 5500 (terminating)
11. Handle excess assets (reversion vs. replacement plan vs. distribution)

## SEQUENCING DEPENDENCIES
- **COORDINATED WITH:** transaction timing (REC-SUC-011 banker engagement, REC-SUC-010 QofE)
- **COORDINATED WITH:** post-exit IRA rollover planning (REC-RET-006 if continuing to consult)

## DOCUMENTATION CHECKLIST
- [ ] Board resolution
- [ ] All participant notices
- [ ] Final actuarial valuation
- [ ] PBGC filing (if covered)
- [ ] IRS Form 5310 (recommended)
- [ ] Distribution records (1099-R for each distribution)
- [ ] Final Form 5500
- [ ] Excess asset disposition documented

## COMMON MISTAKES
- Termination timing collides with sale; should typically be done before
- Failing to fund all accrued benefits — termination not effective
- Reversion tax surprise — 50% on excess assets returning to employer
- Missing participant notices or notice timing

## COORDINATION NOTES
- **PSA Wealth:** coordinator role; participant rollover destination; investment management transition
- **CPA:** corporate tax treatment of any reversion or contribution to top-up
- **TPA / Actuary:** all the technical work
- **Attorney:** plan termination drafting if complex; specialist often needed

## CLIENT CONVERSATION FRAMING
> "We need to terminate the cash-balance plan as part of {transition_event — sale, retirement}. Process takes 6-12 months: full funding, participant notices, IRS approval, lump-sum distributions. We'd ideally complete before {transaction_close} to keep the buyer's diligence clean. Excess assets, if any, need careful handling — reversion to {entity} would trigger 50% tax. Plan is to use any excess for a qualified replacement plan or pro-rata distribution to participants."

## CAVEATS & DISQUALIFIERS
- 6-12 month process from start to finish
- Excess asset reversion tax (50%) is severe; alternatives must be planned
- PBGC coverage and filings if applicable
- IRS determination letter recommended for closure

## REFERENCES
- IRC §401(a) — qualification (continued through termination)
- IRC §4980 — reversion tax
- ERISA §4041, §4044 — termination procedures
- IRS Form 5310 — request for determination
- PBGC Forms 500-series

## PLAN OUTPUT TEMPLATE

> **Plan to terminate the cash-balance plan in coordination with {transition_event}.** Process: 6-12 months from board resolution to final distributions. Steps: participant notices, full funding, IRS Form 5310, PBGC filings if applicable, lump-sum distributions to rollover IRAs, final Form 5500. Critical timing: complete termination before {target_date} to keep transaction diligence clean. Excess asset handling — if plan is over-funded, plan strategy avoids the 50% reversion tax through {qualified_replacement_plan | pro-rata_distribution}.
