# Stage 2a — Hard Filter

**Type:** LLM stage. Calls Anthropic API with a cheap model (Claude Haiku 4.5).

**Purpose:** Walk all 130 KB recommendations. For each, decide "do this client's circumstances match the rec's triggering criteria — yes or no?" Eliminate every rec where the answer is no. Output is a flat list of candidate rec_ids — typically 30–80 from the 130-rec universe — that proceed to Stage 2b for calibration.

**Critical:** Stage 2a is a pattern-matching task, not a judgment task. The system prompt explicitly instructs the LLM not to filter for quality, not to weigh competing recs, not to think about sequencing — only to ask "does the trigger pattern fit this client?" That discipline is what lets a cheap model (Haiku) carry this stage. Match strength calibration, supplemental-vs-selected splitting, and orphan checking all happen in Stage 2b. Sequencing relations and landmine status come from Stage 2c. Stage 2a stays narrow on purpose.

**Origin:** Stage 2a is part of the Stage 2 decomposition that replaced the monolithic three-pass design. The archived attempt lives at `specs/stages/_archive/stage2_recommendation_selector_v1_attempt_1.spec.md`.

**Input:**
- clientProfile: ClientProfile (Stage 1 output)
- options:
  - apiClient: Stage2aApiClient — structural interface satisfied by both the real Anthropic SDK and test mocks (matches Stage 1 / Stage 2 ApiClient pattern)
  - kbPath?: string (default `"kb/v1_2/"`)
  - referenceDate?: Date (for testing volatile-rate freshness when relevant; Stage 2a does not consume volatile rates but accepts the option for harness uniformity)
  - maxRetries?: number (default 1 — i.e., 2 total attempts)

**Output:** Stage2aResult on success; Stage2aResultFailed on failure. No throws.

---

## Algorithm

### Step 1 — Load KB context (once, module-scope cached)

Read three files from `kbPath`:

- `00_master/02_RECOMMENDATION_ID_REGISTRY.md` (~3,400 tokens) — the canonical 130-rec universe with category, status, archetype tags.
- `03_sequencing/05_triggering_matrix.md` (~440 tokens) — concise "client pattern → rec_ids" mapping.
- `03_sequencing/06_engagement_archetypes.md` (~1,100 tokens) — archetype emphasis tables.

Total KB context: ~5,000 tokens. Concatenated into a single string. Cached at module scope on first call. Subsequent calls reuse the cached string.

If any file is missing or unreadable: return Stage2aResultFailed with `kb_load_failed` and the missing path.

### Step 2 — Build user turn

```
<client_profile>
{ClientProfile JSON}
</client_profile>

<kb_recommendation_id_registry>
{file content}
</kb_recommendation_id_registry>

<kb_triggering_matrix>
{file content}
</kb_triggering_matrix>

<kb_engagement_archetypes>
{file content}
</kb_engagement_archetypes>

Walk every recommendation in the ID Registry. For each, decide whether this client's circumstances match its triggering criteria. Output ONLY a JSON array of recommendation_id strings for the ones that match — no preamble, no commentary, no markdown code fences.
```

User turn total with ClientProfile (~3K): ~8,000 tokens. Well within Haiku's window.

### Step 3 — Call Anthropic API

```typescript
const response = await apiClient.messages.create({
  model: "claude-haiku-4-5",
  max_tokens: 4000,
  system: [
    {
      type: "text",
      text: STAGE_2A_SYSTEM_PROMPT,
      cache_control: { type: "ephemeral" },
    },
  ],
  messages: [{ role: "user", content: userTurn }],
  temperature: 0.0,
});
```

**`max_tokens: 4000`** — output is a flat array of rec_id strings. 130 ids × ~14 chars each ≈ 2K tokens worst case; 4K provides headroom for whitespace and a closing brace. Truncation here is unlikely.

**Prompt caching enabled** on the system prompt. Stage 2a is invoked once per Plan generation; cache benefit accrues across multiple plans within a session.

### Step 4 — Extract response text

```typescript
const responseText = response.content
  .filter((block): block is Anthropic.TextBlock => block.type === "text")
  .map((block) => block.text)
  .join("");
```

### Step 5 — Parse JSON

