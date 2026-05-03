import { test } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import {
  generatePlan,
  projectQuantifiedRecsForLlm,
  trimClientProfileForPass2,
  _resetStage4CachesForTesting,
  type Stage4ApiClient,
  type Stage4Options,
} from "../stage4PlanGenerator";
import {
  isStage4ResultFailed,
  type Stage4Result,
  type Stage4ResultFailed,
  type Stage4LlmRawOutput,
} from "../../schemas/stage4.types";
import { _resetStage4BuilderCachesForTesting } from "../../glue/stage4Builders";
import type {
  QuantifiedRecommendations,
  SequencedRecommendation,
  ActionItem,
  ArchetypeIdentifier,
  RecommendationCategory,
} from "../../schemas/pipelineTypes";
import type { ClientProfile } from "../../schemas/clientProfile";

const KB_PATH = path.resolve("kb/v1_2");

// ────────────────────────────────────────────────────────────────────────
// Mock client (mirrors Stage 3a.1 test pattern)
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
  const inputTokens = r.inputTokens ?? 80000;
  const outputTokens = r.outputTokens ?? 12000;
  if (r.kind === "tool_use_explicit") {
    return buildMockMessage(
      [makeToolUseBlock(r.input, toolName)],
      "tool_use",
      inputTokens,
      outputTokens,
    );
  }
  // text_only
  return buildMockMessage(
    [makeTextBlock(r.text)],
    "end_turn",
    inputTokens,
    outputTokens,
  );
}

// Mock countTokens response. Default: small fake count well under 165K
// ceiling so pre-flight passes. Tests can override with countTokensValue
// option to exercise the pre-flight overflow path.
interface MockClientOptions {
  countTokensValue?: number;
  countTokensThrows?: Error;
}

function makeMockClient(
  responses: MockResponse[],
  opts: MockClientOptions = {},
): Stage4ApiClient & {
  callCount: () => number;
  lastCall: () => Anthropic.MessageCreateParamsNonStreaming | null;
  allCalls: () => Anthropic.MessageCreateParamsNonStreaming[];
  countTokensCallCount: () => number;
} {
  let i = 0;
  let countTokensCalls = 0;
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  return {
    callCount: () => i,
    lastCall: () => calls[calls.length - 1] ?? null,
    allCalls: () => [...calls],
    countTokensCallCount: () => countTokensCalls,
    messages: {
      stream: (params) => {
        calls.push(params);
        // Resolve the response sequentially. The tool name comes from
        // params.tool_choice (the harness forces tool_choice per pass).
        const toolName =
          params.tool_choice && params.tool_choice.type === "tool"
            ? params.tool_choice.name
            : "submit_plan_sections";
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
        countTokensCalls += 1;
        if (opts.countTokensThrows) throw opts.countTokensThrows;
        return {
          input_tokens: opts.countTokensValue ?? 50000,
        } as unknown as Anthropic.MessageTokensCount;
      },
    },
  };
}

