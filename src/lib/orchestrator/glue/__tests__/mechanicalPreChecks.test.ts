import { test } from "node:test";
import assert from "node:assert/strict";
import { runMechanicalPreChecks } from "../mechanicalPreChecks";
import type {
  AggregateMetrics,
  PlanSectionName,
  QuantifiedImpact,
  RecommendationCategory,
  SequencedPlan,
  SequencedRecommendation,
  StatuteReferenceData,
} from "../../schemas/pipelineTypes";

// ────────────────────────────────────────────────────────────────────────
// Fixture helpers
// ────────────────────────────────────────────────────────────────────────

interface RecOpts {
  category?: RecommendationCategory;
  plan_section?: PlanSectionName | null;
  state_a_value?: number | [number, number];
  alternative_values?: QuantifiedImpact["alternative_values"];
  blocked_reason?: string;
  qualitative_phrasing?: string;
  co_triggered_with?: string[];
  is_annual?: boolean;
}

function makeRec(id: string, o: RecOpts = {}): SequencedRecommendation {
  const qi: QuantifiedImpact = {
    estimate: null,
    formula_id: null,
    formula_source_file: null,
    computation_inputs: {},
    pending_reconciliation: false,
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
    co_triggered_with: o.co_triggered_with ?? [],
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

const DEFAULT_STATUTE: StatuteReferenceData = {
  current_estate_exemption_year: 2026,
  tcja_expiration: "2025-12-31",
  obbba_enactment: "2025-07-04",
  current_year: 2026,
};

const PTET_ALT: QuantifiedImpact["alternative_values"] = [
  {
    value: { value: 73000, unit: "USD", is_annual: true },
    formula_variant: "ptet_method_a",
    awaiting: "ptet_federal_savings_method",
    context: "A",
  },
  {
    value: { value: 148000, unit: "USD", is_annual: true },
    formula_variant: "ptet_method_b",
    awaiting: "ptet_federal_savings_method",
    context: "B",
  },
];

// ────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────

test("1. Pre-Check 1: clean plan, all numbers in whitelist → passed", () => {
  const recs = [
    makeRec("REC-EST-006", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
      state_a_value: 3_000_000,
    }),
    makeRec("REC-TAX-007", {
      category: "Tax",
      plan_section: "Recommendations — Personal Tax",
      state_a_value: 73000,
      is_annual: true,
    }),
  ];
  const plan = makePlan(recs);
  const markdown = "The estate strategy yields $3,000,000 in savings; the §469 grouping yields $73,000/yr.";
  const result = runMechanicalPreChecks(markdown, plan, null);
  assert.ok(!("_builder_status" in result));
  assert.equal(result.checks.number_coherence.status, "passed");
  assert.equal(result.overall_status, "passed");
  assert.equal(result._orchestrator_flags.state_c_alternative_value_protection_fired, false);
});

test("2. Pre-Check 1: number off by rounding → failed_auto_fixed", () => {
  const recs = [
    makeRec("REC-EST-006", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
      state_a_value: 73112,
    }),
  ];
  const plan = makePlan(recs);
  const markdown = "The strategy yields approximately $73K in savings.";
  const result = runMechanicalPreChecks(markdown, plan, null);
  assert.ok(!("_builder_status" in result));
  assert.equal(result.checks.number_coherence.status, "failed_auto_fixed");
  assert.equal(result.overall_status, "failed_auto_fixed");
  assert.equal(result.auto_fixed_issues.length, 1);
  const issue = result.auto_fixed_issues[0];
  assert.equal(issue.severity, "auto_fixable");
  assert.equal(issue.matched_value, "$73K");
  assert.match(issue.expected_value!, /\$73\.1K/);
  assert.equal(result._orchestrator_flags.state_c_alternative_value_protection_fired, false);
});

