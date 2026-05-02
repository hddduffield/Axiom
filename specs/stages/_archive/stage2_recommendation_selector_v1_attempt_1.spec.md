> **ARCHIVED 2026-05-01.** Monolithic three-pass design failed live testing under compound constraints — token budgets, field-length limits, count caps, and cross-reference validation interacted such that the LLM could not reliably converge on valid output under all constraints simultaneously. Replaced by the Stage 2a / 2b / 2c decomposition documented at:
>
> - `specs/stages/stage2a_hard_filter.spec.md` — pattern-match hard filter on Haiku 4.5
> - `specs/stages/stage2b_calibration.spec.md` — calibration over Stage 2a candidates on Opus
> - `specs/stages/stage2c_sequencing.spec.md` — deterministic sequencing relations + landmine status, no LLM
>
> This file is preserved for architectural reference and post-mortem reasoning. Do not implement against it.

---

# Stage 2 — Recommendation Selector (ARCHIVED v1 attempt 1)

**Type:** LLM stage. Calls Anthropic API. Three-pass logic within a single call.

**Purpose:** Given a ClientProfile, select the recommendations from the KB that match this client's situation, calibrate match strength, and populate sequencing relations between selected recs. Outputs SelectedRecommendations consumed by Stage 3a.

**Critical:** This is the gateway from client data to recommendation set. Schema discipline is non-negotiable — every selected recommendation_id must exist in the KB, every sequencing relation must reference another selected rec.

---

## Three-Pass Algorithm (Within Single LLM Call)

The LLM does all three passes in one response. The system prompt structures the reasoning explicitly.

### Pass 1 — Hard Filter

Walk all 130 KB recommendations. For each, check the triggering criteria from KB/02_reference/05_triggering_matrix.md and the rec file's WHEN_TO_TRIGGER section.

Eliminate any rec where:
- Required entity type is absent (e.g., REC-ENT-001 needs operating LLC; client has only LP → eliminate)
- Required client characteristic is absent (e.g., REC-EST-008 IDGT needs taxable estate; client has zero estate → eliminate)
- Hard exclusion fires (e.g., REC-CHR-003 charitable trust requires charitable intent; client_profile.goals_and_values has no philanthropy mention → eliminate)

Output of Pass 1: candidate_set (typically 40-80 recs from the 130 universe).

### Pass 2 — Match Strength Calibration

For each rec in candidate_set, classify match_strength:

- **strong:** Clear fit. All triggering criteria firmly present. Recommendation will materially benefit this client. Examples for Holloway: REC-TAX-001 (Georgia PTET — operating LLC + GA residency + meaningful K-1), REC-EST-006 (GRAT — large appreciating asset + transaction window).

- **borderline:** Partial fit. Some triggering criteria present but not all, OR criteria present but benefit is modest. Needs advisor judgment to confirm pursuit. Examples: REC-CHR-001 (Donor-Advised Fund — client has charitable intent but small AGI; benefit modest), REC-RET-005 (Roth conversion — client has IRA but high marginal rate makes conversion unappealing).

- **speculative:** Theoretical fit only. Triggering criteria implied but not confirmed. Eliminate from candidate_set. Examples: REC-FAM-005 (529 plans — client mentioned children but no education planning context), REC-INV-009 (private equity allocation — client has liquidity but no expressed appetite for alts).

After Pass 2, candidate_set is reduced. Speculative recs are dropped (or moved to supplemental_candidates[] for advisor review without being in selected[]).

### Pass 3 — Sequencing Relations

For each rec in selected[], populate sequencing relations from the rec file's PLAN_OUTPUT_TEMPLATE → Sequencing section:

- **must_come_after:** This rec requires another rec to be implemented first
- **must_come_before:** This rec must precede another rec
- **sequenced_with:** This rec is part of an SW cluster (entity restructuring chain, dual-trust pair)
- **coordinated_with:** Soft proximity preference (estate planning + insurance review)
- **mutually_exclusive_with:** Cannot coexist with another rec (REC-INV-005 vs REC-INV-006 — index funds OR direct indexing, not both)

