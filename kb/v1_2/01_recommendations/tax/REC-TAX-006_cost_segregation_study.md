# [REC-TAX-006] — Cost Segregation Study

## METADATA
- **ID:** REC-TAX-006
- **Status:** Active (substantially upgraded by OBBBA's permanent 100% bonus depreciation)
- **Category:** Tax
- **Engagement archetypes:** Pre-Exit, Post-Exit, Active-No-Exit
- **Plan section placement:** "Tax Strategy → 3B. Evaluate Within 12 Months"
- **Last verified:** April 2026 (OBBBA changes verified; 100% bonus permanent for property acquired after Jan 19, 2025)

---

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - Client owns real estate (operating-business-related, separately-held investment, or other) with material basis (>$1M)
  - FR.8.cost_seg_status == "Never" OR no recent study
  - Owner has income to absorb the depreciation OR §469 grouping (REC-TAX-007) is planned

DISQUALIFY if:
  - Real estate basis < $1M (study cost typically not justified)
  - Property scheduled for sale within 2 years (recapture mechanics may negate near-term benefit)
  - Owner has no active income or passive income to offset the depreciation
```

### Natural-language explanation
Engage a specialty cost-segregation firm to study a real estate property and reclassify components from default 39-year (commercial) or 27.5-year (residential) life into 5-, 7-, and 15-year property classes. Accelerated depreciation in early years; under OBBBA's permanent 100% bonus depreciation, reclassified property can be fully expensed in year one.

### Hard disqualifiers
- Property was acquired before January 20, 2025 AND placed in service before 2025 (limited bonus benefit; phase-down rules apply for older acquisitions)
- Owner is a passive investor with no ability to use the depreciation

---

## WHAT IT IS

A cost segregation study, performed by an engineering-trained specialty firm, separately identifies and values components of a building that qualify for shorter depreciation lives than the building structure itself. Typical reclassifications: site improvements (15-year), interior finishes and millwork (7-year), HVAC and electrical components serving specific equipment (5-year). Typical reclassification: 20%–35% of total basis.

Combined with bonus depreciation, the reclassified components can be fully expensed in year one. Combined with §469 grouping (REC-TAX-007), the depreciation can offset active business income, not just passive.

---

## WHY WE RECOMMEND IT

For real-estate-owning clients, this is one of the largest first-year deductions available. **Under OBBBA, the strategy is dramatically more powerful than before** — bonus depreciation is now permanent at 100%, so reclassified components are fully expensed immediately rather than depreciated over 5/7/15 years.

The combined power: cost-seg reclassifies 25%–35% of basis into shorter-lived property; bonus depreciation expenses that 100% in year one; §469 grouping makes the depreciation usable against active business income.

---

## VARIATIONS AND STRUCTURAL OPTIONS

### Variation A — Full engineering-based study
Standard. Engineering team visits the property, photographs and inventories components, prepares the report. Defensible in audit. Cost: typically $5K–$25K for properties up to $10M; more for larger.

### Variation B — Catch-up study via Form 3115 (§481(a) adjustment)
For property in service prior years that has been depreciated under default 39-year life. The study identifies the depreciation that should have been taken; Form 3115 (change of accounting method) brings it forward as a §481(a) adjustment in the year of change. **This is the most common variant for established property.**

### Variation C — Partial / "look-back" study
For minor renovations or small properties where full study isn't justified. Lower cost, lower benefit.

### Variation D — Self-directed analysis (NOT recommended)
Building owner attempts to allocate cost without specialty firm. **Not defensible in audit.** Avoid.

---

## QUANTIFIED IMPACT FRAMEWORK

### Worked numerical example (Holloway-style)
**Property:** Kennesaw HQ, 38,000 sf, $4.2M basis. Currently held in operating LLC (will be moved to Holloway Properties LLC per REC-ENT-001 first).

**Without cost seg:**
- Depreciation: $4.2M / 39 years = $107,692/year straight-line

**With cost seg, post-OBBBA (property acquired after 1/19/25 — assume current restructuring counts as new acquisition for depreciation purposes; verify with CPA):**
- 30% of $4.2M reclassified to 5/7/15-year property = $1,260,000
- 100% bonus depreciation on reclassified components: **$1,260,000 deducted year one**
- Remaining $2,940,000 depreciated over 39 years: $75,385/year
- **Year-one total deduction: $1,335,385** (vs. $107,692 without cost seg)

**Tax savings year one (assuming §469 grouping per REC-TAX-007):**
- Additional deduction: $1,260,000 (the bonus on reclassified)
- Federal tax saved at 37%: $466,200
- Georgia tax saved at 5.19%: $65,394
- **Combined first-year tax savings: ~$531,594**

Net of cost-seg fee (~$15K): **~$516K of year-one tax savings**.

The Holloway plan's stated $700K-$1M of accelerated depreciation referenced pre-OBBBA bonus rates (40% in 2025 under prior law). Under OBBBA's restored 100% bonus, the benefit is materially higher.

### Range parameters
- `building_basis` = FR.3.6.business_real_estate[].estimated_value (or basis if available)
- `reclassification_pct` = 0.20 to 0.35 (study-driven; conservative 25% for modeling)
- `bonus_pct` = 1.00 (post-1/19/25 acquisition under OBBBA) or applicable phase-down for older
- `federal_rate` × `state_rate` = combined deduction value

---

## IMPLEMENTATION STEPS

1. **Confirm property is in supportive structure.** If real estate is currently in operating entity, complete REC-ENT-001 (Real Estate Separation) first.
2. **Obtain feasibility estimate** from cost-seg firm (typically free).
3. **Engage cost-seg firm** for full study.
4. **Engineering site visit, document review, depreciation analysis.**
5. **Receive study report.** Confirm reclassification percentages and §481(a) adjustment if applicable.
6. **CPA implements on tax return.** Form 3115 if catch-up; Form 4562 for current-year additions.
7. **Coordinate with §469 grouping election** (REC-TAX-007) so the depreciation offsets active income.
8. **Track for recapture purposes** at sale.

---

## SEQUENCING DEPENDENCIES

- **SEQUENCED WITH:** REC-ENT-001 (Real Estate Separation) when property currently sits in the operating entity — both happen in the same workplan
- **MUST be coordinated WITH:** REC-TAX-007 (§469 Grouping Election) — without grouping, depreciation may be passive-trapped
- **Independent of estate planning recommendations**

---

## DOCUMENTATION CHECKLIST

- [ ] Cost-seg study report from engineering firm
- [ ] Form 3115 (if §481(a) catch-up adjustment)
- [ ] Form 4562 with reclassified property
- [ ] Bonus depreciation election (or election out, if applicable)
- [ ] §469 grouping election (if applicable)
- [ ] Property records: original cost, improvements, depreciation history
- [ ] Recapture tracking schedule for future disposition

---

## COMMON MISTAKES & AUDIT TRIGGERS

- **Aggressive reclassification percentages without engineering support** — 50%+ reclassifications are challenged
- **Self-directed studies** — not defensible
- **Missing the §469 grouping** — depreciation is passive-trapped without it
- **Failing to track recapture** — at sale, accelerated depreciation triggers §1245 (5-year property) and §1250 (15-year, real property) recapture
- **Bonus election errors** — must elect 40% bonus by deadline if not taking 100%; failure to elect = 100% applied automatically (but plan modeling should reflect actual election)

---

## COORDINATION NOTES

### PSA Wealth role
- Identifies opportunity. Coordinates with property entity structure. Engages cost-seg firm. Tracks tax-savings vs. recapture across hold period.

### CPA role
- Implements on tax return. Files Form 3115 if catch-up. Tracks recapture schedule.

### Cost-seg firm role
- Performs engineering study and prepares report. Specialist firms only.

### Attorney role
- Generally not involved unless structural changes (real estate separation) are part of the engagement.

---

## CLIENT CONVERSATION FRAMING

> "Cost segregation study on the {property_descriptor}. Once the building is moved to {property_entity_name}, a cost segregation study should reclassify roughly 25–35% of the building's ${basis_in_M}M cost basis into 5- and 15-year property — accelerating depreciation. Under the One Big Beautiful Bill Act's permanent 100% bonus depreciation (for property acquired after January 19, 2025), the reclassified components are fully expensed in year one. Estimated first-year benefit: ${first_year_deduction_estimate} of accelerated depreciation deductions, which under §469 grouping (below) can offset operating-business income."

---

## CAVEATS & DISQUALIFIERS

- **OBBBA acquisition date matters:** property acquired before Jan 20, 2025 is subject to phase-down rules (40% bonus in 2025 placed-in-service year, etc.). Property acquired after gets 100% permanent.
- **Recapture at sale:** accelerated depreciation generates §1245/§1250 recapture taxed at ordinary rates (capped at 25% for §1250 unrecaptured gain). Plan for this in transaction modeling.
- **State conformity:** Georgia conforms to federal cost-seg treatment. Some states (notably California) decouple from bonus depreciation. [VERIFY 2026 — confirm Georgia conformity to OBBBA bonus restoration.]
- **Cost-seg firm fee** is itself deductible.

---

## REFERENCES

- **IRC §168** — MACRS (depreciation system)
- **IRC §168(k)** — bonus depreciation (made permanent at 100% by OBBBA for post-1/19/25 acquisitions)
- **IRC §1245** — recapture on personal property (5-year, 7-year)
- **IRC §1250** — recapture on real property (15-year, 39-year)
- **IRC §481(a)** — change-of-accounting-method adjustments (catch-up cost seg)
- **Rev. Proc. 2015-13** — Form 3115 procedures
- **IRS Notice 2026-11** (Jan 14, 2026) — interim guidance on OBBBA bonus depreciation
- **OBBBA P.L. 119-21** — permanent 100% bonus

---

## PLAN OUTPUT TEMPLATE

> **Cost segregation study on the {property_descriptor}.** Once the building is moved to {property_entity_name}, a cost segregation study should reclassify roughly 25–35% of the building's ${basis_in_M}M cost basis into 5- and 15-year property — accelerating depreciation. Under OBBBA's permanent 100% bonus depreciation, the reclassified components are fully expensed in year one. Estimated first-year benefit: ${first_year_deduction_estimate_low}–${first_year_deduction_estimate_high} of additional depreciation deductions, which under §469 grouping (below) can offset operating-business income.

**Variables:**
- `{property_descriptor}` = parsed from FR.3.6.business_real_estate[].property_name
- `{property_entity_name}` = "[Client] Properties, LLC" (the new property entity)
- `{basis_in_M}` = FR.3.6.estimated_value / 1,000,000
- `{first_year_deduction_estimate_low/high}` = basis × 0.25 / basis × 0.35
