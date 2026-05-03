# Stage 4 Input Trim — Diagnosis

**Status:** Read-only audit (Phase 3.2 Step 3 recovery, Stage A). No code changes; the trim implementation is Stage B.

**Trigger:** Stage 4 live validation against Holloway aborted at pre-flight with `context_overflow` (estimated input 166,878 tokens > 150K ceiling). Spec Phase 1 Step 1.1 told us this could happen; the input is too large for a single-call architecture without trimming.

**Goal:** definitively map which fields of `QuantifiedRecommendations` Stage 4's LLM call narratively consumes vs. ignores, so we can build a `Stage4LlmInput` projection that strips ignored fields without losing anything the model needs.

---

## 1. Architectural finding (load-bearing)

**The deterministic builders read from the full `QuantifiedRecommendations` envelope passed into `generatePlan()`. The LLM reads from the JSON-stringified envelope inside `buildUserTurn()`. These two paths are independent.**

This means the trim happens **only inside `buildUserTurn()`**, not at the function boundary. `generatePlan()` continues to receive the full envelope (so builders work unchanged); `buildUserTurn()` projects a trimmed shape before stringifying. Builders never see the trimmed shape.

The relevant call sites in `stage4PlanGenerator.ts`:

- `buildUserTurn()` (line 234): `JSON.stringify(quantifiedRecommendations, null, 2)` at line 254 — **this is the trim target**.
- `buildTopFivePriorities(quantifiedRecommendations)` (line 580) — reads `recommendations[*].quantified_impact.estimate`, `alternative_values`, `category`, `recommendation_id`, `default_excluded`, `timing_bucket`. Full envelope OK.
- `buildImplementationRoadmap(quantifiedRecommendations)` (line 599) — reads `default_excluded`, `action_items[*]` including `description`, `timing_bucket`, `partner_required`, `partner_type`, `owner`, `action_item_id`, `source_recommendation_id`. Full envelope OK.
- `buildDecisionsNeeded(quantifiedRecommendations)` (line 600) — reads `decisions_needed`, `quantified_impact.{pending_reconciliation, alternative_values, qualitative_phrasing}`, `_audit_notes`, `recommendation_id`, `timing_bucket`. Full envelope OK.
- `buildAdvisoryTeam(...)` (line 603) — reads `default_excluded`, `action_items[*].partner_required`, `action_items[*].partner_type`. Full envelope OK.
- `detectAllNumbersDrift(quantifiedRecommendations, llm)` (line 832) — reads `recommendation_id`, `action_items[*].action_item_id`, `quantified_impact.{estimate, alternative_values}`. Full envelope OK.
- `hashContent(JSON.stringify(quantifiedRecommendations))` (line 489) — for metadata; full envelope.

All of the above continue to receive the full envelope. Only `JSON.stringify(quantifiedRecommendations, null, 2)` at line 254 — the LLM input — gets the trimmed projection.

---

## 2. Empirical Holloway baseline

Run on the actual Holloway artifact at `artifacts/stage3a_full_pipeline_test_v2.json`:

| Component | Chars | Approx tokens |
|---|---:|---:|
| Full QuantifiedRecommendations envelope | 595,046 | **148,761** |
| `_metadata` (3a aggregate) | 3,671 | 917 |
| `_sequencer_flags` (3a observability) | 14,433 | 3,608 |
| `recommendations[]` (81 recs, 380 ActionItems) | ~576,940 | ~144,235 |

The pre-flight estimate at 166,878 tokens decomposes roughly to:

| User-turn block | Approx tokens |
|---|---:|
| `<voice_calibration>` | ~10,000 |
| `<client_profile>` | ~10,000 |
| `<quantified_recommendations>` (the big one) | **~148,761** |
| `<top_priorities>` | ~1,000 |
| `<archetype_gating>` + `<firm_policy_resolutions>` + `<landmine_authorizations>` | ~100 |
| Tag wrappers + standing system prompt | ~3,000 |
| **Total estimated user turn + system** | **~172,861** (close to measured 166,878) |

The dominant cost is the QuantifiedRecommendations block. Trimming it is the highest-leverage move.

---

## 3. Field map (decision per field, with empirical token cost)

Every field of `QuantifiedRecommendations.recommendations[*]` mapped against three uses: LLM narrative consumption (LLM), deterministic builder consumption (BUILDER), and trim decision.

### 3.1 Top-level envelope fields

