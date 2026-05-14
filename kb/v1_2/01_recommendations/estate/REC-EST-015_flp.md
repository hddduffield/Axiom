# [REC-EST-015] — Family Limited Partnership (FLP)

## METADATA
- **ID:** REC-EST-015
- **Status:** Active-Cautioned (heavy IRS scrutiny under §2036)
- **Category:** Estate / Entity Structure
- **Engagement archetypes:** All HNW with discount-supported gifting
- **Last verified:** April 2026

---

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - Family has investment portfolio, real estate, or other non-operating assets to consolidate
  - FR.estate_exceeds_exemption == True
  - Goal includes valuation discount + estate transfer
  - Family willing to operate FLP as legitimate business with documentation discipline

DISQUALIFY if:
  - FLP would be funded entirely with cash/marketable securities (heavy §2036 attack risk)
  - Donor will retain control inconsistent with limited-partner structure
  - Family unwilling to maintain genuine partnership operations
```

### Natural-language explanation
Form a Family Limited Partnership (LP or LLC taxed as partnership). Donor transfers assets in exchange for general and limited partner interests. Donor retains GP (control); LP interests gifted to children/trusts. LP interests qualify for valuation discounts (lack of marketability + minority discounts).

### Hard disqualifiers
- Funding entirely with marketable securities (Bongard, Strangi pattern attacks)
- Donor retains rights inconsistent with partnership form
- No business purpose beyond tax discount

---

## WHAT IT IS

A limited partnership (or LLC taxed as partnership) where family members are partners. Typically donor holds 1-5% as GP (control); LP interests held by donor and gifted to family/trusts. LP interests valued at discount due to lack of marketability and lack of control. Discounts make gifts more efficient (transfer more economic value per dollar of exemption used).

Discounts typical: 25-40% combined for non-marketable LP interests.

---

## WHY WE RECOMMEND IT

For families with investment portfolios, real estate holdings, or other consolidated assets: the FLP allows discount-supported gifting that effectively multiplies the lifetime exemption. $1M of LP interest gifted at 30% discount = $700K of exemption used to transfer $1M of economic value.

PSA's house position: FLPs are legitimate but heavily scrutinized. Documentation, business purpose, and operational discipline are essential.

---

## QUANTIFIED IMPACT FRAMEWORK

### Worked example
- Family forms FLP funded with $20M of investment real estate
- Discount on LP interests: 30%
- Donor gifts LP interests representing $10M of economic value
- Gift value used: $7M (30% discount applied)
- Exemption used: $7M
- Effective transfer: $10M of economic value for $7M exemption
- **Multiplication factor: 1.43×**

---

## IMPLEMENTATION STEPS

1. Estate attorney drafts FLP/LLC document.
2. Funding: actual asset transfer (not future commitment).
3. Operating with discipline: separate accounts, real partnership meetings, distributions per agreement, Form 1065 filings.
4. Qualified appraisal of LP interests for gift purposes.
5. Form 709 reflecting gifts at discounted values.
6. Annual operations: real partnership behavior; not a paper entity.

---

## SEQUENCING DEPENDENCIES
- Coordinated WITH children's trusts (REC-EST-005) as recipients
- Coordinated WITH REC-EST-003 (Annual Exclusion Gifting) — annual LP gifts

---

## DOCUMENTATION CHECKLIST
- [ ] FLP / LLC operating agreement
- [ ] Funding documentation
- [ ] Annual partner meetings minutes
- [ ] Annual Form 1065
- [ ] Per-partner K-1s reflecting actual economic deal
- [ ] Qualified appraisals supporting discounts
- [ ] Form 709 gift filings

---

## COMMON MISTAKES & AUDIT TRIGGERS
- **§2036 attack** — IRS argues donor retained interest sufficient to pull back assets to estate (Estate of Powell, Strangi, Bongard)
- **No legitimate non-tax business purpose** — IRS attacks economic substance
- **Funding entirely with marketable securities** — particularly attack-attractive (Bongard pattern)
- **Donor commingling FLP assets with personal assets**
- **Aggressive discounts without appraisal support** — 50%+ discounts attacked
- **§2704** — restrictions on liquidation that go beyond state-law default disregarded for valuation

---

## COORDINATION NOTES

### PSA Wealth role
Coordinates funding, gifting, ongoing administration.

### CPA role
Files Form 1065, K-1s, Form 709 with discount-supported values.

### Attorney role
Drafts FLP. Specialist estate counsel.

### Appraiser
Qualified appraisal of LP interests for gift purposes.

---

## CLIENT CONVERSATION FRAMING

> "Family Limited Partnership for [investment portfolio / real estate / other consolidated assets]. Donor retains a small general-partner interest (control); the limited-partner interests can be gifted at a 25-35% valuation discount. This multiplies your lifetime exemption — roughly 1.4× more economic value transferred per dollar of exemption. The catch is operational discipline: the FLP must function as a legitimate partnership with real meetings, real distributions, and real documentation. Not a paper structure."

---

## CAVEATS & DISQUALIFIERS
- **Heavy IRS scrutiny** — well-known attack patterns
- **Operational discipline required** — not a paper structure
- **Funding source matters** — marketable securities are attack-prone; operating assets, real estate, or partnership in operating business safer
- **Discount range supported** — 25-35% typical and defensible with appraisal; aggressive discounts (>40%) invite challenge

---

## REFERENCES
- **IRC §2036** — retained interest inclusion
- **IRC §2704** — special valuation
- **Estate of Powell v. Commissioner, 148 T.C. No. 18 (2017)** — §2036 inclusion
- **Estate of Strangi v. Commissioner, T.C. Memo 2003-145** — FLP attack
- **Bongard v. Commissioner, 124 T.C. 95 (2005)** — non-tax business purpose
- **Holman v. Commissioner, 130 T.C. 170 (2008)** — discount mechanics

---

## PLAN OUTPUT TEMPLATE

> **Family Limited Partnership.** For consolidated investment holdings ({asset_descriptor}), an FLP allows discount-supported gifting — typically 25-35% valuation discount on LP interests, effectively multiplying your lifetime exemption. Requires operational discipline: real partnership operations, documented meetings, distributions per agreement. Specialist counsel essential.

**Variables:**
- `{asset_descriptor}` = derived from FR.5 (investment portfolio, real estate, etc.)
