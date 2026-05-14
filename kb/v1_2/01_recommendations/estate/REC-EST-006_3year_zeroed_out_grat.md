# [REC-EST-006] — 3-Year Zeroed-Out GRAT

## METADATA
- **ID:** REC-EST-006
- **Status:** Active
- **Category:** Estate
- **Engagement archetypes:** Pre-Exit, Pre-Liquidity-Founder, Active-No-Exit (HNW)
- **Plan section placement:** "Estate Planning → Step 5 — GRAT funding (year 1 or 2)"
- **Last verified:** April 2026

---

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - At least ONE of (REC-ENT-002 satisfied):
      - FR.4.has_holdco == True (Holdco already exists)
      - REC-ENT-002 also triggers in this same plan (SEQUENCED WITH)
  - At least ONE of (REC-ENT-003 satisfied):
      - FR.4.recap_complete == True (recap already done)
      - REC-ENT-003 also triggers in this same plan (SEQUENCED WITH)
  - At least ONE of (children's-trust recipient satisfied):
      - FR.4.has_childrens_trusts == True
      - REC-EST-005 also triggers in this same plan (SEQUENCED WITH)
  - Qualified appraisal in hand for non-voting interest, OR commissioning the appraisal is part of the plan workflow
  - FR.estate_exceeds_exemption == True OR projected to exceed
  - FR.2.1.health_status indicates donor expected to survive 3-year term (mortality risk acceptable)
  - §7520 rate environment supports outperformance prospect (read from 02_reference/08_volatile_rates_lookup.md)
  - Asset growth expectation exceeds §7520 hurdle by meaningful margin

DISQUALIFY if:
  - Donor's health is materially compromised (mortality risk causes inclusion in estate)
  - Asset is unlikely to outperform §7520 hurdle (no value transfer; just admin cost)
  - Anti-GRAT legislation enacted (currently NOT enacted; OBBBA did NOT include anti-GRAT provisions)
```

### Natural-language explanation
Transfer non-voting business interest to a 3-year Grantor Retained Annuity Trust. Trust pays grantor an annuity for 3 years; remainder passes to children's trusts free of gift tax (when zeroed out under Walton). All asset growth above §7520 hurdle transfers to remainder beneficiaries.

### Hard disqualifiers
- Mortality risk (donor unlikely to survive term) — assets included in estate at death during term
- Asset that won't grow above §7520 hurdle — no transfer occurs
- Donor's anticipated need for the principal (the annuity returns the principal but with growth removed; if donor needs growth, GRAT defeats purpose)

---

## WHAT IT IS

A Grantor Retained Annuity Trust (GRAT) under IRC §2702(b) and the Walton case (115 T.C. 589, 2000). The grantor transfers an asset to the trust and receives a fixed annuity for a set term (typically 3 years for "zeroed-out" structure). At term end:
- Annuity returns principal + §7520 hurdle interest to grantor
- Anything ABOVE the hurdle goes to remainder beneficiaries (typically children's trusts)
- "Zeroed-out" means annuity is calibrated so present value of annuity = transferred value, making the gift to remainder beneficiaries technically zero for gift-tax purposes

If donor dies during term, the GRAT assets are pulled back into estate (no benefit but no harm). This is the "heads I win, tails I tie" structure.

---

## WHY WE RECOMMEND IT

For pre-exit clients with appreciating business interest, the GRAT captures appreciation outside the estate without using lifetime exemption. Particularly powerful when:
- Business is on a clear growth trajectory (operating performance + transaction premium near exit)
- §7520 rate is moderate (currently 5%, historically average; lower would be better but achievable)
- Donor health is good

For Holloway-style (post-recap, $40M valuation midpoint, Marcus's 88% recapped into ~10% voting + ~78% non-voting), funding a GRAT with one tranche of non-voting interest captures appreciation above the §7520 hurdle for the children's trusts free of gift tax. The remaining non-voting interest is preserved for the IDGT sale (REC-EST-008), pre-transaction charitable gifting (REC-CHR-002), and other downstream uses.

---

## VARIATIONS AND STRUCTURAL OPTIONS

### Variation A — Zeroed-out 3-year (Holloway default)
Standard. 3-year term, annuity calibrated to zero out gift value. Walton-style structure.

**When to use:** Default for pre-exit clients within a 5-year window. Captures near-term appreciation; preserves option for additional GRATs after term.

### Variation B — Rolling GRATs
Series of overlapping 3-year GRATs. As one terminates, another funds. Captures appreciation across multiple cycles. Each cycle requires fresh appraisal.

**When to use:** When appreciation horizon is long (5+ years to transaction); captures more cumulative value than single 3-year GRAT.

### Variation C — Laddered GRATs
Three GRATs at different funding dates with different terms (e.g., 2-year, 3-year, 4-year). Diversifies §7520-rate risk and mortality risk.

**When to use:** Sophisticated structures; coordinate with attorney. See REC-EST-007.

### Variation D — Long-term GRAT (5-10 year)
Longer term means lower annuity required. More appreciation captured if growth continues. But higher mortality risk — death during term pulls all assets back.

**When to use:** Younger donors with healthy life expectancy.

### Variation E — Back-loaded annuity ("shark fin")
Annuity payments increase over term (front-loaded would compromise the structure). Allows initial capital to grow before annuity payments come due.

**When to use:** When asset growth is back-loaded (transaction in year 3 vs. linear growth).

---

## QUANTIFIED IMPACT FRAMEWORK

### Worked example (Holloway-style, post-recap)

**Setup (per Holloway plan):**
- Business valuation midpoint: $40M
- Marcus owns 88% of business; recap splits his stake into ~10% voting + ~78% non-voting (percentages of total holdco)
- Marcus's non-voting interest pre-discount: $40M × 78% = $31.2M
- One tranche of non-voting funds the GRAT; remainder is preserved for IDGT (REC-EST-008) and other downstream uses

**GRAT funding:**
- After-discount value transferred to GRAT: **$8.2M** (one tranche; corresponds to ~$11.7M pre-discount, ~29% of total holdco value, after 30% lack-of-marketability/control discount on non-voting units)
- §7520 rate at funding: 5.0% (May 2026, from `02_reference/08_volatile_rates_lookup.md`)
- Term: 3 years
- Zeroed-out annuity (Walton): ~$3.01M/year (calibrated so PV of annuity at §7520 = transferred value of $8.2M)

**Scenario 1 — Business grows 18%/year for 3 years (per Holloway assumption; below recent CAGR):**
- GRAT asset growth above hurdle: $8.2M × (1.18³ − 1.05³) ≈ **$4.0M–$4.2M transferred to children's trusts free of gift tax**
- Annuity returns ~$9.0M to grantor over 3 years
- No use of lifetime exemption

**Scenario 2 — Business stalls or declines:**
- Annuity returns assets to grantor; GRAT unwound at no gift-tax cost
- Asymmetric structure: "heads I win, tails I tie"

**Scenario 3 — Transaction event during or just after term:**
- Discount unwinds at sale; remainder beneficiaries (children's trusts) capture the unwind on the GRAT-held tranche
- Combined with REC-EST-008 IDGT sale of additional non-voting tranches, total estate value moved outside Marcus's estate over 24-36 months: **$11M–$15M** (per Holloway combined-impact figure)

### Range parameters
- `transferred_value` = appraisal-driven (REC-ENT-003 output)
- `term_years` = 3 (default) or other [CONFIRM WITH WILL — firm default]
- `s7520_rate` = current month's rate from volatile rates lookup
- `growth_assumption` = client's projected business growth or transaction value

---

## IMPLEMENTATION STEPS

1. **Confirm prerequisites:** F-reorg complete, recap complete, qualified appraisal in hand.
2. **Estate attorney drafts GRAT** document. Specialist counsel required.
3. **Annuity calculation:** CPA or attorney runs Walton-zeroed-out math at current §7520 rate.
4. **Trust funding:** transfer appraised non-voting interest to GRAT. Documented stock/unit transfer with consideration of §7520 rate at funding.
5. **Annuity payment schedule:** annual or more frequent payments per trust terms; first payment within 105 days of trust anniversary.
6. **In-kind annuity payments allowed:** can return non-voting units to grantor as annuity payment (rather than cash); valued at then-current FMV.
7. **Record-keeping:** annual annuity calculations, payment confirmations, fair-market-value support.
8. **At term end:** remainder distributes to children's trusts. Confirm receipt and re-appraisal if subsequent moves contemplated.
9. **Coordinate with §7520 rate movements** during term: rate at funding is locked, but subsequent GRATs adjust.

---

## SEQUENCING DEPENDENCIES

- **SEQUENCED WITH:** REC-ENT-002 (F-Reorg), REC-ENT-003 (Recap), REC-EST-005 (Children's Trusts), REC-EST-001 (Joint Revocable Trust) — all part of the same workplan; order in plan output is: foundation trust → F-reorg → recap → children's trusts → GRAT funding
- **MUST come AFTER:** Qualified appraisal of non-voting interest (real-world prerequisite — appraisal must exist before GRAT funds)
- **Coordinated WITH:** REC-EST-008 (IDGT Sale) — alternative or complementary; can be SEQUENCED WITH in same plan
- **MUTUALLY EXCLUSIVE WITH:** Outright gifting of same asset (single asset can't go to both)

---

## DOCUMENTATION CHECKLIST

- [ ] GRAT trust document
- [ ] §7520 rate at funding documented
- [ ] Qualified appraisal supporting transferred value
- [ ] Walton-zeroed annuity calculation
- [ ] Annuity payment schedule
- [ ] Annual annuity payment records
- [ ] In-kind payment FMV documentation if applicable
- [ ] Remainder distribution records at term

---

## COMMON MISTAKES & AUDIT TRIGGERS

- **Mortality during term** — asset back in estate; not a "mistake" per se but the structural risk
- **Appraisal challenged** — discount not supported; gift not actually zeroed out
- **Annuity calculation errors** — miscalibrated annuity creates taxable gift
- **Late annuity payments** — IRS view: missed payment = no qualified annuity = entire asset back in estate
- **In-kind payment FMV disputed** — annuity payment in non-voting units must use defensible current FMV; aggressive valuation invites challenge

---

## COORDINATION NOTES

### PSA Wealth role
- Coordinates timing. Tracks annuity payment schedule. Coordinates with attorney and CPA.

### CPA role
- Annuity calculations. Trust tax filings (grantor trust as to grantor — flows to grantor's 1040). Records management.

### Attorney role
- Drafts GRAT. Specialist estate counsel essential.

### Appraiser
- Qualified appraisal of non-voting interest at funding. Re-appraisal at term if subsequent moves planned.

---

## CLIENT CONVERSATION FRAMING

> "GRAT funding (year 1 or 2). Once the recap is complete and we have a qualified appraisal, fund a 3-year zeroed-out GRAT with non-voting interest. The annuity returns the principal-plus-IRS-hurdle-rate (currently {current_s7520}%) over 3 years, with anything above that — typically meaningful in a growing business approaching transaction — passing to {child_trust_descriptor} free of gift tax. Estimated value transferred to the next generation: ${transfer_low}–${transfer_high}M depending on growth."

---

## CAVEATS & DISQUALIFIERS

- **Mortality risk** — donor must survive 3-year term or assets pull back to estate
- **§7520 rate sensitivity** — current 5% creates higher hurdle than ZIRP-era 1-2%; growth must exceed
- **Anti-GRAT legislation** — periodic threats; OBBBA did NOT enact restrictions; future Congress could
- **Appraisal-dependent** — discount must be defensible
- **Pairs with IDGT for diversification** — see REC-EST-008

---

## REFERENCES

- **IRC §2702** — special valuation rules; GRAT definition
- **Treas. Reg. §25.2702-3** — qualified annuity interest mechanics
- **Walton v. Commissioner, 115 T.C. 589 (2000)** — zeroed-out validity
- **Rev. Rul. 2008-22** — substitute power and IDGT (cross-reference)
- **§7520** — hurdle rate (current rate from volatile rates lookup)

---

## PLAN OUTPUT TEMPLATE

> **Step 4 — 3-Year Zeroed-Out GRAT, funded with non-voting holdco units.** After the recap, you contribute ${grat_funding_amount}M of non-voting holdco units to a Grantor Retained Annuity Trust. The trust pays you an annuity over 3 years, set so the gift value is zero ("zeroed-out"). Any growth above the §7520 hurdle rate (~{current_s7520}% currently) passes to the remainder beneficiaries — the children's trusts — outside your estate, with no use of lifetime exemption. If the business grows at {growth_assumption}%/year for 3 years (well below your recent CAGR of {historical_cagr}%), the remainder transferred is approximately ${transfer_estimate}M of value, gift-tax-free. If the business stalls, the assets revert to you and the GRAT is unwound at no tax cost — the strategy is asymmetric in your favor.

**Variables:**
- `{primary_owner_first_name}` = parsed from FR.2.1
- `{grat_funding_amount}` = sized at plan time; typical first-tranche size is ~25-30% of primary owner's non-voting interest after discount (reserves remaining non-voting for IDGT and charitable). For Holloway: $8.2M.
- `{current_s7520}` = read from `02_reference/08_volatile_rates_lookup.md`
- `{growth_assumption}` = conservative growth rate; default 18% (Holloway value); should be set below recent CAGR for credibility
- `{historical_cagr}` = computed from FR.3.3 trailing 3 years of revenue; Holloway: 22.7%
- `{transfer_estimate}` = $grat_funding × ((1+growth_assumption)^3 - (1+s7520)^3); Holloway: ~$4.2M

### Holloway-section reference for depth target

Holloway plan, Estate Planning Step 4 — eight clauses specifying:
1. Funding amount: "$8.2M of non-voting holdco units"
2. Annuity term: 3 years
3. Zeroed-out structure with explicit definition
4. §7520 hurdle disclosed: ~5.0%
5. Growth assumption disclosed: 18%/year, with comparison to recent CAGR
6. Transfer estimate: ~$4.2M
7. "No use of lifetime exemption" — key advantage
8. Asymmetric framing: "If the business stalls, the assets revert ... — asymmetric in your favor"

The expanded template hits all eight. The original template was missing: explicit funding amount, growth assumption disclosure, CAGR comparison, the "no use of lifetime exemption" callout, and the "asymmetric in your favor" framing.
