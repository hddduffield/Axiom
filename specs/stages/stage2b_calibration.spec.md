# Stage 2b — Calibration

**Type:** LLM stage. Calls Anthropic API with Opus.

**Purpose:** For each candidate rec_id from Stage 2a, calibrate match strength (`strong` / `borderline` / `speculative`), populate `brief_rationale`, `triggers_matched`, and `triggers_partial`. Drop speculatives. Borderlines split between `selected[]` (keep) and `supplemental_candidates[]` (advisor reviews). NO sequencing relations and NO landmine status — Stage 2c handles those.

**Critical:** Stage 2b is the *judgment* stage. It evaluates fit quality, weighs partial matches, and decides whether each candidate carries enough conviction to enter the plan or should drop to supplemental. The system prompt enforces tight field-length discipline (`brief_rationale` ≤ 80 chars, `triggers_matched` / `triggers_partial` entries ≤ 25 chars each) — these caps are what made the monolithic Stage 2 fail when combined with full sequencing populations; isolating them in 2b keeps the LLM's attention budget focused. With Stage 2a having narrowed the universe to 30–80 candidates and Stage 2c handling sequencing offline, 2b's only job is calibration over a bounded input.

**Origin:** Stage 2b is the second of three sub-stages in the Stage 2 decomposition that replaced the monolithic three-pass design. The archived attempt lives at `specs/stages/_archive/stage2_recommendation_selector_v1_attempt_1.spec.md`.

**Input:**
- clientProfile: ClientProfile (Stage 1 output)
- candidate_rec_ids: string[] (from Stage 2a — typically 30–80 ids)
- options:
  - apiClient: Stage2bApiClient — structural interface satisfied by both the real Anthropic SDK and test mocks
  - kbPath?: string (default `"kb/v1_2/"`)
  - referenceDate?: Date
  - maxRetries?: number (default 1)

**Output:** Stage2bResult on success; Stage2bResultFailed on failure. No throws.

---

## Algorithm

### Step 1 — Lazy-load TRIGGERING CONDITIONS excerpts per candidate

For each rec_id in `candidate_rec_ids`:

1. Resolve to file path via the registry: `kbPath/01_recommendations/{category}/{rec_id}_*.md`. The category-to-directory mapping is encoded in a small lookup (Tax → `tax/`, Estate → `estate/`, Risk & Insurance → `risk_insurance/`, etc.).
2. Read the file.
3. Extract the `## TRIGGERING CONDITIONS` section only. Section ends at the next `## ` heading. Concrete delimiters: header is `## TRIGGERING CONDITIONS` exactly; section ends at the next `## ` line or EOF.
4. Cap each excerpt at 1,500 tokens. Most are 200–800 tokens; a 1,500-token cap is a safety net for outliers (truncate at the cap).

If any candidate file is missing or the TRIGGERING CONDITIONS section is absent: return Stage2bResultFailed with `kb_load_failed` and the offending rec_id.

The full ID Registry (`00_master/02_RECOMMENDATION_ID_REGISTRY.md`) is also loaded — needed for category-name lookup and as a guard against the LLM emitting any rec_id outside the candidate set.

### Step 2 — Build user turn

```
<client_profile>
{ClientProfile JSON}
</client_profile>

<kb_recommendation_id_registry>
{file content}
</kb_recommendation_id_registry>

<candidate_recommendations>
<rec id="REC-TAX-001" category="Tax">
{TRIGGERING CONDITIONS excerpt}
</rec>
<rec id="REC-EST-006" category="Estate">
{TRIGGERING CONDITIONS excerpt}
</rec>
... one per candidate ...
</candidate_recommendations>

For each candidate, calibrate match strength (strong / borderline / speculative) per your system prompt. Populate brief_rationale (≤ 80 chars), triggers_matched (each ≤ 25 chars), and triggers_partial (each ≤ 25 chars). Drop speculatives. Split borderlines between selected[] and supplemental_candidates[]. Do NOT populate sequencing relations or landmine status — those are downstream concerns. Output ONLY the JSON object — no preamble, no commentary, no markdown code fences.
```

User turn token budget at 50 candidates × ~600 tokens per excerpt ≈ 30K tokens, plus ClientProfile (~3K) and Registry (~3.4K). Total user-turn ~37K. Comfortably within Opus's window.

### Step 3 — Call Anthropic API

