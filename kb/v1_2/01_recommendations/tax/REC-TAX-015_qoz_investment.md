# [REC-TAX-015] — Qualified Opportunity Zone Investment

## METADATA
- **ID:** REC-TAX-015
- **Status:** Active-Cautioned (extended by OBBBA but rules complex)
- **Category:** Tax / Investment
- **Engagement archetypes:** Post-Exit
- **Last verified:** April 2026 [VERIFY exact OBBBA QOZ extension terms]

---

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.is_post_exit == True OR significant capital gain just realized
  - Capital gain available for deferral
  - Investment horizon ≥ 10 years
  - Client comfortable with QOZ investment risk profile
```

### Natural-language explanation
Reinvest capital gains into Qualified Opportunity Funds within 180 days of recognition. Defers capital gain tax; potentially excludes appreciation on the QOF investment after 10-year hold.

### Hard disqualifiers
- Investment horizon < 10 years
- Client risk profile incompatible with QOZ-eligible investments (often illiquid real estate or operating businesses in distressed areas)

---

## WHAT IT IS

QOZ investments under IRC §1400Z-2 allow deferral of capital gains by reinvesting into Qualified Opportunity Funds (QOFs) within 180 days. Held 10+ years, the QOF investment's own appreciation is excluded from gain on disposition.

OBBBA extended QOZ benefits past prior 2026 sunset; new enrollment opportunities continue.

---

## WHY WE RECOMMEND IT

For post-exit clients with large recognized capital gain and 10+ year investment horizon, QOZ provides a deferral plus potential complete exclusion of QOF appreciation. Particularly powerful when paired with diversification goals.

---

## QUANTIFIED IMPACT FRAMEWORK

### Worked example
- Capital gain recognized at exit: $20M
- Reinvested in QOF: $20M
- Federal tax deferred: $20M × 23.8% = $4.76M deferred
- After 10-year hold, if QOF doubles to $40M: appreciation gain ($20M) is excluded
- Federal tax saved on appreciation: $20M × 23.8% = $4.76M
- Combined value: deferral + exclusion benefit

### Range parameters
- `eligible_gain` = capital gain available for reinvestment
- `qof_growth_assumption` = projected QOF return
- `hold_period` = 10+ years for full benefit

---

## IMPLEMENTATION STEPS

1. Confirm eligible gain (must be capital gain; ordinary gain doesn't qualify).
2. Within 180 days, invest in QOF.
3. Hold 10+ years for full appreciation exclusion.
4. Annual reporting (Form 8997).
5. Track QOF compliance (90% test, etc.).

---

## SEQUENCING DEPENDENCIES
- Coordinated WITH REC-INV-006 (Post-Transaction Concentration Unwind)

---

## DOCUMENTATION CHECKLIST
- [ ] Eligible gain documentation
- [ ] QOF investment within 180-day window
- [ ] Form 8997 annual compliance
- [ ] 10-year hold tracking
- [ ] Substantial improvement requirements (for real-estate QOFs)

---

## COMMON MISTAKES & AUDIT TRIGGERS
- 180-day window missed
- Investment in non-qualifying fund
- QOF fails 90% test
- Disposition before 10-year mark loses exclusion

---

## COORDINATION NOTES

### PSA Wealth role
Identifies opportunity, sources QOF investments through MML platform or independent.

### CPA role
Tracks compliance, files Form 8997.

### Attorney role
Reviews QOF documents, especially for direct QOZ business investments.

---

## CLIENT CONVERSATION FRAMING

> "Qualified Opportunity Zone deferral. Within 180 days of your transaction close, reinvested capital gains in a QOF defer the gain tax and — if held 10+ years — fully exclude the appreciation on the QOF itself. Useful as part of post-transaction diversification, but the investment must fit your risk profile."

---

## CAVEATS & DISQUALIFIERS
- 10+ year hold required for full benefit
- QOF investments often illiquid
- OBBBA extended but specific provisions [VERIFY 2026]
- State conformity varies

---

## REFERENCES
- **IRC §1400Z-2** — Qualified Opportunity Zones
- **Treas. Reg. §1.1400Z2** — implementing regulations
- **Form 8997** — Initial and Annual Statement of QOF Investments
- **OBBBA P.L. 119-21** — extension provisions [VERIFY 2026]

---

## PLAN OUTPUT TEMPLATE

> **Qualified Opportunity Zone evaluation.** Post-transaction, capital gain reinvested in a Qualified Opportunity Fund within 180 days defers the federal capital gain. After a 10-year hold, the QOF appreciation itself is excluded from federal tax. We'll evaluate fit against your overall portfolio and risk profile.