// ────────────────────────────────────────────────────────────────────────
// Fixture builders
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
      financial_goals: "Preserve wealth and accelerate transaction proceeds.",
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
      input_token_count: 1000,
      output_token_count: 5000,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      attempts_made: 1,
      attempt_history: [
        {
          attempt_number: 1,
          outcome: "success",
          failure_details: null,
          duration_ms: 1000,
          input_tokens: 1000,
          output_tokens: 5000,
        },
      ],
      duration_ms: 1000,
      source_fr_content_hash:
        "0000000000000000000000000000000000000000000000000000000000000000",
      parsed_at: "2026-05-01T00:00:00.000Z",
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
  planSection: string = "Recommendations — Business Tax",
): SequencedRecommendation {
  return {
    recommendation_id: recId,
    source_file_path: `kb/v1_2/01_recommendations/tax/${recId}.md`,
    category,
    status: "Active",
    position_in_sequence: 0,
    plan_section: planSection as SequencedRecommendation["plan_section"],
    subsection_within_section: null,
    co_triggered_with: [],
    quantified_impact: {
      estimate: { value: estimateValue, unit: "USD", is_annual: true },
      formula_id: "mock_v1",
      formula_source_file: `kb/v1_2/01_recommendations/tax/${recId}.md`,
      computation_inputs: { mock: 1 },
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

function makeStateDRec(
  recId: string,
  category: RecommendationCategory,
  planSection: string = "Recommendations — Family",
): SequencedRecommendation {
  return {
    ...makeStateARec(recId, category, 0, planSection),
    quantified_impact: {
      estimate: null,
      formula_id: null,
      formula_source_file: null,
      computation_inputs: {},
      pending_reconciliation: false,
      alternative_values: [],
      qualitative_phrasing: "Codifies family values and decision-making framework.",
      reason_no_formula: "intentionally_qualitative",
      blocked_inputs: [],
    },
  };
}

function makeStateCRec(
  recId: string,
  category: RecommendationCategory,
  planSection: string = "Recommendations — Estate Planning",
): SequencedRecommendation {
  const base = makeStateARec(recId, category, 0, planSection);
  return {
    ...base,
    quantified_impact: {
      estimate: null,
      formula_id: "grat_v1",
      formula_source_file: `kb/v1_2/01_recommendations/estate/${recId}.md`,
      computation_inputs: { s7520_rate_pct: 5.0 },
      pending_reconciliation: true,
      alternative_values: [
        {
          value: { value: 4500000, unit: "USD" },
          formula_variant: "3_year_term",
          awaiting: "default_grat_term",
          context: "3-year zeroed GRAT remainder",
        },
        {
          value: { value: 7800000, unit: "USD" },
          formula_variant: "5_year_term",
          awaiting: "default_grat_term",
          context: "5-year zeroed GRAT remainder",
        },
      ],
      qualitative_phrasing: "GRAT remainder $4.5M-$7.8M depending on firm policy.",
      reason_no_formula: null,
      blocked_inputs: [],
    },
    decisions_needed: true,
  };
}

function makeQuantifiedRecommendations(
  recs: SequencedRecommendation[],
): QuantifiedRecommendations {
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
// Valid LLM output fixture builder. Targets schema acceptance with minimal
// per-section content.
// ────────────────────────────────────────────────────────────────────────

interface LlmFixtureOptions {
  businessSectionIds?: string[];      // default ["RB.1"]
  personalSectionIds?: string[];       // default ["RP.8"]
  includeOptionalPreTransaction?: boolean;
  // For specific tests:
  numberInBusinessBullet?: number;     // override the dollar figure in the business section
  termsToInclude?: string[];           // glossary terms to seed in the prose for matching
  crossRefTargets?: Array<{ from: string; target: string }>;
}

function makeValidLlmOutput(opts: LlmFixtureOptions = {}): Stage4LlmRawOutput {
  const businessSectionIds = opts.businessSectionIds ?? ["RB.1"];
  const personalSectionIds = opts.personalSectionIds ?? ["RP.8"];
  const dollarFigure = opts.numberInBusinessBullet ?? 148000;
  const termsLine = opts.termsToInclude ? `Terms appearing in plan: ${opts.termsToInclude.join(", ")}.` : "";

  // For each provided business section ID, build a minimal section.
  const businessSections = businessSectionIds.map((sid, i) => ({
    section_id: sid as never,
    numbered_heading: `${i + 1}. Mock Business Recommendation`,
    label: opts.includeOptionalPreTransaction
      ? "[OPTIONAL — included because of pre-transaction posture]" as const
      : "[CORE SECTION]" as const,
    source_rec_ids: [`REC-TAX-00${i + 1}`],
    intro_paragraph: `Mock strategic frame for business recommendation ${i + 1}. ${termsLine}`,
    subsections: null,
    recommendations_bullets: [
      {
        bold_imperative: `File the mock action ${i + 1}.`,
        briefing: `Estimated annual savings: approximately $${dollarFigure.toLocaleString()} based on the mock framework. ${termsLine}`,
        partner_role: "CPA",
        source_action_item_ids: [`AI-TAX-00${i + 1}-1`],
      },
    ],
    closer_paragraph: null,
    cross_references: (opts.crossRefTargets ?? [])
      .filter((cr) => cr.from === sid)
      .map((cr) => ({ target_section_id: cr.target as never, display_text: `see ${cr.target}` })),
  }));

  const personalSections = personalSectionIds.map((sid, i) => ({
    section_id: sid as never,
    numbered_heading: `${8 + i}. Mock Personal Recommendation`,
    label: "[PERSONAL — for owner(s)]" as const,
    source_rec_ids: [`REC-FAM-00${i + 1}`],
    intro_paragraph: `Mock personal-lens framing. ${termsLine}`,
    subsections: null,
    recommendations_bullets: [
      {
        bold_imperative: `Take the personal action.`,
        briefing: `Mock personal-lens briefing without dollar figures. ${termsLine}`,
        partner_role: null,
        source_action_item_ids: [`AI-FAM-00${i + 1}-1`],
      },
    ],
    closer_paragraph: null,
    cross_references: (opts.crossRefTargets ?? [])
      .filter((cr) => cr.from === sid)
      .map((cr) => ({ target_section_id: cr.target as never, display_text: `see ${cr.target}` })),
  }));

  return {
    executive_summary: {
      opening_paragraph: "This document is the output of our discovery process for the mock client.",
      two_themes_paragraph: "Two themes shape this plan. First, the business is approaching a transaction window. Second, the planning we do now determines how much value the client retains.",
      top_priorities: [
        {
          rank: 1,
          descriptor: "REC-TAX-001 (Tax)",
          estimated_impact_text: `~$${dollarFigure.toLocaleString()}`,
          timing_text: "0-30 days",
        },
      ],
      what_this_means_closer: `The combined impact funds professional fees many times over. ${termsLine}`,
    },
    our_process: {
      intro_paragraph: "Financial planning is not a one-time event. It is an ongoing conversation.",
      stages: [
        { number: 1, name: "Discovery (completed)", body: "Mock body for discovery stage." },
        { number: 2, name: "Plan delivery (today)", body: "Mock body for delivery stage." },
        { number: 3, name: "Implementation", body: "Mock body for implementation stage." },
        { number: 4, name: "Ongoing review", body: "Mock body for ongoing review stage." },
      ],
      how_to_read_paragraph: "The Executive Summary is your 90-second readout. The Recommendations sections are our specific guidance.",
    },
    findings_observations: {
      intro_paragraph: "Based on what we have reviewed, here is where you stand today.",
      strengths: [
        { body: "Profitable business with clean operating posture." },
        { body: "Strong operating partner." },
        { body: "Existing qualified retirement plan." },
        { body: "Engaged ownership willing to invest in long-term planning." },
      ],
      opportunities: [
        {
          category: "Tax",
          bullets: [
            "PTET election not made; leaving federal tax savings on the table.",
            "Cost segregation study not performed; depreciation acceleration available.",
          ],
        },
      ],
    },
    recommendations_business: {
      intro_paragraph: "Business recommendations focus on entity structure, tax, and risk.",
      sections: businessSections,
    },
    recommendations_personal: {
      intro_paragraph: "Personal recommendations focus on the parachute outside the business.",
      sections: personalSections,
    },
    meeting_cadence_intro: {
      intro_paragraph: "A plan that is delivered and never revisited goes stale within 12 months.",
      immediate_next_steps: [
        "Review this document.",
        "Decide on the top 3 priorities.",
      ],
    },
  };
}

// ────────────────────────────────────────────────────────────────────────
// Two-pass helpers — split a full Stage4LlmRawOutput into Pass 1 + Pass 2
// shapes so mocks can return per-pass payloads matching the live module's
// two-pass architecture.
// ────────────────────────────────────────────────────────────────────────

function splitForPasses(full: Stage4LlmRawOutput): {
  pass1: Omit<Stage4LlmRawOutput, "recommendations_personal">;
  pass2: { recommendations_personal: Stage4LlmRawOutput["recommendations_personal"] };
} {
  return {
    pass1: {
      executive_summary: full.executive_summary,
      our_process: full.our_process,
      findings_observations: full.findings_observations,
      recommendations_business: full.recommendations_business,
      meeting_cadence_intro: full.meeting_cadence_intro,
    },
    pass2: {
      recommendations_personal: full.recommendations_personal,
    },
  };
}

// Convenience: produces both mock-response entries for a happy-path
// two-pass run from a single Stage4LlmRawOutput fixture.
function twoPassResponses(full: Stage4LlmRawOutput): MockResponse[] {
  const split = splitForPasses(full);
  return [
    { kind: "tool_use_explicit", input: split.pass1 },
    { kind: "tool_use_explicit", input: split.pass2 },
  ];
}

function pass1Of(full: Stage4LlmRawOutput) {
  return splitForPasses(full).pass1;
}
function pass2Of(full: Stage4LlmRawOutput) {
  return splitForPasses(full).pass2;
}

// ────────────────────────────────────────────────────────────────────────
// Common test helpers
// ────────────────────────────────────────────────────────────────────────

function isFailure(r: Stage4Result | Stage4ResultFailed): r is Stage4ResultFailed {
  return (r as Stage4ResultFailed)._stage_status === "FAILED";
}

function baseOptions(client: Stage4ApiClient, advisorId = "will-bearden"): Stage4Options {
  return {
    apiClient: client,
    kbPath: KB_PATH,
    advisorId,
    generatedDate: new Date("2026-04-29T00:00:00Z"),
    referenceDate: new Date("2026-04-29T00:00:00Z"),
    maxRetries: 1,
  };
}

function resetCaches() {
  _resetStage4CachesForTesting();
  _resetStage4BuilderCachesForTesting();
}

// ────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────

test("4 — mock success: realistic 3-rec input → valid Stage4Result with all 14 sections present", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  const recs = makeQuantifiedRecommendations([
    makeStateARec("REC-TAX-001", "Tax"),
    makeStateCRec("REC-EST-006", "Estate"),
    makeStateDRec("REC-FAM-001", "Family"),
  ]);
  const llmOut = makeValidLlmOutput({
    termsToInclude: ["PTET", "GRAT"],
  });
  const client = makeMockClient(twoPassResponses(llmOut));

  const result = await generatePlan(profile, recs, baseOptions(client));
  assert.ok(!isFailure(result), `expected success, got: ${JSON.stringify(result).slice(0, 300)}`);

  // All six llm_sections populated.
  assert.ok(result.llm_sections.executive_summary.two_themes_paragraph.length > 0);
  assert.ok(result.llm_sections.our_process.stages.length === 4);
  assert.ok(result.llm_sections.findings_observations.strengths.length >= 4);
  assert.ok(result.llm_sections.recommendations_business.sections.length >= 1);
  assert.ok(result.llm_sections.recommendations_personal.sections.length >= 1);
  assert.ok(result.llm_sections.meeting_cadence_intro.intro_paragraph.length > 0);

  // All eight deterministic_sections populated.
  assert.ok(result.deterministic_sections.title_page.client_full_name.length > 0);
  assert.ok(result.deterministic_sections.client_snapshot !== null);
  assert.ok(result.deterministic_sections.goals_priorities.goals.length >= 1);
  assert.ok(result.deterministic_sections.implementation_roadmap.total_action_count >= 1);
  // 1 of 3 recs (REC-EST-006) is decisions_needed=true; expect 1 row.
  assert.equal(result.deterministic_sections.decisions_needed.rows.length, 1);
  assert.ok(result.deterministic_sections.advisory_team.rows.length >= 1);
  assert.equal(result.deterministic_sections.meeting_cadence_table.rows.length, 5);
  // Glossary auto-extracted from prose; PTET + GRAT were in our prose.
  const glossaryAcronyms = result.deterministic_sections.glossary.entries.map((e) => e.acronym);
  assert.ok(glossaryAcronyms.includes("PTET"), `expected PTET in glossary, got: ${glossaryAcronyms.join(",")}`);
  assert.ok(glossaryAcronyms.includes("GRAT"));
  assert.ok(result.deterministic_sections.disclosures.body_paragraphs.length >= 4);

  // Metadata — two-pass: 2 attempts (Pass 1 + Pass 2), one each.
  assert.equal(result._metadata.stage_version, "4-1.0.0");
  assert.equal(result._metadata.attempts_made, 2);
  assert.ok(result._metadata.cost_cents >= 0);
});

test("4 — tool_use response correctly extracted: Pass 1 + Pass 2 each emit tool_use blocks", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  const recs = makeQuantifiedRecommendations([
    makeStateARec("REC-TAX-001", "Tax"),
  ]);
  const llmOut = makeValidLlmOutput();
  const client = makeMockClient(twoPassResponses(llmOut));

  const result = await generatePlan(profile, recs, baseOptions(client));
  assert.ok(!isFailure(result));

  // Verify both passes wired correctly: 2 stream calls, each forcing the
  // appropriate per-pass tool.
  const calls = client.allCalls();
  assert.equal(calls.length, 2, "exactly 2 stream calls (one per pass)");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pass1 = calls[0] as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pass2 = calls[1] as any;
  assert.equal(pass1.tools[0].name, "submit_plan_sections_pass1");
  assert.deepEqual(pass1.tool_choice, {
    type: "tool",
    name: "submit_plan_sections_pass1",
  });
  assert.equal(pass2.tools[0].name, "submit_plan_sections_pass2");
  assert.deepEqual(pass2.tool_choice, {
    type: "tool",
    name: "submit_plan_sections_pass2",
  });
});

test("4 — Pass 1 schema validation failure on first attempt → Pass 1 retry succeeds → Pass 2 succeeds", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  const recs = makeQuantifiedRecommendations([
    makeStateARec("REC-TAX-001", "Tax"),
  ]);
  // First Pass-1 attempt: invalid (missing two_themes_paragraph)
  const invalid = makeValidLlmOutput();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (invalid.executive_summary as any).two_themes_paragraph;
  // Second Pass-1 attempt + Pass-2 attempt: valid
  const valid = makeValidLlmOutput();
  const client = makeMockClient([
    { kind: "tool_use_explicit", input: pass1Of(invalid) },
    { kind: "tool_use_explicit", input: pass1Of(valid) },
    { kind: "tool_use_explicit", input: pass2Of(valid) },
  ]);

  const result = await generatePlan(profile, recs, baseOptions(client));
  assert.ok(!isFailure(result));
  // attempts_made = 3 (Pass 1 attempt 1 fail + Pass 1 attempt 2 success + Pass 2 attempt 1 success)
  assert.equal(result._metadata.attempts_made, 3);
  assert.equal(client.callCount(), 3);
});

test("4 — Pass 1 schema validation failure on both attempts → max_retries_exceeded; Pass 2 not attempted", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  const recs = makeQuantifiedRecommendations([
    makeStateARec("REC-TAX-001", "Tax"),
  ]);
  const invalid = makeValidLlmOutput();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (invalid.executive_summary as any).two_themes_paragraph;
  const client = makeMockClient([
    { kind: "tool_use_explicit", input: pass1Of(invalid) },
    { kind: "tool_use_explicit", input: pass1Of(invalid) },
  ]);

  const result = await generatePlan(profile, recs, baseOptions(client));
  assert.ok(isFailure(result));
  assert.equal(result._failure_type, "max_retries_exceeded");
  assert.equal(
    result._failure_context.last_failure_type,
    "schema_validation_failed",
  );
  // 2 Pass-1 attempts; Pass 2 must NOT fire when Pass 1 fails.
  assert.equal(client.callCount(), 2);
});

