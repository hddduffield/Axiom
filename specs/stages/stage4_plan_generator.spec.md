# Stage 4 — Plan Generator

**Type:** LLM stage. Calls Anthropic API (Claude Opus 4.7). Single invocation per plan delivery.

**Purpose:** Take Stage 3a's `QuantifiedRecommendations` envelope plus `ClientProfile` and produce a complete `Stage4Result` carrying all 14 sections of a PSA Wealth financial plan deliverable. Six sections are LLM-generated narrative; eight are deterministic template-driven assemblies. The output is the canonical artifact that downstream PDF rendering consumes — no further synthesis or LLM work modifies it before the client sees it.

**Critical:** Stage 4 is the only stage whose output the client reads verbatim. The prose voice, the recommendation framing, the numbers, the cross-references — all of it lands in front of Marcus and Catherine (and their attorney, CPA, and partner). Schema discipline is necessary but not sufficient; voice and reasoning quality matter as much as structural correctness, and there is no further "polish pass" stage. If Stage 4 emits a sentence that misstates a Stage 3a number, contradicts a recommendation's strategic frame, or breaks the established voice, that artifact is what gets delivered.

**Origin:** Stage 4 is the first prose-generation stage in the pipeline. All upstream stages (1, 2a/b/c, 3a.1, 3a.2, 3b) emit structured data. Stage 4 is where that structured data becomes a document. The voice and structural target was extracted from the synthetic Holloway PDF and codified at `specs/stages/stage4_voice_calibration.md` (243 lines). That calibration document is the canonical voice anchor; Stage 4's system prompt loads it inline.

**Input:**
- `clientProfile: ClientProfile` (Stage 1 output)
- `quantifiedRecommendations: QuantifiedRecommendations` (Stage 3a orchestration output — already merged + cross-batch validated)
- `options`:
  - `apiClient: Anthropic` instance (real SDK in production; mock in tests)
  - `kbPath?: string` — default `"kb/v1_2/"`
  - `referenceDate?: Date` — used for compliance_id and dated boilerplate
  - `firmPolicyResolutions?: FirmPolicyResolution[]` — resolutions applied at Stage 3a; surfaced by Stage 4 in the rationale where relevant
  - `landmineAuthorizations?: LandmineAuthorization[]` — same; Stage 4 references which landmines were authorized
  - `maxRetries?: number` — default 1 (i.e., 2 total attempts)
  - `advisorOverride?: { advisor_id, advisor_full_name, firm_name, supervisory_office }` — used when ClientProfile.engagement.advisor_id is the only thing carried; the full display name and supervisory text aren't in ClientProfile and must come from a directory or this override

**Output:** `Stage4Result` on success; `Stage4ResultFailed` on failure. No throws.

---

## Section taxonomy: LLM-generated vs deterministic

Stage 4 produces 14 sections. The spec splits them into two production paths:

### LLM-generated (6 sections, single tool-use call)

| ID | Section | Word target | Synthetic Holloway page(s) |
|---|---|---|---|
| `executive_summary` | Executive Summary | 350–500 | p2–3 |
| `our_process` | Our Process & What This Document Is | 250–350 | p4 |
| `findings_observations` | Findings & Observations | 500–700 | p8–9 |
| `recommendations_business` | Recommendations — Business (sections 1–7) | 300–700 per rec section | p10–16 |
| `recommendations_personal` | Recommendations — Personal (sections 8–12) | 300–700 per rec section | p17–21 |
| `meeting_cadence_intro` | Meeting Cadence narrative intro | 200–300 | p27 |

### Deterministic (8 sections, template + data fill, no LLM)

| ID | Section | Built from |
|---|---|---|
| `title_page` | Title page | ClientProfile.client_and_family + engagement.advisor_id (+ advisorOverride) + referenceDate + compliance_id |
| `client_snapshot` | Client Snapshot | ClientProfile entities + balance_sheet + income + tax_status + insurance |
| `goals_priorities` | Goals & Priorities | ClientProfile.goals_and_values |
| `implementation_roadmap` | Implementation Roadmap table | QuantifiedRecommendations.recommendations[*].action_items[*] grouped by `timing_bucket` |
| `decisions_needed` | Decisions We Need From You table | recs where `decisions_needed === true` OR `quantified_impact.pending_reconciliation === true` |
| `advisory_team` | Advisory Team table | ClientProfile.existing_advisor_relationships + identified TBDs from ActionItem.partner_required entries |
| `glossary` | Glossary | Auto-extracted from technical terms used in LLM-generated sections (post-pass) |
| `disclosures` | Disclosures | Static PSA boilerplate + projection assumptions + compliance tracking ID |

### Why one big LLM call (not six small ones)

Voice consistency across sections is the critical quality property. Each call would re-establish voice from the calibration doc; minor drift compounds across 6 calls. Cross-section narrative weaving — *"the cash-flow savings approximately fund the buy/sell premium in Section 4"* — requires whole-plan context in the same context window. A single call also keeps prompt-cache hit rate high (one long shared system prompt, one user turn) and makes the cost picture predictable.

