import { test } from "node:test";
import assert from "node:assert/strict";
import { walkCascadeSet, walkCascadeSetWithDiagnostics } from "../cascadeWalking";
import type {
  PlanSectionName,
  RecommendationCategory,
  SequencedPlan,
  SequencedRecommendation,
} from "../../schemas/pipelineTypes";

// ────────────────────────────────────────────────────────────────────────
// Fixture helpers
// ────────────────────────────────────────────────────────────────────────

function makeRec(
  id: string,
  co_triggered_with: string[] = [],
  category: RecommendationCategory = "Tax",
  plan_section: PlanSectionName | null = null,
): SequencedRecommendation {
  return {
    recommendation_id: id,
    source_file_path: `kb/v1_2/01_recommendations/${id}.md`,
    category,
    status: "Active",
    position_in_sequence: 0,
    plan_section,
    subsection_within_section: null,
    co_triggered_with,
    quantified_impact: {
      estimate: null,
      formula_id: null,
      formula_source_file: null,
      computation_inputs: {},
      pending_reconciliation: false,
      alternative_values: [],
      qualitative_phrasing: null,
      reason_no_formula: null,
      blocked_inputs: [],
    },
    scenario_range: null,
    timing_bucket: "60-120 days",
    owner: "PSA",
    owner_name: null,
    decisions_needed: false,
    cluster_id: null,
    cluster_sequence_closer: null,
    action_items: [],
    landmine: false,
    landmine_status: "not_landmine",
    default_excluded: false,
    plan_output_variant: null,
    match_strength: "strong",
    _audit_notes: null,
  };
}

function makePlan(recs: SequencedRecommendation[]): SequencedPlan {
  return {
    _metadata: {
      sequencer_a_version: "0.1.0",
      assembler_b_version: "0.1.0",
      sequenced_at: "2026-05-01T00:00:00.000Z",
      source_fr_content_hash: "",
      source_client_profile_version: "",
      source_selected_recommendations_version: "",
      archetype: "PRE",
      archetype_secondary: null,
      volatile_rates_snapshot: {
        s7520_rate: 0,
        s7520_month: "",
        afr_short_annual: null,
        afr_mid_annual: null,
        afr_long_annual: null,
        last_refreshed: "",
        days_since_refresh: 0,
      },
      firm_policy_resolutions_applied: [],
      landmine_authorizations_applied: [],
      recommendation_count_total: recs.length,
      recommendation_count_pending_reconciliation: 0,
      recommendation_count_qualitative_only: 0,
      compliance_id: null,
      compliance_id_format_version: null,
    },
    _assembler_flags: {
      from_stage_3a: {
        unenumerated_question_ids: [],
        formula_yielded_unviable_value: [],
        cluster_closer_skipped: [],
        section_assignment_ambiguity: [],
        timing_bucket_inferred: [],
        qualitative_fallback_used: [],
        blocked_inputs_summary: [],
        orphan_action_item_dependencies: [],
        orphan_sequencing_references: [],
        batch_failures_summary: [],
        coverage_gaps: [],
        volatile_rates_stale: [],
      },
      from_stage_3b: {
        cycles_detected: [],
        soft_constraint_violations: [],
        section_assignment_skipped_count: 0,
        decisions_page_size: 0,
        strategies_excluded_count: 0,
      },
    },
    sequenced_recommendations: recs,
    plan_sections: {},
    global_order: recs.map((r) => r.recommendation_id),
    cluster_index: {},
    decisions_needed_page: [],
    strategies_considered_but_excluded: [],
    action_items_flat: [],
    supervisory_review_signal: {
      required: false,
      reasons: [],
      triggered_by_recommendations: [],
      routing_recommendation: "advisor_self_review",
      templatization_threshold_warning: false,
    },
  };
}

function buildHollowayCascade(): SequencedPlan {
  return makePlan([
    makeRec("REC-ENT-001", ["REC-ENT-002"]),
    makeRec("REC-ENT-002", ["REC-ENT-003", "REC-EST-006"]),
    makeRec("REC-ENT-003", ["REC-EST-008"]),
    makeRec("REC-EST-006", []),
    makeRec("REC-EST-008", []),
  ]);
}

// ────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────

test("1. empty starters → empty cascade_set, 0 iterations", () => {
  const plan = makePlan([makeRec("REC-A")]);
  const result = walkCascadeSetWithDiagnostics([], plan);
  assert.equal(result.cascade_set.size, 0);
  assert.deepEqual(result.cascade_set_sorted, []);
  assert.equal(result.iterations, 0);
  assert.equal(result.starter_count, 0);
  assert.equal(result.expanded_count, 0);
  assert.deepEqual(result.unresolved_starters, []);
});

test("2. single starter, no co_triggered_with → 1 iteration, 0 expansions", () => {
  const plan = makePlan([makeRec("REC-A", [])]);
  const result = walkCascadeSetWithDiagnostics(["REC-A"], plan);
  assert.equal(result.cascade_set.size, 1);
  assert.deepEqual(result.cascade_set_sorted, ["REC-A"]);
  assert.equal(result.iterations, 1);
  assert.equal(result.expanded_count, 0);
  assert.equal(result.starter_count, 1);
  assert.deepEqual(result.unresolved_starters, []);
});

test("3. two-level chain A→B→C → 2 iterations, expanded_count=2", () => {
  const plan = makePlan([
    makeRec("REC-A", ["REC-B"]),
    makeRec("REC-B", ["REC-C"]),
    makeRec("REC-C", []),
  ]);
  const result = walkCascadeSetWithDiagnostics(["REC-A"], plan);
  assert.deepEqual(result.cascade_set_sorted, ["REC-A", "REC-B", "REC-C"]);
  assert.equal(result.iterations, 2);
  assert.equal(result.expanded_count, 2);
});

