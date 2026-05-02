import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAndMerge } from "../stage3a2CrossRecValidator";
import type {
  Stage3a1Result,
  Stage3a1ResultFailed,
} from "../../schemas/stage3a1.types";
import type {
  SequencedRecommendation,
  ActionItem,
} from "../../schemas/pipelineTypes";
import type { SelectedRecommendations } from "../../schemas/selectedRecommendations";

// ────────────────────────────────────────────────────────────────────────
// Fixture builders — minimal SequencedRecommendation + ActionItem
// ────────────────────────────────────────────────────────────────────────

function makeAI(
  id: string,
  recId: string,
  dependsOn: string[] = [],
): ActionItem {
  return {
    action_item_id: id,
    description: "x",
    sub_steps: [],
    category: "Tax",
    source_recommendation_id: recId,
    source_phase_or_step: "Phase 1",
    owner: "PSA",
    owner_name: null,
    timing_bucket: "0-30 days",
    depends_on: dependsOn,
    is_decision_needed: false,
    duration_class: "point_in_time",
    check_in_cadence: null,
    partner_required: false,
    partner_type: null,
    parent_action_item_id: null,
    is_derivative_reminder: false,
    source_plan_id: null,
    auto_generated_reminder_template: null,
  };
}

function makeRec(
  recId: string,
  actionItems: ActionItem[] = [],
): SequencedRecommendation {
  return {
    recommendation_id: recId,
    source_file_path: `kb/v1_2/01_recommendations/tax/${recId}.md`,
    category: "Tax",
    status: "Active",
    position_in_sequence: 0,
    plan_section: "Recommendations — Business Tax",
    subsection_within_section: null,
    co_triggered_with: [],
    quantified_impact: {
      estimate: { value: 1000, unit: "USD" },
      formula_id: "f1",
      formula_source_file: "x",
      computation_inputs: {},
      pending_reconciliation: false,
      alternative_values: [],
      qualitative_phrasing: null,
      reason_no_formula: null,
      blocked_inputs: [],
    },
    scenario_range: null,
    timing_bucket: "0-30 days",
    owner: "PSA",
    owner_name: null,
    decisions_needed: false,
    cluster_id: null,
    cluster_sequence_closer: null,
    action_items: actionItems,
    landmine: false,
    landmine_status: "not_a_landmine",
    default_excluded: false,
    plan_output_variant: null,
    match_strength: "strong",
    _audit_notes: null,
  };
}

const EMPTY_FLAGS = {
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
};

function makeBatchResult(
  batchIndex: number,
  totalBatches: number,
  recommendations: SequencedRecommendation[],
): Stage3a1Result {
  return {
    batch_index: batchIndex,
    total_batches: totalBatches,
    recommendations,
    _stage_flags: EMPTY_FLAGS,
    _metadata: {
      stage_version: "3a.1-1.0.0",
      model_used: "claude-opus-4-7",
      input_token_count: 1000,
      output_token_count: 500,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      attempts_made: 1,
      attempt_history: [],
      duration_ms: 100,
      source_fr_content_hash: "h",
      parsed_at: new Date().toISOString(),
      batch_index: batchIndex,
      total_batches: totalBatches,
    },
  };
}

function makeFailedBatch(
  batchIndex: number,
  failureType = "json_parse_failed",
): Stage3a1ResultFailed {
  return {
    _stage_status: "FAILED",
    _failure_type: failureType as Stage3a1ResultFailed["_failure_type"],
    _failure_reason: `Mock failure: ${failureType}`,
    _failure_context: {
      batch_index: batchIndex,
      attempts_made: 2,
    },
    _metadata: { batch_index: batchIndex, total_batches: 3 },
  };
}

function makeSelected(
  recIds: string[],
  withRefs: Partial<
    Record<
      string,
      Partial<{
        must_come_after: string[];
        must_come_before: string[];
        sequenced_with: string[];
        coordinated_with: string[];
        mutually_exclusive_with: string[];
      }>
    >
  > = {},
): SelectedRecommendations {
  return {
    selected: recIds.map((id) => ({
      recommendation_id: id,
      category: "Tax" as const,
      match_strength: "strong" as const,
      triggers_matched: [],
      triggers_partial: [],
      must_come_after: (withRefs[id]?.must_come_after ?? []).map((r) => ({
        recommendation_id: r,
      })),
      must_come_before: (withRefs[id]?.must_come_before ?? []).map((r) => ({
        recommendation_id: r,
      })),
      sequenced_with: (withRefs[id]?.sequenced_with ?? []).map((r) => ({
        recommendation_id: r,
      })),
      coordinated_with: (withRefs[id]?.coordinated_with ?? []).map((r) => ({
        recommendation_id: r,
      })),
      mutually_exclusive_with: (withRefs[id]?.mutually_exclusive_with ?? []).map(
        (r) => ({ recommendation_id: r }),
      ),
      preliminary_preference: null,
      preliminary_preference_rationale: null,
      landmine: false,
      landmine_status: "not_a_landmine",
      brief_rationale: "x",
    })),
  } as unknown as SelectedRecommendations;
}

