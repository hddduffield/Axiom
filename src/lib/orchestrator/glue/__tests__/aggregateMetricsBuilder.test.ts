import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAggregateMetrics } from "../aggregateMetricsBuilder";
import type {
  PlanSectionName,
  QuantifiedImpact,
  RecommendationCategory,
  SequencedPlan,
  SequencedRecommendation,
} from "../../schemas/pipelineTypes";

// ────────────────────────────────────────────────────────────────────────
// Fixture helpers
// ────────────────────────────────────────────────────────────────────────

interface RecOpts {
  category?: RecommendationCategory;
  plan_section?: PlanSectionName | null;
  state_a_value?: number | [number, number];
  is_annual?: boolean;
  alternative_values?: QuantifiedImpact["alternative_values"];
  blocked_reason?: string;
  qualitative_phrasing?: string;
  pending_reconciliation?: boolean;
}

function makeRec(id: string, o: RecOpts = {}): SequencedRecommendation {
  const qi: QuantifiedImpact = {
    estimate: null,
    formula_id: null,
    formula_source_file: null,
    computation_inputs: {},
    pending_reconciliation: o.pending_reconciliation ?? false,
    alternative_values: o.alternative_values ?? [],
    qualitative_phrasing: o.qualitative_phrasing ?? null,
    reason_no_formula: null,
    blocked_inputs: [],
  };
  if (o.state_a_value !== undefined) {
    qi.estimate = { value: o.state_a_value, unit: "USD", is_annual: o.is_annual ?? false };
    qi.formula_id = `formula-${id}`;
  }
  if (o.blocked_reason) {
    qi.blocked_inputs = [
      {
        input_name: "x",
        blocked_reason: o.blocked_reason,
        source: "Stage 1",
        would_unblock_when: "Awaiting input",
      },
    ];
  }
  if ((o.alternative_values ?? []).length > 0) qi.pending_reconciliation = true;
  return {
    recommendation_id: id,
    source_file_path: `kb/v1_2/01_recommendations/${id}.md`,
    category: o.category ?? "Tax",
    status: "Active",
    position_in_sequence: 0,
    plan_section: o.plan_section ?? null,
    subsection_within_section: null,
    co_triggered_with: [],
    quantified_impact: qi,
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

const PTET_ALT: QuantifiedImpact["alternative_values"] = [
  {
    value: { value: 73000, unit: "USD", is_annual: true },
    formula_variant: "method_a",
    awaiting: "ptet_federal_savings_method",
    context: "A",
  },
  {
    value: { value: 148000, unit: "USD", is_annual: true },
    formula_variant: "method_b",
    awaiting: "ptet_federal_savings_method",
    context: "B",
  },
];

// ────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────

test("1. all State A contributors → clean sum, no flags", () => {
  const recs = [
    makeRec("REC-EST-006", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
      state_a_value: 3_000_000,
    }),
    makeRec("REC-EST-008", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
      state_a_value: 2_000_000,
    }),
    makeRec("REC-EST-004", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
      state_a_value: 500_000,
    }),
  ];
  const result = buildAggregateMetrics(makePlan(recs));
  assert.ok(!("_builder_status" in result));
  assert.equal(result.estate_tax_savings_total?.value, 5_500_000);
  assert.equal(result.estate_tax_savings_total?.unit, "USD");
  // No flags for this metric
  assert.ok(
    !result._aggregator_flags.metrics_with_partial_inputs.find(
      (m) => m.metric === "estate_tax_savings_total",
    ),
  );
  assert.ok(
    !result._aggregator_flags.metrics_skipped_due_to_pending_reconciliation.find(
      (m) => m.metric === "estate_tax_savings_total",
    ),
  );
  // Provenance: no hedge required
  assert.equal(result._metric_provenance.estate_tax_savings_total.requires_hedge, false);
  assert.equal(result._metric_provenance.estate_tax_savings_total.partial_ratio, 0);
});

test("2. partial below 50% → metric computed, requires_hedge true, flagged", () => {
  const recs = [
    makeRec("REC-EST-006", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
      state_a_value: 3_000_000,
    }),
    makeRec("REC-EST-008", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
      state_a_value: 2_000_000,
    }),
    makeRec("REC-EST-004", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
      state_a_value: 500_000,
    }),
    makeRec("REC-EST-010", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
      alternative_values: PTET_ALT,
    }),
  ];
  const result = buildAggregateMetrics(makePlan(recs));
  assert.ok(!("_builder_status" in result));
  assert.equal(result.estate_tax_savings_total?.value, 5_500_000);
  const partial = result._aggregator_flags.metrics_with_partial_inputs.find(
    (m) => m.metric === "estate_tax_savings_total",
  );
  assert.ok(partial, "expected metrics_with_partial_inputs for estate_tax_savings_total");
  assert.deepEqual(partial!.excluded_rec_ids, ["REC-EST-010"]);
  assert.equal(partial!.remaining_contributors, 3);
  assert.equal(result._metric_provenance.estate_tax_savings_total.requires_hedge, true);
  assert.equal(result._metric_provenance.estate_tax_savings_total.partial_ratio, 0.25);
});

