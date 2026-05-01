# Stage 4 Deterministic-Glue: Top Priorities Table Builder

**Type:** Deterministic. NO LLM call. Pure rules engine.

**Input:**
- SequencedPlan (Stage 3 output)
- AggregateMetrics (sibling glue builder output — for now, accept null and behave correctly when absent)

**Output:** Markdown rendering of the "Top Priorities — Next 12 Months" section block (heading + introducer + table) plus a flags object capturing any rendering issues.

---

## Algorithm

### Step 1 — Filter eligible recs

Eligible recs satisfy ALL:
- plan_section starts with "Recommendations —"
- timing_bucket is one of: "0-30 days", "30-60 days", "60-120 days"
- NOT default_excluded (landmines excluded by default are out)
- Has a quantified_impact (any of states A/B/C/D — even State D qualitative-only counts)

### Step 2 — Compute priority score per rec

priority_score = 0.45*impact + 0.25*timing + 0.20*archetype + 0.10*cluster_source

Impact score (0.0-1.0) depends on quantified_impact state:
- State A (computed): log10(value + 1) / log10(max_impact_in_plan + 1), clamped to [0,1]. For NumericRange, use midpoint.
- State B (blocked): 0.3
- State C (firm-policy pending): 0.5
- State D (qualitative-only): 0.4

State detection logic:
- State A: estimate != null AND alternative_values.length === 0 AND blocked_inputs.length === 0
- State B: blocked_inputs.length > 0
- State C: alternative_values.length > 0
- State D: qualitative_phrasing != null AND formula_id == null

If multiple match, prefer order: A > C > B > D.

max_impact_in_plan = max of all State A recs' midpoint values across eligible set. If no State A recs exist, all impact scores fall back to state-based defaults.

Timing score (0.0-1.0):
- "0-30 days": 1.0
- "30-60 days": 0.8
- "60-120 days": 0.6
- others: 0.0

Archetype score (0.0-1.0): hardcoded table per archetype × category. PRE-EXIT emphasizes Tax/Estate/Entity at 1.0, Risk and Succession at 0.8. POST-EXIT emphasizes Investment/Family/Estate/Charitable at 0.8-1.0. ACTIVE-NO-EXIT emphasizes Tax/Retirement at 1.0, Estate/Risk at 0.8. FAMILY-OFFICE emphasizes Estate/Family/Charitable at 1.0, Investment/Tax/Specialty at 0.8. PRE-LIQUIDITY-FOUNDER emphasizes Tax/Estate/Entity at 1.0, Investment/Risk at 0.6. Default 0.5 if not in table. (Hardcoded for v1; v2 reads from 06_engagement_archetypes.md.)

Cluster source score: count = recs with this rec_id in their must_come_after[] OR co_triggered_with[]. score = min(count / 5, 1.0).

### Step 3 — Top N selection

N = 5 (default; configurable). Sort by -priority_score, take top N. If fewer than N eligible, surface fewer rows; do NOT pad. Flag top_priorities_count_below_default if applicable.

### Step 4 — Cluster combination (optional)

If 3+ recs share cluster_id AND all in same plan_section AND combined score sums above highest individual score, combine. For v1, only fire when cluster recs all rank within top 8 individually.

### Step 5 — Render table cells

Per top-N rec or cluster:
- number: 1-indexed
- priority_descriptor: 8-18 word distillation. v1 stub: "<category>: <rec_id>". v2 loads from KB.
- estimated_impact: branch on state (see render_estimated_impact below)
- timing: rec.timing_bucket verbatim

render_estimated_impact:
- State A: "approximately ${value_3sigfigs}/yr" (annual) or "${value_3sigfigs}" (one-time). Range: "${low}–${high}". 3 sig figs under $10M; 2 sig figs above. K/M/B suffixes.
- State B: "pending [<blocked_reason>]" truncated 50 chars.
- State C: "${low_alt}–${high_alt}/yr pending firm policy" sorted endpoints. NEVER single value.
- State D: qualitative_phrasing truncated 50 chars.

### Step 6 — Render markdown block

Markdown table with headers # / Priority / Estimated Impact / Timing.

---

## Output Schema

TopPrioritiesResult contains rendered_block (markdown string), row_count, selected_recommendations (array with priority_score, component scores, rendering_state, cluster info per rec), and _orchestrator_flags (top_priorities_count_below_default, clusters_combined_to_single_row, qualitative_phrasings_in_table, pending_firm_policy_in_table).

TopPrioritiesResultFailed: _builder_status "FAILED" + _failure_reason.

---

## Implementation Requirements

1. Module: src/lib/orchestrator/glue/topPrioritiesBuilder.ts
2. Function signature:
   buildTopPriorities(sequencedPlan, aggregateMetrics, archetype, options) returns TopPrioritiesResult | TopPrioritiesResultFailed
   Options: n (default 5), enableClusterCombination (default true)
3. Pure function. Deterministic. Never throws.
4. Add types to src/lib/orchestrator/schemas/pipelineTypes.ts.
5. AggregateMetrics may be null in v1.

---

## Test Requirements

Create src/lib/orchestrator/glue/__tests__/topPrioritiesBuilder.test.ts:

1. Holloway-style fixture, 5+ eligible recs, PRE-EXIT archetype → 5-row table; PTET (State C) renders as range
2. Fewer than 5 eligible → flag set
3. All State D → no fabrication; qualitative phrasings rendered
4. State C alternative_values → range form, NEVER single value (canary test)
