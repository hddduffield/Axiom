# HOW THE GENERATOR USES THIS KNOWLEDGE BASE

The generator follows a strict, deterministic execution model. This file documents that model. Any future changes to the model must be reflected here.

---

## EXECUTION PIPELINE

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. INGEST                                                        │
│    Input: Completed Fact Review (.docx)                         │
│    Output: Structured FR namespace per FACT_REVIEW_FIELD_MAP    │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. LOAD KB                                                       │
│    Always-load: 00_master/, 02_reference/, 03_sequencing/,      │
│                 04_voice/, 05_disclosures/                      │
│    Lazy-load: 01_recommendations/<category>/ as triggered       │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. EVALUATE TRIGGERS                                             │
│    For each REC file, evaluate Triggering Conditions / Logic    │
│    against FR namespace. Build candidate set.                   │
│    Apply Hard Disqualifiers — remove disqualified recs.         │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. SAFETY GATING                                                 │
│    Mark all [LANDMINE] candidates as "REQUIRES_OPT_IN".        │
│    Default behavior: exclude from plan unless senior advisor   │
│    has explicitly authorized for this engagement.              │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. SEQUENCE                                                      │
│    Apply hard sequencing rules (03_sequencing/03_*).            │
│    Order candidates into Phases 0–5 (or post-exit equivalent). │
│    Detect sequencing conflicts; surface as errors.              │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. QUANTIFY                                                      │
│    For each rec in candidate set, run the rec's Quantified     │
│    Impact Framework against FR values to produce engagement-   │
│    specific dollar estimates.                                   │
│    Pull volatile rates (§7520, AFR) from                       │
│    02_reference/08_volatile_rates_lookup.md.                    │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ 7. RENDER                                                        │
│    Generate plan output sections in the order defined by        │
│    04_voice/04_document_architecture.md.                        │
│    For each rec, use its PLAN OUTPUT TEMPLATE filled with       │
│    engagement-specific facts and figures.                       │
│    Apply voice rules from 04_voice/01-06.                       │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ 8. APPLY DISCLOSURES                                             │
│    Insert verbatim disclosures from 05_disclosures/             │
│    in the prescribed locations.                                 │
│    Append section-specific or recommendation-specific           │
│    disclosures where required.                                  │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ 9. STAMP                                                         │
│    Apply Compliance Tracking ID:                                │
│    PSA-YYYY-MMDD-CLIENTNAME-NNN                                 │
│    Append to Disclosures section.                               │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ 10. FLAG REVIEW ITEMS                                            │
│    Surface all [VERIFY 2026], [CONFIRM WITH WILL], [LANDMINE], │
│    [ADVANCED], or "Unknown — to be obtained" items in a         │
│    Senior Advisor Review Checklist.                             │
│    The generator NEVER releases output without this checklist. │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
                     PLAN DELIVERED
```

---

## KEY PRINCIPLES

### 1. Determinism over creativity

Plan output should be reproducible. Two runs of the generator on the same Fact Review with the same KB version should produce essentially the same plan (modulo prose-level variation). This is achieved by:
- Stable recommendation IDs
- Explicit Triggering Conditions (no implicit reasoning)
- Plan Output Templates per recommendation (same structure, same prose patterns)
- Strict sequencing rules (no creative reordering)

### 2. The KB is the source of truth

The generator never reaches outside the KB for facts about strategies, structures, or law. If the KB is silent on a topic, the generator's response is "this is not in the firm's playbook" — not improvisation. New strategies enter the firm's playbook by being added to the KB explicitly.

### 3. Volatile facts are pulled, not assumed

§7520 rate, AFRs, and any quarterly-or-monthly-changing values are read from `02_reference/08_volatile_rates_lookup.md` at generation time. The team's process must update that file before each plan generation cycle.

### 4. Verification flags are non-blockable

If a rec has `[VERIFY 2026]` or `[CONFIRM WITH WILL]` flags, those propagate to the Senior Advisor Review Checklist regardless of any other instruction. The generator has no authority to suppress them.

### 5. Landmines stay off by default

`[LANDMINE]` recs require an explicit per-engagement authorization to be included. The generator surfaces them in a separate "Strategies Considered But Not Included" section only if the senior advisor has flagged them as relevant.

---

## WHAT THE GENERATOR DOES NOT DO

- It does not invent recommendations not in the KB.
- It does not modify the firm's voice or sentence patterns.
- It does not skip disclosures.
- It does not paraphrase legal or compliance language — that language is verbatim or it is missing.
- It does not "round up" verification flags into definitive statements.
- It does not produce plans in the absence of senior advisor sign-off (FR §17).
- It does not infer Fact Review fields the team did not capture. Missing data → "Unknown — to be obtained" → flagged as an open item.

---

## ERROR HANDLING

| Condition | Generator Response |
|---|---|
| Required FR field missing | Flag in checklist; do not generate the dependent recommendation |
| Sequencing conflict (e.g., GRAT triggered before recap) | Flag as error; force review |
| Two recommendations conflict (mutually exclusive) | Flag for senior advisor decision |
| Volatile rate not found in lookup | Fail closed — do not produce GRAT/IDGT/CRT outputs |
| Engagement archetype unsupported | Fail closed — do not produce plan |
| Fact Review not signed off by senior advisor (FR §17) | Fail closed — do not produce plan |
| Computed dollar value is negative or NaN | Suppress numeric output; flag for review |

---

## VERSIONING DISCIPLINE

When the KB is updated:
1. Increment KB version in `00_INDEX.md`
2. Add changelog entry to `00_master/CHANGELOG.md`
3. If REC IDs change in any way, mark old as `[DEPRECATED in vN]` rather than removing
4. If Fact Review template changes, update `03_FACT_REVIEW_FIELD_MAP.md` and bump the field map version
5. Run regression: regenerate the Holloway plan from the filled Fact Review and diff against the canonical Holloway output. Material differences flag a regression.