test("3. STATE C PROTECTION CANARY: alt-value match never auto-fixes", () => {
  const recs = [
    makeRec("REC-TAX-001", {
      category: "Tax",
      plan_section: "Recommendations — Personal Tax",
      alternative_values: PTET_ALT,
    }),
  ];
  const plan = makePlan(recs);
  // Prose cites $73K, which is one of the alternative values for REC-TAX-001.
  const markdown = "The PTET strategy yields $73K in savings.";
  const result = runMechanicalPreChecks(markdown, plan, null);
  assert.ok(!("_builder_status" in result));
  // CANARY ASSERTIONS:
  assert.equal(
    result._orchestrator_flags.state_c_alternative_value_protection_fired,
    true,
    "state_c_alternative_value_protection_fired flag MUST be true",
  );
  assert.equal(
    result.checks.number_coherence.status,
    "failed_blocked",
    "number_coherence MUST be failed_blocked, NOT failed_auto_fixed",
  );
  assert.equal(
    result.overall_status,
    "failed_blocked",
    "overall_status MUST be failed_blocked",
  );
  // Auto-fix MUST NOT have been applied
  assert.equal(result.auto_fixed_issues.length, 0, "no issues should be auto-fixed");
  assert.ok(result.blocked_issues.length >= 1, "at least one blocked issue expected");
  const issue = result.blocked_issues.find(
    (i) => i.check_name === "number_coherence" && i.matched_value === "$73K",
  );
  assert.ok(issue, "issue describing the alt-value match must be present");
  assert.match(issue!.description, /alternative value/i);
});

test("4. Pre-Check 1: fabricated number not in whitelist → failed_blocked", () => {
  const recs = [
    makeRec("REC-EST-006", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
      state_a_value: 73000,
    }),
  ];
  const plan = makePlan(recs);
  const markdown = "The strategy yields $1.2M in savings.";
  const result = runMechanicalPreChecks(markdown, plan, null);
  assert.ok(!("_builder_status" in result));
  assert.equal(result.checks.number_coherence.status, "failed_blocked");
  assert.equal(result.auto_fixed_issues.length, 0);
  assert.ok(result.blocked_issues.some((i) => i.matched_value === "$1.2M"));
});

test("5. Pre-Check 2: statute references all current → passed", () => {
  const plan = makePlan([]);
  const markdown =
    "The 2026 estate exemption stands at $13.99M. IRC §7520 governs valuation under TCJA and OBBBA.";
  const result = runMechanicalPreChecks(markdown, plan, null, {
    statuteReferenceData: DEFAULT_STATUTE,
  });
  assert.ok(!("_builder_status" in result));
  assert.equal(result.checks.statute_consistency.status, "passed");
});

test("6. Pre-Check 2: stale year reference → failed_blocked", () => {
  const plan = makePlan([]);
  const markdown = "The 2024 estate exemption applies here.";
  const result = runMechanicalPreChecks(markdown, plan, null, {
    statuteReferenceData: DEFAULT_STATUTE,
  });
  assert.ok(!("_builder_status" in result));
  assert.equal(result.checks.statute_consistency.status, "failed_blocked");
  assert.equal(result.overall_status, "failed_blocked");
  const issue = result.blocked_issues.find((i) => i.check_name === "statute_consistency");
  assert.ok(issue);
  assert.match(issue!.description, /Stale/);
});

test("7. Pre-Check 3: entity first-mention pattern correct → passed", () => {
  const plan = makePlan([]);
  const markdown =
    "Holloway Industrial Solutions, LLC ('HIS') was founded in 2009. HIS provides specialty mechanical contracting services across the Southeast.";
  const result = runMechanicalPreChecks(markdown, plan, null, {
    entityShortNames: new Map([["Holloway Industrial Solutions, LLC", "HIS"]]),
  });
  assert.ok(!("_builder_status" in result));
  assert.equal(result.checks.entity_name_consistency.status, "passed");
});

