# Stage 2c — Deterministic Sequencing

**Type:** Deterministic. NO LLM call. Pure code.

**Purpose:** Take Stage 2b's calibrated `selected[]` and `supplemental_candidates[]` and produce the final `SelectedRecommendations` consumed by Stage 3a. Two jobs:

1. **Populate sequencing relations** on every `selected[]` entry by parsing each rec file's `## SEQUENCING DEPENDENCIES` section and resolving referenced rec_ids against the selected set (with optional promotion from supplemental_candidates when a hard-required relation forces it).
2. **Populate landmine status** on every `selected[]` entry by reading the canonical `Status` column of `00_master/02_RECOMMENDATION_ID_REGISTRY.md` and cross-referencing the orchestrator's `landmineAuthorizations[]`.

**Critical:** Stage 2c is deterministic. Same input → same output. No LLM, no temperature, no stochastic behavior. The decomposition rests on this property: by removing sequencing from the LLM stage (2b), we eliminate the cross-reference orphan-scrub problem that broke the monolithic Stage 2. Stage 2c parses what the rec files already declare and applies the rules mechanically.

**Origin:** Stage 2c is the third sub-stage in the Stage 2 decomposition that replaced the monolithic three-pass design. The archived attempt lives at `specs/stages/_archive/stage2_recommendation_selector_v1_attempt_1.spec.md`.

**Input:**
- selected_calibrated: `SelectedRecommendationCalibrated[]` (from Stage 2b)
- supplemental_candidates: `SupplementalCandidate[]` (from Stage 2b — augmented payload, used for orphan resolution)
- speculative_dropped: `SpeculativeDropped[]` (from Stage 2b — passed through unchanged)
- pass_summaries_in: `{ pass_1_hard_filter, pass_2_calibration }` carried forward from upstream stages
- options:
  - kbPath?: string (default `"kb/v1_2/"`)
  - landmineAuthorizations?: `Array<{ recommendation_id: string; authorized_by: string }>`

**Output:** `SelectedRecommendations` on success; `SelectedRecommendationsFailed` on failure. No throws. (`SelectedRecommendation` already exists in `pipelineTypes.ts`.)

---

## Algorithm

Stage 2c runs five passes, all deterministic.

### Pass 1 — Load registry and parse landmine column

Read `kbPath/00_master/02_RECOMMENDATION_ID_REGISTRY.md`. The registry is a markdown table of the form:

```
| ID | Name | Status | Archetypes |
| --- | --- | --- | --- |
| REC-TAX-001 | Georgia PTET Election | Active | PRE / POST / ACT |
...
| REC-RSK-016 | Captive Insurance Company (831(b) Election) | Landmine | PRE / FO ... |
| REC-CHR-011 | Conservation Easement | Landmine | Default OFF — IRS ... |
```

Parse into a `Map<string, RegistryEntry>` keyed by rec_id with fields `{ name, status, archetypes_text }`. The full status enum: `"Active" | "Active-Cautioned" | "Advanced" | "Landmine" | "Deprecated"`. As of the v1.2 KB inventory, exactly two recs have `Status: Landmine`: `REC-RSK-016` and `REC-CHR-011`. The implementation does not hardcode that set — it reads the status column.

If the registry is missing or malformed: return `SelectedRecommendationsFailed` with `kb_load_failed` and the path/parse error.

Cache the parsed registry at module scope; the registry rarely changes within a session.

### Pass 2 — Read SEQUENCING DEPENDENCIES per selected rec

For each rec in `selected_calibrated[]`:

1. Resolve to file path via the registry's category column (or via the rec_id prefix mapping: `REC-TAX-` → `tax/`, `REC-EST-` → `estate/`, etc.). Same path resolution Stage 2b uses.
2. Read the file. Extract the `## SEQUENCING DEPENDENCIES` section using the same section parser Stage 2b uses (`src/lib/orchestrator/utils/recFileSections.ts`, Phase 4 work).
3. If the section is absent, treat as no sequencing constraints (all relation arrays empty). This is valid — `03_independent_recommendations.md` enumerates recs with no sequencing.

### Pass 3 — Parse relation lines per section

The SEQUENCING DEPENDENCIES section follows a stable bullet-line format observed across the KB. Each bullet starts with a relation header in bold, optionally with comma-separated rec references, and may include free-text explanation after an em-dash. Examples:

