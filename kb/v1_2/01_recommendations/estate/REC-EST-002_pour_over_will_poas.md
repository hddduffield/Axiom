# [REC-EST-002] — Pour-Over Will, POAs, Healthcare Directives, HIPAA, Guardianship

## METADATA
- **ID:** REC-EST-002
- **Status:** Active
- **Category:** Estate
- **Engagement archetypes:** All
- **Plan section placement:** "Estate Planning → Step 1 — Foundation"
- **Last verified:** April 2026

---

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ANY of:
  - FR.9.1.has_current_will == False
  - FR.9.1.will_age_years > 5
  - FR.9.1.has_poa_financial == False
  - FR.9.1.has_healthcare_directive == False
  - FR.9.1.has_hipaa == False
  - FR.has_minor_children == True AND no current guardianship designation
  - FR.2.3.children includes adult children (>= 18) without HIPAA authorizations
```

### Natural-language explanation
Replace stale wills, draft POAs, healthcare directives, HIPAA authorizations, guardianship designations. Standard estate-plan document set.

---

## WHAT IT IS

The "core" estate plan documents beyond the revocable trust:
- **Pour-Over Will** — names guardians for minor children; directs residual assets to revocable trust at death
- **Durable Power of Attorney (Financial)** — names someone to manage finances during incapacity
- **Healthcare Directive / Medical POA** — names medical decision-maker; living will provisions
- **HIPAA Authorization** — allows access to medical records and provider communication (separate from medical POA)
- **Guardianship Nomination** — standalone designation if not in will; useful for jurisdictional clarity
- **Adult-child HIPAA / POA** — once a child turns 18, parents lose default access; adult children need their own documents

---

## WHY WE RECOMMEND IT

Without these documents:
- Probate delays freeze access to assets
- Family members can lose financial decision-making authority during incapacity
- Medical providers cannot share information with family in a crisis
- Court-supervised guardianship/conservatorship may be required (slow, expensive, public)
- Adult children at 18+ are legal strangers to parents for medical/financial purposes

---

## QUANTIFIED IMPACT FRAMEWORK

### Costs avoided
- Probate attorney fees: 1-3% of probate estate
- Conservatorship: $5K-$25K typical setup + ongoing court oversight
- Emergency court orders during incapacity: $2K-$10K
- Family disputes over guardianship without designation: highly variable, often catastrophic

### Direct cost
- Full document set: $8K-$18K typical attorney fee for HNW family

---

## IMPLEMENTATION STEPS

1. Estate attorney drafts complete document set per family situation.
2. Notarize and witness as state law requires.
3. Distribute copies to:
   - Each spouse retains originals (often in fireproof safe or attorney custody)
   - Healthcare provider (medical POA, HIPAA)
   - Successor trustees / agents under POA
   - PSA Wealth retains copies for file
4. Adult children get their own document set if applicable.
5. Annual review for changes (children aging in/out of minority, named individuals' status changes).

---

## SEQUENCING DEPENDENCIES

- Coordinated WITH REC-EST-001 (Joint Revocable Trust) — single drafting engagement

---

## DOCUMENTATION CHECKLIST

- [ ] Pour-over will (each spouse)
- [ ] Durable POA financial (each spouse)
- [ ] Healthcare directive / medical POA (each spouse)
- [ ] HIPAA authorization (each adult family member, including children 18+)
- [ ] Guardianship designation for minor children
- [ ] Adult-child HIPAA + POA documents
- [ ] Notarized originals filed
- [ ] Copies distributed to providers and agents

---

## COMMON MISTAKES & AUDIT TRIGGERS

- Pour-over will not properly executed (witness/notary requirements vary by state)
- POA document specifies acts but not financial accounts → bank refuses to honor
- Healthcare directive without HIPAA → provider can't communicate with named decision-maker
- Adult children at college without their own HIPAA → parents have no info if child hospitalized

---

## COORDINATION NOTES

### PSA Wealth role
Tracks document set completion. Coordinates copies to providers.

### Attorney role
Drafts. Specialist estate counsel.

---

## CLIENT CONVERSATION FRAMING

> "The 2014 will is replaced entirely. We add powers of attorney, healthcare directives, HIPAA authorizations, and updated guardianship for {minor_child_name}. Important: {adult_child_name} at {age} legally needs her own HIPAA and healthcare POA — without those, you can't even get her medical information if she's in an emergency at college."

---

## CAVEATS & DISQUALIFIERS

- State law variations — POA forms must comply with state requirements (Georgia: Uniform Power of Attorney Act); some states require specific forms
- HIPAA requires HIPAA-specific authorization; medical POA alone is NOT enough

---

## REFERENCES

- **HIPAA Privacy Rule** (45 C.F.R. Part 164)
- **Georgia Uniform Power of Attorney Act** (O.C.G.A. §10-6B-1 et seq.) [VERIFY 2026]
- **Georgia Advance Directive for Health Care Act** [VERIFY 2026]

---

## PLAN OUTPUT TEMPLATE

| Document | Purpose | Status |
|---|---|---|
| Pour-Over Will | Names guardians for {minor_children_list}; directs remaining assets to your trust at death. | Replace {existing_will_year} will |
| Joint Revocable Living Trust | Avoids probate; ensures continuity. | Create new |
| Durable POA (Financial) | Names someone to manage finances during incapacity. | Create new |
| Healthcare Directive / Medical POA | Names a medical decision-maker; living will provisions. | Create new |
| HIPAA Authorization | Allows access to medical records. Particularly important for adult children ({adult_child_name} at {age} already needs hers). | Create — all |
| Guardianship Nomination | Standalone designation. Specifies guardians for {minor_children_list}. | Create new |