test("3. partial above 50% → metric null, skipped flag set", () => {
  const recs = [
    makeRec("REC-EST-006", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
      state_a_value: 3_000_000,
    }),
    makeRec("REC-EST-007", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
      alternative_values: PTET_ALT,
    }),
    makeRec("REC-EST-008", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
      alternative_values: PTET_ALT,
    }),
    makeRec("REC-EST-009", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
      alternative_values: PTET_ALT,
    }),
  ];
  const result = buildAggregateMetrics(makePlan(recs));
  assert.ok(!("_builder_status" in result));
  assert.equal(result.estate_tax_savings_total, null);
  const skipped = result._aggregator_flags.metrics_skipped_due_to_pending_reconciliation.find(
    (m) => m.metric === "estate_tax_savings_total",
  );
  assert.ok(skipped, "expected skipped flag");
  assert.equal(skipped!.excluded_rec_ids.length, 3);
  assert.equal(result._metric_provenance.estate_tax_savings_total.partial_ratio, 0.75);
});

test("4. NumericRange summation: lows-to-lows, highs-to-highs", () => {
  const recs = [
    makeRec("REC-EST-006", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
      state_a_value: [2_000_000, 3_000_000],
    }),
    makeRec("REC-EST-008", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
      state_a_value: [1_500_000, 2_500_000],
    }),
  ];
  const result = buildAggregateMetrics(makePlan(recs));
  assert.ok(!("_builder_status" in result));
  const total = result.estate_tax_savings_total!;
  assert.ok(Array.isArray(total.value));
  assert.deepEqual(total.value, [3_500_000, 5_500_000]);
});

test("5. Holloway-style full run: all primary metrics populate, exposures present", () => {
  const recs = [
    // Estate (State A range)
    makeRec("REC-EST-006", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
      state_a_value: 3_000_000,
    }),
    makeRec("REC-EST-008", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
      state_a_value: [2_400_000, 4_000_000],
    }),
    makeRec("REC-EST-004", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
      state_a_value: 500_000,
    }),
    makeRec("REC-EST-001", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
      state_a_value: 250_000,
    }),
    // Tax — State C PTET (excluded), plus a State A annual
    makeRec("REC-TAX-001", {
      category: "Tax",
      plan_section: "Recommendations — Personal Tax",
      alternative_values: PTET_ALT,
    }),
    makeRec("REC-TAX-007", {
      category: "Tax",
      plan_section: "Recommendations — Personal Tax",
      state_a_value: [180_000, 280_000],
      is_annual: true,
    }),
    // Investment yield (State A annual)
    makeRec("REC-INV-001", {
      category: "Investment",
      plan_section: "Recommendations — Investment & Cash",
      state_a_value: 110_000,
      is_annual: true,
    }),
    // Insurance face amount (State A)
    makeRec("REC-RSK-001", {
      category: "Risk & Insurance",
      plan_section: "Recommendations — Risk & Insurance",
      state_a_value: 5_000_000,
    }),
    makeRec("REC-RSK-005", {
      category: "Risk & Insurance",
      plan_section: "Recommendations — Risk & Insurance",
      state_a_value: 10_000_000,
    }),
    // Entity (no $ contribution to a primary metric, but adds to exposures + cost)
    makeRec("REC-ENT-001", {
      category: "Entity Structure",
      plan_section: "Recommendations — Entity Structure",
      state_a_value: 50_000,
    }),
    makeRec("REC-ENT-002", {
      category: "Entity Structure",
      plan_section: "Recommendations — Entity Structure",
      state_a_value: 75_000,
    }),
  ];
  const result = buildAggregateMetrics(makePlan(recs), { transactionWindow: "18-30 months" });
  assert.ok(!("_builder_status" in result));

  // Primary metrics non-null
  assert.notEqual(result.estate_tax_savings_total, null);
  assert.notEqual(result.annual_income_tax_savings_total, null);
  assert.notEqual(result.annual_yield_capture_total, null);
  assert.notEqual(result.insurance_face_amount_total, null);
  assert.notEqual(result.recommended_implementation_cost_estimate, null);

  // Estate metric flags partial because PTET is in same section but not contributing
  // (REC-TAX-001 is in Personal Tax section though, so it doesn't partial estate)
  // Holloway: 4 estate recs all State A → clean sum
  assert.equal(result._metric_provenance.estate_tax_savings_total.partial_ratio, 0);

  // Tax: 1 State A + 1 State C → 1/2 = 0.5 partial_ratio (NOT > 0.5 → metric still computed)
  assert.notEqual(result.annual_income_tax_savings_total, null);
  assert.equal(result._metric_provenance.annual_income_tax_savings_total.partial_ratio, 0.5);
  assert.equal(result._metric_provenance.annual_income_tax_savings_total.requires_hedge, true);

  // Insurance face: 5M + 10M = 15M
  assert.equal(result.insurance_face_amount_total!.value, 15_000_000);

  // Structural exposures
  assert.ok(result.structural_exposures_eliminated.includes("unfunded buy/sell"));
  assert.ok(result.structural_exposures_eliminated.includes("real estate inside operating LLC"));
  assert.ok(result.structural_exposures_eliminated.includes("missing ILIT for estate liquidity"));
  assert.ok(result.structural_exposures_eliminated.includes("stale will"));
  assert.ok(result.structural_exposures_eliminated.includes("operating-LLC structure suboptimal for transaction"));
  assert.ok(result.structural_exposures_eliminated.includes("insufficient liability coverage"));

  // any_pending_reconciliations true (PTET)
  assert.equal(result.any_pending_reconciliations, true);

  // ROI framing populated
  assert.notEqual(result.roi_framing, null);
  assert.match(result.roi_framing!, /×/);

  // transaction_window threaded
  assert.equal(result.transaction_window, "18-30 months");
});

