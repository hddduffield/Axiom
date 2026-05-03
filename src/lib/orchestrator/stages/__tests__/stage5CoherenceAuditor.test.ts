import { test } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import {
  auditPlan,
  _resetStage5CachesForTesting,
  type Stage5ApiClient,
  type Stage5Options,
} from "../stage5CoherenceAuditor";
import {
  isStage5ResultFailed,
  type AuditFinding,
  type Stage5LlmRawOutput,
  type Stage5Result,
  type Stage5ResultFailed,
} from "../../schemas/stage5.types";
import type {
  ActionItem,
  ArchetypeIdentifier,
  QuantifiedRecommendations,
  RecommendationCategory,
  SequencedRecommendation,
} from "../../schemas/pipelineTypes";
import type { ClientProfile } from "../../schemas/clientProfile";
import type {
  ExecutiveSummary,
  ImplementationRoadmap,
  Stage4Result,
  TopPriorityRow,
} from "../../schemas/stage4.types";

const KB_PATH = path.resolve("kb/v1_2");

// ────────────────────────────────────────────────────────────────────────
// Mock client (mirror Stage 4 pattern)
// ────────────────────────────────────────────────────────────────────────

type MockResponse =
  | { kind: "tool_use_explicit"; input: unknown; inputTokens?: number; outputTokens?: number }
  | { kind: "text_only"; text: string; inputTokens?: number; outputTokens?: number }
  | { kind: "throw"; error: Error };

function buildMockMessage(
  content: Anthropic.ContentBlock[],
  stopReason: Anthropic.Message["stop_reason"],
  inputTokens: number,
  outputTokens: number,
): Anthropic.Message {
  return {
    id: "msg_mock",
    type: "message",
    role: "assistant",
    model: "claude-opus-4-7",
    stop_reason: stopReason,
    stop_sequence: null,
    content,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      service_tier: "standard",
    },
  } as unknown as Anthropic.Message;
}

function makeToolUseBlock(input: unknown, toolName: string): Anthropic.ContentBlock {
  return {
    type: "tool_use",
    id: "toolu_mock",
    name: toolName,
    input,
  } as unknown as Anthropic.ContentBlock;
}

function makeTextBlock(text: string): Anthropic.ContentBlock {
  return { type: "text", text, citations: [] } as unknown as Anthropic.ContentBlock;
}

function resolveMockResponse(
  r: Exclude<MockResponse, { kind: "throw" }>,
  toolName: string,
): Anthropic.Message {
  const inputTokens = r.inputTokens ?? 30000;
  const outputTokens = r.outputTokens ?? 3000;
  if (r.kind === "tool_use_explicit") {
    return buildMockMessage(
      [makeToolUseBlock(r.input, toolName)],
      "tool_use",
      inputTokens,
      outputTokens,
    );
  }
  return buildMockMessage(
    [makeTextBlock(r.text)],
    "end_turn",
    inputTokens,
    outputTokens,
  );
}

interface MockClientOptions {
  countTokensValue?: number;
  countTokensThrows?: Error;
}

function makeMockClient(
  responses: MockResponse[],
  opts: MockClientOptions = {},
): Stage5ApiClient & {
  callCount: () => number;
  lastCall: () => Anthropic.MessageCreateParamsNonStreaming | null;
  countTokensCallCount: () => number;
} {
  let i = 0;
  let countCalls = 0;
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  return {
    callCount: () => i,
    lastCall: () => calls[calls.length - 1] ?? null,
    countTokensCallCount: () => countCalls,
    messages: {
      stream: (params) => {
        calls.push(params);
        const toolName =
          params.tool_choice && params.tool_choice.type === "tool"
            ? params.tool_choice.name
            : "submit_audit_findings";
        const r = responses[i] ?? responses[responses.length - 1];
        i += 1;
        return {
          finalMessage: async () => {
            if (r.kind === "throw") throw r.error;
            return resolveMockResponse(r, toolName);
          },
        };
      },
      countTokens: async () => {
        countCalls += 1;
        if (opts.countTokensThrows) throw opts.countTokensThrows;
        return {
          input_tokens: opts.countTokensValue ?? 35000,
        } as unknown as Anthropic.MessageTokensCount;
      },
    },
  };
}

// ────────────────────────────────────────────────────────────────────────
// ClientProfile + QR fixtures
// ────────────────────────────────────────────────────────────────────────

