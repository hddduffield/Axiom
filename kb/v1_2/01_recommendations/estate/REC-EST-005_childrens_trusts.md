# [REC-EST-005] — Children's Trusts (Per-Child Irrevocable Trusts or Pot Trust)

## METADATA
- **ID:** REC-EST-005
- **Status:** Active
- **Category:** Estate
- **Engagement archetypes:** All with children/heirs
- **Plan section placement:** "Estate Planning → Step 2 (in foundation rollout)"
- **Last verified:** April 2026

---

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.has_children_at_all == True
  - FR.13.1.has_goal_children == True OR FR.estate_exceeds_exemption == True
  - FR.13.3.constraint_no_under_35 == True (typical hard constraint) OR similar age-restriction values
```

### Natural-language explanation
Establish irrevocable trusts (one per child OR single pot trust depending on firm policy) with Crummey provisions. Trustee discretion for support/education/health to age 35; broader thereafter. Receives annual exclusion gifts plus eventual GRAT remainder and IDGT distributions.

### Hard disqualifiers
- Family unwilling to commit to corporate or non-parent trustee (parents-as-trustee compromises exclusion)

---

## WHAT IT IS

Irrevocable trusts established for the benefit of children, with Crummey-noticed contribution mechanics. Trust terms typically:
- **Distributions until age 35:** trustee discretion for HEMS (Health, Education, Maintenance, Support)
- **At age 35 (or staged ages):** broader distribution standards or outright distributions
- **Trustee:** corporate or non-parent individual (preserves estate-tax exclusion for trust assets)
- **Crummey mechanics:** beneficiary withdrawal right on each contribution preserves annual-exclusion treatment

Two structural choices:
- **Per-child trusts:** one trust per child; equal economic outcomes regardless of need
- **Pot trust:** single trust, multiple beneficiaries; trustee can address differential needs

---

## WHY WE RECOMMEND IT

Trust structures align with typical HNW family hard constraint of "no unrestricted access to inherited wealth before age 35." They also receive:
- Annual exclusion gifts (REC-EST-003)
- GRAT remainder distributions (REC-EST-006)
- IDGT distributions (REC-EST-008)
- Potential sub-trust splitting at child's age 35 for further generational planning

The trusts are the central downstream beneficiary of the entire transfer architecture.

---

## VARIATIONS AND STRUCTURAL OPTIONS

### Variation A — Per-child trusts (Holloway default)
One trust per child. Each child's trust receives its share of contributions. Equal economic outcomes by design.

**When to use:** Most common. Aligns with "fair = equal" family values.

### Variation B — Pot trust (single trust, multiple beneficiaries)
One trust for all children together. Trustee has discretion to make uneven distributions based on need.

**When to use:** Family wants flexibility for different needs across children (one with special needs, different earning trajectories, etc.).

### Variation C — Dynasty trust structure
Multi-generational trust designed to last for multiple generations under state's perpetuities rules. Combined with GST exemption allocation, provides cross-generational benefit.

**When to use:** When client has multi-generational intent and is willing to use GST exemption.

### Variation D — Beneficiary-defective inheritor's trust (BDIT)
Trust where the beneficiary is the grantor for income-tax purposes (defective grantor trust as to beneficiary, not parent). More advanced structure.

**When to use:** Advanced applications; see REC-EST-010.

---

## QUANTIFIED IMPACT FRAMEWORK

The trusts themselves aren't a value-creator; they're the receiving vehicle for the entire transfer architecture. Cumulative value housed in trusts over a 20-year program:
- Annual exclusion gifts: ~$3M+ across donees
- GRAT remainder: $2-5M+ depending on growth
- IDGT installment-sale distributions: $5-15M+
- Compound growth on all of the above outside taxable estate
- Combined estate-tax savings: typically $4-8M for Holloway-scale clients

---

## IMPLEMENTATION STEPS

1. Estate attorney drafts trust documents (per-child or pot, per firm policy).
2. Client selects trustees:
   - Corporate trustee (institutional, fee-paying, independent — Holloway default likely)
   - Non-parent individual trustee (sibling, trusted advisor — lower-cost, higher trust risk)
3. Trust obtains EIN; opens account.
4. Crummey notice procedures established.
5. Annual contribution program begins (REC-EST-003).
6. Coordinate with downstream GRAT/IDGT remainder structure.

---

## SEQUENCING DEPENDENCIES

- **Independent of business restructuring** for trust drafting
- **MUST be in place BEFORE:** annual exclusion gifting begins, GRAT remainder vests, IDGT seed
- **Coordinated WITH:** REC-EST-004 (ILIT)

---

## DOCUMENTATION CHECKLIST

- [ ] Trust documents (one per child or pot)
- [ ] Trustee acceptance(s)
- [ ] Trust EIN(s)
- [ ] Trust bank account(s)
- [ ] Crummey notice procedures documented
- [ ] Annual contribution records
- [ ] Annual trustee reports

---

## COMMON MISTAKES & AUDIT TRIGGERS

- **Parents as trustees** — compromises estate-tax exclusion; assets pulled back into parents' estate
- **Crummey notice failures** — gifts lose annual-exclusion treatment
- **Trust funded but trustee not active** — administrative neglect creates audit and beneficiary disputes
- **Distribution standards too vague** — "as trustee deems appropriate" without HEMS framework creates §2041 general-power risk

---

## COORDINATION NOTES

### PSA Wealth role
- Coordinates trust setup. Manages annual contribution program. Liaises with corporate trustee.

### CPA role
- Trust tax filings (Form 1041 if non-grantor; on grantor's return if grantor trust). Tracks distributions.

### Attorney role
- Drafts. Specialist estate counsel.

### Trustee
- **The firm's house position [CONFIRM WITH WILL]:** corporate trustee preferred for fiduciary independence, despite ongoing fees (typically 0.5%-1% of trust assets/year for individual trusts).

---

## CLIENT CONVERSATION FRAMING

> "Children's trusts are the receiving vehicle for the gifting program, GRAT remainder, and IDGT distributions. {Per-child or pot — confirm}. Trustee discretion for support, education, and health until age 35; broader distribution standards thereafter. Trustee cannot be you (compromises exclusion); we recommend a corporate trustee for institutional independence, with annual fees in the $5K-$15K range per trust."

---

## CAVEATS & DISQUALIFIERS

- **Trustee selection** — parents as trustee compromises exclusion; spouse may be acceptable in narrow cases; corporate or non-parent individual safer
- **Crummey mechanics non-negotiable**
- **State trust law** — Georgia allows long-term trusts under O.C.G.A. §44-6-200 et seq. [VERIFY 2026]; some clients opt for Delaware/South Dakota/Nevada situs (REC-SPC-001) for additional benefits
- **Single-pot vs. per-child is values-driven** [CONFIRM WITH WILL — firm default]

---

## REFERENCES

- **IRC §2503(b)** — annual exclusion (with Crummey)
- **IRC §2041** — general powers of appointment (avoid)
- **IRC §674** — beneficial enjoyment power (avoid in non-grantor design)
- **Crummey v. Commissioner, 397 F.2d 82 (9th Cir. 1968)**
- **O.C.G.A. §44-6-200 et seq.** — Georgia trust code [VERIFY 2026]

---

## PLAN OUTPUT TEMPLATE

> **Children's Trusts (3) — Recommended.** Irrevocable trust ({per_child_or_pot}) funded by annual exclusion gifts. Trustee discretion to age 35; broader access thereafter. Crummey provisions preserve gift-tax exclusion. Primary vehicle for transferred wealth. Aligns with your hard constraint on age-35 access. Funded with $19K/parent/child/year of annual exclusion gifts and over time with non-voting business interest.

**Variables:**
- `{per_child_or_pot}` = parsed from firm policy [CONFIRM WITH WILL]