test("4 — Pass 1 truncation (output_tokens === MAX_TOKENS) aborts with context_overflow", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  const recs = makeQuantifiedRecommendations([
    makeStateARec("REC-TAX-001", "Tax"),
  ]);
  const llmOut = makeValidLlmOutput();
  // Pass 1 attempt 1 truncates → context_overflow → no retry, no Pass 2.
  const client = makeMockClient([
    {
      kind: "tool_use_explicit",
      input: pass1Of(llmOut),
      outputTokens: 32000,
    },
  ]);

  const result = await generatePlan(profile, recs, baseOptions(client));
  assert.ok(isFailure(result));
  assert.equal(result._failure_type, "context_overflow");
  assert.match(result._failure_reason, /truncat|MAX_TOKENS/i);
  assert.equal(
    client.callCount(),
    1,
    "neither retry nor Pass 2 must fire on Pass-1 truncation",
  );
});

test("4 — api_error returns api_error failure type", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  const recs = makeQuantifiedRecommendations([
    makeStateARec("REC-TAX-001", "Tax"),
  ]);
  const client = makeMockClient([
    { kind: "throw", error: new Error("simulated 500") },
  ]);

  const result = await generatePlan(profile, recs, baseOptions(client));
  assert.ok(isFailure(result));
  assert.equal(result._failure_type, "api_error");
  assert.match(result._failure_context.api_error ?? "", /simulated 500/);
});

