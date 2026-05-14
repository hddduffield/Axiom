# [REC-EST-008] — Sale to Intentionally Defective Grantor Trust (IDGT)

## METADATA
- **ID:** REC-EST-008
- **Status:** Active
- **Category:** Estate
- **Engagement archetypes:** Pre-Exit, Active-No-Exit (HNW)
- **Plan section placement:** "Estate Planning → Step 6 — IDGT Sale"
- **Last verified:** April 2026

---

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - At least ONE of (recap satisfied):
      - FR.4.recap_complete == True
      - REC-ENT-003 also triggers in this same plan (SEQUENCED WITH)
  - At least ONE of (recipient trust satisfied):
      - FR.4.has_childrens_trusts == True OR a separate IDGT is established
      - REC-EST-005 also triggers in this same plan (SEQUENCED WITH)
  - Donor willing to seed trust with 10% of intended asset transfer (the seed)
  - Qualified appraisal in hand for non-voting interest, OR commissioning the appraisal is part of the plan workflow
  - Asset growth expected above AFR rate (mid-term AFR for note)
  - Donor in good health (unlike GRAT, mortality during note term doesn't pull asset back, but income tax obligation continues to grantor's estate)

DISQUALIFY if:
  - Donor's exemption capacity exhausted such that 10% seed gift creates hard tax liability
  - Asset doesn't appreciate above AFR (note interest exceeds growth — defeats purpose)