function makeMinimalClientProfile(
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
    entities: [],
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
    prior_transactions: [],
    goals_and_values: {
      financial_goals: "Preserve wealth.",
      philanthropic_goals: null,
      family_priorities: null,
      succession_goals: null,
      raw_values_text: "",
    },
    documents_received: [],
    existing_advisor_relationships: [],
    advisor_observations: "",
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

function makeActionItem(
  recId: string,
  n: number,
  category: RecommendationCategory = "Tax",
): ActionItem {
  return {
    action_item_id: `AI-${recId.replace("REC-", "")}-${n}`,
    description: `Mock action item ${n} for ${recId}.`,
    sub_steps: [],
    category,
    source_recommendation_id: recId,
    source_phase_or_step: "Step 1",
    owner: "PSA",
    owner_name: null,
    timing_bucket: "0-30 days",
    depends_on: [],
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

function makeStateARec(
  recId: string,
  category: RecommendationCategory,
  estimateValue: number = 148000,
): SequencedRecommendation {
  return {
    recommendation_id: recId,
    source_file_path: `kb/v1_2/01_recommendations/tax/${recId}.md`,
    category,
    status: "Active",
    position_in_sequence: 0,
    plan_section: "Recommendations — Business Tax",
    subsection_within_section: null,
    co_triggered_with: [],
    quantified_impact: {
      estimate: { value: estimateValue, unit: "USD", is_annual: true },
      formula_id: "mock_v1",
      formula_source_file: `kb/v1_2/01_recommendations/tax/${recId}.md`,
      computation_inputs: {},
      pending_reconciliation: false,
      alternative_values: [],
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
    action_items: [makeActionItem(recId, 1, category)],
    landmine: false,
    landmine_status: "not_a_landmine",
    default_excluded: false,
    plan_output_variant: null,
    match_strength: "strong",
    _audit_notes: null,
  };
}

function makeQR(recs: SequencedRecommendation[]): QuantifiedRecommendations {
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
    recommendations: recs,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Stage 4 result fixture builder — minimal valid shape
// ────────────────────────────────────────────────────────────────────────

interface Stage4FixtureOpts {
  archetypeIncludesOptional?: boolean;
  topPriorities?: TopPriorityRow[];
  recIds?: string[]; // for IR rows
  decisionsNeededRecIds?: string[];
  glossaryEntries?: { term: string; acronym: string | null; def: string }[];
  businessSectionId?: string;
  businessSectionLabel?:
    | "[CORE SECTION]"
    | "[OPTIONAL — included because of pre-transaction posture]"
    | "[PERSONAL — for owner(s)]"
    | "[OPTIONAL — included because of three children at planning-relevant ages]";
  invalidCrossRefTarget?: string; // for DC.1 testing
  bogusRoadmapActionId?: string; // for DC.2 testing
  prosePool?: string; // additional prose to seed glossary/number matching
  complianceTrackingId?: string; // for DC.9 testing — explicit override
  numberInProse?: number; // dollar figure that will appear in prose body
  duplicateBusinessSectionIds?: boolean; // for DC.6 testing
  emptyBusinessSections?: boolean; // for DC.6 testing
}

function makeStage4Result(opts: Stage4FixtureOpts = {}): Stage4Result {
  const businessSectionId = opts.businessSectionId ?? "RB.1";
  const businessLabel = opts.businessSectionLabel ?? "[CORE SECTION]";
  const recIds = opts.recIds ?? ["REC-TAX-001"];
  const decisionsRecIds = opts.decisionsNeededRecIds ?? [];
  const glossaryEntries = opts.glossaryEntries ?? [
    { term: "Pass-Through Entity Tax", acronym: "PTET", def: "Mock def." },
  ];
  const numberInProse = opts.numberInProse ?? 148000;
  const proseBody =
    opts.prosePool ??
    `Mock framing prose. PTET election projected at approximately $${numberInProse.toLocaleString()} of annual savings.`;

  const businessSectionsRaw = [
    {
      section_id: businessSectionId as never,
      numbered_heading: `${businessSectionId.replace("RB.", "")}. Mock Business Recommendation`,
      label: businessLabel,
      source_rec_ids: recIds,
      intro_paragraph: proseBody,
      subsections: null,
      recommendations_bullets: [
        {
          bold_imperative: "File the mock action.",
          briefing: `Estimated annual savings: approximately $${numberInProse.toLocaleString()}.`,
          partner_role: "CPA",
          source_action_item_ids: recIds.map((id) => `AI-${id.replace("REC-", "")}-1`),
        },
      ],
      closer_paragraph: null,
      cross_references: opts.invalidCrossRefTarget
        ? [
            {
              target_section_id: opts.invalidCrossRefTarget as never,
              display_text: `see ${opts.invalidCrossRefTarget}`,
            },
          ]
        : [],
    },
  ];
  const businessSections = opts.duplicateBusinessSectionIds
    ? [...businessSectionsRaw, { ...businessSectionsRaw[0] }]
    : opts.emptyBusinessSections
      ? []
      : businessSectionsRaw;

  const personalSections = [
    {
      section_id: "RP.8" as never,
      numbered_heading: "8. Mock Personal Recommendation",
      label: "[PERSONAL — for owner(s)]" as const,
      source_rec_ids: ["REC-FAM-001"],
      intro_paragraph: "Mock personal-lens framing.",
      subsections: null,
      recommendations_bullets: [
        {
          bold_imperative: "Take the personal action.",
          briefing: "Mock personal-lens briefing.",
          partner_role: null,
          source_action_item_ids: ["AI-FAM-001-1"],
        },
      ],
      closer_paragraph: null,
      cross_references: [],
    },
  ];

  const executiveSummary: ExecutiveSummary = {
    opening_paragraph: "Mock opening paragraph.",
    two_themes_paragraph: "Two themes shape this plan. First, a theme. Second, another theme.",
    top_priorities: opts.topPriorities ?? [
      {
        rank: 1,
        descriptor: `${recIds[0]} (Tax)`,
        estimated_impact_text: `~$${numberInProse.toLocaleString()}`,
        timing_text: "0-30 days",
      },
    ],
    what_this_means_closer: "Mock closer.",
  };

  // Implementation Roadmap — built deterministically from action_items in QR.
  const roadmapAiId = opts.bogusRoadmapActionId ?? `AI-${recIds[0].replace("REC-", "")}-1`;
  const implementationRoadmap: ImplementationRoadmap = {
    intro_paragraph: "Mock roadmap intro.",
    groups: [
      {
        timing_bucket: "0-30 days",
        bucket_label: "0–30 Days │ Foundations",
        rows: [
          {
            action: "Mock action",
            timing_bucket: "0-30 days",
            owner: "PSA",
            status: "Not Started",
            source_action_item_id: roadmapAiId,
            source_recommendation_id: recIds[0],
          },
        ],
      },
    ],
    total_action_count: 1,
  };

  return {
    llm_sections: {
      executive_summary: executiveSummary,
      our_process: {
        intro_paragraph: "Mock process intro.",
        stages: [
          { number: 1, name: "Discovery (completed)", body: "Mock body." },
          { number: 2, name: "Plan delivery (today)", body: "Mock body." },
          { number: 3, name: "Implementation", body: "Mock body." },
          { number: 4, name: "Ongoing review", body: "Mock body." },
        ],
        how_to_read_paragraph: "Mock readme.",
      },
      findings_observations: {
        intro_paragraph: "Mock findings intro.",
        strengths: [
          { body: "Strength 1." },
          { body: "Strength 2." },
          { body: "Strength 3." },
          { body: "Strength 4." },
        ],
        opportunities: [
          { category: "Tax", bullets: ["Opportunity 1."] },
        ],
      },
      recommendations_business: {
        intro_paragraph: "Mock business intro.",
        sections: businessSections,
      },
      recommendations_personal: {
        intro_paragraph: "Mock personal intro.",
        sections: personalSections,
      },
      meeting_cadence_intro: {
        intro_paragraph: "Mock cadence intro.",
        immediate_next_steps: ["Step 1.", "Step 2."],
      },
    },
    deterministic_sections: {
      title_page: {
        client_full_name: "Test Owner",
        spouse_full_name: null,
        business_name: null,
        ownership_summary: null,
        prepared_date: "2026-04-29",
        prepared_by_name: "Will Bearden",
        prepared_by_firm: "PSA Wealth",
        compliance_tracking_id:
          opts.complianceTrackingId ?? "PSA-2026-0429-OWNER-001",
      },
      client_snapshot: {
        entity: null,
        revenue_profit_table: [],
        valuation_text: null,
        why_range_wide_text: null,
        coverage_table: [],
      },
      goals_priorities: {
        intro_paragraph: "Mock goals intro.",
        goals: [
          {
            number: 1,
            goal_name: "Goal 1",
            what_this_means_in_practice: "Mock practice.",
          },
        ],
      },
      implementation_roadmap: implementationRoadmap,
      decisions_needed: {
        intro_paragraph: "Mock DN intro.",
        rows: decisionsRecIds.map((id, i) => ({
          number: i + 1,
          decision_question: `Mock decision for ${id}`,
          recommended_path: "Mock recommended path",
          decision_needed_by: "60 days",
          source_recommendation_id: id,
        })),
      },
      advisory_team: {
        intro_paragraph: "Mock advisory intro.",
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
        rows: [
          {
            meeting_name: "Implementation Check-in",
            frequency: "Monthly",
            agenda: "Mock agenda.",
          },
        ],
      },
      glossary: {
        intro_paragraph: "Mock glossary intro.",
        entries: glossaryEntries.map((e) => ({
          term: e.term,
          acronym: e.acronym,
          plain_english_definition: e.def,
        })),
      },
      disclosures: {
        body_paragraphs: [
          "Mock disclosure paragraph 1.",
          "Mock disclosure paragraph 2.",
          "Mock disclosure paragraph 3.",
          "Mock disclosure paragraph 4.",
        ],
        compliance_tracking_id:
          opts.complianceTrackingId ?? "PSA-2026-0429-OWNER-001",
      },
    },
    _flags: {
      numbers_drift: [],
      unresolved_cross_references: [],
      glossary_terms_used: [],
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
      attempt_history: [
        {
          attempt_number: 1,
          outcome: "success",
          failure_details: null,
          duration_ms: 100,
          input_tokens: 100000,
          output_tokens: 30000,
        },
      ],
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
// Valid LLM audit output fixture
// ────────────────────────────────────────────────────────────────────────

function makeValidLlmAuditOutput(opts: {
  findings?: AuditFinding[];
  voice_consistency_score?: number;
  contradiction_count?: number;
  llm_overall_assessment?: "ship_ready" | "review_recommended" | "regenerate_recommended";
} = {}): Stage5LlmRawOutput {
  return {
    findings: opts.findings ?? [],
    llm_assessment: {
      voice_consistency_score: opts.voice_consistency_score ?? 88,
      contradiction_count: opts.contradiction_count ?? 0,
      llm_overall_assessment: opts.llm_overall_assessment ?? "ship_ready",
    },
  };
}

// ────────────────────────────────────────────────────────────────────────
// Test helpers
// ────────────────────────────────────────────────────────────────────────

function isFailure(r: Stage5Result | Stage5ResultFailed): r is Stage5ResultFailed {
  return (r as Stage5ResultFailed)._stage_status === "FAILED";
}

function baseOptions(client: Stage5ApiClient, advisorId = "will-bearden"): Stage5Options {
  return {
    apiClient: client,
    kbPath: KB_PATH,
    advisorId,
    referenceDate: new Date("2026-04-29T00:00:00Z"),
    maxRetries: 1,
  };
}

function resetCaches() {
  _resetStage5CachesForTesting();
}

// ────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────

test("5 — full success: Stage 4 input + LLM audit → valid Stage5Result with merged findings", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  const qr = makeQR([makeStateARec("REC-TAX-001", "Tax")]);
  const stage4Result = makeStage4Result({ recIds: ["REC-TAX-001"] });
  const llmOut = makeValidLlmAuditOutput();
  const client = makeMockClient([{ kind: "tool_use_explicit", input: llmOut }]);

  const result = await auditPlan(stage4Result, qr, profile, baseOptions(client));
  assert.ok(!isFailure(result), `expected success: ${JSON.stringify(result).slice(0, 200)}`);
  assert.ok(Array.isArray(result.findings));
  assert.ok(result.deterministic_checks);
  assert.ok(result.llm_assessment);
  assert.equal(result.llm_assessment!.voice_consistency_score, 88);
  assert.ok(["ship_ready", "review_recommended", "regenerate_recommended"].includes(result.overall_assessment));
  assert.equal(result._metadata.stage_version, "5-1.0.0");
});

test("5 — tool_use response correctly extracted (Pass requests submit_audit_findings)", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  const qr = makeQR([makeStateARec("REC-TAX-001", "Tax")]);
  const stage4Result = makeStage4Result({ recIds: ["REC-TAX-001"] });
  const client = makeMockClient([
    { kind: "tool_use_explicit", input: makeValidLlmAuditOutput() },
  ]);

  const result = await auditPlan(stage4Result, qr, profile, baseOptions(client));
  assert.ok(!isFailure(result));
  const params = client.lastCall();
  assert.ok(params);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sent = params as any;
  assert.ok(Array.isArray(sent.tools));
  assert.equal(sent.tools[0].name, "submit_audit_findings");
  assert.deepEqual(sent.tool_choice, { type: "tool", name: "submit_audit_findings" });
});

test("5 — schema validation failure on first attempt → retry succeeds", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  const qr = makeQR([makeStateARec("REC-TAX-001", "Tax")]);
  const stage4Result = makeStage4Result({ recIds: ["REC-TAX-001"] });
  const invalid = makeValidLlmAuditOutput();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (invalid as any).llm_assessment;
  const client = makeMockClient([
    { kind: "tool_use_explicit", input: invalid },
    { kind: "tool_use_explicit", input: makeValidLlmAuditOutput() },
  ]);

  const result = await auditPlan(stage4Result, qr, profile, baseOptions(client));
  assert.ok(!isFailure(result));
  assert.equal(result._metadata.attempts_made, 2);
  assert.equal(client.callCount(), 2);
});

test("5 — schema validation failure on both attempts → max_retries_exceeded", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  const qr = makeQR([makeStateARec("REC-TAX-001", "Tax")]);
  const stage4Result = makeStage4Result({ recIds: ["REC-TAX-001"] });
  const invalid = makeValidLlmAuditOutput();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (invalid as any).llm_assessment;
  const client = makeMockClient([
    { kind: "tool_use_explicit", input: invalid },
    { kind: "tool_use_explicit", input: invalid },
  ]);

  const result = await auditPlan(stage4Result, qr, profile, baseOptions(client));
  assert.ok(isFailure(result));
  assert.equal(result._failure_type, "max_retries_exceeded");
  assert.equal(result._failure_context.last_failure_type, "schema_validation_failed");
});

test("5 — truncation (output_tokens === MAX_TOKENS=8000) aborts with context_overflow", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  const qr = makeQR([makeStateARec("REC-TAX-001", "Tax")]);
  const stage4Result = makeStage4Result({ recIds: ["REC-TAX-001"] });
  const client = makeMockClient([
    { kind: "tool_use_explicit", input: makeValidLlmAuditOutput(), outputTokens: 8000 },
  ]);

  const result = await auditPlan(stage4Result, qr, profile, baseOptions(client));
  assert.ok(isFailure(result));
  assert.equal(result._failure_type, "context_overflow");
  assert.match(result._failure_reason, /truncat|MAX_TOKENS/i);
  assert.equal(client.callCount(), 1, "no retry on truncation");
});

test("5 — api_error returns api_error", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  const qr = makeQR([makeStateARec("REC-TAX-001", "Tax")]);
  const stage4Result = makeStage4Result({ recIds: ["REC-TAX-001"] });
  const client = makeMockClient([
    { kind: "throw", error: new Error("simulated 500") },
  ]);

  const result = await auditPlan(stage4Result, qr, profile, baseOptions(client));
  assert.ok(isFailure(result));
  assert.equal(result._failure_type, "api_error");
  assert.match(result._failure_context.api_error ?? "", /simulated 500/);
});

test("5 — Stage 4 input is Stage4ResultFailed → fail-fast (no LLM call)", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  const qr = makeQR([makeStateARec("REC-TAX-001", "Tax")]);
  const failedStage4 = {
    _stage_status: "FAILED" as const,
    _failure_type: "schema_validation_failed" as const,
    _failure_reason: "test failure",
    _failure_context: { attempts_made: 2 },
    _metadata: {},
  };
  const client = makeMockClient([
    { kind: "tool_use_explicit", input: makeValidLlmAuditOutput() },
  ]);

  const result = await auditPlan(failedStage4, qr, profile, baseOptions(client));
  assert.ok(isFailure(result));
  assert.equal(result._failure_type, "stage4_input_failed");
  assert.equal(result._failure_context.stage4_failure_type, "schema_validation_failed");
  assert.equal(client.callCount(), 0, "no LLM call when Stage 4 input is failed");
  assert.equal(client.countTokensCallCount(), 0, "no count_tokens either");
});

test("5 — pre-flight real-token > 130K → soft-degrade to deterministic-only Stage5Result (NOT failed)", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  // Cross-ref to RB.5 triggers DC.1 critical so we can verify the
  // deterministic finding is preserved in the soft-degraded result.
  const qr = makeQR([makeStateARec("REC-TAX-001", "Tax")]);
  const stage4Result = makeStage4Result({
    recIds: ["REC-TAX-001"],
    invalidCrossRefTarget: "RB.5",
  });
  // Stage 5 ceiling is 130K real tokens (Phase 3.3 Step 3 final). Push the
  // mock countTokens just over to exercise the soft-degrade path.
  const client = makeMockClient(
    [{ kind: "tool_use_explicit", input: makeValidLlmAuditOutput() }],
    { countTokensValue: 131000 },
  );

  const result = await auditPlan(stage4Result, qr, profile, baseOptions(client));
  assert.ok(!isFailure(result), "context overflow must NOT produce Stage5ResultFailed");
  assert.equal(result.llm_assessment, null, "no LLM call fired");
  assert.equal(result._flags.llm_skipped, true);
  assert.equal(result._flags.llm_skipped_due_to_context_overflow, true);
  assert.equal(client.callCount(), 0, "stream LLM call must not fire");
  assert.equal(client.countTokensCallCount(), 1);
  // Deterministic findings should still be present.
  assert.ok(result.deterministic_checks.DC1_unresolved_cross_refs.length >= 1);
  assert.ok(result.findings.some((f) => f.category === "DC1_unresolved_cross_refs"));
  // Cost stays 0 — no LLM call fired.
  assert.equal(result._metadata.cost_cents, 0);
  // Real-token estimate captured in metadata for diagnostics.
  assert.equal(result._metadata.input_token_count, 131000);
});

