import { test } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import {
  quantifyBatch,
  _resetCachesForTesting,
  type Stage3a1ApiClient,
  type Stage3a1Options,
} from "../stage3a1BatchQuantifier";
import type {
  BatchContext,
  Stage3a1Result,
  Stage3a1ResultFailed,
} from "../../schemas/stage3a1.types";
import type { ClientProfile } from "../../schemas/clientProfile";
import type { SelectedRecommendation } from "../../schemas/selectedRecommendations";

const KB_PATH = path.resolve("kb/v1_2");

// ────────────────────────────────────────────────────────────────────────
// Mock Anthropic client (mirror Stage 1 test pattern)
// ────────────────────────────────────────────────────────────────────────

type MockResponse =
  | { kind: "text"; text: string; inputTokens?: number; outputTokens?: number }
  | { kind: "throw"; error: Error };

function makeMockMessage(
  text: string,
  inputTokens = 5000,
  outputTokens = 3000,
): Anthropic.Message {
  return {
    id: "msg_mock",
    type: "message",
    role: "assistant",
    model: "claude-opus-4-7",
    stop_reason: "end_turn",
    stop_sequence: null,
    content: [{ type: "text", text, citations: [] } as unknown as Anthropic.TextBlock],
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      service_tier: "standard",
    },
  } as unknown as Anthropic.Message;
}

function makeMockClient(responses: MockResponse[]): Stage3a1ApiClient & {
  callCount: () => number;
  lastCall: () => Anthropic.MessageCreateParamsNonStreaming | null;
} {
  let i = 0;
  let last: Anthropic.MessageCreateParamsNonStreaming | null = null;
  return {
    callCount: () => i,
    lastCall: () => last,
    messages: {
      create: async (params) => {
        last = params;
        const r = responses[i] ?? responses[responses.length - 1];
        i += 1;
        if (r.kind === "throw") throw r.error;
        return makeMockMessage(r.text, r.inputTokens, r.outputTokens);
      },
    },
  };
}

// ────────────────────────────────────────────────────────────────────────
// Fixture builders
// ────────────────────────────────────────────────────────────────────────

function makeMinimalClientProfile(): ClientProfile {
  // Just enough shape for Stage 3a.1 to JSON.stringify without crashing.
  // Stage 3a.1 doesn't read fields itself; the LLM does. We only need the
  // shape to be a valid object for serialization.
  return {
    _metadata: {
      stage_version: "1.0.0",
      model_used: "claude-opus-4-7",
      input_token_count: 0,
      output_token_count: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      attempts_made: 1,
      attempt_history: [],
      duration_ms: 0,
      source_fr_content_hash: "abcdef1234567890",
      parsed_at: new Date().toISOString(),
    },
  } as unknown as ClientProfile;
}

function makeSelectedRec(
  recId: string,
  category = "Tax",
): SelectedRecommendation {
  return {
    recommendation_id: recId,
    category: category as SelectedRecommendation["category"],
    match_strength: "strong",
    triggers_matched: ["mock"],
    triggers_partial: [],
    must_come_after: [],
    must_come_before: [],
    sequenced_with: [],
    coordinated_with: [],
    mutually_exclusive_with: [],
    preliminary_preference: null,
    preliminary_preference_rationale: null,
    landmine: false,
    landmine_status: "not_a_landmine",
    brief_rationale: "Mock rationale.",
  };
}

function makeBatchContext(batchIndex = 0, totalBatches = 1): BatchContext {
  return {
    batch_index: batchIndex,
    total_batches: totalBatches,
    preceding_batch_rec_ids: [],
    following_batch_rec_ids: [],
  };
}

