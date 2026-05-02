# Stage 3a.2 — Cross-Rec Validator

**Type:** Deterministic. NO LLM call. Pure code.

**Purpose:** Take the per-batch `Stage3a1Result[]` outputs from Stage 3a.1, merge them into a single `QuantifiedRecommendations` envelope, validate cross-batch references (rec-level sequencing relations + ActionItem `depends_on` chains), and consolidate batch-scoped flags into a single `_sequencer_flags` block. If any batch failed, surface the consolidated failure context for diagnostic use.

**Critical:** Stage 3a.2 is the *only* stage that sees the full Stage 3a output. Cross-batch sequencing references that 3a.1 emitted without validation get checked here for the first time. Orphan references — pointers to rec_ids or action_item_ids that don't appear anywhere in the consolidated set — must be surfaced in flags but do NOT fail the stage; surfacing-but-not-blocking matches the contract Stage 3a establishes for downstream stages (Stage 3b's topological sort handles missing references gracefully via flags).

**Origin:** Stage 3a.2 is part of the Stage 3a decomposition that replaced the monolithic single-call design. The archived attempt lives at `specs/stages/_archive/stage3a_sequencer_quantifier_v1_attempt_1_single_call.spec.md`.

**Input:**
- `batchResults: Stage3a1Result[]` — one per batch, ordered by `batch_index`. Some batches may carry implicit failure shape (`_stage_status: "FAILED"`) per `Stage3a1ResultFailed`; in that case the orchestrator passes them through and Stage 3a.2 surfaces the failure consolidated.
- `selectedRecommendations: SelectedRecommendations` — the original full Stage 2 output. Used for: (a) confirming 3a.1 covered every selected rec, (b) propagating Stage 2 metadata into the final envelope.

**Output:** `QuantifiedRecommendations` on success; `QuantifiedRecommendationsFailed` on consolidated failure. No throws.

---

## Algorithm

Stage 3a.2 is a synchronous deterministic pass. Runs in five steps.

### Step 1 — Separate successful and failed batch results

Partition `batchResults` into:
- `succeeded: Stage3a1Result[]` (those WITHOUT `_stage_status: "FAILED"`)
- `failed: Stage3a1ResultFailed[]` (those WITH `_stage_status: "FAILED"`)

If `failed.length > 0` AND `succeeded.length === 0`: full failure. Skip to Step 5 with a fully-failed envelope.

If `failed.length > 0` AND `succeeded.length > 0`: partial failure. Continue through Steps 2–4 to assemble the partial envelope; surface the failed batches in `_failure_context` so the orchestrator can decide whether to retry only the failed batches.

If `failed.length === 0`: full success. Continue normally.

### Step 2 — Concatenate batch recommendations

Walk `succeeded[]` in `batch_index` order. For each batch, append `batch.recommendations[]` to a single `consolidatedRecs: SequencedRecommendation[]` list.

The output ordering follows two rules:
- Within a batch: preserve the order Stage 3a.1 emitted (which itself follows the `batch[]` input order, which itself follows `selectedRecommendations.selected[]` order).
- Across batches: ascending `batch_index`.

The net effect: `consolidatedRecs` order matches `selectedRecommendations.selected[]` order, batch by batch. This deterministic order matters for Stage 3b's topological sort and for downstream prose-rendering tests that compare positions.

