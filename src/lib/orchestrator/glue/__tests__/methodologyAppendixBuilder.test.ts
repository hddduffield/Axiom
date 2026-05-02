import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMethodologyAppendix } from "../methodologyAppendixBuilder";
import { buildAggregateMetrics } from "../aggregateMetricsBuilder";
import type {
  AggregateMetrics,
  PlanSectionName,
  QuantifiedImpact,
  RecommendationCategory,
  SequencedPlan,
  SequencedRecommendation,
  SequencerMetadata,
} from "../../schemas/pipelineTypes";

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

interface RecOpts {
  category?: RecommendationCategory;
  plan_section?: PlanSectionName | null;
  state_a_value?: number | [number, number];
  is_annual?: boolean;
  alternative_values?: QuantifiedImpact["alternative_values"];
  blocked_reason?: string;
  qualitative_phrasing?: string;
  computation_inputs?: Record<string, unknown>;
  formula_id?: string | null;
  formula_source_file?: string | null;
}

function makeRec(id: string, o: RecOpts = {}): SequencedRecommendation {
  const qi: QuantifiedImpact = {
    estimate: null,
    formula_id: o.formula_id ?? null,
    formula_source_file: o.formula_source_file ?? null,
    computation_inputs: o.computation_inputs ?? {},
    pending_reconciliation: false,
    alternative_values: o.alternative_values ?? [],
    qualitative_phrasing: o.qualitative_phrasing ?? null,
    reason_no_formula: null,
    blocked_inputs: [],
  };
  if (o.state_a_value !== undefined) {
    qi.estimate = { value: o.state_a_value, unit: "USD", is_annual: o.is_annual ?? false };
    if (qi.formula_id === null) qi.formula_id = `formula-${id}`;
    if (qi.formula_source_file === null) qi.formula_source_file = `kb/v1_2/02_reference/${id}.md`;
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

function defaultRatesSnapshot(): SequencerMetadata["volatile_rates_snapshot"] {
  return {
    s7520_rate: 0,
    s7520_month: "",
    afr_short_annual: null,
    afr_mid_annual: null,
    afr_long_annual: null,
    last_refreshed: "",
    days_since_refresh: 0,
  };
}

function populatedRatesSnapshot(): SequencerMetadata["volatile_rates_snapshot"] {
  return {
    s7520_rate: 5.0,
    s7520_month: "May 2026",
    afr_short_annual: 4.85,
    afr_mid_annual: 4.6,
    afr_long_annual: 4.75,
    last_refreshed: "2026-04-19",
    days_since_refresh: 12,
  };
}

function makePlan(
  recs: SequencedRecommendation[],
  overrides: { rates?: SequencerMetadata["volatile_rates_snapshot"]; firmPolicy?: SequencerMetadata["firm_policy_resolutions_applied"] } = {},
): SequencedPlan {
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
      volatile_rates_snapshot: overrides.rates ?? defaultRatesSnapshot(),
      firm_policy_resolutions_applied: overrides.firmPolicy ?? [],
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

const PTET_ALT: QuantifiedImpact["alternative_values"] = [
  {
    value: { value: 73000, unit: "USD", is_annual: true },
    formula_variant: "method_a",
    awaiting: "ptet_federal_savings_method",
    context: "Federal savings via method A",
  },
  {
    value: { value: 148000, unit: "USD", is_annual: true },
    formula_variant: "method_b",
    awaiting: "ptet_federal_savings_method",
    context: "Federal savings via method B",
  },
];

// ────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────

test("1. Holloway-style fixture: appendix contains all major sections", () => {
  const recs = [
    makeRec("REC-EST-006", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
      state_a_value: 3_000_000,
      computation_inputs: { exemption_remaining: 13_990_000, s7520_rate: 5.0, grat_term_years: 5 },
    }),
    makeRec("REC-EST-008", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
      state_a_value: [2_400_000, 4_000_000],
      computation_inputs: { discount_rate: 0.35, afr_long_annual: 4.75 },
    }),
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
      computation_inputs: { passive_activity_grouping: true },
    }),
    makeRec("REC-INV-001", {
      category: "Investment",
      plan_section: "Recommendations — Investment & Cash",
      state_a_value: 110_000,
      is_annual: true,
    }),
    // State D — should be excluded from per-rec entries
    makeRec("REC-FAM-001", {
      category: "Family",
      plan_section: "Recommendations — Family",
      qualitative_phrasing: "Strengthens family governance.",
    }),
  ];
  const plan = makePlan(recs, { rates: populatedRatesSnapshot() });
  const aggregates = buildAggregateMetrics(plan);
  assert.ok(!("_builder_status" in aggregates));

  const result = buildMethodologyAppendix(plan, aggregates);
  assert.ok(!("_builder_status" in result));

  // Major sections present
  assert.match(result.rendered_appendix, /## Methodology Appendix/);
  assert.match(result.rendered_appendix, /### Volatile Rates Snapshot/);
  assert.match(result.rendered_appendix, /### Firm-Policy Resolutions Applied/);
  assert.match(result.rendered_appendix, /### Per-Recommendation Methodology/);
  assert.match(result.rendered_appendix, /### Aggregate Metric Methodology/);

  // Volatile rates rendered with populated values (2 decimal places)
  assert.match(result.rendered_appendix, /5\.00% \(May 2026\)/);
  assert.match(result.rendered_appendix, /AFR Short-term:\*\* 4\.85%/);

  // Per-rec entries present for State A and State C; State D excluded
  const ids = result.per_rec_entries.map((e) => e.recommendation_id);
  assert.ok(ids.includes("REC-EST-006"));
  assert.ok(ids.includes("REC-EST-008"));
  assert.ok(ids.includes("REC-TAX-001"));
  assert.ok(ids.includes("REC-TAX-007"));
  assert.ok(ids.includes("REC-INV-001"));
  assert.ok(!ids.includes("REC-FAM-001"), "State D rec should be excluded from per-rec entries");

  // Aggregate entries
  assert.ok(result.aggregate_count >= 1);
  assert.match(result.rendered_appendix, /### Aggregate: estate_tax_savings_total/);
});

test("2. State C rec rendering: alternative_values listed with formula_variants", () => {
  const recs = [
    makeRec("REC-TAX-001", {
      category: "Tax",
      plan_section: "Recommendations — Personal Tax",
      alternative_values: PTET_ALT,
    }),
  ];
  const plan = makePlan(recs);
  const result = buildMethodologyAppendix(plan, null);
  assert.ok(!("_builder_status" in result));
  const entry = result.per_rec_entries.find((e) => e.recommendation_id === "REC-TAX-001")!;
  assert.equal(entry.alternative_values_considered.length, 2);
  assert.match(entry.rendered_block, /method_a/);
  assert.match(entry.rendered_block, /method_b/);
  assert.match(entry.rendered_block, /\$73K/);
  assert.match(entry.rendered_block, /\$148K/);
  assert.match(entry.rendered_block, /awaiting ptet_federal_savings_method/);
});

test("3. Pending reconciliation rec renders with Decisions Needed pointer", () => {
  const recs = [
    makeRec("REC-TAX-001", {
      category: "Tax",
      plan_section: "Recommendations — Personal Tax",
      alternative_values: PTET_ALT,
    }),
  ];
  const plan = makePlan(recs);
  const result = buildMethodologyAppendix(plan, null);
  assert.ok(!("_builder_status" in result));
  const entry = result.per_rec_entries[0];
  assert.equal(entry.pending_reconciliation, true);
  assert.match(entry.rendered_block, /Pending reconciliation:\*\* Yes — see Decisions Needed page/);
  assert.deepEqual(result._orchestrator_flags.recs_pending_reconciliation_in_appendix, ["REC-TAX-001"]);
});

test("4. Null aggregate rendering: 'Computed value: Null (skipped)' format", () => {
  // Build a fixture where estate metric is null due to >50% State C.
  const recs = [
    makeRec("REC-EST-001", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
      alternative_values: PTET_ALT,
    }),
    makeRec("REC-EST-002", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
      alternative_values: PTET_ALT,
    }),
    makeRec("REC-EST-003", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
      alternative_values: PTET_ALT,
    }),
    makeRec("REC-EST-004", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
      state_a_value: 1_000_000,
    }),
  ];
  const plan = makePlan(recs);
  const aggregates = buildAggregateMetrics(plan);
  assert.ok(!("_builder_status" in aggregates));
  assert.equal(aggregates.estate_tax_savings_total, null);

  const result = buildMethodologyAppendix(plan, aggregates);
  assert.ok(!("_builder_status" in result));
  // The aggregate entry for estate should render as "Null (skipped)" with reason
  assert.match(result.rendered_appendix, /### Aggregate: estate_tax_savings_total\n[\s\S]*Computed value:\*\* Null \(skipped\)/);
  assert.match(result.rendered_appendix, /Reason:\*\* 3 of 4 contributing recommendations are pending reconciliation/);
  assert.ok(result._orchestrator_flags.aggregates_skipped_in_appendix.includes("estate_tax_savings_total"));
});

test("5. Empty plan: appendix renders snapshot blocks; per-rec section says 'No quantified recommendations'", () => {
  const plan = makePlan([]);
  const result = buildMethodologyAppendix(plan, null);
  assert.ok(!("_builder_status" in result));
  assert.equal(result.rec_count, 0);
  assert.match(result.rendered_appendix, /### Volatile Rates Snapshot/);
  assert.match(result.rendered_appendix, /Pending refresh/);
  assert.match(result.rendered_appendix, /No firm-policy resolutions applied/);
  assert.match(result.rendered_appendix, /No quantified recommendations in this plan/);
});

test("6. determinism: 100 invocations produce byte-identical output", () => {
  const recs = [
    makeRec("REC-EST-006", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
      state_a_value: 3_000_000,
      computation_inputs: { exemption: 13_990_000, s7520_rate: 5.0 },
    }),
    makeRec("REC-TAX-001", {
      category: "Tax",
      plan_section: "Recommendations — Personal Tax",
      alternative_values: PTET_ALT,
    }),
    makeRec("REC-INV-001", {
      category: "Investment",
      plan_section: "Recommendations — Investment & Cash",
      state_a_value: 110_000,
      is_annual: true,
    }),
  ];
  const plan = makePlan(recs, { rates: populatedRatesSnapshot() });
  const aggregates = buildAggregateMetrics(plan);
  const first = JSON.stringify(buildMethodologyAppendix(plan, aggregates as AggregateMetrics));
  for (let i = 0; i < 99; i += 1) {
    const next = JSON.stringify(buildMethodologyAppendix(plan, aggregates as AggregateMetrics));
    assert.equal(next, first, `iteration ${i + 2} diverged`);
  }
});

test("7. sorting: per-rec entries sorted by plan_section then rec_id; aggregates alphabetical", () => {
  const recs = [
    makeRec("REC-TAX-005", {
      category: "Tax",
      plan_section: "Recommendations — Personal Tax",
      state_a_value: 50_000,
      is_annual: true,
    }),
    makeRec("REC-EST-009", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
      state_a_value: 100_000,
    }),
    makeRec("REC-EST-001", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
      state_a_value: 200_000,
    }),
    makeRec("REC-INV-002", {
      category: "Investment",
      plan_section: "Recommendations — Investment & Cash",
      state_a_value: 30_000,
      is_annual: true,
    }),
  ];
  const plan = makePlan(recs);
  const aggregates = buildAggregateMetrics(plan);
  const result = buildMethodologyAppendix(plan, aggregates as AggregateMetrics);
  assert.ok(!("_builder_status" in result));

  // Plan sections sort alphabetically: "Recommendations — Estate Planning" < "Recommendations — Investment & Cash" < "Recommendations — Personal Tax"
  const orderedIds = result.per_rec_entries.map((e) => e.recommendation_id);
  assert.deepEqual(orderedIds, [
    "REC-EST-001", // Estate Planning, alphabetically first
    "REC-EST-009", // Estate Planning
    "REC-INV-002", // Investment & Cash
    "REC-TAX-005", // Personal Tax
  ]);

  // Aggregates appear in alphabetical order in the rendered appendix.
  const aggregateOrder = [
    "annual_income_tax_savings_total",
    "annual_yield_capture_total",
    "estate_tax_savings_total",
    "insurance_face_amount_total",
    "recommended_implementation_cost_estimate",
  ];
  let lastIdx = -1;
  for (const name of aggregateOrder) {
    const idx = result.rendered_appendix.indexOf(`### Aggregate: ${name}`);
    assert.ok(idx > lastIdx, `${name} should appear after preceding aggregate; lastIdx=${lastIdx}, idx=${idx}`);
    lastIdx = idx;
  }
});