```
- **SEQUENCED WITH:** REC-ENT-002 (F-Reorg), REC-ENT-003 (Recap), REC-EST-005 (Children's Trusts) — all part of the same workplan; order in plan output is: …
- **MUST come AFTER:** Qualified appraisal of non-voting interest (real-world prerequisite — …)
- **Coordinated WITH:** REC-EST-008 (IDGT Sale) — alternative or complementary
- **MUTUALLY EXCLUSIVE WITH:** Outright gifting of same asset (single asset can't go to both)
- **Independent:** Can be made immediately. Does not depend on other recommendations.
- **Time-sensitive:** Election deadline is entity return due date including extensions.
- **MUST come BEFORE:** REC-EST-004 (ILIT) — establish the trust structure first
```

The parser:

1. Reads each bullet line. Lines that don't start with `- **` are ignored (they're sub-bullets or explanatory continuation).
2. Matches the bold header (case-insensitive) against a header table:

   | Header text (case-insensitive) | Relation kind |
   |---|---|
   | `SEQUENCED WITH` | `sequenced_with` |
   | `MUST come AFTER` / `MUST COME AFTER` | `must_come_after` |
   | `MUST come BEFORE` / `MUST COME BEFORE` | `must_come_before` |
   | `Coordinated WITH` / `COORDINATED WITH` | `coordinated_with` |
   | `MUTUALLY EXCLUSIVE WITH` | `mutually_exclusive_with` |
   | `Independent` / `Time-sensitive` | (informational only — not a relation) |

3. Extracts every `REC-XXX-NNN` token from the line via the regex `/REC-[A-Z]{2,4}-\d{3}/g`. This is robust to the varied formatting (with or without parens, optional trailing names).
4. Free-text references that do NOT match the regex (e.g., "Qualified appraisal of non-voting interest" in the example above) are NOT treated as rec relations. They are noted into `_audit_notes` per the rec but do not enter the relation arrays. This is intentional — sequencing relations live between rec_ids only; non-rec prerequisites are documented in IMPLEMENTATION STEPS (Stage 3a's domain).
5. Unknown headers (anything not in the table above) are logged as `_stage_flags.unknown_sequencing_header[]` with the rec_id and the literal header text. Future KB versions may introduce new headers; v1.2 conforms to the table.

Output of Pass 3 per rec: `RawRelations { must_come_after: string[], must_come_before: string[], sequenced_with: string[], coordinated_with: string[], mutually_exclusive_with: string[] }`.

### Pass 4 — Resolve referenced rec_ids; promote supplementals where required

Build a Set of selected rec_ids: `selectedSet = new Set(selected_calibrated.map(r => r.recommendation_id))`. Build a Map from supplemental rec_ids to their `SupplementalCandidate` payloads.

For each selected rec's RawRelations, for each referenced rec_id in each relation array:

- **Case A — referenced id is in `selectedSet`.** The relation populates directly: append `{ recommendation_id: <ref> }` to the corresponding array on the parent rec.

- **Case B — referenced id is in supplementals AND relation kind is `must_come_after` or `sequenced_with`.** These are HARD requirements. Promote the supplemental to selected[]:
  - Move the SupplementalCandidate payload from `supplemental_candidates[]` into `selected_calibrated[]` (re-typed as a SelectedRecommendation; `match_strength` stays `"borderline"`; `triggers_partial` carries; `triggers_matched` carries; `brief_rationale` carries).
  - Add the rec_id to `selectedSet`.
  - Record the promotion in `_stage_flags.promoted_from_supplemental[]`.
  - Recursively process the promoted rec's own SEQUENCING DEPENDENCIES (Pass 2 + Pass 3 + Pass 4 again for it). Bound the recursion at depth 3 to prevent pathological transitive promotion chains; depth-exceeded promotions surface as `_stage_flags.promotion_chain_truncated[]`. (In practice the KB does not produce chains >2.)

- **Case C — referenced id is in supplementals AND relation kind is `coordinated_with`.** Soft preference; do NOT promote. Note in `_stage_flags.coordinated_with_supplemental[]` so the advisor sees that a coordination preference points at a non-selected rec (could be promoted manually, could be left).

- **Case D — referenced id is in supplementals AND relation kind is `mutually_exclusive_with`.** This is a data-shape inconsistency (the LLM kept rec X in selected, supplemental Y declares mutual exclusivity with X — Y shouldn't have been kept as supplemental at all if it's mutually exclusive with a selected). Note in `_stage_flags.mutually_exclusive_in_supplemental[]` for advisor review. Do NOT promote; do NOT auto-resolve.

- **Case E — referenced id is in `speculative_dropped[]`.** Drop the relation silently (a speculative was dropped by Stage 2b for good reason; resurrecting it via sequencing is wrong). Note in `_stage_flags.relation_to_speculative_dropped[]`.

- **Case F — referenced id is unknown** (not in selected, not in supplemental, not in speculative_dropped, possibly not in registry at all). This is a dangling reference. Append to `_stage_flags.dangling_sequencing_references[]` as `{ from_rec_id, to_rec_id, relation_type }`. Do NOT include in the relation array. Continue. Dangling refs are typically caused by KB authoring drift (a rec file references a deprecated id, or a typo); the flag surfaces them for fix.

### Pass 5 — Populate landmine status; build SelectedRecommendation envelope

For each rec in the (now-promoted-inclusive) selected set, build a `SelectedRecommendation` with:

- All Stage 2b-calibrated fields preserved: `recommendation_id`, `category`, `match_strength`, `brief_rationale`, `triggers_matched`, `triggers_partial`.
- All five sequencing relation arrays (`must_come_after`, `must_come_before`, `sequenced_with`, `coordinated_with`, `mutually_exclusive_with`) populated from Pass 4.
- `preliminary_preference` and `preliminary_preference_rationale`: when `mutually_exclusive_with[].length > 0`, populate per the rec's preferred-variant guidance (extracted from the rec file's PLAN OUTPUT TEMPLATE → "Sequencing → Mutually Exclusive Treatment" subsection if present; otherwise both `null`). Stage 2c reads only what the rec file declares; it does NOT make preference choices.
- `landmine`: derived from `registryEntry.status === "Landmine"`.
- `landmine_status`:
  - If `landmine === false`: `"not_a_landmine"`.
  - If `landmine === true` AND `landmineAuthorizations[]` contains an entry for this rec_id: `"landmine_authorized_by_<authorized_by>"` (the authorizer string from the matching authorization).
  - If `landmine === true` AND no authorization: `"landmine_excluded_default"`.