// ────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────

test("3a.2 — all-batches-pass, no cross-refs → clean envelope", () => {
  const b1 = makeBatchResult(0, 2, [makeRec("REC-TAX-001"), makeRec("REC-TAX-002")]);
  const b2 = makeBatchResult(1, 2, [makeRec("REC-EST-001")]);
  const sel = makeSelected(["REC-TAX-001", "REC-TAX-002", "REC-EST-001"]);

  const result = validateAndMerge([b1, b2], sel);
  assert.equal(result.recommendations.length, 3);
  assert.equal(result._sequencer_status, undefined);
  assert.equal(result._sequencer_flags.orphan_sequencing_references.length, 0);
  assert.equal(result._sequencer_flags.orphan_action_item_dependencies.length, 0);
  assert.equal(result._sequencer_flags.coverage_gaps.length, 0);
  assert.equal(result._sequencer_flags.batch_failures_summary.length, 0);
});

test("3a.2 — cross-batch sequencing reference resolves correctly (no orphan flag)", () => {
  const b1 = makeBatchResult(0, 2, [makeRec("REC-TAX-001")]);
  const b2 = makeBatchResult(1, 2, [makeRec("REC-EST-006")]);
  const sel = makeSelected(["REC-TAX-001", "REC-EST-006"], {
    "REC-TAX-001": { must_come_before: ["REC-EST-006"] },
  });

  const result = validateAndMerge([b1, b2], sel);
  assert.equal(result._sequencer_flags.orphan_sequencing_references.length, 0);
});

test("3a.2 — orphan rec-level sequencing reference detected", () => {
  const b1 = makeBatchResult(0, 1, [makeRec("REC-TAX-001")]);
  const sel = makeSelected(["REC-TAX-001"], {
    "REC-TAX-001": { must_come_after: ["REC-NEVER-EXISTED"] },
  });

  const result = validateAndMerge([b1], sel);
  const orphans = result._sequencer_flags.orphan_sequencing_references;
  assert.equal(orphans.length, 1);
  assert.equal(orphans[0].source_rec_id, "REC-TAX-001");
  assert.equal(orphans[0].field, "must_come_after");
  assert.equal(orphans[0].missing_rec_id, "REC-NEVER-EXISTED");
  assert.equal(orphans[0].source_batch_index, 0);
});

test("3a.2 — orphan check covers all 5 sequencing fields", () => {
  const b1 = makeBatchResult(0, 1, [makeRec("REC-TAX-001")]);
  const sel = makeSelected(["REC-TAX-001"], {
    "REC-TAX-001": {
      must_come_after: ["REC-A"],
      must_come_before: ["REC-B"],
      sequenced_with: ["REC-C"],
      coordinated_with: ["REC-D"],
      mutually_exclusive_with: ["REC-E"],
    },
  });

  const result = validateAndMerge([b1], sel);
  const fields = result._sequencer_flags.orphan_sequencing_references.map((o) => o.field);
  assert.deepEqual(
    [...fields].sort(),
    [
      "coordinated_with",
      "must_come_after",
      "must_come_before",
      "mutually_exclusive_with",
      "sequenced_with",
    ],
  );
});

test("3a.2 — ActionItem cross-batch depends_on resolves correctly", () => {
  const b1 = makeBatchResult(0, 2, [makeRec("REC-TAX-001", [makeAI("AI-1", "REC-TAX-001", ["AI-2"])])]);
  const b2 = makeBatchResult(1, 2, [makeRec("REC-EST-006", [makeAI("AI-2", "REC-EST-006")])]);
  const sel = makeSelected(["REC-TAX-001", "REC-EST-006"]);

  const result = validateAndMerge([b1, b2], sel);
  assert.equal(result._sequencer_flags.orphan_action_item_dependencies.length, 0);
});

test("3a.2 — orphan ActionItem depends_on detected", () => {
  const b1 = makeBatchResult(0, 1, [
    makeRec("REC-TAX-001", [makeAI("AI-1", "REC-TAX-001", ["AI-MISSING"])]),
  ]);
  const sel = makeSelected(["REC-TAX-001"]);

  const result = validateAndMerge([b1], sel);
  const orphans = result._sequencer_flags.orphan_action_item_dependencies;
  assert.equal(orphans.length, 1);
  assert.equal(orphans[0].source_action_item_id, "AI-1");
  assert.equal(orphans[0].source_rec_id, "REC-TAX-001");
  assert.equal(orphans[0].missing_dependency_id, "AI-MISSING");
});