test("8. State D excluded from per-rec entries but referenced in aggregate methodology", () => {
  const recs = [
    makeRec("REC-EST-001", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
      state_a_value: 1_000_000,
    }),
    makeRec("REC-EST-002", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
      state_a_value: 500_000,
    }),
    // State D — qualitative-only Estate rec contributes to aggregate as qualitative_only
    makeRec("REC-EST-003", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
      qualitative_phrasing: "Improves family wealth governance.",
    }),
  ];
  const plan = makePlan(recs);
  const aggregates = buildAggregateMetrics(plan);
  assert.ok(!("_builder_status" in aggregates));

  const result = buildMethodologyAppendix(plan, aggregates);
  assert.ok(!("_builder_status" in result));

  // Per-rec entries: State D rec excluded
  const perRecIds = result.per_rec_entries.map((e) => e.recommendation_id);
  assert.ok(!perRecIds.includes("REC-EST-003"));

  // Aggregate methodology references qualitative-only contributors
  assert.match(
    result.rendered_appendix,
    /Qualitative-only contributors \(counted as zero\):\*\* REC-EST-003/,
  );
});

test("volatile rates: populated values render correctly", () => {
  const plan = makePlan([], { rates: populatedRatesSnapshot() });
  const result = buildMethodologyAppendix(plan, null);
  assert.ok(!("_builder_status" in result));
  assert.match(result.rendered_appendix, /§7520 rate:\*\* 5\.00% \(May 2026\)/);
  assert.match(result.rendered_appendix, /AFR Short-term:\*\* 4\.85%/);
  assert.match(result.rendered_appendix, /AFR Mid-term:\*\* 4\.60%/);
  assert.match(result.rendered_appendix, /Last refreshed:\*\* 2026-04-19/);
});