test("5 — pre-flight chars/4 fast-fail also soft-degrades to deterministic-only Stage5Result", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  const qr = makeQR([makeStateARec("REC-TAX-001", "Tax")]);
  // Trigger chars/4 ceiling by stuffing a giant prose pool into the fixture.
  const giantProse = "x".repeat(400_000); // 400K chars > 80K chars/4 ceiling
  const stage4Result = makeStage4Result({
    recIds: ["REC-TAX-001"],
    prosePool: giantProse,
  });
  const client = makeMockClient(
    [{ kind: "tool_use_explicit", input: makeValidLlmAuditOutput() }],
    { countTokensValue: 35000 },
  );

  const result = await auditPlan(stage4Result, qr, profile, baseOptions(client));
  assert.ok(!isFailure(result), "chars/4 overflow must NOT produce Stage5ResultFailed");
  assert.equal(result.llm_assessment, null);
  assert.equal(result._flags.llm_skipped, true);
  assert.equal(result._flags.llm_skipped_due_to_context_overflow, true);
  assert.equal(client.callCount(), 0, "stream must not fire");
  // chars/4 fast-fail aborts before count_tokens — no count_tokens call either.
  assert.equal(client.countTokensCallCount(), 0);
  // Deterministic checks should still have run.
  assert.ok(result.deterministic_checks);
  assert.equal(result._metadata.cost_cents, 0);
});

