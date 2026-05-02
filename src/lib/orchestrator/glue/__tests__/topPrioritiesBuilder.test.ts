import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTopPriorities, formatMoney, detectRenderingState } from "../topPrioritiesBuilder";
import type {
  PlanSectionName,
  QuantifiedImpact,
  RecommendationCategory,
  SequencedPlan,
  SequencedRecommendation,
  TimingBucket,
} from "../../schemas/pipelineTypes";

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

interface RecOpts {
  category?: RecommendationCategory;
  plan_section?: PlanSectionName | null;
  timing_bucket?: TimingBucket;
  default_excluded?: boolean;
  cluster_id?: string | null;
  // State A
  state_a_value?: number | [number, number];
  is_annual?: boolean;
  // State B
  blocked_reason?: string;
  // State C
  alternative_values?: QuantifiedImpact["alternative_values"];
  // State D
  qualitative_phrasing?: string;
}

function makeRec(id: string, o: RecOpts = {}): SequencedRecommendation {
  const qi: QuantifiedImpact = {
    estimate: null,
    formula_id: null,
    formula_source_file: null,
    computation_inputs: {},
    pending_reconciliation: false,
    alternative_values: [],
    qualitative_phrasing: null,
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
        input_name: "input_x",
        blocked_reason: o.blocked_reason,
        source: "Stage 1",
        would_unblock_when: "Awaiting client document",
      },
    ];
  }
  if (o.alternative_values) {
    qi.alternative_values = o.alternative_values;
    qi.pending_reconciliation = true;
  }
  if (o.qualitative_phrasing !== undefined) {
    qi.qualitative_phrasing = o.qualitative_phrasing;
  }

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
    timing_bucket: o.timing_bucket ?? "60-120 days",
    owner: "PSA",
    owner_name: null,
    decisions_needed: false,
    cluster_id: o.cluster_id ?? null,
    cluster_sequence_closer: null,
    action_items: [],
    landmine: false,
    landmine_status: "not_landmine",
    default_excluded: o.default_excluded ?? false,
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

const PTET_ALT_VALUES: QuantifiedImpact["alternative_values"] = [
  {
    value: { value: 38000, unit: "USD", is_annual: true },
    formula_variant: "ptet_method_a",
    awaiting: "ptet_federal_savings_method",
    context: "Federal savings via method A",
  },
  {
    value: { value: 26000, unit: "USD", is_annual: true },
    formula_variant: "ptet_method_b",
    awaiting: "ptet_federal_savings_method",
    context: "Federal savings via method B",
  },
];

// ────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────

test("formatMoney sig figs and K/M/B suffixes", () => {
  assert.equal(formatMoney(847), "$847");
  assert.equal(formatMoney(1234), "$1.23K");
  assert.equal(formatMoney(12345), "$12.3K");
  assert.equal(formatMoney(123456), "$123K");
  assert.equal(formatMoney(8_400_000), "$8.4M");
  assert.equal(formatMoney(9_876_543), "$9.88M");
  assert.equal(formatMoney(12_345_678), "$12M");
  assert.equal(formatMoney(123_456_789), "$120M");
  assert.equal(formatMoney(1_234_567_890), "$1.2B");
});

