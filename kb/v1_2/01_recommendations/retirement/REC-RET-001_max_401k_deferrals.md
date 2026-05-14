# [REC-RET-001] — Maximize 401(k) Deferrals (Including Catch-Up)

## METADATA
- **ID:** REC-RET-001
- **Status:** Active
- **Category:** Retirement
- **Engagement archetypes:** All
- **Plan section placement:** "Recommendations — Retirement & Benefits"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.has_business == True OR client is W-2 employee
  - 401(k) plan in place (FR §10) OR plan establishment recommended
  - Owner/spouse not at deferral cap currently (FR.10.primary_at_deferral_cap == False)
  - Owner/spouse 21+ (almost always satisfied)

DISQUALIFY if:
  - Income too low to absorb deferral
  - SEP-IRA or SIMPLE in place (different limits, separate rec)
  - SECURE 2.0 mandatory Roth catch-up not yet operational at the plan (then prior-year wages over $150K need plan amendment first)
```

### Natural-language explanation
401(k) deferrals are the foundational retirement contribution for owner-clients. 2026 limits: $24,500 base + $8,000 catch-up at 50+ = $32,500 (50+); super catch-up at 60-63 raises this to $35,750. Beyond deferrals, profit-sharing and after-tax mega-backdoor Roth (REC-RET-004) push further into the §415(c) $72,000 cap. SECURE 2.0 effective 2026: catch-up MUST be Roth for participants with prior-year FICA wages > $150,000.

### Hard disqualifiers
- Plan does not support Roth (and high-earning client requires Roth catch-up under SECURE 2.0) — must amend first

## WHAT IT IS
Standard 401(k) deferral maximization. For 2026:
- Base deferral cap: $24,500
- Catch-up at 50+: $8,000 (must be Roth if prior-year FICA wages > $150K)
- Super catch-up 60-63: $11,250 (replaces $8,000)
- §415(c) overall: $72,000 (employee + employer + after-tax)

## WHY WE RECOMMEND IT
Tax-deferred growth + employer match capture (where available) + ordinary-income tax deferral at peak earning years. For HNW clients, also serves as ERISA-protected asset (federal creditor protection in bankruptcy).

## VARIATIONS
- **Traditional 401(k):** pre-tax deferral; tax-deferred growth; ordinary income at distribution
- **Roth 401(k):** post-tax; tax-free growth and distribution; no RMDs after SECURE 2.0
- **Mix:** strategic split between traditional and Roth based on current vs. expected retirement bracket

## QUANTIFIED IMPACT FRAMEWORK

### Components
- Pre-tax deferral × marginal rate = current-year tax saving
- Tax-deferred (or tax-free if Roth) growth on contributions
- Asset protection in qualified plan (federal preemption of creditor claims)

### Worked example (Holloway-style, age 52, both spouses)
- Marcus deferral cap: $24,500 + $8,000 catch-up = $32,500
- Catherine deferral cap (assumes she's on payroll at sufficient W-2): same
- Combined deferral: $65,000
- At 37% marginal rate: $24,050 of current-year tax savings
- After 25 years at 7% growth: ~$4.4M tax-deferred at retirement (combined)

## IMPLEMENTATION STEPS
1. **Confirm deferral limits and current contribution amounts** with plan provider
2. **For owners 50+ with FICA wages >$150K (2025):** confirm plan supports Roth catch-up; if not, plan amendment required (REC-RET-007)
3. **Adjust deferral elections** for next pay period to hit annual cap
4. **Coordinate with profit-sharing layer** (REC-RET-003) for total §415(c) maximization
5. **Annual review** — cap increases yearly

## SEQUENCING DEPENDENCIES
- **COORDINATED WITH:** REC-RET-002 (cash balance), REC-RET-003 (profit sharing layer), REC-RET-004 (mega backdoor Roth)
- **Prerequisites:** REC-RET-007 if plan amendment needed for Roth/after-tax features

## DOCUMENTATION CHECKLIST
- [ ] Current deferral amount documented
- [ ] Updated deferral election submitted
- [ ] Plan supports Roth catch-up (if needed)
- [ ] Annual cap tracking

## COMMON MISTAKES
- SECURE 2.0 Roth catch-up requirement missed (effective 2026; affects high earners)
- Catch-up not started in year of 50th birthday (eligible from January 1 of that year)
- Spouse on payroll but not enrolling in 401(k) — leaves deferral capacity unused
- Excess contributions across multiple plans (rare but possible)

## COORDINATION NOTES
- **PSA Wealth:** annually flags; coordinates with plan provider
- **CPA:** confirms Roth-vs-traditional optimization
- **Plan provider/TPA:** election processing
- **Attorney:** typically not involved unless plan amendment needed

## CLIENT CONVERSATION FRAMING
> "Maximize the 401(k) deferral. For 2026 that's $24,500 base, $8,000 catch-up at 50+, $11,250 super catch-up at 60-63. Combined household: ${combined_household_amount}. Tax savings at your bracket: roughly ${tax_savings} this year alone. Note: SECURE 2.0 says your catch-up has to be Roth in 2026 if you made over $150K in 2025 wages — we'll confirm with the plan provider that they support that."

## CAVEATS & DISQUALIFIERS
- Plan-specific rules (matching schedule, vesting) may affect timing
- Some plans use prior-year compensation; election timing matters
- HCE testing may limit what owners can defer (cured with safe-harbor or proper testing)

## REFERENCES
- IRC §402(g) — deferral limit
- IRC §414(v) — catch-up contributions
- IRC §414(v)(7) — SECURE 2.0 Roth catch-up mandate
- IRS Notice 2025-67 — 2026 limits

## PLAN OUTPUT TEMPLATE

> **Maximize 401(k) deferrals.** {Owner_name}: defer $24,500 base + $8,000 catch-up = $32,500 (or $35,750 if age 60-63). {Spouse_name (if on payroll)}: same. Combined household deferral target: ${household_target}. {If FICA wages > $150K in 2025: "Catch-up must be Roth under SECURE 2.0 effective 2026 — verify plan supports Roth contributions."}
>
> Tax impact at current bracket: approximately ${tax_savings} of current-year federal tax savings, plus tax-deferred (or tax-free if Roth) compounding.