### Pass 6 — Build pass_summaries and stage flags

```typescript
const pass_3_sequencing = {
  sequencing_relations_total: sum across selected of all five relation array lengths,
  landmines_marked: count of selected with landmine === true,
  promoted_from_supplemental: count of promoted rec_ids,
  dangling_references: _stage_flags.dangling_sequencing_references.length,
};
```

`_stage_flags`:

```typescript
{
  candidate_set_unusually_small: selected.length < 15,
  candidate_set_unusually_large: selected.length > 30,    // post-promotion may push over 30
  landmines_present_count: number,
  mutually_exclusive_pairs_present: number,                // half-count: each pair once
  dangling_sequencing_references: Array<{ from_rec_id, to_rec_id, relation_type }>,
  promoted_from_supplemental: string[],                    // rec_ids
  coordinated_with_supplemental: Array<{ from_rec_id, to_rec_id }>,
  mutually_exclusive_in_supplemental: Array<{ from_rec_id, to_rec_id }>,
  relation_to_speculative_dropped: Array<{ from_rec_id, to_rec_id, relation_type }>,
  unknown_sequencing_header: Array<{ rec_id, header_text }>,
  promotion_chain_truncated: string[],                     // rec_ids whose recursion was bounded
}
```

Note: `selected.length > 30` after promotion is allowed — the 30-cap was a Stage 2b discipline. Promotion is a hard sequencing requirement and may legitimately push the count over. The flag surfaces it; it does not fail the stage.

### Pass 7 — Compute stage timing and assemble SelectedRecommendations