```typescript
const response = await apiClient.messages.create({
  model: "claude-opus-4-7",
  max_tokens: 16000,
  system: [
    {
      type: "text",
      text: STAGE_2B_SYSTEM_PROMPT,
      cache_control: { type: "ephemeral" },
    },
  ],
  messages: [{ role: "user", content: userTurn }],
  temperature: 0.0,
});
```

**`max_tokens: 16000`** — output is the full Stage2bResult object: 30–80 candidates × structured per-rec record (recommendation_id, category, match_strength, brief_rationale, triggers_matched[], triggers_partial[]) ≈ 6K–12K tokens. 16K provides headroom plus room for `pass_summary` and `_stage_flags`.

**Prompt caching** on the system prompt; user turn is per-call (varies with candidate set).

### Step 4 — Extract response text, parse, validate

Same shape as Stage 1 / Stage 2a:

1. Extract text-block content.
2. JSON parse → on failure with retries remaining, retry with explicit "your previous response was not valid JSON" correction turn.
3. Schema validate (zod) → on failure with retries remaining, retry with validation errors enumerated.
4. After retries exhausted: return Stage2bResultFailed with the appropriate failure_type.

### Step 5 — Schema validation invariants

The zod schema enforces:

- **Domain closure:** every `recommendation_id` in `selected[]`, `supplemental_candidates[]`, and `speculative_dropped[]` is in `candidate_rec_ids` (the input set). No invented ids; no carry-over from outside the candidate set.
- **No duplicates:** a rec_id appears in exactly one of the three arrays. The combined cardinality equals `candidate_rec_ids.length`.
- **Match-strength placement:** `selected[].match_strength` is `"strong"` or `"borderline"`; `supplemental_candidates[].match_strength` is always `"borderline"`; `speculative_dropped[]` entries are speculative by construction (no match_strength field — only `drop_reason`).
- **Field-length caps:**
  - `brief_rationale.length ≤ 80`
  - every entry in `triggers_matched[].length ≤ 25`
  - every entry in `triggers_partial[].length ≤ 25`
- **Selected count cap:** `selected.length ≤ 30`. If the calibration would produce more than 30 strong+borderline-keep, the LLM must move the lowest-conviction ones to `supplemental_candidates[]`. The cap is enforced post-validation; > 30 selected is a schema failure.
- **Borderline policy:** every entry in `selected[]` with `match_strength === "borderline"` must have `triggers_partial.length > 0`. Strong entries may have empty `triggers_partial`.
- **Pass-summary consistency:** `pass_summary` counts agree with array lengths (strong_count = number of selected with match_strength=strong; borderline_selected = selected with match_strength=borderline; etc.).

### Step 6 — Compute stage flags

```typescript
const _stage_flags = {
  selected_count_unusually_small: selected.length < 15,
  selected_count_unusually_large: selected.length > 28,  // approaching the 30 cap
};
```

These flags surface to the harness; they do NOT fail the stage. They pair with the "candidate_count" flags from Stage 2a to give the advisor a sanity check on selection breadth.

### Step 7 — Compute metadata

Build StageMetadata (same shape as Stage 1 / Stage 2a):

- `stage_version`: `"2b-1.0.0"`
- `model_used`: `"claude-opus-4-7"`
- `input_token_count`, `output_token_count`, `cache_creation_input_tokens`, `cache_read_input_tokens` from `response.usage`
- `attempts_made`: 1 or 2
- `attempt_history`: AttemptHistoryEntry[]
- `duration_ms`: cumulative across attempts
- `source_client_profile_hash`: SHA-256 (let the harness verify Stage 2a / 2b consistency if needed)
- `source_candidate_rec_ids_hash`: SHA-256 of the input candidate set (proves which 2a output this 2b consumed)
- `parsed_at`: ISO 8601

### Step 8 — Return Stage2bResult

```typescript
return {
  selected,
  supplemental_candidates,
  speculative_dropped,
  pass_summary,
  _stage_flags,
  _metadata: stageMetadata,
};
```

---

## Output Schema (Stage2bResult)

