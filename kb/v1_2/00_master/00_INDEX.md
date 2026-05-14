# AXIOM KNOWLEDGE BASE — v2

**Owner:** PSA Wealth · **Lead Advisor:** Will Bearden
**Reference exemplar:** Holloway Financial Plan Delivery (April 29, 2026)
**Build date:** v2 — verified against IRS Notice 2025-67, OBBBA (P.L. 119-21, signed July 4, 2025), and current 2026 federal/state law
**Format:** Multi-file structure. The master index loads first; category files load on demand based on Fact Review triggers.

---

## PURPOSE

This Knowledge Base is the system context for the Axiom plan generator. The generator reads a completed Fact Review, evaluates triggering conditions across all recommendations, sequences the activated recommendations using the firm's sequencing logic, generates plan output using the firm's voice and quantified-impact framing, and applies the firm's disclosure language verbatim. The result should be plan output of Holloway-quality from any new Fact Review of comparable rigor.

This is the brain of Axiom. Every entry is structured for machine consumption while remaining readable by the team.

---

## FILE STRUCTURE

```
axiom_kb/
├── 00_master/
│   ├── 00_INDEX.md                    [this file — the entry point]
│   ├── 01_HOW_THE_GENERATOR_USES_THIS.md
│   ├── 02_RECOMMENDATION_ID_REGISTRY.md
│   └── 03_FACT_REVIEW_FIELD_MAP.md
│
├── 01_recommendations/
│   ├── tax/                           [REC-TAX-001 … REC-TAX-NNN]
│   ├── estate/                        [REC-EST-001 … REC-EST-NNN]
│   ├── entity_structure/              [REC-ENT-001 … REC-ENT-NNN]
│   ├── risk_insurance/                [REC-RSK-001 … REC-RSK-NNN]
│   ├── retirement/                    [REC-RET-001 … REC-RET-NNN]
│   ├── investment/                    [REC-INV-001 … REC-INV-NNN]
│   ├── succession_retention/          [REC-SUC-001 … REC-SUC-NNN]
│   ├── family/                        [REC-FAM-001 … REC-FAM-NNN]
│   ├── charitable/                    [REC-CHR-001 … REC-CHR-NNN]
│   └── specialty/                     [REC-SPC-001 … REC-SPC-NNN — landmines & advanced]
│
├── 02_reference/
│   ├── 01_federal_estate_gift_gst.md
│   ├── 02_federal_income_tax_limits.md
│   ├── 03_qbi_section_199a.md
│   ├── 04_passive_activity_section_469.md
│   ├── 05_obbba_changes_summary.md   [the most important reference file in 2026]
│   ├── 06_section_1202_qsbs.md
│   ├── 07_georgia_specifics.md
│   ├── 08_volatile_rates_lookup.md   [§7520, AFR — refresh monthly]
│   ├── 09_crummey_mechanics.md
│   ├── 10_section_409a.md
│   ├── 11_section_101_life_insurance.md
│   ├── 12_grantor_trust_rules.md
│   ├── 13_chapter_14_special_valuation.md
│   ├── 14_irs_audit_exam_areas.md
│   └── 15_citation_index.md
│
├── 03_sequencing/
│   ├── 01_master_sequence_pre_exit.md
│   ├── 02_master_sequence_post_exit.md
│   ├── 03_hard_sequencing_rules.md
│   ├── 04_independent_recommendations.md
│   ├── 05_triggering_matrix.md
│   └── 06_engagement_archetypes.md
│
├── 04_voice/
│   ├── 01_sentence_patterns.md
│   ├── 02_forbidden_phrases.md
│   ├── 03_tone_toward_partners.md
│   ├── 04_document_architecture.md
│   ├── 05_tables_and_formatting.md
│   ├── 06_quantification_conventions.md
│   └── 07_plan_output_template_master.md
│
├── 05_disclosures/
│   ├── 01_mml_disclosure.md
│   ├── 02_tax_legal_disclaimer.md
│   ├── 03_estimates_projections.md
│   ├── 04_compliance_tracking.md
│   ├── 05_section_specific_disclosures.md
│   └── 06_landmine_recommendation_disclosures.md
│
└── 06_open_items/
    ├── 01_verification_queue.md
    ├── 02_firm_policy_questions.md
    └── 03_v3_candidates.md
```

---

## RECOMMENDATION ID REGISTRY

Every recommendation has a stable ID of the form `REC-CAT-NNN` where CAT is the three-letter category and NNN is a sequence within that category. IDs never change once assigned. New recommendations append; deprecated recommendations are marked `[DEPRECATED in v_N]` but remain in the registry.

**Categories and prefixes:**

