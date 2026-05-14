# [REC-SUC-007] — Profits Interest Plan (LLC/Partnership)

## METADATA
- **ID:** REC-SUC-007
- **Status:** Active
- **Category:** Succession & Retention / Executive Equity
- **Engagement archetypes:** Pre-Exit, Active-No-Exit (LLC/partnership context)
- **Plan section placement:** "Recommendations — Business" → "Executive Equity Path"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - Entity is LLC or partnership (taxed as partnership for federal)
  - Want to give actual equity participation
  - Tax efficiency at grant matters (Profits Interest = no tax at grant)

DISQUALIFY if:
  - S-Corp or C-Corp entity (Profits Interest only works in partnership-taxed entity)
```

### Natural-language explanation
A profits interest is a partnership/LLC interest that gives holder a share of future profits and appreciation but not the entity's existing capital value. If properly structured under Rev. Proc. 93-27, no tax at grant. Tax on distributions and on capital gains at sale.

### Hard disqualifiers
- Wrong entity type
- Failure to satisfy Rev. Proc. 93-27 safe harbor

## WHAT IT IS
LLC/partnership interest with capital account starting at $0. Holder participates in distributions and appreciation only, not in existing capital. Per Rev. Proc. 93-27 and 2001-43, no tax at grant if structured properly:
- Hypothetical liquidation value = $0 at grant
- Holder treats as a partner from grant date
- Holder receives K-1

## WHY WE RECOMMEND IT
Tax-efficient way to give actual equity in LLC/partnership. Holder participates in upside without paying tax on grant. Long-term capital gain treatment on sale.

## VARIATIONS
- **Vested:** immediate full equity participation
- **Time-vested:** subject to forfeiture before vesting
- **Performance-vested:** tied to milestones

## QUANTIFIED IMPACT FRAMEWORK

### Components
- Equity percentage granted
- Distributions in operation (K-1 income)
- LTCG on sale (vs ordinary income on cash phantom-equity)

### Worked example (LLC)
COO awarded 5% profits interest in LLC valued at $25M:
- Grant: $0 tax (no capital interest)
- Year 1 distribution: 5% of distributable cash to COO via K-1
- At transaction at $50M: appreciation = $25M × 5% = $1.25M (taxed as LTCG to COO)
- Compared to phantom equity (ordinary income): COO saves ~$200K-$400K of tax depending on rates

## IMPLEMENTATION STEPS
1. Verify entity type (LLC/partnership)
2. Determine percentage and class of profits interest
3. Amend operating agreement to add the new interest
4. Award agreement with §83(b) election where applicable (for risk-of-forfeiture grants)
5. K-1 issuance starting in grant year
6. Vesting tracking if applicable

## SEQUENCING DEPENDENCIES
- **COORDINATED WITH:** REC-ENT-004 (operating agreement update)
- **PREREQUISITE:** entity is LLC/partnership; if S-Corp, need REC-ENT-005 evaluation

## DOCUMENTATION CHECKLIST
- [ ] Operating agreement amended
- [ ] Award agreement
- [ ] §83(b) election if applicable (filed within 30 days)
- [ ] K-1 issuance protocol established

## COMMON MISTAKES
- Granting in S-Corp (doesn't work — different entity tax treatment)
- §83(b) election timing missed
- Liquidation value at grant > $0 (defeats Rev. Proc. 93-27 safe harbor)
- Misclassification as capital interest (taxable at grant)

## COORDINATION NOTES
- **PSA Wealth:** strategy
- **CPA:** §83(b), K-1 issuance, tax modeling
- **Attorney:** operating agreement amendment; specialist drafting

## CLIENT CONVERSATION FRAMING
> "Since {entity_name} is an LLC, we can give {executive_name} a profits interest — actual equity, but tax-efficient. They get distributions and appreciation; no tax at grant. At sale, their share of the gain is long-term capital gain rather than ordinary income — material tax savings vs. phantom equity. Operating agreement gets amended to add the interest."

## CAVEATS & DISQUALIFIERS
- Entity type matters (LLC/partnership only)
- §83(b) election timing critical for vested grants
- K-1 reporting complexity for holder

## REFERENCES
- Rev. Proc. 93-27 — profits interest safe harbor
- Rev. Proc. 2001-43 — clarifications
- IRC §83 — restricted property
- IRC §704 — partnership allocations

## PLAN OUTPUT TEMPLATE

> **Grant {executive_name} a profits interest in {entity_name}.** {Pct}% profits interest, vesting {vesting_schedule}. Tax-efficient under Rev. Proc. 93-27 — no tax at grant since there's no capital interest. {Executive_name} participates in distributions (K-1) and in appreciation; sale proceeds taxed as long-term capital gain. Operating agreement amended to formalize. {If §83(b): "§83(b) election filed within 30 days."}.