```typescript
export interface Stage2bResult {
  selected: SelectedRecommendationCalibrated[];           // strong + selected borderline
  supplemental_candidates: SupplementalCandidate[];       // unselected borderline
  speculative_dropped: SpeculativeDropped[];

  pass_summary: {
    candidates_in: number;                                // matches input candidate_rec_ids.length
    strong_count: number;
    borderline_selected: number;
    borderline_supplemental: number;
    speculative: number;
  };

  _stage_flags: {
    selected_count_unusually_small: boolean;              // < 15
    selected_count_unusually_large: boolean;              // > 28 (approaching 30 cap)
  };

  _metadata: StageMetadata;
}

export interface SelectedRecommendationCalibrated {
  recommendation_id: string;
  category: RecommendationCategory;
  match_strength: "strong" | "borderline";
  brief_rationale: string;                                // ≤ 80 chars
  triggers_matched: string[];                             // each ≤ 25 chars
  triggers_partial: string[];                             // each ≤ 25 chars; populated for borderline; may be empty for strong
  // NO sequencing relations — Stage 2c populates
  // NO landmine fields — Stage 2c populates from registry
}

export interface SupplementalCandidate {
  recommendation_id: string;
  category: RecommendationCategory;
  match_strength: "borderline";                           // always borderline; strong goes to selected
  reason_supplemental: string;                            // why included as candidate but not in selected[]
  brief_rationale: string;                                // ≤ 80 chars
  triggers_matched: string[];                             // each ≤ 25 chars
  triggers_partial: string[];                             // each ≤ 25 chars
}

export interface SpeculativeDropped {
  recommendation_id: string;
  drop_reason: string;                                    // ≤ 120 chars
}

export interface Stage2bResultFailed {
  _stage_status: "FAILED";
  _failure_type:
    | "json_parse_failed"
    | "schema_validation_failed"
    | "api_error"
    | "max_retries_exceeded"
    | "kb_load_failed"
    | "candidate_excerpt_missing";
  _failure_reason: string;
  _failure_context: {
    parse_error?: string;
    validation_errors?: string[];
    raw_response?: string;
    parsed_response?: unknown;
    api_error?: string;
    missing_rec_id?: string;
    missing_section_for_rec_id?: string;
    attempts_made: number;
  };
  _metadata: Partial<StageMetadata>;
}
```

`SupplementalCandidate` here augments the version sketched in the archived monolith spec by carrying `category`, `triggers_matched`, and `triggers_partial` — so a supplemental can be promoted by Stage 2c without re-fetching context. Stage 2c may promote a supplemental to selected[] if a sequencing relation requires it; the augmented payload makes that promotion lossless.

---

## System Prompt

The Stage 2b system prompt is mid-sized (~5,000 words) and judgment-heavy. Critical sections:

1. **Role and goal:** "You are Stage 2b of an automated financial planning pipeline. Stage 2a has narrowed the rec universe to a candidate set. For each candidate, calibrate match strength: strong, borderline, or speculative. Provide a tight rationale and concise trigger lists. Do NOT populate sequencing relations or landmine status — those are downstream concerns."

2. **Match strength rubric** with concrete examples:
   - **strong:** Clear fit. All triggering criteria firmly present. Recommendation will materially benefit this client. Examples for Holloway: REC-TAX-001 (Georgia PTET — operating LLC + GA residency + meaningful K-1), REC-EST-006 (GRAT — large appreciating asset + transaction window).
   - **borderline:** Partial fit. Some triggering criteria present but not all, OR criteria present but benefit is modest. Two further sub-decisions: keep in `selected[]` if the partial-fit case is still worth pursuing; move to `supplemental_candidates[]` if the advisor should review before pursuing. Example keep: REC-CHR-001 (DAF) for a client with charitable intent but small AGI. Example supplemental: REC-RET-005 (Roth conversion) when high marginal rate makes conversion economically unappealing — surface for advisor review.
   - **speculative:** Theoretical fit only. Triggering criteria implied but not confirmed in ClientProfile. Drop entirely (into `speculative_dropped[]` for audit trail). Example: REC-FAM-005 (529 plans — children mentioned but no education planning context); REC-INV-009 (private equity — liquidity available but no expressed appetite for alts).

3. **Field-length discipline (load-bearing):**
   - `brief_rationale` ≤ 80 chars. The system prompt instructs: "Lead with the trigger that matters most. No hedge phrases. No 'this client could benefit' filler."
   - `triggers_matched` / `triggers_partial` entries ≤ 25 chars each. Examples: `"GA residency"`, `"K-1 income $4M+"`, `"transaction window 12-18 mo"`.
   - These caps are tight on purpose. The LLM is instructed not to "borrow" length from one entry to another (concatenating into a single 100-char trigger is a violation).

