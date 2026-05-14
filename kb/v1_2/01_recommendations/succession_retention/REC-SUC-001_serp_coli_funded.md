# [REC-SUC-001] — SERP for Key Employees (COLI-Funded)

## METADATA
- **ID:** REC-SUC-001
- **Status:** Active
- **Category:** Succession & Retention
- **Engagement archetypes:** Pre-Exit, Active-No-Exit
- **Plan section placement:** "Recommendations — Business" → "Key Employee Retention"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.has_business == True
  - 1+ key employee critical to business value
  - Existing qualified-plan benefits insufficient for HCE retention
  - FR.10.has_serp == False
  - Business has cash flow to fund SERP

DISQUALIFY if:
  - No identifiable key employees beyond owner
  - 409A risk too high for client risk tolerance
```

### Natural-language explanation
A Supplemental Executive Retirement Plan (SERP) is a non-qualified deferred compensation arrangement providing key employees with retirement benefits beyond what qualified plans permit. Funded informally with corporate-owned life insurance (COLI) — death benefit reimburses business; cash value accumulates as informal funding for benefit obligations.

### Hard disqualifiers
- §409A non-compliance impossible to avoid
- Inability to track unfunded promise as long-term obligation

## WHAT IT IS
A non-qualified deferred compensation plan promising defined retirement benefits to specified key employees. Benefits are an unfunded promise (general creditor of business). Business often informally funds with COLI on the executive's life — cash value backs the future benefit; on death, business is reimbursed and pays surviving family per agreement. Subject to §409A.

## WHY WE RECOMMEND IT
Key employees beyond the deferral cap need additional retention compensation. SERP creates contractual benefit aligned with continued service (vesting). Loss of executive before vesting → no benefit owed. Funded benefit grows with cash value.

## QUANTIFIED IMPACT FRAMEWORK

### Components
- Annual contribution (informal funding via COLI premium)
- Cash value buildup (corporate asset)
- Vested benefit obligation (corporate liability)
- Tax: deductible to business when paid out (not when accrued)

### Worked example
Key employee age 45, current $300K W-2:
- SERP target: $50K/year additional retirement benefit at 65, paid 15 years
- Informal funding: $25K/year COLI premium
- 20-year accumulation: ~$1M cash value
- On death pre-65: COLI death benefit reimburses business; family receives benefit per agreement
- On retirement at 65: business pays $50K/year for 15 years, deductible when paid

## IMPLEMENTATION STEPS
1. Identify key employees and target benefit amounts
2. Engage specialist NQDC counsel for §409A-compliant plan document
3. Establish vesting schedule (typically cliff or graded over 5-10 years)
4. Issue COLI policies on each covered executive
5. **§101(j) notice-and-consent** prior to policy issuance
6. Annual administration: contributions, vesting tracking, balance reporting
7. Participant communication

## SEQUENCING DEPENDENCIES
- **COORDINATED WITH:** REC-SUC-002 (stay bonus), REC-RSK-007 (key person life — different but related)

## DOCUMENTATION CHECKLIST
- [ ] §409A-compliant plan document
- [ ] Participant agreements with vesting schedules
- [ ] COLI policies on participants with §101(j) consents
- [ ] Form 8925 annually
- [ ] Annual statement of accrued benefit
- [ ] Trust or rabbi trust if used

## COMMON MISTAKES
- §409A timing violations (deferral elections, distribution timing)
- §101(j) consent miss → COLI death benefit taxable
- Failing to fund informally — promise without backing
- Disclosed in audit / due diligence as liability without value (acquirer concern)

## COORDINATION NOTES
- **PSA Wealth:** plan design, COLI placement, ongoing
- **CPA:** §409A compliance, deductibility timing
- **Attorney:** specialist NQDC drafting; §409A is technical
- **Plan administrator:** annual benefit tracking

## CLIENT CONVERSATION FRAMING
> "{Key_employee} is critical to {business_name}'s value. Beyond their 401(k), we add a SERP — a contractual promise of additional retirement benefit, vested over time. We informally fund with corporate-owned life insurance on them; cash value backs the promise; if they die before retirement, business is reimbursed and family receives the benefit. If they leave before vesting, no benefit owed."

## CAVEATS & DISQUALIFIERS
- §409A rigid; mistakes have severe consequences
- Promise is unfunded for ERISA purposes; participants are general creditors
- Acquirer in transaction may demand modification or termination

## REFERENCES
- IRC §409A — non-qualified deferred compensation
- IRC §101(j) — employer-owned life insurance
- ERISA Title I — top-hat plan exemption
- Treas. Reg. §1.409A-1 et seq.

## PLAN OUTPUT TEMPLATE

> **SERP for {key_employee_list}.** Supplemental Executive Retirement Plan, employer-funded, with a {vest_schedule} cliff vest tied to a transaction event (or to {alt_years} years of continued service, whichever comes first). Funding: ${primary_serp_amount}/year for {primary_key_employee}{additional_serp_clause}. Structure: informally funded with corporate-owned life insurance (COLI) so the cash value provides the funding asset and the insurance creates a death benefit hedge. §409A-compliant plan document drafted by specialist NQDC counsel; §101(j) notice-and-consent signed before COLI policies issue.

**Variables:**
- `{key_employee_list}` = list of senior employees getting SERP (Holloway: "Derek and the controller")
- `{vest_schedule}` = "7-year" default; firm-policy item
- `{alt_years}` = same as vest schedule
- `{primary_serp_amount}` = sized to executive comp ($80K Derek; $40K controller per Holloway)
- `{primary_key_employee}` = first/most senior key employee getting SERP
- `{additional_serp_clause}` = ", ${secondary_serp_amount}/year for {secondary_key_employee}" if multiple recipients

### Holloway-section reference for depth target

Holloway plan, Section 6, "SERP for Derek and the controller" bullet — specifies:
1. Beneficiaries: "Derek and the controller"
2. Vesting structure: "7-year cliff vest tied to a transaction event (or to 7 years of continued service, whichever comes first)"
3. Specific dollar amounts: "$80K/year for Derek, $40K/year for the controller"
4. Funding mechanism: "informally funded with corporate-owned life insurance (COLI)"
5. Dual purpose: "cash value provides the funding asset and the insurance creates a death benefit hedge"

Original template captured the structure but was thinner on the dual-vesting language, the matched-pair amounts, and the dual-purpose COLI framing.
