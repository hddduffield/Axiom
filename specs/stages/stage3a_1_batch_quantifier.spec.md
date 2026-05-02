# Stage 3a.1 — Batch Quantifier

**Type:** LLM stage. Calls Anthropic API (Claude Opus 4.7). Runs once per batch of selected recs.

**Purpose:** For a single batch of selected recommendations (typically 15–25 recs), produce a `SequencedRecommendation[]` array where every rec carries a `QuantifiedImpact` (in one of four states A/B/C/D) and a populated `action_items[]` array with full lifecycle metadata. The orchestrator calls Stage 3a.1 multiple times in series or parallel to cover the full `selectedRecommendations.selected[]` set. Stage 3a.2 (deterministic) then merges the per-batch outputs and validates cross-batch references.

**Critical:** Stage 3a.1 is the only stage in the pipeline that opens rec files and parses their IMPLEMENTATION STEPS sections. Misclassifying `duration_class`, missing a `partner_required` signal, or producing an inconsistent `quantified_impact` state propagates downstream into the Tracker, derivative-reminder spawning, and plan prose. Be conservative when the rec file is ambiguous; surface the ambiguity in `_stage_flags` rather than guessing.

**Origin:** Stage 3a.1 is part of the Stage 3a decomposition that replaced the monolithic single-call design. The archived attempt lives at `specs/stages/_archive/stage3a_sequencer_quantifier_v1_attempt_1_single_call.spec.md`. The decomposition mirrors the Stage 2a/2b/2c pattern that resolved an analogous context-budget problem at Stage 2.

**Input:**
- `clientProfile: ClientProfile` (Stage 1 output, full profile, identical for every batch in a Stage 3a invocation)
- `batch: SelectedRecommendation[]` (the subset of `selectedRecommendations.selected[]` for this call, typically 15–25 recs)
- `batchContext: BatchContext` — see schema below; carries batch index, total batch count, and the rec_id lists of preceding/following batches so the LLM can reference cross-batch sequencing relations without inventing them
- `options`:
  - `apiClient: Anthropic` instance (real SDK in production; mock in tests)
  - `kbPath?: string` — default `"kb/v1_2/"`
  - `referenceDate?: Date` — used to evaluate volatile-rate freshness; defaults to `new Date()`
  - `firmPolicyResolutions?: Array<{ question_id: FirmPolicyQuestionId; resolved_value: unknown; resolved_by: string; resolved_at: string }>` — already-decided firm policy answers
  - `landmineAuthorizations?: Array<{ recommendation_id: string; authorized_by: string; authorized_at: string }>`
  - `maxRetries?: number` — default 1 (i.e., 2 total attempts)

**Output:** `Stage3a1Result` on success; `Stage3a1ResultFailed` on failure. No throws.

```typescript
interface BatchContext {
  batch_index: number;          // 0-indexed
  total_batches: number;
  preceding_batch_rec_ids: string[];   // rec_ids in batches < batch_index
  following_batch_rec_ids: string[];   // rec_ids in batches > batch_index
}
```

---

## Algorithm

Stage 3a.1 runs in three phases. The LLM does Phase 2 (per-rec quantification + ActionItem extraction) in a single call; Phase 1 (KB context assembly) and Phase 3 (per-batch validation) are deterministic harness work.

### Phase 1 — Deterministic context assembly (no LLM)

#### Step 1.1 — Load rec files for every rec in the batch

For each `recommendation_id` in `batch[]`, locate the rec file under `kbPath/01_recommendations/<category_dir>/<rec_id>_*.md`. Read full file content. Cap individual rec file size at ~12K tokens; if a rec file exceeds, truncate after the IMPLEMENTATION STEPS section (PLAN OUTPUT TEMPLATE may be truncated; SEQUENCING DEPENDENCIES must always survive).

If any rec file cannot be located: return `Stage3a1ResultFailed` with `_failure_type: "kb_load_failed"`, `_failure_context: { batch_index, missing_rec_id }`. Do not attempt the LLM call.

#### Step 1.2 — Load volatile rates

Read `kbPath/02_reference/08_volatile_rates_lookup.md` fresh on every call (no module-scope caching — rates can move between runs). Extract the active month's §7520 rate, AFRs (short/mid/long annual), §382 rate, and `last_refreshed` timestamp.

