# Axiom Knowledge Base v1.2 — PSA Wealth

Internal knowledge base providing structured system context for AI-driven financial plan generation.

## v1.2 changes (calibration-fix pass)

This version applied surgical fixes following a calibration test against the Holloway exemplar:

- **Tier 1 — Sequencing trigger semantics:** introduced `SEQUENCED WITH` relation type alongside existing `MUST come AFTER` / `MUST come BEFORE`. 15 recommendations updated. New master file: `00_master/04_TRIGGER_RELATION_TYPES.md`.
- **Tier 1 — Cross-purchase / ILIT mechanical correction:** REC-RSK-001 and REC-EST-004 plan output templates corrected to clearly separate cross-purchase (owner-owned) from ILIT-owned estate-liquidity coverage.
- **Tier 1 — Asymmetric sizing:** REC-RSK-001 plan output template now derives each policy face from `(other owner's pct × business value)`, surfaces bonus-and-loan funding pattern when premium burden is asymmetric.
- **Tier 2 — Plan Output Template depth:** 14 priority templates expanded to match Holloway-exemplar depth (specific dollar amounts, mechanics specifics, audit-defense rationale, signature framing language).
- **Tier 2 — Voice conversion:** 16 templates converted from third-person to second-person (`you/your`), matching Holloway-exemplar voice.
- **Tier 2 — Entity name resolution:** new generator-level convention in `04_voice/08_entity_name_resolution.md`.
- **Tier 3 deferred:** four items requiring firm-policy or generator-architecture input documented in `06_open_items/03_v3_candidates.md`.

## Structure

```
00_master/                  Plan generator instructions, ID registry, fact review map, trigger relation types
01_recommendations/         All 130 recommendations across 10 categories
  tax/                      15 — Personal and business tax optimization
  estate/                   20 — Estate, gifting, GST planning
  entity_structure/         7 — Entity restructuring (incl. F-Reorg full-depth exemplar)
  risk_insurance/           18 — Insurance and risk management (incl. captive landmine)
  retirement/               10 — Qualified plan and retirement contribution strategies
  investment/               11 — Cash, portfolio, and tax-aware investing
  succession_retention/     16 — Pre-transaction and key-employee strategies
  family/                   10 — Family wealth and governance
  charitable/               13 — Charitable strategies (incl. conservation easement landmine)
  specialty/                10 — Advanced and edge-case strategies
02_reference/               15 — Reference material on statutes, rates, mechanics
03_sequencing/              6 — Master sequences and triggering matrix
04_voice/                   8 — Voice, tone, formatting, plan output template, entity name resolution
05_disclosures/             6 — MML and other compliance disclosures
06_open_items/              3 — Verification queue, firm policy questions, v3 candidates (incl. Tier 3 deferrals)
```

## Total content

174 markdown files; ~1.3MB

## Verified through

- 2026 federal tax/estate/retirement limits (IRS Notice 2025-67 and contemporaneous guidance)
- OBBBA P.L. 119-21 (July 4, 2025) provisions including:
  - Federal estate exemption $15M / $30M MFJ
  - §1202 QSBS expansion ($15M cap, 3/4/5-year tiered, $75M asset cap)
  - SALT cap $40K with phase-out above $500K AGI
  - Bonus depreciation 100% permanent
  - QBI §199A permanent
  - Conservation easement basis-multiple cap (SECURE 2.0 §605)
- May 2026 §7520 rate (5.00%); March-April AFR
- Georgia tax rate schedule (5.19% TY2025, declining 0.1%/yr toward 4.99%)
- SECURE 2.0 Roth catch-up requirement effective 2026 for prior-year wages > $150K

## Status

v1.2 — calibration-fix pass complete. Ready for plan-generator integration testing against the Holloway fact review.

Open firm-policy questions and Tier 3 deferrals documented in `06_open_items/`.

## Versioning

This is **v2**. v1 was the initial single-document KB. v3 candidates documented in `06_open_items/03_v3_candidates.md`.

Open firm-policy questions and verification items in `06_open_items/`.

## Landmine recommendations

Two recommendations are flagged as **LANDMINE — DEFAULT OFF**:
- REC-RSK-016 (831(b) micro-captive insurance)
- REC-CHR-011 (conservation easement)

Both require explicit senior advisor authorization for inclusion in any plan.