Try parsing the response as JSON. Expected shape: `string[]`. If parse fails:
- If retries remaining: retry with explicit error message (`"Your previous response was not valid JSON. The error was: <error>. Output ONLY a JSON array of recommendation_id strings now."`)
- If no retries remaining: return Stage2aResultFailed with `json_parse_failed`, `parse_error`, `raw_response`.

### Step 6 — Validate

Run two validation checks on the parsed array:

1. **Every rec_id exists in the registry.** Any fabricated id is a fail. The registry is loaded into memory; this is a Set lookup.
2. **Array length within defensive bounds: 30–90.** Below 30 or above 90 indicates the LLM either over-filtered or under-filtered. Treated as schema validation failure.

If validation fails:
- If retries remaining: retry with the specific errors enumerated. Example correction turn: `"Your previous response contained recommendation_ids not in the ID Registry: [REC-XXX-999, ...]. Re-issue using only ids from the registry."` or `"Your previous response contained 12 ids — that is unusually low. Walk every rec in the registry again and decide trigger-fit."`
- If no retries remaining: return Stage2aResultFailed with `schema_validation_failed`, `validation_errors`, `parsed_response`.

### Step 7 — Compute stage flags

```typescript
const _stage_flags = {
  candidate_count_unusually_low: candidate_rec_ids.length < 25,
  candidate_count_unusually_high: candidate_rec_ids.length > 80,
};
```

These flags surface to the harness and downstream metadata; they do NOT fail the stage. The 25 / 80 thresholds are wider than the 30–90 schema-validation bounds — flag-thresholds are heuristics for "this looks suspicious," validation-thresholds are hard rejections. A run with 26 candidates passes validation but raises the unusually-low flag.

### Step 8 — Compute metadata