test("8. Pre-Check 3: short form before legal name → failed_blocked", () => {
  const plan = makePlan([]);
  const markdown =
    "HIS provides services across the region. Holloway Industrial Solutions, LLC was founded in 2009.";
  const result = runMechanicalPreChecks(markdown, plan, null, {
    entityShortNames: new Map([["Holloway Industrial Solutions, LLC", "HIS"]]),
  });
  assert.ok(!("_builder_status" in result));
  assert.equal(result.checks.entity_name_consistency.status, "failed_blocked");
  const issue = result.blocked_issues.find((i) => i.check_name === "entity_name_consistency");
  assert.ok(issue);
  assert.match(issue!.description, /before/);
});

test("9. Pre-Check 4: cascade complete in prose → passed", () => {
  const recs = [
    makeRec("REC-ENT-001", {
      category: "Entity Structure",
      plan_section: "Recommendations — Entity Structure",
      co_triggered_with: ["REC-ENT-002", "REC-EST-006"],
    }),
    makeRec("REC-ENT-002", {
      category: "Entity Structure",
      plan_section: "Recommendations — Entity Structure",
    }),
    makeRec("REC-EST-006", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
    }),
  ];
  const plan = makePlan(recs);
  const markdown =
    "REC-ENT-001 triggers downstream work. REC-ENT-002 follows directly; REC-EST-006 closes the cascade.";
  const result = runMechanicalPreChecks(markdown, plan, null);
  assert.ok(!("_builder_status" in result));
  assert.equal(result.checks.cascade_integrity.status, "passed");
});

test("10. Pre-Check 4: missing cascade member → failed_blocked", () => {
  const recs = [
    makeRec("REC-ENT-001", {
      category: "Entity Structure",
      plan_section: "Recommendations — Entity Structure",
      co_triggered_with: ["REC-ENT-002", "REC-EST-006"],
    }),
    makeRec("REC-ENT-002", {
      category: "Entity Structure",
      plan_section: "Recommendations — Entity Structure",
    }),
    makeRec("REC-EST-006", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
    }),
  ];
  const plan = makePlan(recs);
  // REC-EST-006 missing from prose
  const markdown = "REC-ENT-001 triggers REC-ENT-002 in the early phase.";
  const result = runMechanicalPreChecks(markdown, plan, null);
  assert.ok(!("_builder_status" in result));
  assert.equal(result.checks.cascade_integrity.status, "failed_blocked");
  const issue = result.blocked_issues.find((i) => i.check_name === "cascade_integrity");
  assert.ok(issue);
  assert.match(issue!.description, /REC-EST-006/);
});

test("11. Pre-Check 5: all rec_ids resolve → passed", () => {
  const recs = [
    makeRec("REC-EST-006", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
    }),
    makeRec("REC-TAX-001", {
      category: "Tax",
      plan_section: "Recommendations — Personal Tax",
    }),
  ];
  const plan = makePlan(recs);
  const markdown = "Refer to REC-EST-006 and REC-TAX-001 for details.";
  const result = runMechanicalPreChecks(markdown, plan, null);
  assert.ok(!("_builder_status" in result));
  assert.equal(result.checks.recommendation_reference_resolution.status, "passed");
});

test("12. Pre-Check 5: fabricated rec_id → failed_blocked", () => {
  const recs = [
    makeRec("REC-EST-006", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
    }),
  ];
  const plan = makePlan(recs);
  const markdown = "Refer to REC-EST-006 and REC-EST-099 for details.";
  const result = runMechanicalPreChecks(markdown, plan, null);
  assert.ok(!("_builder_status" in result));
  assert.equal(result.checks.recommendation_reference_resolution.status, "failed_blocked");
  const issue = result.blocked_issues.find(
    (i) => i.check_name === "recommendation_reference_resolution",
  );
  assert.ok(issue);
  assert.equal(issue!.matched_value, "REC-EST-099");
});

test("13. Pre-Check 6: all segments labeled → passed", () => {
  const plan = makePlan([]);
  const para1 = "First paragraph of the plan body.";
  const para2 = "Second paragraph with additional context.";
  const markdown = `${para1}\n\n${para2}`;
  const provenanceMap = new Map<string, "llm_stage4" | "deterministic_glue" | "kb_template">([
    [para1, "llm_stage4"],
    [para2, "llm_stage4"],
  ]);
  const result = runMechanicalPreChecks(markdown, plan, null, { provenanceMap });
  assert.ok(!("_builder_status" in result));
  assert.equal(result.checks.provenance_map_completeness.status, "passed");
});

