# [REC-TAX-010] — Withholding Adjustment to Current Projections

## METADATA
- **ID:** REC-TAX-010
- **Status:** Active
- **Category:** Tax
- **Engagement archetypes:** All
- **Plan section placement:** "Tax Strategy → 3A. Implement This Year"
- **Last verified:** April 2026

---

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if:
  - Material change in income vs. prior year (>20% change)
  - OR significant change in tax structure (PTET election, new entity, business growth)
  - OR last withholding adjustment >2 years old
```

### Natural-language explanation
Update W-2 withholding (and quarterly estimated payments for K-1 income) to match current-year projected liability. Avoids cash-flow drag of over-withholding and underpayment penalties from under-withholding.

### Hard disqualifiers
- None

---

## WHAT IT IS

Adjustment of W-4 withholding and quarterly estimated payments to match current-year projected federal and state tax liability. Routine but often overlooked.

---

## WHY WE RECOMMEND IT

Income at HNW levels often grows materially year-over-year; withholding set against an income profile from 2 years ago either over-withholds (cash-flow drag — interest-free loan to government) or under-withholds (penalty exposure under §6654).

For owners with both W-2 and K-1 income, the analysis includes both withholding (Form W-4) and quarterly estimated payments.

---

## QUANTIFIED IMPACT FRAMEWORK

### Worked example
- Owner W-2 $480K with withholding set against $300K of K-1 income; current year K-1 will be $3.4M
- Without adjustment: $1M+ of underpayment by year-end → §6654 penalty
- Penalty rate: short-term AFR + 3 percentage points (varies; ~7-8% currently)
- Penalty exposure: $1M × 0.5 (half-year average) × 8% = $40K of penalty avoidable

### Range parameters
- `current_year_projected_tax`
- `current_withholding_pace`
- `penalty_rate` (federal underpayment rate, varies)

---

## IMPLEMENTATION STEPS

1. CPA produces current-year tax projection.
2. Compute required withholding/estimates to satisfy 110% of prior-year safe harbor.
3. Submit updated W-4 to payroll.
4. Set quarterly estimated payment schedule (April 15, June 15, September 15, January 15).
5. Mid-year reconciliation (typically September) to confirm pace.

---

## SEQUENCING DEPENDENCIES
- Independent.

---

## DOCUMENTATION CHECKLIST
- [ ] Current-year tax projection memo from CPA
- [ ] Updated W-4 on file with employer
- [ ] Quarterly estimated payment schedule
- [ ] Mid-year true-up

---

## COMMON MISTAKES & AUDIT TRIGGERS
- Failing to use the 110% prior-year safe harbor (applies to AGI > $150K)
- Over-reliance on withholding when K-1 distributions dominate income

---

## COORDINATION NOTES

### PSA Wealth role
- Coordinates the projection. Tracks the schedule.

### CPA role
- Produces projection. Files quarterly estimates. Reconciles at year-end.

---

## CLIENT CONVERSATION FRAMING

> "Adjust withholding to match projected liability. Current withholding is set against an income profile from two years ago. Update against current-year projections to avoid both over-withholding (cash flow drag) and under-withholding penalties."

---

## CAVEATS & DISQUALIFIERS
- 110% safe harbor for AGI >$150K (not 100%)
- State estimated payments separate from federal

---

## REFERENCES
- **IRC §6654** — underpayment penalty
- **IRC §6655** — corporate underpayment (relevant for entity-level PTET)
- **Form W-4** — withholding allowance certificate
- **Form 1040-ES** — quarterly estimates

---

## PLAN OUTPUT TEMPLATE

> **Adjust withholding to match projected liability.** Current withholding is set against an income profile from two years ago. Update against {current_year} projections to avoid both over-withholding (cash flow drag) and under-withholding penalties.

**Variables:**
- `{current_year}` = current tax year