const VALID_FLAGS = {
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

function makeStateARec(recId = "REC-TAX-001") {
  return {
    recommendation_id: recId,
    source_file_path: `kb/v1_2/01_recommendations/tax/${recId}_x.md`,
    category: "Tax",
    status: "Active",
    position_in_sequence: 0,
    plan_section: "Recommendations — Business Tax",
    subsection_within_section: null,
    co_triggered_with: [],
    quantified_impact: {
      estimate: { value: 130000, unit: "USD", is_annual: true },
      formula_id: "ptet_v1",
      formula_source_file: "kb/v1_2/01_recommendations/tax/REC-TAX-001_x.md",
      computation_inputs: { k1_income_usd: 4000000 },
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
    action_items: [
      {
        action_item_id: `AI-${recId}-1`,
        description: "File the form.",
        sub_steps: [],
        category: "Tax",
        source_recommendation_id: recId,
        source_phase_or_step: "Phase 1",
        owner: "CPA",
        owner_name: null,
        timing_bucket: "0-30 days",
        depends_on: [],
        is_decision_needed: false,
        duration_class: "point_in_time",
        check_in_cadence: null,
        partner_required: true,
        partner_type: "CPA",
        parent_action_item_id: null,
        is_derivative_reminder: false,
        source_plan_id: null,
        auto_generated_reminder_template: null,
      },
    ],
    landmine: false,
    landmine_status: "not_a_landmine",
    default_excluded: false,
    plan_output_variant: null,
    match_strength: "strong",
    _audit_notes: null,
  };
}

function makeStateCRec(recId = "REC-EST-006") {
  return {
    recommendation_id: recId,
    source_file_path: `kb/v1_2/01_recommendations/estate/${recId}_x.md`,
    category: "Estate",
    status: "Active",
    position_in_sequence: 0,
    plan_section: "Recommendations — Estate Planning",
    subsection_within_section: null,
    co_triggered_with: [],
    quantified_impact: {
      estimate: null,
      formula_id: "grat_v1",
      formula_source_file: "kb/v1_2/01_recommendations/estate/REC-EST-006_x.md",
      computation_inputs: { s7520_rate_at_funding_percent: 5.0 },
      pending_reconciliation: true,
      alternative_values: [
        {
          value: { value: 4500000, unit: "USD" },
          formula_variant: "3_year_term",
          awaiting: "default_grat_term",
          context: "3-year zeroed GRAT remainder",
        },
      ],
      qualitative_phrasing: "GRAT remainder $4.5M-$7.8M depending on firm policy.",
      reason_no_formula: null,
      blocked_inputs: [],
    },
    scenario_range: null,
    timing_bucket: "30-60 days",
    owner: "Attorney",
    owner_name: null,
    decisions_needed: true,
    cluster_id: null,
    cluster_sequence_closer: null,
    action_items: [],
    landmine: false,
    landmine_status: "not_a_landmine",
    default_excluded: false,
    plan_output_variant: null,
    match_strength: "strong",
    _audit_notes: null,
  };
}

function makeStateDRec(recId = "REC-FAM-006") {
  return {
    recommendation_id: recId,
    source_file_path: `kb/v1_2/01_recommendations/family/${recId}_x.md`,
    category: "Family",
    status: "Active",
    position_in_sequence: 0,
    plan_section: "Recommendations — Family",
    subsection_within_section: null,
    co_triggered_with: [],
    quantified_impact: {
      estimate: null,
      formula_id: null,
      formula_source_file: null,
      computation_inputs: {},
      pending_reconciliation: false,
      alternative_values: [],
      qualitative_phrasing: "Codifies family values.",
      reason_no_formula: "intentionally_qualitative",
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
    landmine_status: "not_a_landmine",
    default_excluded: false,
    plan_output_variant: null,
    match_strength: "strong",
    _audit_notes: null,
  };
}

function makeValidResponseBody(
  batchIndex = 0,
  totalBatches = 1,
  recommendations: ReturnType<typeof makeStateARec>[] = [makeStateARec("REC-TAX-001")],
) {
  return {
    batch_index: batchIndex,
    total_batches: totalBatches,
    recommendations,
    _stage_flags: VALID_FLAGS,
  };
}

function isFailure(
  r: Stage3a1Result | Stage3a1ResultFailed,
): r is Stage3a1ResultFailed {
  return (r as Stage3a1ResultFailed)._stage_status === "FAILED";
}

function baseOptions(client: Stage3a1ApiClient): Stage3a1Options {
  return {
    apiClient: client,
    kbPath: KB_PATH,
    referenceDate: new Date("2026-04-25"),
    maxRetries: 1,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Tests — Pass A (mock-only)
// ────────────────────────────────────────────────────────────────────────

test("3a.1 — mock success: small batch, 1 State A rec → valid Stage3a1Result", async () => {
  _resetCachesForTesting();
  const profile = makeMinimalClientProfile();
  const batch = [makeSelectedRec("REC-TAX-001")];
  const ctx = makeBatchContext(0, 1);
  const body = makeValidResponseBody(0, 1, [makeStateARec("REC-TAX-001")]);
  const client = makeMockClient([{ kind: "text", text: JSON.stringify(body) }]);

  const result = await quantifyBatch(profile, batch, ctx, baseOptions(client));
  assert.ok(!isFailure(result), `expected success, got ${JSON.stringify(result).slice(0, 200)}`);
  assert.equal(result.recommendations.length, 1);
  assert.equal(result.recommendations[0].recommendation_id, "REC-TAX-001");
  assert.equal(result._metadata.attempts_made, 1);
  assert.equal(client.callCount(), 1);
});

test("3a.1 — invalid JSON → max_retries_exceeded after 2 attempts", async () => {
  _resetCachesForTesting();
  const profile = makeMinimalClientProfile();
  const batch = [makeSelectedRec("REC-TAX-001")];
  const ctx = makeBatchContext();
  const client = makeMockClient([
    { kind: "text", text: "{not valid" },
    { kind: "text", text: "still not valid" },
  ]);

  const result = await quantifyBatch(profile, batch, ctx, baseOptions(client));
  assert.ok(isFailure(result));
  assert.equal(result._failure_type, "max_retries_exceeded");
  assert.equal(result._failure_context.last_failure_type, "json_parse_failed");
  assert.equal(result._failure_context.attempts_made, 2);
  assert.equal(client.callCount(), 2);
});

test("3a.1 — schema-invalid (State C with empty alternative_values) → max_retries_exceeded", async () => {
  _resetCachesForTesting();
  const profile = makeMinimalClientProfile();
  const batch = [makeSelectedRec("REC-EST-006", "Estate")];
  const ctx = makeBatchContext();
  const badRec = makeStateCRec("REC-EST-006");
  // State C invariant: pending_reconciliation === true requires non-empty alternative_values
  badRec.quantified_impact.alternative_values = [];
  const body = makeValidResponseBody(0, 1, [badRec as unknown as ReturnType<typeof makeStateARec>]);
  const client = makeMockClient([
    { kind: "text", text: JSON.stringify(body) },
    { kind: "text", text: JSON.stringify(body) },
  ]);

  const result = await quantifyBatch(profile, batch, ctx, baseOptions(client));
  assert.ok(isFailure(result));
  assert.equal(result._failure_type, "max_retries_exceeded");
  assert.equal(result._failure_context.last_failure_type, "schema_validation_failed");
  const errs = result._failure_context.validation_errors ?? [];
  assert.ok(
    errs.some((e) => e.includes("alternative_values") || e.includes("State C")),
    `expected State C invariant error, got: ${errs.join(" | ")}`,
  );
});

test("3a.1 — long_running ActionItem with null check_in_cadence → schema validation fails", async () => {
  _resetCachesForTesting();
  const profile = makeMinimalClientProfile();
  const batch = [makeSelectedRec("REC-TAX-001")];
  const ctx = makeBatchContext();
  const badRec = makeStateARec("REC-TAX-001");
  // Inject the broken ActionItem.
  badRec.action_items[0].duration_class = "long_running";
  badRec.action_items[0].check_in_cadence = null;
  badRec.action_items[0].auto_generated_reminder_template = null;
  const body = makeValidResponseBody(0, 1, [badRec]);
  const client = makeMockClient([
    { kind: "text", text: JSON.stringify(body) },
    { kind: "text", text: JSON.stringify(body) },
  ]);

  const result = await quantifyBatch(profile, batch, ctx, baseOptions(client));
  assert.ok(isFailure(result));
  assert.equal(result._failure_type, "max_retries_exceeded");
  const errs = result._failure_context.validation_errors ?? [];
  assert.ok(
    errs.some((e) => e.includes("duration_class") || e.includes("check_in_cadence")),
    `expected lifecycle invariant error, got: ${errs.join(" | ")}`,
  );
});

test("3a.1 — partner_required: true + partner_type: null → schema validation fails", async () => {
  _resetCachesForTesting();
  const profile = makeMinimalClientProfile();
  const batch = [makeSelectedRec("REC-TAX-001")];
  const ctx = makeBatchContext();
  const badRec = makeStateARec("REC-TAX-001");
  badRec.action_items[0].partner_required = true;
  badRec.action_items[0].partner_type = null;
  const body = makeValidResponseBody(0, 1, [badRec]);
  const client = makeMockClient([
    { kind: "text", text: JSON.stringify(body) },
    { kind: "text", text: JSON.stringify(body) },
  ]);

  const result = await quantifyBatch(profile, batch, ctx, baseOptions(client));
  assert.ok(isFailure(result));
  const errs = result._failure_context.validation_errors ?? [];
  assert.ok(
    errs.some((e) => e.includes("partner_required") || e.includes("partner_type")),
    `expected partner invariant error, got: ${errs.join(" | ")}`,
  );
});

test("3a.1 — foreign rec_id (not in batch) → schema validation fails after retry", async () => {
  _resetCachesForTesting();
  const profile = makeMinimalClientProfile();
  const batch = [makeSelectedRec("REC-TAX-001")];
  const ctx = makeBatchContext();
  // Mock returns a rec_id NOT in batch.
  const body = makeValidResponseBody(0, 1, [makeStateARec("REC-TAX-099")]);
  const client = makeMockClient([
    { kind: "text", text: JSON.stringify(body) },
    { kind: "text", text: JSON.stringify(body) },
  ]);

  const result = await quantifyBatch(profile, batch, ctx, baseOptions(client));
  assert.ok(isFailure(result));
  assert.equal(result._failure_type, "max_retries_exceeded");
  const errs = result._failure_context.validation_errors ?? [];
  assert.ok(
    errs.some((e) => e.includes("REC-TAX-099") || e.includes("not present in this batch")),
    `expected foreign rec_id error, got: ${errs.join(" | ")}`,
  );
});

test("3a.1 — retry success: invalid first, valid second → success with attempts_made: 2", async () => {
  _resetCachesForTesting();
  const profile = makeMinimalClientProfile();
  const batch = [makeSelectedRec("REC-TAX-001")];
  const ctx = makeBatchContext();
  const body = makeValidResponseBody(0, 1, [makeStateARec("REC-TAX-001")]);
  const client = makeMockClient([
    { kind: "text", text: "{broken" },
    { kind: "text", text: JSON.stringify(body) },
  ]);

  const result = await quantifyBatch(profile, batch, ctx, baseOptions(client));
  assert.ok(!isFailure(result));
  assert.equal(result._metadata.attempts_made, 2);
  assert.equal(client.callCount(), 2);
});

test("3a.1 — KB load failure (unknown rec_id prefix) → kb_load_failed", async () => {
  _resetCachesForTesting();
  const profile = makeMinimalClientProfile();
  // REC-XYZ doesn't map to a KB directory.
  const batch = [
    {
      ...makeSelectedRec("REC-TAX-001"),
      recommendation_id: "REC-XYZ-001",
    } as SelectedRecommendation,
  ];
  const ctx = makeBatchContext();
  const client = makeMockClient([{ kind: "text", text: "{}" }]);

  const result = await quantifyBatch(profile, batch, ctx, baseOptions(client));
  assert.ok(isFailure(result));
  assert.equal(result._failure_type, "kb_load_failed");
  assert.equal(result._failure_context.missing_rec_id, "REC-XYZ-001");
  assert.equal(client.callCount(), 0);
});

test("3a.1 — API error → api_error (not retried)", async () => {
  _resetCachesForTesting();
  const profile = makeMinimalClientProfile();
  const batch = [makeSelectedRec("REC-TAX-001")];
  const ctx = makeBatchContext();
  const client = makeMockClient([{ kind: "throw", error: new Error("simulated 500") }]);

  const result = await quantifyBatch(profile, batch, ctx, baseOptions(client));
  assert.ok(isFailure(result));
  assert.equal(result._failure_type, "api_error");
  assert.match(result._failure_context.api_error ?? "", /simulated 500/);
});

test("3a.1 — State A success (estimate populated, no blocked_inputs)", async () => {
  _resetCachesForTesting();
  const profile = makeMinimalClientProfile();
  const batch = [makeSelectedRec("REC-TAX-001")];
  const ctx = makeBatchContext();
  const body = makeValidResponseBody(0, 1, [makeStateARec("REC-TAX-001")]);
  const client = makeMockClient([{ kind: "text", text: JSON.stringify(body) }]);

  const result = await quantifyBatch(profile, batch, ctx, baseOptions(client));
  assert.ok(!isFailure(result));
  const qi = result.recommendations[0].quantified_impact;
  assert.notEqual(qi.estimate, null);
  assert.equal(qi.blocked_inputs.length, 0);
  assert.equal(qi.alternative_values.length, 0);
});

test("3a.1 — State C success (alternative_values + pending_reconciliation)", async () => {
  _resetCachesForTesting();
  const profile = makeMinimalClientProfile();
  const batch = [makeSelectedRec("REC-EST-006", "Estate")];
  const ctx = makeBatchContext();
  const body = makeValidResponseBody(0, 1, [makeStateCRec("REC-EST-006") as unknown as ReturnType<typeof makeStateARec>]);
  const client = makeMockClient([{ kind: "text", text: JSON.stringify(body) }]);

  const result = await quantifyBatch(profile, batch, ctx, baseOptions(client));
  assert.ok(!isFailure(result));
  const qi = result.recommendations[0].quantified_impact;
  assert.equal(qi.estimate, null);
  assert.equal(qi.pending_reconciliation, true);
  assert.ok(qi.alternative_values.length > 0);
});

test("3a.1 — State D success (qualitative-only, reason_no_formula populated)", async () => {
  _resetCachesForTesting();
  const profile = makeMinimalClientProfile();
  const batch = [makeSelectedRec("REC-FAM-006", "Family")];
  const ctx = makeBatchContext();
  const body = makeValidResponseBody(0, 1, [makeStateDRec("REC-FAM-006") as unknown as ReturnType<typeof makeStateARec>]);
  const client = makeMockClient([{ kind: "text", text: JSON.stringify(body) }]);

  const result = await quantifyBatch(profile, batch, ctx, baseOptions(client));
  assert.ok(!isFailure(result));
  const qi = result.recommendations[0].quantified_impact;
  assert.equal(qi.estimate, null);
  assert.equal(qi.formula_id, null);
  assert.notEqual(qi.qualitative_phrasing, null);
  assert.equal(qi.reason_no_formula, "intentionally_qualitative");
});

test("3a.1 — batch context is threaded into user turn", async () => {
  _resetCachesForTesting();
  const profile = makeMinimalClientProfile();
  const batch = [makeSelectedRec("REC-TAX-001")];
  const ctx: BatchContext = {
    batch_index: 1,
    total_batches: 3,
    preceding_batch_rec_ids: ["REC-EST-001", "REC-EST-006"],
    following_batch_rec_ids: ["REC-FAM-006"],
  };
  const body = makeValidResponseBody(1, 3, [makeStateARec("REC-TAX-001")]);
  const client = makeMockClient([{ kind: "text", text: JSON.stringify(body) }]);

  await quantifyBatch(profile, batch, ctx, baseOptions(client));
  const lastCall = client.lastCall();
  assert.ok(lastCall);
  const userMsg = lastCall.messages[0];
  const content =
    typeof userMsg.content === "string"
      ? userMsg.content
      : JSON.stringify(userMsg.content);
  assert.ok(content.includes("REC-EST-001"));
  assert.ok(content.includes("REC-FAM-006"));
  assert.ok(content.includes('"batch_index": 1'));
});

// Live API placeholder — gated on env var, deferred to Phase 3.1c
test(
  "3a.1 — LIVE: small batch from Holloway fixture",
  { skip: !process.env.RUN_LIVE_API_TESTS },
  async () => {
    // Will be activated in Phase 3.1c.
    // Plan: load artifacts/holloway_clientprofile.json + first 5 selected recs;
    // call real Anthropic API; assert structural invariants and §7520 citation.
    assert.ok(true, "placeholder — see Phase 3.1c");
  },
);
