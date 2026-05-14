# [REC-CHR-002] — Pre-Transaction Charitable Gifting of Business Interest

## METADATA
- **ID:** REC-CHR-002
- **Status:** Active
- **Category:** Charitable
- **Engagement archetypes:** Pre-Exit
- **Plan section placement:** "Pre-Transaction Sequence" → "Charitable"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.is_pre_exit == True
  - FR.13.1.has_goal_charitable == True
  - At least ONE of (F-reorg satisfied):
      - FR.4.has_holdco == True
      - REC-ENT-002 also triggers in this same plan (SEQUENCED WITH)
  - At least ONE of (recap satisfied):
      - FR.4.recap_complete == True
      - REC-ENT-003 also triggers in this same plan (SEQUENCED WITH)
  - Transaction window 12+ months (gifts must occur before binding LOI)

DISQUALIFY if:
  - Transaction past binding LOI ("anticipatory assignment of income" risk)
  - No charitable intent
  - Business interest hard to value (delays)
```

### Natural-language explanation
Gifting business interests pre-transaction (well before binding LOI) provides FMV deduction at qualified appraisal and zero capital gains on the gifted portion. Critical timing: must be before binding sale obligation to avoid "anticipatory assignment of income" doctrine.

### Hard disqualifiers
- Past binding LOI
- No qualified appraisal possible

## WHAT IT IS
Donor gifts business interest (typically non-voting Holdco units) to:
- Donor-Advised Fund (most common — REC-CHR-001)
- Charitable Remainder Trust (REC-CHR-003/004)
- Private Foundation (REC-CHR-007)

Donor receives:
- Federal income tax deduction at FMV (subject to 30% AGI limit for appreciated property to public charity, 20% to private foundation)
- Carryforward 5 years
- ZERO capital gain on the gifted percentage at sale

The charity (or DAF) receives the proceeds at the eventual sale, increasing the impact per dollar.

## WHY WE RECOMMEND IT
For the Holloway-style $42M business: gifting 5% of non-voting units pre-transaction:
- Donation FMV (with 30% discount): ~$1.5M
- Federal deduction: $1.5M × 37% = $555K
- Capital gains avoided: ~$2M × 23.8% = $476K
- Charity receives full proceeds at sale (~$2M of impact)
- Effective cost to donor: $1.5M out (gifted shares) - $1M of tax savings = $500K net cost for $2M of charitable impact

## VARIATIONS
- **DAF-funded:** simplest structure
- **CRT-funded:** retain income stream (REC-CHR-003/004)
- **Foundation-funded:** if foundation already established
- **Combination:** different percentages to different vehicles

## QUANTIFIED IMPACT FRAMEWORK

### Components
- FMV deduction × marginal rate
- Capital gains avoided
- Multiplier effect on charitable impact (compared to cash gifting post-tax)

### Worked example (Holloway-style)
$42M business, 5% pre-transaction gift to DAF, 30% valuation discount:
- Pre-discount value: $42M × 5% = $2.1M
- Discounted gift value: $2.1M × 70% = $1.47M
- Federal deduction at $1.47M × 37% = $544K (state additional)
- Capital gains avoided at $1.47M × 23.8% = $350K
- Combined federal/state savings: ~$900K
- Charity receives ~$2.1M at full transaction value (not discounted)
- Net donor cost: $1.47M shares - $900K savings = $570K for $2.1M of charitable impact

## IMPLEMENTATION STEPS
1. Confirm transaction is NOT past binding LOI (timing critical)
2. Engage qualified appraiser for FMV with appropriate discounts
3. Prepare formal gift documentation (Form 8283; appraiser's report)
4. Transfer shares to DAF / CRT / foundation
5. File Form 8283 with personal return for the gift year
6. Coordinate with banker / M&A counsel on closing — DAF or other entity now appears as shareholder

## SEQUENCING DEPENDENCIES
- **SEQUENCED WITH:** REC-ENT-002 (F-Reorg), REC-ENT-003 (Recap)
- **MUST come BEFORE:** binding LOI signing (anticipatory assignment of income — real-world timing constraint)
- **COORDINATED WITH:** REC-SUC-011 (banker)

## DOCUMENTATION CHECKLIST
- [ ] Qualified appraisal in advance of gift
- [ ] Formal gift documentation (legal transfer)
- [ ] Form 8283 (non-cash > $5K with appraisal attachment)
- [ ] DAF / CRT / foundation acknowledgment
- [ ] No binding LOI at gift date

## COMMON MISTAKES
- Timing: gifting after binding LOI signed → IRS anticipatory assignment of income doctrine taxes the entire gain to donor
- Inadequate appraisal (Form 8283 requires qualified appraisal for non-cash > $5K)
- Discount too aggressive without appraiser support
- DAF cannot accept all business interests — verify before transferring

## COORDINATION NOTES
- **PSA Wealth:** strategy and DAF/charity coordination
- **CPA:** Form 8283, AGI tracking, carryforward
- **Attorney:** transfer documentation; ensure not violating any operating agreement transfer restrictions
- **Appraiser:** qualified, USPAP-compliant, business valuation specialist
- **DAF / CRT / foundation sponsor:** acceptance of business interest

## CLIENT CONVERSATION FRAMING
> "Of your $42M business, you've expressed charitable intent at the {pct}% level. The most efficient way to do that is to gift business interests pre-transaction — well before any binding letter of intent. We coordinate a qualified appraisal, transfer non-voting units to your DAF, you deduct at FMV with discounts, and you avoid the capital gain entirely on that piece. The charity gets the full pre-discount value at sale. Effective cost to you for $${charitable_impact} of charitable impact: about $${net_donor_cost}."

## CAVEATS & DISQUALIFIERS
- Anticipatory assignment of income — must be before binding sale obligation
- 30% AGI limit on appreciated property to public charity (20% to private foundation)
- Carryforward 5 years
- Operating agreement transfer restrictions must permit
- DAF / charity acceptance criteria

## REFERENCES
- IRC §170 — charitable deduction
- IRC §170(e)(1) — appreciated property rules
- Treas. Reg. §1.170A-13 — substantiation
- Palmer v. Commissioner, 62 T.C. 684 (1974) — anticipatory assignment
- Rauenhorst v. Commissioner, 119 T.C. 157 (2002) — pre-LOI gift respected

## PLAN OUTPUT TEMPLATE

> **Pre-transaction charitable planning.** If philanthropic intent is real{family_foundation_clause}, gifting {pct}% of {Holdco_name} non-voting units to a Donor-Advised Fund or charitable remainder trust before a sale produces a fair-market-value charitable deduction and removes that pro-rata share of sale proceeds from capital gains. Approximate appraised FMV (with discount): $${gifted_fmv}. Federal deduction: $${federal_deduction} (subject to AGI limits; 5-year carryforward). Capital gains avoided on gifted portion: $${capital_gains_avoided}. Charity receives proceeds at full transaction value (~$${charity_proceeds}) — meaningful multiplier vs. cash gifting post-tax.
>
> **Critical timing:** complete well before any binding LOI is signed — last-minute charitable planning is a known IRS audit trigger. We expect to revisit this in years 2–3.

**Variables:**
- `{family_foundation_clause}` = if FR.13.3 hard constraints reference family foundation: " ({spouse_first_name}'s family foundation goal in particular)"; else: empty
- `{pct}` = computed against remaining non-voting capacity after GRAT/IDGT
- `{Holdco_name}` = first reference legal+trade; subsequent trade
- `{gifted_fmv}` / `{federal_deduction}` / `{capital_gains_avoided}` / `{charity_proceeds}` = computed at plan time

### Holloway-section reference for depth target

Holloway plan, Section 3, "Pre-transaction charitable planning" bullet — specifies:
1. Conditional framing: "If philanthropic intent is real (Catherine's family foundation goal in particular)"
2. Mechanism: "gifting non-voting holdco units to a Donor-Advised Fund or charitable remainder trust"
3. Tax effect: "fair-market-value charitable deduction and removes that pro-rata share of sale proceeds from capital gains"
4. Audit-defense: "This must be done well before any LOI is signed — last-minute charitable planning is a known IRS audit trigger"
5. Sequencing note: "We expect to revisit this in years 2–3"

The expanded template now matches.