Compute `days_since_refresh = (referenceDate - last_refreshed).days`. If `days_since_refresh > 30`, emit `_stage_flags.volatile_rates_stale: { last_refreshed, days_since_refresh }` and proceed. Stage 5 mechanical pre-checks owns the hard fail-closed gate; Stage 3a.1's job is to surface, not block.

The full volatile-rates section is passed inline to the LLM as KB context so the LLM can quote rates in `qualitative_phrasing` and `computation_inputs` without inferring from training data.

#### Step 1.3 — Load auxiliary KB context (cached at module scope)

- `kbPath/02_reference/02_federal_income_tax_limits.md` — for tax computation framing
- `kbPath/02_reference/01_federal_estate_gift_gst.md` — for estate computations
- `kbPath/02_reference/07_georgia_specifics.md` — for state-tax rates and PTET rate
- `kbPath/02_reference/05_obbba_changes_summary.md` — for current-law statute citations

Concatenate. Cache in module scope; the references rarely change within a session and are identical across all batches in a Stage 3a invocation.

#### Step 1.4 — Resolve firm policy state per rec

For each rec in the batch, scan its rec file for marker patterns matching firm-policy question IDs (e.g., `{{firm_policy:<question_id>}}`). Cross-reference against `firmPolicyResolutions[]`:

- If the rec's marker has a matching resolution → the resolution is provided to the LLM as a known answer. The LLM still emits `alternative_values[]` documenting what the alternative formulas WOULD have produced; the resolution is recorded in `computation_inputs._applied_firm_policy_resolutions[]`. **`alternative_values[]` is never deleted post-resolution** — it is the audit trail.
- If no matching resolution → the rec lands in State C (firm-policy pending) with `pending_reconciliation: true`.

#### Step 1.5 — Resolve landmine authorization per rec

For each rec where `selectedRecommendation.landmine === true`, check `landmineAuthorizations[]` for a matching entry. Pass `authorized: true | false` per rec to the LLM. The LLM still quantifies authorized landmines normally (State A/B/C/D per formula availability); default-excluded landmines are quantified at qualitative-only level (State D) with `reason_no_formula: "landmine_default_excluded"` and the phrasing "Excluded by firm default; quantification withheld pending advisor authorization."

### Phase 2 — Single LLM call (per-rec quantification + ActionItem extraction, batch-scoped)

#### Step 2.1 — Build user turn

```
<client_profile>{ClientProfile JSON}</client_profile>
<batch_context>
  <batch_index>0</batch_index>
  <total_batches>5</total_batches>
  <preceding_batch_rec_ids>[]</preceding_batch_rec_ids>
  <following_batch_rec_ids>["REC-EST-006", "REC-RSK-001", ...]</following_batch_rec_ids>
</batch_context>
<batch>{this batch's SelectedRecommendation[] JSON}</batch>
<volatile_rates>{full volatile rates lookup file content}</volatile_rates>
<reference_kb>{concatenated reference files}</reference_kb>
<firm_policy_resolutions>{firmPolicyResolutions JSON, possibly empty}</firm_policy_resolutions>
<landmine_authorizations>{landmineAuthorizations JSON, possibly empty}</landmine_authorizations>
<rec_files>
<rec id="REC-TAX-001">{full rec file content}</rec>
<rec id="REC-EST-006">{full rec file content}</rec>
... one per rec in this batch ...
</rec_files>

For every recommendation in <batch>, produce a SequencedRecommendation with quantified_impact and action_items per your system prompt. Cross-batch sequencing references (must_come_after, must_come_before, sequenced_with, coordinated_with, mutually_exclusive_with) MAY reference rec_ids in <batch_context>.preceding_batch_rec_ids or .following_batch_rec_ids — those are valid; Stage 3a.2 validates them after all batches complete. Output ONLY the Stage3a1Result JSON — no preamble, no commentary, no markdown code fences.
```

**Token budget per batch:**
- Input: ~30–50K tokens (15–25 rec files × 2–3K avg + reference files + ClientProfile + system prompt)
- Output: ~6–10K tokens (15–25 SequencedRecommendation entries × 300–500 tokens each)
- Well within Opus 4.7's 200K context limit; well within `max_tokens: 16000` output budget

#### Step 2.2 — Call Anthropic API

```typescript
const response = await apiClient.messages.create({
  model: "claude-opus-4-7",
  max_tokens: 16000,
  system: STAGE_3A_1_SYSTEM_PROMPT,
  messages: [{ role: "user", content: userTurn }],
  temperature: 0.0,
});
```