test("14. Pre-Check 6: unlabeled segment → warning (not blocking)", () => {
  const plan = makePlan([]);
  const para1 = "First paragraph of the plan body.";
  const para2 = "Second paragraph with additional context.";
  const markdown = `${para1}\n\n${para2}`;
  const provenanceMap = new Map<string, "llm_stage4" | "deterministic_glue" | "kb_template">([
    [para1, "llm_stage4"],
    // para2 missing
  ]);
  const result = runMechanicalPreChecks(markdown, plan, null, { provenanceMap });
  assert.ok(!("_builder_status" in result));
  assert.equal(result.checks.provenance_map_completeness.status, "warning");
  // Overall is still "passed" because warning doesn't block.
  assert.equal(result.overall_status, "passed");
  assert.equal(result._orchestrator_flags.warning_count, 1);
});

test("15. determinism: 100 invocations produce byte-identical output", () => {
  const recs = [
    makeRec("REC-EST-006", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
      state_a_value: 3_000_000,
    }),
    makeRec("REC-TAX-001", {
      category: "Tax",
      plan_section: "Recommendations — Personal Tax",
      alternative_values: PTET_ALT,
    }),
  ];
  const plan = makePlan(recs);
  const markdown =
    "Holloway Industrial Solutions, LLC ('HIS') is the operating entity. The 2026 estate exemption stands at $13.99M. Refer to REC-EST-006 and REC-TAX-001.";
  const opts = {
    statuteReferenceData: DEFAULT_STATUTE,
    entityShortNames: new Map([["Holloway Industrial Solutions, LLC", "HIS"]]),
  };
  const first = JSON.stringify(runMechanicalPreChecks(markdown, plan, null, opts));
  for (let i = 0; i < 99; i += 1) {
    const next = JSON.stringify(runMechanicalPreChecks(markdown, plan, null, opts));
    assert.equal(next, first, `iteration ${i + 2} diverged`);
  }
});

test("16. multi-check failure: issues across multiple checks all flagged", () => {
  const recs = [
    makeRec("REC-EST-006", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
      state_a_value: 73112,
    }),
    makeRec("REC-TAX-001", {
      category: "Tax",
      plan_section: "Recommendations — Personal Tax",
      alternative_values: PTET_ALT,
    }),
  ];
  const plan = makePlan(recs);
  // Issues: $73K is auto-fixable for REC-EST-006 BUT also matches PTET alt → State C blocks.
  // $999K is fabricated. REC-EST-099 is fabricated. 2024 estate exemption is stale.
  const markdown =
    "The strategy yields approximately $73K in savings, plus $999K in additional benefit. Refer to REC-EST-006 and REC-EST-099. The 2024 estate exemption applies.";
  const result = runMechanicalPreChecks(markdown, plan, null, {
    statuteReferenceData: DEFAULT_STATUTE,
  });
  assert.ok(!("_builder_status" in result));

  // State C protection should fire for the $73K (matches PTET alt)
  assert.equal(result._orchestrator_flags.state_c_alternative_value_protection_fired, true);
  // Number coherence check failed (multiple blockers)
  assert.equal(result.checks.number_coherence.status, "failed_blocked");
  // Statute check failed (stale 2024)
  assert.equal(result.checks.statute_consistency.status, "failed_blocked");
  // Rec_id check failed (REC-EST-099 fabricated)
  assert.equal(result.checks.recommendation_reference_resolution.status, "failed_blocked");

  // Multiple blocked issues
  assert.ok(result.blocked_issues.length >= 3);
  // No auto-fix should have fired (everything is blocked)
  assert.equal(result.auto_fixed_issues.length, 0);
  assert.equal(result.overall_status, "failed_blocked");
});