test("4 — advisor_id not found → advisor_lookup_failed (no LLM call fires)", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  const recs = makeQuantifiedRecommendations([
    makeStateARec("REC-TAX-001", "Tax"),
  ]);
  // Use an unknown advisor_id
  const client = makeMockClient([
    { kind: "tool_use_explicit", input: makeValidLlmOutput() },
  ]);

  const result = await generatePlan(profile, recs, baseOptions(client, "unknown-advisor-id"));
  assert.ok(isFailure(result));
  assert.equal(result._failure_type, "advisor_lookup_failed");
  assert.equal(client.callCount(), 0, "API must not be called when advisor lookup fails");
});

test("4 — pre-flight context overflow via count_tokens API (real-token ceiling) → fail-fast", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  const recs = makeQuantifiedRecommendations([
    makeStateARec("REC-TAX-001", "Tax"),
  ]);
  // Mock count_tokens returns 200000 (above the 165K real-token ceiling),
  // so pre-flight aborts before the streaming LLM call fires. Verifies the
  // new authoritative pre-flight gate uses Anthropic's actual tokenizer.
  const client = makeMockClient(
    [{ kind: "tool_use_explicit", input: pass1Of(makeValidLlmOutput()) }],
    { countTokensValue: 200000 },
  );

  const result = await generatePlan(profile, recs, baseOptions(client));
  assert.ok(isFailure(result));
  assert.equal(result._failure_type, "context_overflow");
  assert.equal(
    client.callCount(),
    0,
    "stream LLM call must not fire when pre-flight overflows",
  );
  assert.equal(
    client.countTokensCallCount(),
    1,
    "count_tokens fires once for Pass 1; Pass 2 not reached because Pass 1 fails the gate",
  );
  assert.equal(
    result._failure_context.estimated_input_tokens,
    200000,
    "estimated_input_tokens should reflect the real-token count from count_tokens",
  );
});

test("4 — pre-flight chars/4 fast-fail short-circuits before count_tokens API", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  // Pad enough description text to trip the chars/4 fast-fail at 130K.
  // Each ActionItem's description survives the LLM-input trim. 200 recs
  // × 3000-char description ≈ 600K chars, well over the 130K chars/4 cap
  // (≈520K chars equivalent).
  const padRecs: SequencedRecommendation[] = [];
  for (let i = 0; i < 200; i++) {
    const r = makeStateARec(`REC-TAX-${String(i).padStart(3, "0")}`, "Tax");
    r.action_items = r.action_items.map((ai) => ({
      ...ai,
      description: "X".repeat(3000),
    }));
    padRecs.push(r);
  }
  const recs = makeQuantifiedRecommendations(padRecs);
  const client = makeMockClient([
    { kind: "tool_use_explicit", input: pass1Of(makeValidLlmOutput()) },
  ]);

  const result = await generatePlan(profile, recs, baseOptions(client));
  assert.ok(isFailure(result));
  assert.equal(result._failure_type, "context_overflow");
  assert.equal(
    client.callCount(),
    0,
    "stream LLM call must not fire when chars/4 short-circuits",
  );
  assert.equal(
    client.countTokensCallCount(),
    0,
    "count_tokens must NOT be called when chars/4 short-circuits (fast-fail saves the API round trip)",
  );
});

test("4 — missing voice calibration doc → kb_load_failed (no LLM call fires)", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  const recs = makeQuantifiedRecommendations([
    makeStateARec("REC-TAX-001", "Tax"),
  ]);
  const client = makeMockClient([
    { kind: "tool_use_explicit", input: makeValidLlmOutput() },
  ]);

  // Override the voice calibration cache to throw on load by overriding the
  // path (use a non-existent kbPath — the system prompt loads from module
  // dir so it resolves; voice calibration loads from specs/ which exists).
  // Easier: pass an unknown advisor to fail early instead. Test the actual
  // kb_load_failed by pointing kbPath to a non-existent dir, which makes
  // both advisors.json and glossary_terms.md unloadable.
  const result = await generatePlan(profile, recs, {
    ...baseOptions(client),
    kbPath: "/tmp/this-does-not-exist-stage4",
  });
  assert.ok(isFailure(result));
  assert.equal(result._failure_type, "kb_load_failed");
  assert.equal(client.callCount(), 0, "API must not be called when KB load fails");
});

test("4 — archetype gating: PRE includes [OPTIONAL — pre-transaction] section", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  const recs = makeQuantifiedRecommendations([
    makeStateARec("REC-TAX-001", "Tax"),
  ]);
  const llmOut = makeValidLlmOutput({ includeOptionalPreTransaction: true });
  const client = makeMockClient(twoPassResponses(llmOut));

  const result = await generatePlan(profile, recs, baseOptions(client));
  assert.ok(!isFailure(result));
  // PRE archetype should permit the optional-pre-transaction section.
  // The LLM emitted RB.1 with the [OPTIONAL — pre-transaction] label;
  // _flags.optional_sections_included should record it.
  assert.ok(
    result._flags.optional_sections_included.length >= 1,
    `expected optional_sections_included to track the inclusion, got: ${JSON.stringify(result._flags.optional_sections_included)}`,
  );
  assert.equal(result._flags.optional_sections_included[0].archetype, "PRE");
});

