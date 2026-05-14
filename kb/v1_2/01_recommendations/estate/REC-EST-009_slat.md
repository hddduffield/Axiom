# [REC-EST-009] — Spousal Lifetime Access Trust (SLAT)

## METADATA
- **ID:** REC-EST-009
- **Status:** Active-Cautioned
- **Category:** Estate
- **Engagement archetypes:** All HNW couples
- **Last verified:** April 2026

---

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.is_married == True
  - FR.both_spouses_us_citizen == True
  - Both spouses in stable health and marriage (SLAT permanently transfers from one spouse's estate)
  - Donor spouse has substantial exemption available to use (post-OBBBA $15M floor)
  - Family wants beneficiary access to trust funds via spouse during life

DISQUALIFY if:
  - Marriage instability (SLAT survives divorce; ex-spouse retains beneficiary status — catastrophic)
  - Both spouses want to do reciprocal SLATs without sufficient differentiation (reciprocal trust doctrine voids exclusion)
```

### Natural-language explanation
Donor-spouse establishes irrevocable trust for benefit of beneficiary-spouse (and children). Donor uses lifetime exemption to fund. Beneficiary-spouse can request distributions during life — providing indirect access to assets while keeping them outside both spouses' taxable estates.

### Hard disqualifiers
- **Reciprocal SLATs** — both spouses fund SLATs for each other in mirror image; IRS attacks under "reciprocal trust doctrine" and uncrosses, defeating exclusion
- **Marriage instability** — at divorce, beneficiary-spouse remains beneficiary of irrevocable trust; donor cannot recover

---

## WHAT IT IS

An irrevocable trust funded by one spouse (donor) for the benefit of the other spouse (beneficiary) and typically children. Donor uses lifetime exemption ($15M in 2026) to fund. Beneficiary-spouse can receive distributions during life (typically HEMS standard) — providing indirect access to trust funds while keeping the assets outside both spouses' taxable estates.

If donor predeceases beneficiary, beneficiary continues to access trust assets during her remaining life. At beneficiary's death, trust passes to remainder beneficiaries (typically children).

---

## WHY WE RECOMMEND IT

The structural elegance: donor spouse "gives away" assets using exemption (locking in current value plus future appreciation outside estate), but the family retains practical access to those assets via beneficiary-spouse's distributions. Best of both worlds — exemption use + retained access.

For HNW couples post-OBBBA: the $15M individual / $30M joint exemption is now permanent; SLAT lets donor-spouse efficiently use her or his $15M while preserving family liquidity.

---

## VARIATIONS AND STRUCTURAL OPTIONS

### Variation A — Single-direction SLAT
Donor-spouse establishes SLAT for beneficiary-spouse only (and remainder to children). Most common; simplest.

### Variation B — Sequenced SLATs (NOT reciprocal)
Spouse 1 establishes SLAT in year 1 with one set of terms; Spouse 2 establishes a DIFFERENT trust in year 3 with materially different terms (different trustee, different distribution standards, different remainder, different funding asset). Avoids reciprocal trust doctrine. Specialist counsel essential.

**WARNING:** the reciprocal trust doctrine is a real and frequently-litigated area; the differentiation must be substantive, not cosmetic.

### Variation C — Generation-skipping SLAT
SLAT structured for spouse + grandchildren rather than spouse + children. GST exemption allocated. More complex but powerful for multi-generational planning.

---

## QUANTIFIED IMPACT FRAMEWORK

### Worked example
- Donor-spouse exemption used: $5M of $15M available
- Funded with assets growing at 7%/year over 25 years: future value $27M
- $27M outside both spouses' estates
- At 40% federal estate tax: **$10.8M of estate tax avoided**
- Cost: $5M of lifetime exemption used; $10M remaining

### Range parameters
- `funding_amount` = portion of exemption to use
- `growth_horizon` = years to expected death/transfer event
- `growth_rate` = expected return on funding asset
- `future_value` = funding × (1+rate)^horizon
- `tax_avoided` = future_value × 40%

---

## IMPLEMENTATION STEPS

1. **Estate attorney drafts SLAT.** Trust terms include: HEMS distributions to spouse + children; trustee independent of grantor; remainder to children; specific drafting to avoid §2036 inclusion.
2. **Funding asset selection** — typically appreciating assets (real estate, business interests, securities)
3. **Form 709 filing** for the gift; documents lifetime exemption use
4. **Trust EIN, bank account, ongoing administration**
5. **Annual trustee reports**
6. **Beneficiary-spouse can request distributions** as needed; trustee considers HEMS standard

---

## SEQUENCING DEPENDENCIES

- **Coordinated WITH:** REC-EST-005 (Children's Trusts) — SLAT can serve as the children's trust or as a separate trust with overlap
- **Coordinated WITH:** REC-EST-006/008 (GRAT/IDGT) — SLAT can be the recipient/beneficiary trust
- **MUST AVOID:** Reciprocal trust doctrine if spouse is also doing similar trust

---

## DOCUMENTATION CHECKLIST
- [ ] SLAT trust document
- [ ] Trustee acceptance
- [ ] Trust EIN, bank account
- [ ] Funding documentation
- [ ] Form 709 filing
- [ ] Annual trustee accounting
- [ ] Distribution requests and trustee responses

---

## COMMON MISTAKES & AUDIT TRIGGERS
- **Reciprocal trust doctrine** — most common attack point
- **Donor as trustee** — compromises exclusion under §2036/§2038
- **Beneficiary-spouse with mandatory distribution rights** — could cause inclusion in beneficiary's estate
- **Funding source ambiguity** — funding from joint accounts muddles separateness
- **Divorce risk** — SLAT survives; ex-beneficiary spouse retains rights

---

## COORDINATION NOTES

### PSA Wealth role
Coordinates funding; tracks distributions; long-horizon administration.

### CPA role
Form 709. Trust tax filing. Income tax flows.

### Attorney role
Drafts. Specialist estate counsel essential.

---

## CLIENT CONVERSATION FRAMING

> "Spousal Lifetime Access Trust. {Donor_spouse} establishes an irrevocable trust for {beneficiary_spouse} and the children, using ${exemption_amount}M of {donor_spouse}'s $15M lifetime exemption. The funded assets and their future appreciation pass outside both your estates. {Beneficiary_spouse} can request distributions during her life — practical access — while the wealth remains protected. The catch is finality: SLAT survives divorce, so we proceed with this only when you both want it."

---

## CAVEATS & DISQUALIFIERS

- **Reciprocal trust doctrine is real and aggressive** — coordinated SLATs require substantive differentiation
- **Marriage stability** — irrevocable; ex-spouse retains beneficiary status
- **Donor death** — donor loses indirect access (beneficiary access continues)
- **Funding asset selection matters** — appreciating assets maximize value transfer

---

## REFERENCES
- **IRC §2036** — retained interests
- **IRC §2038** — revocable transfers
- **IRC §2056** — marital deduction (NOT used in SLAT — funding spouse uses exemption)
- **United States v. Estate of Grace, 395 U.S. 316 (1969)** — reciprocal trust doctrine
- **Estate of Newman v. Commissioner, T.C. Memo 2014-103** — reciprocal trust application

---

## PLAN OUTPUT TEMPLATE

> **Spousal Lifetime Access Trust (SLAT).** {Donor_spouse_first_name} establishes an irrevocable trust for {beneficiary_spouse_first_name} and the children, using ${exemption_K}K of {donor_spouse_first_name}'s lifetime exemption. The funded assets and their appreciation pass outside both estates while {beneficiary_spouse_first_name} retains access to distributions during her life. Estimated estate-tax savings on {growth_horizon}-year horizon: ${tax_savings}M.

**Variables:**
- `{donor_spouse_first_name}` / `{beneficiary_spouse_first_name}` = parsed from FR.2.1, FR.2.2
- `{exemption_K}` = amount of exemption used, in thousands
- `{growth_horizon}` / `{tax_savings}` = computed