`max_tokens: 16000` accommodates a 25-rec batch with full lifecycle metadata. The original single-call architecture used 24000 because output was 130-rec scale; per-batch output is roughly a quarter of that, so 16000 leaves comfortable headroom against truncation (the leading observed cause of JSON parse failures).

#### Step 2.3 — Extract response text, parse, validate

Same pattern as Stage 1 / Stage 2:
- Extract text-block content
- JSON parse → on failure with retries remaining, retry with explicit "your previous response was not valid JSON" correction turn
- Schema validate (zod) → on failure with retries remaining, retry with validation errors enumerated in the correction turn
- After retries exhausted: return `Stage3a1ResultFailed` with the appropriate `_failure_type`

#### Step 2.4 — Per-rec quantification logic (encoded in system prompt)

For each rec in the batch, the LLM determines which of four states the QuantifiedImpact lands in. **The state semantics carry over verbatim from the archived single-call spec** — see archived `stage3a_sequencer_quantifier_v1_attempt_1_single_call.spec.md` Phase 2 Step 2.4 for the field-by-field requirement matrix. Summary:

- **State A (computed):** `estimate !== null`, formula populated, `blocked_inputs` and `alternative_values` empty.
- **State B (blocked inputs):** `estimate === null`, formula populated, `blocked_inputs.length > 0`, qualitative phrasing populated.
- **State C (firm-policy pending):** `estimate === null`, formula populated, `pending_reconciliation: true`, `alternative_values.length > 0`.
- **State D (qualitative-only):** `estimate === null`, `formula_id === null`, `qualitative_phrasing !== null`, `reason_no_formula !== null`.

State-shape invariants are validated in Phase 3 below.

#### Step 2.5 — Per-category quantification rubric (encoded in system prompt)

Carries over from the archived spec: per-category framework for Tax / Estate / Risk & Insurance / Retirement / Investment / Charitable / Entity Structure / Family / Succession & Continuity / Specialty. Inputs, formula sources, and unit conventions per category. §7520-driven recs always cite the rate from the volatile-rates file, never training data.

#### Step 2.6 — ActionItem extraction (per rec)

For each rec, parse the rec file's `## IMPLEMENTATION STEPS` section. Each numbered step becomes (at minimum) one ActionItem. For each ActionItem, populate ALL fields of the extended ActionItem schema with the lifecycle additions:

- `duration_class`: `"point_in_time"` | `"short_running"` | `"long_running"` per the rule table (carried over from archived spec)
- `check_in_cadence`: required when `long_running`, null otherwise (uses the dedicated `CheckInCadence` type — `"weekly" | "biweekly" | "monthly" | "quarterly" | "annually"`, NOT TimingBucket)
- `partner_required` / `partner_type`: derived from the rec's COORDINATION NOTES section
- `parent_action_item_id`: always `null` at Stage 3a.1
- `is_derivative_reminder`: always `false` at Stage 3a.1
- `source_plan_id`: always `null` at Stage 3a.1 (back-filled at Plan delivery)
- `auto_generated_reminder_template`: required when `long_running`, null otherwise; cadence matches `check_in_cadence`; `trigger_threshold_days` derived deterministically (weekly→7, biweekly→14, monthly→30, quarterly→90, annually→365)

The ActionItem rule table (full lifecycle field assignment matrix) is encoded in the system prompt. See archived spec section "ActionItem Lifecycle Field Population (Codified Rules)" for the source of truth.

#### Step 2.7 — Plan-section assignment, timing-bucket, owner

For each rec, the LLM populates SequencedRecommendation envelope fields per the archived spec Step 2.7. Notable: `cluster_id`, `cluster_sequence_closer`, and `position_in_sequence` are left null at 3a.1; Stage 3b assigns them.

### Phase 3 — Deterministic post-LLM validation (per-batch, scoped)

#### Step 3.1 — Schema validation (zod)

Validate the parsed response against the `Stage3a1ResultSchema` (lives in `src/lib/orchestrator/schemas/stage3a1.types.ts`). Per-batch fail-loud invariants:

- Every `recommendations[i].recommendation_id` exists in this batch's input `batch[]` (NOT in the full selected[] — that's Stage 3a.2's job). Reject foreign rec_ids.
- Every `recommendations[i]` has a `quantified_impact` whose state-shape is internally consistent (per-state field requirements above).
- `quantified_impact.estimate !== null` ⇒ State A constraints (no blocked_inputs, no alternative_values, no qualitative_phrasing).
- `quantified_impact.alternative_values.length > 0` ⇒ `pending_reconciliation === true`.
- `quantified_impact.blocked_inputs.length > 0` ⇒ `estimate === null`.
- `quantified_impact.qualitative_phrasing === null` ⇒ NOT State D (D requires non-null phrasing).
- `quantified_impact.reason_no_formula !== null` ⇒ State D (estimate null, formula_id null).
- For each ActionItem: `duration_class === "long_running"` ⇔ `check_in_cadence !== null` ⇔ `auto_generated_reminder_template !== null`.
- For each ActionItem: `partner_required === false` ⇒ `partner_type === null`. `partner_required === true` ⇒ `partner_type !== null`.
- For each ActionItem: `is_derivative_reminder === false` AND `parent_action_item_id === null` (Stage 3a never spawns derivatives).
- For each ActionItem: `source_plan_id === null` (Stage 3a never sets this).

**Cross-batch references are NOT validated here.** A `must_come_after` entry pointing at a rec_id in a sibling batch is acceptable at 3a.1; Stage 3a.2 validates that the referenced rec_id actually exists somewhere in the consolidated output.

**Action_item.depends_on cross-batch references are also not validated here.** Same reasoning — Stage 3a.2 owns that check.

Validation failures retry once with the validation-error list explicitly enumerated in the correction turn. After retries exhausted: return `Stage3a1ResultFailed` with `_failure_type: "schema_validation_failed"` and the validation_errors array.

#### Step 3.2 — Build batch-scoped flags

Populate `_stage_flags: SequencerFlags3a` with batch-scoped entries for:

- `unenumerated_question_ids` — firm-policy markers not in the FirmPolicyQuestionId enum
- `formula_yielded_unviable_value` — formulas that produced negative or implausible outputs
- `cluster_closer_skipped` — N/A at batch level (Stage 3b owns clustering)
- `section_assignment_ambiguity` — recs where multiple plausible plan sections could apply
- `timing_bucket_inferred` — action items where the LLM inferred timing from urgency cues
- `qualitative_fallback_used` — recs where State D fallback fired
- `blocked_inputs_summary` — per-rec blocked-input rollup for State B recs
- `volatile_rates_stale` — set if `days_since_refresh > 30` in Phase 1.2

These flags are batch-scoped. Stage 3a.2 unions them across batches into the final QuantifiedRecommendations envelope.

#### Step 3.3 — Compute metadata

Build `_metadata: StageMetadata`:

- `stage_version`: `"3a.1-1.0.0"`
- `model_used`: `"claude-opus-4-7"`
- `input_token_count`, `output_token_count`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `attempts_made`, `duration_ms`, `parsed_at`
- `source_fr_content_hash`: hash from input ClientProfile metadata
- `attempt_history[]`: per-attempt outcomes for diagnostic substrate

#### Step 3.4 — Return Stage3a1Result

```typescript
return {
  batch_index,
  total_batches,
  recommendations: [...],
  _stage_flags: { ... },
  _metadata: stageMetadata,
};
```

---

## Output Schema

Lives in `src/lib/orchestrator/schemas/stage3a1.types.ts` (zod). Inferred TypeScript types exported alongside.

```typescript
interface Stage3a1Result {
  batch_index: number;
  total_batches: number;
  recommendations: SequencedRecommendation[];   // for this batch only
  _stage_flags: SequencerFlags3a;                // batch-scoped flags
  _metadata: StageMetadata;
}

interface Stage3a1ResultFailed {
  _stage_status: "FAILED";
  _failure_type:
    | "kb_load_failed"                  // rec file not found, reference file missing
    | "json_parse_failed"
    | "schema_validation_failed"
    | "api_error"
    | "max_retries_exceeded"
    | "context_overflow"                // input would exceed 200K context — caller should reduce batch size
    | "fr_extraction_failed";           // ClientProfile shape unusable
  _failure_reason: string;
  _failure_context: {
    batch_index: number;
    missing_rec_id?: string;
    parse_error?: string;
    validation_errors?: string[];
    raw_response?: string;
    parsed_response?: unknown;
    api_error?: string;
    attempts_made: number;
    last_failure_type?: "json_parse_failed" | "schema_validation_failed";
  };
  _metadata: Partial<StageMetadata>;
}
```