test("4 — archetype gating: POST excludes [OPTIONAL — pre-transaction] in Pass 1 (Pass 1 retry; Pass 2 succeeds)", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("POST");
  const recs = makeQuantifiedRecommendations([
    makeStateARec("REC-TAX-001", "Tax"),
  ]);
  // LLM incorrectly includes a [OPTIONAL — pre-transaction] section under POST in Pass 1.
  const llmOutBad = makeValidLlmOutput({ includeOptionalPreTransaction: true });
  // Pass 1 retry with corrected output (no optional section); Pass 2 valid.
  const llmOutGood = makeValidLlmOutput({ includeOptionalPreTransaction: false });
  const client = makeMockClient([
    { kind: "tool_use_explicit", input: pass1Of(llmOutBad) },
    { kind: "tool_use_explicit", input: pass1Of(llmOutGood) },
    { kind: "tool_use_explicit", input: pass2Of(llmOutGood) },
  ]);

  const result = await generatePlan(profile, recs, baseOptions(client));
  assert.ok(!isFailure(result));
  // Final result has no optional inclusions — Pass 1 retry fixed the gating violation.
  assert.equal(result._flags.optional_sections_included.length, 0);
  assert.ok(result._flags.conditional_sections_omitted.length >= 1);
  // attempts_made = 3 (Pass 1 attempt 1 fail + Pass 1 attempt 2 success + Pass 2 attempt 1)
  assert.equal(result._metadata.attempts_made, 3);
});

test("4 — cross-reference resolution: valid target_section_id preserved", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  const recs = makeQuantifiedRecommendations([
    makeStateARec("REC-TAX-001", "Tax"),
  ]);
  // LLM emits RB.1 with a cross-ref to RP.8 (which exists since RP.8 is also emitted).
  const llmOut = makeValidLlmOutput({
    crossRefTargets: [{ from: "RB.1", target: "RP.8" }],
  });
  const client = makeMockClient(twoPassResponses(llmOut));

  const result = await generatePlan(profile, recs, baseOptions(client));
  assert.ok(!isFailure(result));
  // Cross-reference RB.1 → RP.8 should be preserved on the section.
  const rb1 = result.llm_sections.recommendations_business.sections.find(
    (s) => s.section_id === "RB.1",
  );
  assert.ok(rb1);
  assert.equal(rb1!.cross_references.length, 1);
  assert.equal(rb1!.cross_references[0].target_section_id, "RP.8");
  // Unresolved list should be empty.
  assert.equal(result._flags.unresolved_cross_references.length, 0);
});

test("4 — cross-reference resolution: invalid target_section_id stripped + flagged", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  const recs = makeQuantifiedRecommendations([
    makeStateARec("REC-TAX-001", "Tax"),
  ]);
  // Build the LLM output by hand to use a target ID that's outside the enum
  // but valid as a string at LLM time. Since the schema enum constrains it,
  // we have to construct the cross_references manually — use ts-ignore on
  // the as never assertion.
  const llmOut = makeValidLlmOutput();
  // Inject an invalid target via a non-emitted RB.* slot. RB.99 doesn't exist
  // in the enum, but the string-typed `as never` cast in the fixture lets the
  // schema reject it later.
  // Instead, use a valid enum value (RB.5) that the LLM didn't actually emit
  // — RB.1 is present, RB.5 is not.
  llmOut.recommendations_business.sections[0].cross_references = [
    { target_section_id: "RB.5" as never, display_text: "see Section 5" },
  ];
  const client = makeMockClient(twoPassResponses(llmOut));

  const result = await generatePlan(profile, recs, baseOptions(client));
  assert.ok(!isFailure(result));
  // Cross-reference to RB.5 (not emitted) should be stripped + flagged.
  const rb1 = result.llm_sections.recommendations_business.sections.find(
    (s) => s.section_id === "RB.1",
  );
  assert.ok(rb1);
  assert.equal(rb1!.cross_references.length, 0);
  assert.equal(result._flags.unresolved_cross_references.length, 1);
  assert.equal(
    result._flags.unresolved_cross_references[0].target_section_id,
    "RB.5",
  );
});

test("4 — number drift: hard mismatch surfaces in flags (post-merge, flag-only — two-pass arch defers drift to post-merge)", async () => {
  // Phase 3.2 Step 3 multi-pass refactor: number drift detection moved
  // from per-attempt retry trigger to post-merge flag-only signal. Hard
  // drifts no longer trigger retries (a Pass-1 retry can only fix Pass-1
  // numbers; the conversation-history retry semantics get complex with
  // two passes). The result is SUCCESS but flags surface the drift for
  // human review.
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  const recs = makeQuantifiedRecommendations([
    makeStateARec("REC-TAX-001", "Tax", 148000),
  ]);
  // LLM emits $500,000 in Pass 1 (hard drift; outside [148K * 0.5, 148K * 2] band).
  const llmOutDrift = makeValidLlmOutput({ numberInBusinessBullet: 500000 });
  const client = makeMockClient(twoPassResponses(llmOutDrift));

  const result = await generatePlan(profile, recs, baseOptions(client));
  assert.ok(!isFailure(result), "drift is flag-only; result still succeeds");
  // attempts_made = 2 (Pass 1 + Pass 2; no retry on drift).
  assert.equal(result._metadata.attempts_made, 2);
  // Hard drift surfaces in flags.
  const hardDrifts = result._flags.numbers_drift.filter(
    (d) => d.severity === "hard",
  );
  assert.ok(
    hardDrifts.length >= 1,
    `expected hard drift entry; got: ${JSON.stringify(result._flags.numbers_drift)}`,
  );
});

test("4 — glossary subset: prose with PTET + GRAT yields glossary entries for both", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  const recs = makeQuantifiedRecommendations([
    makeStateARec("REC-TAX-001", "Tax"),
  ]);
  const llmOut = makeValidLlmOutput({
    termsToInclude: ["PTET", "GRAT", "ILIT"],
  });
  const client = makeMockClient(twoPassResponses(llmOut));

  const result = await generatePlan(profile, recs, baseOptions(client));
  assert.ok(!isFailure(result));
  const acronyms = result.deterministic_sections.glossary.entries
    .map((e) => e.acronym)
    .filter((a) => a !== null);
  assert.ok(acronyms.includes("PTET"), `PTET should appear in glossary; got: ${acronyms.join(",")}`);
  assert.ok(acronyms.includes("GRAT"));
  assert.ok(acronyms.includes("ILIT"));
  // Terms that weren't in the prose should NOT appear (e.g., "BOE").
  assert.ok(!acronyms.includes("BOE"));

  // Glossary terms used flag mirrors what landed in the glossary.
  assert.ok(result._flags.glossary_terms_used.length >= 3);
});

