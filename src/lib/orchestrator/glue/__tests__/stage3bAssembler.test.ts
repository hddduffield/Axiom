import { test } from "node:test";
import assert from "node:assert/strict";
import { assembleSequencedPlan, detectCycles, buildDependencyGraph } from "../stage3bAssembler";
import type {
  ActionItem,
  OrchestratorConfig,
  QuantifiedImpact,
  QuantifiedRecommendations,
  RecommendationCategory,
  SelectedRecommendation,
  SelectedRecommendations,
  SequencedRecommendation,
  TimingBucket,
} from "../../schemas/pipelineTypes";

// ────────────────────────────────────────────────────────────────────────
// Fixture builder
// ────────────────────────────────────────────────────────────────────────

interface RecOverrides {
  category?: RecommendationCategory;
  plan_section?: SequencedRecommendation["plan_section"];
  cluster_id?: string | null;
  cluster_sequence_closer?: string | null;
  decisions_needed?: boolean;
  landmine?: boolean;
  landmine_status?: string;
  default_excluded?: boolean;
  plan_output_variant?: SequencedRecommendation["plan_output_variant"];
  status?: SequencedRecommendation["status"];
  timing_bucket?: TimingBucket;
  pending_reconciliation?: boolean;
  alternative_values?: QuantifiedImpact["alternative_values"];
  estimate?: QuantifiedImpact["estimate"];
  action_items?: ActionItem[];
}

function makeRec(id: string, o: RecOverrides = {}): SequencedRecommendation {
  return {
    recommendation_id: id,
    source_file_path: `kb/v1_2/01_recommendations/${id}.md`,
    category: o.category ?? "Tax",
    status: o.status ?? "Active",
    position_in_sequence: 0,
    plan_section: o.plan_section ?? null,
    subsection_within_section: null,
    co_triggered_with: [],
    quantified_impact: {
      estimate: o.estimate ?? null,
      formula_id: null,
      formula_source_file: null,
      computation_inputs: {},
      pending_reconciliation: o.pending_reconciliation ?? false,
      alternative_values: o.alternative_values ?? [],
      qualitative_phrasing: null,
      reason_no_formula: null,
      blocked_inputs: [],
    },
    scenario_range: null,
    timing_bucket: o.timing_bucket ?? "60-120 days",
    owner: "PSA",
    owner_name: null,
    decisions_needed: o.decisions_needed ?? false,
    cluster_id: o.cluster_id ?? null,
    cluster_sequence_closer: o.cluster_sequence_closer ?? null,
    action_items: o.action_items ?? [],
    landmine: o.landmine ?? false,
    landmine_status: o.landmine_status ?? "not_landmine",
    default_excluded: o.default_excluded ?? false,
    plan_output_variant: o.plan_output_variant ?? null,
    match_strength: "strong",
    _audit_notes: null,
  };
}

interface SelOverrides {
  category?: RecommendationCategory;
  must_come_after?: string[];
  must_come_before?: string[];
  sequenced_with?: string[];
  coordinated_with?: string[];
  mutually_exclusive_with?: string[];
  preliminary_preference?: SelectedRecommendation["preliminary_preference"];
  preliminary_preference_rationale?: string | null;
  landmine?: boolean;
  landmine_status?: string;
}

function makeSel(id: string, o: SelOverrides = {}): SelectedRecommendation {
  const refList = (ids: string[] | undefined) =>
    (ids ?? []).map((rid) => ({ recommendation_id: rid }));
  return {
    recommendation_id: id,
    category: o.category ?? "Tax",
    must_come_after: refList(o.must_come_after),
    must_come_before: refList(o.must_come_before),
    sequenced_with: refList(o.sequenced_with),
    coordinated_with: refList(o.coordinated_with),
    mutually_exclusive_with: refList(o.mutually_exclusive_with),
    preliminary_preference: o.preliminary_preference ?? null,
    preliminary_preference_rationale: o.preliminary_preference_rationale ?? null,
    landmine: o.landmine ?? false,
    landmine_status: o.landmine_status ?? "not_landmine",
    match_strength: "strong",
  };
}

