# [REC-TAX-001] — Georgia PTET Election

## METADATA
- **ID:** REC-TAX-001
- **Status:** Active
- **Category:** Tax
- **Subcategory:** State-tax workaround / SALT-cap planning
- **Engagement archetypes:** Pre-Exit, Post-Exit (if business income continues), Active-No-Exit
- **Plan section placement:** "Recommendations — Business" → "Tax Strategy → 3A. Implement This Year"
- **Last verified:** April 2026 (rate confirmed at 5.19% for TY2025; OBBBA SALT-cap interaction verified)
- **Verification frequency:** Annual (Georgia rate is scheduled to step down 0.1%/yr toward 4.99%)

---

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.has_business == True
  - FR.is_pass_through_entity == True (LLC taxed as partnership/S-Corp, S-Corp, or partnership)
  - FR.3.1.state_of_formation == "Georgia" OR business has GA-source income
  - FR.3.2.owner_count >= 1 with at least one individual owner
  - FR.8.ptet_status == "Not Elected"
  - At least ONE of:
      - FR.6.1.total_household_income > 500_000 (where SALT-cap phase-out makes PTET strongly beneficial)
      - FR.8.state_tax > 40_000 (where PTET captures benefit beyond new $40K cap)
      - FR.8.federal_agi > 500_000 (similar phase-out logic)