test("4 — Implementation Roadmap deterministic build: groups by timing_bucket in canonical order", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  // Build recs across multiple timing buckets.
  const recs = makeQuantifiedRecommendations([
    {
      ...makeStateARec("REC-TAX-001", "Tax"),
      action_items: [
        { ...makeActionItem("REC-TAX-001", 1), timing_bucket: "0-30 days" },
        { ...makeActionItem("REC-TAX-001", 2), timing_bucket: "30-60 days" },
        { ...makeActionItem("REC-TAX-001", 3), timing_bucket: "Ongoing" },
      ],
    },
  ]);
  const llmOut = makeValidLlmOutput();
  const client = makeMockClient(twoPassResponses(llmOut));

  const result = await generatePlan(profile, recs, baseOptions(client));
  assert.ok(!isFailure(result));
  const groups = result.deterministic_sections.implementation_roadmap.groups;
  // Order must be: 0-30 days first, then 30-60 days, then Ongoing.
  assert.equal(groups[0].timing_bucket, "0-30 days");
  assert.equal(groups[1].timing_bucket, "30-60 days");
  assert.equal(groups[2].timing_bucket, "Ongoing");
  // Each group has exactly the expected row count.
  assert.equal(groups[0].rows.length, 1);
  assert.equal(groups[1].rows.length, 1);
  assert.equal(groups[2].rows.length, 1);
  assert.equal(result.deterministic_sections.implementation_roadmap.total_action_count, 3);
});

test("4 — Decisions Needed deterministic build: rows derived from State C / decisions_needed=true recs", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  const recs = makeQuantifiedRecommendations([
    makeStateARec("REC-TAX-001", "Tax"),       // not pending
    makeStateCRec("REC-EST-006", "Estate"),    // pending (State C, decisions_needed=true)
    makeStateCRec("REC-EST-007", "Estate"),    // pending
  ]);
  const llmOut = makeValidLlmOutput();
  const client = makeMockClient(twoPassResponses(llmOut));

  const result = await generatePlan(profile, recs, baseOptions(client));
  assert.ok(!isFailure(result));
  // 2 of 3 recs pending → 2 rows.
  assert.equal(result.deterministic_sections.decisions_needed.rows.length, 2);
  // Each row should have a recommended_path from alternative_values[0].context.
  const row1 = result.deterministic_sections.decisions_needed.rows[0];
  assert.match(row1.recommended_path, /3-year zeroed GRAT/);
  // Source recommendation_id should be tied back.
  const sourceIds = result.deterministic_sections.decisions_needed.rows
    .map((r) => r.source_recommendation_id)
    .sort();
  assert.deepEqual(sourceIds, ["REC-EST-006", "REC-EST-007"]);
});

test("4 — projectQuantifiedRecsForLlm — strips excluded fields, preserves kept fields", () => {
  // Build a fixture rec with EVERY field populated, including the ones the
  // diagnosis says should be excluded from the LLM input.
  const baseAi = makeActionItem("REC-TAX-001", 1, "Tax");
  const fullyPopulatedAi: ActionItem = {
    ...baseAi,
    sub_steps: ["sub-step 1", "sub-step 2", "sub-step 3"],
    depends_on: ["AI-OTHER-1", "AI-OTHER-2"],
    duration_class: "long_running",
    check_in_cadence: "monthly",
    auto_generated_reminder_template: {
      cadence: "monthly",
      trigger_threshold_days: 30,
      reminder_text_template: "Check in on {{description}} with {{partner_type}}.",
    },
    partner_required: true,
    partner_type: "CPA",
    parent_action_item_id: null,
    is_derivative_reminder: false,
    source_plan_id: null,
    owner_name: null,
  };
  const baseRec = makeStateARec("REC-TAX-001", "Tax", 148000);
  const fullyPopulatedRec: SequencedRecommendation = {
    ...baseRec,
    source_file_path: "kb/v1_2/01_recommendations/tax/REC-TAX-001_x.md",
    status: "Active",
    position_in_sequence: 5,
    owner_name: "Some Name",
    cluster_id: "tax_foundation",
    cluster_sequence_closer: "REC-TAX-099",
    match_strength: "strong",
    _audit_notes: "Audit-style note that should NOT reach the LLM input.",
    quantified_impact: {
      ...baseRec.quantified_impact,
      formula_source_file: "kb/v1_2/01_recommendations/tax/REC-TAX-001_x.md",
      computation_inputs: {
        k1_income_usd: 4000000,
        federal_marginal_rate_percent: 37,
      },
    },
    action_items: [fullyPopulatedAi],
  };
  const fullEnvelope: QuantifiedRecommendations = {
    ...makeQuantifiedRecommendations([fullyPopulatedRec]),
    _metadata: {
      stage_version: "3a-orchestration-1.0.0",
      model_used: "claude-opus-4-7",
      total_input_tokens: 100000,
      total_output_tokens: 30000,
      total_cache_creation_input_tokens: 0,
      total_cache_read_input_tokens: 0,
      total_attempts: 1,
      cost_cents: 1500,
      total_duration_ms: 200000,
      per_batch: [],
      source_fr_content_hash: "deadbeef",
      source_selected_recommendations_hash: null,
      parsed_at: new Date().toISOString(),
    },
  };

  // Apply the projection.
  const trimmed = projectQuantifiedRecsForLlm(fullEnvelope);

  // ── Envelope-level: dropped fields ──────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = trimmed as any;
  assert.equal(t._metadata, undefined, "_metadata must be dropped");
  assert.equal(t._sequencer_flags, undefined, "_sequencer_flags must be dropped");
  assert.equal(t._sequencer_status, undefined, "_sequencer_status must be dropped");
  assert.equal(
    t._sequencer_failures,
    undefined,
    "_sequencer_failures must be dropped",
  );
  // Envelope: kept field
  assert.ok(Array.isArray(t.recommendations));
  assert.equal(t.recommendations.length, 1);

  // ── Per-rec: dropped fields ─────────────────────────────────────────
  const rec = t.recommendations[0];
  assert.equal(rec.source_file_path, undefined, "source_file_path must be dropped");
  assert.equal(rec.status, undefined, "status must be dropped");
  assert.equal(
    rec.position_in_sequence,
    undefined,
    "position_in_sequence must be dropped",
  );
  assert.equal(rec.owner_name, undefined, "rec.owner_name must be dropped");
  assert.equal(rec.cluster_id, undefined, "cluster_id must be dropped");
  assert.equal(
    rec.cluster_sequence_closer,
    undefined,
    "cluster_sequence_closer must be dropped",
  );
  assert.equal(rec.match_strength, undefined, "match_strength must be dropped");
  assert.equal(rec._audit_notes, undefined, "_audit_notes must be dropped");
  assert.equal(
    rec.quantified_impact.formula_source_file,
    undefined,
    "quantified_impact.formula_source_file must be dropped",
  );
  assert.equal(
    rec.quantified_impact.computation_inputs,
    undefined,
    "quantified_impact.computation_inputs must be dropped",
  );

  // ── Per-rec: kept fields ────────────────────────────────────────────
  assert.equal(rec.recommendation_id, "REC-TAX-001");
  assert.equal(rec.category, "Tax");
  assert.ok(rec.plan_section);
  assert.ok("subsection_within_section" in rec, "subsection_within_section must be present");
  assert.ok(Array.isArray(rec.co_triggered_with));
  assert.ok(rec.quantified_impact);
  assert.notEqual(rec.quantified_impact.estimate, undefined);
  assert.equal(typeof rec.quantified_impact.formula_id, "string");
  assert.equal(typeof rec.quantified_impact.pending_reconciliation, "boolean");
  assert.ok(Array.isArray(rec.quantified_impact.alternative_values));
  assert.ok(Array.isArray(rec.quantified_impact.blocked_inputs));
  assert.ok("qualitative_phrasing" in rec.quantified_impact);
  assert.ok("reason_no_formula" in rec.quantified_impact);
  assert.ok("scenario_range" in rec);
  assert.equal(rec.timing_bucket, "0-30 days");
  assert.equal(rec.owner, "CPA");
  assert.equal(typeof rec.decisions_needed, "boolean");
  assert.equal(typeof rec.landmine, "boolean");
  assert.equal(typeof rec.landmine_status, "string");
  assert.equal(typeof rec.default_excluded, "boolean");
  assert.ok("plan_output_variant" in rec);
  assert.ok(Array.isArray(rec.action_items));

  // ── Per-ActionItem: dropped fields ──────────────────────────────────
  const ai = rec.action_items[0];
  assert.equal(ai.sub_steps, undefined, "ai.sub_steps must be dropped");
  assert.equal(ai.depends_on, undefined, "ai.depends_on must be dropped");
  assert.equal(
    ai.auto_generated_reminder_template,
    undefined,
    "ai.auto_generated_reminder_template must be dropped",
  );
  assert.equal(ai.owner_name, undefined, "ai.owner_name must be dropped");
  assert.equal(
    ai.parent_action_item_id,
    undefined,
    "ai.parent_action_item_id must be dropped",
  );
  assert.equal(
    ai.is_derivative_reminder,
    undefined,
    "ai.is_derivative_reminder must be dropped",
  );
  assert.equal(ai.source_plan_id, undefined, "ai.source_plan_id must be dropped");

  // ── Per-ActionItem: kept fields ─────────────────────────────────────
  assert.equal(typeof ai.action_item_id, "string");
  assert.equal(typeof ai.description, "string");
  assert.equal(typeof ai.category, "string");
  assert.equal(typeof ai.source_recommendation_id, "string");
  assert.equal(typeof ai.source_phase_or_step, "string");
  assert.equal(typeof ai.owner, "string");
  assert.equal(typeof ai.timing_bucket, "string");
  assert.equal(typeof ai.is_decision_needed, "boolean");
  assert.equal(typeof ai.duration_class, "string");
  assert.ok("check_in_cadence" in ai);
  assert.equal(typeof ai.partner_required, "boolean");
  assert.ok("partner_type" in ai);

  // ── Output is JSON-serializable + sanity-check size reduction ───────
  const trimmedJson = JSON.stringify(trimmed);
  const fullJson = JSON.stringify(fullEnvelope);
  assert.ok(trimmedJson.length > 0);
  assert.ok(
    trimmedJson.length < fullJson.length,
    `trimmed JSON (${trimmedJson.length}) must be shorter than full (${fullJson.length})`,
  );
});