test("3a.2 — coverage gap detected when rec missing from output", () => {
  const b1 = makeBatchResult(0, 1, [makeRec("REC-TAX-001")]);
  // selected[] declares 2 recs but only 1 in batch outputs.
  const sel = makeSelected(["REC-TAX-001", "REC-EST-006"]);

  const result = validateAndMerge([b1], sel);
  assert.deepEqual(result._sequencer_flags.coverage_gaps, ["REC-EST-006"]);
});

test("3a.2 — partial batch failure: one batch failed, one succeeded", () => {
  const b1 = makeBatchResult(0, 2, [makeRec("REC-TAX-001")]);
  const b2 = makeFailedBatch(1, "schema_validation_failed");
  const sel = makeSelected(["REC-TAX-001", "REC-EST-006"]);

  const result = validateAndMerge([b1, b2], sel);
  assert.equal(result._sequencer_status, "FAILED");
  assert.equal(result.recommendations.length, 1); // Successful batch's recs preserved
  assert.equal(result.recommendations[0].recommendation_id, "REC-TAX-001");
  assert.equal(result._sequencer_failures?.length, 1);
  assert.equal(result._sequencer_flags.batch_failures_summary.length, 1);
  assert.equal(result._sequencer_flags.batch_failures_summary[0].batch_index, 1);
});

test("3a.2 — full failure: all batches failed", () => {
  const b1 = makeFailedBatch(0);
  const b2 = makeFailedBatch(1);
  const sel = makeSelected(["REC-TAX-001", "REC-EST-006"]);

  const result = validateAndMerge([b1, b2], sel);
  assert.equal(result._sequencer_status, "FAILED");
  assert.equal(result.recommendations.length, 0);
  assert.equal(result._sequencer_failures?.length, 2);
  // Coverage gap: both selected recs are missing.
  assert.equal(result._sequencer_flags.coverage_gaps.length, 2);
});

test("3a.2 — flag consolidation: each batch's flags unioned", () => {
  const b1 = makeBatchResult(0, 2, [makeRec("REC-TAX-001")]);
  b1._stage_flags.qualitative_fallback_used = [
    { rec_id: "REC-TAX-001", phrasing_used: "x", reason: "y" },
  ];
  const b2 = makeBatchResult(1, 2, [makeRec("REC-EST-001")]);
  b2._stage_flags.qualitative_fallback_used = [
    { rec_id: "REC-EST-001", phrasing_used: "a", reason: "b" },
  ];
  const sel = makeSelected(["REC-TAX-001", "REC-EST-001"]);

  const result = validateAndMerge([b1, b2], sel);
  assert.equal(result._sequencer_flags.qualitative_fallback_used.length, 2);
});

test("3a.2 — deterministic ordering: orphan flags sorted by source rec_id", () => {
  const b1 = makeBatchResult(0, 1, [
    makeRec("REC-TAX-002"),
    makeRec("REC-TAX-001"),
  ]);
  const sel = makeSelected(["REC-TAX-001", "REC-TAX-002"], {
    "REC-TAX-002": { must_come_after: ["REC-MISSING-Z"] },
    "REC-TAX-001": { must_come_after: ["REC-MISSING-A"] },
  });

  const result = validateAndMerge([b1], sel);
  const orphans = result._sequencer_flags.orphan_sequencing_references;
  assert.equal(orphans.length, 2);
  // Sorted by source_rec_id ascending: TAX-001 before TAX-002.
  assert.equal(orphans[0].source_rec_id, "REC-TAX-001");
  assert.equal(orphans[1].source_rec_id, "REC-TAX-002");
});

test("3a.2 — self-referential sequencing not flagged as orphan", () => {
  const b1 = makeBatchResult(0, 1, [makeRec("REC-TAX-001")]);
  const sel = makeSelected(["REC-TAX-001"], {
    "REC-TAX-001": { must_come_after: ["REC-TAX-001"] },
  });

  const result = validateAndMerge([b1], sel);
  // REC-TAX-001 references itself; it IS in the consolidated set, so no orphan.
  // (Stage 3b's topological sort owns cycle detection.)
  assert.equal(result._sequencer_flags.orphan_sequencing_references.length, 0);
});

test("3a.2 — empty input produces empty envelope, no failure", () => {
  const sel: SelectedRecommendations = { selected: [] } as unknown as SelectedRecommendations;
  const result = validateAndMerge([], sel);
  assert.equal(result.recommendations.length, 0);
  assert.equal(result._sequencer_status, undefined);
  assert.equal(result._sequencer_flags.coverage_gaps.length, 0);
});

test("3a.2 — selected[] non-empty but no batch results → all recs are coverage gaps", () => {
  const sel = makeSelected(["REC-TAX-001", "REC-EST-006"]);
  const result = validateAndMerge([], sel);
  assert.equal(result.recommendations.length, 0);
  assert.equal(result._sequencer_status, undefined); // No batches failed (none ran)
  assert.deepEqual([...result._sequencer_flags.coverage_gaps].sort(), [
    "REC-EST-006",
    "REC-TAX-001",
  ]);
});