4. **Selected count cap:** `selected.length ≤ 30`. If calibration produces > 30 strong+borderline-keep, move the weakest borderlines to `supplemental_candidates[]` until the cap holds. Do not promote a supplemental to bring the count up — leave selected smaller if natural.

5. **Borderline placement decision rubric:**
   - Keep in `selected[]` if: the partial fit reflects something meaningful the advisor will want to discuss in the plan, AND `triggers_partial` is short and addressable.
   - Move to `supplemental_candidates[]` if: the partial fit is speculative-adjacent, OR the rec depends on advisor judgment about a client preference not stated in ClientProfile, OR the partial-fit case would crowd out higher-conviction recs.

6. **What NOT to do:**
   - Do NOT invent recommendation_ids — only use ids from the candidate set.
   - Do NOT exceed field-length caps. Truncating mid-word is preferable to spilling over.
   - Do NOT exceed selected count of 30.
   - Do NOT populate sequencing relations (must_come_after, sequenced_with, etc.) — those fields don't exist on `SelectedRecommendationCalibrated`.
   - Do NOT mark landmines or set landmine_status — Stage 2c reads landmine status from the registry deterministically.
   - Do NOT include any speculative recs in `selected[]` or `supplemental_candidates[]` — speculatives go to `speculative_dropped[]`.

7. **Output format strict:** JSON only, schema reproduced, no preamble, no fences.

8. **Examples:** 2–3 worked examples — a strong rec with full rationale + triggers; a borderline kept in selected; a borderline moved to supplemental; a speculative dropped — to anchor the field-length and rubric expectations.

The full system prompt goes into `src/lib/orchestrator/stages/stage2b.system.md`.

---

## Implementation Requirements

1. **Module location:** `src/lib/orchestrator/stages/stage2bCalibration.ts`

2. **Schema location:** `src/lib/orchestrator/schemas/stage2b.types.ts` — defines zod schema for Stage2bResult / Stage2bResultFailed and the inferred TypeScript types. Reuses `StageMetadata`, `AttemptHistoryEntry`, `RecommendationCategory` from existing schema modules.

3. **System prompt location:** `src/lib/orchestrator/stages/stage2b.system.md`

4. **Function signature:**

```typescript
export async function runStage2bCalibration(
  clientProfile: ClientProfile,
  candidateRecIds: string[],
  options: Stage2bOptions,
): Promise<Stage2bResult | Stage2bResultFailed>;

export interface Stage2bOptions {
  apiClient: Stage2bApiClient;
  kbPath?: string;
  referenceDate?: Date;
  maxRetries?: number;
}

export interface Stage2bApiClient {
  messages: {
    create: (
      params: Anthropic.MessageCreateParamsNonStreaming,
    ) => Promise<Anthropic.Message>;
  };
}
```

5. **No throws.** All errors caught and returned as Stage2bResultFailed.

6. **System prompt loaded from disk on first call, cached in module scope.**

7. **TRIGGERING CONDITIONS excerpts loaded per call** (lazy from rec files based on `candidateRecIds`). The full ID Registry IS module-scope cached.

8. **Anthropic call config:**
   - `model: "claude-opus-4-7"`
   - `max_tokens: 16000`
   - `temperature: 0.0`
   - System prompt with `cache_control: { type: "ephemeral" }`

9. **Cost target: $0.80–$1.50 per call.** Opus pricing × ~37K input + ~10K output. Combined with Stage 2a's $0.05–$0.15, the total Stage 2 cost lands at $0.85–$1.65, well under the $1.50–$2.50 architectural target and dramatically under the monolithic Stage 2's failed $5+ runs.

10. **Retry pattern matches Stage 1 / Stage 2a.**

11. **Rec-file excerpt parser:** small utility in `src/lib/orchestrator/utils/recFileSections.ts` (Phase 4 work) that given a rec file path and section header returns the section body. Stage 2b uses it for TRIGGERING CONDITIONS; Stage 2c will use it for SEQUENCING DEPENDENCIES; Stage 3a will use it for IMPLEMENTATION STEPS. Single utility, three consumers — kept DRY.

---

## Test Requirements

Create `src/lib/orchestrator/stages/__tests__/stage2bCalibration.test.ts`. Use Node's `node:test` runner.

### Mock test cases