DISQUALIFY if:
  - Single-member LLC not taxed as partnership/S-Corp (entity ineligible)
  - Sole proprietor (no entity to elect)
  - C-Corp (PTET doesn't apply)
  - Owner is itself a corporation (only individual owners benefit)
  - Below SALT cap with low state tax — PTET may be neutral or unhelpful
```

### Natural-language explanation
Georgia pass-through entities can elect to pay state income tax at the entity level (5.19% for TY2025, scheduled to decline to 4.99%). The state tax becomes a federal business deduction, bypassing the SALT cap on the personal return. Owners receive a non-refundable credit on their Georgia personal return for tax already paid by the entity.

### Hard disqualifiers
- Single-member LLC disregarded for federal tax (must be partnership or S-Corp for PTET eligibility)
- Entity has corporate or partnership owners only (only individual owners benefit; some structures with mixed ownership require analysis)
- Election deadline missed for the year (the election must be made by entity return due date including extensions; once missed, wait until next year)

---

## WHAT IT IS

Under Georgia HB 149 (effective 2022), eligible pass-through entities can elect annually to pay Georgia income tax at the entity level rather than passing the tax obligation through to owners' personal returns. The entity-level tax is fully deductible federally as a business expense, bypassing the federal SALT cap on the owners' personal return. Owners receive a non-refundable credit on their Georgia personal return for tax already paid by the entity.

The election is **annual and irrevocable for the year once made**. It is filed on the entity's GA return (Form 600S for S-Corp, Form 700 for Partnership).

---

## WHY WE RECOMMEND IT

For most high-income Georgia pass-through owners, this is the single highest-leverage federal tax move available. The federal benefit is the difference between deducting state tax at the entity level (uncapped) versus at the personal level (capped at $40K under OBBBA, with phase-out above $500K AGI driving the cap toward $10K).

Under OBBBA's higher $40K SALT cap, the math has shifted but PTET remains powerful for the typical PSA client:
- AGI > $500,000: SALT cap phases out 30¢/$1 over $500K, reaching $10K floor at $605K AGI. PTET fully restores the federal deduction the owner would otherwise lose.
- AGI between $40K-of-state-tax and $500K AGI: PTET still beneficial; benefit smaller than pre-OBBBA but real.
- AGI below SALT-cap-binding levels: PTET may be neutral; model both paths.

For Holloway-style clients ($3M+ federal AGI, $200K+ Georgia tax annually), the PTET captures essentially the entire state tax as a federal deduction.

---

## VARIATIONS AND STRUCTURAL OPTIONS

### Variation A — Full PTET election
Elect for all owners. Standard approach for closely-held businesses with all-individual ownership.

### Variation B — Selective owner participation
Some states allow per-owner opt-in/opt-out within the entity. Georgia's election is entity-level — all owners participate or none. Coordinate with all owners before election.

### Variation C — Multi-state PTET coordination
For entities with operations in multiple PTET states, owners may benefit from multiple elections. Each state's PTET is separate. Coordinate apportionment with CPA to avoid double-counting.

### Variation D — PTET with HEART/GOAL credits
Georgia HEART (rural hospital tax credit) and GOAL (private school scholarship credit) are dollar-for-dollar Georgia tax credits. They can be claimed at PTET level or individual level but generally don't stack. Choose based on which yields better federal-state combined outcome.

---

## QUANTIFIED IMPACT FRAMEWORK

### Impact components
- **State tax paid at entity level** = K-1 income × Georgia PTET rate (5.19% for TY2025)
- **Federal deduction captured** = full state tax paid (not capped by personal SALT cap)
- **Federal tax saved** = state tax × federal marginal rate (typically 32%–37% for HNW)
- **Net benefit** = federal tax saved – any state-tax timing difference (typically zero net)

### Worked numerical example (Holloway-scale)
- Marcus's projected K-1 from HIS: ~$4,000,000
- Georgia PTET at 5.19%: $4,000,000 × 5.19% = **$207,600 of GA tax paid at entity level**
- Without PTET: $207,600 of state tax paid personally; federal SALT cap (with $605K+ AGI phase-out) limits deduction to $10,000
- With PTET: $207,600 fully deductible federally as business expense
- Federal deduction recovered: $207,600 – $10,000 = **$197,600 of additional federal deduction**
- Federal tax saved at 37% bracket: $197,600 × 37% = **$73,112 federal tax savings annually**
- Net annual benefit: ~**$73K** at this scale (Holloway plan cited $148K, which assumed pre-OBBBA $10K SALT cap; under post-OBBBA $40K cap with phase-out, the benefit at this AGI is ~$73K)

### Range parameters
- `state_tax_at_entity` = K-1 income × current GA PTET rate (read from `02_reference/07_georgia_specifics.md`)
- `federal_marginal_rate` = derived from FR.6.1 total income → bracket
- `salt_cap_available_personally` = computed from AGI: max $40K, phasing 30¢/$1 over $500K, floor $10K
- `salt_cap_available_for_PTET_state_tax` = state_tax_at_entity (uncapped at federal entity level)

---

## IMPLEMENTATION STEPS

1. **Coordinate with CPA.** Confirm CPA has experience with PTET elections; if not, this is a flag for the broader CPA-transition recommendation.
2. **Model the election.** CPA produces a side-by-side "with PTET vs. without" projection for the year, confirming benefit at current income.
3. **Confirm cash flow.** The entity must have cash to pay the PTET liability. Typically pulled from quarterly distributions to owners.
4. **Make estimated PTET payments.** Georgia requires entities making the election to make estimated payments on the C-Corp schedule (Form 602-ES).
5. **File the election.** On Form 600S (S-Corp) or Form 700 (Partnership) at year-end. Election is annual and irrevocable for the year.
6. **Verify owner credits on personal returns.** Each owner's GA personal return (Form 500) reflects the credit for tax paid at entity level.
7. **Schedule annual review.** Election is annual — must be remade each year. Income changes year-to-year, so model annually.

---

## SEQUENCING DEPENDENCIES

- **Independent:** Can be made immediately. Does not depend on other recommendations.
- **Time-sensitive:** Election deadline is entity return due date including extensions. Missing deadline forfeits the year.
- **Coordinated WITH:** REC-TAX-002 (W-2/K-1 mix optimization) — the PTET applies to K-1 income, so optimizing the W-2/K-1 split affects PTET base.

---

## DOCUMENTATION CHECKLIST

- [ ] CPA-prepared "with vs. without PTET" model showing projected benefit
- [ ] Form 600S or Form 700 with PTET election box checked
- [ ] Schedule 1 (S-Corp) or Schedules 1 and 3 (Partnership) completed
- [ ] Form 602-ES estimated payment vouchers filed quarterly (or via Georgia Tax Center)
- [ ] Owner Form 500 individual returns reflecting PTEDED line entry on Schedule 1, Line 12
- [ ] Annual review memo confirming election remains beneficial for next year

---

## COMMON MISTAKES & AUDIT TRIGGERS

- **Missed estimated payments:** Georgia requires PTET-electing entities to make estimated payments on the C-Corp schedule. Failure can trigger penalties calculated against 5.75% of prior-year income (the historical rate, by statute).
- **Owner double-counting:** Owner reports K-1 income on personal return AND fails to take the PTEDED — overpaying state tax. CPA must coordinate.
- **Mixed-eligibility ownership:** If a corporate or non-individual owner is in the cap table, PTET treatment may not work for them; analyze before electing.
- **Federal IRS challenge:** Notice 2020-75 confirmed federal acceptance of state PTETs. Risk of Notice withdrawal exists but no current signals of change.
- **Not verifying the rate:** GA PTET rate has been declining (5.75% → 5.39% → 5.19% → eventually 4.99%). Use current year's rate.

---

## COORDINATION NOTES

### PSA Wealth role
- Identifies opportunity from FR §8 (PTET status). Frames benefit to client. Tracks election deadline.

### CPA role
- Models the benefit. Files Form 600S/700 with election. Coordinates owner credit on personal returns. Files quarterly estimated payments.
- **The firm's house position:** generalist CPA handling routine compliance is fine for PTET execution once the strategy is identified, but may not have proactively flagged it. PSA's job is to surface it.

### Attorney role
- Generally not needed. May be involved if operating agreement requires amendment to authorize entity-level tax payments.

---

## CLIENT CONVERSATION FRAMING

> "Georgia has had a Pass-Through Entity Tax election available since 2022, and you're not making it. Effectively, your business is paying about $200,000 of Georgia tax annually that — under the federal SALT cap — you're getting almost no federal deduction for. By having the business pay it directly, you turn that into a fully deductible federal business expense. The election is annual, takes a CPA filing, and at your scale produces about $70K of federal tax savings every year. We file it for the current year now and make it part of the annual cycle going forward."

---

## CAVEATS & DISQUALIFIERS

- **Entity-level cash flow:** entity must have cash to pay the PTET liability. Typically a non-issue for profitable businesses but verify.
- **Out-of-state owners:** non-Georgia-resident owners may benefit less or face complications; per-owner analysis required.
- **Federal regulatory risk:** Notice 2020-75's continued vitality could be challenged by future regulation; OBBBA did NOT restrict PTETs and the political environment supports them.
- **Multi-state coordination:** owners with material out-of-state K-1 income from non-PTET states have residual SALT cap exposure.

---

## REFERENCES

- **Georgia O.C.G.A. §48-7-23** — pass-through entity tax statute (HB 149, effective 2022; rate amended via 2024–2025 legislation)
- **IRS Notice 2020-75** — federal acceptance of state PTETs as deductible at entity level
- **Georgia Department of Revenue HB 149 PTET FAQ** — official guidance
- **Georgia Forms:** 600S (S-Corp election), 700 (Partnership election), 602-ES (estimated payments), 500 (personal return with credit)
- **OBBBA P.L. 119-21** — raised SALT cap to $40K with $500K AGI phase-out

---

## PLAN OUTPUT TEMPLATE

> **File the Georgia PTET election for {tax_year}.** Georgia has had this election available since the 2022 tax year. By electing, {entity_name} pays {current_GA_PTET_rate}% Georgia tax at the entity level — fully deductible on the federal return — instead of you paying it personally where it is capped by the ${current_SALT_cap} SALT limit{phase_out_clause}. **Estimated annual federal tax savings: ${computed_federal_savings}** based on your projected {tax_year} K-1 income. The election is filed annually with the Georgia return; we will coordinate with your CPA to ensure clean implementation.

**Variables:**
- `{tax_year}` = current year
- `{entity_name}` = FR.3.1.legal_name or trade name
- `{current_GA_PTET_rate}` = lookup current rate (5.19% TY2025; verify each year)
- `{primary_owner_first_name}` = parsed from FR.2.1.full_legal_name
- `{current_SALT_cap}` = "40,000" (post-OBBBA) or "10,000" (post-2030 sunset, when applicable)
- `{phase_out_clause}` = if FR.6.1.total_household_income > 500,000: " and phased out further at your income level"
- `{computed_federal_savings}` = K-1 income × PTET rate × federal marginal rate (with SALT-cap-recovery math)
