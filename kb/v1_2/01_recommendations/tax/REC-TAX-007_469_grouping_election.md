# [REC-TAX-007] — §469 Grouping Election

## METADATA
- **ID:** REC-TAX-007
- **Status:** Active
- **Category:** Tax
- **Engagement archetypes:** Pre-Exit, Active-No-Exit, Post-Exit
- **Plan section placement:** "Tax Strategy → 3B. Evaluate Within 12 Months"
- **Last verified:** April 2026

---

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - Client owns real estate AND operates a business that uses that real estate
  - Both activities have material participation by the client
  - Cost-seg has been or will be performed (REC-TAX-006)
  - Goal is to use real-estate depreciation against active business income

DISQUALIFY if:
  - Client is not materially participating in both activities
  - Real estate is held in different ownership structure than operating business (analysis required to confirm grouping availability)
```

### Natural-language explanation
File §469(c)(7) grouping election to treat the real estate activity and the operating business as a single economic unit for passive activity purposes. Real-estate depreciation can offset active operating-business income.

### Hard disqualifiers
- No material participation in both activities (would require real-estate-professional status path instead)
- Different ownership patterns between real estate and operating business that defeat grouping

---

## WHAT IT IS

A formal election filed with the tax return, treating two or more economic activities as a single activity for purposes of the passive activity loss rules of IRC §469. Once made, depreciation and other deductions from the (formerly passive) real estate activity can offset income from the active operating business.

The election is binding once made and difficult to unwind. Material participation must continue.

---

## WHY WE RECOMMEND IT

Without grouping, real-estate-related passive losses (which is what cost-seg-driven accelerated depreciation generates) can only offset passive income — which most operating-business owners have very little of. The losses get trapped, carried forward, eventually used at disposition.

Grouping unlocks immediate use of the depreciation against active K-1 income from the operating business. This is the single move that turns cost segregation from a slow-roll into a same-year benefit.

---

## QUANTIFIED IMPACT FRAMEWORK

### Worked numerical example (Holloway-style, post-OBBBA)
- Cost-seg-driven accelerated depreciation in year one: $1,260,000 (from REC-TAX-006 worked example)
- Without §469 grouping: depreciation is passive; if no passive income, fully carried forward
- With §469 grouping: depreciation offsets active K-1 income directly
- Federal tax saved at 37%: $1,260,000 × 37% = **$466,200 federal year-one savings**
- Georgia at 5.19%: $65,394
- **Combined: ~$531K of year-one tax savings**

### Range parameters
- `accelerated_depreciation` = from cost-seg study output
- `marginal_rate` = federal + state combined

---

## IMPLEMENTATION STEPS

1. **Confirm structure supports grouping:** common ownership, material participation in both activities.
2. **CPA files §469(c)(7) grouping election** with the tax return for the year of grouping.
3. **Document material participation** in both activities (audit defense). Time logs, decision-making evidence, operational involvement.
4. **Coordinate with cost-seg study** — file in same return year.
5. **Maintain participation** going forward. Election is binding; ungrouping requires showing material change.

---

## SEQUENCING DEPENDENCIES

- **SEQUENCED WITH:** REC-ENT-001 (Real Estate Separation) when separation is part of the engagement
- **SEQUENCED WITH:** REC-TAX-006 (Cost Segregation Study)
- **Independent of estate planning**

---

## DOCUMENTATION CHECKLIST

- [ ] §469(c)(7) grouping election attached to tax return
- [ ] Material participation evidence (time logs, role descriptions)
- [ ] Confirmation that both activities have common ownership
- [ ] Self-rental rule analysis if applicable

---

## COMMON MISTAKES & AUDIT TRIGGERS

- **Failure to actually elect** — depreciation stays passive
- **Insufficient material participation documentation** — IRS challenges grouping; depreciation reverts to passive
- **Self-rental recharacterization** — Treas. Reg. §1.469-2(f)(6) recharacterizes rental income from property used in own business as non-passive (active); coordinates with grouping but adds complexity
- **Real-estate-professional confusion** — §469(c)(7)(B) is a separate path with different requirements (750 hours; >50% personal services in real-property trades). Not the same as grouping.

---

## COORDINATION NOTES

### PSA Wealth role
- Identifies the opportunity. Tracks the election filing.

### CPA role
- Files the election. Documents material participation. Tracks across years.

---

## CLIENT CONVERSATION FRAMING

> "§469 Grouping Election. Once the real estate is in a separate entity and you have material participation in both, a §469(c)(7) grouping election allows the (now amplified) real estate depreciation to offset HIS operating income. This is the highest-leverage move we recommend in the first 12 months — typical net benefit of $400K–$500K of federal tax savings in year one when paired with cost segregation under OBBBA's restored 100% bonus depreciation."

---

## CAVEATS & DISQUALIFIERS

- **Once made, the grouping election is binding** and difficult to unwind — material participation must continue
- **Real-estate-professional status (§469(c)(7)(B))** is a separate path with different requirements; confirm which path applies
- **Self-rental rules (§1.469-2(f)(6))** can recharacterize income — coordinate with CPA on the interaction
- **Disposition complexity:** at sale, the grouped activities have different basis tracking

---

## REFERENCES

- **IRC §469** — passive activity loss rules
- **IRC §469(c)(7)** — grouping election
- **Treas. Reg. §1.469-4** — grouping rules
- **Treas. Reg. §1.469-5T** — material participation tests
- **Treas. Reg. §1.469-2(f)(6)** — self-rental rule
- **Rev. Proc. 2010-13** — election procedures
- **Rev. Proc. 2011-34** — late grouping election relief

---

## PLAN OUTPUT TEMPLATE

> **§469 Grouping Election.** Once the real estate is in a separate entity and you have material participation in both, a §469(c)(7) grouping election allows the (now amplified) real estate depreciation to offset {entity_name} operating income. This is the highest-leverage move we recommend in the first 12 months — typical net benefit of ${benefit_low}–${benefit_high} of federal tax savings in year one.

**Variables:**
- `{entity_name}` = FR.3.1.legal_name or trade name
- `{benefit_low}` / `{benefit_high}` = derived from cost-seg study output × marginal rates
