# Stage 3b — Plan Section Assembler

**Type:** Deterministic. NO LLM call. Pure rules engine.

**Input:**
- `quantified_recommendations.json` (Stage 3a output)
- `selected_recommendations.json` (Stage 2 output, for sequencing relations)
- Orchestrator config (firm_policy_resolutions, landmine_authorizations, advisor_id)

**Output:** `sequenced_plan.json` conforming to the SequencedPlan schema.

---

## Algorithm Overview

13 sequential steps. Each step either succeeds or returns a Failure result. The function never throws.

### Step 1 — Validate Stage 3a output against schema

If quantified_recommendations is malformed or has _sequencer_status: "FAILED", propagate the failure. No partial assembly.

### Step 2 — Build dependency graph for topological sort

For each rec in quantified_recommendations.recommendations:
- For each entry in stage2_lookup.must_come_after: add edge (after_rec → this_rec)
- For each entry in stage2_lookup.must_come_before: add edge (this_rec → before_rec)

### Step 3 — Detect cycles

Run cycle detection on the graph (DFS-based). If any cycle, return Failure with the offending cycle. Cycles indicate upstream Stage 2 bug.

### Step 4 — Topological sort with deterministic tie-breakers

Use Kahn's algorithm. Tie-breaker order:
1. Among nodes with zero remaining in-edges, pick the one with the largest must_come_before count (drives the longest downstream chain — emit foundation first)
2. Among ties on (1), pick by category priority:
   `Entity Structure > Estate Planning > Risk & Insurance > Tax > Retirement & Benefits > Investment & Cash > Succession & Continuity > Family > Charitable Planning > Specialty`
3. Among ties on (2), alphabetical by recommendation_id

Same input must produce same output. Tests pin this.

### Step 5 — Compact SEQUENCED WITH clusters

SEQUENCED WITH peers belong adjacent in output. After topological sort, walk the order and bring SEQUENCED WITH peers together where doing so doesn't violate hard ordering.

### Step 6 — Place COORDINATED WITH peers proximally (soft)

Coordinated peers should be near each other within their plan section. Re-walk and bubble coordinated pairs together where compatible with hard ordering. Soft constraint — log violations to flags but never reject.

### Step 7 — Assign position_in_sequence

Walk the final order; assign 1-indexed positions.

### Step 8 — Group recommendations by plan_section

Build sections map keyed by plan_section enum value. Within each section, preserve global_order ordering. Recs with null plan_section are skipped (handled in Step 11 flag consolidation).

### Step 9 — Assemble Decisions Needed page

For each rec where `decisions_needed: true`, build a Decision record. Decision types:
- `firm_policy_resolution` — pending firm-policy question
- `mutually_exclusive_tie` — tied pair needs advisor pick
- `landmine_opt_in` — landmine triggered, needs advisor authorization
- `advisor_judgment` — other advisor-decision items

Sort decisions by deadline (soonest first), then alphabetical by recommendation_id.

### Step 10 — Assemble "Strategies Considered But Not Included"

Two contributors:
1. **Landmines that triggered but lacked authorization** — every rec with `landmine: true` AND `landmine_status: "landmine_excluded_default"`
2. **Mutually-exclusive pair "alternative" choices** — every rec with `preliminary_preference: "alternative"`. Deduplicate by pair (track seen_pairs).

"Tie" pairs do NOT appear here — they go to Decisions Needed page (Step 9).

### Step 11 — Consolidate flags

Combine Stage 3a's _sequencer_flags with Stage 3b's own flags:
- cycles_detected (would have failed in Step 3; populate empty if reached this step)
- soft_constraint_violations (from Step 6 coordinated_with conflicts)
- section_assignment_skipped_count (recs with null plan_section)
- decisions_page_size
- strategies_excluded_count

### Step 11.5 — Compute Supervisory Review Signal

Per compliance Patch 1. Walk all recs and emit reasons for:
- `landmine_authorized` — landmine_status starts with "landmine_authorized_by_"
- `landmine_excluded_default_with_trigger` — landmine triggered but advisor declined
- `firm_policy_resolution_applied` — pending_reconciliation false AND rec was in firm_policy_resolutions_applied
- `firm_policy_resolution_pending` — pending_reconciliation true with question_id awaiting
- `mutually_exclusive_tie_resolved_at_advisor_judgment` — tie pair resolved via config
- `specialty_recommendation_present` — category is "Specialty"
- `tax_strategy_outside_advisor_scope` — Tax category with alternative_value > $100K/yr

