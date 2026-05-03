# Stage 5 — Coherence Auditor

**Type:** Hybrid stage. Deterministic-first checks (no LLM) followed by a single LLM call (Claude Opus 4.7) for subjective audits. One invocation per plan.

**Purpose:** Take Stage 4's `Stage4Result` and audit it for contradictions, broken references, missing data, voice drift, and compliance hygiene before the plan reaches advisor review. Stage 5 is **flag-only** — it surfaces findings; it does NOT auto-fix or trigger Stage 4 regeneration. The advisor (or a future workflow tool) decides what to do with each finding.

**Critical:** Stage 4 produces the artifact the client reads verbatim. Stage 5 is the last automated check before that artifact reaches a human reviewer. A finding Stage 5 misses ships to the advisor's review queue, and from there to the client. Stage 5's job is high-recall on real issues + low-noise on false positives — a noisy auditor is one whose findings are ignored.

**Origin:** Stage 5 is a quality gate, not a generation stage. It's the only stage in the pipeline that operates on a fully-assembled plan; everything before it operates on structured fragments. The hybrid architecture splits checks into two paths so we don't burn LLM tokens on issues a regex can find.

**Input:**
- `stage4Result: Stage4Result | Stage4ResultFailed` — the plan to audit. If `Stage4ResultFailed`, Stage 5 fails fast (no audit possible).
- `quantifiedRecommendations: QuantifiedRecommendations` — Stage 3a output, used for cross-check (Top 5 ranking, number-presence audit, Decisions Needed completeness).
- `clientProfile: ClientProfile` — Stage 1 output, used for archetype-gating verification.
- `options`:
  - `apiClient: Stage5ApiClient` (real Anthropic SDK in production; mock in tests)
  - `kbPath?: string` — default `"kb/v1_2/"`
  - `maxRetries?: number` — default 1
  - `runLlmChecks?: boolean` — default `true`. When false, Stage 5 returns deterministic-only findings (cheaper, useful for rapid iteration on Stage 4 prose). Future hook for a "fast audit" mode.

**Output:** `Stage5Result` on success; `Stage5ResultFailed` on failure. No throws.

---

## Audit categories

Stage 5 runs 16 audit categories: **10 deterministic** (cheap, fast, no LLM) + **6 LLM-based** (subjective, need whole-plan reasoning). Deterministic checks run first; LLM checks see the deterministic findings as part of the auditor's user turn so the LLM doesn't re-discover them.

### Deterministic checks (DC.1 – DC.10)

