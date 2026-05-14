# [REC-ENT-004] — Operating Agreement Replacement

## METADATA
- **ID:** REC-ENT-004
- **Status:** Active
- **Category:** Entity Structure
- **Engagement archetypes:** Pre-Exit, Active-No-Exit
- **Plan section placement:** "Recommendations — Business" → "Entity & Real Estate Structure"
- **Last verified:** April 2026

---

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if:
  - Operating agreement is form-LLC standard from formation
  - Material time has passed (3+ years) without revision
  - Business has grown materially OR ownership structure has changed
  - Restructuring (F-reorg, recap) is in progress
```

### Natural-language explanation
Replace standard form operating agreement with custom-drafted agreement reflecting current business reality, owner intentions, transfer mechanics, deadlock provisions, dispute resolution.

### Hard disqualifiers
- Co-owners refuse to participate

---

## WHAT IT IS

Replacement of LLC operating agreement (or shareholder agreement for S-Corp). Customized to address: ownership transfer mechanics, buy-sell provisions, deadlock/tag-along/drag-along, valuation methodology, fiduciary standards, distribution mechanics, capital call rules, dispute resolution.

For PSA-typical S-Corp (or LLC taxed as S-Corp): often paired with shareholder agreement covering buy/sell triggers, valuation, and ROFR provisions.

---

## WHY WE RECOMMEND IT

Standard form operating agreements (often used at formation) lack:
- Specific buy/sell triggers
- Defined valuation methodology
- Clean transfer-restriction language
- Dispute resolution mechanism
- Drag-along / tag-along provisions
- Customization for owner-specific intentions

For pre-transaction businesses, the operating agreement is reviewed by buyer's diligence team. A clean, current agreement reduces transaction friction.

---

## QUANTIFIED IMPACT FRAMEWORK
- Cost: $5K-$15K (attorney drafting)
- Avoided cost in transaction: typically saves $25K-$100K of buyer-driven amendments and negotiation friction

---

## IMPLEMENTATION STEPS

1. Estate/M&A attorney drafts replacement operating agreement
2. Co-owners review and agree (multi-owner)
3. Execute amended/replaced operating agreement
4. State filing if required
5. Coordinate with REC-ENT-003 (Recap) — recap typically incorporated into the replacement
6. Coordinate with REC-RSK-001 (Buy/Sell) — provisions documented in operating agreement
7. Annual review

---

## SEQUENCING DEPENDENCIES
- Coordinated WITH REC-ENT-002 (F-Reorg), REC-ENT-003 (Recap), REC-ENT-007 (Annual Audit)

---

## DOCUMENTATION CHECKLIST
- [ ] New operating agreement
- [ ] Owner signatures
- [ ] State filing
- [ ] Coordinated with buy/sell

---

## COMMON MISTAKES & AUDIT TRIGGERS
- Operating agreement language inconsistent with buy/sell agreement
- Restrictions exceeding state-law default (§2704 issue for valuation)
- Old agreement still in effect for some provisions

---

## COORDINATION NOTES

### Attorney role
Drafts. Specialist M&A or estate counsel.

### PSA Wealth role
Coordinates with all owners.

---

## CLIENT CONVERSATION FRAMING

> "Replace standard-form operating agreement with custom-drafted agreement covering buy/sell mechanics, transfer restrictions, deadlock, dispute resolution. Cleaner agreement reduces transaction friction and supports the estate planning structure."

---

## REFERENCES
- State LLC acts
- **IRC §2704** — operating agreement restrictions and valuation

---

## PLAN OUTPUT TEMPLATE

> **Update the operating agreement.** The {existing_op_agreement_year} draft must be replaced. The new agreement will reflect the holdco structure, current ownership, voting/non-voting recap, transfer restrictions, the new buy/sell (see REC-RSK-001){co_owner_clause}. This needs an attorney with M&A experience, not a general practitioner.

**Variables:**
- `{existing_op_agreement_year}` = FR.4 or FR.15 — year of existing operating agreement (Holloway: 2009)
- `{co_owner_clause}` = if FR.3.2.owner_count > 1: ", and {co_owner_first_name}'s role and economics"; else: empty

### Holloway-section reference for depth target

Holloway plan, Section 1, "Update the operating agreement" bullet — explicitly enumerates what the new agreement must reflect (holdco structure, current ownership, recap, transfer restrictions, new buy/sell, co-owner role and economics) and specifies the attorney requirement.