// ────────────────────────────────────────────────────────────────────────
// Multi-pass architecture tests (Phase 3.2 Step 3 refactor)
// ────────────────────────────────────────────────────────────────────────

test("4 — two-pass success: both passes succeed; merge produces complete Stage4LlmRawOutput", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  const recs = makeQuantifiedRecommendations([
    makeStateARec("REC-TAX-001", "Tax"),
    makeStateDRec("REC-FAM-001", "Family"),
  ]);
  const llmOut = makeValidLlmOutput();
  const client = makeMockClient(twoPassResponses(llmOut));

  const result = await generatePlan(profile, recs, baseOptions(client));
  assert.ok(!isFailure(result));

  // Both passes resolved cleanly — exactly 2 stream calls.
  assert.equal(client.callCount(), 2);
  assert.equal(result._metadata.attempts_made, 2);

  // Pass 1 sections present.
  assert.ok(result.llm_sections.executive_summary);
  assert.ok(result.llm_sections.our_process);
  assert.ok(result.llm_sections.findings_observations);
  assert.ok(result.llm_sections.recommendations_business.sections.length > 0);
  assert.ok(result.llm_sections.meeting_cadence_intro);

  // Pass 2 section merged in.
  assert.ok(result.llm_sections.recommendations_personal.sections.length > 0);
  // Sanity: the merged personal lens carries the RP.* section IDs.
  for (const sec of result.llm_sections.recommendations_personal.sections) {
    assert.ok(
      sec.section_id.startsWith("RP."),
      `Pass 2 section_id should start with RP.; got: ${sec.section_id}`,
    );
  }

  // count_tokens fires twice — once per pass — since Pass 2's user turn
  // has a slimmed ClientProfile (mitigation B) and may have different
  // real-token count than Pass 1.
  assert.equal(
    client.countTokensCallCount(),
    2,
    "pre-flight count_tokens fires once per pass (Pass 1 + Pass 2)",
  );
});

test("4 — Pass 1 fails: Pass 2 not attempted; failure preserved in attempt_history", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  const recs = makeQuantifiedRecommendations([
    makeStateARec("REC-TAX-001", "Tax"),
  ]);
  // Pass 1 returns a text-only response on both attempts (no tool_use block).
  // Schema validation fails → max retries exhausted → return failure without
  // touching Pass 2.
  const client = makeMockClient([
    { kind: "text_only", text: "Pass 1 refusal — no tool call." },
    { kind: "text_only", text: "Pass 1 refusal again." },
  ]);

  const result = await generatePlan(profile, recs, baseOptions(client));
  assert.ok(isFailure(result));
  assert.equal(result._failure_type, "max_retries_exceeded");
  assert.equal(result._failure_context.last_failure_type, "schema_validation_failed");
  // Verify Pass 2 didn't fire.
  assert.equal(client.callCount(), 2, "exactly 2 Pass-1 attempts; Pass 2 never opens");
  // attempt_history records both Pass 1 attempts.
  const history = result._metadata.attempt_history ?? [];
  assert.equal(history.length, 2);
  assert.ok(
    history.every((a) => a.failure_details?.startsWith("[pass1]")),
    "all attempts tagged [pass1]",
  );
});