The token budget supports it: ~12–18K output tokens across the six sections (well under 32K cap), ~50–100K input tokens (within Opus 4.7's 200K context with margin). The truncation-abort discipline from Phase 3.1c (`output_tokens === MAX_TOKENS` aborts retry with `context_overflow`) is the safety net.

The alternative — sub-call per section — was rejected. See "Flagged Decisions" #1.

---

## Algorithm

Stage 4 runs in three phases. Phase 1 deterministically prepares context and the deterministic sections. Phase 2 is the single LLM call producing the six narrative sections via tool-use schema enforcement. Phase 3 stitches LLM output + deterministic sections + auto-extracted glossary into the final Stage4Result.

### Phase 1 — Deterministic context assembly + deterministic sections (no LLM)

#### Step 1.1 — Pre-flight context check

Two-tier pre-flight check (post-Phase-3.2-Step-3 multi-pass refactor):

1. **Chars/4 fast-fail at 130K tokens.** Local estimate (chars / 4); short-circuits egregiously oversized inputs without burning a `count_tokens` API call. Tuned empirically: Holloway chars/4 estimate was 97K but real tokens were 144K (~48% under-count). The 130K chars/4 ceiling catches inputs where even the optimistic estimate is in the danger zone.

2. **Anthropic count_tokens API at 165K real tokens (authoritative).** Calls `apiClient.messages.countTokens()` against the Pass 1 user turn (Pass 1 and Pass 2 have nearly identical input size, so we measure once). Anthropic's hard context limit is 200K; we need 32K output budget per pass; that leaves 168K input. Capped at 165K for a 3K margin. count_tokens is ~free (no completion tokens) — negligible cost. If real tokens > 165K, fail-fast with `_failure_type: "context_overflow"` so the caller can summarize ClientProfile or QuantifiedRecommendations before retry. No partial generation.

*Update 2026-05-03: prior pre-flight at "150K chars/4 estimate" caused a silent breach: Holloway hit 144K real tokens (above the 200K limit minus 32K output budget) while the chars/4 estimate read 97K. The two-tier check + count_tokens authoritative gate prevents this class of silent breach.*

#### Step 1.2 — Build deterministic sections

These run synchronously and don't depend on the LLM call:

- **`title_page`**: from `clientProfile.client_and_family.primary_owner.full_legal_name` + spouse + business name + ownership snapshot + advisor display + `referenceDate` + compliance_id (format: `PSA-YYYY-MMDD-<CLIENT_LAST>-001`).
- **`client_snapshot`**: business identity table, ownership, revenue/profit table from `clientProfile.entities[*]`, valuation paragraph derived from primary entity, existing coverage table from `clientProfile.insurance` + retirement section.
- **`goals_priorities`**: 10-row table built from `clientProfile.goals_and_values` parsed into goal name + "what this means in practice" cell. If fewer than 10 goal threads exist, render fewer rows.
- **`implementation_roadmap`**: action item table grouped by `timing_bucket` (in canonical order: 0–30 / 30–60 / 60–120 days, then 4–6 / 6–12 / 12–24 months, then Ongoing). Columns: Action / Timing / Owner / Status (default `Not Started`). Source: `quantifiedRecommendations.recommendations[*].action_items[*]`.
- **`decisions_needed`**: 5–8 rows max. Sourced from recs where `decisions_needed === true` OR `quantified_impact.pending_reconciliation === true`. Columns: # / Decision / Our Recommendation / Decision Needed By. The recommended path text comes from `quantified_impact.alternative_values[0].context` (or qualitative_phrasing for non-State-C decisions). Deadline is heuristic — 30/60/90/180 days based on `timing_bucket`.
- **`advisory_team`**: rows merged from `clientProfile.existing_advisor_relationships` + a TBD row for every distinct `partner_type` mentioned in any ActionItem with `partner_required: true` that doesn't already match a relationship in the profile. Columns: Role / Firm / Notes.
- **`disclosures`**: static template merged with `referenceDate`, `clientProfile.engagement.firm_or_advisor_name`, advisorOverride supervisory office, and projection-assumption boilerplate.

The `glossary` section is built in Phase 3 (post-LLM) since it depends on which technical terms appear in the generated prose.

#### Step 1.3 — Compute Top 5 Priorities for the Executive Summary

Reuse `buildTopPriorities(quantifiedRecommendations, { n: 5, enableClusterCombination: true })` from `src/lib/orchestrator/glue/topPrioritiesBuilder.ts`. The returned `TopPrioritiesRecord[]` carries display-ready name + impact + timing for the Executive Summary's table. Pass to the LLM in the user turn so the LLM can prose-frame each priority but isn't responsible for the ranking itself.

#### Step 1.4 — Resolve archetype-driven section gating

`clientProfile.engagement.archetype` drives which `[OPTIONAL]` sections render. v1 mapping (revisit per archetype as we add fixtures):

| archetype | Include `[OPTIONAL — pre-transaction posture]` business sections (Benefits/Retention, Pre-Transaction Sequence content) |
|---|---|
| `PRE` | YES |
| `POST` | NO (post-exit shape; different optional content) |
| `ACT` | NO |
| `FO` | NO |
| `FOUND` | NO |

Pass the archetype + the include/exclude map into the LLM user turn. The LLM is instructed to OMIT `[OPTIONAL]` sections whose include flag is false; it does not invent new optional content for archetypes that don't warrant it.

### Phase 2 — Single LLM call (tool-use enforcement, streaming)

Mirrors the Stage 3a.1 architecture: `messages.stream()` with a forced tool_choice on `submit_plan_sections`. The tool's input_schema is generated via Zod 4 native `z.toJSONSchema()` from the `Stage4LlmRawOutputSchema` zod definition.

#### Step 2.1 — Build user turn

Structure mirrors Stage 3a.1's user-turn pattern:

```
<voice_calibration>
  {full contents of specs/stages/stage4_voice_calibration.md}
</voice_calibration>

<client_profile>
  {ClientProfile JSON, full}
</client_profile>

<quantified_recommendations>
  {QuantifiedRecommendations JSON, full — all 81-or-however-many recs}
</quantified_recommendations>

<top_priorities>
  {pre-computed Top 5 with display name + estimated impact + timing}
</top_priorities>

<archetype_gating>
  archetype: PRE
  include_optional_pre_transaction: true
</archetype_gating>

<firm_policy_resolutions>{firmPolicyResolutions JSON, possibly empty}</firm_policy_resolutions>
<landmine_authorizations>{landmineAuthorizations JSON, possibly empty}</landmine_authorizations>

Generate the six narrative sections per your system prompt and the voice calibration. Submit via the submit_plan_sections tool exactly once. Use the numbers from <quantified_recommendations> verbatim — do not invent new estimates.
```

The voice calibration markdown is loaded inline (not as system prompt) so prompt caching applies to the standing system prompt while the per-engagement client data + recs sit on the user turn.

#### Step 2.2 — Tool definition

```typescript
const submitPlanSectionsTool = {
  name: "submit_plan_sections",
  description: "Submit the six LLM-generated narrative sections for this plan. Call exactly once with all six sections populated.",
  input_schema: STAGE4_TOOL_INPUT_SCHEMA,  // generated from zod
};
```

The Anthropic call uses streaming and forces the tool:

```typescript
const stream = apiClient.messages.stream({
  model: "claude-opus-4-7",
  max_tokens: 32000,
  system: [
    { type: "text", text: STAGE4_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
  ],
  messages: [{ role: "user", content: userTurn }],
  tools: [submitPlanSectionsTool],
  tool_choice: { type: "tool", name: "submit_plan_sections" },
});
const response = await stream.finalMessage();
```

`max_tokens: 32000` — same ceiling as Stage 3a.1. Empirically, six sections × 2–3K tokens each = ~12–18K output. Headroom is comfortable; the truncation-abort guard catches the edge case where a particularly verbose engagement would push past.

#### Step 2.3 — Truncation-abort guard (Phase 3.1c discipline)

After the message resolves, check `response.usage.output_tokens >= MAX_TOKENS`. If true, abort retry immediately with `_failure_type: "context_overflow"` and message *"Output truncated at MAX_TOKENS=32000; the engagement is too large for a single Stage 4 invocation. Reduce QuantifiedRecommendations scope (filter by category) or contact Hayden."* No retry — same input + same cap reproduces the truncation.

#### Step 2.4 — Extract tool_use input

Find the content block with `type === "tool_use"` and `name === "submit_plan_sections"`. Its `input` is the parsed structured object. If no such block exists (model refusal, malformed response), route through `schema_validation_failed` with a fallback raw text dump and the message *"No tool_use block named 'submit_plan_sections' in model response."* This shouldn't happen with `tool_choice` forced, but the defensive path stays.

#### Step 2.5 — Schema validate (zod) + retry on failure

Validate the tool input against `Stage4LlmRawOutputSchema`. Per-section invariants enforced by the zod schema:

- Every recommendation section has `heading`, `label` (one of the three bracketed labels), `intro_paragraph` (1–2 paragraphs), `recommendations_bullets` (each with `bold_imperative` + `briefing`), and an optional `closer_paragraph` keyed by closer label
- `executive_summary.two_themes_paragraph` is non-empty
- `executive_summary.what_this_means_closer` is non-empty
- `findings_observations.strengths` length 4–8 entries; `opportunities[]` grouped by category
- Cross-references emitted in `cross_references[]` carry `target_section_id` (one of the section IDs the harness recognizes) and `display_text`
- `qualitative_phrasing` translation rules: state A recs do not have `qualitative_phrasing` echoed in the bullet body; state B/C/D recs use the qualitative phrasing in the strategic intro

On schema failure with retries remaining, append the assistant turn (the previous tool-use input as text) + a user turn enumerating validation errors and instructing a re-submit. After retries exhausted: return `Stage4ResultFailed` with `_failure_type: "schema_validation_failed"` and the validation_errors array.

#### Step 2.6 — Number-consistency cross-check (per-rec)

For every recommendation in the LLM output, scan its prose for dollar figures. Match each figure against the corresponding `quantified_impact.estimate.value` or `scenario_range.{low,mid,high}` from `quantifiedRecommendations`. Tolerance: exact match for point values; LLM ranges may narrow Stage 3a's range but not invent a value outside it. Mismatches surface in `_flags.numbers_drift[]` (warnings, not errors); the LLM is instructed to use Stage 3a's numbers verbatim and significant drift triggers a single retry with the specific drift errors enumerated.

This is a soft gate — the prose is the deliverable, and rare LLM rephrasing of a number is acceptable if directionally correct. Hard mismatches (e.g., LLM emits "$200K" against Stage 3a's "$148K") trigger retry; small phrasing differences (e.g., "approximately $148,000" vs "$148K") pass.

### Phase 3 — Post-LLM stitching + glossary auto-extraction

#### Step 3.1 — Resolve cross-references

The LLM emits `cross_references[]` with `target_section_id` and `display_text` (e.g., `target_section_id: "RB.4"`, `display_text: "see Section 4"`). The harness validates that every `target_section_id` resolves to a real section in the assembled output (LLM-generated or deterministic). Unresolved refs surface in `_flags.unresolved_cross_references[]` and are stripped from the prose.

The harness does NOT renumber sections. Section IDs are stable throughout the pipeline:

- `T` = Title page
- `ES` = Executive Summary
- `OP` = Our Process
- `CS` = Client Snapshot
- `GP` = Goals & Priorities
- `FO` = Findings & Observations
- `RB.1` … `RB.7` = Recommendations — Business sections 1 through 7
- `RP.8` … `RP.12` = Recommendations — Personal sections 8 through 12
- `IR` = Implementation Roadmap
- `DN` = Decisions Needed
- `AT` = Advisory Team
- `MC` = Meeting Cadence
- `GL` = Glossary
- `DS` = Disclosures

The LLM is instructed to use this ID space when emitting cross-refs.

#### Step 3.2 — Auto-extract glossary

Scan the LLM-generated prose (all six sections) for technical terms. The matching set lives in a curated list at `kb/v1_2/02_reference/glossary_terms.md`: each entry has `term`, `acronym_or_section_ref`, `plain_english_definition`. The harness emits a glossary entry for every term that appears at least once in the generated prose. Order: alphabetical by term (or by stands-for if acronym).

This is deterministic — no LLM call. The curated source-of-truth list is what guarantees the glossary entries don't drift across plans.

#### Step 3.3 — Number-drift flag finalization

Finalize `_flags.numbers_drift[]` from Phase 2.6's cross-check. Surface in `_flags`; do not block the result.

#### Step 3.4 — Compute metadata

Build `_metadata`:

- `stage_version`: `"4-1.0.0"`
- `model_used`: `"claude-opus-4-7"`
- `input_token_count`, `output_token_count`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `attempts_made`, `duration_ms`, `parsed_at`
- `source_quantified_recommendations_hash`: hash of input QuantifiedRecommendations
- `source_client_profile_hash`: from input ClientProfile metadata
- `attempt_history[]`: per-attempt outcomes for diagnostic substrate
- `cost_cents`: computed via the Stage 3a pricing constants

#### Step 3.5 — Return Stage4Result

```typescript
return {
  llm_sections: { ... },          // 6 LLM-generated sections (validated)
  deterministic_sections: { ... }, // 8 template-driven sections + glossary
  _flags: { ... },
  _metadata: stageMetadata,
};
```

---

## Output Schema

Lives in `src/lib/orchestrator/schemas/stage4.types.ts` (zod). Inferred TypeScript types exported alongside.

```typescript
interface Stage4Result {
  llm_sections: {
    executive_summary: ExecutiveSummary;
    our_process: OurProcess;
    findings_observations: FindingsObservations;
    recommendations_business: RecommendationsLens;
    recommendations_personal: RecommendationsLens;
    meeting_cadence_intro: MeetingCadenceIntro;
  };
  deterministic_sections: {
    title_page: TitlePage;
    client_snapshot: ClientSnapshot;
    goals_priorities: GoalsPriorities;
    implementation_roadmap: ImplementationRoadmap;
    decisions_needed: DecisionsNeeded;
    advisory_team: AdvisoryTeam;
    meeting_cadence_table: MeetingCadenceTable;  // table portion split from intro
    glossary: Glossary;
    disclosures: Disclosures;
  };
  _flags: Stage4Flags;
  _metadata: Stage4Metadata;
}

interface Stage4ResultFailed {
  _stage_status: "FAILED";
  _failure_type:
    | "kb_load_failed"                  // voice calibration doc missing, glossary terms missing
    | "schema_validation_failed"         // LLM tool input failed zod
    | "api_error"
    | "max_retries_exceeded"
    | "context_overflow"                 // pre-flight or truncation
    | "client_profile_invalid";          // input ClientProfile shape unusable
  _failure_reason: string;
  _failure_context: {
    validation_errors?: string[];
    raw_response?: string;
    parsed_response?: unknown;
    api_error?: string;
    attempts_made: number;
    estimated_input_tokens?: number;
    last_failure_type?: "schema_validation_failed";
  };
  _metadata: Partial<Stage4Metadata>;
}

interface Stage4Flags {
  numbers_drift: Array<{ rec_id: string; expected: string; emitted: string; severity: "soft" | "hard" }>;
  unresolved_cross_references: Array<{ source_section_id: string; target_section_id: string }>;
  glossary_terms_used: string[];
  conditional_sections_omitted: Array<{ section_id: string; reason: string }>;
  optional_sections_included: Array<{ section_id: string; archetype: string }>;
}

interface Stage4Metadata extends StageMetadata {
  // inherits stage_version, model_used, token counts, attempts_made, attempt_history,
  // duration_ms, source_fr_content_hash, parsed_at
  source_quantified_recommendations_hash: string;
  source_client_profile_hash: string;
  cost_cents: number;
}
```

The schema also defines per-section interfaces (`ExecutiveSummary`, `RecommendationsLens`, etc.). The recommendations-lens shape is the most structured:

```typescript
interface RecommendationsLens {
  intro_paragraph: string;  // single paragraph framing the lens (Business or Personal)
  sections: RecommendationSection[];  // 5–7 entries
}

interface RecommendationSection {
  section_id: string;          // e.g., "RB.1", "RP.8"
  numbered_heading: string;    // e.g., "1. Entity & Real Estate Structure"
  label: "[CORE SECTION]" | "[OPTIONAL — included because of pre-transaction posture]" | "[PERSONAL — for owner(s)]" | "[OPTIONAL — included because of three children at planning-relevant ages]";
  source_rec_ids: string[];    // which Stage 3a recs this section covers
  intro_paragraph: string;
  subsections: RecommendationSubsection[] | null;  // null = no sub-split (e.g., "3A. Implement This Year" is a subsection)
  recommendations_bullets: RecommendationBullet[];
  closer_paragraph: { label: string; body: string } | null;  // label is "Why this sequence matters" / "Quantified impact" / etc.
  cross_references: CrossReference[];
}

interface RecommendationBullet {
  bold_imperative: string;
  briefing: string;
  partner_role: string | null;     // null when not partner-coordinated
  source_action_item_ids: string[]; // tied back to Stage 3a action_items
}

interface CrossReference {
  target_section_id: string;       // T / ES / OP / CS / GP / FO / RB.* / RP.* / IR / DN / AT / MC / GL / DS
  display_text: string;            // "see Section 4" / "(see Section 3A)" / "the buy/sell program in Section 4"
}
```

---

## System Prompt

`src/lib/orchestrator/stages/stage4.system.md` (~6–8K words). Sections:

1. **Role and goal:** "You are Stage 4 of an automated financial planning pipeline. You generate the six narrative sections of a PSA Wealth client deliverable. The voice you produce is the voice the client reads — there is no further polish stage."

2. **Tool-use protocol:** "Submit your work via the `submit_plan_sections` tool exactly once. The tool's input_schema enforces structural correctness; voice and reasoning quality are your responsibility."

3. **Voice calibration reference:** Direct instruction to load `<voice_calibration>` from the user turn and treat its do/don't rules + verbatim samples as the authoritative voice spec. Cite the key rules inline (strategic-frame-first openings, bold-imperative bullets, numbers-with-assumptions, em-dashes, partner-coordination language).

4. **Number discipline:** "All dollar figures must come from `<quantified_recommendations>`. Do not invent estimates. When Stage 3a emits a range (`scenario_range`), you may narrow it in prose if you have rationale, but you may not emit a value outside the range. Use 'approximately' or range syntax — never bare point values."

5. **Per-state translation rules:**
   - State A: lead with the dollar figure with assumption parenthetical
   - State B: name the blocked input, then the unblock condition, then the conditional impact range
   - State C: present in the recommendation rationale AND surface in `Decisions Needed` (the harness places it there; you mention it once in the rec's intro_paragraph)
   - State D: pure prose without dollar figures, anchored to a behavioral rule
   (See `<voice_calibration>` Section 6 for verbatim samples of each.)

6. **Section ID space:** the stable IDs the harness uses (T, ES, OP, CS, GP, FO, RB.1–RB.7, RP.8–RP.12, IR, DN, AT, MC, GL, DS). When you emit cross-references, target these IDs.

7. **Archetype gating:** "When `<archetype_gating>.include_optional_pre_transaction === false`, OMIT recommendation sections labeled `[OPTIONAL — included because of pre-transaction posture]`. Don't generate placeholder content for them. Only generate sections the engagement warrants."

8. **Cross-rec narrative weaving:** "Look for opportunities to connect recommendations across the plan — where one rec's quantified impact funds, offsets, or enables another. The synthetic plan does this naturally: 'the cash-flow savings approximately fund the buy/sell premium in Section 4.' Weave these connections in `cross_references[]` AND in the prose where natural. Don't force it; one or two genuine connections per lens are better than ten contrived ones."

9. **Recommendation sub-structure:** "Every recommendation section follows the same micro-structure: numbered heading → label → strategic intro paragraph (no bullets) → 'Recommendations' heading → bulleted action list (each bullet: `**Bold imperative.** Briefing.`) → optional closer paragraph with one of these specific labels: `Why this sequence matters` / `Quantified impact` / `Combined estate impact` / `Why the range is wide` / `What this means`."

10. **Findings & Observations format:** "Strengths use ✓ checkmarks; Opportunities use • bullets grouped by category. Categories mirror Stage 3a's RecommendationCategory enum (Tax, Estate, Risk & Insurance, etc.). Don't invent categories."

11. **Examples:** 2 worked examples — one full Recommendations — Business section (sourced from synthetic plan's Section 1 Entity & Real Estate Structure with 1–2 modifications to demonstrate variability) and one Findings & Observations layout. Both are short enough to keep the prompt tight; the `<voice_calibration>` verbatim samples carry the rest.

The system prompt's last line: *"Output only via the tool. Do not produce prose outside the tool call. Voice integrity matters as much as structural correctness."*

---

## Implementation Requirements

1. **Module location:** `src/lib/orchestrator/stages/stage4PlanGenerator.ts`

2. **Schema location:** `src/lib/orchestrator/schemas/stage4.types.ts`

3. **System prompt location:** `src/lib/orchestrator/stages/stage4.system.md`

4. **Voice calibration loaded at runtime:** the harness reads `specs/stages/stage4_voice_calibration.md` at module-init and injects into the user turn as `<voice_calibration>` block. Cached at module scope.

5. **Function signature:**

```typescript
export async function generatePlan(
  clientProfile: ClientProfile,
  quantifiedRecommendations: QuantifiedRecommendations,
  options: {
    apiClient: Stage4ApiClient;
    kbPath?: string;
    referenceDate?: Date;
    firmPolicyResolutions?: FirmPolicyResolution[];
    landmineAuthorizations?: LandmineAuthorization[];
    maxRetries?: number;
    advisorOverride?: AdvisorOverride;
  }
): Promise<Stage4Result | Stage4ResultFailed>;
```

6. **No throws.** All errors caught and returned as `Stage4ResultFailed`.

7. **Anthropic call config:**
   - `model: "claude-opus-4-7"`
   - `max_tokens: 32000`
   - `temperature` not set (Anthropic deprecated it for Opus 4.7 as of 2026-05; see Flagged Decision #10)
   - System prompt loaded from disk at module load and cached.
   - Streaming via `messages.stream()`; `await stream.finalMessage()` resolves the final Anthropic.Message.
   - `tools: [submitPlanSectionsTool]`, `tool_choice: { type: "tool", name: "submit_plan_sections" }`.

8. **Stage4ApiClient interface** (mirrors Stage3a1ApiClient):

```typescript
export interface Stage4MessageStream {
  finalMessage: () => Promise<Anthropic.Message>;
}
export interface Stage4ApiClient {
  messages: {
    stream: (params: Anthropic.MessageCreateParamsNonStreaming) => Stage4MessageStream;
  };
}
```

9. **JSON Schema generation:** use `z.toJSONSchema(Stage4LlmRawOutputSchema)` (Zod 4 native) and inject any `allOf`/`if-then` invariants the same way Stage 3a.1 does. The recommendations-lens shape has cross-field invariants (e.g., `closer_paragraph` is null OR has both `label` and `body`); `superRefine` in the zod schema covers them, and the JSON Schema `allOf` injection adds the `if-then` for the protocol-level enforcement.

10. **Truncation-abort guard** at the top of the retry-loop attempt body, mirroring Stage 3a.1's pattern. `output_tokens >= MAX_TOKENS` → `context_overflow`, no retry.

11. **Pre-flight context check** uses the chars/4 estimate from Stage 3a.1.

12. **Logging:** `_metadata` includes per-section character count + token count breakdowns for cost attribution.

13. **Cost target:** $15–$25 per single Stage 4 invocation at Opus 4.7 pricing (input ~80–100K, output ~12–18K, cache_creation ~30–50K on first call). Stage 4 runs once per plan delivery; cost is per-engagement, not per-batch.

14. **Live runner script:** `scripts/runStage4Live.ts` follows the artifact-first-write pattern from Phase 3.1c (write artifact before budget guard runs). Hard budget cap: $35 per run.

---

## Test Requirements

Create `src/lib/orchestrator/stages/__tests__/stage4PlanGenerator.test.ts`. Use Node's `node:test` runner. Mirror the Stage 3a.1 mock pattern: `MockAnthropicClient` with `messages.stream()` returning a `MessageStream`-shape mock, supporting both `tool_use_explicit` (structured payload) and `text_only` (defensive failure path) modes.

### Mock test cases (always-on)

1. **Mock success — minimal Stage 3a output (5 recs, mixed states)** → returns valid `Stage4Result`. Structural assertions:
   - All six `llm_sections` populated.
   - `recommendations_business.sections` length matches the input's distinct business categories.
   - Every recommendation section has a non-null `intro_paragraph` and at least one `recommendations_bullets` entry.
   - All eight `deterministic_sections` populated.
   - Glossary auto-extracted from generated prose (verify at least one curated term landed in `glossary.entries`).

2. **Mock invalid tool input (missing `executive_summary.two_themes_paragraph`)** → schema validation fails; on retry attempt with valid input → success with `attempts_made: 2`.

3. **Mock returns text-only response (no tool_use block)** → routes through `schema_validation_failed`. Retry succeeds → success.

4. **Mock returns `output_tokens: 32000` (truncation)** → aborts retry immediately with `_failure_type: "context_overflow"`. `client.callCount() === 1` (no second call). Mirrors Stage 3a.1's truncation-abort test.

5. **Pre-flight context overflow (mock ClientProfile + QuantifiedRecommendations padded to >150K tokens estimate)** → fails fast with `_failure_type: "context_overflow"` BEFORE any LLM call. `client.callCount() === 0`.

6. **Archetype gating: PRE archetype → optional pre-transaction sections INCLUDED.** Mock LLM emits an `[OPTIONAL — included because of pre-transaction posture]` section; harness preserves it; `_flags.optional_sections_included` records the inclusion.

7. **Archetype gating: POST archetype → optional pre-transaction sections EXCLUDED.** Mock LLM correctly omits the optional section; harness validates the omission and records in `_flags.conditional_sections_omitted`.

8. **Cross-reference resolution: LLM emits valid `target_section_id`** → reference preserved in output; `_flags.unresolved_cross_references` empty.

9. **Cross-reference resolution: LLM emits invalid `target_section_id` (e.g., "RB.99")** → reference stripped; `_flags.unresolved_cross_references` records the unresolved ref.

10. **Number-drift detection: LLM emits "$200K" against Stage 3a's "$148K"** → first attempt records drift in `_flags.numbers_drift` with `severity: "hard"`, retry fires; second attempt with correct number → success.

11. **Glossary auto-extraction: prose contains "PTET" + "GRAT"** → glossary entries for both terms emerge in `deterministic_sections.glossary.entries`.

12. **Decisions Needed deterministic build: input has 3 recs with `decisions_needed === true`** → `deterministic_sections.decisions_needed.rows.length === 3`. The recommended-path text comes from each rec's State C `alternative_values[0].context` (or `qualitative_phrasing` for non-State-C decisions).

13. **Implementation Roadmap deterministic build: input has 50 ActionItems across 7 timing buckets** → roadmap groups them in canonical timing-bucket order; each row has Action / Timing / Owner / Status columns.

14. **State A → state-aware prose: rec with `quantified_impact.estimate.value: 148000` and `qualitative_phrasing: null`** → mock LLM's `recommendations_bullets[0].briefing` references "$148,000" inline; no qualitative_phrasing leak in the bullet body. (Voice rule from calibration doc.)

15. **State D → qualitative-anchor prose: rec with `quantified_impact.estimate: null`, `reason_no_formula: "intentionally_qualitative"`** → mock LLM's `intro_paragraph` carries the qualitative phrasing; no dollar figure invented.

16. **Live API placeholder, gated `{ skip: !process.env.RUN_LIVE_API_TESTS }`:** uses Holloway's full QuantifiedRecommendations from `artifacts/stage3a_full_pipeline_test_v2.json`. Real Anthropic call. Structural assertions:
    - All six `llm_sections` populated and non-trivial (each section's main paragraph >= 80 chars).
    - At least 3 cross-references successfully resolved.
    - `numbers_drift` has zero `severity: "hard"` entries.
    - `_metadata.attempts_made <= 2`.
    - Glossary contains at least 5 entries.

Cost ~$15–$25 per live run.

---

## What This Does NOT Do

- Does NOT generate PDF output. Stage 4 produces structured `Stage4Result`; PDF rendering is the responsibility of the Plan Delivery service (React-PDF in the app shell).
- Does NOT call other LLM stages.
- Does NOT modify `quantifiedRecommendations` — read-only consumer.
- Does NOT spawn ActionItems — Stage 3a.1 already did.
- Does NOT compute `compliance_id` formally — uses a deterministic format string from `referenceDate` + client surname + run sequence number; supervisory review and tracking-ID issuance are the Plan Delivery service's responsibility.
- Does NOT run mechanical pre-checks (Stage 5 owns that).
- Does NOT validate that recommendation sections are internally complete (e.g., that every Stage 3a rec ended up in some plan section). That validation is a Stage 4 sub-step embedded in schema validation: every rec_id in input must surface in `source_rec_ids` of at least one recommendation_section.
- Does NOT decide archetype-specific section content beyond the pre-defined include/exclude map. v2 may add finer archetype-driven content selection.
- Does NOT generate marketing prose, compliance-required disclosures beyond the static template, or supervisor-review content.
- Does NOT update Stage 3a output. If Stage 4 detects a number-drift hard mismatch that retry can't resolve, it surfaces in `_flags.numbers_drift` with `severity: "hard"` for human review; it does NOT silently rewrite Stage 3a's numbers.
- Does NOT manage the prompt cache — Anthropic's SDK handles cache_creation/cache_read; Stage 4 uses ephemeral cache_control on the system prompt only.

---

## Open Questions Resolved (from Voice Calibration Section 11)

The voice calibration document surfaced 5 open architectural questions. This spec resolves each:

1. **Section-label-driven conditional rendering.** Resolved: archetype-driven via `clientProfile.engagement.archetype`. v1 mapping per Phase 1 Step 1.4 above. `[OPTIONAL — pre-transaction]` sections include only when archetype === "PRE". Other archetypes (POST/ACT/FO/FOUND) get their own optional content in v2; for v1 they get the core sections only.

2. **Per-state prose templates vs. free generation.** Resolved: free generation guided by examples in the system prompt + per-state translation rules (Phase 2 Step 2.5). The model has freedom to phrase but must follow the State A/B/C/D communication patterns from the voice calibration doc Section 6.

3. **Cross-reference resolution.** Resolved: stable section ID space (T / ES / OP / CS / GP / FO / RB.1–RB.7 / RP.8–RP.12 / IR / DN / AT / MC / GL / DS). LLM emits `cross_references[]` with `target_section_id`; harness validates resolution post-LLM; unresolved refs stripped + flagged. No section renumbering.

4. **Glossary auto-extraction.** Resolved: deterministic post-pass over LLM-generated prose, matching against curated `kb/v1_2/02_reference/glossary_terms.md` source-of-truth list. Stage 4 sub-step (Phase 3 Step 3.2), not Stage 5.

5. **Numbers consistency.** Resolved: Stage 4 receives the full QuantifiedRecommendations as authoritative source; LLM is instructed to use those exact values. Phase 2 Step 2.6 implements a number-drift cross-check; hard mismatches retry, soft mismatches flag-only. Single source of truth = Stage 3a output.

---

## Flagged Decisions (Made During Spec Authoring)

1. **Single LLM call architecture (not sub-call per section).** The cost of voice drift across 6 sub-calls outweighs the marginal cost reduction of smaller per-call output budgets. Single-call also enables genuine cross-section narrative weaving — the model sees the whole plan in one window. Total output ~12–18K tokens fits well under the 32K cap with the truncation-abort safety net. If empirical Stage 4 runs show consistent truncation pressure on multi-engagement-archetype runs, revisit.
   *Update 2026-05-03: REVISED. Single-call rejected after live test (Holloway 81 recs hit 32K output ceiling on the first attempt; truncation-abort fired correctly but nothing was salvageable). Architecture revised to **two-pass**: Pass 1 emits framing + Business lens (executive_summary, our_process, findings_observations, recommendations_business RB.1-7, meeting_cadence_intro); Pass 2 emits Personal lens (recommendations_personal RP.8-12). Voice consistency preserved via shared cached system prompt + cached voice calibration block — both passes share the same standing context, differing only in tool definition + tool_choice + a one-line user-turn instruction. Cross-section narrative weaving from Pass 2 to Pass 1 sections still works because Pass 2 sees the whole `<quantified_recommendations>` and emits cross-references against the full RB/RP section ID space. Pass-2 referencing Pass-1 emitted section IDs is the supported pattern; Pass-1 referencing Pass-2 sections requires the LLM to know in advance which RP.* IDs Pass 2 will use (reasonable since RP.8-12 are the canonical Personal slots). If post-validation cross-ref resolution drops genuine Pass-1→Pass-2 refs, revisit.*

2. **`max_tokens: 32000`** matches Stage 3a.1's ceiling. The output volume is comparable (Stage 3a.1 emits ~30K-token batches with full lifecycle metadata; Stage 4 emits ~12–18K of narrative prose). Same-ceiling discipline keeps the truncation-abort guard semantics consistent across stages.

3. **Top 5 priorities derived deterministically, not LLM-derived.** The LLM prose-frames each priority but does not RANK them. The existing `buildTopPriorities()` helper produces a stable, deterministic ranking based on `quantified_impact` midpoint × eligibility filters. This guarantees the Top 5 table aligns with what's quantitatively significant; the LLM's job is voice, not arithmetic.

4. **Voice calibration doc loaded as user-turn block, not as system prompt.** Reasoning: the calibration doc is large (~10K tokens with verbatim samples) and would dominate the system-prompt cache window. Putting it on the user turn means the system prompt stays compact and reusable; per-engagement client data + recs sit on the user turn alongside. This costs us cache hit rate on the calibration doc itself but preserves cache hit rate on the system prompt across engagements.

5. **Section ID space is stable and pipeline-wide.** The IDs (T / ES / OP / CS / GP / FO / RB.1–RB.7 / RP.8–RP.12 / IR / DN / AT / MC / GL / DS) are not generated dynamically; they're hardcoded. The LLM emits cross-references against this fixed space. Alternative — auto-numbering — was rejected because it makes cross-ref resolution dependent on assembly order and breaks deterministic glossary/decisions/roadmap assembly that doesn't go through the LLM.

6. **Archetype gating is binary v1 (PRE includes optional pre-transaction; everything else excludes).** v2 will expand to a per-archetype optional-content map (POST has its own optional content shape; ACT and FO have different shapes). v1 keeps the gating simple while we accumulate non-PRE engagement examples.

7. **Glossary terms come from a curated source-of-truth file, not from LLM extraction.** The curated file (`kb/v1_2/02_reference/glossary_terms.md`) is authored once and maintained. Stage 4's post-pass scans LLM prose for term occurrences and emits glossary entries deterministically. This guarantees consistent glossary entries across all Stage 4 outputs and avoids the LLM inventing definitions.

8. **Number-drift gate is soft-then-hard.** Soft drift (phrasing variation) flags only; hard drift (wrong magnitude) triggers retry. The alternative — hard-only or soft-only — was rejected. Hard-only would fail too aggressively on minor rephrasings; soft-only would let real errors through.

9. **`cost_cents` in `_metadata` uses the same Opus 4.7 pricing constants Stage 3a.1 exports.** No new pricing constants — Stage 4 imports from `stage3a1BatchQuantifier.ts`'s exports.

10. **`temperature: 0.0`** for Stage 4. Voice consistency matters; deterministic generation supports test reproducibility too. The synthetic Holloway plan was authored manually (not LLM-generated), so we have no precedent for "what voice variation looks like at temperature 0.7" — staying at 0.0 keeps the variable count down.
   *Update 2026-05-03: `temperature` parameter removed after Anthropic deprecated it for Claude Opus 4.7 (returns 400 `invalid_request_error: "\`temperature\` is deprecated for this model."`). Stage 4 now relies on the model's default behavior, matching Stage 3a.1's production module which has never set `temperature`.*

11. **`Stage4Result` and `Stage4ResultFailed` types live in a NEW file (`schemas/stage4.types.ts`).** Same pattern as Stage 3a.1 (`schemas/stage3a1.types.ts`). Keeps `pipelineTypes.ts` focused on cross-stage shared types.

12. **Pre-flight context check at 150K tokens (75% of 200K).** Lower than Stage 3a.1's 180K because Stage 4's output is comparable in size to Stage 3a.1's but the input is much larger (full ClientProfile + full QuantifiedRecommendations + voice calibration doc). The 25K margin against 200K accommodates Anthropic's tokenizer being slightly different from chars/4 estimation.
   *Update 2026-05-03: REVISED. The chars/4 estimate proved unreliable at Holloway scale (97K chars/4 vs 144K real tokens — ~48% under-count). Pre-flight is now two-tier: (1) chars/4 fast-fail at 130K (cheap; catches egregious overshoots without an API call), (2) Anthropic count_tokens API at 165K real tokens (authoritative; gates against the 200K context limit minus 32K per-pass output budget). See Phase 1 Step 1.1 above for full discussion.*

---

## V2 Architectural Backlog

- **Per-archetype optional-content maps.** v1 binary gates `[OPTIONAL — pre-transaction]` only. v2 expands to POST / ACT / FO / FOUND archetypes with their own optional sections (e.g., POST might have `[OPTIONAL — included because of family-office posture]` content).
- **Multi-pass voice refinement.** v1 produces final prose in one LLM call. v2 may add a "voice review" sub-call where a critic agent reviews the generated prose against the calibration doc and emits suggested edits before final assembly.
- **Configurable section depth.** v1 includes all 14 sections always (subject to archetype gating). v2 may add a `briefMode` option that produces a shorter Executive-Summary-only delivery for interim updates.
- **Per-rec word-count tuning.** v1 gives the LLM a 300–700 word target per recommendation section; v2 may parameterize by rec category (Tax recs tend longer, Family recs tend shorter) for tighter output budget control.
- **Cross-engagement voice anchoring.** v1's voice calibration is from a single synthetic exemplar. v2 may add a small library of 3–5 hand-authored exemplars covering different archetype mixes, with the LLM exposed to all of them.
- **Glossary term auto-discovery.** v1 matches against a curated list. v2 may add a discovery pass where new technical terms (not in the curated list) trigger a glossary-entry suggestion in `_flags.glossary_term_candidates` for human review.
- **Plan-delivery integration.** v1 emits `Stage4Result`; the Plan Delivery service converts to PDF. v2 may add a Stage 4.5 ("Plan Polish") that emits versioned drafts for advisor review before client delivery.
- **Real-time streaming to UI.** v1 awaits `finalMessage()` synchronously. v2 may stream tool-use input fragments to the UI progressively for a perceived-latency win on multi-minute runs.