| ID | Check | Source of truth | Severity |
|---|---|---|---|
| **DC.1** | Cross-reference resolution | Every `cross_references[].target_section_id` in `recommendations_business` and `recommendations_personal` must resolve to a real section ID | critical (unresolved ref breaks reader navigation) |
| **DC.2** | Implementation Roadmap action coverage | Every `action_item.action_item_id` referenced in `implementation_roadmap.groups[*].rows[*].source_action_item_id` must exist in `quantifiedRecommendations.recommendations[*].action_items[*]` | critical (orphan reference) |
| **DC.3** | Top 5 Priorities consistency | `executive_summary.top_priorities` rank-ordering + impact figures must match `buildTopFivePriorities(quantifiedRecommendations)` deterministic output | warning (LLM rephrased descriptors are OK; rank or impact mismatch is not) |
| **DC.4** | Decisions Needed completeness | Every rec where `decisions_needed === true` OR `quantified_impact.pending_reconciliation === true` (in QR) must surface in `decisions_needed.rows[*].source_recommendation_id` | critical (advisor misses a pending decision) |
| **DC.5** | Glossary alignment | Every term in `glossary.entries[*]` must appear at least once in LLM-generated prose (Stage 4's auto-extraction guarantees this; DC.5 is a regression sanity check) | info (Stage 4 builder regression indicator) |
| **DC.6** | Section presence | All 14 expected section IDs present (T, ES, OP, CS, GP, FO, RB.1–RB.7, RP.8–RP.12, IR, DN, AT, MC, GL, DS) in the assembled output. Recommendation sections must use unique section IDs within their lens. | critical (incomplete plan) |
| **DC.7** | Archetype-gating consistency | `[OPTIONAL — included because of pre-transaction posture]` sections only present when `clientProfile.engagement.archetype === "PRE"`. `[PERSONAL — for owner(s)]` only on RP.* sections. | critical (gating violation = wrong content for engagement type) |
| **DC.8** | Number presence | Every Stage 3a `quantified_impact.estimate.value` (State A recs) must appear at least once in plan prose (LLM_sections combined). Allows narrowing of ranges + "approximately X" rephrasing; flags hard misses. | warning (Stage 4 dropped a Stage 3a-computed figure) |
| **DC.9** | Compliance hygiene | `title_page.prepared_by_name`, `title_page.compliance_tracking_id`, and `disclosures.body_paragraphs[]` all populated (non-empty). `compliance_tracking_id` matches `PSA-YYYY-MMDD-<NAME>-NNN` format. | critical (compliance prerequisite for advisor delivery) |
| **DC.10** | Action item lifecycle integrity | For every `action_item` in QR: `duration_class === "long_running"` ⇔ `check_in_cadence !== null` ⇔ `auto_generated_reminder_template !== null`. Stage 3a invariant; DC.10 is a regression sanity check. | warning (Stage 3a or Stage 4 builder regression indicator) |

### LLM checks (LC.1 – LC.6)

| ID | Check | Why LLM (not deterministic) |
|---|---|---|
| **LC.1** | Voice consistency between Pass 1 (RB) and Pass 2 (RP) sections | Voice is fundamentally subjective; pattern-match on prose can't catch tonal drift or phrasing inconsistency |
| **LC.2** | Numerical contradictions across sections | Stage 4's number-drift detector catches per-rec drift but misses cross-section claims (e.g., Executive Summary says "$5M total impact" but recommendation totals sum to $3.2M) |
| **LC.3** | Strategic coherence — recommendations that contradict each other | E.g., RB.3 recommends "C-Corp conversion for §1202" while RB.4 recommends "preserve S-Corp election." Detecting strategic-level contradictions requires plan-level reasoning. |
| **LC.4** | Findings & Observations alignment with recommendations | Every Strength + Opportunity flagged in FO should tie back to at least one recommendation. Orphaned observations weaken the document. |
| **LC.5** | Cross-section narrative-weaving sanity | When prose says "the cash-flow savings approximately fund the buy/sell premium in Section 4," the cited numbers must roughly match. Subjective phrasing makes this hard to detect with regex. |
| **LC.6** | Voice quality regression vs synthetic Holloway exemplar | Score how closely the prose adheres to the calibration doc's voice rules (strategic-frame-first openings, bold-imperative bullets, numbers-with-assumptions, em-dash qualifiers, partner-coordination language). Holistic 0–100 score. |

---

## Algorithm

Stage 5 runs in three phases. Phase 1 is deterministic checks (cheap; flag-only; can run standalone via `runLlmChecks: false`). Phase 2 is the single LLM audit call (passes deterministic findings into the LLM's user turn so it doesn't re-discover them). Phase 3 merges deterministic + LLM findings into the final `Stage5Result`.

### Phase 1 — Deterministic checks (no LLM)

Each DC.* check produces a structured result that may contribute to one or more `AuditFinding` entries plus a typed shape under `deterministic_checks` for downstream programmatic consumption.

#### Step 1.1 — Input validation

If `stage4Result._stage_status === "FAILED"`, return `Stage5ResultFailed` with `_failure_type: "stage4_input_failed"` immediately. No audit is possible against a failed plan.

#### Step 1.2 — Run DC.1 through DC.10 sequentially

Each check is a pure function `(stage4Result, quantifiedRecommendations, clientProfile) => DeterministicCheckResult`. They have no shared state and could in principle run in parallel; sequential is fine for v1 since they're all O(plan size) and complete in milliseconds.

#### Step 1.3 — Aggregate deterministic findings

Each DC.* check returns a `DeterministicCheckResult` shape that the harness merges into:

```typescript
deterministic_checks: {
  DC1_unresolved_cross_refs: UnresolvedCrossRefFinding[];
  DC2_roadmap_orphans: { source_action_item_id: string; absent_from: "qr" }[];
  DC3_top5_mismatch: { mismatched_ranks: number[]; deterministic: TopPriorityRow[]; emitted: TopPriorityRow[] } | null;
  DC4_missing_decisions: string[]; // rec_ids missing from DN
  DC5_unused_glossary: string[];
  DC6_missing_sections: string[];
  DC7_archetype_violations: { section_id: string; label: string; reason: string }[];
  DC8_unused_numbers: { rec_id: string; expected_value: string }[];
  DC9_compliance_issues: string[];
  DC10_lifecycle_violations: { action_item_id: string; rule: string }[];
}
```

Deterministic findings are also serialized into `AuditFinding[]` entries (same `findings` array the LLM contributes to in Phase 2) so a downstream consumer can iterate one list rather than 16 distinct shapes.

### Phase 2 — Single LLM audit call (tool-use enforcement)

Mirrors the Stage 3a.1 / Stage 4 architecture: `messages.stream()` with forced `tool_choice` on `submit_audit_findings`. The tool's `input_schema` is generated via Zod 4 native `z.toJSONSchema()` from `Stage5LlmRawOutputSchema`.

Skipped entirely when `runLlmChecks: false`. In that case Phase 3 produces a Stage5Result whose `llm_assessment` field is `null` (typed) and the `findings` array contains only deterministic entries.

#### Step 2.1 — Pre-flight context check

Two-tier (chars/4 fast-fail at 30K, count_tokens at 100K). Stage 5's input is much smaller than Stage 4's because the plan itself is only ~30–60K real tokens (no QR + no voice cal + no full ClientProfile in the user turn). count_tokens API is still called for accuracy and to keep parity with Stage 4's pre-flight discipline.

#### Step 2.2 — Build user turn

```
<voice_calibration_summary>
{condensed voice rules — the "do this / don't do this" section from voice calibration §9; ~1K tokens}
</voice_calibration_summary>

<plan>
{Stage4Result, JSON-serialized; ~20–40K tokens depending on plan size}
</plan>

<deterministic_findings>
{Phase 1 output — JSON-serialized DeterministicChecks shape; ~2–5K tokens for typical Holloway-scale findings}
</deterministic_findings>

<archetype_gating>
archetype: PRE
include_optional_pre_transaction: true
</archetype_gating>

Audit this plan per your system prompt. Surface findings via the submit_audit_findings tool. Deterministic findings are already populated; focus your LLM-only effort on LC.1–LC.6.
```

The voice calibration is loaded as a SUMMARY (the do/don't rules + the State A/B/C/D translation patterns) — not the full 243-line doc — to keep Stage 5's user turn cheap. Stage 5 doesn't need the verbatim voice samples; it needs the rules to score against.

#### Step 2.3 — Tool definition

```typescript
const submitAuditFindingsTool = {
  name: "submit_audit_findings",
  description: "Submit the audit findings + holistic assessment for this plan. Call exactly once.",
  input_schema: STAGE5_TOOL_INPUT_SCHEMA,
};
```

API call config:

```typescript
const stream = apiClient.messages.stream({
  model: "claude-opus-4-7",
  max_tokens: 8000,  // audit findings are short; 8K is generous
  system: [
    { type: "text", text: STAGE5_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
  ],
  messages: [{ role: "user", content: userTurn }],
  tools: [submitAuditFindingsTool],
  tool_choice: { type: "tool", name: "submit_audit_findings" },
});
const response = await stream.finalMessage();
```

`max_tokens: 8000` — Stage 5 output is bounded: at most 30–50 findings + holistic assessment + score. 8K leaves comfortable headroom. The truncation-abort guard from Phase 3.1c discipline still applies.

#### Step 2.4 — Truncation-abort guard

If `response.usage.output_tokens >= MAX_TOKENS`, abort retry with `_failure_type: "context_overflow"` and message *"Audit output truncated at MAX_TOKENS=8000; the auditor surfaced more findings than the per-call ceiling. Reduce plan scope or split audit by lens."* No retry — same input + same cap reproduces the truncation.

#### Step 2.5 — Extract tool_use input + schema validation

Same defensive path as Stage 3a.1 / Stage 4. Tool_use block missing → `schema_validation_failed`. Zod schema fails → retry with errors enumerated.

### Phase 3 — Merge + finalize

#### Step 3.1 — Merge deterministic + LLM findings

The LLM's `findings[]` array is appended to the deterministic findings. Each finding gets a stable `finding_id` (auto-assigned in order). Sort by severity (critical first, then warning, then info), then by category, then by section_id for deterministic ordering.

#### Step 3.2 — Compute overall assessment

```typescript
type OverallAssessment = "ship_ready" | "review_recommended" | "regenerate_recommended";
```

Heuristic (subject to tuning):

- `regenerate_recommended` — any of: ≥ 1 critical finding from DC.1/DC.2/DC.4/DC.6/DC.7/DC.9, OR LLM `voice_consistency_score < 60`, OR LLM detected ≥ 3 strategic contradictions (LC.3)
- `review_recommended` — any of: 1–2 critical findings (excluding DC.5 / DC.10 which are sanity checks), OR ≥ 5 warnings, OR LLM `voice_consistency_score < 80`, OR LLM detected ≥ 1 strategic contradiction
- `ship_ready` — otherwise

The LLM is encouraged to emit its own `overall_assessment` value in the tool input; the harness checks consistency and uses the harness-computed value as authoritative. Mismatches surface in `_flags.assessment_disagreement`.

#### Step 3.3 — Compute metadata

Mirrors Stage 4's metadata pattern — token counts, cost_cents, attempt_history, source hashes (Stage4Result hash + ClientProfile hash + QR hash).

#### Step 3.4 — Return Stage5Result

```typescript
return {
  findings: [...sortedFindings],
  deterministic_checks: { ... },
  llm_assessment: { ... } | null,  // null when runLlmChecks: false
  overall_assessment: "ship_ready" | "review_recommended" | "regenerate_recommended",
  _flags: { ... },
  _metadata: stageMetadata,
};
```

---

## Output Schema

Lives in `src/lib/orchestrator/schemas/stage5.types.ts` (zod). Inferred TypeScript types exported alongside.

```typescript
type SeverityLevel = "critical" | "warning" | "info";

type AuditCategory =
  | "DC1_unresolved_cross_refs"
  | "DC2_roadmap_orphans"
  | "DC3_top5_mismatch"
  | "DC4_missing_decisions"
  | "DC5_unused_glossary"
  | "DC6_missing_sections"
  | "DC7_archetype_violations"
  | "DC8_unused_numbers"
  | "DC9_compliance_issues"
  | "DC10_lifecycle_violations"
  | "LC1_voice_consistency"
  | "LC2_numerical_contradictions"
  | "LC3_strategic_coherence"
  | "LC4_findings_alignment"
  | "LC5_narrative_weaving"
  | "LC6_voice_quality";

type SuggestedAction =
  | "regenerate_section"
  | "regenerate_plan"
  | "hand_edit"
  | "verify_with_advisor"
  | "informational_only";

interface AuditFinding {
  finding_id: string;            // auto-assigned: "F-001", "F-002", etc.
  severity: SeverityLevel;
  category: AuditCategory;
  section_ids: string[];          // Stage 4 section IDs affected (T / ES / OP / ... / DS)
  description: string;            // 1-3 sentence explanation
  evidence: string;               // verbatim prose excerpt OR structured data dump that triggered the finding (≤ 500 chars)
  suggested_action: SuggestedAction;
}

interface DeterministicChecks {
  DC1_unresolved_cross_refs: UnresolvedCrossRefFinding[];
  DC2_roadmap_orphans: { source_action_item_id: string; absent_from: "qr" }[];
  DC3_top5_mismatch: TopFiveMismatch | null;
  DC4_missing_decisions: string[];
  DC5_unused_glossary: string[];
  DC6_missing_sections: string[];
  DC7_archetype_violations: { section_id: string; label: string; reason: string }[];
  DC8_unused_numbers: { rec_id: string; expected_value: string }[];
  DC9_compliance_issues: string[];
  DC10_lifecycle_violations: { action_item_id: string; rule: string }[];
}

interface LlmAssessment {
  voice_consistency_score: number;       // 0-100
  contradiction_count: number;           // strategic + numerical, sum from LC.2 + LC.3
  llm_overall_assessment: "ship_ready" | "review_recommended" | "regenerate_recommended"; // LLM's vote
}

interface Stage5Flags {
  assessment_disagreement: boolean;      // harness-computed vs LLM-emitted overall_assessment differ
  llm_skipped: boolean;                  // runLlmChecks: false at invocation
  unresolved_findings_count: number;     // findings emitted but no clear suggested_action
}

interface Stage5Metadata extends StageMetadata {
  cost_cents: number;
  source_stage4_result_hash: string;
  source_quantified_recommendations_hash: string;
  source_client_profile_hash: string;
}

interface Stage5Result {
  findings: AuditFinding[];                                      // merged deterministic + LLM
  deterministic_checks: DeterministicChecks;
  llm_assessment: LlmAssessment | null;                          // null when runLlmChecks: false
  overall_assessment: "ship_ready" | "review_recommended" | "regenerate_recommended";  // harness-computed (authoritative)
  _flags: Stage5Flags;
  _metadata: Stage5Metadata;
}

interface Stage5ResultFailed {
  _stage_status: "FAILED";
  _failure_type:
    | "stage4_input_failed"          // input was Stage4ResultFailed
    | "kb_load_failed"
    | "schema_validation_failed"
    | "api_error"
    | "max_retries_exceeded"
    | "context_overflow";
  _failure_reason: string;
  _failure_context: {
    validation_errors?: string[];
    raw_response?: string;
    parsed_response?: unknown;
    api_error?: string;
    attempts_made: number;
    estimated_input_tokens?: number;
  };
  _metadata: Partial<Stage5Metadata>;
}
```

---

## System Prompt

`src/lib/orchestrator/stages/stage5.system.md` (~150–250 lines). Sections:

1. **Role and goal:** "You are Stage 5 of an automated financial planning pipeline at PSA Wealth. You audit a fully-assembled plan for contradictions, voice drift, narrative weaving sanity, and strategic coherence — issues a regex can't catch. Your output is **flag-only**: you surface findings; the advisor decides what to do with them. Do not propose rewrites; do not auto-fix."

2. **Submission protocol:** "Submit findings via `submit_audit_findings` exactly once. Each finding has a severity, category, affected section IDs, description, evidence, and suggested action. Be specific about evidence — quote verbatim where possible."

3. **What deterministic checks already cover:** Brief list of DC.1–DC.10 so the LLM knows not to re-discover them. The user turn includes the deterministic findings; the LLM acknowledges them but focuses its effort on LC.1–LC.6.

4. **Per-LC-check rubric:**
   - **LC.1 voice consistency:** compare RB.* vs RP.* prose; look for tonal drift, pronoun-discipline lapses, bullet-pattern divergence. Sample 2–3 sections from each lens.
   - **LC.2 numerical contradictions:** scan for cross-section claim mismatches. Pay special attention to Executive Summary's "What this means" closer aggregating across recommendations.
   - **LC.3 strategic coherence:** flag recommendation pairs that work against each other. Common patterns: entity-form contradictions (S-Corp vs C-Corp), gifting strategy collisions (GRAT term + IDGT timing), insurance double-coverage.
   - **LC.4 findings alignment:** every Strength + Opportunity in FO should connect to ≥ 1 recommendation. Orphaned observations are flagged.
   - **LC.5 narrative weaving:** when prose makes a connecting claim ("the cash-flow savings fund the buy/sell premium"), verify the cited numbers approximately match.
   - **LC.6 voice quality regression:** holistic 0–100 score against the synthetic Holloway exemplar's voice characteristics. The voice calibration summary in `<voice_calibration_summary>` is the rubric.

5. **Severity guidance:**
   - **critical** = ships broken to client; advisor must address
   - **warning** = quality issue; advisor should review but plan is shippable
   - **info** = sanity-check or stylistic note; rarely actionable

6. **Suggested-action guidance:**
   - **regenerate_plan** = the whole Stage 4 invocation is unusable
   - **regenerate_section** = a single recommendation section needs rework
   - **hand_edit** = a specific sentence or paragraph needs human revision
   - **verify_with_advisor** = the issue is fact-dependent; advisor checks against external knowledge
   - **informational_only** = no action required; recorded for telemetry

7. **What NOT to flag:**
   - Stylistic preferences ("could have been more concise")
   - Voice variations within the calibration doc's tolerance
   - Numbers within the soft-drift band Stage 4's drift detector already permits
   - Anything already in `<deterministic_findings>` (skip re-discovery)

8. **Final reminder:** "Audit findings only. Do not produce prose outside the tool call. The advisor reviews your findings; you don't fix the plan."

---

## Implementation Requirements

1. **Module location:** `src/lib/orchestrator/stages/stage5CoherenceAuditor.ts`

2. **Schema location:** `src/lib/orchestrator/schemas/stage5.types.ts`

3. **System prompt location:** `src/lib/orchestrator/stages/stage5.system.md`

4. **Voice calibration summary:** A condensed version of `specs/stages/stage4_voice_calibration.md` Sections 8 + 9 (style rules + do/don't rules) loaded as a user-turn block. Cached at module scope. ~1K tokens.

5. **Function signature:**

```typescript
export async function auditPlan(
  stage4Result: Stage4Result | Stage4ResultFailed,
  quantifiedRecommendations: QuantifiedRecommendations,
  clientProfile: ClientProfile,
  options: Stage5Options,
): Promise<Stage5Result | Stage5ResultFailed>;
```

6. **No throws.** All errors caught and returned as `Stage5ResultFailed`.

7. **Anthropic call config:**
   - `model: "claude-opus-4-7"`
   - `max_tokens: 8000`
   - `temperature` not set (deprecated for Opus 4.7)
   - System prompt loaded from disk at module load and cached.
   - Streaming via `messages.stream()`; `await stream.finalMessage()`.
   - `tools: [submitAuditFindingsTool]`, `tool_choice: { type: "tool", name: "submit_audit_findings" }`.

8. **Stage5ApiClient interface** (mirrors Stage4ApiClient):

```typescript
export interface Stage5ApiClient {
  messages: {
    stream: (params: Anthropic.MessageCreateParamsNonStreaming) => Stage5MessageStream;
    countTokens: (params: Anthropic.MessageCountTokensParams) => Promise<Anthropic.MessageTokensCount>;
  };
}
```

9. **JSON Schema generation:** `z.toJSONSchema(Stage5LlmRawOutputSchema)` with `allOf` + `if/then` injection for cross-field rules (e.g., `severity: "info"` should not pair with `suggested_action: "regenerate_plan"`).

10. **Truncation-abort guard** at top of retry-loop attempt body.

11. **Pre-flight context check:** chars/4 fast-fail at 30K + count_tokens at 100K.

12. **Cost target:** $3–5 per audit at Opus 4.7 pricing (input ~30–50K, output ~3–5K, cache_creation on first invocation).

13. **Live runner script:** `scripts/runStage5LiveValidation.ts` follows the artifact-first-write pattern. Hard budget cap: $15 per run.

---

## Test Requirements

Create `src/lib/orchestrator/stages/__tests__/stage5CoherenceAuditor.test.ts`. Mirror the Stage 4 mock pattern: mock client with `messages.stream` returning a `MessageStream`-shape mock, supporting `tool_use_explicit` and `text_only` kinds; mock `countTokens` returning a fake real-token count well under 100K.

### Mock test cases (always-on)

1. **Mock success path:** realistic Stage 4 input → `Stage5Result` with merged deterministic + LLM findings; `overall_assessment` populated; metadata includes attempt history.

2. **tool_use response correctly extracted:** verify Pass behaves like Stage 4's tool-use plumbing — request has `tools[]` and `tool_choice` forced.

3. **Schema validation failure on first attempt → retry succeeds:** mirrors Stage 4 retry pattern.

4. **Schema validation failure on both attempts → max_retries_exceeded.**

5. **Truncation aborts retry loop with context_overflow:** `output_tokens >= MAX_TOKENS=8000` → no retry.

6. **api_error returns api_error.**

7. **Stage 4 input is Stage4ResultFailed → fail-fast (no LLM call):** `_failure_type: "stage4_input_failed"`; `client.callCount() === 0`.

8. **`runLlmChecks: false` skips LLM call:** result has deterministic findings + `llm_assessment: null`; `client.callCount() === 0`.

9. **DC.1 unresolved cross-refs:** craft a Stage 4 result with a cross-reference targeting a section ID that doesn't exist; assert `findings` includes a critical entry from category `DC1_unresolved_cross_refs`.

10. **DC.2 roadmap orphans:** craft a Stage 4 result whose `implementation_roadmap.groups[*].rows[*].source_action_item_id` references an action_item_id absent from QR; assert critical `DC2_roadmap_orphans` finding.

11. **DC.3 Top 5 mismatch:** craft a Stage 4 result whose `executive_summary.top_priorities` rank-ordering disagrees with `buildTopFivePriorities(QR)`; assert warning finding.

12. **DC.4 missing decisions:** craft a QR with a `decisions_needed: true` rec that is absent from Stage 4's `decisions_needed.rows[*].source_recommendation_id`; assert critical finding.

13. **DC.6 missing sections:** craft a Stage 4 result with `recommendations_business.sections.length < 1` (i.e., no Business sections emitted); assert critical `DC6_missing_sections: ["RB.*"]`.

14. **DC.7 archetype-gating violations:** craft a `clientProfile.engagement.archetype === "POST"` profile with a Stage 4 result that includes a `[OPTIONAL — pre-transaction]` section; assert critical finding.

15. **DC.8 unused numbers:** craft a State A rec with `estimate.value: 148000` whose figure does NOT appear in any prose section; assert warning `DC8_unused_numbers: [{ rec_id, expected_value: "$148,000" }]`.

16. **DC.9 compliance issues:** craft a Stage 4 result with empty `title_page.compliance_tracking_id`; assert critical finding.

17. **Combined deterministic + LLM merge:** mock LLM emits 3 findings; deterministic checks produce 2 findings; result `findings.length === 5`; sorted by severity.

18. **Live API placeholder:** skipped, gated on `RUN_LIVE_API_TESTS`. Will be activated in Step 3 (live ceiling validation).

Total: 17 active mock tests + 1 live placeholder = 18 Stage 5 tests.

---

## What This Does NOT Do

- Does NOT auto-fix issues. Stage 5 is flag-only.
- Does NOT auto-trigger Stage 4 regeneration. The advisor (or future workflow tool) decides.
- Does NOT modify `Stage4Result`. Read-only consumer.
- Does NOT generate prose. Audit findings are short, structured.
- Does NOT validate Stage 3a output (that's Stage 3a's job).
- Does NOT validate ClientProfile shape (that's Stage 1's job).
- Does NOT run mechanical pre-checks (those are a separate layer; if they exist, they run before Stage 4).
- Does NOT compute compliance review signals beyond the DC.9 surface check. Supervisory review is a downstream Plan Delivery service responsibility.
- Does NOT fail-loud on warnings. `overall_assessment === "review_recommended"` does not return `Stage5ResultFailed`; it's a successful audit with findings.

---

## Open Questions Surfaced (require Hayden's call before code build)

1. **Where in the orchestration flow does Stage 5 run?** Spec assumes harness-driven auto-invocation after Stage 4 success. But: should `regenerate_recommended` automatically trigger Stage 4 re-execution, or always require advisor approval? v1 default in this spec: never auto-regenerate; surface for advisor. Confirm.

2. **Voice calibration summary content:** spec calls for a condensed version (~1K tokens). Should we extract just §8 (style rules) + §9 (do/don't rules), or include §6 (State A/B/C/D communication patterns) too? Latter is ~500 more tokens; it's the part the LLM most needs for LC.6 voice quality scoring. Default: include §6 + §8 + §9.

3. **Severity threshold tuning for `overall_assessment`:** the heuristic in Phase 3.2 (≥1 critical from key DCs, etc.) is a starting guess. Real-world calibration needs Holloway audit data. Surface for tuning after Step 3 (live test).

4. **DC.8 number-presence detection:** how exact does the prose match need to be? "approximately $148,000" should match `estimate.value: 148000`; "approximately $150K" should also match (rounded). Use the same range-tolerance heuristic as Stage 4's `detectAllNumbersDrift` (within 5%).

5. **LC.1 voice consistency scoring:** the LLM emits a `voice_consistency_score: number (0-100)`. Without a calibration corpus of "what 80 means vs what 60 means," the score is qualitative. v1 surfaces it as observability; the harness's `overall_assessment` thresholds use it as a signal but treat it as advisory.

6. **Findings dedup:** if both DC.* and LC.* surface the same issue (e.g., DC.1 finds an unresolved cross-ref, LC.5 also notices the cited number doesn't match), do we emit one finding or two? Spec default: emit both with distinct categories, since the underlying causes differ (deterministic = ID resolution; LLM = subjective claim quality). The advisor sees both and can address jointly.

---

## Flagged Decisions (Made During Spec Authoring)

1. **Hybrid architecture (deterministic-first + single LLM call), not pure-LLM.** Deterministic checks are 100x cheaper, deterministic, and catch issues a regex can find without burning Opus tokens. The LLM call adds value where it can: cross-section reasoning, voice quality scoring, strategic coherence. Pure-LLM would burn $5–10 finding things grep can find for free. Pure-deterministic would miss the issues the auditor was added to catch.

2. **Single LLM call** (not multi-pass). Stage 4 needed two passes because output was large (32K+); Stage 5 output is bounded (≤ 8K) and audit reasoning needs whole-plan context. Single-call is cleaner.

3. **`max_tokens: 8000`** for the LLM call. Audit findings are short (1–3 sentences each + holistic score). 30 findings × ~150 tokens = 4.5K; 8K leaves margin. Truncation guard catches edge cases.

4. **Severity taxonomy: critical / warning / info.** Three levels keep the advisor's triage decision simple. More granular (e.g., 1–10 scale) increases noise without improving outcomes.

5. **Overall assessment: ship_ready / review_recommended / regenerate_recommended.** Three states map cleanly to advisor workflow: file it, look at it, redo it. A two-state version (ship/don't ship) loses the middle case where most findings will land.

6. **Harness-computed `overall_assessment` is authoritative; LLM's vote is advisory.** The deterministic findings (DC.* counts, severity) are the primary signal; the LLM's holistic vote can disagree, and that disagreement is itself flagged in `_flags.assessment_disagreement` for telemetry. Prevents the LLM from rubber-stamping a plan with critical DC findings.

7. **Voice calibration loaded as a SUMMARY (not full doc).** The full calibration is 243 lines (~10K tokens). For audit purposes, we need the rules to score against, not the verbatim samples. Condensed version is ~1K tokens. Stage 5's input budget is much tighter than Stage 4's because we don't need QR + ClientProfile.

8. **Stage 5 sees the full Stage 4 plan + Stage 3a's QR + ClientProfile.** Cross-checks (DC.3, DC.4, DC.7, DC.8) need the Stage 3a-side data to validate. Pure plan-only audit would miss Top-5 ranking drift, missing decisions, and unused numbers.

9. **Pre-flight ceiling at 100K real tokens** (vs Stage 4's 165K). Stage 5 input is much smaller — no voice calibration full doc, no full QR (just structured), no full ClientProfile (only archetype + relevant fields). 100K leaves comfortable margin against the 200K context limit with 8K output budget.

10. **`runLlmChecks: false` mode for fast iteration.** Useful when iterating on Stage 4 prose: run deterministic-only audit ($0 cost) to catch mechanical issues quickly. Future hook for a "full audit" vs "quick scan" UI distinction.

11. **AuditFinding `evidence` field capped at 500 chars.** Long evidence dumps bloat output. The advisor's UI can fetch larger context from the source artifact if needed; the finding itself just needs enough to disambiguate.

12. **`Stage5Result` types live in `schemas/stage5.types.ts`** (not `pipelineTypes.ts`). Same pattern as Stage 3a.1 and Stage 4. Keeps cross-stage shared types focused.

---

## V2 Architectural Backlog

- **Per-finding confidence score.** v1 uses severity (3 levels). v2 may add a `confidence: 0-1` field for LLM-emitted findings, capturing the auditor's certainty.
- **Auto-retrigger Stage 4 regeneration.** v1 surfaces `regenerate_recommended` and stops. v2 may wire this into the orchestrator with a max-retry safety bound.
- **Section-level audit subsetting.** v1 audits the whole plan in one call. v2 may add a "audit only RB.* sections" mode for targeted re-audits after a section regeneration.
- **Stage 5 history aggregation.** v1 produces a single audit per plan. v2 may track audit deltas across regenerations to surface "this re-attempt fixed 3 of the 5 prior findings" telemetry.
- **External-knowledge audits.** v1 audits internal coherence. v2 may add fact-check categories that compare prose claims (e.g., "PTET federal savings of $148K") against an external rate database.
- **Voice calibration as zod-validated structured data.** v1 loads calibration as markdown. v2 may parse it into a structured rule set the auditor can reason against more programmatically.
- **Confidence-weighted assessment.** v1's `overall_assessment` is rule-based. v2 may use the LLM's per-finding confidence + severity to compute a scalar quality score that drives the assessment.
- **Detector for the Stage-4 number-drift heuristic's false positives.** Stage 4's `detectAllNumbersDrift` over-pairs in v1 (900 false-positive hard drifts on Holloway). Stage 5 LC.2 should subsume Stage 4's drift detection in v2; Stage 4's drift can become advisory-only.
