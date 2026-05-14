# [REC-EST-007] — Rolling / Laddered GRAT Program

## METADATA
- **ID:** REC-EST-007
- **Status:** Advanced
- **Category:** Estate
- **Engagement archetypes:** Pre-Exit (longer window), Pre-Liquidity-Founder
- **Last verified:** April 2026

---

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - REC-EST-006 (3-year zeroed-out GRAT) is in place or planned
  - Transaction window > 5 years OR ongoing significant appreciation expected
  - Donor health and longevity support multiple sequential terms
  - Family commits to ongoing appraisal cycle
```

### Natural-language explanation
Multiple GRATs strung together — either rolling (new GRAT each year, each running 3 years, overlapping) or laddered (different terms started at different times). Captures appreciation across multiple cycles while diversifying §7520-rate and mortality risk.

### Hard disqualifiers
- Family unwilling to commit to multi-year appraisal and administrative cost
- Donor's health makes long sequence of mortality risks unacceptable

---

## WHAT IT IS

A program of multiple GRATs:
- **Rolling GRATs:** new 3-year GRAT funded each year. After year 3, remainder of first GRAT distributes; meanwhile years 2, 3, 4 GRATs are running. Captures multi-cycle appreciation.
- **Laddered GRATs:** different-term GRATs (2/3/4-year) funded simultaneously or sequentially. Different §7520-rate locks; different mortality exposure profiles.

---

## WHY WE RECOMMEND IT

A single 3-year GRAT captures one window of appreciation. A rolling/laddered program captures multiple. For long-window pre-exit clients (5-10+ years to transaction), the cumulative transfer can be substantially larger. Diversifies risk: a single GRAT funded just before market decline captures less; multiple GRATs at different rates and times average through.

---

## QUANTIFIED IMPACT FRAMEWORK

### Worked example (rolling 3-year GRATs over 6 years)
- Initial transferred value year 1: $10M after discount
- Annual roll: similar amount each year
- Each GRAT captures appreciation above hurdle
- Cumulative transfer over 6 years: typically 2-3× single-GRAT value
- For Holloway-style: $15-25M+ of cumulative wealth transferred over 6 years

### Range parameters
- `cycle_years` = total program length
- `per_cycle_value` = each GRAT's transferred value
- `growth_assumption` = annual asset growth above hurdle

---

## IMPLEMENTATION STEPS

1. **Annual appraisal cycle** — each GRAT funding requires fresh qualified appraisal
2. **Annual GRAT documents** — each cycle is a separate trust
3. **Calendar discipline** — annuity payments per trust on schedule
4. **Track concurrent trusts** — multiple GRATs running simultaneously requires careful records
5. **Coordinate remainders** — each GRAT's remainder vests at term; integrate with children's trusts

---

## SEQUENCING DEPENDENCIES
- **MUST come AFTER:** First GRAT (REC-EST-006) successfully completes term
- **Coordinated WITH:** REC-EST-008 (IDGT) — different mechanics, complementary

---

## DOCUMENTATION CHECKLIST
- [ ] Annual appraisals
- [ ] Per-cycle GRAT documents
- [ ] Annuity payment schedules across all running GRATs
- [ ] Cumulative transfer tracking

---

## COMMON MISTAKES & AUDIT TRIGGERS
- Same as REC-EST-006 multiplied by cycle count
- Annual appraisal cost adds up; verify cost-benefit
- Mortality risk increases with each cycle

---

## COORDINATION NOTES

### PSA Wealth role
Long-horizon coordination across many cycles.

### CPA role
Annual annuity calc per GRAT.

### Attorney role
Per-cycle GRAT documents.

### Appraiser
Annual qualified appraisal.

---

## CLIENT CONVERSATION FRAMING

> "Beyond the initial 3-year GRAT, a rolling program funds a new GRAT each year. Each captures its own cycle of appreciation. Over 5-7 years, the cumulative transfer is typically 2-3× a single GRAT. The cost is annual appraisal and admin; the benefit is materially more value transferred."

---

## CAVEATS & DISQUALIFIERS
- **Higher administrative cost** than single GRAT
- **Multiple mortality risks** — each cycle has its own term-of-life exposure
- **Appraisal cost** — annual, often $5K-$15K each

---

## REFERENCES
- Same as REC-EST-006 — IRC §2702, Walton, etc.

---

## PLAN OUTPUT TEMPLATE

> **Rolling GRAT Program (years 2 through {end_year}).** Beyond the initial GRAT, fund a new 3-year zeroed-out GRAT each year. Each captures its own appreciation cycle; cumulative transfer over {program_years} years materially exceeds a single GRAT.

**Variables:**
- `{end_year}` / `{program_years}` = program length