Also populate:
- **preliminary_preference:** When mutually_exclusive_with has entries, mark "preferred" / "alternative" / "tie"
- **preliminary_preference_rationale:** Brief explanation
- **landmine:** Boolean — is this a landmine recommendation requiring advisor authorization
- **landmine_status:** "landmine_authorized_by_<advisor_id>" | "landmine_excluded_default" | "not_a_landmine"

For LANDMINE recommendations: **landmine status is read from `00_master/02_RECOMMENDATION_ID_REGISTRY.md` — specifically the `Status` column (`Landmine`)** — NOT from a `## LANDMINE` heading in individual rec files (only 2 of 130 recs have such a heading; the registry is canonical). As of inventory, 2 recs have `Status: Landmine`: `REC-RSK-016` (831(b) captive insurance) and `REC-CHR-011` (conservation easement). Default behavior is `landmine_excluded_default` unless the orchestrator config explicitly authorized those rec_ids via `landmineAuthorizations[]`.

### Note on qualitative-only recommendations

14 of the 130 recs lack the `QUANTIFIED IMPACT FRAMEWORK` section. These are intentionally qualitative-only (family meetings, mission statements, written processes, plan-restatement reviews). **Stage 2 selects them based on TRIGGERING CONDITIONS regardless** — the absence of a quantification framework is not a Stage 2 concern. Stage 3a will mark them as State D (qualitative-only) at quantification time. Stage 2 does not need to differentiate.

---

## KB Inputs Required

Stage 2 reads (passed in user turn):

1. **`00_master/02_RECOMMENDATION_ID_REGISTRY.md`** — full enumerated list of all 130 recommendation IDs with category, status (Active/Active-Cautioned/Advanced/Landmine/Deprecated), and archetype tags.

2. **`03_sequencing/05_triggering_matrix.md`** — concise mapping of client patterns to recommendation IDs.

3. **`03_sequencing/03_hard_sequencing_rules.md`** — must-come-after / must-come-before relations between recs.

4. **`03_sequencing/06_engagement_archetypes.md`** — archetype emphasis tables.

5. **`03_sequencing/01_master_sequence_pre_exit.md`** OR **`03_sequencing/02_master_sequence_post_exit.md`** — whichever matches `ClientProfile.engagement.archetype`. The harness loads the appropriate file:
   - `archetype === "PRE"` → `01_master_sequence_pre_exit.md`
   - `archetype === "POST"` → `02_master_sequence_post_exit.md`
   - Other archetypes (`"ACT"`, `"FO"`, `"FOUND"`) → for v1, omit the master sequence (no archetype-specific file exists). Stage 2 still works using triggering matrix + hard sequencing rules.
   - **V2 backlog:** author master sequence files for ACT, FO, FOUND archetypes.

6. **`03_sequencing/04_independent_recommendations.md`** — list of recs with no sequencing constraints.

For v1 simplification: pass ALL of 1–6 inline in the user turn. **KB context size** in practice:
- ID Registry: ~3,400 tokens
- Triggering matrix: ~440 tokens
- Hard sequencing rules: ~1,250 tokens
- Engagement archetypes: ~1,100 tokens
- Master sequence (if loaded): ~1,500 tokens
- Independent recs: ~300 tokens
- **Total: ~8,000 tokens** (was estimated 10–15K before inventory; actual is much smaller).

User turn total with ClientProfile (~3K): ~11,000–13,000 tokens.

V2: lazy-load rec files based on Pass 1 candidate set, reducing tokens further.

---

## Output Schema