test("6. determinism: 100 invocations produce byte-identical output", () => {
  const recs = [
    makeRec("REC-EST-006", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
      state_a_value: [2_000_000, 3_000_000],
    }),
    makeRec("REC-EST-008", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
      state_a_value: 1_500_000,
    }),
    makeRec("REC-TAX-001", {
      category: "Tax",
      plan_section: "Recommendations — Personal Tax",
      alternative_values: PTET_ALT,
    }),
    makeRec("REC-TAX-007", {
      category: "Tax",
      plan_section: "Recommendations — Personal Tax",
      state_a_value: 100_000,
      is_annual: true,
    }),
    makeRec("REC-INV-001", {
      category: "Investment",
      plan_section: "Recommendations — Investment & Cash",
      state_a_value: 110_000,
      is_annual: true,
    }),
  ];
  const plan = makePlan(recs);
  const first = JSON.stringify(buildAggregateMetrics(plan));
  for (let i = 0; i < 99; i += 1) {
    const next = JSON.stringify(buildAggregateMetrics(plan));
    assert.equal(next, first, `iteration ${i + 2} diverged`);
  }
});

test("7. empty plan: all metrics null, exposures empty, no errors", () => {
  const result = buildAggregateMetrics(makePlan([]));
  assert.ok(!("_builder_status" in result));
  assert.equal(result.estate_tax_savings_total, null);
  assert.equal(result.annual_income_tax_savings_total, null);
  assert.equal(result.annual_yield_capture_total, null);
  assert.equal(result.insurance_face_amount_total, null);
  assert.equal(result.recommended_implementation_cost_estimate, null);
  assert.deepEqual(result.structural_exposures_eliminated, []);
  assert.equal(result.any_pending_reconciliations, false);
  assert.equal(result.transaction_window, null);
  assert.equal(result.roi_framing, null);
  assert.equal(result._aggregator_flags.metrics_with_partial_inputs.length, 0);
  assert.equal(result._aggregator_flags.metrics_skipped_due_to_pending_reconciliation.length, 0);
});

test("8. State C only metric: metric null, skipped flag set", () => {
  const recs = [
    makeRec("REC-TAX-001", {
      category: "Tax",
      plan_section: "Recommendations — Personal Tax",
      alternative_values: PTET_ALT,
    }),
    makeRec("REC-TAX-002", {
      category: "Tax",
      plan_section: "Recommendations — Personal Tax",
      alternative_values: PTET_ALT,
    }),
  ];
  const result = buildAggregateMetrics(makePlan(recs));
  assert.ok(!("_builder_status" in result));
  assert.equal(result.annual_income_tax_savings_total, null);
  const skipped = result._aggregator_flags.metrics_skipped_due_to_pending_reconciliation.find(
    (m) => m.metric === "annual_income_tax_savings_total",
  );
  assert.ok(skipped, "expected skipped flag for annual_income_tax_savings_total");
  assert.equal(skipped!.excluded_rec_ids.length, 2);
  assert.equal(result._metric_provenance.annual_income_tax_savings_total.partial_ratio, 1);
});