| Prefix | Category | Folder |
|---|---|---|
| `REC-TAX` | Tax (income tax planning, elections, credits) | `tax/` |
| `REC-EST` | Estate (transfer, trust, gift, GST) | `estate/` |
| `REC-ENT` | Entity Structure (formations, reorgs, recaps, agreements) | `entity_structure/` |
| `REC-RSK` | Risk & Insurance (life, DI, P&C, key-person, buy/sell funding) | `risk_insurance/` |
| `REC-RET` | Retirement (qualified plans, IRAs, NQDC) | `retirement/` |
| `REC-INV` | Investment (portfolio, asset location, cash management) | `investment/` |
| `REC-SUC` | Succession & Retention (transition, retention plans, equity paths) | `succession_retention/` |
| `REC-FAM` | Family & Education (children's planning, 529, multi-gen) | `family/` |
| `REC-CHR` | Charitable (DAF, CRT, CLT, foundation, bargain sale) | `charitable/` |
| `REC-SPC` | Specialty (post-exit deployment, advanced and landmine strategies) | `specialty/` |

See `00_master/02_RECOMMENDATION_ID_REGISTRY.md` for the full registry with status (Active / Active-Cautioned / Landmine-Use-Only-On-Direction / Deprecated).

---

## STRUCTURE OF EVERY RECOMMENDATION FILE

Every file in `01_recommendations/` follows this exact structure. The generator parses this structure mechanically.

```markdown
# [REC-XXX-NNN] — [Recommendation Name]

## METADATA
- **ID:** REC-XXX-NNN
- **Status:** Active | Active-Cautioned | Landmine | Deprecated
- **Category:** [from category list]
- **Subcategory:** [optional finer grouping]
- **Engagement archetypes:** [Pre-Exit | Post-Exit | Both]
- **Plan section placement:** [where this lands in the client-facing plan output]
- **Last verified:** [date]
- **Verification frequency:** [Annual | Quarterly | Per-engagement | Static]

## TRIGGERING CONDITIONS

### Structured logic (machine-evaluable)
[Boolean expression referencing Fact Review fields by exact label]

### Natural-language explanation
[Plain English version for human review]

### Hard disqualifiers
[Conditions that override and prevent this recommendation regardless of other triggers]

## WHAT IT IS
[1-3 sentences plain English]

## WHY WE RECOMMEND IT
[The firm's framing — the reasoning the firm uses with clients]

## VARIATIONS AND STRUCTURAL OPTIONS
[Sub-types and trade-offs — where applicable]

## QUANTIFIED IMPACT FRAMEWORK

### Impact components
[Itemized list of value drivers]

### Worked numerical example
[A fully-modeled example the generator can mirror]

### Range parameters
[Variables and typical ranges for the generator to scale into client facts]

## IMPLEMENTATION STEPS
[Sequenced action items]

## SEQUENCING DEPENDENCIES
- **MUST come AFTER:** [other REC-IDs]
- **MUST come BEFORE:** [other REC-IDs]
- **COORDINATED WITH:** [other REC-IDs in parallel]
- **MUTUALLY EXCLUSIVE WITH:** [other REC-IDs that conflict]

## DOCUMENTATION CHECKLIST
[The actual paper trail required — defensibility]

## COMMON MISTAKES & AUDIT TRIGGERS
[What gets this attacked in IRS exams or litigation]

## COORDINATION NOTES (Quarterback Roles)
- **PSA Wealth role:** 
- **CPA role:** 
- **Attorney role:** 
- **Other professionals:** 

## CLIENT CONVERSATION FRAMING
[How the firm explains this in plain English, including trade-offs the client cares about]

## CAVEATS & DISQUALIFIERS
[When NOT to recommend; edge cases; risk factors]

## REFERENCES
[Code sections, regulations, key cases, IRS guidance — citations only when certain]

## PLAN OUTPUT TEMPLATE
[Exact prose pattern the generator produces in the client-facing plan]
```

---

## HOW THE GENERATOR USES THIS

See `00_master/01_HOW_THE_GENERATOR_USES_THIS.md` for full execution model. Summary:

1. **Load:** Master index (this file) + Reference KB (`02_reference/`) + Voice (`04_voice/`) + Disclosures (`05_disclosures/`) + Sequencing (`03_sequencing/`).
2. **Parse Fact Review:** Extract fields per `00_master/03_FACT_REVIEW_FIELD_MAP.md`.
3. **Evaluate triggers:** For each recommendation file, evaluate Triggering Conditions / Structured Logic against the parsed Fact Review. Build candidate set.
4. **Apply hard disqualifiers:** Remove recommendations where any disqualifier fires.
5. **Sequence:** Apply hard sequencing rules from `03_sequencing/03_hard_sequencing_rules.md` to order the candidate set into Phases.
6. **Generate plan output:** Use `04_voice/07_plan_output_template_master.md` plus per-recommendation `PLAN OUTPUT TEMPLATE` sections to produce the client-facing plan.
7. **Insert disclosures:** Apply `05_disclosures/` content verbatim.
8. **Stamp compliance:** Apply Compliance Tracking ID format.
9. **Flag verification items:** Surface any [VERIFY 2026], [CONFIRM WITH WILL], or [LANDMINE] flags as action items for senior advisor review BEFORE delivery.

---

## CRITICAL NOTE ON 2026 LAW CHANGES

The Holloway plan referenced (dated April 29, 2026) contains numbers that were correct as of its drafting context but should be updated when generating new plans:

| Item | Holloway said | 2026 Verified |
|---|---|---|
| Federal estate/gift exemption (individual) | $13.99M | **$15M** (OBBBA — P.L. 119-21) |
| Federal estate/gift exemption (couple) | $27.98M | **$30M** |
| Annual gift exclusion | $19,000 | $19,000 ✓ |
| Georgia PTET rate | 5.39% | **5.19% for TY2025**, scheduled to fall 0.1%/yr toward 4.99% |
| 401(k) deferral limit | $23,000 | **$24,500** |
| 401(k) catch-up at 50+ | $7,500 | **$8,000** |
| 401(k) super catch-up 60–63 | $34,750 (suspect) | **$11,250** super catch-up; total $35,750 |
| §415 DC limit | not stated | **$72,000** |
| §415 DB limit | not stated | **$290,000** |
| §401(a)(17) compensation limit | not stated | **$360,000** |
| SS wage base | not stated | **$184,500** |
| HSA self / family | not stated | **$4,400 / $8,750** (HDHP min ded $1,700/$3,400) |
| FSA | not stated | **$3,400** |
| Standard deduction MFJ | not stated | **$32,200** |
| SALT cap | $10,000 | **$40,000** (OBBBA) with phase-out above $500K AGI |
| §1202 QSBS exclusion (post-7/4/25) | $10M | **$15M** or 10× basis |
| §1202 gross asset cap (post-7/4/25) | $50M | **$75M** |
| §1202 holding period (post-7/4/25) | 5 yrs for 100% | **3/4/5 yrs for 50%/75%/100%** |
| Bonus depreciation | "phase-down" | **100% PERMANENT** (OBBBA — property after 1/19/25) |
| QBI deduction | scheduled to expire | **PERMANENT** (OBBBA) |
| §7520 hurdle rate | "~5.0%" | May 2026: **5.0%**; April 2026: 4.6%; March 2026: 4.8% |

The generator MUST refresh §7520 rate and AFRs from `02_reference/08_volatile_rates_lookup.md` (which the team updates monthly) before producing any GRAT, IDGT, intra-family loan, or charitable trust output.

---

## ENGAGEMENT ARCHETYPES SUPPORTED

The KB supports the following engagement archetypes (per Fact Review §1):

1. **Pre-Exit Business Owner** — primary archetype the Holloway plan exemplifies. 3–10 year transaction window. Heavy on entity structuring, estate transfer, retention.
2. **Post-Exit Business Owner** — post-liquidity event. Focus shifts to deployment, asset diversification, multi-generational planning, philanthropy at scale.
3. **Active Owner Without Exit Horizon** — operating but not actively positioning for sale. Estate, retirement, and tax optimization without transaction-driven sequencing.
4. **Family Office / Multi-Generational** — wealth concentration spread across multiple generations and entities. Governance, education, sustainability.
5. **Pre-Liquidity Founder (Equity-Heavy, Pre-Vest)** — founders with material illiquid equity who are not yet liquid. Less common in PSA's lane but the architecture supports it.

Each recommendation declares which archetypes it applies to in its Metadata block.

---

## SAFETY POSTURE

The Knowledge Base flags certain recommendations as `[LANDMINE]`. These are strategies that have legitimate use cases but carry significant tax, legal, regulatory, or reputational risk and have been heavily abused or are under active enforcement scrutiny. The generator NEVER includes a Landmine recommendation in plan output without explicit senior-advisor opt-in. Examples: conservation easements, micro-captive 831(b)s, certain Roth structures, aggressive valuation discount strategies.

The KB also flags `[ADVANCED]` recommendations that are appropriate but require specialist counsel beyond the firm's in-house bench. Examples: PPLI, multi-state trust situs decisions, complex GRAT/IDGT layering at scale.

---

## VERSIONING

- v1: Initial codification, 30 recommendations, single-file format
- v2: Multi-file structure, 50+ recommendations, OBBBA-updated, Plan Output Templates added, IDs assigned, structured triggers
- v3 (planned): Add post-exit recommendations depth, multi-state module, Will's firm-policy answers integrated, additional landmine recommendations evaluated

Every change is tracked in `00_master/CHANGELOG.md` (created at v2 close).

---

## OPEN ITEMS FOR WILL — SUMMARY

See `06_open_items/` for full detail. Key items requiring Will's input before v3:

1. Firm-policy questions: default GRAT term, default trustee structure, MassMutual product mix, cash-management partner default, direct-indexing platform default, children's trust default (per-child vs. pot trust), umbrella floor cutoffs.
2. Verification queue: §1202 state conformity for Georgia (note: the OBBBA changes apply federally; state may not conform); Georgia 529 deduction current cap; current bonus-depreciation interaction with §469 grouping; specifics on SECURE 2.0 mandatory Roth catch-up implementation.
3. Landmine sign-off: Will needs to confirm which Landmine recommendations are ever appropriate to include in plan output even with senior-advisor approval (e.g., conservation easements may be a categorical no for the firm).