```typescript
export interface SelectedRecommendations {
  selected: SelectedRecommendation[];
  supplemental_candidates: SupplementalCandidate[];
  speculative_dropped: SpeculativeDropped[];
  
  pass_summaries: {
    pass_1_hard_filter: { input_universe: 130; eliminated: number; survived: number };
    pass_2_calibration: { strong: number; borderline: number; speculative: number };
    pass_3_sequencing: { sequencing_relations_total: number; landmines_marked: number };
  };
  
  _stage_flags: {
    candidate_set_unusually_small: boolean;        // < 15 selected
    candidate_set_unusually_large: boolean;        // > 50 selected
    landmines_present_count: number;
    mutually_exclusive_pairs_present: number;
  };
  
  _metadata: StageMetadata;                        // includes attempt_history
}

export interface SelectedRecommendation {
  recommendation_id: string;
  category: RecommendationCategory;
  match_strength: "strong" | "borderline";
  
  // Triggering rationale
  triggers_matched: string[];                      // brief descriptors
  triggers_partial: string[];                      // for borderline cases
  
  // Sequencing relations (other rec_ids must be in selected[])
  must_come_after: Array<{ recommendation_id: string }>;
  must_come_before: Array<{ recommendation_id: string }>;
  sequenced_with: Array<{ recommendation_id: string }>;
  coordinated_with: Array<{ recommendation_id: string }>;
  mutually_exclusive_with: Array<{ recommendation_id: string }>;
  
  // Mutual exclusivity preference
  preliminary_preference: "preferred" | "alternative" | "tie" | null;
  preliminary_preference_rationale: string | null;
  
  // Landmine handling
  landmine: boolean;
  landmine_status: string;                         // "landmine_excluded_default" | "landmine_authorized_by_<id>" | "not_a_landmine"
  
  // Light context (full reasoning lives in Stage 3a/4)
  brief_rationale: string;                         // 1-2 sentences why this rec for this client
}

export interface SupplementalCandidate {
  recommendation_id: string;
  reason_supplemental: string;                     // why included as candidate but not selected
  match_strength: "borderline";                    // always borderline; strong goes to selected
  brief_rationale: string;
}

export interface SpeculativeDropped {
  recommendation_id: string;
  drop_reason: string;
}

export interface SelectedRecommendationsFailed {
  _stage_status: "FAILED";
  _failure_type: "json_parse_failed" | "schema_validation_failed" | "api_error" | "max_retries_exceeded" | "kb_load_failed";
  _failure_reason: string;
  _failure_context: { /* per-failure detail */ };
  _metadata: Partial<StageMetadata>;
}
```

---

## System Prompt

Stage 2 system prompt is large (~10,000 words). Critical sections:

1. **Role and goal:** "You are Stage 2 of an automated financial planning pipeline. Your job is to select the right recommendations for a client given their ClientProfile and the recommendation knowledge base..."

2. **Three-pass discipline:** Each pass explicitly described with examples.

3. **Match strength rubric:** Concrete examples of strong / borderline / speculative.

4. **Sequencing relations:** How to read rec files for sequencing instructions; the four relation types explained with examples.

5. **Mutual exclusivity:** When pairs are mutually exclusive, when to mark preferred/alternative/tie.

6. **Landmine treatment:** Read the LANDMINE section of rec files; default to landmine_excluded_default unless orchestrator config authorized.

7. **What NOT to do:**
   - Do NOT invent recommendation IDs (must come from ID Registry)
   - Do NOT include sequencing relations to non-selected recs (orphan refs)
   - Do NOT exceed 30 selected recs (cap; if >30 candidates, select strongest 30 and move rest to supplemental_candidates)
   - Do NOT skip Pass 3 sequencing relations (every selected rec must have them populated, even if empty arrays)

8. **Output format:** JSON only, schema reference, no preamble.

9. **Examples:** 2-3 concrete examples of selected recs with full sequencing populated.

The full system prompt goes into src/lib/orchestrator/stages/stage2.system.md.

---

## Implementation Requirements

1. **Module location:** `src/lib/orchestrator/stages/stage2RecommendationSelector.ts`

2. **Schema location:** `src/lib/orchestrator/schemas/selectedRecommendations.ts`

3. **System prompt location:** `src/lib/orchestrator/stages/stage2.system.md`

4. **Function signature:**
```typescript
   export async function selectRecommendations(
     clientProfile: ClientProfile,
     options: {
       apiClient: Stage2ApiClient;
       kbPath?: string;                     // default "kb/v1_2/"
       maxRetries?: number;                 // default 1
       referenceDate?: Date;
       landmineAuthorizations?: Array<{
         recommendation_id: string;
         authorized_by: string;
       }>;
     }
   ): Promise<SelectedRecommendations | SelectedRecommendationsFailed>
```

5. **No throws.** Same discipline as Stage 1.