```typescript
return {
  selected,
  supplemental_candidates: remaining_after_promotion,
  speculative_dropped,
  pass_summaries: {
    pass_1_hard_filter: pass_summaries_in.pass_1_hard_filter,
    pass_2_calibration: pass_summaries_in.pass_2_calibration,
    pass_3_sequencing,
  },
  _stage_flags,
  _metadata: {
    stage_2a: <upstream metadata>,
    stage_2b: <upstream metadata>,
    stage_2c_duration_ms: end - start,
  },
};
```

The harness threads `stage_2a` and `stage_2b` metadata through to Stage 2c so the unified output carries the full provenance. Stage 2c's own metadata is just timing and version (`stage_2c_version: "2c-1.0.0"`).

---

## Output Schema

Stage 2c emits the existing `SelectedRecommendations` shape (already in `pipelineTypes.ts`) augmented with the cross-stage metadata composite.

```typescript
export interface SelectedRecommendations {
  selected: SelectedRecommendation[];                       // existing pipelineTypes shape, all sequencing arrays populated
  supplemental_candidates: SupplementalCandidate[];         // post-promotion remainder
  speculative_dropped: SpeculativeDropped[];

  pass_summaries: {
    pass_1_hard_filter: { input_universe: 130; eliminated: number; survived: number };
    pass_2_calibration: { strong: number; borderline: number; speculative: number };
    pass_3_sequencing: {
      sequencing_relations_total: number;
      landmines_marked: number;
      promoted_from_supplemental: number;
      dangling_references: number;
    };
  };

  _stage_flags: {
    candidate_set_unusually_small: boolean;
    candidate_set_unusually_large: boolean;
    landmines_present_count: number;
    mutually_exclusive_pairs_present: number;
    dangling_sequencing_references: Array<{
      from_rec_id: string;
      to_rec_id: string;
      relation_type: string;
    }>;
    promoted_from_supplemental: string[];
    coordinated_with_supplemental: Array<{ from_rec_id: string; to_rec_id: string }>;
    mutually_exclusive_in_supplemental: Array<{ from_rec_id: string; to_rec_id: string }>;
    relation_to_speculative_dropped: Array<{
      from_rec_id: string;
      to_rec_id: string;
      relation_type: string;
    }>;
    unknown_sequencing_header: Array<{ rec_id: string; header_text: string }>;
    promotion_chain_truncated: string[];
  };

  _metadata: {
    stage_2a: StageMetadata;
    stage_2b: StageMetadata;
    stage_2c_version: string;
    stage_2c_duration_ms: number;
  };
}

export interface SelectedRecommendationsFailed {
  _stage_status: "FAILED";
  _failure_type:
    | "kb_load_failed"
    | "registry_parse_failed"
    | "rec_file_not_found"
    | "section_parse_failed";
  _failure_reason: string;
  _failure_context: {
    missing_rec_id?: string;
    missing_path?: string;
    parse_error?: string;
  };
  _metadata: Partial<{ stage_2a: StageMetadata; stage_2b: StageMetadata; stage_2c_duration_ms: number }>;
}
```

`SelectedRecommendation`, `SupplementalCandidate`, and `SpeculativeDropped` are existing shapes. Stage 2c does not alter `pipelineTypes.ts` — the schema additions live in `src/lib/orchestrator/schemas/stage2c.types.ts` (the augmented `SelectedRecommendations` envelope with cross-stage metadata), not in the canonical pipeline types.

---

## Implementation Requirements

1. **Module location:** `src/lib/orchestrator/stages/stage2cSequencing.ts`.

2. **Schema location:** `src/lib/orchestrator/schemas/stage2c.types.ts` — defines the SelectedRecommendations envelope augmented with cross-stage metadata. Reuses `SelectedRecommendation`, `SupplementalCandidate`, `SpeculativeDropped` from `pipelineTypes.ts`; reuses `StageMetadata` from `clientProfile.ts`.

3. **No system prompt.** Deterministic.

4. **Function signature:**

```typescript
export function runStage2cSequencing(
  input: Stage2cInput,
  options?: Stage2cOptions,
): SelectedRecommendations | SelectedRecommendationsFailed;

export interface Stage2cInput {
  selected_calibrated: SelectedRecommendationCalibrated[];
  supplemental_candidates: SupplementalCandidate[];
  speculative_dropped: SpeculativeDropped[];
  pass_summaries_in: {
    pass_1_hard_filter: { input_universe: 130; eliminated: number; survived: number };
    pass_2_calibration: { strong: number; borderline: number; speculative: number };
  };
  upstream_metadata: { stage_2a: StageMetadata; stage_2b: StageMetadata };
}

export interface Stage2cOptions {
  kbPath?: string;
  landmineAuthorizations?: Array<{ recommendation_id: string; authorized_by: string }>;
}
```