| Field | Tokens (Holloway) | LLM uses? | Builder uses? | Decision |
|---|---:|---|---|---|
| `_sequencer_status` | 0 | No | No (only orchestrator-level) | **EXCLUDE** |
| `_sequencer_failures` | 0 | No | No | **EXCLUDE** |
| `_sequencer_flags` | 3,608 | No (3a observability) | No | **EXCLUDE** |
| `_metadata` (full nested object) | 917 | No | No (`generatePlan` reads `clientProfile._metadata.source_fr_content_hash` only, not QR's) | **EXCLUDE** |

**Top-level savings: ~4,525 tokens.**

### 3.2 Per-recommendation fields

For each `recommendations[i]`. Tokens are summed across 81 recs.

| Field | Tokens (sum) | LLM uses? | Builder uses? | Decision |
|---|---:|---|---|---|
| `recommendation_id` | n/a (~325) | YES (system prompt: "list every Stage 3a rec_id this section covers") | YES (every builder) | **KEEP** |
| `source_file_path` | 1,519 | No | No (deterministic Implementation Roadmap doesn't read it) | **EXCLUDE** |
| `category` | n/a (~250) | YES (Findings & Observations groups by category; voice rules cite categories) | YES (`buildAdvisoryTeam`, `buildTopFivePriorities`) | **KEEP** |
| `status` | 184 | No | No | **EXCLUDE** |
| `position_in_sequence` | 20 | No (always 0 at 3a) | No | **EXCLUDE** |
| `plan_section` | n/a (~270) | YES (LLM uses to organize Business vs Personal lens) | No | **KEEP** |
| `subsection_within_section` | 534 | Borderline (could inform sub-sectioning) | No | **KEEP** (cheap, borderline-useful) |
| `co_triggered_with` | 368 | Borderline (could inform cross-rec narrative weaving) | No | **KEEP** (cheap, borderline-useful) |
| `quantified_impact.estimate` | n/a (~600 across recs) | YES (State A figure) | YES (`buildTopFivePriorities`, drift) | **KEEP** |
| `quantified_impact.formula_id` | n/a (~80) | Borderline (system prompt example cites it for technical credibility) | No | **KEEP** (cheap) |
| `quantified_impact.formula_source_file` | 1,276 | No | No | **EXCLUDE** |
| `quantified_impact.computation_inputs` | **5,731** | No (LLM doesn't cite specific named inputs; assumption phrasing comes from `estimate.narrative_context`, not these) | No | **EXCLUDE** |
| `quantified_impact.pending_reconciliation` | n/a | YES (State C indicator) | YES (`buildDecisionsNeeded`) | **KEEP** |
| `quantified_impact.alternative_values` | n/a (~3K) | YES (State C scenarios) | YES (`buildDecisionsNeeded`, `buildTopFivePriorities`, drift) | **KEEP** |
| `quantified_impact.qualitative_phrasing` | n/a (~3K) | YES (State B/C/D framing) | YES (`buildDecisionsNeeded`) | **KEEP** |
| `quantified_impact.reason_no_formula` | n/a (~250) | YES (State D) | No | **KEEP** |
| `quantified_impact.blocked_inputs` | n/a (~2K) | YES (State B framing) | No | **KEEP** |
| `scenario_range` | n/a (~1K) | YES (range narrative phrasing) | No | **KEEP** |
| `timing_bucket` | n/a (~270) | YES (timing context) | YES (Roadmap, Decisions, TopFive) | **KEEP** |
| `owner` | n/a (~250) | Borderline (LLM emits per-bullet partner_role; rec-level owner less directly used) | YES (Roadmap as fallback) | **KEEP** (cheap) |
| `owner_name` | 81 | No (always null at 3a) | No | **EXCLUDE** |
| `decisions_needed` | n/a (~80) | YES (signals to LLM that this rec has a pending decision) | YES (`buildDecisionsNeeded`) | **KEEP** |
| `cluster_id` | 173 | No (always null at 3a — Stage 3b assigns) | No | **EXCLUDE** |
| `cluster_sequence_closer` | 83 | No (always null at 3a) | No | **EXCLUDE** |
| `landmine` | n/a (~80) | YES (LLM may narrate landmine status) | No | **KEEP** |
| `landmine_status` | n/a (~250) | YES | No | **KEEP** |
| `default_excluded` | n/a (~80) | YES (LLM skips these recs from narrative) | YES (every builder skips them) | **KEEP** |
| `plan_output_variant` | n/a (~80) | Borderline | No | **KEEP** (cheap) |
| `match_strength` | 178 | No (not narrated in voice rules) | No | **EXCLUDE** |
| `_audit_notes` | **3,541** | No (system prompt cites audit-notes as OUTPUT style, not INPUT to read) | YES (`buildDecisionsNeeded` fallback for recommended_path) | **EXCLUDE FROM LLM, KEEP IN BUILDER PATH** ⚠ |

### 3.3 Per-ActionItem fields

For each `recommendations[i].action_items[j]`. Tokens summed across 380 AIs.

| Field | Tokens (sum) | LLM uses? | Builder uses? | Decision |
|---|---:|---|---|---|
| `action_item_id` | n/a (~1.6K) | YES (LLM populates `source_action_item_ids[]`) | YES (Roadmap) | **KEEP** |
| `description` | n/a (~30K) | YES (LLM narrates from descriptions) | YES (Roadmap action column) | **KEEP** |
| `sub_steps` | **4,423** | No (Implementation Roadmap renders these from the full envelope deterministically) | YES (Roadmap fills sub_steps if present) | **EXCLUDE FROM LLM, KEEP IN BUILDER PATH** ⚠ |
| `category` | n/a (~1.2K) | Borderline (per-AI, often duplicates rec.category) | No | **KEEP** (small, occasionally diverges from rec.category) |
| `source_recommendation_id` | n/a (~1.6K) | YES (lets LLM map AIs back to recs) | YES (Roadmap) | **KEEP** |
| `source_phase_or_step` | n/a (~3K) | YES (informs the LLM's bullet narrative) | No | **KEEP** |
| `owner` | n/a (~1.2K) | YES (LLM emits partner_role) | YES (Roadmap owner column) | **KEEP** |
| `owner_name` | 380 | No (always null) | No | **EXCLUDE** |
| `timing_bucket` | n/a (~1.2K) | YES (timing context) | YES (Roadmap grouping) | **KEEP** |
| `depends_on` | **1,244** | No (sequencing internal; LLM doesn't narrate dependency chains) | No (Roadmap doesn't render depends_on) | **EXCLUDE** |
| `is_decision_needed` | n/a (~380) | Borderline | No | **KEEP** (cheap) |
| `duration_class` | n/a (~1.5K) | Borderline (long_running implies cadence narrative) | No | **KEEP** (cheap) |
| `check_in_cadence` | n/a (~1K) | Borderline (long_running cadence narrative) | No | **KEEP** (cheap) |
| `partner_required` | n/a (~380) | YES (LLM emits partner_role per bullet) | YES (Advisory Team, Roadmap) | **KEEP** |
| `partner_type` | n/a (~1.5K) | YES | YES | **KEEP** |
| `parent_action_item_id` | 380 | No (always null at 3a) | No | **EXCLUDE** |
| `is_derivative_reminder` | 475 | No (always false at 3a) | No | **EXCLUDE** |
| `source_plan_id` | 380 | No (always null at 3a) | No | **EXCLUDE** |
| `auto_generated_reminder_template` | **4,813** | No (Tracker spawn metadata; LLM doesn't narrate trigger thresholds or template strings) | No (Tracker reads at runtime, not at plan-gen) | **EXCLUDE** |

---

## 4. Token impact projection

### 4.1 Definite-skip fields (zero risk)

| Field | Tokens saved |
|---|---:|
| `_sequencer_flags` | 3,608 |
| `_metadata` (envelope) | 917 |
| `source_file_path` | 1,519 |
| `quantified_impact.formula_source_file` | 1,276 |
| `cluster_id` (always null) | 173 |
| `cluster_sequence_closer` (always null) | 83 |
| `position_in_sequence` (always 0) | 20 |
| `owner_name` (rec, always null) | 81 |
| `match_strength` (not narrated) | 178 |
| `status` (not narrated) | 184 |
| `action_items[*].sub_steps` | 4,423 |
| `action_items[*].depends_on` | 1,244 |
| `action_items[*].auto_generated_reminder_template` | 4,813 |
| `action_items[*].owner_name` (always null) | 380 |
| `action_items[*].parent_action_item_id` (always null) | 380 |
| `action_items[*].is_derivative_reminder` (always false) | 475 |
| `action_items[*].source_plan_id` (always null) | 380 |
| **Definite-skip total** | **~20,154 tokens** |

### 4.2 Conditional-skip fields (justified but worth flagging)

| Field | Tokens saved | Justification |
|---|---:|---|
| `quantified_impact.computation_inputs` | 5,731 | LLM doesn't cite specific named inputs in voice rules; assumption phrasing comes from `estimate.narrative_context`. |
| `_audit_notes` | 3,541 | System prompt cites audit-notes as an OUTPUT pattern ("`_audit_notes`-equivalent line in the closer"), not INPUT for the LLM to consume. Builders still read it (`buildDecisionsNeeded` fallback). |
| **Conditional-skip total** | **~9,272 tokens** | |

### 4.3 Total projected savings

| Tier | Tokens |
|---|---:|
| Definite-skip | 20,154 |
| Conditional-skip | 9,272 |
| **Total projected savings** | **~29,426 tokens** |

### 4.4 Predicted Holloway pre-flight post-trim

| Metric | Value |
|---|---:|
| Current pre-flight estimate | 166,878 |
| Projected savings | -29,426 |
| **Predicted post-trim estimate** | **~137,452** |
| Headroom under 150K cap | **~12,548** |

**Verdict: Trim brings Holloway comfortably under the 150K ceiling with ~8% headroom for tokenizer variance.**

---

## 5. Risky exclusions surfaced

### ⚠ `_audit_notes` — split path

The system prompt at line 43 says:

> *Any narrative context belongs in the recommendation's intro paragraph or a `_audit_notes`-equivalent line in the closer.*

This is referring to `_audit_notes` as an OUTPUT pattern (the LLM produces audit-notes-style closer prose), NOT as input for the LLM to read. The LLM doesn't need to see Stage 3a's `_audit_notes` to write its own closer prose — those notes are Stage 3a internal traceability.

However, `buildDecisionsNeeded` (line 539) reads `_audit_notes` as a fallback for the recommended_path string when alternative_values and qualitative_phrasing are both empty. So the builder path needs `_audit_notes`. The trim only excludes it from the LLM input, not the builder input.

**Action:** EXCLUDE from LLM input; KEEP in `quantifiedRecommendations` parameter to `generatePlan`. The trim function operates on the user-turn projection only.

### ⚠ `action_items[*].sub_steps` — split path

Identical pattern: `buildImplementationRoadmap` (line 462ish) doesn't actively consume `sub_steps` (the Roadmap's `RoadmapRow` shape doesn't have a sub_steps field), so it's safe. But if a future builder enhancement added sub_steps to the Roadmap, the full envelope path is preserved.

**Action:** EXCLUDE from LLM input; KEEP in builder path.

### ⚠ `computation_inputs` — small risk to LLM narrative

The system prompt example at line 96-98 of the worked Recommendations — Business example doesn't reference computation_inputs. The voice calibration's State A pattern says *"approximately X based on Y assumption"* — `Y` comes from `estimate.narrative_context` (which we KEEP), not computation_inputs.

But if the LLM had access to computation_inputs, it could in principle write more specific assumption parentheticals like "based on K-1 income of $4M and federal marginal rate of 37%." Without computation_inputs, it relies on `narrative_context` and the rec file's QUANTIFIED IMPACT FRAMEWORK — both already in scope.

**Action:** EXCLUDE from LLM input. If post-trim live test shows weakening of assumption parentheticals, revisit and put computation_inputs back (still saves ~24K tokens vs. doing nothing).

---

## 6. Recommendation: the `Stage4LlmInput` shape

Build a function `projectQuantifiedRecsForLlm(qr: QuantifiedRecommendations): Stage4LlmInput` that returns:

```typescript
interface Stage4LlmInput {
  recommendations: Stage4LlmInputRec[];
  // Top-level _metadata, _sequencer_flags, _sequencer_status, _sequencer_failures all dropped.
}

interface Stage4LlmInputRec {
  recommendation_id: string;
  category: RecommendationCategory;
  plan_section: PlanSectionName | null;
  subsection_within_section: string | null;
  co_triggered_with: string[];
  quantified_impact: {
    estimate: NumericValue | null;
    formula_id: string | null;
    // formula_source_file dropped
    // computation_inputs dropped
    pending_reconciliation: boolean;
    alternative_values: AlternativeValue[];
    qualitative_phrasing: string | null;
    reason_no_formula: string | null;
    blocked_inputs: BlockedInput[];
  };
  scenario_range: ScenarioRange | null;
  timing_bucket: TimingBucket;
  owner: ActionOwner;
  // owner_name dropped (always null)
  decisions_needed: boolean;
  // cluster_id dropped (always null)
  // cluster_sequence_closer dropped (always null)
  action_items: Stage4LlmInputActionItem[];
  landmine: boolean;
  landmine_status: string;
  default_excluded: boolean;
  plan_output_variant: "default_excluded" | "authorized" | null;
  // match_strength dropped (not narrated)
  // status dropped (not narrated)
  // _audit_notes dropped (output pattern, not input)
  // position_in_sequence dropped (always 0)
  // source_file_path dropped (not narrated)
}

interface Stage4LlmInputActionItem {
  action_item_id: string;
  description: string;
  // sub_steps dropped
  category: RecommendationCategory;
  source_recommendation_id: string;
  source_phase_or_step: string;
  owner: ActionOwner;
  // owner_name dropped (always null)
  timing_bucket: TimingBucket;
  // depends_on dropped (sequencing internal)
  is_decision_needed: boolean;
  duration_class: DurationClass;
  check_in_cadence: CheckInCadence | null;
  partner_required: boolean;
  partner_type: PartnerType | null;
  // parent_action_item_id, is_derivative_reminder, source_plan_id dropped (always null/false)
  // auto_generated_reminder_template dropped (Tracker metadata)
}
```

**Project locations**: `src/lib/orchestrator/stages/stage4PlanGenerator.ts` — add `projectQuantifiedRecsForLlm()` near `buildUserTurn()`. Apply at line 254 inside `buildUserTurn()` only. No other call sites change. No type changes to public API of `generatePlan()`.

**System-prompt impact**: none. The system prompt doesn't reference any of the dropped fields by name. The voice calibration doc doesn't either.

**Test impact**: existing 17 mock tests should continue to pass — they construct full `QuantifiedRecommendations` envelopes and pass them to `generatePlan()`; the trim is internal. Add a new test: `"4 — LLM input trim: projection drops the right fields"` that asserts the trimmed shape contains the KEEP fields and excludes the EXCLUDE fields.

**Live test re-fire**: same fixtures, same advisor_id, same options. Expected pre-flight estimate: ~137K. Expected to pass pre-flight and proceed to LLM call.

---

## 7. Cost projection for live re-fire

| Metric | Pre-trim (failed) | Post-trim (projected) |
|---|---:|---:|
| Pre-flight estimate | 166,878 | **~137,452** |
| Margin under 150K cap | -16,878 (FAIL) | **+12,548** |
| Margin under 200K hard limit (with 32K output) | n/a (fail-fast) | **+30K** |
| Cost incurred (failure path) | $0.00 | n/a |
| Expected cost (success path) | n/a | **$15-25** (per spec) |

---

## 8. Open questions I'm NOT resolving here (Stage B / future)

1. **Should `computation_inputs` come back if post-trim narrative quality weakens?** Probably yes if the LLM can't cite assumption-level specifics. Empirical test will tell.
2. **Should `_audit_notes` be projected as a single concatenated string per rec rather than dropped entirely?** Could give the LLM a cheap signal for specific edge cases (~50 tokens/rec instead of 0). Defer to v2.
3. **Multi-pass (Business + Personal as separate calls) as a fallback?** Not needed if the trim works. If post-trim Holloway STILL fails pre-flight (e.g., because of a larger ClientProfile), reconsider.

---

## 9. Stage B preview (what to build next, NOT now)

1. Add `projectQuantifiedRecsForLlm(qr)` to `stage4PlanGenerator.ts`. Pure function, deterministic.
2. Call it inside `buildUserTurn()` immediately before `JSON.stringify(...)` at line 254.
3. Add a single new mock test asserting the projection drops the right fields.
4. Run regression — expect 148/144/4/0 (147 + 1 new test).
5. Verify TypeScript clean.
6. Re-fire `runStage4LiveValidation.ts` — expect pre-flight to pass at ~137K and proceed to live LLM call.

Estimated build time: 30-45 min including mock test + regression.

---

## 10. Summary

- **Field map**: 13 KEEP, 17 EXCLUDE, 2 SPLIT (LLM-EXCLUDE / BUILDER-KEEP) at the per-rec/per-AI level; 4 EXCLUDE at the envelope level.
- **Projected savings**: ~29.4K tokens (17.6% reduction in QR portion).
- **Predicted Holloway post-trim pre-flight**: ~137K tokens, **12.5K headroom** under the 150K cap.
- **Risk**: low. All EXCLUDE-from-LLM fields are either not narrated (per system prompt audit) or always-null/derivable.
- **Architectural insight**: the trim is internal to `buildUserTurn()`; no changes to `generatePlan()` public API or any builder.