6. **Loads KB context at first call:**
   - 02_RECOMMENDATION_ID_REGISTRY.md
   - 05_triggering_matrix.md
   - 03_hard_sequencing_rules.md
   - 06_engagement_archetypes.md
   - Concatenate into a single KB context string. Cache module-scope.

7. **User turn structure:**
<client_profile>{ClientProfile JSON}</client_profile>
<kb_recommendation_id_registry>
{file content}
</kb_recommendation_id_registry>
<kb_triggering_matrix>
{file content}
</kb_triggering_matrix>
<kb_hard_sequencing_rules>
{file content}
</kb_hard_sequencing_rules>
<kb_engagement_archetypes>
{file content}
</kb_engagement_archetypes>
{if landmineAuthorizations non-empty}
<landmine_authorizations>
{JSON of authorizations}
</landmine_authorizations>
{/if}
Run the three-pass selection per your system prompt. Output SelectedRecommendations JSON.

8. **Schema validation:**
   - All recommendation_id values exist in the ID Registry
   - All sequencing relation rec_ids exist in selected[] (no orphan references)
   - Match strengths are valid enum values
   - Selected count is between 5 and 30

9. **Same retry/attempt_history pattern as Stage 1.**

---

## Test Requirements

Create `src/lib/orchestrator/stages/__tests__/stage2RecommendationSelector.test.ts`:

### Test cases

1. **Mock Holloway profile + mock API success** → returns valid SelectedRecommendations with 20-40 selected, structural assertions on Pass 2 ratios.

2. **Mock API returns invalid JSON** → returns SelectedRecommendationsFailed.

3. **Mock API returns rec_id not in registry** → schema validation fails with orphan_recommendation_id error.

4. **Mock API returns sequencing relation to non-selected rec** → schema validation fails with orphan_sequencing_reference error.

5. **Mock API returns >30 selected** → schema validation fails with selected_count_exceeds_cap error.

6. **Mock API success with landmine_authorizations** → verify the landmine rec status reflects authorization.

7. **KB file missing** → returns kb_load_failed with descriptor.

8. **Live Holloway test (skipped without env var)** — synthetic Holloway profile produces valid SelectedRecommendations. Structural assertions:
   - selected.length between 20 and 30
   - REC-TAX-001 in selected with match_strength: "strong" (PTET on operating LLC)
   - REC-EST-006 (GRAT) in selected for transaction window
   - At least 3 entries in pass_summaries.pass_2_calibration.strong
   - At least 3 sequencing relations populated across selected
   - _metadata.attempt_history populated

Use Node's node:test runner.

---

## What This Does NOT Do

- Does not call other LLM stages
- Does not compute quantified impacts (Stage 3a's job)
- Does not assign plan sections (Stage 3a)
- Does not generate prose (Stage 4)
- Does not validate semantic coherence beyond "schema valid"

---

## V2 Architectural Backlog: Stage 2 Decomposition

V1 Stage 2 attempts three cognitive tasks in a single LLM call: (1) hard filter against 130 recs, (2) match strength calibration, (3) sequencing relations population. Live testing against synthetic Holloway revealed compound constraint failure: token budgets, field-length limits, count caps, and cross-reference validation interact such that tightening one constraint leaks pressure into another. The LLM cannot reliably converge on valid output under all constraints simultaneously.

V1 mitigation: Stage 2 ships with mock test coverage; Holloway-specific SelectedRecommendations is hand-authored from the LLM's partial outputs and stored in `artifacts/holloway_selected_recommendations.json`. Stage 3a's live test uses the hand-authored fixture.

V2 redesign: split Stage 2 into three sub-calls:
- **Stage 2a (hard filter):** cheap model, input is ClientProfile + ID Registry + Triggering Matrix, output is candidate rec_ids only (~2K tokens).
- **Stage 2b (calibration):** Opus, input is ClientProfile + candidate excerpts, output is strong/borderline classifications + brief_rationale (~6K tokens).
- **Stage 2c (sequencing):** deterministic read of each selected rec's SEQUENCING DEPENDENCIES section, applying hard rules (no LLM needed).

This decomposition aligns each sub-call with a single cognitive task, fits within bounded token budgets, and allows different models per sub-call. Estimated v2 cost: $1.50-$2.50 total per Stage 2 invocation.
