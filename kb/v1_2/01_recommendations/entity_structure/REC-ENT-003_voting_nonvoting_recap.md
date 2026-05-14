# [REC-ENT-003] — Voting / Non-Voting Recapitalization

## METADATA
- **ID:** REC-ENT-003
- **Status:** Active
- **Category:** Entity Structure
- **Engagement archetypes:** Pre-Exit, Active-No-Exit (with estate transfer goals)
- **Plan section placement:** "Estate Planning → Step 4 (post-Holdco)"
- **Last verified:** April 2026

---

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - At least ONE of (F-reorg / Holdco satisfied):
      - FR.4.has_holdco == True (Holdco already exists; recap happens at Holdco level)
      - REC-ENT-002 also triggers in this same plan (SEQUENCED WITH)
  - FR.estate_exceeds_exemption == True OR projected to exceed
  - Plan to use GRAT/IDGT/SLAT for estate transfer of business interest
  - Owner willing to retain control via voting interest while gifting non-voting

DISQUALIFY if:
  - No estate transfer planning contemplated
  - Operating agreement prohibits class restructuring
```

### Natural-language explanation
Recapitalize Holdco units into voting and non-voting classes. Owner retains 100% voting; non-voting units become the asset transferred via GRAT, IDGT, SLAT. Non-voting units qualify for valuation discounts (lack of marketability, lack of control).

### Hard disqualifiers
- Operating agreement of operating entity prohibits restructuring without consent
- Co-owners (e.g., partner) refuse to recap their interest

---

## WHAT IT IS

Through amendment of Holdco operating agreement, units are split into two classes: voting (typically 1% of total economic value, 100% of votes) and non-voting (typically 99% of economic, 0% of votes). Owner retains all voting units. Non-voting units are the asset transferred via subsequent estate-planning vehicles (GRAT, IDGT, SLAT, gifts).

The non-voting interest qualifies for valuation discounts: lack of marketability (LOM, typically 15-25%) and lack of control (10-20%). Combined discounts typical 25-35% for closely-held non-voting interests with qualified appraisal.

---

## WHY WE RECOMMEND IT

The recap is the structural foundation that makes GRAT, IDGT, and SLAT economically efficient. Without it, transferring business interest dilutes voting control. With it, owner retains operational control while transferring economic value at substantial discount.

---

## QUANTIFIED IMPACT FRAMEWORK

### Worked example
- Holdco economic value: $25M (Marcus's 88% of $42M, then post-F-reorg)
- After recap: 1% voting ($250K) + 99% non-voting ($24.75M)
- Non-voting interest value pre-discount: $24.75M
- Combined discount (LOM + minority): 30%
- Non-voting interest after discount: $17.3M
- This is the asset transferred via GRAT/IDGT/SLAT
- Discount captured: $7.4M of value transferred at lower gift-tax cost

### Range parameters
- `voting_pct` = 1% economic / 100% votes (typical)
- `discount_pct` = 25-35% appraisal-supported

---

## IMPLEMENTATION STEPS

1. **Coordinate with REC-ENT-002 (F-Reorg) completion** — recap happens at Holdco level
2. **Estate attorney drafts amended operating agreement** with class structure
3. **Co-owner consent** if multi-owner (each owner's units recap into respective voting/non-voting)
4. **Qualified appraiser engaged** — LOM and minority discounts evaluated
5. **Operating agreement amendment** filed with state if required
6. **Stock/unit certificates re-issued** reflecting class
7. **Appraisal completed** documenting non-voting value with discounts
8. **Coordinate with downstream gifting/GRAT/IDGT** as next steps

---

## SEQUENCING DEPENDENCIES

- **SEQUENCED WITH:** REC-ENT-002 (F-Reorg) — recap follows F-reorg in plan output but both can be in the same workplan
- **MUST come BEFORE:** REC-EST-006 (3-year GRAT), REC-EST-008 (IDGT Sale), REC-EST-009 (SLAT) when funded with non-voting interest
- **Coordinated WITH:** REC-ENT-004 (Operating Agreement Replacement)

---

## DOCUMENTATION CHECKLIST

- [ ] Amended Holdco operating agreement
- [ ] Co-owner consent if applicable
- [ ] State filing if required
- [ ] Re-issued stock/unit certificates
- [ ] Qualified appraisal of non-voting interest
- [ ] §2704 analysis (operating agreement restrictions vs. state law default)

---

## COMMON MISTAKES & AUDIT TRIGGERS

- **§2704 attack on operating-agreement restrictions** — restrictions more limiting than state-law default disregarded for valuation
- **Aggressive discount without appraisal** — fragile in audit
- **Inadequate operating agreement amendment** — class structure ambiguous
- **Co-owner consent overlooked** — invalid restructuring

---

## COORDINATION NOTES

### PSA Wealth role
Coordinates timing with downstream estate-plan funding.

### CPA role
Tax memo confirming non-recognition.

### Attorney role
Drafts amended operating agreement. Specialist counsel.

### Appraiser
Qualified appraisal supporting discount claim. Critical for downstream GRAT/IDGT defense.

---

## CLIENT CONVERSATION FRAMING

> "Step 2 — Recapitalize. Amend the Holdco operating agreement to split units into voting (1% economic, 100% control — retained by you) and non-voting (99% economic, 0% control — eligible for transfer planning). The non-voting interest qualifies for valuation discounts of 25–35% with a qualified appraisal. This is the structural foundation that makes the GRAT/IDGT/SLAT planning that follows cost-effective."

---

## CAVEATS & DISQUALIFIERS

- **§2704 risk** — operating agreement restrictions cannot exceed state-law default without disregard
- **Discount sustainability** — appraisal-driven; aggressive discounts (>40%) attract challenge
- **Co-owner dynamics** — multi-owner businesses may have negotiation complexity
- **Future regulation risk** — proposed 2016 §2704 regulations were withdrawn but periodic threats

---

## REFERENCES

- **IRC §2704** — special valuation
- **Treas. Reg. §25.2704** — 2016 proposed (withdrawn)
- **State LLC act** — class structure authority
- **Mandelbaum factors** — discount analysis criteria

---

## PLAN OUTPUT TEMPLATE

> **Recapitalize into voting and non-voting interests.** Inside the holdco, recapitalize your {primary_owner_pct}% into voting (~{voting_pct_of_holdco}%) and non-voting (~{nonvoting_pct_of_holdco}%) units. The non-voting interest is what gets used in the GRAT and IDGT planning below — it allows you to transfer economic value without giving up control. Properly structured, this also produces a defensible valuation discount on the gifted interest.

**Variables:**
- `{primary_owner_first_name}` = parsed from FR.2.1
- `{primary_owner_pct}` = primary owner's % from FR.3.2 (Holloway: 88)
- `{voting_pct_of_holdco}` = ~10% of total holdco — sufficient for control, expressed as percentage of the whole company (not of the primary owner's stake)
- `{nonvoting_pct_of_holdco}` = primary_owner_pct − voting_pct_of_holdco (Holloway: 88 − 10 = 78)

### Holloway-section reference for depth target

Holloway plan, Section 1, "Recapitalize into voting and non-voting interests" bullet — specifies:
1. Whose interest is being recapped: "Marcus's 88%"
2. Output split: "voting (~10%) and non-voting (~78%)" — both percentages of the whole holdco, not of Marcus's stake
3. Use of the non-voting: "what gets used in the GRAT and IDGT planning below"
4. Control retention: "transfer economic value without giving up control"
5. Discount mechanism: "produces a defensible valuation discount on the gifted interest"

Original template hardcoded a 1%/99% split that assumed sole ownership. The corrected template parameterizes the split and matches Holloway's percent-of-whole-holdco convention, which correctly handles multi-owner cases (Holloway: Marcus 88% → 10% voting + 78% non-voting; Derek's 12% remains untouched).