test("4 — Pass 2 fails after Pass 1 success: returns FAILED but Pass 1 success preserved in attempt_history", async () => {
  resetCaches();
  const profile = makeMinimalClientProfile("PRE");
  const recs = makeQuantifiedRecommendations([
    makeStateARec("REC-TAX-001", "Tax"),
  ]);
  const llmOut = makeValidLlmOutput();
  // Pass 1 succeeds on first attempt; Pass 2 returns text-only on both attempts.
  const client = makeMockClient([
    { kind: "tool_use_explicit", input: pass1Of(llmOut) },
    { kind: "text_only", text: "Pass 2 refusal." },
    { kind: "text_only", text: "Pass 2 refusal again." },
  ]);

  const result = await generatePlan(profile, recs, baseOptions(client));
  assert.ok(isFailure(result));
  assert.equal(result._failure_type, "max_retries_exceeded");
  // Three stream calls: 1 successful Pass 1 + 2 failed Pass 2 attempts.
  assert.equal(client.callCount(), 3);
  // attempt_history preserves the Pass 1 success entry alongside Pass 2 failures.
  const history = result._metadata.attempt_history ?? [];
  assert.equal(history.length, 3);
  assert.ok(
    history[0].failure_details?.includes("[pass1]") &&
      history[0].outcome === "success",
    "first entry is Pass 1 success",
  );
  assert.ok(
    history[1].failure_details?.startsWith("[pass2]") &&
      history[1].outcome === "schema_validation_failed",
    "second entry is Pass 2 attempt 1 failure",
  );
  assert.ok(
    history[2].failure_details?.startsWith("[pass2]") &&
      history[2].outcome === "schema_validation_failed",
    "third entry is Pass 2 attempt 2 failure",
  );
});

// ────────────────────────────────────────────────────────────────────────
// Mitigation tests (Phase 3.2 Step 3 size-mitigation pass)
// ────────────────────────────────────────────────────────────────────────

test("4 — projectQuantifiedRecsForLlm — drops action_items[*].description for non-State-A recs (mitigation A)", () => {
  // State A rec (estimate populated) — description must be PRESENT in the
  // trimmed shape because the LLM narrates from it in bullet briefings.
  const stateARec = makeStateARec("REC-TAX-001", "Tax", 148000);
  // State B rec (estimate null + blocked_inputs populated) — description
  // must be DROPPED in the trimmed shape; LLM uses qualitative_phrasing instead.
  const stateBRec: SequencedRecommendation = {
    ...makeStateARec("REC-EST-001", "Estate"),
    quantified_impact: {
      estimate: null,
      formula_id: "blocked_v1",
      formula_source_file: null,
      computation_inputs: {},
      pending_reconciliation: false,
      alternative_values: [],
      qualitative_phrasing: "Pending appraisal of business interests.",
      reason_no_formula: null,
      blocked_inputs: [
        {
          input_name: "business_appraisal_value",
          blocked_reason: "Awaiting valuation firm engagement.",
          source: "Valuation Provider",
          would_unblock_when: "Appraisal completes",
        },
      ],
    },
  };
  // State D rec (qualitative-only).
  const stateDRec = makeStateDRec("REC-FAM-001", "Family");

  const fullEnvelope = makeQuantifiedRecommendations([
    stateARec,
    stateBRec,
    stateDRec,
  ]);
  const trimmed = projectQuantifiedRecsForLlm(fullEnvelope);

  // State A rec keeps description.
  const stateAtrimmed = trimmed.recommendations.find(
    (r) => r.recommendation_id === "REC-TAX-001",
  );
  assert.ok(stateAtrimmed);
  assert.ok(stateAtrimmed!.action_items.length > 0);
  assert.equal(
    typeof stateAtrimmed!.action_items[0].description,
    "string",
    "State A rec must keep action_items[0].description",
  );

  // State B rec drops description.
  const stateBtrimmed = trimmed.recommendations.find(
    (r) => r.recommendation_id === "REC-EST-001",
  );
  assert.ok(stateBtrimmed);
  assert.equal(
    stateBtrimmed!.action_items[0].description,
    undefined,
    "State B rec must drop action_items[0].description",
  );

  // State D rec drops description.
  const stateDtrimmed = trimmed.recommendations.find(
    (r) => r.recommendation_id === "REC-FAM-001",
  );
  assert.ok(stateDtrimmed);
  assert.equal(
    stateDtrimmed!.action_items[0].description,
    undefined,
    "State D rec must drop action_items[0].description",
  );

  // Sanity: trimmed JSON is shorter than full JSON for the non-State-A recs.
  const fullStateBJson = JSON.stringify(stateBRec.action_items);
  const trimmedStateBJson = JSON.stringify(stateBtrimmed!.action_items);
  assert.ok(
    trimmedStateBJson.length < fullStateBJson.length,
    "State B trimmed action_items JSON must be shorter than full",
  );
});

test("4 — trimClientProfileForPass2 — drops business-only sections; keeps personal fields", () => {
  const profile = makeMinimalClientProfile("PRE");
  const trimmed = trimClientProfileForPass2(profile);

  // Personal sections kept.
  assert.ok(trimmed.engagement, "engagement kept (archetype gating)");
  assert.ok(trimmed.client_and_family, "client_and_family kept");
  assert.ok(trimmed.personal_balance_sheet, "personal_balance_sheet kept");
  assert.ok(trimmed.income, "income kept");
  assert.ok(trimmed.cash_flow, "cash_flow kept");
  assert.ok(trimmed.tax_status, "tax_status kept");
  assert.ok(trimmed.estate_planning, "estate_planning kept");
  assert.ok(trimmed.insurance, "insurance kept");
  assert.ok(trimmed.goals_and_values, "goals_and_values kept");
  assert.ok(
    Array.isArray(trimmed.existing_advisor_relationships),
    "existing_advisor_relationships kept",
  );
  assert.ok(trimmed._metadata, "_metadata kept");

  // Business-only sections dropped.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = trimmed as any;
  assert.equal(t.entities, undefined, "entities must be dropped for Pass 2");
  assert.equal(
    t.entity_structure,
    undefined,
    "entity_structure must be dropped for Pass 2",
  );
  assert.equal(
    t.transaction_posture,
    undefined,
    "transaction_posture must be dropped for Pass 2",
  );
  assert.equal(
    t.prior_transactions,
    undefined,
    "prior_transactions must be dropped for Pass 2",
  );

  // Pass 2 trimmed CP is shorter than full CP.
  const fullJson = JSON.stringify(profile);
  const trimmedJson = JSON.stringify(trimmed);
  assert.ok(
    trimmedJson.length < fullJson.length,
    `trimmed Pass-2 CP (${trimmedJson.length} chars) must be shorter than full CP (${fullJson.length})`,
  );
});

// Live API placeholder — gated on env var, deferred to Step 3.
test(
  "4 — LIVE: full Holloway plan generation",
  { skip: !process.env.RUN_LIVE_API_TESTS },
  async () => {
    // Will be activated in Step 3 (live ceiling validation).
    // Plan: load artifacts/holloway_clientprofile.json and
    // artifacts/stage3a_full_pipeline_test_v2.json; call real Anthropic API;
    // assert structural invariants and cost under $35.
    assert.ok(true, "placeholder — see Step 3");
  },
);
