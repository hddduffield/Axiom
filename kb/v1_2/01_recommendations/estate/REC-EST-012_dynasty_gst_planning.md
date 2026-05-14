# [REC-EST-012] — Dynasty / GST Planning

## METADATA
- **ID:** REC-EST-012
- **Status:** Active
- **Category:** Estate
- **Engagement archetypes:** All HNW with multi-generational intent
- **Last verified:** April 2026

---

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.estate_exceeds_exemption == True OR projected to materially
  - FR.13.1.has_goal_estate_planning == True with multi-generational intent
  - GST exemption available (tracks $15M individual / $30M couple in 2026)
  - Family wants assets to skip generation for tax efficiency
```

### Natural-language explanation
Allocate GST exemption to long-term irrevocable trusts (children's trusts, IDGTs, GRATs) so that subsequent generation (grandchildren) inherits without additional generation-skipping transfer tax. State trust law determines maximum trust duration.

---

## WHAT IT IS

GST tax (40%) applies when assets transfer from a transferor to a "skip person" two or more generations below (e.g., grandchild). Exemption equal to estate exemption ($15M per person 2026) can be allocated to trusts to shelter trust assets from GST tax across multiple generations.

State trust law caps duration: Georgia's Rule Against Perpetuities applies (lives in being + 21 years), but states like Delaware, South Dakota, Nevada, Alaska have abolished it (true "dynasty" trusts). For Georgia residents seeking dynasty, situs in non-RAP state required (REC-SPC-001).

---

## WHY WE RECOMMEND IT

For HNW families with multi-generational wealth intent: GST exemption allocation can shelter very large amounts from estate/GST tax across 100+ years of generations. Powerful when paired with grantor-trust techniques where grantor pays income tax during life.

---

## QUANTIFIED IMPACT FRAMEWORK

### Worked example
- Couple allocates $30M of GST exemption to irrevocable dynasty trust
- Trust grows at 5%/year over 60 years (two generations)
- Future value: $30M × (1.05)^60 = ~$560M
- Without GST allocation: federal GST tax at child-to-grandchild transfer = 40% × $560M = $224M
- With GST allocation: $0 GST tax on the $560M

### Range parameters
- `gst_allocated` = $30M maximum (couple, 2026)
- `growth_horizon` = 50-100 years
- `growth_rate` = expected return

---

## IMPLEMENTATION STEPS

1. Estate attorney drafts GST-exempt trust language.
2. Trust situs decision: Georgia (RAP applies — limited duration) or Delaware/SD/NV (RAP abolished — true dynasty).
3. Form 709 with explicit GST exemption allocation at funding.
4. Annual GST exemption allocation election (automatic for direct skips; election for indirect skips).
5. Coordinate with REC-EST-005 (Children's Trusts) to make those GST-exempt.

---

## SEQUENCING DEPENDENCIES
- Coordinated WITH all irrevocable trust funding (EST-005 through EST-009, EST-015)
- Coordinated WITH REC-SPC-001 (Multi-State Trust Situs)

---

## DOCUMENTATION CHECKLIST
- [ ] Trust documents with GST-exempt language
- [ ] Form 709 with GST allocation
- [ ] Annual GST tracking
- [ ] Inclusion ratio documentation
- [ ] Trust situs documentation if non-Georgia

---

## COMMON MISTAKES & AUDIT TRIGGERS
- **Failure to allocate GST exemption** — trust subsequent transfers fully GST-taxable
- **Inclusion ratio errors** — partial GST allocation creates fractional inclusion ratio; complex
- **State RAP violations** — Georgia trusts cannot be perpetual; coordinate situs
- **Unintended skips** — distributions to skip persons during trust life trigger GST

---

## COORDINATION NOTES

### PSA Wealth role
Long-horizon coordination. Tracks GST allocation across all funding events.

### CPA role
Form 709 GST allocation. Inclusion ratio tracking.

### Attorney role
Drafts. Specialist counsel essential.

---

## CLIENT CONVERSATION FRAMING

> "Generation-skipping planning. Allocate your GST exemption ($30M between you and {spouse}) to the children's trusts so that when the assets eventually pass to {grandchild_descriptor}, there is no second layer of estate or GST tax. Combined with proper trust situs, this can shield several hundred million dollars across multiple generations from transfer tax."

---

## CAVEATS & DISQUALIFIERS
- **Multi-generational commitment** — strategy only valuable if family maintains generational structure
- **State trust law variations** — Georgia limits duration via RAP
- **Allocation must be precise** — partial allocation creates inclusion-ratio complexity

---

## REFERENCES
- **IRC §2601** — GST tax imposition
- **IRC §2611** — generation-skipping transfer
- **IRC §2613** — skip person
- **IRC §2631** — GST exemption
- **IRC §2632** — special rules on allocation
- **IRC §2641** — GST tax rate
- **Georgia O.C.G.A. §44-6-200 et seq.** — Rule Against Perpetuities [VERIFY 2026]

---

## PLAN OUTPUT TEMPLATE

> **GST Planning.** Allocate GST exemption to the children's trusts so that subsequent transfers to grandchildren occur without additional estate or generation-skipping tax. Combined with appropriate trust situs (Georgia RAP applies; consider DE/SD/NV for true dynasty), this protects multi-generational wealth from transfer tax.