test("PRE-EXIT happy path: 5-row table, PTET (State C) renders as range", () => {
  const recs = [
    makeRec("REC-EST-001", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
      timing_bucket: "0-30 days",
      state_a_value: 200_000,
      is_annual: false,
    }),
    makeRec("REC-TAX-003", {
      category: "Tax",
      plan_section: "Recommendations — Personal Tax",
      timing_bucket: "0-30 days",
      state_a_value: 50_000,
      is_annual: true,
    }),
    makeRec("REC-ENT-001", {
      category: "Entity Structure",
      plan_section: "Recommendations — Entity Structure",
      timing_bucket: "0-30 days",
      state_a_value: 30_000,
      is_annual: true,
    }),
    makeRec("REC-TAX-001", {
      category: "Tax",
      plan_section: "Recommendations — Personal Tax",
      timing_bucket: "30-60 days",
      alternative_values: PTET_ALT_VALUES,
    }),
    makeRec("REC-INV-001", {
      category: "Investment",
      plan_section: "Recommendations — Investment & Cash",
      timing_bucket: "60-120 days",
      state_a_value: 15_000,
      is_annual: true,
    }),
    makeRec("REC-RET-001", {
      category: "Retirement",
      plan_section: "Recommendations — Retirement & Benefits",
      timing_bucket: "30-60 days",
      qualitative_phrasing: "Improves retirement income flexibility post-exit.",
    }),
    makeRec("REC-RIS-001", {
      category: "Risk & Insurance",
      plan_section: "Recommendations — Risk & Insurance",
      timing_bucket: "60-120 days",
      blocked_reason: "Disability insurance carrier quote pending",
    }),
    // Ineligible — wrong section
    makeRec("REC-IGN-OOS", {
      category: "Tax",
      plan_section: "Implementation Timeline",
      timing_bucket: "0-30 days",
      state_a_value: 999_999,
    }),
    // Ineligible — wrong timing
    makeRec("REC-IGN-TIME", {
      category: "Tax",
      plan_section: "Recommendations — Personal Tax",
      timing_bucket: "12-24 months",
      state_a_value: 999_999,
    }),
    // Ineligible — default_excluded
    makeRec("REC-IGN-LM", {
      category: "Tax",
      plan_section: "Recommendations — Personal Tax",
      timing_bucket: "0-30 days",
      state_a_value: 999_999,
      default_excluded: true,
    }),
  ];
  const plan = makePlan(recs);
  const result = buildTopPriorities(plan, null, "PRE");
  assert.ok(!("_builder_status" in result), `expected success, got ${JSON.stringify(result)}`);
  assert.equal(result.row_count, 5);
  const ids = result.selected_recommendations.map((r) => r.recommendation_id);
  assert.ok(ids.includes("REC-TAX-001"), `PTET expected in top 5, got ${ids.join(",")}`);
  // Ineligibles excluded
  assert.ok(!ids.includes("REC-IGN-OOS"));
  assert.ok(!ids.includes("REC-IGN-TIME"));
  assert.ok(!ids.includes("REC-IGN-LM"));
  // PTET rendered as range
  const ptet = result.selected_recommendations.find((r) => r.recommendation_id === "REC-TAX-001")!;
  assert.equal(ptet.rendering_state, "C");
  assert.match(ptet.rendered_estimated_impact, /\$26K[–-]\$38K\/yr pending firm policy/);
  // Markdown block has 5 data rows + headers
  assert.match(result.rendered_block, /\| 1 \|/);
  assert.match(result.rendered_block, /\| 5 \|/);
  assert.doesNotMatch(result.rendered_block, /\| 6 \|/);
  // Flags
  assert.equal(result._orchestrator_flags.top_priorities_count_below_default, false);
  assert.equal(result._orchestrator_flags.pending_firm_policy_in_table, 1);
});

test("fewer than 5 eligible → flag set", () => {
  const recs = [
    makeRec("REC-A", {
      category: "Tax",
      plan_section: "Recommendations — Personal Tax",
      timing_bucket: "0-30 days",
      state_a_value: 10_000,
      is_annual: true,
    }),
    makeRec("REC-B", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
      timing_bucket: "30-60 days",
      state_a_value: 50_000,
      is_annual: false,
    }),
    makeRec("REC-C", {
      category: "Investment",
      plan_section: "Recommendations — Investment & Cash",
      timing_bucket: "60-120 days",
      qualitative_phrasing: "Improves portfolio efficiency.",
    }),
  ];
  const plan = makePlan(recs);
  const result = buildTopPriorities(plan, null, "PRE");
  assert.ok(!("_builder_status" in result));
  assert.equal(result.row_count, 3);
  assert.equal(result._orchestrator_flags.top_priorities_count_below_default, true);
});

test("all State D: no fabrication, qualitative phrasings rendered", () => {
  const recs = [
    makeRec("REC-D1", {
      category: "Tax",
      plan_section: "Recommendations — Personal Tax",
      timing_bucket: "0-30 days",
      qualitative_phrasing: "Improves family communication around wealth.",
    }),
    makeRec("REC-D2", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
      timing_bucket: "30-60 days",
      qualitative_phrasing: "Strengthens governance for the family foundation.",
    }),
    makeRec("REC-D3", {
      category: "Family",
      plan_section: "Recommendations — Family",
      timing_bucket: "60-120 days",
      qualitative_phrasing: "Aligns successor expectations on roles and timing.",
    }),
    makeRec("REC-D4", {
      category: "Investment",
      plan_section: "Recommendations — Investment & Cash",
      timing_bucket: "0-30 days",
      qualitative_phrasing: "Codifies investment policy statement updates.",
    }),
    makeRec("REC-D5", {
      category: "Retirement",
      plan_section: "Recommendations — Retirement & Benefits",
      timing_bucket: "30-60 days",
      qualitative_phrasing: "Maps benefit elections post-transaction.",
    }),
  ];
  const plan = makePlan(recs);
  const result = buildTopPriorities(plan, null, "PRE");
  assert.ok(!("_builder_status" in result));
  assert.equal(result.row_count, 5);
  for (const row of result.selected_recommendations) {
    assert.equal(row.rendering_state, "D");
    // No fabricated $ amounts
    assert.doesNotMatch(row.rendered_estimated_impact, /\$/);
    // Phrasing must be derived from the rec's qualitative_phrasing
    const src = recs.find((r) => r.recommendation_id === row.recommendation_id)!;
    assert.equal(row.rendered_estimated_impact, src.quantified_impact.qualitative_phrasing);
  }
  // No alternative-form leakage
  assert.doesNotMatch(result.rendered_block, /pending firm policy/);
  assert.doesNotMatch(result.rendered_block, /approximately/);
  assert.equal(result._orchestrator_flags.qualitative_phrasings_in_table, 5);
});

