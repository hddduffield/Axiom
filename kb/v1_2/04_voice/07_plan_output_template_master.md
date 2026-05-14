# Plan Output Template Master

## OVERVIEW

Each individual recommendation in the KB has its own Plan Output Template (the verbatim prose pattern with `{variables}`). This file provides the master document-level template that organizes those into a complete plan deliverable.

## DOCUMENT-LEVEL TEMPLATE STRUCTURE

```
# {client_lastname} Family Financial Plan

**Prepared by PSA Wealth**
**{plan_date}**
**Compliance ID: PSA-{year}-{date}-{clientname}-{nnn}**

---

## 1. Executive Summary

{1-2 paragraphs: who this plan is for and what it does}

### Key Recommendations
{bullet list of 5-10 top recommendations with annual or transaction impact}

### Plan Navigation
{brief paragraph on how to read the plan}

---

## 2. Your Situation

### 2.1 Family
{from FR §1, §13}

### 2.2 Business
{from FR §3, §4}

### 2.3 Wealth & Investment Position
{from FR §5, §6}

### 2.4 Existing Documents
{from FR §8, §9, §10}

### 2.5 Insurance & Risk Coverage
{from FR §7}

### 2.6 Charitable Activity
{from FR §13}

---

## 3. Goals and Priorities

{from FR §13, ordered}

---

## 4. Recommendations — Personal Tax
{Plan Output Templates from REC-TAX recommendations triggered}

## 5. Recommendations — Business Tax
{Plan Output Templates from REC-TAX-001 (PTET) and business-side TAX recs}

## 6. Recommendations — Entity Structure
{Plan Output Templates from REC-ENT recommendations}

## 7. Recommendations — Estate Planning
{Plan Output Templates from REC-EST recommendations}

## 8. Recommendations — Risk & Insurance
{Plan Output Templates from REC-RSK recommendations}

## 9. Recommendations — Retirement & Benefits
{Plan Output Templates from REC-RET recommendations}

## 10. Recommendations — Investment & Cash
{Plan Output Templates from REC-INV recommendations}

## 11. Recommendations — Succession & Continuity
{Plan Output Templates from REC-SUC recommendations}

## 12. Recommendations — Family
{Plan Output Templates from REC-FAM recommendations}

## 13. Recommendations — Charitable Planning
{Plan Output Templates from REC-CHR recommendations}

## 14. Recommendations — Specialty
{Plan Output Templates from REC-SPC recommendations, only if any triggered}

---

## 15. Pre-Transaction Sequence
{For Pre-Exit archetype only: timeline pulled from sequencing files}

## 16. Implementation Timeline
{Year-by-year or quarter-by-quarter view of who does what when}

## 17. Strategies Considered But Not Included
{For each evaluated-and-rejected recommendation, brief mention of why not}

## 18. Open Items and Decisions Needed
{From open items file; specific to this engagement}

## 19. References
{Citation index relevant to this plan}

---

## 20. Disclosures
{From disclosures files; section-specific where relevant}
```

## SECTION ASSEMBLY RULES

### Inclusion logic
- Each recommendation evaluated against fact review per its TRIGGERING CONDITIONS
- If trigger=true → include Plan Output Template
- If trigger=false → exclude from active recommendations
- If trigger=true but in "Strategies Considered But Not Included" (e.g., landmines): note in Section 17

### Substitution rules
- Variables in `{}` are populated from fact review or computed
- Volatile rates pulled from `02_reference/08_volatile_rates_lookup.md`
- Quantification sources pulled from referenced fields
- Where a variable isn't available: use "[insert {field}]" placeholder for advisor to fill

### Voice consistency
- Apply voice guidance from `01_sentence_patterns.md`
- Filter against `02_forbidden_phrases.md`
- Coordination tone per `03_tone_toward_partners.md`
- Format per `05_tables_and_formatting.md`
- Quantify per `06_quantification_conventions.md`

### Plan length targets (per archetype, see `03_sequencing/06_engagement_archetypes.md`)
- Pre-Exit: 40-60 pages
- Post-Exit: 35-50 pages
- Active-No-Exit: 30-45 pages
- Family-Office: 50-80 pages
- Pre-Liquidity-Founder: 25-40 pages

If output exceeds target: trim recommendations marked low-priority for this archetype; consolidate similar recs; reduce duplication.

## QUALITY CHECKS BEFORE DELIVERY

- [ ] All triggered recommendations included
- [ ] All variables populated (no `{X}` left)
- [ ] No forbidden phrases (filter against `04_voice/02_forbidden_phrases.md`)
- [ ] Quantification on every recommendation
- [ ] Coordination roles named for each recommendation
- [ ] Volatile rates current (not >30 days stale)
- [ ] Disclosures section complete
- [ ] Compliance ID on each page
- [ ] No cross-reference broken (REC-IDs all match files)
- [ ] Sequencing dependencies respected
