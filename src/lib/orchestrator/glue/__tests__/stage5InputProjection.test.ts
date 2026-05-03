// Tests for projectForStage5Audit. The projection's job is to drop fields
// the LLM auditor doesn't read while preserving every field LC.1–LC.6 needs.
// These tests pin the field-by-field behavior so future schema changes don't
// silently leak heavy fields into the LLM input.

import { test } from "node:test";
import assert from "node:assert/strict";
import { projectForStage5Audit } from "../stage5InputProjection";
import type {
  ActionItem,
  ArchetypeIdentifier,
  QuantifiedRecommendations,
  RecommendationCategory,
  SequencedRecommendation,
} from "../../schemas/pipelineTypes";
import type { ClientProfile } from "../../schemas/clientProfile";
import type { Stage4Result } from "../../schemas/stage4.types";

// ────────────────────────────────────────────────────────────────────────
// Minimal fixture builders (mirrors the patterns in
// stage5CoherenceAuditor.test.ts but local so this test file stands alone).
// ────────────────────────────────────────────────────────────────────────

function makeAi(recId: string, n: number): ActionItem {
  return {
    action_item_id: `AI-${recId.replace("REC-", "")}-${n}`,
    description: `MOCK_AI_DESCRIPTION_FOR_${recId}_${n}`,
    sub_steps: ["MOCK_SUB_STEP_1", "MOCK_SUB_STEP_2", "MOCK_SUB_STEP_3"],
    category: "Tax",
    source_recommendation_id: recId,
    source_phase_or_step: "Step 1",
    owner: "PSA",
    owner_name: null,
    timing_bucket: "0-30 days",
    depends_on: ["MOCK_DEPS_AI_99"],
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
  category: RecommendationCategory = "Tax",
): SequencedRecommendation {
  return {
    recommendation_id: recId,
    source_file_path: "MOCK_SOURCE_FILE_PATH_THAT_SHOULD_BE_DROPPED",
    category,
    status: "Active",
    position_in_sequence: 0,
    plan_section: "Recommendations — Business Tax",
    subsection_within_section: null,
    co_triggered_with: [],
    quantified_impact: {
      estimate: { value: 148000, unit: "USD", is_annual: true },
      formula_id: "mock_formula_v1",
      formula_source_file: "MOCK_FORMULA_SOURCE_FILE_TO_DROP",
      computation_inputs: {
        MOCK_DEEP_INPUT: "x".repeat(5000), // big payload that should be dropped
        another_input: "y".repeat(5000),
      },
      pending_reconciliation: false,
      alternative_values: [
        {
          value: { value: 100000, unit: "USD", is_annual: true },
          formula_variant: "alternative_v1",
          awaiting: "ptet_federal_savings_method",
          context: "x".repeat(2000),
        },
      ],
      qualitative_phrasing: null,
      reason_no_formula: null,
      blocked_inputs: [],
    },
    scenario_range: null,
    timing_bucket: "0-30 days",
    owner: "CPA",
    owner_name: null,
    decisions_needed: false,
    cluster_id: null,
    cluster_sequence_closer: null,
    action_items: [makeAi(recId, 1), makeAi(recId, 2)],
    landmine: false,
    landmine_status: "not_a_landmine",
    default_excluded: false,
    plan_output_variant: null,
    match_strength: "strong",
    _audit_notes:
      "MOCK_AUDIT_NOTES_THAT_MUST_NOT_LEAK_TO_LLM_INPUT".repeat(100),
  };
}

function makeQr(): QuantifiedRecommendations {
  return {
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
    recommendations: [makeRec("REC-TAX-001"), makeRec("REC-EST-001", "Estate")],
  };
}

function makeClientProfile(
  archetype: ArchetypeIdentifier = "PRE",
): ClientProfile {
  const num = (v: number | null) => ({ value: v, unit: "USD" as const });
  const person = (name: string) => ({
    full_legal_name: name,
    short_name: null,
    date_of_birth: null,
    age: null,
    relationship: null,
    state_of_residence: null,
    citizenship: null,
    notes: null,
  });
  return {
    engagement: {
      advisor_id: "will-bearden",
      archetype,
      secondary_archetype: null,
      engagement_date: "2026-04-22",
      plan_purpose: "Test profile.",
    },
    client_and_family: {
      primary_owner: person("Test Owner"),
      spouse: null,
      children: [],
      dependents: [],
    },
    entities: [
      {
        // Heavy entity payload — should be dropped from projection.
        entity_name: "MOCK_ENTITY_TO_DROP",
        entity_type: "S-Corp" as never,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rest: ("z".repeat(5000) as unknown) as never,
      } as never,
    ],
    entity_structure: {
      has_holdco: false,
      holdco_jurisdiction: null,
      has_dynasty_trust: false,
      has_foundation: false,
      additional_entities: [],
    },
    personal_balance_sheet: {
      liquid_assets: [],
      retirement_accounts: [],
      real_estate: [],
      business_interests: [],
      other_assets: [],
      liabilities: [],
      net_worth: { ...num(null), known_unknown: true },
    },
    income: {
      wages_w2: { ...num(null), is_annual: true, known_unknown: true },
      k1_distributions: { ...num(null), is_annual: true, known_unknown: true },
      other_income: { ...num(null), is_annual: true, known_unknown: true },
      agi: { ...num(null), is_annual: true, known_unknown: true },
    },
    cash_flow: {
      monthly_inflows: { ...num(null), known_unknown: true },
      monthly_outflows: { ...num(null), known_unknown: true },
      monthly_savings: { ...num(null), known_unknown: true },
    },
    tax_status: {
      filing_status: "MFJ",
      federal_marginal_rate: { value: 37, unit: "percent" },
      state_residency: "GA",
      ptet_election_status: "not_elected",
      prior_returns_received: false,
    },
    estate_planning: {
      will_status: "missing",
      will_date: null,
      trusts: [],
      beneficiaries: [],
      dpoa_in_place: false,
      healthcare_directive_in_place: false,
    },
    insurance: {
      life_insurance_policies: [],
      dis_insurance: [],
      ltc_insurance: [],
      umbrella_liability: null,
      errors_omissions: null,
    },
    transaction_posture: {
      transaction_window: "12-18 months",
      transaction_status: "evaluating",
      inbound_interest: false,
      advisor_engaged: null,
      valuation_status: null,
    },
    prior_transactions: [
      {
        // Heavy prior_transactions payload — should be dropped.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        MOCK_PRIOR_TXN: ("a".repeat(5000) as unknown) as never,
      } as never,
    ],
    goals_and_values: {
      financial_goals: "Preserve wealth.",
      philanthropic_goals: null,
      family_priorities: null,
      succession_goals: null,
      raw_values_text: "",
    },
    documents_received: ["doc1.pdf"],
    existing_advisor_relationships: [],
    advisor_observations: "Test advisor observations.",
    _metadata: {
      stage_version: "1.0.1",
      model_used: "claude-opus-4-7",
      input_token_count: 0,
      output_token_count: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      attempts_made: 1,
      attempt_history: [],
      duration_ms: 0,
      source_fr_content_hash:
        "0000000000000000000000000000000000000000000000000000000000000000",
      parsed_at: "2026-05-03T00:00:00.000Z",
    },
  };
}

function makeStage4Result(): Stage4Result {
  return {
    llm_sections: {
      executive_summary: {
        opening_paragraph: "Mock opening.",
        two_themes_paragraph: "Two themes.",
        top_priorities: [
          {
            rank: 1,
            descriptor: "REC-TAX-001 (Tax)",
            estimated_impact_text: "~$148K",
            timing_text: "0-30 days",
          },
        ],
        what_this_means_closer: "Mock closer.",
      },
      our_process: {
        intro_paragraph: "Mock process intro.",
        stages: [
          { number: 1, name: "Discovery (completed)", body: "x" },
          { number: 2, name: "Plan delivery (today)", body: "x" },
          { number: 3, name: "Implementation", body: "x" },
          { number: 4, name: "Ongoing review", body: "x" },
        ],
        how_to_read_paragraph: "Mock readme.",
      },
      findings_observations: {
        intro_paragraph: "Findings intro.",
        strengths: [
          { body: "S1." },
          { body: "S2." },
          { body: "S3." },
          { body: "S4." },
        ],
        opportunities: [{ category: "Tax", bullets: ["Op1."] }],
      },
      recommendations_business: {
        intro_paragraph: "Business intro.",
        sections: [
          {
            section_id: "RB.1" as never,
            numbered_heading: "1. Mock",
            label: "[CORE SECTION]",
            source_rec_ids: ["REC-TAX-001"],
            intro_paragraph: "Mock intro.",
            subsections: null,
            recommendations_bullets: [
              {
                bold_imperative: "Do the thing.",
                briefing: "Brief.",
                partner_role: "CPA",
                source_action_item_ids: ["AI-TAX-001-1"],
              },
            ],
            closer_paragraph: null,
            cross_references: [],
          },
        ],
      },
      recommendations_personal: {
        intro_paragraph: "Personal intro.",
        sections: [
          {
            section_id: "RP.8" as never,
            numbered_heading: "8. Mock",
            label: "[PERSONAL — for owner(s)]",
            source_rec_ids: ["REC-EST-001"],
            intro_paragraph: "Mock personal intro.",
            subsections: null,
            recommendations_bullets: [
              {
                bold_imperative: "Personal action.",
                briefing: "Brief.",
                partner_role: null,
                source_action_item_ids: ["AI-EST-001-1"],
              },
            ],
            closer_paragraph: null,
            cross_references: [],
          },
        ],
      },
      meeting_cadence_intro: {
        intro_paragraph: "Cadence intro.",
        immediate_next_steps: ["Step 1.", "Step 2."],
      },
    },
    deterministic_sections: {
      title_page: {
        client_full_name: "Owner",
        spouse_full_name: null,
        business_name: null,
        ownership_summary: null,
        prepared_date: "2026-04-29",
        prepared_by_name: "Will Bearden",
        prepared_by_firm: "PSA Wealth",
        compliance_tracking_id: "PSA-2026-0429-OWNER-001",
      },
      client_snapshot: {
        // This whole section MUST be dropped from the projection.
        entity: {
          business_name: "MOCK_DROPPED_ENTITY_NAME",
          entity_type: "S-Corp",
          ownership: "100%",
          industry_or_operations: "x".repeat(5000),
        },
        revenue_profit_table: [],
        valuation_text: null,
        why_range_wide_text: null,
        coverage_table: [],
      },
      goals_priorities: {
        intro_paragraph: "Goals intro.",
        goals: [
          { number: 1, goal_name: "G1", what_this_means_in_practice: "M" },
        ],
      },
      implementation_roadmap: {
        intro_paragraph: "Roadmap intro.",
        groups: [
          {
            timing_bucket: "0-30 days",
            bucket_label: "0–30 Days │ Foundations",
            rows: [
              {
                action: "MOCK_LONG_ACTION_DESCRIPTION_THAT_SHOULD_BE_DROPPED".repeat(
                  10,
                ),
                timing_bucket: "0-30 days",
                owner: "PSA",
                status: "Not Started",
                source_action_item_id: "AI-TAX-001-1",
                source_recommendation_id: "REC-TAX-001",
              },
            ],
          },
        ],
        total_action_count: 1,
      },
      decisions_needed: {
        intro_paragraph: "DN intro.",
        rows: [],
      },
      advisory_team: {
        intro_paragraph: "AT intro.",
        rows: [
          {
            role: "Lead Advisor",
            firm_or_contact: "Will Bearden, PSA Wealth",
            notes: "",
            is_tbd: false,
          },
        ],
      },
      meeting_cadence_table: {
        // This section MUST be dropped from the projection.
        rows: [
          {
            meeting_name: "MOCK_DROPPED_MEETING_NAME",
            frequency: "Monthly",
            agenda: "x".repeat(5000),
          },
        ],
      },
      glossary: {
        intro_paragraph: "Glossary intro.",
        entries: [
          { term: "PTET", acronym: null, plain_english_definition: "def" },
        ],
      },
      disclosures: {
        body_paragraphs: ["Disclosure 1.", "Disclosure 2."],
        compliance_tracking_id: "PSA-2026-0429-OWNER-001",
      },
    },
    _flags: {
      numbers_drift: [
        { rec_id: "REC-TAX-001", expected: "$148K", emitted: "$150K", severity: "soft" },
        { rec_id: "REC-EST-001", expected: "$5M", emitted: "$3M", severity: "hard" },
      ],
      unresolved_cross_references: [],
      glossary_terms_used: ["PTET"],
      conditional_sections_omitted: [],
      optional_sections_included: [],
    },
    _metadata: {
      stage_version: "4-1.0.0",
      model_used: "claude-opus-4-7",
      input_token_count: 100000,
      output_token_count: 30000,
      cache_creation_input_tokens: 16000,
      cache_read_input_tokens: 0,
      attempts_made: 2,
      attempt_history: [],
      duration_ms: 1000,
      source_fr_content_hash: "0000",
      parsed_at: "2026-05-03T00:00:00.000Z",
      cost_cents: 1000,
      source_quantified_recommendations_hash: "qrhash",
      source_client_profile_hash: "cphash",
    },
  };
}

// ────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────

test("projectForStage5Audit — strips heavy fields, preserves audit-relevant fields", () => {
  const stage4 = makeStage4Result();
  const qr = makeQr();
  const cp = makeClientProfile("PRE");

  const projected = projectForStage5Audit(stage4, qr, cp);
  const json = JSON.stringify(projected);

  // ── Stage 4 _metadata is fully dropped ────────────────────────────
  assert.equal(json.includes("source_fr_content_hash"), false);
  assert.equal(json.includes("attempt_history"), false);
  assert.equal(json.includes("source_quantified_recommendations_hash"), false);
  // Stage 4 _flags object is NOT preserved as `_flags` — only summary fields
  // (drift counts + glossary_terms_used) bubble up.
  assert.ok(!("_flags" in (projected.plan as unknown as Record<string, unknown>)));
  assert.ok(projected.plan.flags_summary);
  assert.equal(projected.plan.flags_summary.numbers_drift_hard_count, 1);
  assert.equal(projected.plan.flags_summary.numbers_drift_soft_count, 1);
  assert.deepEqual(projected.plan.flags_summary.glossary_terms_used, ["PTET"]);

  // ── client_snapshot + meeting_cadence_table dropped ───────────────
  assert.equal(
    json.includes("MOCK_DROPPED_ENTITY_NAME"),
    false,
    "client_snapshot must be dropped",
  );
  assert.equal(
    json.includes("MOCK_DROPPED_MEETING_NAME"),
    false,
    "meeting_cadence_table must be dropped",
  );

  // ── Implementation Roadmap row `action` field dropped ─────────────
  assert.equal(
    json.includes("MOCK_LONG_ACTION_DESCRIPTION_THAT_SHOULD_BE_DROPPED"),
    false,
    "Implementation Roadmap row.action must be dropped",
  );
  // But the slim row IS present, with action_item_id + recommendation_id.
  const irGroups = projected.plan.deterministic_sections.implementation_roadmap_summary.groups;
  assert.equal(irGroups.length, 1);
  assert.equal(irGroups[0].rows.length, 1);
  assert.equal(irGroups[0].rows[0].source_action_item_id, "AI-TAX-001-1");
  assert.equal(irGroups[0].rows[0].source_recommendation_id, "REC-TAX-001");

  // ── QR action_items[*] description + sub_steps + computation_inputs dropped
  assert.equal(
    json.includes("MOCK_AI_DESCRIPTION_FOR_REC-TAX-001_1"),
    false,
    "action_items[*].description must be dropped",
  );
  assert.equal(json.includes("MOCK_SUB_STEP_1"), false, "sub_steps dropped");
  assert.equal(json.includes("MOCK_DEPS_AI_99"), false, "depends_on dropped");
  assert.equal(json.includes("MOCK_DEEP_INPUT"), false, "computation_inputs dropped");
  assert.equal(
    json.includes("MOCK_AUDIT_NOTES_THAT_MUST_NOT_LEAK_TO_LLM_INPUT"),
    false,
    "_audit_notes dropped",
  );
  assert.equal(
    json.includes("MOCK_SOURCE_FILE_PATH_THAT_SHOULD_BE_DROPPED"),
    false,
    "source_file_path dropped",
  );

  // ── QR per-rec slim shape: action_item_ids preserved, action_items full bodies dropped
  const slimRec = projected.quantified_recommendations.recommendations[0];
  assert.deepEqual(slimRec.action_item_ids, ["AI-TAX-001-1", "AI-TAX-001-2"]);
  assert.equal(slimRec.recommendation_id, "REC-TAX-001");
  assert.equal(slimRec.category, "Tax");
  assert.equal(slimRec.plan_section, "Recommendations — Business Tax");
  assert.equal(slimRec.decisions_needed, false);
  assert.equal(slimRec.landmine, false);
  assert.deepEqual(slimRec.quantified_impact.estimate, {
    value: 148000,
    unit: "USD",
    is_annual: true,
  });
  // alternative_values, blocked_inputs, formula_id, computation_inputs all dropped
  assert.ok(!("formula_id" in slimRec.quantified_impact));
  assert.ok(!("computation_inputs" in slimRec.quantified_impact));
  assert.ok(!("alternative_values" in slimRec.quantified_impact));

  // ── ClientProfile slim shape ──────────────────────────────────────
  // engagement, client_and_family, goals_and_values, advisor_observations preserved
  assert.equal(projected.client_profile.engagement.archetype, "PRE");
  assert.equal(projected.client_profile.advisor_observations, "Test advisor observations.");
  assert.equal(
    projected.client_profile.client_and_family.primary_owner.full_legal_name,
    "Test Owner",
  );
  // entities, entity_structure, personal_balance_sheet, income, cash_flow,
  // tax_status, estate_planning, insurance, transaction_posture,
  // prior_transactions, documents_received, existing_advisor_relationships,
  // _metadata all dropped.
  const cpKeys = Object.keys(projected.client_profile).sort();
  assert.deepEqual(cpKeys, [
    "advisor_observations",
    "client_and_family",
    "engagement",
    "goals_and_values",
  ]);

  // ── Convenience top-level fields surfaced ─────────────────────────
  assert.equal(projected.archetype, "PRE");
  assert.equal(projected.include_optional_pre_transaction, true);

  // ── All Stage 4 LLM prose preserved verbatim ──────────────────────
  assert.equal(projected.plan.llm_sections.executive_summary.opening_paragraph, "Mock opening.");
  assert.equal(
    projected.plan.llm_sections.recommendations_business.sections[0].intro_paragraph,
    "Mock intro.",
  );
  assert.equal(
    projected.plan.llm_sections.recommendations_personal.sections[0].intro_paragraph,
    "Mock personal intro.",
  );
});

test("projectForStage5Audit — yields meaningful size reduction", () => {
  const stage4 = makeStage4Result();
  const qr = makeQr();
  const cp = makeClientProfile("PRE");

  const projected = projectForStage5Audit(stage4, qr, cp);
  const projectedSize = JSON.stringify(projected).length;
  const originalSize =
    JSON.stringify(stage4).length +
    JSON.stringify(qr).length +
    JSON.stringify(cp).length;

  // The projection should be meaningfully smaller than the union of the
  // original three blobs. On real Holloway data the savings are dominated by
  // _metadata / sub_steps / computation_inputs / etc; on this synthetic
  // fixture the heavy MOCK fields dominate. Demand at least 30% reduction.
  assert.ok(
    projectedSize < originalSize * 0.7,
    `expected projected (${projectedSize}) to be < 70% of original (${originalSize})`,
  );
});

test("projectForStage5Audit — non-PRE archetype clears include_optional_pre_transaction", () => {
  const stage4 = makeStage4Result();
  const qr = makeQr();
  const cp = makeClientProfile("POST");

  const projected = projectForStage5Audit(stage4, qr, cp);
  assert.equal(projected.archetype, "POST");
  assert.equal(projected.include_optional_pre_transaction, false);
});