1. **Mock API success — Holloway-shaped ClientProfile + candidate set of 50 ids** → returns Stage2bResult with all schema invariants holding (domain closure, no duplicates, field-length caps, selected ≤ 30, pass_summary consistent).

2. **Mock API returns invalid JSON** → Stage2bResultFailed with `json_parse_failed`.

3. **Mock API returns `selected[]` with rec_id NOT in candidate set** → schema validation fails with `orphan_recommendation_id`.

4. **Mock API returns same rec_id in both `selected[]` and `supplemental_candidates[]`** → schema validation fails with `duplicate_classification`.

5. **Mock API returns `selected.length === 35`** → schema validation fails with `selected_count_exceeds_cap`.

6. **Mock API returns `brief_rationale` of 95 chars** → schema validation fails with `field_length_exceeded`.

7. **Mock API returns `triggers_matched` entry of 35 chars** → schema validation fails.

8. **Mock API success with retry** — first call returns invalid JSON; retry returns valid → Stage2bResult with `attempts_made: 2`, `attempt_history` populated correctly.

9. **Mock API returns sequencing relations on a SelectedRecommendationCalibrated** → schema validation fails (those fields are not part of the 2b schema; presence is a violation).

10. **Mock API returns landmine_status field** → schema validation fails (Stage 2c populates landmine).

11. **Candidate rec file missing TRIGGERING CONDITIONS section** → Stage2bResultFailed with `candidate_excerpt_missing` and the offending rec_id.

12. **Candidate rec_id with file not found** → Stage2bResultFailed with `kb_load_failed`.

13. **API error (mock 500 response)** → Stage2bResultFailed with `api_error`.

14. **Stage flags test** — mock API returns 12 selected → result has `_stage_flags.selected_count_unusually_small: true`.

15. **Borderline-without-triggers_partial** — mock API returns selected entry with `match_strength: "borderline"` and `triggers_partial: []` → schema validation fails with `borderline_missing_partial_triggers`.

### Live API test (skipped without env var)

16. **Live Holloway test, marked `{ skip: !process.env.RUN_LIVE_API_TESTS }`** — placeholder. Synthetic Holloway ClientProfile + candidate set produced by the live Stage 2a Holloway test (or hand-authored fixture). Real Opus call. Structural assertions:
    - `selected.length` between 18 and 28
    - REC-TAX-001 in selected with `match_strength: "strong"`
    - REC-EST-006 in selected with `match_strength: "strong"`
    - At least 3 entries in `pass_summary.strong_count`
    - All `brief_rationale` entries ≤ 80 chars
    - `_metadata.attempts_made` ≥ 1

For mock API tests: build a `MockAnthropicClient` matching Stage 1's pattern.

---

## What This Does NOT Do

- Does NOT walk the full 130-rec universe. (Stage 2a's job; Stage 2b operates over Stage 2a's output.)
- Does NOT populate sequencing relations. (Stage 2c's job.)
- Does NOT populate landmine status. (Stage 2c reads from registry deterministically.)
- Does NOT load full rec files. Only the TRIGGERING CONDITIONS section per candidate.
- Does NOT consume volatile rates, firm policy resolutions, or landmine authorizations.
- Does NOT call other LLM stages or other Stage 2 sub-stages.
- Does NOT enforce hard exclusions on its own — Stage 2a already filtered hard disqualifiers; Stage 2b weighs partial fits.

---

## V1 Backlog

- **Field-length discipline tuning** — the 80/25 caps are derived from the monolithic Stage 2's failure modes. Phase 4 live testing may justify relaxing to 100/30 if the LLM systematically truncates meaningful information; or tightening to 60/20 if the schema validation passes but the prose is verbose. Tunable via the schema constants.
- **Per-archetype calibration prompt variants** — PRE-EXIT calibration may benefit from emphasis on transaction-window urgency; POST-EXIT from emphasis on liquidity allocation. v1 ships one universal prompt.
- **Streaming / partial-result UI hooks** — Stage 2b is the longest sub-stage in the decomposition (~10–25s typical Opus latency). Phase 6 UI work may want to surface candidate-by-candidate calibration progress; the schema is amenable but v1 returns the full object atomically.
- **Lazy excerpt batching** — at very large candidate sets (>70), the user-turn token budget could approach Opus's input limits. v1.5 may shard 2b across two calls (e.g., first half candidates, second half) with a deterministic merge step. v1 single-call covers normal cases.