Build StageMetadata (matches Stage 1's shape, augmented with prompt-cache token fields):

- `stage_version`: `"2a-1.0.0"`
- `model_used`: `"claude-haiku-4-5"`
- `input_token_count`, `output_token_count`, `cache_creation_input_tokens`, `cache_read_input_tokens` from `response.usage`
- `attempts_made`: 1 or 2
- `attempt_history`: array of AttemptHistoryEntry (`{ attempt_number, outcome, failure_details, duration_ms, input_tokens, output_tokens }`) — one entry per attempt
- `duration_ms`: end_time - start_time (cumulative across attempts)
- `source_client_profile_hash`: SHA-256 of `JSON.stringify(clientProfile.body)` — lets Stage 2b verify it received a profile from the same Stage 2a run if the harness ever reorders
- `parsed_at`: ISO 8601 timestamp

### Step 9 — Return

```typescript
return {
  candidate_rec_ids,
  _stage_flags,
  _metadata: stageMetadata,
};
```

---

## Output Schema (Stage2aResult)

```typescript
export interface Stage2aResult {
  candidate_rec_ids: string[];                    // 30–90 entries, each in the ID Registry
  _stage_flags: {
    candidate_count_unusually_low: boolean;       // < 25
    candidate_count_unusually_high: boolean;      // > 80
  };
  _metadata: StageMetadata;
}

export interface Stage2aResultFailed {
  _stage_status: "FAILED";
  _failure_type:
    | "json_parse_failed"
    | "schema_validation_failed"
    | "api_error"
    | "max_retries_exceeded"
    | "kb_load_failed";
  _failure_reason: string;
  _failure_context: {
    parse_error?: string;
    validation_errors?: string[];
    raw_response?: string;
    parsed_response?: unknown;
    api_error?: string;
    missing_kb_path?: string;
    attempts_made: number;
  };
  _metadata: Partial<StageMetadata>;
}
```

`StageMetadata` is the same shape Stage 1 already exports from `clientProfile.ts` (with `cache_creation_input_tokens` / `cache_read_input_tokens` and `attempt_history` mandatory). Stage 2a reuses it; no new metadata schema needed.

---

## System Prompt

The Stage 2a system prompt is small (~3,000 words) and ruthlessly narrow. Critical sections:

1. **Role and goal:** "You are Stage 2a of an automated financial planning pipeline. Your job is pattern matching, not judgment. For each recommendation in the ID Registry, decide: do this client's circumstances match its triggering criteria — yes or no?"

2. **Pattern-match discipline (the load-bearing instruction):**
   - "If the trigger conditions match, include the rec_id."
   - "If the trigger conditions don't match, exclude it."
   - "Don't second-guess. Don't filter for quality. Don't weigh competing recs. Don't think about sequencing. Don't think about whether the client would benefit. Stage 2b does calibration."
   - "It is correct for you to include 60+ rec_ids if 60 patterns match. Stage 2b will narrow."

3. **Triggering criteria reference:** Use the triggering matrix and the registry's archetype tags. The full rec files are NOT loaded at Stage 2a — pattern matching uses only the matrix excerpt and the registry tag columns.

4. **Archetype-driven inclusions:**
   - PRE → include all PRE-tagged recs that aren't hard-disqualified by the client's specifics
   - POST → include all POST-tagged
   - ACT, FO, FOUND → include the relevant archetype tags
   - Cross-archetype recs (independent of archetype) → include if pattern matches

5. **Hard disqualifiers (the only "judgment" allowed):**
   - Required entity type absent (no operating LLC → exclude REC-ENT-001 — but the matrix tells you that)
   - Required client characteristic absent (no charitable intent in goals_and_values → exclude REC-CHR-* unless the matrix says otherwise)
   - The matrix and registry encode these; do not apply your own.

6. **Output format strict:**
   - JSON array of strings only.
   - Each string a recommendation_id from the ID Registry.
   - No duplicates.
   - No preamble, no commentary, no markdown code fences.

7. **What NOT to do:**
   - Do NOT include match strength.
   - Do NOT include rationale.
   - Do NOT include sequencing relations.
   - Do NOT exclude recs based on subjective quality judgments.
   - Do NOT invent recommendation_ids — only use ids that appear in the ID Registry.

The full system prompt goes into `src/lib/orchestrator/stages/stage2a.system.md`.

---

## Implementation Requirements

1. **Module location:** `src/lib/orchestrator/stages/stage2aHardFilter.ts`

2. **Schema location:** `src/lib/orchestrator/schemas/stage2a.types.ts` — defines zod schema for Stage2aResult / Stage2aResultFailed and the inferred TypeScript types. Reuses `StageMetadata` and `AttemptHistoryEntry` from `clientProfile.ts`.

3. **System prompt location:** `src/lib/orchestrator/stages/stage2a.system.md`

4. **Function signature:**

```typescript
export async function runStage2aHardFilter(
  clientProfile: ClientProfile,
  options: Stage2aOptions,
): Promise<Stage2aResult | Stage2aResultFailed>;

export interface Stage2aOptions {
  apiClient: Stage2aApiClient;
  kbPath?: string;
  referenceDate?: Date;
  maxRetries?: number;
}

export interface Stage2aApiClient {
  messages: {
    create: (
      params: Anthropic.MessageCreateParamsNonStreaming,
    ) => Promise<Anthropic.Message>;
  };
}
```

5. **No throws.** All errors caught and returned as Stage2aResultFailed.

6. **System prompt loaded from disk on first call, cached in module scope.** Same loader pattern as Stage 1.

7. **KB files cached in module scope after first load.** They rarely change within a session.

8. **Anthropic call config:**
   - `model: "claude-haiku-4-5"`
   - `max_tokens: 4000`
   - `temperature: 0.0`
   - System prompt with `cache_control: { type: "ephemeral" }`

9. **Cost target: $0.05–$0.15 per call.** Haiku pricing makes this cheap. Fits the cost-budget rationale that drove the 2a-2b decomposition.

10. **Retry pattern matches Stage 1 / Stage 2:**
    - Attempt 1: standard turn
    - On JSON parse failure with retries remaining: append assistant turn (raw response) + user correction turn
    - On schema validation failure with retries remaining: append assistant turn + user correction turn enumerating errors
    - On API error: no automatic retry beyond Anthropic SDK's built-in retry; return `api_error` after one attempt
    - `attempts_made` and `attempt_history` recorded in metadata

---

## Test Requirements

Create `src/lib/orchestrator/stages/__tests__/stage2aHardFilter.test.ts`. Use Node's `node:test` runner.

### Mock test cases

1. **Mock API success — Holloway-shaped ClientProfile** → returns Stage2aResult with `candidate_rec_ids.length` between 30 and 90, every id in the registry, `_metadata.attempt_history.length === 1`, `_metadata.attempt_history[0].outcome === "success"`.

2. **Mock API returns invalid JSON** → returns Stage2aResultFailed with `json_parse_failed`.

3. **Mock API returns rec_id NOT in registry** → schema validation fails with `validation_errors` listing the orphan id.

4. **Mock API returns array of length 12** → schema validation fails with `validation_errors` flagging unusually-low count below the 30-floor.

5. **Mock API returns array of length 110** → schema validation fails (above 90 ceiling).

6. **Mock API success with retry** — first call returns invalid JSON; retry returns valid → returns Stage2aResult with `attempts_made: 2`, `attempt_history.length === 2`, `attempt_history[0].outcome === "json_parse_failed"`, `attempt_history[1].outcome === "success"`.

7. **Mock API returns duplicate rec_ids** → schema validation fails with `duplicate_rec_id` error.

8. **KB file missing** → returns Stage2aResultFailed with `kb_load_failed` and the missing path.

9. **API error (mock 500 response)** → returns Stage2aResultFailed with `api_error`.

10. **Stage flags test** — mock API returns 26 valid ids → result has `_stage_flags.candidate_count_unusually_low: true` but stage succeeds.

11. **Cache pricing fields** — mock API response with cache hit → metadata captures `cache_read_input_tokens > 0`.

### Live API test (skipped without env var)

12. **Live Holloway test, marked `{ skip: !process.env.RUN_LIVE_API_TESTS }`** — placeholder for Phase 4 build. Real Haiku call against the synthetic Holloway ClientProfile. Structural assertions:
    - `candidate_rec_ids.length` between 35 and 75 for PRE-archetype Holloway
    - REC-TAX-001 (Georgia PTET — operating LLC + GA residency) in candidates
    - REC-EST-006 (GRAT — large appreciating asset + transaction window) in candidates
    - At least one charitable rec excluded if Holloway has no philanthropic intent
    - `_metadata.model_used === "claude-haiku-4-5"`

For mock API tests: build a `MockAnthropicClient` with configurable response, mirroring Stage 1's test pattern.

Real Haiku API calls cost ~$0.10. CI runs only when `RUN_LIVE_API_TESTS` is set.

---

## What This Does NOT Do

- Does NOT calibrate match strength. (Stage 2b's job.)
- Does NOT generate `brief_rationale`, `triggers_matched`, or `triggers_partial`. (Stage 2b's job.)
- Does NOT split candidates into selected vs. supplemental. (Stage 2b's job.)
- Does NOT populate sequencing relations. (Stage 2c's job.)
- Does NOT populate landmine status. (Stage 2c's job — read from registry deterministically.)
- Does NOT load full rec files. (Stage 2b loads triggering-condition excerpts; Stage 2c loads sequencing sections. Stage 2a is matrix-only.)
- Does NOT enforce the 30-cap on selected[] (that cap applies post-calibration in 2b).
- Does NOT consume volatile rates, firm policy resolutions, or landmine authorizations.
- Does NOT call other LLM stages or other Stage 2 sub-stages.

---

## V1 Backlog

- **Fallback to Sonnet if Haiku struggles** with the pattern-match task in Phase 4 live testing. The decomposition's cost-efficiency rests on Haiku being adequate; if live runs show structural under-inclusion or hallucinated ids, the implementation can swap to Sonnet 4.6 with minimal change (just the model string and the cost calculation). The cost target shifts to $0.30–0.60 per call in that case, still well below the monolithic Stage 2's failed runs.
- **Cache the KB context block as a separate cache_control block** if Anthropic's caching API allows multi-block caching effectively. v1 caches the system prompt only; the KB context goes in the user turn (cached per the user-turn cache rules). Tunable in Phase 4 based on observed cache-hit rates.
- **Per-archetype prompt variants** if archetype-specific filtering benefits from tighter system-prompt focus (PRE-EXIT-only system prompt, etc.). v1 ships one universal prompt.