test("5 — missing voice calibration / KB → kb_load_failed (no LLM call)", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  const qr = makeQR([makeStateARec("REC-TAX-001", "Tax")]);
  const stage4Result = makeStage4Result({ recIds: ["REC-TAX-001"] });
  const client = makeMockClient([
    { kind: "tool_use_explicit", input: makeValidLlmAuditOutput() },
  ]);

  const result = await auditPlan(stage4Result, qr, profile, {
    ...baseOptions(client),
    kbPath: "/tmp/this-does-not-exist-stage5",
  });
  assert.ok(isFailure(result));
  assert.equal(result._failure_type, "kb_load_failed");
  assert.equal(client.callCount(), 0);
});

test("5 — runLlmChecks: false produces deterministic-only Stage5Result (no LLM call)", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  const qr = makeQR([makeStateARec("REC-TAX-001", "Tax")]);
  const stage4Result = makeStage4Result({ recIds: ["REC-TAX-001"] });
  const client = makeMockClient([
    { kind: "tool_use_explicit", input: makeValidLlmAuditOutput() },
  ]);

  const result = await auditPlan(stage4Result, qr, profile, {
    ...baseOptions(client),
    runLlmChecks: false,
  });
  assert.ok(!isFailure(result));
  assert.equal(result.llm_assessment, null);
  assert.equal(result._flags.llm_skipped, true);
  assert.equal(
    result._flags.llm_skipped_due_to_context_overflow,
    false,
    "explicit opt-out is NOT a context overflow",
  );
  assert.equal(client.callCount(), 0, "no LLM call");
  assert.equal(client.countTokensCallCount(), 0, "no count_tokens either");
  assert.equal(result._metadata.cost_cents, 0);
});