The container types `SequencedRecommendation`, `QuantifiedImpact`, `ActionItem`, `SequencerFlags3a`, `CheckInCadence`, `PartnerType`, `AutoGeneratedReminderTemplate` are already declared in `src/lib/orchestrator/schemas/pipelineTypes.ts` and reused unchanged. Only `Stage3a1Result` and `Stage3a1ResultFailed` are new.

---

## System Prompt

`src/lib/orchestrator/stages/stage3a1.system.md` (~10–12K words). Sections:

1. **Role and goal:** "You are Stage 3a.1 of an automated financial planning pipeline. For each recommendation in this batch, you produce a quantified impact in one of four states (A/B/C/D) and a list of ActionItems with full lifecycle metadata. Cross-batch sequencing references to other batches' rec_ids are explicitly allowed — Stage 3a.2 validates them..."
2. **Four-state quantification rubric** — same as archived spec.
3. **Per-category quantification framework** — same as archived spec.
4. **Volatile rates discipline** — always cite from `<volatile_rates>` block, never training data; use "current at funding" framing.
5. **Firm policy resolution handling** — alternative_values stays populated post-resolution; State C when not provided.
6. **ActionItem extraction rules** — full lifecycle-field rule table.
7. **Derivative reminder template generation** — cadence-to-trigger_threshold_days mapping, allowed placeholders.
8. **Plan-section assignment, timing-bucket inference, owner assignment.**
9. **Batch-scoping discipline** — new section. Explains that `<batch_context>.preceding_batch_rec_ids` and `.following_batch_rec_ids` are valid sequencing-reference targets; do not reject or warn on them. Do NOT generate SequencedRecommendation entries for rec_ids outside `<batch>`.
10. **Schema discipline:**
   - JSON only, no preamble, no markdown fences
   - Every `recommendation_id` from `<batch>` (NOT from sibling batches)
   - Every state-shape internally consistent
   - All ActionItem invariants satisfied
   - `depends_on[]` references valid action_item_ids (cross-batch refs OK; per-batch validation only confirms shape)
11. **Examples:** 3 worked examples (one State A tax rec, one State C estate rec, one State D family rec) with batch-context handling demonstrated.

---

## Implementation Requirements

1. **Module location:** `src/lib/orchestrator/stages/stage3a1BatchQuantifier.ts`

2. **Schema location:** `src/lib/orchestrator/schemas/stage3a1.types.ts`

3. **System prompt location:** `src/lib/orchestrator/stages/stage3a1.system.md`

4. **Function signature:**

```typescript
export async function quantifyBatch(
  clientProfile: ClientProfile,
  batch: SelectedRecommendation[],
  batchContext: BatchContext,
  options: {
    apiClient: Anthropic;
    kbPath?: string;
    referenceDate?: Date;
    firmPolicyResolutions?: Array<{
      question_id: FirmPolicyQuestionId;
      resolved_value: unknown;
      resolved_by: string;
      resolved_at: string;
    }>;
    landmineAuthorizations?: Array<{
      recommendation_id: string;
      authorized_by: string;
      authorized_at: string;
    }>;
    maxRetries?: number;
  }
): Promise<Stage3a1Result | Stage3a1ResultFailed>;
```

5. **No throws.** All errors caught and returned as `Stage3a1ResultFailed`.

6. **Anthropic call config:**
   - `model: "claude-opus-4-7"`
   - `max_tokens: 16000`
   - `temperature: 0.0`
   - System prompt loaded from disk at module load and cached.

7. **Retry pattern matches Stage 1/2:**
   - Attempt 1: standard turn
   - On JSON parse failure with retries remaining: append assistant turn with raw response + user turn with explicit "your previous response was not valid JSON" correction
   - On schema validation failure with retries remaining: append assistant turn with raw response + user turn enumerating validation errors
   - On API error: no automatic retry beyond Anthropic SDK's built-in retry; return `api_error` failure after one attempt
   - `attempts_made` recorded in metadata

8. **KB context caching:** rec files for THIS batch loaded per-invocation. Reference KB files cached at module scope. Volatile rates file is read every invocation (no caching).

9. **Logging:** include token-count breakdown by section in metadata (`_metadata.input_breakdown: { client_profile, batch, batch_context, volatile_rates, reference_kb, rec_files, firm_policy, landmine }`) for monitoring.

10. **Cost target:** $0.50–$1.50 per batch call at Opus 4.7 pricing (input 30–50K tokens; output 6–10K tokens).

---