Note: the function is **synchronous** — pure code over already-loaded inputs plus filesystem reads. Filesystem reads use `fs.readFileSync` from a small set of files (registry + N rec files where N = selected count). At v1 selected counts (≤ 30), this is well under 50ms total. Async signature would add complexity for no benefit. (This differs from Stage 2a / 2b which are async because they call the LLM.)

5. **No throws.** All errors caught and returned as `SelectedRecommendationsFailed`.

6. **Pure-function-ish:** given the same inputs (including filesystem state), Stage 2c produces identical output. No randomness, no time-of-day dependence, no LLM stochasticity.

7. **Shared utilities:**
   - `recFileSections.ts` (Phase 4 work, also used by Stage 2b and Stage 3a) for reading the SEQUENCING DEPENDENCIES section.
   - `registryParser.ts` (new in Phase 4) for parsing the markdown registry table into a Map. Module-scope cache.
   - Both utilities live under `src/lib/orchestrator/utils/`.

8. **Cost: $0** (no LLM call). Latency: tens of milliseconds for typical input sizes.

---

## Test Requirements

Create `src/lib/orchestrator/stages/__tests__/stage2cSequencing.test.ts`. Use Node's `node:test` runner. All tests are unit-level — no API calls, no skip-gating.

### Test cases

1. **Happy path: 5 selected with various relations** → all relation arrays populate from rec files; landmine_status set per registry; pass_summary correct.

2. **Sequencing references between selected recs** — given selected = {A, B, C} and A's rec file declares "MUST come AFTER: B" → `selected_for_A.must_come_after === [{recommendation_id: "B"}]`.

3. **Multiple references in one bullet** — A's rec file declares "SEQUENCED WITH: B (foo), C (bar), D (baz)" → A's `sequenced_with` populates with B, C, D.

4. **Free-text reference (non-rec-id)** — A's rec file declares "MUST come AFTER: Qualified appraisal" (no REC-id) → A's `must_come_after` stays `[]`; nothing logged as dangling because no rec_id was present.

5. **Promotion from supplemental on `must_come_after`** — selected = {A}, supplemental = {B}, A's rec file declares "MUST come AFTER: B" → B promoted into selected; `_stage_flags.promoted_from_supplemental.includes("B")`.

6. **Promotion from supplemental on `sequenced_with`** — same setup with `SEQUENCED WITH` → B promoted.

7. **NO promotion from supplemental on `coordinated_with`** — selected = {A}, supplemental = {B}, A declares "Coordinated WITH: B" → B NOT promoted; `_stage_flags.coordinated_with_supplemental` includes the pair; A's `coordinated_with` stays `[]` (the relation isn't recorded since B isn't selected).

8. **NO promotion on `mutually_exclusive_with` (data inconsistency)** — `_stage_flags.mutually_exclusive_in_supplemental` populated.

9. **Reference to speculative_dropped** — selected = {A}, speculative_dropped = [{B}], A declares "Coordinated WITH: B" → A's `coordinated_with` stays `[]`; `_stage_flags.relation_to_speculative_dropped` includes the entry.

10. **Dangling reference** — A declares "SEQUENCED WITH: REC-XXX-999" (not in any of the three sets, possibly not in registry) → A's `sequenced_with` stays `[]`; `_stage_flags.dangling_sequencing_references` includes the entry.

11. **Independent rec** — A declares "**Independent:** can be made immediately" → all five relation arrays empty; no flags raised; `unknown_sequencing_header` does NOT include `Independent`.

12. **Recursive promotion chain** — selected = {A}, supplemental = {B, C}, A declares "MUST come AFTER: B"; B's rec file declares "MUST come AFTER: C" → both B and C promoted; chain depth 2; no truncation flag.

13. **Promotion chain at depth 3** — chain length 4 from selected → bounded at depth 3 → `_stage_flags.promotion_chain_truncated` populated for the 4th rec.