// ────────────────────────────────────────────────────────────────────────
// Deterministic check tests (DC.1 – DC.10)
// ────────────────────────────────────────────────────────────────────────

test("5 — DC.1 unresolved cross-references surface as critical findings", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  const qr = makeQR([makeStateARec("REC-TAX-001", "Tax")]);
  // Cross-reference target RB.99 doesn't exist anywhere in the assembled plan.
  const stage4Result = makeStage4Result({
    recIds: ["REC-TAX-001"],
    invalidCrossRefTarget: "RB.5",
  });
  const client = makeMockClient(
    [{ kind: "tool_use_explicit", input: makeValidLlmAuditOutput() }],
    { countTokensValue: 35000 },
  );

  const result = await auditPlan(stage4Result, qr, profile, {
    ...baseOptions(client),
    runLlmChecks: false,
  });
  assert.ok(!isFailure(result));
  assert.ok(result.deterministic_checks.DC1_unresolved_cross_refs.length >= 1);
  const dc1Finding = result.findings.find(
    (f) => f.category === "DC1_unresolved_cross_refs",
  );
  assert.ok(dc1Finding, "expected DC.1 finding in findings array");
  assert.equal(dc1Finding!.severity, "critical");
});

test("5 — DC.2 roadmap orphan (action_item_id absent from QR)", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  const qr = makeQR([makeStateARec("REC-TAX-001", "Tax")]);
  const stage4Result = makeStage4Result({
    recIds: ["REC-TAX-001"],
    bogusRoadmapActionId: "AI-GHOST-001",
  });
  const client = makeMockClient(
    [{ kind: "tool_use_explicit", input: makeValidLlmAuditOutput() }],
  );

  const result = await auditPlan(stage4Result, qr, profile, {
    ...baseOptions(client),
    runLlmChecks: false,
  });
  assert.ok(!isFailure(result));
  assert.ok(result.deterministic_checks.DC2_roadmap_orphans.length >= 1);
  assert.equal(result.deterministic_checks.DC2_roadmap_orphans[0].source_action_item_id, "AI-GHOST-001");
});

