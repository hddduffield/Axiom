# [REC-EST-001] — Joint Revocable Living Trust

## METADATA
- **ID:** REC-EST-001
- **Status:** Active
- **Category:** Estate
- **Engagement archetypes:** All
- **Plan section placement:** "Estate Planning → Step 1 — Foundation"
- **Last verified:** April 2026

---

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.is_married == True
  - FR.9.1.has_revocable_trust == False (or stale/inadequate)
  - FR.5.total_net_worth > 1_000_000

DISQUALIFY if:
  - Client explicitly prefers separate revocable trusts (variation, not disqualification)
  - Existing well-drafted joint revocable trust in place
```

### Natural-language explanation
Establish a joint revocable living trust to hold investment accounts, real estate, and (post-recap) business voting interest. Avoids probate, names successor trustees for incapacity, foundation for estate plan.

### Hard disqualifiers
- Asset structure incompatible with joint trust (rare — Georgia is not community property; tenancy by entirety considerations exist)

---

## WHAT IT IS

A joint revocable living trust ("Joint Rev Trust") owned by both spouses, holding their joint assets. Both spouses have full lifetime access. Successor trustees named for incapacity. At first death, trust typically continues with surviving spouse; at second death, trust distributes per terms.

The revocable trust does NOT save estate tax during life — assets remain in the taxable estate. It solves probate, incapacity, privacy, and provides architecture for irrevocable trusts (ILIT, GRAT, IDGT) to attach to.

---

## WHY WE RECOMMEND IT

Three concurrent benefits:
1. **Probate avoidance** — typically saves 2%-7% of probate estate value plus delay (months to years for contested estates)
2. **Incapacity protection** — successor trustee can act without court conservatorship
3. **Architecture** — the trust holds the voting interest in the operating business post-recap; the irrevocable trusts hold the non-voting; integrated estate plan

For PSA's typical client (HNW Georgia couple), this is foundational.

---

## VARIATIONS AND STRUCTURAL OPTIONS

### Variation A — Single Joint Revocable Trust (most common)
One trust, both spouses as grantors and trustees. Simplest.

### Variation B — Two Separate Revocable Trusts
One per spouse. Used when separate-property considerations matter (asset protection in some states; second-marriage situations with separate beneficiary groups).

### Variation C — A/B Trust Structure (typically obsolete post-portability)
Older planning split assets at first death between marital trust (A) and bypass/credit-shelter trust (B). Largely replaced by portability for couples below combined exemption threshold. Still used for: clients above combined exemption; clients with non-citizen spouses; clients wanting GST exemption preservation.

### Variation D — A/B/C with QTIP (Qualified Terminable Interest Property)
A more elaborate structure for clients above exemption with second-marriage scenarios. Provides surviving spouse with income but preserves principal for first-marriage children.

---

## QUANTIFIED IMPACT FRAMEWORK

### Probate cost avoided
- Georgia probate: court costs minimal but attorney fees typical 1-3% of probate estate
- On $5M probate estate: $50K-$150K saved
- Plus 6-18 months of delay typical for sizable estates

### Incapacity protection
- Successor trustee acts immediately; no conservatorship court process (which typically costs $5K-$25K and weeks of delay)

### No estate-tax benefit during life
- The strategy is foundational, not tax-saving on its own. Tax-saving comes from coordinated irrevocable trusts.

---

## IMPLEMENTATION STEPS

1. Estate attorney drafts joint revocable trust (or two separate trusts in some structures).
2. Pour-over wills naming the trust as residual beneficiary.
3. Powers of attorney (financial), healthcare directives, HIPAA authorizations, guardianship designations (REC-EST-002).
4. **Trust funding** (the failure point) — title investment accounts, real estate, and business voting interest into the trust.
5. Update beneficiary designations on retirement accounts and life insurance to reflect estate plan.
6. Schedule annual review.

---

## SEQUENCING DEPENDENCIES

- **Independent of business restructuring** for trust drafting
- **MUST be in place BEFORE:** funding business interest into estate-tax structures (ILIT, GRAT, IDGT)
- **Coordinated WITH:** REC-EST-002 (Pour-Over Will, POAs, etc.)
- **Coordinated WITH:** REC-EST-004 (ILIT) — both part of estate-plan rollout

---

## DOCUMENTATION CHECKLIST

- [ ] Joint Revocable Living Trust document
- [ ] Pour-over will for each spouse
- [ ] Trust funding documentation (titling, deeds, account changes)
- [ ] Successor trustee acceptances
- [ ] Update of all beneficiary designations
- [ ] Schedule of trust assets (working document, updated annually)

---

## COMMON MISTAKES & AUDIT TRIGGERS

- **Drafted but unfunded** — the most common failure; trust without retitled assets is useless
- **Missing successor trustee acceptance** — successor refuses or is unavailable when needed
- **Out-of-state real estate not addressed** — may need separate ancillary trusts or LLCs
- **Beneficiary designations not updated** — retirement accounts and life insurance still name old beneficiaries

---

## COORDINATION NOTES

### PSA Wealth role
- Coordinates the rollout. Tracks funding completion. Schedules annual review.

### CPA role
- Generally minimal involvement; may file initial trust EIN if needed.

### Attorney role
- Drafts trust, will, POAs, healthcare directives, HIPAA, guardianship designations. Specialist estate counsel required.

---

## CLIENT CONVERSATION FRAMING

> "Step 1 — Foundation. Joint Revocable Trust + new will + powers of attorney + healthcare directives + HIPAA authorizations + guardianship designation. The 2014 will is replaced entirely. The revocable trust avoids probate, names successor trustees if you become incapacitated, and is the foundation that the rest of the estate plan attaches to. Estimated attorney fee: $12,000–$18,000 for the full document set."

---

## CAVEATS & DISQUALIFIERS

- **Trust funding is the failure point** — drafted but unfunded trusts don't work. Track funding completion.
- **Out-of-state real estate** may need separate ancillary trusts or LLCs to avoid ancillary probate.
- **Georgia is not community property** — separate considerations apply elsewhere.
- **Tenancy by entirety** is available in Georgia for some real estate; coordinate with trust structure.

---

## REFERENCES

- **Georgia Trust Code: O.C.G.A. §53-12** [VERIFY 2026]
- **IRC §2036, §2038** — retained interests (trust included in estate, which is the point of revocability)
- **IRC §671 et seq.** — grantor trust rules (revocable trust is a grantor trust)

---

## PLAN OUTPUT TEMPLATE

> **Step 1 — Foundation.** Joint Revocable Trust + new will + powers of attorney + healthcare directives + HIPAA authorizations + guardianship designation for {minor_children_listing}. The {existing_will_year} will is replaced entirely. Estimated attorney fee: $12,000–$18,000 for the full document set.

**Variables:**
- `{minor_children_listing}` = parsed from FR.2.3.children where age < 18
- `{existing_will_year}` = parsed from FR.9.1.documents[].last_updated for Will
