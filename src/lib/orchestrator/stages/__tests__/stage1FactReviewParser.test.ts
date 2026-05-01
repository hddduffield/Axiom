import { test } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { parseFactReview, type Stage1ApiClient } from "../stage1FactReviewParser";
import type { ClientProfile, ClientProfileFailed } from "../../schemas/clientProfile";

const HOLLOWAY_FIXTURE = path.resolve("tests/fixtures/Holloway_Fact_Review_FILLED.docx");

// ────────────────────────────────────────────────────────────────────────
// Mock Anthropic client
// ────────────────────────────────────────────────────────────────────────

type MockResponse =
  | { kind: "text"; text: string; inputTokens?: number; outputTokens?: number }
  | { kind: "throw"; error: Error };

interface MockClientOptions {
  responses: MockResponse[];
}

function makeMockMessage(
  text: string,
  inputTokens = 1500,
  outputTokens = 1200,
): Anthropic.Message {
  // Cast through unknown — we only populate the fields parseFactReview reads.
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

function makeMockClient(opts: MockClientOptions): Stage1ApiClient & { callCount: () => number; lastCall: () => Anthropic.MessageCreateParamsNonStreaming | null } {
  let i = 0;
  let last: Anthropic.MessageCreateParamsNonStreaming | null = null;
  return {
    callCount: () => i,
    lastCall: () => last,
    messages: {
      create: async (params) => {
        last = params;
        const r = opts.responses[i] ?? opts.responses[opts.responses.length - 1];
        i += 1;
        if (r.kind === "throw") throw r.error;
        return makeMockMessage(r.text, r.inputTokens, r.outputTokens);
      },
    },
  };
}

// ────────────────────────────────────────────────────────────────────────
// Minimal valid ClientProfileBody helper
// ────────────────────────────────────────────────────────────────────────

function num(value: number | null, opts: { unit?: string; is_annual?: boolean; known_unknown?: boolean } = {}) {
  return {
    value,
    unit: opts.unit ?? "USD",
    ...(opts.is_annual !== undefined ? { is_annual: opts.is_annual } : {}),
    ...(opts.known_unknown !== undefined ? { known_unknown: opts.known_unknown } : {}),
  };
}

function person(name: string) {
  return {
    full_legal_name: name,
    short_name: null,
    date_of_birth: null,
    age: null,
    relationship: null,
    state_of_residence: null,
    citizenship: null,
    notes: null,
  };
}

function buildValidBody(): Record<string, unknown> {
  return {
    engagement: {
      advisor_id: "WB-001",
      archetype: "PRE",
      secondary_archetype: null,
      engagement_date: "2026-04-22",
      plan_purpose: "Pre-transaction planning.",
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
      net_worth: num(null, { known_unknown: true }),
    },
    income: {
      wages_w2: num(null, { is_annual: true, known_unknown: true }),
      k1_distributions: num(null, { is_annual: true, known_unknown: true }),
      other_income: num(null, { is_annual: true, known_unknown: true }),
      agi: num(null, { is_annual: true, known_unknown: true }),
    },
    cash_flow: {
      monthly_inflows: num(null, { known_unknown: true }),
      monthly_outflows: num(null, { known_unknown: true }),
      monthly_savings: num(null, { known_unknown: true }),
    },
    tax_status: {
      filing_status: "MFJ",
      federal_marginal_rate: num(37, { unit: "percent" }),
      state_residency: "GA",
      ptet_election_status: "not_applicable",
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
  };
}

function isFailure(r: ClientProfile | ClientProfileFailed): r is ClientProfileFailed {
  return (r as ClientProfileFailed)._stage_status === "FAILED";
}

// ────────────────────────────────────────────────────────────────────────
// Tests — Pass A (mock-only)
// ────────────────────────────────────────────────────────────────────────

test("2. invalid JSON across all retries → max_retries_exceeded (last_failure_type: json_parse_failed)", async () => {
  const client = makeMockClient({
    responses: [
      { kind: "text", text: "{not valid json" },
      { kind: "text", text: "still not valid" },
    ],
  });
  const result = await parseFactReview(HOLLOWAY_FIXTURE, { apiClient: client, maxRetries: 1 });
  assert.ok(isFailure(result));
  assert.equal(result._failure_type, "max_retries_exceeded");
  assert.equal(result._failure_context.last_failure_type, "json_parse_failed");
  assert.equal(result._failure_context.attempts_made, 2);
  assert.ok(result._failure_context.parse_error);
  assert.ok(result._failure_context.raw_response);
  assert.equal(client.callCount(), 2);
});

test("3. schema-invalid across all retries → max_retries_exceeded (last_failure_type: schema_validation_failed)", async () => {
  const invalidPayload = JSON.stringify({ engagement: { advisor_id: "x" }, foo: "bar" });
  const client = makeMockClient({
    responses: [
      { kind: "text", text: invalidPayload },
      { kind: "text", text: invalidPayload },
    ],
  });
  const result = await parseFactReview(HOLLOWAY_FIXTURE, { apiClient: client, maxRetries: 1 });
  assert.ok(isFailure(result));
  assert.equal(result._failure_type, "max_retries_exceeded");
  assert.equal(result._failure_context.last_failure_type, "schema_validation_failed");
  assert.ok(Array.isArray(result._failure_context.validation_errors));
  assert.ok(result._failure_context.validation_errors!.length > 0);
  assert.equal(result._failure_context.attempts_made, 2);
});

test("3b. mixed failures (invalid JSON then schema-invalid) → max_retries_exceeded with last_failure_type from final attempt", async () => {
  const invalidPayload = JSON.stringify({ engagement: { advisor_id: "x" } });
  const client = makeMockClient({
    responses: [
      { kind: "text", text: "{garbage" },
      { kind: "text", text: invalidPayload },
    ],
  });
  const result = await parseFactReview(HOLLOWAY_FIXTURE, { apiClient: client, maxRetries: 1 });
  assert.ok(isFailure(result));
  assert.equal(result._failure_type, "max_retries_exceeded");
  // Last failure was schema validation, so that's the recorded last_failure_type.
  assert.equal(result._failure_context.last_failure_type, "schema_validation_failed");
  assert.ok(result._failure_context.validation_errors);
});

test("3c. single-attempt failure (maxRetries: 0) surfaces immediate failure type, not max_retries_exceeded", async () => {
  const client = makeMockClient({
    responses: [{ kind: "text", text: "{garbage" }],
  });
  const result = await parseFactReview(HOLLOWAY_FIXTURE, { apiClient: client, maxRetries: 0 });
  assert.ok(isFailure(result));
  assert.equal(result._failure_type, "json_parse_failed");
  assert.equal(result._failure_context.attempts_made, 1);
  assert.equal(client.callCount(), 1);
});

test("4. mock retry success: invalid first, valid second → ClientProfile, attempts_made: 2, attempt_history populated", async () => {
  const validJson = JSON.stringify(buildValidBody());
  const client = makeMockClient({
    responses: [
      { kind: "text", text: "{broken" },
      { kind: "text", text: validJson, inputTokens: 200, outputTokens: 1500 },
    ],
  });
  const result = await parseFactReview(HOLLOWAY_FIXTURE, { apiClient: client, maxRetries: 1 });
  assert.ok(!isFailure(result), `expected ClientProfile, got ${JSON.stringify(result)}`);
  assert.equal(result._metadata.attempts_made, 2);
  assert.equal(result._metadata.model_used, "claude-opus-4-7");
  assert.equal(result._metadata.stage_version, "1.0.1");
  assert.ok(result._metadata.source_fr_content_hash.length === 64);
  assert.ok(result._metadata.input_token_count > 0);
  assert.ok(result._metadata.output_token_count > 0);
  // Cache token fields exist (mock returns 0 — we just verify the type is number)
  assert.equal(typeof result._metadata.cache_creation_input_tokens, "number");
  assert.equal(typeof result._metadata.cache_read_input_tokens, "number");
  // attempt_history populated correctly: length 2, [json_parse_failed, success]
  assert.equal(result._metadata.attempt_history.length, 2);
  assert.equal(result._metadata.attempt_history[0].attempt_number, 1);
  assert.equal(result._metadata.attempt_history[0].outcome, "json_parse_failed");
  assert.ok(result._metadata.attempt_history[0].failure_details);
  assert.equal(result._metadata.attempt_history[1].attempt_number, 2);
  assert.equal(result._metadata.attempt_history[1].outcome, "success");
  assert.equal(result._metadata.attempt_history[1].failure_details, null);
  // Sum of per-attempt tokens equals total
  assert.equal(
    result._metadata.attempt_history[0].input_tokens + result._metadata.attempt_history[1].input_tokens,
    result._metadata.input_token_count,
  );
  assert.equal(result.engagement.archetype, "PRE");
  assert.equal(client.callCount(), 2);
});

test("attempt_history populated on failure path (both fail JSON)", async () => {
  const client = makeMockClient({
    responses: [
      { kind: "text", text: "{garbage1" },
      { kind: "text", text: "{garbage2" },
    ],
  });
  const result = await parseFactReview(HOLLOWAY_FIXTURE, { apiClient: client, maxRetries: 1 });
  assert.ok(isFailure(result));
  const history = result._metadata.attempt_history;
  assert.ok(history && history.length === 2, `expected attempt_history length 2, got ${history?.length}`);
  assert.equal(history![0].outcome, "json_parse_failed");
  assert.equal(history![1].outcome, "json_parse_failed");
});

test("attempt_history populated on api_error path (length 1, outcome api_error)", async () => {
  const client = makeMockClient({
    responses: [{ kind: "throw", error: new Error("503 Service Unavailable") }],
  });
  const result = await parseFactReview(HOLLOWAY_FIXTURE, { apiClient: client });
  assert.ok(isFailure(result));
  const history = result._metadata.attempt_history;
  assert.ok(history && history.length === 1);
  assert.equal(history![0].outcome, "api_error");
  assert.match(history![0].failure_details ?? "", /503/);
});

test("5. nonexistent FR path → fr_extraction_failed", async () => {
  const client = makeMockClient({ responses: [{ kind: "text", text: "{}" }] });
  const result = await parseFactReview("/tmp/does-not-exist.docx", { apiClient: client });
  assert.ok(isFailure(result));
  assert.equal(result._failure_type, "fr_extraction_failed");
  assert.equal(client.callCount(), 0, "API should not be called when extraction fails");
});

test("6. mock API error → api_error", async () => {
  const apiErr = new Error("500 Internal Server Error");
  const client = makeMockClient({ responses: [{ kind: "throw", error: apiErr }] });
  const result = await parseFactReview(HOLLOWAY_FIXTURE, { apiClient: client });
  assert.ok(isFailure(result));
  assert.equal(result._failure_type, "api_error");
  assert.equal(result._failure_context.api_error, "500 Internal Server Error");
  assert.equal(result._failure_context.attempts_made, 1);
});

test("prompt caching wired: system passed as content-block array with cache_control", async () => {
  const validJson = JSON.stringify(buildValidBody());
  const client = makeMockClient({
    responses: [{ kind: "text", text: validJson }],
  });
  await parseFactReview(HOLLOWAY_FIXTURE, { apiClient: client });
  const params = client.lastCall();
  assert.ok(params, "API should have been called");
  assert.ok(Array.isArray(params!.system), "system must be an array of content blocks");
  const blocks = params!.system as Array<{ type: string; cache_control?: { type: string } }>;
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, "text");
  assert.deepEqual(blocks[0].cache_control, { type: "ephemeral" });
  assert.equal(params!.model, "claude-opus-4-7");
  // temperature is deprecated for claude-opus-4-7 — must be omitted from the request.
  assert.equal(params!.temperature, undefined);
});

test("retry conversation includes assistant turn + correction user turn", async () => {
  const validJson = JSON.stringify(buildValidBody());
  const client = makeMockClient({
    responses: [
      { kind: "text", text: "{garbage" },
      { kind: "text", text: validJson },
    ],
  });
  await parseFactReview(HOLLOWAY_FIXTURE, { apiClient: client, maxRetries: 1 });
  const finalCall = client.lastCall();
  assert.ok(finalCall);
  // 1st user turn, assistant garbage, 2nd user retry-correction = 3 messages on the second call.
  assert.equal(finalCall!.messages.length, 3);
  assert.equal(finalCall!.messages[0].role, "user");
  assert.equal(finalCall!.messages[1].role, "assistant");
  assert.equal(finalCall!.messages[2].role, "user");
  const lastUser = finalCall!.messages[2].content as string;
  assert.match(lastUser, /not valid JSON/);
});

// ────────────────────────────────────────────────────────────────────────
// Test 1 — live API (Pass B). Skipped unless RUN_LIVE_API_TESTS=1.
// ────────────────────────────────────────────────────────────────────────

test(
  "1. Holloway fixture parses to valid ClientProfile (live API)",
  { skip: !process.env.RUN_LIVE_API_TESTS },
  async () => {
    const apiClient = new Anthropic();
    const result = await parseFactReview(HOLLOWAY_FIXTURE, { apiClient });

    if ("_stage_status" in result) {
      console.error("LIVE TEST FAILURE:", JSON.stringify(result, null, 2));
      assert.fail(
        `Stage 1 failed: ${result._failure_type} — ${result._failure_reason}`,
      );
      return;
    }

    // Structural assertions per spec
    assert.equal(result.engagement.archetype, "PRE");
    assert.ok(result.client_and_family.primary_owner);
    assert.ok(result.client_and_family.primary_owner.full_legal_name.length > 0);
    assert.ok(result.transaction_posture.transaction_window);
    assert.ok(
      ["current", "stale", "missing", "draft"].includes(
        result.estate_planning.will_status,
      ),
    );
    assert.ok(result.entities.length >= 1);
    assert.ok(result._metadata.attempts_made <= 2);
    assert.ok(result._metadata.input_token_count > 0);
    assert.ok(result._metadata.output_token_count > 0);
    assert.equal(typeof result._metadata.cache_creation_input_tokens, "number");
    assert.equal(typeof result._metadata.cache_read_input_tokens, "number");

    // Print for human review (visible in Pass B output)
    console.log("\n========== STAGE 1 LIVE RUN — METADATA ==========");
    console.log(JSON.stringify(result._metadata, null, 2));
    console.log("\n========== STAGE 1 LIVE RUN — PARSED CLIENTPROFILE ==========");
    console.log(JSON.stringify(result, null, 2));
    console.log("========== END LIVE RUN ==========\n");
  },
);
