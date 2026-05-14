# [REC-EST-004] — ILIT (Irrevocable Life Insurance Trust)

## METADATA
- **ID:** REC-EST-004
- **Status:** Active
- **Category:** Estate / Insurance
- **Engagement archetypes:** All HNW with insurance
- **Plan section placement:** "Estate Planning → Step 3 — ILIT for buy/sell and estate liquidity"
- **Last verified:** April 2026

---

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.estate_exceeds_exemption == True
  - At least ONE of:
      - REC-RSK-001 (Cross-Purchase Buy/Sell) is being placed
      - REC-RSK-004 (Estate Liquidity Life) is recommended
      - Existing personal-owned life insurance is creating estate inclusion
  - FR.4.has_ilit == False (no existing ILIT)

DISQUALIFY if:
  - No life insurance in plan or in force
  - Estate is below exemption with no growth expected
```

### Natural-language explanation
Irrevocable trust that owns life insurance. Premiums funded via Crummey-noticed gifts. Death benefit passes outside taxable estate, providing income- and estate-tax-free liquidity.

### Hard disqualifiers
- 3-year lookback risk: ILIT created and existing personal policies transferred to it; if insured dies within 3 years, proceeds pulled back into estate
- Trustee selection compromises (spouse/beneficiary trustee may compromise exclusion)

---

## WHAT IT IS

An irrevocable trust that applies for, owns, and is the beneficiary of life insurance on the insured. Premiums flow into the trust via Crummey-noticed annual gifts from the insured (or insured + spouse via gift-splitting). At death, trust receives proceeds (income-tax-free under §101(a) and estate-tax-free because trust is not in insured's estate); proceeds are then distributed per trust terms.

---

## WHY WE RECOMMEND IT

Personal-owned life insurance on the insured is INCLUDED in the taxable estate at death (§2042 incidents-of-ownership). On a $5M policy: adds $5M to estate, triggers $2M federal estate tax at 40%.

ILIT-owned insurance: proceeds pass outside taxable estate. Same $5M policy → $2M estate tax avoided. For HNW with material estate exposure, this is one of the highest-leverage moves.

---

## QUANTIFIED IMPACT FRAMEWORK

### Worked example (Holloway-style)
- Recommended life insurance program: $5M buy/sell on Marcus + $4M estate liquidity = $9M total
- ILIT-owned: $9M passes outside taxable estate
- Federal estate tax avoided at 40%: **$3.6M of estate tax saved**
- Annual premium funding: assume $80K/year (varies by carrier/health)
- Premium gifted via Crummey: $80K can fit within annual exclusion if 4+ trust beneficiaries (4 × $19K × 2 spouses = $152K capacity)
- **No use of lifetime exemption** required for premium funding

### Range parameters
- `face_amount_total` = sum of REC-RSK-001 + REC-RSK-004 face amounts
- `annual_premium` = quote-driven from carrier underwriting
- `crummey_capacity` = $19K × 2 × beneficiary count
- `tax_savings` = face_amount × 40% (federal estate tax)

---

## IMPLEMENTATION STEPS

1. Estate attorney drafts ILIT document. Trustee selection: corporate trustee or non-spouse non-beneficiary individual (parents/spouse as trustee compromises exclusion).
2. ILIT obtains EIN; opens trust bank account.
3. **ILIT applies for and owns the policy from inception** (avoids 3-year lookback under §2035).
4. Annual premium funding flows via Crummey-noticed gifts; trustee sends Crummey notices to beneficiaries.
5. Trustee maintains records: notices sent, demand period, premium payments, beneficiary designations.
6. Coordinate with REC-EST-001 (Joint Revocable Trust) on overall estate plan integration.
7. Annual review of coverage adequacy and premium funding.

---

## SEQUENCING DEPENDENCIES

- **MUST be in place BEFORE:** insurance binding for any ILIT-owned coverage (ILIT applies as policyowner from inception; avoids 3-year lookback)
- **Coordinated WITH:** REC-EST-001 (Joint Revocable Trust)
- **Coordinated WITH:** REC-RSK-004 (Estate Liquidity Life) — this is the coverage the ILIT actually owns
- **NOT coordinated with cross-purchase ownership:** REC-RSK-001 cross-purchase policies are owner-owned, not ILIT-owned. The ILIT does not own the buy/sell mechanism; it owns a *separate* estate-liquidity layer on the primary owner.
- **Coordinated WITH:** REC-EST-003 (Annual Exclusion Gifting) — premium dollars flow via Crummey gifts

---

## DOCUMENTATION CHECKLIST

- [ ] ILIT trust document
- [ ] Trustee acceptance
- [ ] Trust EIN
- [ ] Trust bank account
- [ ] Insurance application by trust
- [ ] Annual Crummey notices (with return receipts or acknowledgments)
- [ ] Premium payment records
- [ ] Annual trustee reports
- [ ] Form 709 if premium funding exceeds annual exclusion

---

## COMMON MISTAKES & AUDIT TRIGGERS

- **3-year lookback violation:** transferring existing personal policy to ILIT and insured dies within 3 years → proceeds pulled into estate (§2035)
- **Crummey notice failures:** without timely written notice and demand period, gifts don't qualify for annual exclusion
- **Trustee-as-beneficiary compromise:** spouse or beneficiary as trustee may give incidents of ownership → §2042 inclusion
- **Premium funding from joint accounts:** must be from insured (or with gift-splitting election, both spouses); muddled funding paths invite scrutiny
- **Failure to send Crummey notices:** the annual mechanic that keeps the strategy alive

---

## COORDINATION NOTES

### PSA Wealth role
- Coordinates ILIT setup with attorney. Manages premium funding. Tracks Crummey notice cycle. Annual review.

### CPA role
- Trust EIN. Form 709 if needed. Tracks gift cumulative.

### Attorney role
- Drafts ILIT. Specialist estate counsel.

### Trustee
- Corporate trustee preferred (institutional independence) or non-beneficiary individual.

---

## CLIENT CONVERSATION FRAMING

> "Step 3 — ILIT for buy/sell and estate liquidity. Establish an Irrevocable Life Insurance Trust to own the new buy/sell life insurance on {primary_owner_first_name} (recommended ${buy_sell_face}M) and an additional layer of estate liquidity coverage (recommended ${liquidity_face}M). Owned in the trust, the proceeds pass outside the taxable estate and provide the liquidity that keeps the family from being forced to sell the business under pressure. Annual premiums funded through Crummey gifting."

---

## CAVEATS & DISQUALIFIERS

- **3-year lookback (§2035):** existing personal policies transferred to ILIT carry 3-year risk; best practice: ILIT applies for new coverage
- **Crummey notice mechanics non-negotiable** — written notice, time to demand, documentation
- **Trustee selection matters** — corporate or non-beneficiary individual preferred
- **ILIT is irrevocable** — explain trade-off to client clearly: control given up for tax benefit

---

## REFERENCES

- **IRC §2035** — 3-year lookback (life insurance)
- **IRC §2042** — incidents of ownership
- **IRC §2503(b)** — annual exclusion
- **IRC §101(a)** — death benefit income-tax exclusion
- **Crummey v. Commissioner, 397 F.2d 82 (9th Cir. 1968)**

---

## PLAN OUTPUT TEMPLATE

> **Step 3 — ILIT for estate liquidity.** Establish an Irrevocable Life Insurance Trust (ILIT) to own ${liquidity_face}M of permanent coverage on you. Owned in the trust, the proceeds pass outside the taxable estate and provide the liquidity that keeps the family from being forced to sell the business under pressure at death. Annual premiums funded through Crummey gifting.
>
> The cross-purchase buy/sell policies (REC-RSK-001) are **separate** and remain owner-owned by you and {co_owner_first_name} on each other — they are not held in the ILIT. The ILIT exclusively holds the estate-liquidity layer described above.

**Variables:**
- `{primary_owner_first_name}` = parsed from FR.2.1
- `{co_owner_first_name}` = from FR.3.2.owners (when applicable)
- `{liquidity_face}` = from REC-RSK-004 sizing — sized to projected estate-tax obligation, NOT to buy-out value
- Cross-reference: REC-RSK-001 plan output template handles the cross-purchase mechanism separately