Determine routing:
- Any OSJ_principal reason → routing = "OSJ_principal"
- Any compliance_general reason (and no OSJ) → routing = "compliance_general"
- Otherwise → "advisor_self_review"

### Step 12 — Build cluster index

For each cluster_id appearing on recs, build:
```typescript
{
  cluster_id: string;
  members: string[];           // rec_ids
  closer_carrier: string | null;  // rec_id holding cluster_sequence_closer prose
  primary_section: PlanSectionName | null;
  spans_sections: PlanSectionName[];
}
```

### Step 13 — Validate output, emit

Validate full SequencedPlan against schema. Return assembled output.

---

## Output Schema

The output must validate against the SequencedPlan TypeScript types. The full schema is large; key types:

```typescript
export interface SequencedPlan {
  _metadata: SequencerMetadata;
  _assembler_flags: AssemblerFlags;
  
  sequenced_recommendations: SequencedRecommendation[];
  plan_sections: Partial<Record<PlanSectionName, SequencedRecommendation[]>>;
  global_order: string[];
  cluster_index: Record<string, ClusterIndexEntry>;
  decisions_needed_page: Decision[];
  strategies_considered_but_excluded: ExcludedStrategy[];
  action_items_flat: ActionItem[];
  
  supervisory_review_signal: SupervisoryReviewSignal;
}

export interface SequencedPlanFailed {
  _sequencer_status: "FAILED" | "STAGE_3B_FAILED";
  _failures: SequencerFailure[];
}
```

The full schema is in this spec; Claude Code should read it carefully and create matching TypeScript types in `src/lib/orchestrator/schemas/sequencedPlan.types.ts`.

---

## Implementation Requirements

1. **Module location:** `src/lib/orchestrator/glue/stage3bAssembler.ts`
2. **Function signature:**
```typescript
   export function assembleSequencedPlan(
     quantifiedRecs: QuantifiedRecommendations,
     selectedRecs: SelectedRecommendations,
     config: OrchestratorConfig
   ): SequencedPlan | SequencedPlanFailed
```
3. **No throws.** All errors caught; return Failed shape.
4. **Pure function.** Same inputs → same outputs. No external state, no Date.now() except in metadata. For metadata's `sequenced_at`, accept an optional `now` parameter for deterministic testing.
5. **Schema in separate file:** `src/lib/orchestrator/schemas/sequencedPlan.types.ts`
6. **Helper functions:** Topological sort, cycle detection, cluster compaction can be separate exports for testability.

---

## Test Requirements

Create `src/lib/orchestrator/glue/__tests__/stage3bAssembler.test.ts`:

### Fixture data

Build a minimal Holloway-style fixture in the test file:
- 5-7 recommendations spanning Entity Structure, Estate, Tax categories
- Include a SEQUENCED WITH cluster (REC-ENT-001 → REC-ENT-002 → REC-ENT-003)
- Include a must_come_after relationship (REC-EST-006 must come after REC-ENT-002)
- Include a coordinated_with pair
- Include a State C pending_reconciliation rec (REC-TAX-001 PTET)
- Include a landmine excluded by default
- Include a mutually-exclusive pair with preliminary_preference

### Test cases

1. **Happy path** — fixture in, valid SequencedPlan out. Verify global_order respects must_come_after, cluster_index has the entity cluster, decisions_needed_page contains PTET and the landmine.

2. **Cycle detection** — inject A→B→A cycle, expect Failed shape with cycle in failure context.

3. **Determinism** — call assembleSequencedPlan with same inputs 100 times, every output is byte-identical (use JSON.stringify and assert equality).

4. **Section grouping** — verify recs are grouped under correct plan_section keys.

5. **Supervisory review signal** — verify signal.required is true when PTET is in State C, signal.reasons includes "firm_policy_resolution_pending".

6. **Strategies excluded** — verify landmine appears in strategies_considered_but_excluded with reason "landmine_default_excluded".

Use Node's built-in node:test runner.

---

## What This Does NOT Do

- Does not call LLM
- Does not generate prose
- Does not compute new dollar values (Stage 3a did that)
- Does not write artifacts to disk
- Does not perform compliance ID assignment (orchestrator does that)

Stage 3b is the deterministic glue between Stage 3a's per-rec quantification and Stage 4's section prose generation.
