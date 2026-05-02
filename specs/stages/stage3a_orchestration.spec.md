# Stage 3a — Orchestration / Harness

**Type:** Deterministic harness code in the orchestrator. NOT a stage in its own right; it is the glue that chains Stage 3a.1 (LLM batch quantifier) → Stage 3a.2 (deterministic merger/validator) into a single logical Stage 3a invocation.

**Purpose:** Convert the full `selectedRecommendations.selected[]` set into a `QuantifiedRecommendations` envelope by:
1. Computing batch boundaries
2. Calling Stage 3a.1 per batch (potentially in parallel)
3. Calling Stage 3a.2 once with all batch results
4. Merging per-batch metadata into a single Stage 3a `_metadata` block

**Critical:** The harness lives in the orchestrator code, not inside Stage 3a.1 or Stage 3a.2 modules. Each stage stays independently testable. The harness is what the orchestrator's Stage 3 step calls; it has no schema of its own.

---

## Harness Function

Lives in the orchestrator (e.g., `src/lib/orchestrator/orchestrator.ts` or a dedicated `src/lib/orchestrator/glue/stage3aHarness.ts` if the orchestrator file grows large).

```typescript
export async function runStage3a(
  clientProfile: ClientProfile,
  selectedRecommendations: SelectedRecommendations,
  options: {
    apiClient: Anthropic;
    kbPath?: string;
    referenceDate?: Date;
    firmPolicyResolutions?: Array<{...}>;
    landmineAuthorizations?: Array<{...}>;
    maxRetriesPerBatch?: number;        // default 1
    batchSize?: number;                  // default 20; OrchestratorConfig.stage3aBatchSize override
    parallelism?: "serial" | "parallel"; // default "parallel"
  },
): Promise<QuantifiedRecommendations>;
```

`QuantifiedRecommendations` is the only return shape. Failure cases land as `{ _sequencer_status: "FAILED", _sequencer_failures, recommendations, _sequencer_flags }` per the existing pipelineTypes.ts container.

---

## Algorithm

### Step 1 — Compute batch boundaries

Default `batchSize: 20`. Configurable via `OrchestratorConfig.stage3aBatchSize` and overridable via `options.batchSize`.

```typescript
const batches: SelectedRecommendation[][] = [];
for (let i = 0; i < selectedRecommendations.selected.length; i += batchSize) {
  batches.push(selectedRecommendations.selected.slice(i, i + batchSize));
}
```

For Holloway (81 selected recs): 5 batches of [20, 20, 20, 20, 1]. The final batch's small size is acceptable; Stage 3a.1's overhead is roughly the system prompt + reference KB context, which dominates for very small batches but doesn't break anything.

**Optional refinement (v2):** if the final batch is < 5 recs, redistribute to balance batches (e.g., 81 recs → [17, 17, 17, 15, 15] instead of [20, 20, 20, 20, 1]). Captured as v2 backlog. v1 uses the simple slice.

### Step 2 — Build BatchContext for each batch

For each batch at index `i`:

```typescript
const allRecIds = selectedRecommendations.selected.map(r => r.recommendation_id);
const batchSize_actual = batches[i].length;
const startIndex = i * batchSize;

const batchContext: BatchContext = {
  batch_index: i,
  total_batches: batches.length,
  preceding_batch_rec_ids: allRecIds.slice(0, startIndex),
  following_batch_rec_ids: allRecIds.slice(startIndex + batchSize_actual),
};
```

Each batch knows what other batches contain at the rec_id level. This lets Stage 3a.1 emit cross-batch sequencing references without inventing them.

### Step 3 — Invoke Stage 3a.1 per batch

Two execution modes:

#### Parallel (default)

```typescript
const batchResults = await Promise.all(
  batches.map((batch, i) =>
    quantifyBatch(clientProfile, batch, batchContexts[i], {
      apiClient,
      kbPath,
      referenceDate,
      firmPolicyResolutions,
      landmineAuthorizations,
      maxRetries: maxRetriesPerBatch,
    })
  )
);
```