test("4. Holloway entity-restructuring cascade from REC-ENT-001", () => {
  const plan = buildHollowayCascade();
  const result = walkCascadeSetWithDiagnostics(["REC-ENT-001"], plan);
  assert.deepEqual(result.cascade_set_sorted, [
    "REC-ENT-001",
    "REC-ENT-002",
    "REC-ENT-003",
    "REC-EST-006",
    "REC-EST-008",
  ]);
  assert.equal(result.expanded_count, 4);
  // depth: ENT-001(0) → ENT-002(1) → ENT-003 + EST-006(2) → EST-008(3)
  assert.equal(result.iterations, 3);
  assert.deepEqual(result.unresolved_starters, []);
});

test("5. cycle protection: A↔B terminates", () => {
  const plan = makePlan([
    makeRec("REC-A", ["REC-B"]),
    makeRec("REC-B", ["REC-A"]),
  ]);
  const result = walkCascadeSetWithDiagnostics(["REC-A"], plan);
  assert.deepEqual(result.cascade_set_sorted, ["REC-A", "REC-B"]);
  // No infinite loop — termination is the success condition.
  assert.equal(result.expanded_count, 1);
});

test("6. multi-starter input expands both cascades", () => {
  const plan = makePlan([
    makeRec("REC-A", ["REC-B"]),
    makeRec("REC-B", []),
    makeRec("REC-X", ["REC-Y"]),
    makeRec("REC-Y", []),
  ]);
  const result = walkCascadeSetWithDiagnostics(["REC-A", "REC-X"], plan);
  assert.deepEqual(result.cascade_set_sorted, ["REC-A", "REC-B", "REC-X", "REC-Y"]);
  assert.equal(result.expanded_count, 2);
  assert.equal(result.starter_count, 2);
  assert.deepEqual(result.unresolved_starters, []);
});

test("7. unresolvable starter: cascade_set excludes it; tracked in unresolved_starters", () => {
  const plan = makePlan([makeRec("REC-A", [])]);
  const result = walkCascadeSetWithDiagnostics(["REC-NOEXIST"], plan);
  assert.equal(result.cascade_set.size, 0);
  assert.deepEqual(result.cascade_set_sorted, []);
  assert.deepEqual(result.unresolved_starters, ["REC-NOEXIST"]);
  assert.equal(result.iterations, 0);
});

test("8. DETERMINISM CI: 100 invocations byte-identical (Holloway cascade)", () => {
  const plan = buildHollowayCascade();
  const starters = ["REC-ENT-001"];

  // walkCascadeSet — serialize via sorted array since Set has insertion-order iteration.
  const firstSet = JSON.stringify([...walkCascadeSet(starters, plan)].sort());
  for (let i = 0; i < 99; i += 1) {
    const next = JSON.stringify([...walkCascadeSet(starters, plan)].sort());
    assert.equal(next, firstSet, `walkCascadeSet diverged on iteration ${i + 2}`);
  }

  // walkCascadeSetWithDiagnostics — serialize the diagnostic shape.
  const serializeDiag = (r: ReturnType<typeof walkCascadeSetWithDiagnostics>) =>
    JSON.stringify({
      cascade_set_sorted: r.cascade_set_sorted,
      starter_count: r.starter_count,
      expanded_count: r.expanded_count,
      iterations: r.iterations,
      unresolved_starters: r.unresolved_starters,
    });
  const firstDiag = serializeDiag(walkCascadeSetWithDiagnostics(starters, plan));
  for (let i = 0; i < 99; i += 1) {
    const next = serializeDiag(walkCascadeSetWithDiagnostics(starters, plan));
    assert.equal(next, firstDiag, `walkCascadeSetWithDiagnostics diverged on iteration ${i + 2}`);
  }

  // Determinism under unsorted input: shuffled co_triggered_with order shouldn't change output.
  const shuffled = makePlan([
    makeRec("REC-ENT-001", ["REC-ENT-002"]),
    makeRec("REC-ENT-002", ["REC-EST-006", "REC-ENT-003"]), // reversed
    makeRec("REC-ENT-003", ["REC-EST-008"]),
    makeRec("REC-EST-006", []),
    makeRec("REC-EST-008", []),
  ]);
  const fromShuffled = serializeDiag(walkCascadeSetWithDiagnostics(starters, shuffled));
  assert.equal(fromShuffled, firstDiag, "output depends on co_triggered_with[] input order");
});

test("walkCascadeSet (simple) returns deterministic Set", () => {
  const plan = buildHollowayCascade();
  const a = walkCascadeSet(["REC-ENT-001"], plan);
  const b = walkCascadeSet(["REC-ENT-001"], plan);
  assert.deepEqual([...a], [...b]);
});

test("starter that is ALSO downstream of another starter is not double-counted", () => {
  const plan = makePlan([
    makeRec("REC-A", ["REC-B"]),
    makeRec("REC-B", []),
  ]);
  const result = walkCascadeSetWithDiagnostics(["REC-A", "REC-B"], plan);
  assert.deepEqual(result.cascade_set_sorted, ["REC-A", "REC-B"]);
  assert.equal(result.starter_count, 2);
  // expanded_count = total reached (2) - resolvable starters in set (2) = 0
  assert.equal(result.expanded_count, 0);
});