test("State C canary: alternative_values render as range, NEVER single value", () => {
  const recs = [
    makeRec("REC-C-MULTI", {
      category: "Tax",
      plan_section: "Recommendations — Personal Tax",
      timing_bucket: "30-60 days",
      alternative_values: [
        {
          value: { value: 38000, unit: "USD", is_annual: true },
          formula_variant: "method_a",
          awaiting: "ptet_federal_savings_method",
          context: "A",
        },
        {
          value: { value: 26000, unit: "USD", is_annual: true },
          formula_variant: "method_b",
          awaiting: "ptet_federal_savings_method",
          context: "B",
        },
      ],
    }),
    // Single alternative_value → still range (low === high), never single rendering
    makeRec("REC-C-SINGLE", {
      category: "Tax",
      plan_section: "Recommendations — Personal Tax",
      timing_bucket: "0-30 days",
      alternative_values: [
        {
          value: { value: 12000, unit: "USD", is_annual: true },
          formula_variant: "method_only",
          awaiting: "default_grat_term",
          context: "Single alt awaiting policy",
        },
      ],
    }),
  ];
  const plan = makePlan(recs);
  const result = buildTopPriorities(plan, null, "PRE");
  assert.ok(!("_builder_status" in result));

  const multi = result.selected_recommendations.find((r) => r.recommendation_id === "REC-C-MULTI")!;
  assert.equal(multi.rendering_state, "C");
  assert.match(multi.rendered_estimated_impact, /\$26K[–-]\$38K\/yr pending firm policy/);
  // Must not be a bare "approximately $X/yr" form
  assert.doesNotMatch(multi.rendered_estimated_impact, /^approximately/);

  const single = result.selected_recommendations.find((r) => r.recommendation_id === "REC-C-SINGLE")!;
  assert.equal(single.rendering_state, "C");
  // Even with a single alternative value, the range form must be used.
  assert.match(single.rendered_estimated_impact, /\$12K[–-]\$12K\/yr pending firm policy/);
  assert.doesNotMatch(single.rendered_estimated_impact, /^approximately/);
});

test("determinism: 100 invocations produce byte-identical output", () => {
  const recs = [
    makeRec("REC-EST-001", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
      timing_bucket: "0-30 days",
      state_a_value: 200_000,
      is_annual: false,
    }),
    makeRec("REC-TAX-003", {
      category: "Tax",
      plan_section: "Recommendations — Personal Tax",
      timing_bucket: "0-30 days",
      state_a_value: 50_000,
      is_annual: true,
    }),
    makeRec("REC-ENT-001", {
      category: "Entity Structure",
      plan_section: "Recommendations — Entity Structure",
      timing_bucket: "0-30 days",
      state_a_value: 30_000,
      is_annual: true,
    }),
    makeRec("REC-TAX-001", {
      category: "Tax",
      plan_section: "Recommendations — Personal Tax",
      timing_bucket: "30-60 days",
      alternative_values: PTET_ALT_VALUES,
    }),
    makeRec("REC-INV-001", {
      category: "Investment",
      plan_section: "Recommendations — Investment & Cash",
      timing_bucket: "60-120 days",
      state_a_value: 15_000,
      is_annual: true,
    }),
    makeRec("REC-RET-001", {
      category: "Retirement",
      plan_section: "Recommendations — Retirement & Benefits",
      timing_bucket: "30-60 days",
      qualitative_phrasing: "Improves retirement income flexibility post-exit.",
    }),
    makeRec("REC-RIS-001", {
      category: "Risk & Insurance",
      plan_section: "Recommendations — Risk & Insurance",
      timing_bucket: "60-120 days",
      blocked_reason: "Disability insurance carrier quote pending",
    }),
  ];
  const plan = makePlan(recs);
  const first = JSON.stringify(buildTopPriorities(plan, null, "PRE"));
  for (let i = 0; i < 99; i += 1) {
    const next = JSON.stringify(buildTopPriorities(plan, null, "PRE"));
    assert.equal(next, first, `iteration ${i + 2} diverged`);
  }
});

test("detectRenderingState ordering: A > C > B > D", () => {
  // estimate present + alternative_values present → C wins (alternative_values triggers C, blocks A)
  const recC = makeRec("R", {
    state_a_value: 100,
    alternative_values: [
      {
        value: { value: 50, unit: "USD" },
        formula_variant: "v",
        awaiting: "default_grat_term",
        context: "ctx",
      },
    ],
  });
  assert.equal(detectRenderingState(recC), "C");

  // alternative_values + blocked_inputs → C wins over B
  const recCBlocked = makeRec("R", {
    blocked_reason: "missing input",
    alternative_values: [
      {
        value: { value: 50, unit: "USD" },
        formula_variant: "v",
        awaiting: "default_grat_term",
        context: "ctx",
      },
    ],
  });
  assert.equal(detectRenderingState(recCBlocked), "C");

  // blocked_inputs only → B
  const recB = makeRec("R", { blocked_reason: "missing" });
  assert.equal(detectRenderingState(recB), "B");

  // qualitative only → D
  const recD = makeRec("R", { qualitative_phrasing: "qualitative" });
  assert.equal(detectRenderingState(recD), "D");
});