## Test Requirements

Create `src/lib/orchestrator/stages/__tests__/stage3a1BatchQuantifier.test.ts`. Use Node's `node:test` runner. Mirror the Stage 1 / Stage 2 mock pattern: `MockAnthropicClient` returns configurable response sequences.

### Mock test cases (always-on)

1. **Mock API success — small batch (3 recs, mixed categories)** → returns valid `Stage3a1Result`. Structural assertions:
   - `recommendations.length === batch.length`
   - At least one rec with `quantified_impact.estimate !== null` (State A)
   - At least one rec with `quantified_impact.alternative_values.length > 0` (State C)
   - At least one rec with `quantified_impact.qualitative_phrasing !== null` and `formula_id === null` (State D)
   - Every long_running ActionItem has non-null `check_in_cadence` AND non-null `auto_generated_reminder_template`
   - Every point_in_time and short_running ActionItem has null `check_in_cadence` AND null `auto_generated_reminder_template`

2. **Mock API returns invalid JSON** → `Stage3a1ResultFailed` with `_failure_type: "json_parse_failed"`.

3. **Mock API returns valid JSON but schema-invalid (state C with empty alternative_values)** → `_failure_type: "schema_validation_failed"`; validation_errors includes the state-shape violation.

4. **Mock API returns ActionItem with `duration_class: "long_running"` and `check_in_cadence: null`** → schema validation fails with the lifecycle-field invariant violation.

5. **Mock API returns ActionItem with `partner_required: true` and `partner_type: null`** → schema validation fails.

6. **Mock API returns recommendation_id NOT in this batch's `batch[]`** → schema validation fails with foreign-rec_id error. (Note: cross-BATCH references in sequencing relations are OK; foreign rec_ids in `recommendations[]` are not.)

7. **Mock API success with retry** — first call returns invalid JSON, retry returns valid → returns `Stage3a1Result` with `attempts_made: 2`.

8. **Mock API success with `firmPolicyResolutions` provided** → verify:
   - Affected recs land in State A, not State C.
   - `alternative_values[]` STILL populated.
   - Resolution applied recorded in `computation_inputs._applied_firm_policy_resolutions[]`.

9. **Mock API success with `landmineAuthorizations` provided** → verify:
   - Authorized landmines land in State A/B/C/D normally per formula availability.
   - Unauthorized landmines land in State D with `reason_no_formula: "landmine_default_excluded"`.

10. **Volatile rates stale (referenceDate set 60 days after `last_refreshed`)** → `_stage_flags.volatile_rates_stale: { last_refreshed, days_since_refresh: 60 }` populated; stage does NOT fail.

11. **Missing rec file** → `Stage3a1ResultFailed` with `_failure_type: "kb_load_failed"` and `missing_rec_id` populated.

12. **Batch context handling — sequencing reference points at preceding batch** → mock LLM emits `must_come_after: [{ recommendation_id: "REC-FROM-PRECEDING-BATCH" }]`. Stage 3a.1 accepts (does NOT validate cross-batch existence — that's Stage 3a.2's job).

13. **API error (mock 500 response)** → `Stage3a1ResultFailed` with `_failure_type: "api_error"`.

14. **Context overflow detection** — if assembled input would exceed 200K tokens, fail-fast before the API call with `_failure_type: "context_overflow"` and a hint to reduce batch size.

### Live API test (skipped without env var)

15. **Live small-batch test, marked `{ skip: !process.env.RUN_LIVE_API_TESTS }`** — uses the first 5 recs from the Holloway hand-authored fixture (`artifacts/holloway_selected_recommendations.json`). Real Anthropic API call. Structural assertions:
   - `recommendations.length === 5`
   - At least one rec quantified in State A
   - At least one ActionItem with `duration_class: "long_running"` with populated `auto_generated_reminder_template`
   - At least one ActionItem with `partner_required: true` and non-null `partner_type`
   - `_metadata.attempts_made >= 1`

Cost ~$0.10–$0.30 per live run for the 5-rec batch.

---

## What This Does NOT Do