function buildHollowayFixture(): {
  qrecs: QuantifiedRecommendations;
  selrecs: SelectedRecommendations;
  config: OrchestratorConfig;
} {
  const recs: SequencedRecommendation[] = [
    makeRec("REC-ENT-001", {
      category: "Entity Structure",
      plan_section: "Recommendations — Entity Structure",
      cluster_id: "C-ENT-1",
      timing_bucket: "0-30 days",
    }),
    makeRec("REC-ENT-002", {
      category: "Entity Structure",
      plan_section: "Recommendations — Entity Structure",
      cluster_id: "C-ENT-1",
      timing_bucket: "30-60 days",
    }),
    makeRec("REC-ENT-003", {
      category: "Entity Structure",
      plan_section: "Recommendations — Entity Structure",
      cluster_id: "C-ENT-1",
      cluster_sequence_closer: "Once entities are formed, the structure is set for transfer planning.",
      timing_bucket: "60-120 days",
    }),
    makeRec("REC-EST-006", {
      category: "Estate",
      plan_section: "Recommendations — Estate Planning",
      timing_bucket: "4-6 months",
    }),
    makeRec("REC-TAX-001", {
      category: "Tax",
      plan_section: "Recommendations — Personal Tax",
      pending_reconciliation: true,
      decisions_needed: true,
      alternative_values: [
        {
          value: { value: 38000, unit: "USD" },
          formula_variant: "ptet_method_a",
          awaiting: "ptet_federal_savings_method",
          context: "Method A: federal savings calculated at the entity level.",
        },
        {
          value: { value: 26000, unit: "USD" },
          formula_variant: "ptet_method_b",
          awaiting: "ptet_federal_savings_method",
          context: "Method B: federal savings calculated at the partner level.",
        },
      ],
      timing_bucket: "30-60 days",
    }),
    makeRec("REC-TAX-002", {
      category: "Tax",
      plan_section: "Strategies Considered But Not Included",
      landmine: true,
      landmine_status: "landmine_excluded_default",
      default_excluded: true,
      plan_output_variant: "default_excluded",
      decisions_needed: true,
      timing_bucket: "6-12 months",
    }),
    makeRec("REC-INV-001", {
      category: "Investment",
      plan_section: "Recommendations — Investment & Cash",
      timing_bucket: "60-120 days",
    }),
    makeRec("REC-INV-002", {
      category: "Investment",
      plan_section: "Recommendations — Investment & Cash",
      timing_bucket: "60-120 days",
    }),
  ];

  const sels: SelectedRecommendation[] = [
    makeSel("REC-ENT-001", {
      category: "Entity Structure",
      sequenced_with: ["REC-ENT-002", "REC-ENT-003"],
    }),
    makeSel("REC-ENT-002", {
      category: "Entity Structure",
      sequenced_with: ["REC-ENT-001", "REC-ENT-003"],
      must_come_before: ["REC-EST-006"],
    }),
    makeSel("REC-ENT-003", {
      category: "Entity Structure",
      sequenced_with: ["REC-ENT-001", "REC-ENT-002"],
    }),
    makeSel("REC-EST-006", {
      category: "Estate",
      must_come_after: ["REC-ENT-002"],
      coordinated_with: ["REC-TAX-001"],
    }),
    makeSel("REC-TAX-001", {
      category: "Tax",
      coordinated_with: ["REC-EST-006"],
    }),
    makeSel("REC-TAX-002", {
      category: "Tax",
      landmine: true,
      landmine_status: "landmine_excluded_default",
    }),
    makeSel("REC-INV-001", {
      category: "Investment",
      mutually_exclusive_with: ["REC-INV-002"],
      preliminary_preference: "preferred",
      preliminary_preference_rationale: "Direct indexing chosen over SMA for tax-loss harvesting flexibility.",
    }),
    makeSel("REC-INV-002", {
      category: "Investment",
      mutually_exclusive_with: ["REC-INV-001"],
      preliminary_preference: "alternative",
      preliminary_preference_rationale: "SMA platform secondary to direct indexing for this household.",
    }),
  ];

  const qrecs: QuantifiedRecommendations = {
    _sequencer_flags: {
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
    recommendations: recs,
  };

  const selrecs: SelectedRecommendations = { selected: sels };

  const config: OrchestratorConfig = {
    firm_policy_resolutions: [],
    landmine_authorizations: [],
    advisor_id: "WB-001",
  };

  return { qrecs, selrecs, config };
}

const FIXED_NOW = new Date("2026-05-01T00:00:00Z");

// ────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────

test("happy path: fixture produces a valid SequencedPlan", () => {
  const { qrecs, selrecs, config } = buildHollowayFixture();
  const result = assembleSequencedPlan(qrecs, selrecs, config, { now: FIXED_NOW });
  assert.ok(!("_sequencer_status" in result), `expected SequencedPlan, got Failed: ${JSON.stringify(result)}`);

  // global_order must respect must_come_after: REC-EST-006 after REC-ENT-002
  const idxENT002 = result.global_order.indexOf("REC-ENT-002");
  const idxEST006 = result.global_order.indexOf("REC-EST-006");
  assert.ok(idxENT002 >= 0 && idxEST006 >= 0);
  assert.ok(idxENT002 < idxEST006, `REC-ENT-002 must come before REC-EST-006; got order ${result.global_order.join(", ")}`);

  // SEQUENCED WITH cluster compaction: ENT-001/002/003 must be contiguous
  const entPositions = ["REC-ENT-001", "REC-ENT-002", "REC-ENT-003"]
    .map((id) => result.global_order.indexOf(id))
    .sort((a, b) => a - b);
  assert.equal(entPositions[1] - entPositions[0], 1, `entity cluster not contiguous: ${result.global_order.join(", ")}`);
  assert.equal(entPositions[2] - entPositions[1], 1, `entity cluster not contiguous: ${result.global_order.join(", ")}`);

  // cluster_index has the entity cluster
  assert.ok(result.cluster_index["C-ENT-1"]);
  assert.deepEqual(result.cluster_index["C-ENT-1"].members.sort(), [
    "REC-ENT-001",
    "REC-ENT-002",
    "REC-ENT-003",
  ]);
  assert.equal(result.cluster_index["C-ENT-1"].closer_carrier, "REC-ENT-003");
  assert.equal(result.cluster_index["C-ENT-1"].primary_section, "Recommendations — Entity Structure");

  // decisions_needed_page contains PTET and the landmine
  const decRecIds = result.decisions_needed_page.map((d) => d.source_recommendation_id);
  assert.ok(decRecIds.includes("REC-TAX-001"), `PTET expected in decisions_needed_page, got ${decRecIds.join(",")}`);
  assert.ok(decRecIds.includes("REC-TAX-002"), `landmine expected in decisions_needed_page, got ${decRecIds.join(",")}`);

  // Decision types
  const ptetDec = result.decisions_needed_page.find((d) => d.source_recommendation_id === "REC-TAX-001");
  assert.equal(ptetDec?.decision_type, "firm_policy_resolution");
  assert.equal(ptetDec?.options.length, 2);
  const landmineDec = result.decisions_needed_page.find((d) => d.source_recommendation_id === "REC-TAX-002");
  assert.equal(landmineDec?.decision_type, "landmine_opt_in");

  // position_in_sequence is 1-indexed and contiguous
  const positions = result.sequenced_recommendations.map((r) => r.position_in_sequence);
  assert.deepEqual(positions, positions.map((_, i) => i + 1));

  // metadata sanity
  assert.equal(result._metadata.sequenced_at, FIXED_NOW.toISOString());
  assert.equal(result._metadata.recommendation_count_total, 8);
  assert.equal(result._metadata.recommendation_count_pending_reconciliation, 1);
});

test("cycle detection: A↔B fails fast with cycle in failure context", () => {
  const recs = [
    makeRec("REC-A", { category: "Tax" }),
    makeRec("REC-B", { category: "Tax" }),
  ];
  const sels = [
    makeSel("REC-A", { must_come_after: ["REC-B"] }),
    makeSel("REC-B", { must_come_after: ["REC-A"] }),
  ];
  const qrecs: QuantifiedRecommendations = {
    _sequencer_flags: {
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
    recommendations: recs,
  };
  const result = assembleSequencedPlan(qrecs, { selected: sels }, {
    firm_policy_resolutions: [],
    landmine_authorizations: [],
    advisor_id: "WB-001",
  }, { now: FIXED_NOW });

  assert.ok("_sequencer_status" in result);
  assert.equal(result._sequencer_status, "STAGE_3B_FAILED");
  assert.ok(result._failures.length > 0);
  const reasonText = result._failures.map((f) => f.reason).join(" | ");
  assert.match(reasonText, /cycle/i);
  // The reason or context should mention both A and B.
  const blob = JSON.stringify(result._failures);
  assert.match(blob, /REC-A/);
  assert.match(blob, /REC-B/);
});

test("buildDependencyGraph + detectCycles unit checks", () => {
  const sels = [
    makeSel("REC-A", { must_come_after: ["REC-B"] }),
    makeSel("REC-B", { must_come_after: ["REC-A"] }),
  ];
  const map = new Map(sels.map((s) => [s.recommendation_id, s]));
  const g = buildDependencyGraph(["REC-A", "REC-B"], map);
  assert.equal(g.adj.get("REC-A")?.has("REC-B"), true);
  assert.equal(g.adj.get("REC-B")?.has("REC-A"), true);
  const cycles = detectCycles(g);
  assert.ok(cycles.length > 0, "expected at least one cycle");
});

test("determinism: 100 invocations produce byte-identical output", () => {
  const { qrecs, selrecs, config } = buildHollowayFixture();
  const first = JSON.stringify(
    assembleSequencedPlan(qrecs, selrecs, config, { now: FIXED_NOW }),
  );
  for (let i = 0; i < 99; i += 1) {
    const next = JSON.stringify(
      assembleSequencedPlan(qrecs, selrecs, config, { now: FIXED_NOW }),
    );
    assert.equal(next, first, `iteration ${i + 2} diverged`);
  }
});

test("section grouping: recs are bucketed under correct plan_section keys", () => {
  const { qrecs, selrecs, config } = buildHollowayFixture();
  const result = assembleSequencedPlan(qrecs, selrecs, config, { now: FIXED_NOW });
  assert.ok(!("_sequencer_status" in result));
  const entSection = result.plan_sections["Recommendations — Entity Structure"] ?? [];
  assert.equal(entSection.length, 3);
  assert.deepEqual(
    entSection.map((r) => r.recommendation_id).sort(),
    ["REC-ENT-001", "REC-ENT-002", "REC-ENT-003"],
  );
  const taxSection = result.plan_sections["Recommendations — Personal Tax"] ?? [];
  assert.equal(taxSection.length, 1);
  assert.equal(taxSection[0].recommendation_id, "REC-TAX-001");
  const investSection = result.plan_sections["Recommendations — Investment & Cash"] ?? [];
  assert.equal(investSection.length, 2);
  // Within section, must preserve global_order ordering
  const goEnt = entSection.map((r) => r.position_in_sequence);
  assert.deepEqual(goEnt, [...goEnt].sort((a, b) => a - b));
});

test("supervisory review signal: PTET pending → required + firm_policy_resolution_pending", () => {
  const { qrecs, selrecs, config } = buildHollowayFixture();
  const result = assembleSequencedPlan(qrecs, selrecs, config, { now: FIXED_NOW });
  assert.ok(!("_sequencer_status" in result));
  const sig = result.supervisory_review_signal;
  assert.equal(sig.required, true);
  const codes = sig.reasons.map((r) => r.reason_code);
  assert.ok(codes.includes("firm_policy_resolution_pending"), `expected firm_policy_resolution_pending, got ${codes.join(",")}`);
  assert.ok(codes.includes("landmine_excluded_default_with_trigger"));
  assert.ok(sig.triggered_by_recommendations.includes("REC-TAX-001"));
});

test("strategies excluded: landmine appears with reason landmine_default_excluded", () => {
  const { qrecs, selrecs, config } = buildHollowayFixture();
  const result = assembleSequencedPlan(qrecs, selrecs, config, { now: FIXED_NOW });
  assert.ok(!("_sequencer_status" in result));
  const landmine = result.strategies_considered_but_excluded.find(
    (e) => e.recommendation_id === "REC-TAX-002",
  );
  assert.ok(landmine, "landmine REC-TAX-002 missing from strategies_considered_but_excluded");
  assert.equal(landmine?.exclusion_reason, "landmine_default_excluded");
  // mutex alternative also appears, deduped to one entry per pair
  const mutex = result.strategies_considered_but_excluded.find(
    (e) => e.recommendation_id === "REC-INV-002",
  );
  assert.ok(mutex);
  assert.equal(mutex?.exclusion_reason, "mutually_exclusive_alternative");
  // The "preferred" peer must NOT appear
  const preferred = result.strategies_considered_but_excluded.find(
    (e) => e.recommendation_id === "REC-INV-001",
  );
  assert.equal(preferred, undefined);
});