test("5 — DC.3 Top 5 mismatch (rank/impact disagrees with deterministic computation)", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  // QR has a State A rec with estimate $1M. buildTopFivePriorities will rank
  // it #1 with impact "~$1.0M". Stage 4 fixture overrides Top 5 with
  // an obviously-wrong impact text.
  const qr = makeQR([makeStateARec("REC-TAX-001", "Tax", 1_000_000)]);
  const stage4Result = makeStage4Result({
    recIds: ["REC-TAX-001"],
    topPriorities: [
      {
        rank: 1,
        descriptor: "REC-TAX-001 (Tax)",
        estimated_impact_text: "~$50K", // wrong; deterministic says ~$1.0M
        timing_text: "0-30 days",
      },
    ],
  });
  const client = makeMockClient([
    { kind: "tool_use_explicit", input: makeValidLlmAuditOutput() },
  ]);

  const result = await auditPlan(stage4Result, qr, profile, {
    ...baseOptions(client),
    runLlmChecks: false,
  });
  assert.ok(!isFailure(result));
  assert.notEqual(result.deterministic_checks.DC3_top5_mismatch, null);
  assert.ok(result.findings.some((f) => f.category === "DC3_top5_mismatch"));
});

test("5 — DC.4 missing decisions (rec with decisions_needed=true absent from DN)", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  const recWithDecision = makeStateARec("REC-EST-001", "Estate");
  recWithDecision.decisions_needed = true;
  const qr = makeQR([recWithDecision]);
  const stage4Result = makeStage4Result({
    recIds: ["REC-EST-001"],
    decisionsNeededRecIds: [], // empty — the rec is not surfaced
  });
  const client = makeMockClient([
    { kind: "tool_use_explicit", input: makeValidLlmAuditOutput() },
  ]);

  const result = await auditPlan(stage4Result, qr, profile, {
    ...baseOptions(client),
    runLlmChecks: false,
  });
  assert.ok(!isFailure(result));
  assert.ok(result.deterministic_checks.DC4_missing_decisions.includes("REC-EST-001"));
  const dc4 = result.findings.find((f) => f.category === "DC4_missing_decisions");
  assert.ok(dc4);
  assert.equal(dc4!.severity, "critical");
});

test("5 — DC.5 unused glossary term (term in glossary but missing from prose)", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  const qr = makeQR([makeStateARec("REC-TAX-001", "Tax")]);
  const stage4Result = makeStage4Result({
    recIds: ["REC-TAX-001"],
    glossaryEntries: [
      // Term is intentionally absent from any prose path in the fixture.
      { term: "ZyloglyceriX", acronym: "ZGX", def: "A made-up term." },
    ],
    prosePool:
      "Mock prose body referring only to the standard PTET election and savings.",
  });
  const client = makeMockClient([
    { kind: "tool_use_explicit", input: makeValidLlmAuditOutput() },
  ]);

  const result = await auditPlan(stage4Result, qr, profile, {
    ...baseOptions(client),
    runLlmChecks: false,
  });
  assert.ok(!isFailure(result));
  assert.ok(
    result.deterministic_checks.DC5_unused_glossary.some(
      (t) => t.includes("ZGX") || t.includes("ZyloglyceriX"),
    ),
  );
});

test("5 — DC.6 missing sections (empty Business lens triggers RB.* missing flag)", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  const qr = makeQR([makeStateARec("REC-TAX-001", "Tax")]);
  const stage4Result = makeStage4Result({
    recIds: ["REC-TAX-001"],
    emptyBusinessSections: true,
  });
  const client = makeMockClient([
    { kind: "tool_use_explicit", input: makeValidLlmAuditOutput() },
  ]);

  const result = await auditPlan(stage4Result, qr, profile, {
    ...baseOptions(client),
    runLlmChecks: false,
  });
  assert.ok(!isFailure(result));
  assert.ok(result.deterministic_checks.DC6_missing_sections.includes("RB.*"));
  const dc6 = result.findings.find((f) => f.category === "DC6_missing_sections");
  assert.ok(dc6);
  assert.equal(dc6!.severity, "critical");
  assert.equal(dc6!.suggested_action, "regenerate_plan");
});

test("5 — DC.7 archetype-gating violation (PRE-only label under POST archetype)", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("POST"); // not PRE
  const qr = makeQR([makeStateARec("REC-TAX-001", "Tax")]);
  const stage4Result = makeStage4Result({
    recIds: ["REC-TAX-001"],
    businessSectionLabel: "[OPTIONAL — included because of pre-transaction posture]",
  });
  const client = makeMockClient([
    { kind: "tool_use_explicit", input: makeValidLlmAuditOutput() },
  ]);

  const result = await auditPlan(stage4Result, qr, profile, {
    ...baseOptions(client),
    runLlmChecks: false,
  });
  assert.ok(!isFailure(result));
  assert.ok(result.deterministic_checks.DC7_archetype_violations.length >= 1);
  const dc7 = result.findings.find((f) => f.category === "DC7_archetype_violations");
  assert.ok(dc7);
  assert.equal(dc7!.severity, "critical");
});

test("5 — DC.8 unused State A estimate (Stage 3a value not appearing in prose)", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  // Stage 3a says estimate is $500,000. Stage 4 prose only mentions $148,000.
  const rec = makeStateARec("REC-TAX-001", "Tax", 500_000);
  const qr = makeQR([rec]);
  const stage4Result = makeStage4Result({
    recIds: ["REC-TAX-001"],
    numberInProse: 148000, // mismatches Stage 3a's 500K
  });
  const client = makeMockClient([
    { kind: "tool_use_explicit", input: makeValidLlmAuditOutput() },
  ]);

  const result = await auditPlan(stage4Result, qr, profile, {
    ...baseOptions(client),
    runLlmChecks: false,
  });
  assert.ok(!isFailure(result));
  assert.ok(result.deterministic_checks.DC8_unused_numbers.length >= 1);
  const unused = result.deterministic_checks.DC8_unused_numbers.find(
    (u) => u.rec_id === "REC-TAX-001",
  );
  assert.ok(unused, "expected REC-TAX-001 in DC8_unused_numbers");
  const dc8 = result.findings.find((f) => f.category === "DC8_unused_numbers");
  assert.ok(dc8);
  assert.equal(dc8!.severity, "warning");
});