All batches issue API calls concurrently. Total wall-clock time ≈ slowest batch + harness overhead. Cost is the same as serial; latency scales sub-linearly with batch count.

Trade-off: concurrent API calls put load on the Anthropic API. For Holloway (5 batches), parallel is comfortable. For very large clients (10+ batches), serial may be preferable to avoid rate-limit pressure. The `parallelism` option lets the orchestrator decide.

#### Serial

```typescript
const batchResults: Array<Stage3a1Result | Stage3a1ResultFailed> = [];
for (let i = 0; i < batches.length; i++) {
  batchResults.push(
    await quantifyBatch(clientProfile, batches[i], batchContexts[i], options)
  );
}
```

Each batch waits for the previous to complete. No early-exit on failure — all batches run regardless, so Stage 3a.2 can surface a complete failure picture rather than truncating at the first error.

Default: `parallel`. Override via `options.parallelism`.

### Step 4 — Invoke Stage 3a.2 once

```typescript
const consolidated = validateAndMerge(batchResults, selectedRecommendations);
```

Stage 3a.2 returns `QuantifiedRecommendations` with `_sequencer_status: "FAILED"` populated if any batch failed (partial or full).

### Step 5 — Merge per-batch metadata

Stage 3a.2 doesn't generate `_metadata` (its scope is recommendations + flags only). The harness builds the consolidated Stage 3a metadata:

```typescript
const metadata: SequencerMetadata = {
  sequencer_a_version: "3a-1.0.0",
  assembler_b_version: "3b-pending",     // filled in at Stage 3b time
  sequenced_at: new Date().toISOString(),
  source_fr_content_hash: clientProfile._metadata.source_fr_content_hash,
  source_client_profile_version: clientProfile._metadata.parsed_at,
  source_selected_recommendations_version:
    selectedRecommendations._metadata?.parsed_at ?? "unknown",
  archetype: clientProfile.engagement.archetype_primary,
  archetype_secondary: clientProfile.engagement.archetype_secondary,
  volatile_rates_snapshot: extractVolatileRatesSnapshot(batchResults),
  firm_policy_resolutions_applied: extractFirmPolicyResolutions(batchResults),
  landmine_authorizations_applied: extractLandmineAuthorizations(batchResults),
  recommendation_count_total: consolidated.recommendations.length,
  recommendation_count_pending_reconciliation: countPendingReconciliation(consolidated),
  recommendation_count_qualitative_only: countQualitativeOnly(consolidated),
  compliance_id: null,
  compliance_id_format_version: null,
};
```

Per-batch token usage rolls up:

```typescript
const aggregateTokens = batchResults.reduce(
  (acc, r) => {
    if ("_metadata" in r && r._metadata) {
      acc.input += r._metadata.input_token_count ?? 0;
      acc.output += r._metadata.output_token_count ?? 0;
      acc.cache_creation += r._metadata.cache_creation_input_tokens ?? 0;
      acc.cache_read += r._metadata.cache_read_input_tokens ?? 0;
    }
    return acc;
  },
  { input: 0, output: 0, cache_creation: 0, cache_read: 0 },
);
```

### Step 6 — Return consolidated envelope

```typescript
return {
  ...consolidated,
  _metadata: metadata,           // attached by harness, not by Stage 3a.2
  _aggregate_tokens: aggregateTokens,
};
```