- Does NOT call other LLM stages.
- Does NOT validate cross-batch sequencing references — that's Stage 3a.2's job. Stage 3a.1 emits cross-batch refs as-is.
- Does NOT validate cross-batch action_item.depends_on references — same reasoning.
- Does NOT compute the topological sort, cluster detection, or `position_in_sequence`. Those are Stage 3b (deterministic).
- Does NOT assemble plan_sections or global_order. Stage 3b owns plan structure.
- Does NOT generate prose. Stage 4 owns prose.
- Does NOT spawn derivative reminder ActionItems. The Tracker spawns those at runtime using `auto_generated_reminder_template`.
- Does NOT set `parent_action_item_id` or `source_plan_id` (both null at Stage 3a.1).
- Does NOT validate firm-policy resolution values for sensibility — orchestrator config layer's job.
- Does NOT run mechanical pre-checks (Stage 5) on its own output.
- Does NOT decide whether a landmine should be authorized — consumes the authorization state and quantifies accordingly.
- Does NOT fail-closed on stale volatile rates (Stage 5 owns that gate). Flags but proceeds.
- Does NOT generate `compliance_id` or supervisory review signals. Stage 3b / aggregate metrics builder own those.
- Does NOT determine batch boundaries — that's the orchestrator harness's job (see `stage3a_orchestration.spec.md`).
- Does NOT merge sibling batches' outputs — that's Stage 3a.2's job.

---

## Flagged Decisions (Made During Spec Authoring)

1. **`max_tokens: 16000`** for the per-batch Anthropic call. Output scales with batch size; a 25-rec batch with full lifecycle metadata runs ~6–10K tokens. 16K leaves comfortable headroom against truncation while staying tighter than the 24K budget the archived single-call architecture used (which had to handle 130-rec output). If batches grow above 30 recs in practice, revisit.

2. **`CheckInCadence` (not `TimingBucket`) for the `check_in_cadence` field.** Confirmed by the existing pipelineTypes.ts implementation. The archived spec's "Output Schema" section had a stale `TimingBucket | null` annotation; this spec uses the dedicated `CheckInCadence` type per the resolved fork (option b in the archived spec's flagged decisions).

3. **Cross-batch references are accepted at Stage 3a.1 without validation.** The alternative — having 3a.1 receive the FULL `selected[]` rec_id list and validate every cross-rec reference inline — was rejected because it bloats the per-batch context and duplicates work that Stage 3a.2 does once cleanly across all batches. The trade-off is that 3a.1 emits potentially invalid refs that 3a.2 must catch; the test suite verifies this contract.

4. **Batch context passes only rec_ids, not full SelectedRecommendation entries, for sibling batches.** Adds ~30 tokens per sibling rec to the context. Passing full SelectedRecommendation entries (with `triggers_matched`, `brief_rationale`, etc.) would be richer but bloats the per-batch input meaningfully at 80-rec scale (e.g., Holloway batch context could grow to 5K+ tokens). v1 uses rec_ids only; v2 may revisit if cross-batch coordination quality suffers.

5. **`Stage3a1Result` and `Stage3a1ResultFailed` types live in a NEW file (`schemas/stage3a1.types.ts`), not in pipelineTypes.ts.** Same pattern as Stage 2a/2b/2c. Keeps pipelineTypes.ts focused on cross-stage shared types; sub-stage-specific types stay local.

6. **Volatile rates read fresh every batch call within a Stage 3a invocation.** Alternative: load once at the orchestrator level and pass to each batch. This would be cheaper but couples Stage 3a.1 to the orchestrator's responsibility for rate freshness. v1 keeps each batch self-sufficient; the cost is one extra file read per batch (~1ms). If contention becomes an issue at higher batch counts, swap to orchestrator-level read.

7. **"Context overflow" is a Stage 3a.1 failure mode, not silent truncation.** If assembled input would exceed 200K tokens, fail-fast with `_failure_type: "context_overflow"` so the orchestrator can reduce batch size and retry. Silent truncation would corrupt downstream output.

---

## V2 Architectural Backlog

- **Adaptive batch sizing.** Large clients with simple recs could go 30–40 per batch; small clients could go 5–10 to avoid harness overhead. v1 uses fixed batch size from `OrchestratorConfig.stage3aBatchSize`.
- **Cross-batch context enrichment.** Pass `triggers_matched` and `brief_rationale` per sibling rec if cross-batch coordination quality is suffering.
- **Per-rec parallelization within a batch** (currently the LLM handles all recs in one call). Trade-off: more API calls vs. tighter latency.
- **Formula library externalization** — replace LLM-driven formula synthesis with a registered formula library. Captured in archived spec; still open at v2.
- **Volatile-rates auto-refresh.** Pipeline checks rates file age and auto-runs a refresh job before invocation if stale.