```

### Natural-language explanation
Sell non-voting interest to a grantor trust in exchange for an installment note at AFR. No gain recognized (sale to one's own grantor trust under Rev. Rul. 85-13). Note interest paid back to grantor; asset growth above AFR transfers to trust beneficiaries free of gift tax.

### Hard disqualifiers
- Trust not properly seeded (seed gift typically 10%+ of intended sale value to give trust independent capacity)
- Note rate below AFR (gift element)
- Donor's grantor-trust status not properly established (income tax mechanism failure)

---

## WHAT IT IS

A defective grantor trust ("intentionally defective" because it's intentionally structured to be grantor for income tax but non-grantor for estate tax) purchases an asset from the grantor in exchange for an installment note at AFR. Mechanics:
- **Step 1:** Donor seeds trust with ~10% of intended sale value (uses some lifetime exemption)
- **Step 2:** Trust uses seed + note to purchase asset from donor at appraised value
- **Step 3:** Donor receives installment note paying AFR interest (no gift; sale at FMV)
- **Step 4:** Asset grows in trust; income flows back to grantor (defective for income tax) but trust assets are outside estate
- **Step 5:** Note repaid over term; remaining growth transferred to trust beneficiaries
- **Critical:** Sale to grantor trust does NOT trigger gain (Rev. Rul. 85-13) — same person on both sides for income tax

---

## WHY WE RECOMMEND IT

The IDGT structure has key advantages over GRAT:
- **No mortality risk during note term** (unlike GRAT, death during note doesn't pull asset back)
- **AFR is lower than §7520** (note rate hurdle is lower than GRAT hurdle, more value transferred)
- **Income tax paid by grantor on trust income** is a backdoor additional gift to trust beneficiaries (the income tax dollars stay outside estate while trust corpus grows tax-free to beneficiaries)
- **Longer-term appreciation captured** in single transaction (vs. multiple GRAT cycles)

For Holloway-style: $25M of additional non-voting interest sold to IDGT; over 9-year note + transaction event = $10-20M of additional wealth transfer.

---

## QUANTIFIED IMPACT FRAMEWORK

### Worked example (Holloway-style, post-recap)
**Inputs:**
- Non-voting interest sold: $25M (illustrative — Holloway plan reference)
- 30% discount: $25M × 70% = $17.5M after-discount sale price
- Seed gift to trust: 10% × $17.5M = $1.75M (uses lifetime exemption)
- Installment note: $17.5M – $1.75M = $15.75M
- Mid-term AFR (current): ~4.5% (illustrative — pull from volatile rates lookup)
- Note term: 9 years (long-term AFR alternative for >9-year note)

**Annual cash flows:**
- Note interest: $15.75M × 4.5% = $709K/year paid to grantor
- Income tax on trust income: ~$200K-$500K/year paid by grantor (defective grantor; income flows to grantor's 1040)

**Value transfer at sale (year 3 — assumed transaction):**
- Business sells at $50M total; Marcus's 88% × 50% non-voting transferred = $22M of his proceeds came from non-voting in IDGT
- IDGT receives ~$22M of proceeds; pays off note balance ~$15.75M; retains $6.25M
- Plus growth retained in trust outside estate during 3-year hold
- **Net wealth transfer to trust beneficiaries: ~$8-15M+ depending on growth**
- Plus: grantor paid income tax on trust income, effectively a $1-3M additional gift outside estate

### Range parameters
- `seed_value` = ~10% of sale value (rule of thumb; ~10-20% range)
- `sale_value` = appraisal-driven non-voting interest after discount
- `note_term` = 5-15 years typical; 9-year common for mid-term AFR
- `afr_rate` = current month's mid- or long-term AFR from volatile rates lookup

---

## IMPLEMENTATION STEPS

1. **Establish or use existing IDGT.** Trust drafted with grantor-trust triggers (typically §675(4) substitute power) but excluded from estate.
2. **Seed gift:** ~10% of intended sale value transferred via gift (uses lifetime exemption).
3. **Qualified appraisal** of non-voting interest at sale.
4. **Sale documents:** stock purchase agreement (or unit purchase), promissory note at AFR, security interest if appropriate.
5. **CPA tax memo** confirming grantor-trust status and §1014 basis treatment.
6. **Annual administration:** note interest paid; trust files 1041 grantor trust statement (income flows to grantor's 1040); annual valuation tracking.
7. **Note repayment:** over term per schedule. Acceleration possible if business sells.
8. **At note payoff:** trust holds residual value outside estate; coordinate distribution with REC-EST-005 children's trusts.

---

## SEQUENCING DEPENDENCIES

- **SEQUENCED WITH:** REC-ENT-002 (F-Reorg), REC-ENT-003 (Recap), REC-EST-005 (Children's Trusts as IDGT beneficiaries), REC-EST-006 (GRAT) — IDGT typically sequenced after GRAT in the workplan
- **OFTEN COMPLEMENTS:** REC-EST-006 (3-year GRAT) — different mechanics, both fundable concurrently
- **Coordinated WITH:** REC-EST-009 (SLAT) and REC-EST-012 (Dynasty Trust)

---

## DOCUMENTATION CHECKLIST

- [ ] IDGT trust document with proper grantor-trust triggers
- [ ] Seed gift records (Form 709 if exemption used)
- [ ] Qualified appraisal at sale
- [ ] Stock/unit purchase agreement
- [ ] Promissory note at current AFR
- [ ] CPA tax memo confirming grantor status
- [ ] Annual note interest payments
- [ ] Annual trust accounting
- [ ] Note payoff documentation

---

## COMMON MISTAKES & AUDIT TRIGGERS

- **Insufficient seed** — IRS challenges sale as gift if trust doesn't have substantial independent capacity (typical safe harbor: 10%+)
- **Note below AFR** — gift element on shortfall
- **Defective grantor-trust mechanism failure** — substitute power not properly drafted; sale recognized as gain
- **Trust without economic substance** — pure paper transaction; IRS attacks under economic-substance doctrine
- **Mortality during note term** — different from GRAT mechanics; remaining note balance is asset of estate but trust assets stay outside; complex post-death administration
- **Asset depreciation** — note continues to require payment even if asset value falls

---

## COORDINATION NOTES

### PSA Wealth role
- Coordinates timing. Tracks note payment schedule. Coordinates with appraisal cycle.

### CPA role
- Tax memo. Annual grantor-trust filing. §1014 basis tracking. Note interest reporting.

### Attorney role
- IDGT trust draft. Sale documents. Specialist estate counsel.

### Appraiser
- Qualified appraisal at sale; updates if note adjustments contemplated.

---

## CLIENT CONVERSATION FRAMING

> "Step 5 — IDGT Sale (year 2 or 3). Sell additional non-voting interest to an IDGT with installment note bearing the AFR rate. Same family economic outcome as the GRAT but with different mechanics — no mortality risk during the note term, longer appreciation horizon, and the income tax on trust earnings (which you continue to pay as the grantor) effectively becomes an additional, unlimited tax-free gift to the children's trusts. Estimated additional wealth transfer over 9-year note plus transaction: ${transfer_low}M–${transfer_high}M."

---

## CAVEATS & DISQUALIFIERS

- **Sale-to-grantor-trust treatment depends on Rev. Rul. 85-13** — this is well-established but always carries some doctrinal risk
- **Grantor pays income tax on trust earnings** — feature, not bug; effectively additional gift; but real cash-flow burden
- **Anti-IDGT legislation periodically threatened** — OBBBA did NOT enact restrictions; ongoing risk
- **Note must be honored as real debt** — payments must be made on schedule

---

## REFERENCES

- **IRC §675(4)** — substitute power triggering grantor trust
- **IRC §671 et seq.** — grantor trust rules
- **Rev. Rul. 85-13** — sale to grantor trust not recognized
- **Rev. Rul. 2008-22** — substitute power and IDGT
- **IRC §1274 / 7872** — AFR requirements
- **Karmazin v. Commissioner, T.C. Memo 2003-145** — challenged IDGT (settled before final ruling)

---

## PLAN OUTPUT TEMPLATE

> **Step 5 — Sale to Intentionally Defective Grantor Trust (IDGT).** In year two (after the GRAT establishes the structure and the recap is mature), you sell additional non-voting units to a separate IDGT in exchange for an installment note at the AFR ({current_AFR}% for {current_month}). The trust is "defective" for income tax (you pay the income tax on the trust's earnings, which is itself an additional gift-tax-free transfer) but "effective" for estate tax (the trust assets are outside your estate). Estimated additional value transferred outside the estate: ${transfer_low}M–${transfer_high}M of business interest, plus ongoing income-tax burn on your side that further reduces the estate.

**Variables:**
- `{primary_owner_first_name}` = parsed from FR.2.1
- `{current_AFR}` = read from `02_reference/08_volatile_rates_lookup.md` (mid-term or long-term per note duration; typically 9-year note uses long-term AFR)
- `{current_month}` = current month/year
- `{transfer_low}/{transfer_high}` = $6M–$10M default scenarios per Holloway worked example; recompute against actual non-voting capacity remaining after GRAT funding

### Holloway-section reference for depth target

Holloway plan, Estate Planning Step 5 — explicitly names:
1. Sequencing: "year two (after the GRAT establishes the structure and the recap is mature)"
2. Mechanic: sale of non-voting units in exchange for AFR installment note
3. "Defective for income tax" / "effective for estate tax" framing
4. The income-tax-burn-as-additional-gift-tax-free-transfer concept
5. Quantified range: $6M-$10M of additional value transferred

Original template had the technical mechanics but was missing the explicit sequencing language ("year two", "after the GRAT establishes the structure"), the matched-pair "defective for income tax / effective for estate tax" framing, and the quantification range.
