# [REC-TAX-003] — Spouse on Payroll

## METADATA
- **ID:** REC-TAX-003
- **Status:** Active
- **Category:** Tax / Retirement / Insurance
- **Engagement archetypes:** Pre-Exit, Active-No-Exit
- **Plan section placement:** "Tax Strategy → 3A. Implement This Year"
- **Last verified:** April 2026

---

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.is_married == True
  - FR.2.2.w2_income == 0 OR FR.2.2.w2_income < 50_000
  - FR.has_business == True
  - FR.spouse_on_payroll == False
  - At least ONE of:
      - FR.2.2.occupation involves family business / marketing / administrative work
      - FR.10.primary_at_deferral_cap == True (need spousal deferral capacity)
      - FR.has_minor_children == True (enables family-employed children path)
      - FR.6.1.primary_owner_w2 > 200_000 (creates household where spousal W-2 is incremental)

DISQUALIFY if:
  - Spouse already employed elsewhere with adequate retirement-plan capacity
  - Spouse performing no legitimate work for the business (paper position only)
  - State child-labor restrictions or other practical impediments
```

### Natural-language explanation
Add the non-employee spouse to payroll at a defensible salary ($40K–$80K) for legitimate work performed for the business. Unlocks 401(k) deferral, profit-sharing, individual DI eligibility, backdoor Roth path, and clean architecture for family-employed children.

### Hard disqualifiers
- No legitimate role exists; payroll-only-on-paper invites reclassification
- Spouse explicitly refuses W-2 status (rare but possible for personal reasons)

---

## WHAT IT IS

Add the non-employee spouse to the business payroll at a defensible salary commensurate with actual work performed (marketing, administrative coordination, board service, family-business management). The wage is W-2 income to the spouse, deductible to the business as compensation, and FICA-subject.

---

## WHY WE RECOMMEND IT

Five concurrent benefits, any one of which justifies the strategy at HNW levels:

1. **401(k) deferral capacity** — spouse can defer up to $24,500 (2026) plus catch-up at 50+, opening $24,500–$32,500/year of additional pre-tax retirement saving
2. **Social Security earnings record** — spouse builds independent SS benefit
3. **Independent insurability** — spouse becomes eligible for individual disability insurance (which requires earned income); critical hedge if primary owner's career or income is disrupted
4. **Backdoor Roth eligibility** — spouse can independently make backdoor Roth contributions (subject to pro-rata rule)
5. **Family-employed children path** — establishes the family-business architecture for paying minor children for legitimate work (REC-TAX-004)

The cost: FICA (~7.65% employer + employee = ~15.3% combined effective on wages up to $184,500) and modest payroll administration. At a $50K spouse W-2, FICA is ~$7,650, but the retirement-plan and insurance benefits substantially exceed that.

---

## VARIATIONS AND STRUCTURAL OPTIONS

### Variation A — Direct W-2 from operating entity
Standard. Spouse on operating S-Corp payroll. Subject to FICA on all wages.

### Variation B — Family management LLC
For more complex situations: spouse is W-2 of a separate family-management LLC that contracts with operating entity. Allows different optimization (e.g., FICA-exempt treatment of certain payments). Adds administrative complexity. **For Holloway-scale clients, typically not worth the complexity unless multiple objectives align.**

### Variation C — Board director compensation
If the operating entity has a board, spouse can be compensated as a director for legitimate director-role work. Director compensation is a separate compensation category from employee W-2; can be set up with different optimization. **Coordinate with attorney; documentation matters.**

---

## QUANTIFIED IMPACT FRAMEWORK

### Worked numerical example
**Catherine Holloway scenario:** $0 current W-2; legitimate marketing/admin role available.

**Set salary at $50,000:**
- Tax-deductible at business level: $50K × 37% federal + 5.19% GA = ~$21K of business-level tax savings (before FICA)
- FICA cost (employer + employee): $50K × 15.3% = ~$7,650
- 401(k) deferral capacity opened: $24,500 ($32,500 if 50+) — pre-tax, immediate $9K+ federal tax savings
- Profit-sharing layer at 25%: up to $12,500 additional (capped at $72K §415 combined)
- Individual DI: spouse newly insurable for ~$3K-$4K/month tax-free benefit at ~$1,500-2,000/yr premium
- Backdoor Roth: $7,500 per spouse × 2 already, but spouse's pro-rata calculation simplified
- Net annual benefit: **~$15,000–$25,000** depending on retirement plan capacity utilized
- Plus ongoing access to family-employed-children custodial Roth path

### Range parameters
- `recommended_salary_floor` = $40,000 (defensible for part-time admin/marketing role)
- `recommended_salary_ceiling` = $80,000 (defensible for substantive role)
- `optimal_salary` = analyzed case-by-case based on time commitment, retirement-plan goals, FICA capacity

---

## IMPLEMENTATION STEPS

1. **Document the role.** Job description, time commitment, deliverables. This is the audit-defense file.
2. **Set salary** at defensible level for the role (industry benchmark for marketing director, admin coordinator, or relevant comparable).
3. **Add to payroll** through existing payroll provider. Coordinate with CPA on tax withholding.
4. **Enroll in 401(k)** once eligible per plan terms (typically 90 days for new employees; some plans waive for owner-spouses).
5. **Underwrite individual DI** once income is established (typically 6–12 months of W-2 history).
6. **Document quarterly** what work was done — retain emails, deliverables, meeting attendance.

---

## SEQUENCING DEPENDENCIES

- **Independent.** Can be implemented immediately.
- **Enables:** REC-TAX-004 (Family-Employed Children with Custodial Roths)
- **Enables:** REC-RSK-005 (Spouse Individual DI Underwriting)
- **Coordinated WITH:** REC-RET-001 (Maximize 401(k) Deferrals — both spouses)

---

## DOCUMENTATION CHECKLIST

- [ ] Written job description and role responsibilities
- [ ] Compensation rationale (industry benchmark or comparable analysis)
- [ ] Payroll setup confirmation
- [ ] First W-2 issued
- [ ] 401(k) enrollment paperwork
- [ ] Individual DI underwriting initiated
- [ ] Quarterly file: deliverables, time logs, evidence of legitimate work

---

## COMMON MISTAKES & AUDIT TRIGGERS

- **Paper position with no real work** — IRS reclassifies wages as constructive distribution; deduction lost; comp recharacterized
- **Round-number salary unrelated to role** — $52,000 looks chosen to hit Roth phase-out math; $50,000 with documented part-time scope is more defensible
- **No documentation of work performed** — if asked, "what does she do?" the answer must be specific and verifiable
- **Spouse simultaneously withdrawing K-1 distributions while drawing W-2** — okay if structured properly but watch for self-dealing optics

---

## COORDINATION NOTES

### PSA Wealth role
- Frames the strategy. Coordinates with insurance underwriting for spousal DI. Tracks 401(k) enrollment.

### CPA role
- Confirms payroll setup. Files quarterly tax payments. Reflects on personal return at year-end.

### HR/Payroll provider
- Adds spouse to payroll system. Issues W-2.

---

## CLIENT CONVERSATION FRAMING

> "{Spouse_name} is doing real work for the business — marketing coordination, family-business affairs, board engagement — and currently isn't on payroll. Adding her at a defensible $50K opens her own 401(k) deferral capacity ($24,500/year of pre-tax savings on top of {primary_owner}'s), makes her independently insurable for individual disability — which she's not now — and creates the clean structure for paying the kids for legitimate work and funding their custodial Roth IRAs. The FICA cost is real but small, and the combined benefit is materially larger."

---

## CAVEATS & DISQUALIFIERS

- **State-specific labor law:** confirm any state-level requirements for spouse-employees
- **Health insurance dynamics:** spouse-as-employee may change health-plan eligibility; coordinate with HR/broker
- **Documentation discipline required:** the work must be real and documented

---

## REFERENCES

- **IRC §162** — deductibility of compensation
- **IRC §3121** — FICA on wages
- **IRC §401** — qualified plan eligibility
- **Treas. Reg. §1.162-7** — reasonable compensation for deductibility

---

## PLAN OUTPUT TEMPLATE

> **Add {spouse_first_name} to payroll.** {Spouse_first_name} is not currently on payroll. Adding her at a defensible salary (estimate ${salary_floor}K–${salary_ceiling}K for legitimate {role_descriptor} work) opens her own 401(k) deferral capacity, allows her to qualify for backdoor Roth contributions independent of you, and creates a clean path to fund custodial Roths for the children through the family business.

**Variables:**
- `{spouse_first_name}` = parsed from FR.2.2.full_legal_name
- `{salary_floor}` / `{salary_ceiling}` = $40 / $80 (or analyzed case-specific)
- `{role_descriptor}` = derived from FR.2.2.occupation or FR's hard constraints
- `{primary_owner_first_name}` = parsed from FR.2.1.full_legal_name
