# [REC-TAX-009] — R&D Credit Study

## METADATA
- **ID:** REC-TAX-009
- **Status:** Active
- **Category:** Tax
- **Engagement archetypes:** Pre-Exit, Active-No-Exit, Post-Exit (if business income continues)
- **Plan section placement:** "Tax Strategy → 3C. Long-Term Considerations" or 3B
- **Last verified:** April 2026

---

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.has_business == True
  - FR.8.rd_credits_status == "No" OR "Not pursued"
  - Business has any of: proprietary engineering, custom software, process innovation, product development, prototype work
  - FR.3.3.latest_revenue > 5_000_000 (smaller businesses can qualify but study cost may not be justified)
```

### Natural-language explanation
Engage a specialty R&D credit firm for a feasibility study, then full study if positive. The federal R&D credit (IRC §41) and Georgia R&D credit (state-level) can produce meaningful annual tax credits for businesses doing qualifying technical work.

### Hard disqualifiers
- Pure-services business with no technical/process innovation component
- Business already aggressively claiming credits without prior study (audit risk)

---

## WHAT IT IS

The federal Research and Development Tax Credit (IRC §41) provides a credit for qualified research expenses (QREs) — wages, supplies, and contractor costs for activities meeting the four-part test: (1) permitted purpose, (2) elimination of uncertainty, (3) process of experimentation, (4) technological in nature. Specialty R&D credit firms perform engineering-driven studies to identify and document QREs.

Georgia also provides a state R&D credit that can be claimed concurrently.

---

## WHY WE RECOMMEND IT

For specialty contractors, manufacturers, and any business with proprietary engineering or process work, the credits are often substantial — typical findings: 4–12% of QREs as federal credit, plus state credit. For a $42M-revenue specialty mechanical contractor with custom controls and process-piping engineering work, $40K–$120K of annual credit is a typical range (cited in Holloway plan).

Specialty firms typically work on contingent or success-fee basis (often 25–30% of credit secured), so feasibility study is no-cost.

---

## QUANTIFIED IMPACT FRAMEWORK

### Worked example
- Estimated QREs: $1.5M (engineering wages, design supplies, prototype materials)
- Federal credit at ~10% of QREs: ~$150K
- Georgia credit (varies, [VERIFY 2026 — Georgia R&D credit currently structured]): additional ~$30K–$60K
- Specialty firm fee at 25%: ~$45K
- **Net annual benefit: ~$135K–$165K**

### Range parameters
- `qre_estimate` = depends on industry and proprietary work intensity
- `federal_credit_rate` = 4-12% effective
- `state_credit` = state-specific

---

## IMPLEMENTATION STEPS

1. Engage specialty R&D credit firm for feasibility review (typically free).
2. If positive, full study: engineering interviews, document collection, QRE quantification.
3. CPA reviews and incorporates credit on tax return (Form 6765).
4. Document defensibility: contemporaneous records of qualifying activities.
5. Annual recurrence — the strategy is renewable each year QREs continue.

---

## SEQUENCING DEPENDENCIES
- Independent.

---

## DOCUMENTATION CHECKLIST

- [ ] R&D credit firm engagement letter
- [ ] Engineering study report
- [ ] QRE backup documentation (employee time, project records, invoices)
- [ ] Form 6765 filed with return
- [ ] Form 8974 if claiming against payroll tax (small business option)
- [ ] State R&D credit form

---

## COMMON MISTAKES & AUDIT TRIGGERS

- **Aggressive QRE inflation** — common audit area; specialist firms often produce more defensible numbers than internal claims
- **Routine activities classified as R&D** — does not pass the four-part test
- **Insufficient contemporaneous documentation** — claim is fragile

---

## COORDINATION NOTES

### PSA Wealth role
- Identifies opportunity. Engages specialty firm. Tracks credit application.

### CPA role
- Files Form 6765. Coordinates with study firm.

### Specialty R&D firm role
- Performs the engineering study. Documents QREs. Defends in audit if challenged.

---

## CLIENT CONVERSATION FRAMING

> "Specialty credits review. {Entity_name} likely qualifies for federal R&D credits on its proprietary {industry-specific work descriptor}, possibly $40K–$120K annually. We will engage a specialty credits firm for a no-cost feasibility review."

---

## CAVEATS & DISQUALIFIERS

- IRS scrutiny in this area increased in recent years; engage firms with audit-defense track record
- §174 amortization rules (post-TCJA) require capitalization of certain R&D costs over 5 years — coordinated with credit claim

---

## REFERENCES

- **IRC §41** — research credit
- **IRC §174** — research and experimental expenditures (capitalization rules)
- **Form 6765** — credit for increasing research activities
- **Form 8974** — qualified small business payroll tax credit

---

## PLAN OUTPUT TEMPLATE

> **Specialty credits review.** {Entity_name} likely qualifies for federal R&D credits on its proprietary {work_descriptor}, possibly ${low}K–${high}K annually. We will engage a specialty credits firm for a no-cost feasibility review.

**Variables:**
- `{entity_name}` = FR.3.1
- `{work_descriptor}` = derived from FR.3.1.operations_description
- `{low}/{high}` = scaled to revenue size
