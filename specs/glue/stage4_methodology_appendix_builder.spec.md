# Stage 4 Deterministic-Glue: Methodology Appendix Builder

**Type:** Deterministic. NO LLM call. Pure rules engine.

**Purpose:** Render the Methodology Appendix that goes into the plan's Disclosures section. Per FINRA Rule 2210 and SEC Rule 204-2, performance projections and quantified claims require methodology disclosure. The appendix is the audit trail: for every dollar figure cited in the plan body, the appendix documents the formula source, inputs used, volatile rates referenced, and any firm-policy resolutions applied.

If a regulator asks "where did this $4.5M-$5M estate-tax savings figure come from?", the Methodology Appendix is the answer.

**Input:**
- SequencedPlan (Stage 3 output)
- AggregateMetrics (sibling glue builder output)

**Output:** Methodology Appendix as markdown plus a flags object.

---

## Algorithm

### Step 1 — Filter recs that produced quantified figures

Only include recs whose quantified_impact yielded a value referenced in the plan body. Specifically:

Include if ANY of:
- State A (estimate != null AND alternative_values is empty AND blocked_inputs is empty)
- State C with non-empty alternative_values (firm-policy pending; both candidates documented)

Skip:
- State D (qualitative-only — no formula to document)
- State B (blocked inputs — formula exists but couldn't compute; if not appearing in plan prose, no audit trail to document)

For State B recs, include them only if their blocked status itself is referenced in plan prose (e.g., "AFR refresh pending"). For v1 simple heuristic: include all State B recs in the appendix with their blocked inputs documented. They appear in Decisions Needed page anyway.

### Step 2 — Render per-rec methodology entry

For each included rec, produce a structured entry:

```typescript
interface PerRecMethodologyEntry {
  recommendation_id: string;
  plan_section: PlanSectionName | null;
  category: RecommendationCategory;
  formula_id: string | null;
  formula_source_file: string | null;
  computation_inputs: Record<string, unknown>;
  volatile_rates_referenced: string[];          // names of volatile rate fields used
  firm_policy_resolutions_applied: Array<{
    question_id: FirmPolicyQuestionId;
    resolved_value: unknown;
    resolved_by: string;
  }>;
  alternative_values_considered: Array<{
    value: NumericValue;
    formula_variant: string;
    awaiting: string;
    context: string;
  }>;
  pending_reconciliation: boolean;
  blocked_inputs: Array<{
    input_name: string;
    blocked_reason: string;
    source: string;
    would_unblock_when: string;
  }>;
  rendered_block: string;                       // markdown for this rec
}
```

Markdown rendering format per rec:

```markdown
### REC-XXX-NNN — [Recommendation Title]

- **Plan section:** [section name]
- **Formula ID:** [formula_id]
- **Formula source:** [source_file_path]
- **Computation inputs:**
  - [input_name_1]: [value] ([source])
  - [input_name_2]: [value] ([source])
  ...
- **Volatile rates referenced:** [list, or "None"]
- **Firm-policy resolutions applied:** [list, or "None"]
- **Alternative values considered:** [list with formula_variant + value, or "None"]
- **Pending reconciliation:** [Yes — see Decisions Needed page] or [No]
- **Blocked inputs:** [list, or "None"]
```

For the recommendation title (heading), use a stub for v1: "REC-XXX-NNN — [Title pending KB integration]". v2 will load actual titles from rec files.

### Step 3 — Render aggregate metric entries

For each non-null aggregate metric in AggregateMetrics, render its derivation:

```markdown
### Aggregate: [metric_name]

- **Computed value:** [rendered NumericValue]
- **Contributing recommendations:** [list of rec_ids]
- **Excluded due to pending reconciliation:** [list of rec_ids, or "None"]
- **Qualitative-only contributors (counted as zero):** [list of rec_ids, or "None"]
- **Hedge required in prose:** [Yes/No based on requires_hedge tag]
```

For null aggregates (skipped due to >50% pending reconciliation), include a brief note:

```markdown
### Aggregate: [metric_name]

- **Computed value:** Null (skipped)
- **Reason:** [excluded count] of [total] contributing recommendations are pending reconciliation
- **Excluded recommendations:** [list]
```

### Step 4 — Render volatile rates snapshot

Single block at the top of the appendix:

```markdown
### Volatile Rates Snapshot

This appendix's computations use the following volatile rates from the most recent KB lookup:

- **§7520 rate:** [value]% ([month])
- **AFR Short-term:** [value or "Pending refresh"]
- **AFR Mid-term:** [value or "Pending refresh"]
- **AFR Long-term:** [value or "Pending refresh"]
- **Last refreshed:** [date]
- **Days since refresh:** [number]
```

Pull from sequencedPlan._metadata.volatile_rates_snapshot.

### Step 5 — Render firm-policy resolutions snapshot

Single block:

```markdown
### Firm-Policy Resolutions Applied

The following firm-policy questions were resolved for this plan; affected recommendations cite them in their methodology entries above.

- **[question_id]:** [resolved_value] (resolved by [resolved_by] on [date])
- ...

[OR if no resolutions applied:]

No firm-policy resolutions applied. Pending firm-policy items appear in the Decisions Needed page.
```

Pull from sequencedPlan._metadata.firm_policy_resolutions_applied.

### Step 6 — Assemble final appendix

Header + intro + volatile rates + firm policy + per-rec entries (sorted by plan_section then rec_id) + aggregate metric entries.

```markdown
## Methodology Appendix

This appendix documents the formula sources, inputs, and firm-policy resolutions applied to every quantified figure cited in the plan body. Methodology is provided for audit and reproducibility.

### Volatile Rates Snapshot
[Step 4 output]

### Firm-Policy Resolutions Applied
[Step 5 output]

### Per-Recommendation Methodology
[All Step 2 entries, sorted by plan_section then rec_id]

### Aggregate Metric Methodology
[All Step 3 entries, sorted alphabetically by metric name]
```

---

## Output Schema

```typescript
export interface MethodologyAppendixResult {
  rendered_appendix: string;                    // full markdown
  rec_count: number;                            // number of per-rec entries
  aggregate_count: number;                      // number of aggregate entries
  per_rec_entries: PerRecMethodologyEntry[];    // structured for further processing
  
  _orchestrator_flags: {
    recs_pending_reconciliation_in_appendix: string[];
    aggregates_with_partial_inputs_in_appendix: string[];
    aggregates_skipped_in_appendix: string[];
  };
}

export interface MethodologyAppendixResultFailed {
  _builder_status: "FAILED";
  _failure_reason: string;
}
```

---

## Implementation Requirements

1. **Module location:** `src/lib/orchestrator/glue/methodologyAppendixBuilder.ts`

2. **Function signature:**
```typescript
   export function buildMethodologyAppendix(
     sequencedPlan: SequencedPlan,
     aggregateMetrics: AggregateMetrics | null,
     options?: {
       includeStateBRecs?: boolean;        // default true
       includeRecTitles?: Map<string, string>;  // optional title lookup, v2 ready
     }
   ): MethodologyAppendixResult | MethodologyAppendixResultFailed
```

3. **Pure function. No throws. Deterministic.**

4. **Schema:** add types to pipelineTypes.ts.

5. **Reuse detectRenderingState from utils/renderingState.ts** for state detection.

6. **Reuse formatMoney logic from topPrioritiesBuilder** for rendering NumericValue (extract to utils if not already).

7. **For NumericValue rendering in appendix:** preserve full precision in computation_inputs (no rounding). Only round in human-readable summary fields. The appendix is audit data; readers want exact computed values.

---

## Test Requirements

Create `src/lib/orchestrator/glue/__tests__/methodologyAppendixBuilder.test.ts`:

### Test cases

1. **Holloway-style fixture** — 5+ recs across categories, mix of states. Verify rendered appendix contains:
   - Volatile rates snapshot section
   - Firm-policy resolutions section (or "no resolutions" note)
   - Per-rec entries for State A and State C recs
   - Aggregate metric entries for each non-null metric

2. **State C rec rendering** — verify alternative_values_considered field is populated and rendered correctly. PTET should show both $73K and $148K candidates with their formula_variants.

3. **Pending reconciliation rec** — verify pending_reconciliation: true entries render correctly with note pointing to Decisions Needed page.

4. **Null aggregate rendering** — when an aggregate is null due to >50% pending reconciliation, verify the brief note format ("Computed value: Null (skipped)") renders correctly.

5. **Empty plan** — no recs. Appendix renders the volatile rates snapshot and firm-policy section but per-rec entries section is empty (or shows "No quantified recommendations in this plan"). No errors.

6. **Determinism** — 100 calls, byte-identical output.

7. **Sorting verification** — per-rec entries sorted by plan_section first, then rec_id alphabetically. Aggregate entries sorted alphabetically.

8. **Exclude State D recs** — verify recs with State D (qualitative-only) do NOT appear in per-rec entries, but the rec_ids ARE referenced in aggregate methodology if they contributed (as qualitative_only_rec_ids).

Use Node's node:test runner.

---

## What This Does NOT Do

- Does not call LLM
- Does not generate prose narrative
- Does not load KB rec files for titles (v1 uses stub; v2 loads from rec files)
- Does not validate against business rules
- Does not summarize or interpret — just renders the audit trail verbatim