test("5 — DC.8 decimal-suffix dollar figures parse correctly ($7.4M = $7,400,000)", async () => {
  // Regression test for Phase 3.3 Step 3 polish — the prior regex
  // /\$\s*([0-9]{1,3}(?:,[0-9]{3})*|[0-9]+(?:\.[0-9]+)?)\s*([KMBkmb])?/g
  // had its alternation in the wrong order: for "$7.4M" the comma-grouped
  // alternative greedily matched "7" and stopped (since (?:,[0-9]{3})* is
  // happy with zero comma groups), so the suffix capture saw "." and failed,
  // yielding $7 instead of $7,400,000. On Holloway this produced ~10 false
  // positives. The fix swaps to (?:,[0-9]{3})+ (PLUS, not STAR) so the
  // comma-grouped pattern only fires when there's actually a comma.
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  const rec = makeStateARec("REC-TAX-001", "Tax", 7_400_000);
  const qr = makeQR([rec]);
  // Force ONLY $X.YM-form dollars into the prose path. numberInProse
  // (which the fixture renders as comma-grouped $9,999,999 in the bullet
  // briefing and Top 5 row) is set to a value that does NOT match the rec
  // estimate so it can't accidentally satisfy DC.8 — the only path that
  // matches must go through $7.4M -> 7,400,000 via the regex.
  const stage4Result = makeStage4Result({
    recIds: ["REC-TAX-001"],
    numberInProse: 9_999_999,
    prosePool:
      "Discounted estate transfer projected at approximately $7.4M of value moved out of estate via downstream GRAT/IDGT.",
  });
  const client = makeMockClient([
    { kind: "tool_use_explicit", input: makeValidLlmAuditOutput() },
  ]);

  const result = await auditPlan(stage4Result, qr, profile, {
    ...baseOptions(client),
    runLlmChecks: false,
  });
  assert.ok(!isFailure(result));
  // Under the FIXED regex, $7.4M parses to 7,400,000 — so DC.8 should NOT
  // flag REC-TAX-001 as unused. (Under the OLD regex, $7.4M parsed to $7
  // and DC.8 would have falsely flagged it.)
  const unusedIds = result.deterministic_checks.DC8_unused_numbers.map(
    (u) => u.rec_id,
  );
  assert.ok(
    !unusedIds.includes("REC-TAX-001"),
    `REC-TAX-001 ($7.4M expected, $7.4M in prose) should NOT be flagged as unused; got: ${JSON.stringify(unusedIds)}`,
  );
});

test("5 — DC.9 compliance issue (invalid tracking_id format)", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  const qr = makeQR([makeStateARec("REC-TAX-001", "Tax")]);
  const stage4Result = makeStage4Result({
    recIds: ["REC-TAX-001"],
    complianceTrackingId: "INVALID-FORMAT-NOT-PSA",
  });
  const client = makeMockClient([
    { kind: "tool_use_explicit", input: makeValidLlmAuditOutput() },
  ]);

  const result = await auditPlan(stage4Result, qr, profile, {
    ...baseOptions(client),
    runLlmChecks: false,
  });
  assert.ok(!isFailure(result));
  assert.ok(result.deterministic_checks.DC9_compliance_issues.length >= 1);
  const dc9 = result.findings.find((f) => f.category === "DC9_compliance_issues");
  assert.ok(dc9);
  assert.equal(dc9!.severity, "critical");
});

test("5 — DC.10 lifecycle violation (long_running ActionItem missing reminder template)", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  // Construct an action item with duration_class=long_running but
  // check_in_cadence=null (violation).
  const rec = makeStateARec("REC-TAX-001", "Tax");
  rec.action_items = [
    {
      ...makeActionItem("REC-TAX-001", 1),
      duration_class: "long_running",
      check_in_cadence: null, // violation
      auto_generated_reminder_template: null,
    },
  ];
  const qr = makeQR([rec]);
  const stage4Result = makeStage4Result({ recIds: ["REC-TAX-001"] });
  const client = makeMockClient([
    { kind: "tool_use_explicit", input: makeValidLlmAuditOutput() },
  ]);

  const result = await auditPlan(stage4Result, qr, profile, {
    ...baseOptions(client),
    runLlmChecks: false,
  });
  assert.ok(!isFailure(result));
  assert.ok(result.deterministic_checks.DC10_lifecycle_violations.length >= 1);
  const dc10 = result.findings.find((f) => f.category === "DC10_lifecycle_violations");
  assert.ok(dc10);
  assert.equal(dc10!.severity, "warning");
});

// ────────────────────────────────────────────────────────────────────────
// Merge + assessment override tests
// ────────────────────────────────────────────────────────────────────────

test("5 — combined deterministic + LLM merge produces sorted findings", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  const qr = makeQR([makeStateARec("REC-TAX-001", "Tax")]);
  const stage4Result = makeStage4Result({
    recIds: ["REC-TAX-001"],
    invalidCrossRefTarget: "RB.5", // triggers DC.1 critical
  });
  // LLM contributes 2 findings: 1 warning + 1 info.
  const llmFindings: AuditFinding[] = [
    {
      finding_id: "F-X1",
      severity: "warning",
      category: "LC2_numerical_contradictions",
      section_ids: ["ES"],
      description: "Mock LLM warning.",
      evidence: "Mock evidence.",
      suggested_action: "verify_with_advisor",
    },
    {
      finding_id: "F-X2",
      severity: "info",
      category: "LC6_voice_quality",
      section_ids: ["RB.1"],
      description: "Mock voice info.",
      evidence: "Mock evidence.",
      suggested_action: "informational_only",
    },
  ];
  const llmOut = makeValidLlmAuditOutput({ findings: llmFindings });
  const client = makeMockClient([{ kind: "tool_use_explicit", input: llmOut }]);

  const result = await auditPlan(stage4Result, qr, profile, baseOptions(client));
  assert.ok(!isFailure(result));
  // Deterministic findings (DC.1 critical + DC.3 warning from format drift
  // between the fixture's emitted impact text and the deterministic builder)
  // + 2 LLM (1 warning, 1 info) = 4 findings total. The point of this test
  // is the SORT order, not the exact count.
  assert.ok(result.findings.length >= 3);
  // Sort order: critical → warning(s) → info
  assert.equal(result.findings[0].severity, "critical");
  const lastIdx = result.findings.length - 1;
  assert.equal(result.findings[lastIdx].severity, "info");
  // All warnings should sit between the critical block and the info block.
  for (let i = 1; i < lastIdx; i += 1) {
    assert.equal(result.findings[i].severity, "warning");
  }
});