test("State B coverage: blocked rec appears with full blocked_inputs detail, no fabricated estimate", () => {
  const recs = [
    makeRec("REC-EST-005", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
      blocked_reason: "AFR mid-term refresh pending; computation cannot proceed",
      formula_id: "intra_family_loan_v2",
      formula_source_file: "kb/v1_2/02_reference/08_volatile_rates_lookup.md",
    }),
  ];
  // Force pending_reconciliation: true on the State B rec so the appendix flags it.
  recs[0].quantified_impact.pending_reconciliation = true;
  const plan = makePlan(recs, { rates: populatedRatesSnapshot() });
  const result = buildMethodologyAppendix(plan, null);
  assert.ok(!("_builder_status" in result));

  // Rec appears in per-rec entries (because includeStateBRecs default is true)
  const entry = result.per_rec_entries.find((e) => e.recommendation_id === "REC-EST-005");
  assert.ok(entry, "State B rec should appear in per-rec entries");

  // blocked_inputs surfaced with all four fields
  assert.equal(entry!.blocked_inputs.length, 1);
  const bi = entry!.blocked_inputs[0];
  assert.equal(bi.input_name, "x");
  assert.equal(bi.blocked_reason, "AFR mid-term refresh pending; computation cannot proceed");
  assert.equal(bi.source, "Stage 1");
  assert.equal(bi.would_unblock_when, "Awaiting input");

  // Rendered block contains all four blocked-input fields
  assert.match(entry!.rendered_block, /x: AFR mid-term refresh pending/);
  assert.match(entry!.rendered_block, /source: Stage 1/);
  assert.match(entry!.rendered_block, /unblocks when Awaiting input/);

  // Pending reconciliation surfaced and pointed at Decisions Needed
  assert.equal(entry!.pending_reconciliation, true);
  assert.match(entry!.rendered_block, /Pending reconciliation:\*\* Yes — see Decisions Needed page/);
  assert.ok(result._orchestrator_flags.recs_pending_reconciliation_in_appendix.includes("REC-EST-005"));

  // Estimate is null/blocked, NOT fabricated.
  // (No state_a_value passed, so estimate remained null in the fixture.)
  assert.equal(entry!.formula_id, "intra_family_loan_v2");
  assert.match(entry!.rendered_block, /Computed estimate:\*\* \(none\)/);
  assert.match(entry!.rendered_block, /Exact estimate:\*\* null/);
  // No dollar amount fabricated for this rec
  assert.doesNotMatch(entry!.rendered_block, /Computed estimate:\*\* \$/);

  // includeStateBRecs: false should drop it
  const resultExcluded = buildMethodologyAppendix(plan, null, { includeStateBRecs: false });
  assert.ok(!("_builder_status" in resultExcluded));
  assert.equal(
    resultExcluded.per_rec_entries.find((e) => e.recommendation_id === "REC-EST-005"),
    undefined,
    "State B rec should be dropped when includeStateBRecs: false",
  );
});

test("firm-policy resolutions: render when present", () => {
  const plan = makePlan([], {
    firmPolicy: [
      {
        question_id: "ptet_federal_savings_method",
        resolved_value: "method_a",
        resolved_by: "WB-001",
        applied_to_recs: ["REC-TAX-001"],
      },
    ],
  });
  const result = buildMethodologyAppendix(plan, null);
  assert.ok(!("_builder_status" in result));
  assert.match(result.rendered_appendix, /ptet_federal_savings_method/);
  assert.match(result.rendered_appendix, /resolved by WB-001/);
});