**Coverage check:** Build `coveredRecIds = new Set(consolidatedRecs.map(r => r.recommendation_id))`. Compute `missingRecIds = selectedRecommendations.selected.map(r => r.recommendation_id).filter(id => !coveredRecIds.has(id))`. Any rec in `selected[]` but not in `consolidatedRecs[]` is a coverage gap. Reasons it can happen:
- Failed batch contained that rec_id (already captured in `failed[]`).
- Successful batch dropped a rec from output (a Stage 3a.1 bug — should never happen given 3a.1's per-batch validation, but defense in depth).

If `missingRecIds.length > 0`, push to `_stage_flags.coverage_gap_rec_ids[]`. Do NOT fail the stage on this alone — Stage 3b can handle a thin set; the flag surfaces the gap.

### Step 3 — Validate cross-rec references

For each rec in `consolidatedRecs[]`:

#### 3a — Validate rec-level sequencing relations

Each of the five sequencing-reference fields propagates from Stage 2c:
- `must_come_after`
- `must_come_before`
- `sequenced_with`
- `coordinated_with`
- `mutually_exclusive_with`

For each `{ recommendation_id }` entry in any of these arrays: confirm `coveredRecIds.has(recommendation_id)`. If not: push to `_stage_flags.orphan_sequencing_references[]` with shape:

```typescript
{
  source_rec_id: string;
  field: "must_come_after" | "must_come_before" | "sequenced_with" | "coordinated_with" | "mutually_exclusive_with";
  missing_rec_id: string;
  source_batch_index: number;   // batch_index of the source rec
}
```

Do NOT mutate the rec's reference array. Stage 3b's topological sort tolerates missing references via the same flag pattern; preserving the original reference array preserves auditability ("we recorded that REC-FOO depends on REC-BAR; we couldn't find REC-BAR in the output, so we flagged it but kept the relation").

#### 3b — Validate ActionItem `depends_on` chains

Build `coveredActionItemIds = new Set()` by walking every `consolidatedRecs[i].action_items[j].action_item_id`.

For each ActionItem `dep_id` in `action_items[*].depends_on[]`: confirm `coveredActionItemIds.has(dep_id)`. If not: push to `_stage_flags.orphan_action_item_dependencies[]` with shape:

```typescript
{
  source_action_item_id: string;
  source_rec_id: string;
  missing_dependency_id: string;
  source_batch_index: number;
}
```

Same disposition: flag but do not mutate.

### Step 4 — Consolidate flags from successful batches

For each flag array on `SequencerFlags3a` (defined in `pipelineTypes.ts` lines 227–265), union across `succeeded[*]._stage_flags`:

- `unenumerated_question_ids[]`
- `formula_yielded_unviable_value[]`
- `cluster_closer_skipped[]` — usually empty at 3a.1 (Stage 3b owns clustering)
- `section_assignment_ambiguity[]`
- `timing_bucket_inferred[]`
- `qualitative_fallback_used[]`
- `blocked_inputs_summary[]`

Then add Stage 3a.2-specific flag arrays (NOT in `SequencerFlags3a` — added to the consolidated envelope as Stage-3a.2-only):
- `orphan_sequencing_references[]` (from Step 3a)
- `orphan_action_item_dependencies[]` (from Step 3b)
- `coverage_gap_rec_ids[]` (from Step 2)
- `volatile_rates_stale[]` — union from successful batches (one entry per batch that flagged it; same `last_refreshed`/`days_since_refresh` per batch since they all read the same file at the same orchestration call)

Note: the consolidated envelope's `_sequencer_flags` field is `SequencerFlags3a` per pipelineTypes.ts. The Stage-3a.2-specific flags require either: (a) extending `SequencerFlags3a` with the three new arrays, OR (b) emitting them in a separate `_validator_flags` object on `QuantifiedRecommendations`. Decision flagged below.

### Step 5 — Emit envelope

#### Success case (failed.length === 0):

```typescript
return {
  recommendations: consolidatedRecs,
  _sequencer_flags: consolidatedFlags,
  // _stage_status omitted on success per pipelineTypes.ts (it's optional "FAILED" only)
};
```

#### Partial failure case (succeeded.length > 0 AND failed.length > 0):

```typescript
return {
  _sequencer_status: "FAILED",
  _sequencer_failures: failed.map(f => ({
    stage: "3a",
    rec_id: null,                                  // batch-level, not rec-level
    reason: f._failure_reason,
    context: `batch ${f._failure_context.batch_index}: ${f._failure_type}`,
  })),
  _sequencer_flags: consolidatedFlags,
  recommendations: consolidatedRecs,               // partial; preserved for diagnostic use
};
```

#### Full failure case (succeeded.length === 0):

```typescript
return {
  _sequencer_status: "FAILED",
  _sequencer_failures: failed.map(f => ({...})),  // as above
  _sequencer_flags: { /* empty arrays */ },
  recommendations: [],
};
```

The container shape `QuantifiedRecommendations` (pipelineTypes.ts lines 267–272) already supports the partial-failure case — `_sequencer_status?: "FAILED"` is optional; `recommendations[]` always populated.

---

## Output Schema

`QuantifiedRecommendations` from `pipelineTypes.ts`. Already exists. Stage 3a.2 does NOT introduce a new container type.

The Stage-3a.2-specific flag arrays (`orphan_sequencing_references[]`, `orphan_action_item_dependencies[]`, `coverage_gap_rec_ids[]`) need a home — see Flagged Decision #1.

---

## Implementation Requirements

1. **Module location:** `src/lib/orchestrator/stages/stage3a2CrossRecValidator.ts`

2. **No system prompt** (deterministic).

3. **No external state.** Pure function: same input → same output.

4. **No throws.** All failure paths return `QuantifiedRecommendations` with `_sequencer_status: "FAILED"` populated.

5. **Function signature:**

```typescript
export function validateAndMerge(
  batchResults: Array<Stage3a1Result | Stage3a1ResultFailed>,
  selectedRecommendations: SelectedRecommendations,
): QuantifiedRecommendations;
```

Synchronous (no Promise). Determinism guarantee: every call with structurally identical inputs produces structurally identical output (including flag-array ordering — sort flag arrays by source rec_id to ensure stability).

6. **No KB file reads.** Stage 3a.2 operates entirely on its inputs. KB context is a Stage 3a.1 concern.

7. **No API calls.** No `apiClient` dependency.

8. **Latency:** sub-millisecond on Holloway-scale inputs (5 batches × ~16 recs each = 80 recs total). The two main loops (rec-level sequencing validation × ActionItem dependency validation) are O(N) over recs and O(M) over action_items respectively, with O(1) Set lookups.

---

## Test Requirements

Create `src/lib/orchestrator/stages/__tests__/stage3a2CrossRecValidator.test.ts`. Use Node's `node:test` runner. Pure-function testing — no mocks needed beyond fixture builders.

### Unit test cases

1. **All-batches-pass case** — 3 successful batches with no cross-batch refs:
   - `consolidatedRecs.length === sum(batch.recommendations.length)`
   - Order matches `selected[]` order
   - `_sequencer_flags.orphan_sequencing_references === []`
   - `_sequencer_flags.orphan_action_item_dependencies === []`
   - No `_sequencer_status` field on output.

2. **Cross-batch sequencing reference resolves correctly** — batch 0 has `must_come_after: [{ recommendation_id: "REC-FROM-BATCH-1" }]`; batch 1 contains REC-FROM-BATCH-1:
   - No orphan flag.

3. **Cross-batch sequencing reference is orphan** — batch 0 has `must_come_after: [{ recommendation_id: "REC-NEVER-EXISTED" }]`; no batch contains REC-NEVER-EXISTED:
   - `_sequencer_flags.orphan_sequencing_references` contains one entry with `source_rec_id`, `field: "must_come_after"`, `missing_rec_id: "REC-NEVER-EXISTED"`, `source_batch_index: 0`.

4. **ActionItem cross-batch depends_on resolves correctly** — action item AI-1 in batch 0 has `depends_on: ["AI-FROM-BATCH-1"]`; AI-FROM-BATCH-1 exists in batch 1:
   - No orphan flag.

5. **ActionItem cross-batch depends_on is orphan** — depends_on points at action_item_id that exists in NO batch:
   - `_sequencer_flags.orphan_action_item_dependencies` contains one entry with `source_action_item_id`, `source_rec_id`, `missing_dependency_id`, `source_batch_index`.

6. **Flag consolidation** — batch 0 emits `_stage_flags.formula_yielded_unviable_value: [entryA]`; batch 1 emits `_stage_flags.formula_yielded_unviable_value: [entryB]`:
   - Consolidated flags contain both `entryA` and `entryB`.
   - Order: entryA then entryB (sorted by `source_rec_id` for determinism, OR by batch_index — pick one and document).

7. **Coverage gap detection** — `selected[].length === 10` but consolidated `recommendations.length === 9` (one rec dropped):
   - `_sequencer_flags.coverage_gap_rec_ids` contains the missing rec_id.

8. **Partial batch failure case** — batch 0 succeeded, batch 1 failed (`Stage3a1ResultFailed`):
   - Output has `_sequencer_status: "FAILED"`.
   - `_sequencer_failures[]` contains one entry per failed batch.
   - `recommendations[]` contains batch 0's recs (preserved for diagnostic use).
   - Successful-batch flags are still consolidated.

9. **Full failure case** — all 3 batches failed:
   - Output has `_sequencer_status: "FAILED"`.
   - `recommendations[]` empty.
   - `_sequencer_failures[]` contains 3 entries.

10. **Self-referential sequencing** — batch 0 has `must_come_after: [{ recommendation_id: "REC-X" }]` where REC-X is the rec itself:
   - Not flagged as orphan (REC-X exists in `consolidatedRecs[]`).
   - Stage 3b's topological sort owns the cycle-detection check; Stage 3a.2 does not flag self-references.

11. **Empty input** — `batchResults: []`, `selectedRecommendations.selected: []`:
   - Output: `{ recommendations: [], _sequencer_flags: { ...empty arrays } }`.
   - No `_sequencer_status` field.

12. **Empty input but selectedRecommendations non-empty** — `batchResults: []`, `selected[].length > 0`:
   - `coverage_gap_rec_ids[]` populated with all selected rec_ids.
   - No `_sequencer_status` (no batch failures; all coverage gaps surfaced as flags).

### No live API tests

Stage 3a.2 has no API surface. Mock tests are exhaustive.

---

## What This Does NOT Do

- Does NOT call the Anthropic API.
- Does NOT load KB files.
- Does NOT mutate sequencing reference arrays — orphan references are flagged, not stripped.
- Does NOT mutate ActionItem `depends_on` arrays — same reasoning.
- Does NOT compute the topological sort, cluster detection, or `position_in_sequence`. Those are Stage 3b.
- Does NOT decide whether a coverage gap is a critical failure or a minor flag — emits the flag and lets Stage 3b decide whether to proceed.
- Does NOT retry failed batches. The orchestrator owns retry policy at the batch level.
- Does NOT validate per-rec internal state-shape (4-state QuantifiedImpact invariants) — Stage 3a.1 already validated those before emitting.
- Does NOT generate metadata (`_metadata`). The orchestrator harness merges Stage 3a.1's per-batch metadata into a single Stage 3a `_metadata` block.
- Does NOT determine batch boundaries — orchestrator's job.

---

## Flagged Decisions (Made During Spec Authoring)

1. **Stage-3a.2-specific flag arrays — placement.** The three Stage-3a.2-only flag arrays (`orphan_sequencing_references`, `orphan_action_item_dependencies`, `coverage_gap_rec_ids`) need a home. Two options:
   - **(a)** Extend `SequencerFlags3a` in `pipelineTypes.ts` to include these three arrays (loosens "Stage 3a.1 emits this exact shape" semantics).
   - **(b)** Add a separate `_validator_flags: ValidatorFlags3a2` field on `QuantifiedRecommendations` (cleaner separation; requires a new field on the container).
   - **My choice:** **(a)** — extend `SequencerFlags3a` with the three new arrays. Rationale: `SequencerFlags3a` is already a Stage-3a-as-a-whole flag bag; adding 3a.2's flags there matches the "Stage 3a is one logical stage with sub-stages" mental model. Stage 3a.1 emits its own flags into the Stage 3a.1-scoped instance; Stage 3a.2 unions them and adds its own. Downstream stages don't need to know which sub-stage emitted which flag. If Hayden prefers separation (b), the swap is mechanical.

2. **Orphan references are flagged, not stripped.** Alternative would be to delete orphan refs so Stage 3b's topological sort doesn't see them. Decision: keep refs intact for auditability ("we recorded the dependency; we couldn't resolve it"). Stage 3b's topological sort tolerates missing references via the same `_sequencer_flags` pattern.

3. **Coverage gaps are flags, not failures.** Alternative would be to fail-close if any selected rec is missing from `recommendations[]`. Decision: flag and proceed, because (a) the rec might have legitimately failed quantification due to an upstream Stage 3a.1 bug that is better surfaced as a Stage 3b ambiguity than a hard stop, and (b) partial output is more useful for diagnostic iteration than no output.

4. **Partial failure preserves successful batches' recs.** Alternative would be to return only failure context and discard successful batches' work. Decision: preserve. The orchestrator can decide whether to retry only failed batches (preserving the successful work) or restart the whole stage.

5. **Flag-array ordering is by source rec_id, secondarily by source batch_index.** Determinism matters for snapshot tests and audit trails. Ordering by source rec_id keeps related flags grouped; batch_index secondary preserves batch-level ordering for multi-rec entries.

6. **No retry within Stage 3a.2.** Stage 3a.2 is deterministic; retrying is a no-op. The orchestrator owns batch-level retry. Stage 3a.2 surfaces failures as flags and partial output.

7. **Self-referential sequencing relations are not orphans.** A rec listing itself in `must_come_after` is semantically a cycle (self-reference). Stage 3a.2 doesn't flag this — Stage 3b's topological sort owns cycle detection. Keeps Stage 3a.2's responsibility narrow.

---

## V2 Architectural Backlog

- **Configurable orphan-tolerance threshold.** Currently every orphan is flagged. v2 might let the orchestrator specify "fail the stage if > N% of references are orphans" to catch systemic Stage 3a.1 quality regressions early.
- **Cross-batch coordination quality scoring.** Aggregate metric like "% of `coordinated_with` references that successfully resolved" to detect when Stage 3a.1 is missing batch-context signals.
- **Smart coverage-gap recovery.** v2 orchestrator could detect coverage gaps and route the missing recs to a final mop-up batch automatically.
- **Action_item ID collision detection.** If two batches independently emit an ActionItem with the same `action_item_id`, the consolidated set has a collision. v1 doesn't check; v2 should flag.