test("5 — harness overall_assessment authoritative over LLM vote (LLM votes ship_ready, harness sees critical → regenerate_recommended)", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  const qr = makeQR([makeStateARec("REC-TAX-001", "Tax")]);
  const stage4Result = makeStage4Result({
    recIds: ["REC-TAX-001"],
    // DC.1 critical: cross-ref to non-existent section
    invalidCrossRefTarget: "RB.5",
  });
  // LLM optimistically votes ship_ready.
  const llmOut = makeValidLlmAuditOutput({
    voice_consistency_score: 92,
    contradiction_count: 0,
    llm_overall_assessment: "ship_ready",
  });
  const client = makeMockClient([{ kind: "tool_use_explicit", input: llmOut }]);

  const result = await auditPlan(stage4Result, qr, profile, baseOptions(client));
  assert.ok(!isFailure(result));
  // Harness should override based on DC.1 critical structural finding.
  assert.equal(result.overall_assessment, "regenerate_recommended");
  assert.equal(result.llm_assessment!.llm_overall_assessment, "ship_ready");
  assert.equal(result._flags.assessment_disagreement, true);
});

test("5 — harness threshold tuning: 6 warning-severity contradictions → review_recommended (not regenerate)", async () => {
  // Phase 3.3 Step 3 polish — calibration regression test. Mirrors the
  // Holloway live result (6 LC.2/LC.3 warning-severity contradictions, voice
  // score 90, no DC critical findings). Under the prior `contradiction_count
  // >= 3 → regenerate` threshold the harness flipped to regenerate_recommended;
  // under the tuned threshold it correctly resolves to review_recommended.
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  const qr = makeQR([makeStateARec("REC-TAX-001", "Tax")]);
  const stage4Result = makeStage4Result({ recIds: ["REC-TAX-001"] });

  // 6 warning-severity LC.2/LC.3 findings — none critical.
  const warningFindings: AuditFinding[] = Array.from({ length: 6 }, (_, i) => ({
    finding_id: `F-WARN-${i + 1}`,
    severity: "warning" as const,
    category: i < 4
      ? ("LC2_numerical_contradictions" as const)
      : ("LC3_strategic_coherence" as const),
    section_ids: ["ES"],
    description: `Mock warning contradiction ${i + 1}.`,
    evidence: "Mock evidence.",
    suggested_action: "hand_edit" as const,
  }));
  const llmOut = makeValidLlmAuditOutput({
    voice_consistency_score: 90,
    contradiction_count: 6,
    llm_overall_assessment: "review_recommended",
    findings: warningFindings,
  });
  const client = makeMockClient([{ kind: "tool_use_explicit", input: llmOut }]);

  const result = await auditPlan(stage4Result, qr, profile, baseOptions(client));
  assert.ok(!isFailure(result));
  // Tuned threshold: 6 warning contradictions should NOT trigger regenerate.
  // The plan has ≥5 warnings so it lands at review_recommended.
  assert.equal(result.overall_assessment, "review_recommended");
  assert.equal(result.llm_assessment!.llm_overall_assessment, "review_recommended");
  // Harness and LLM now agree.
  assert.equal(result._flags.assessment_disagreement, false);
});

test("5 — harness threshold tuning: 1 critical-severity LC.2 contradiction → regenerate_recommended", async () => {
  // The new rule: critical-severity LC.2 / LC.3 contradictions trigger
  // regenerate even when DC.* is clean. A single critical numerical
  // contradiction (e.g., the plan's recommended action depends on a number
  // that contradicts another section) is too important to hand-edit around.
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  const qr = makeQR([makeStateARec("REC-TAX-001", "Tax")]);
  const stage4Result = makeStage4Result({ recIds: ["REC-TAX-001"] });

  const criticalContradiction: AuditFinding = {
    finding_id: "F-CRIT-1",
    severity: "critical",
    category: "LC2_numerical_contradictions",
    section_ids: ["ES", "RB.4"],
    description: "Critical numerical contradiction.",
    evidence: "Mock evidence.",
    suggested_action: "regenerate_section",
  };
  const llmOut = makeValidLlmAuditOutput({
    voice_consistency_score: 88,
    contradiction_count: 1,
    llm_overall_assessment: "review_recommended",
    findings: [criticalContradiction],
  });
  const client = makeMockClient([{ kind: "tool_use_explicit", input: llmOut }]);

  const result = await auditPlan(stage4Result, qr, profile, baseOptions(client));
  assert.ok(!isFailure(result));
  assert.equal(result.overall_assessment, "regenerate_recommended");
  // LLM voted review_recommended; harness escalated.
  assert.equal(result.llm_assessment!.llm_overall_assessment, "review_recommended");
  assert.equal(result._flags.assessment_disagreement, true);
});

// Live API placeholder
test(
  "5 — LIVE: full Holloway plan audit",
  { skip: !process.env.RUN_LIVE_API_TESTS },
  async () => {
    // Will be activated in Step 3.
    assert.ok(true, "placeholder — see Step 3");
  },
);