(The `_metadata` and `_aggregate_tokens` fields are out of scope for the existing `QuantifiedRecommendations` type; the harness is free to wrap or extend the return shape per the orchestrator's actual needs. Specifically, `pipelineTypes.ts` may need to be extended to include `_metadata` as an optional field on `QuantifiedRecommendations`. This is captured under "schema decisions" below.)

---

## Token Budget at Holloway Scale

Holloway: 81 selected recs / 20 per batch = 5 batches.

Per batch:
- Input: ~50K tokens (20 recs × 2.5K avg + reference KB + ClientProfile + system prompt + batch_context)
- Output: ~8K tokens
- Cost (Opus 4.7): ~$0.50–$1.50

Total Stage 3a invocation:
- 5 batches × $1 average = ~$5 per Holloway run
- Wall-clock parallel: ~30–60s (limited by slowest batch)
- Wall-clock serial: ~150–300s (sum of all batches)

Compare to archived single-call architecture: would have required ~320K input tokens, exceeding Opus 4.7's 200K context limit, and would have failed entirely.

For lighter clients (~25 recs): 1–2 batches, ~$1–$3 total. Sub-stage overhead is small.

---

## Failure Handling

### Single batch failure (partial)

Stage 3a.2 returns `_sequencer_status: "FAILED"` with `recommendations[]` populated from successful batches. The orchestrator can:

- **Pass through to Stage 3b** with the partial set. Stage 3b's deterministic logic tolerates missing recs via flags. Plan output is degraded but produced.
- **Retry only the failed batches.** Re-invoke `quantifyBatch` for each failed batch; merge results into a fresh Stage 3a.2 call. v1 does NOT auto-retry at the harness level — left to the calling code or human operator.

### All batches failed

Stage 3a.2 returns `_sequencer_status: "FAILED"`, empty `recommendations[]`, populated `_sequencer_failures[]`. The orchestrator should NOT proceed to Stage 3b — there's nothing to assemble. Surface to caller as a hard failure.

### Stage 3a.1 KB load failure

A single batch may fail with `_failure_type: "kb_load_failed"` if a rec file is missing. The orchestrator should diagnose this immediately (it's a deterministic config error, not a transient API issue) and halt before Stage 3a.2.

### Volatile rates stale flag

Surfaced in `_sequencer_flags.volatile_rates_stale[]` (one entry per batch that flagged it). Stage 3a does NOT fail-close on this. Stage 5 mechanical pre-checks owns the fail-closed gate.

---

## Schema Decisions (Made During Spec Authoring)

1. **`QuantifiedRecommendations._metadata` field.** The existing `QuantifiedRecommendations` type in pipelineTypes.ts (lines 267–272) does NOT have a `_metadata` field. Stage 3b's `SequencedPlan` has `_metadata: SequencerMetadata`, but Stage 3a's container doesn't. Two options:
   - **(a)** Extend `QuantifiedRecommendations` with `_metadata: SequencerMetadata` — clean, matches Stage 3b's shape.
   - **(b)** Have the harness return a wrapper type `Stage3aResult = { quantified: QuantifiedRecommendations; metadata: SequencerMetadata }` — keeps `QuantifiedRecommendations` narrow.
   - **My choice:** **(a)** — extend at build time. Rationale: every other stage envelope in pipelineTypes.ts has `_metadata`; consistency wins. Stage 3a.2 itself doesn't generate metadata, but the consolidated Stage 3a output does. The pipelineTypes.ts edit happens in Phase 3.1b (build phase), not in this spec phase.

2. **`_aggregate_tokens` field placement.** Per-batch token usage rolls up to a Stage-3a-level total. Could live inside `_metadata` (cleaner) or as a separate top-level field. Decision: inside `_metadata` as `_metadata.input_token_count` (sum) and `_metadata.output_token_count` (sum); the per-batch breakdown stays implicit. Matches StageMetadata shape from clientProfile.ts.

3. **Default batch size: 20.** Selected from observed Stage 3a.1 token usage (~30–50K input per 20 recs). Smaller batches (10) overpay on harness overhead; larger batches (40+) approach the 200K context boundary and reduce headroom for error margin. 20 is the sweet spot for v1; adaptive sizing is v2 backlog.

4. **Parallel by default.** Trade-off: parallel batches can stack rate-limit pressure on the Anthropic API. For the 100-clients-per-year × ~5-batches-per-client load, this is comfortable. Serial available as opt-in for cost-sensitive or rate-limit-constrained runs.

5. **No auto-retry at harness level.** Stage 3a.1 has its own per-batch retry budget (`maxRetries: 1`, i.e., 2 attempts per batch). The harness does NOT add a second-tier retry. Rationale: at v1, transient failures are rare enough that human review of failed batches is acceptable; auto-retry adds complexity (retry budget management, backoff, idempotency) without clear benefit.

6. **Harness lives in orchestrator code, not as a separate stage spec deliverable.** This spec exists to document the chaining contract; the actual implementation lives in `src/lib/orchestrator/orchestrator.ts` (or a `glue/stage3aHarness.ts` if separation is desired at build time). Test coverage lives at the orchestrator integration-test level, not in stage-specific tests.

---

## Test Requirements

Harness integration tests live alongside the orchestrator's existing integration tests (e.g., `src/lib/orchestrator/__tests__/orchestrator.test.ts` or a dedicated `stage3aHarness.test.ts` if extracted).

### Mock test cases

1. **Holloway-shaped input (81 recs, batch size 20)** → produces 5 batch invocations; each returns mock `Stage3a1Result`; consolidated `QuantifiedRecommendations` has 81 entries.

2. **Single-batch input (15 recs, batch size 20)** → produces 1 batch invocation; consolidated output equals the single batch's recommendations.

3. **Final partial batch (81 recs, batch size 25)** → produces 4 batches sized [25, 25, 25, 6]. Final small batch invokes successfully.

4. **Custom batch size from options** → `options.batchSize: 10` overrides default; Holloway produces 9 batches.

5. **Parallel execution** → `Promise.all` issues 5 concurrent calls; all complete; output preserves original `selected[]` order.

6. **Serial execution** → `parallelism: "serial"` runs batches sequentially; output identical to parallel run.

7. **One batch fails (partial failure)** → harness invokes Stage 3a.2 with mixed `succeeded[]` and `failed[]` results; consolidated envelope has `_sequencer_status: "FAILED"` and partial `recommendations[]`.

8. **All batches fail** → consolidated envelope has empty `recommendations[]`, `_sequencer_failures[]` populated.

9. **BatchContext correctness** — assert each `quantifyBatch` call receives a `BatchContext` whose `preceding_batch_rec_ids` and `following_batch_rec_ids` together contain all OTHER recs (i.e., everything except this batch).

10. **Metadata aggregation** — sum of `input_token_count` across batches matches consolidated `_metadata.input_token_count`.

### No live API tests at the harness level

Stage 3a.1 has its own live test for end-to-end API behavior. The harness tests are pure orchestration logic against mocked Stage 3a.1 / Stage 3a.2 results.

---

## What This Does NOT Do

- Does NOT compute QuantifiedImpact or extract ActionItems — that's Stage 3a.1.
- Does NOT validate cross-rec references or merge batch flags — that's Stage 3a.2.
- Does NOT make decisions about retry policy beyond "no auto-retry at harness level". Caller decides.
- Does NOT enforce a maximum batch count or rec count. The orchestrator config layer caps client-set sizes if needed.
- Does NOT call Stage 3b. The orchestrator's main flow does that as a separate step.
- Does NOT generate `compliance_id`. Stage 3b does.

---

## V2 Architectural Backlog

- **Adaptive batch sizing** based on rec complexity (rec file token counts) — currently fixed at `batchSize: 20`.
- **Automatic batch redistribution** to avoid tiny final batches (81 recs → [17, 17, 17, 15, 15] instead of [20, 20, 20, 20, 1]).
- **Harness-level retry of failed batches** — re-invoke only the failed batches, merge into new Stage 3a.2 call.
- **Streaming batch results** — emit consolidated envelope progressively as batches complete, rather than waiting for all batches.
- **Cross-batch coordination signal forwarding** — if Stage 3a.1 emits flags about cross-batch ambiguity (e.g., "this rec depends on a sibling batch's rec but I don't know its category"), surface to a refined retry.