14. **Landmine — not authorized** — selected includes REC-RSK-016 (Status: Landmine), no authorization → `landmine: true`, `landmine_status: "landmine_excluded_default"`.

15. **Landmine — authorized** — selected includes REC-RSK-016, `landmineAuthorizations: [{recommendation_id: "REC-RSK-016", authorized_by: "advisor_42"}]` → `landmine: true`, `landmine_status: "landmine_authorized_by_advisor_42"`.

16. **Non-landmine** — selected includes REC-TAX-001 (Status: Active) → `landmine: false`, `landmine_status: "not_a_landmine"`.

17. **Unknown sequencing header** — A's rec file has bullet `- **NOVEL HEADER:** REC-B` → flag populated; A's relation arrays unaffected for that line.

18. **Missing SEQUENCING DEPENDENCIES section on selected rec** → that rec gets all-empty relation arrays; no failure.

19. **Missing rec file for selected rec_id** → `SelectedRecommendationsFailed` with `rec_file_not_found`.

20. **Missing registry** → `SelectedRecommendationsFailed` with `kb_load_failed`.

21. **Cross-stage metadata threading** — input includes upstream `stage_2a` and `stage_2b` metadata → output `_metadata` carries both, plus `stage_2c_version` and `stage_2c_duration_ms`.

22. **Pass-summary correctness** — given selected.length = 22 (after promotion 25), landmines = 1 → `pass_summaries.pass_3_sequencing.landmines_marked === 1`, `promoted_from_supplemental === 3`, `sequencing_relations_total` matches sum of all relation arrays.

23. **Mutually-exclusive-with pair counting** — A declares "MUTUALLY EXCLUSIVE WITH: B"; B declares "MUTUALLY EXCLUSIVE WITH: A" → `_stage_flags.mutually_exclusive_pairs_present === 1` (half-count).

Tests use small synthetic rec files placed under a tmp directory and passed via `kbPath` option. The test fixtures are minimal — just enough text to exercise the parser.

---

## What This Does NOT Do

- Does NOT call any LLM stage.
- Does NOT calibrate match strength. (Stage 2b's job, preserved through.)
- Does NOT generate `brief_rationale`, `triggers_matched`, `triggers_partial`. (Stage 2b's job, preserved through.)
- Does NOT decide preferred variant in mutually-exclusive pairs beyond what the rec file declares. If a rec file's PLAN OUTPUT TEMPLATE marks a preferred variant, Stage 2c reads it; otherwise `preliminary_preference` and `preliminary_preference_rationale` stay `null` for advisor decision in the Decisions Needed Page (Stage 3b).
- Does NOT compute the topological sort (cluster detection, position_in_sequence). That's Stage 3b.
- Does NOT validate semantic coherence (no "is this combination of recs actually sensible?"). It validates structural integrity only.
- Does NOT enforce a hard cap on `selected.length`. Stage 2b enforced ≤ 30; Stage 2c may legitimately push over via promotion. Cap discipline is Stage 2b's; Stage 2c surfaces a flag if it exceeds.
- Does NOT auto-resolve mutually-exclusive conflicts when both sides land in selected. The relation populates on both; Stage 3b's Decisions Needed Page handles the conflict surfacing.

---

## V1 Backlog

- **Sequencing parser robustness** — the v1 parser handles the bullet patterns observed across the v1.2 KB. Future KB versions may introduce new sequencing patterns (e.g., conditional dependencies: "MUST come AFTER X if archetype === PRE"). v1.3+ may need conditional-relation support; v1.2 conforms to the bullet table above.
- **Promotion-chain depth limit** — bounded at 3 to prevent pathological recursion. Increase if real KB chains exceed; the bound is conservative.
- **Preferred-variant extraction** — v1 reads only what the rec file's PLAN OUTPUT TEMPLATE declares. v1.5 may add a more sophisticated preferred-variant rubric (advisor preference history, firm policy resolutions, archetype-keyed preference defaults). v1 leaves the choice to the advisor when not declared.
- **Cycle detection on `must_come_after` / `must_come_before` graph** — Stage 3b owns cycle detection in its topological sort. Stage 2c could pre-detect to fail-fast, but at v1 the cost-benefit favors letting 3b handle it (3b already has the cycle-detection apparatus). Push to v1.5 if frequent cycles surface.
