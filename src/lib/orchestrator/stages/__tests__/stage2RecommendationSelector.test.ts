import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { parseFactReview } from "../stage1FactReviewParser";
import {
  selectRecommendations,
  _resetKBCacheForTesting,
  _resetSystemPromptCacheForTesting,
  type Stage2ApiClient,
} from "../stage2RecommendationSelector";
import type {
  SelectedRecommendations,
  SelectedRecommendationsFailed,
  SelectedRecommendation,
} from "../../schemas/selectedRecommendations";
import type { ClientProfile } from "../../schemas/clientProfile";

// ────────────────────────────────────────────────────────────────────────
// Mock client (mirrors Stage 1's pattern)
// ────────────────────────────────────────────────────────────────────────

type MockResponse =
  | { kind: "text"; text: string; inputTokens?: number; outputTokens?: number }
  | { kind: "throw"; error: Error };

interface MockClientHandle extends Stage2ApiClient {
  callCount: () => number;
  lastCall: () => Anthropic.MessageCreateParamsNonStreaming | null;
  allCalls: () => Anthropic.MessageCreateParamsNonStreaming[];
}

function makeMockMessage(
  text: string,
  inputTokens = 1500,
  outputTokens = 1200,
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

function makeMockClient(responses: MockResponse[]): MockClientHandle {
  let i = 0;
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  return {
    callCount: () => i,
    lastCall: () => calls[calls.length - 1] ?? null,
    allCalls: () => [...calls],
    messages: {
      stream: (params) => {
        calls.push(params);
        const r = responses[i] ?? responses[responses.length - 1];
        i += 1;
        return {
          finalMessage: async () => {
            if (r.kind === "throw") throw r.error;
            return makeMockMessage(r.text, r.inputTokens, r.outputTokens);
          },
        };
      },
    },
  };
}

// ────────────────────────────────────────────────────────────────────────
// Minimal valid ClientProfile (just enough for Stage 2 to consume)
// ────────────────────────────────────────────────────────────────────────

function makeMinimalClientProfile(
  archetype: ClientProfile["engagement"]["archetype"] = "PRE",
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
      advisor_id: "WB-001",
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

// ────────────────────────────────────────────────────────────────────────
// Minimal valid SelectedRecommendations body builder (for mock responses)
// ────────────────────────────────────────────────────────────────────────

function makeRec(
  id: string,
  overrides: Partial<SelectedRecommendation> = {},
): SelectedRecommendation {
  return {
    recommendation_id: id,
    category: "Tax",
    match_strength: "strong",
    triggers_matched: ["mock trigger"],
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
    ...overrides,
  };
}

interface BodyOptions {
  selected?: SelectedRecommendation[];
  supplementalCount?: number;
  speculativeCount?: number;
  landmineCount?: number;
}

function makeValidBody(opts: BodyOptions = {}): Record<string, unknown> {
  const selected = opts.selected ?? [
    makeRec("REC-TAX-001"),
    makeRec("REC-TAX-002"),
    makeRec("REC-EST-001", { category: "Estate" }),
    makeRec("REC-EST-006", { category: "Estate" }),
    makeRec("REC-RSK-001", { category: "Risk & Insurance" }),
  ];
  const strong = selected.filter((r) => r.match_strength === "strong").length;
  const borderline = selected.filter((r) => r.match_strength === "borderline").length;
  const seqTotal = selected.reduce(
    (acc, r) =>
      acc +
      r.must_come_after.length +
      r.must_come_before.length +
      r.sequenced_with.length +
      r.coordinated_with.length +
      r.mutually_exclusive_with.length,
    0,
  );
  return {
    selected,
    supplemental_candidates: [],
    speculative_dropped: [],
    pass_summaries: {
      pass_1_hard_filter: {
        input_universe: 130,
        eliminated: 130 - selected.length,
        survived: selected.length,
      },
      pass_2_calibration: { strong, borderline, speculative: opts.speculativeCount ?? 0 },
      pass_3_sequencing: { sequencing_relations_total: seqTotal, landmines_marked: opts.landmineCount ?? 0 },
    },
    _stage_flags: {
      candidate_set_unusually_small: selected.length < 15,
      candidate_set_unusually_large: selected.length > 40,
      landmines_present_count: opts.landmineCount ?? 0,
      mutually_exclusive_pairs_present: 0,
    },
  };
}

function isFailure(
  r: SelectedRecommendations | SelectedRecommendationsFailed,
): r is SelectedRecommendationsFailed {
  return (r as SelectedRecommendationsFailed)._stage_status === "FAILED";
}

// ────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────

test("1. mock success: valid SelectedRecommendations parsed and returned", async () => {
  _resetKBCacheForTesting();
  const profile = makeMinimalClientProfile("PRE");
  const body = makeValidBody();
  const client = makeMockClient([{ kind: "text", text: JSON.stringify(body) }]);
  const result = await selectRecommendations(profile, { apiClient: client });
  assert.ok(!isFailure(result), `expected success, got ${JSON.stringify(result)}`);
  assert.ok(result.selected.length >= 5);
  assert.equal(result._metadata.attempts_made, 1);
  assert.equal(result._metadata.stage_version, "2.0.1");
  assert.ok(result._metadata.attempt_history.length === 1);
  assert.equal(result._metadata.attempt_history[0].outcome, "success");
});

test("2. mock invalid JSON → failure", async () => {
  _resetKBCacheForTesting();
  const profile = makeMinimalClientProfile("PRE");
  const client = makeMockClient([
    { kind: "text", text: "{not json" },
    { kind: "text", text: "still bad" },
  ]);
  const result = await selectRecommendations(profile, { apiClient: client, maxRetries: 1 });
  assert.ok(isFailure(result));
  assert.equal(result._failure_type, "max_retries_exceeded");
  assert.equal(result._failure_context.last_failure_type, "json_parse_failed");
});

test("3. mock orphan recommendation_id (not in registry) → schema_validation_failed", async () => {
  _resetKBCacheForTesting();
  const profile = makeMinimalClientProfile("PRE");
  const body = makeValidBody({
    selected: [
      makeRec("REC-TAX-001"),
      makeRec("REC-TAX-002"),
      makeRec("REC-EST-001", { category: "Estate" }),
      makeRec("REC-EST-006", { category: "Estate" }),
      makeRec("REC-XXX-999"), // fabricated rec_id not in registry
    ],
  });
  const client = makeMockClient([
    { kind: "text", text: JSON.stringify(body) },
    { kind: "text", text: JSON.stringify(body) },
  ]);
  const result = await selectRecommendations(profile, { apiClient: client, maxRetries: 1 });
  assert.ok(isFailure(result));
  assert.equal(result._failure_type, "max_retries_exceeded");
  assert.equal(result._failure_context.last_failure_type, "schema_validation_failed");
  const errors = result._failure_context.validation_errors ?? [];
  assert.ok(
    errors.some((e) => e.includes("orphan_recommendation_id") && e.includes("REC-XXX-999")),
    `expected orphan_recommendation_id error mentioning REC-XXX-999, got: ${errors.join(" | ")}`,
  );
});

test("4. mock orphan sequencing reference → schema_validation_failed", async () => {
  _resetKBCacheForTesting();
  const profile = makeMinimalClientProfile("PRE");
  const body = makeValidBody({
    selected: [
      makeRec("REC-TAX-001"),
      makeRec("REC-TAX-002"),
      makeRec("REC-EST-001", { category: "Estate" }),
      makeRec("REC-EST-006", {
        category: "Estate",
        // REC-ENT-002 is in the registry but NOT in selected[] → orphan reference
        must_come_after: [{ recommendation_id: "REC-ENT-002" }],
      }),
      makeRec("REC-RSK-001", { category: "Risk & Insurance" }),
    ],
  });
  const client = makeMockClient([
    { kind: "text", text: JSON.stringify(body) },
    { kind: "text", text: JSON.stringify(body) },
  ]);
  const result = await selectRecommendations(profile, { apiClient: client, maxRetries: 1 });
  assert.ok(isFailure(result));
  assert.equal(result._failure_type, "max_retries_exceeded");
  const errors = result._failure_context.validation_errors ?? [];
  assert.ok(
    errors.some((e) => e.includes("orphan_sequencing_reference") && e.includes("REC-ENT-002")),
    `expected orphan_sequencing_reference for REC-ENT-002, got: ${errors.join(" | ")}`,
  );
});

test("5. mock >30 selected → selected_count_exceeds_cap", async () => {
  _resetKBCacheForTesting();
  const profile = makeMinimalClientProfile("PRE");
  // Build 31 valid registry IDs: TAX (15) + EST (16) = 31.
  const taxIds = Array.from({ length: 15 }, (_, i) => `REC-TAX-${String(i + 1).padStart(3, "0")}`);
  const estIds = Array.from({ length: 16 }, (_, i) => `REC-EST-${String(i + 1).padStart(3, "0")}`);
  const thirtyOne = [...taxIds, ...estIds].map((id) =>
    makeRec(id, {
      category: id.startsWith("REC-EST") ? "Estate" : "Tax",
    }),
  );
  const body = makeValidBody({ selected: thirtyOne });
  const client = makeMockClient([
    { kind: "text", text: JSON.stringify(body) },
    { kind: "text", text: JSON.stringify(body) },
  ]);
  const result = await selectRecommendations(profile, { apiClient: client, maxRetries: 1 });
  assert.ok(isFailure(result));
  assert.equal(result._failure_type, "max_retries_exceeded");
  const errors = result._failure_context.validation_errors ?? [];
  assert.ok(
    errors.some((e) => e.includes("selected_count_exceeds_cap")),
    `expected selected_count_exceeds_cap, got: ${errors.join(" | ")}`,
  );
});

test("6. landmine_authorizations are threaded into the user turn", async () => {
  _resetKBCacheForTesting();
  const profile = makeMinimalClientProfile("PRE");
  const body = makeValidBody({
    selected: [
      makeRec("REC-TAX-001"),
      makeRec("REC-TAX-002"),
      makeRec("REC-EST-001", { category: "Estate" }),
      makeRec("REC-EST-006", { category: "Estate" }),
      makeRec("REC-RSK-016", {
        category: "Risk & Insurance",
        landmine: true,
        landmine_status: "landmine_authorized_by_WB-001",
      }),
    ],
    landmineCount: 1,
  });
  const client = makeMockClient([{ kind: "text", text: JSON.stringify(body) }]);
  const result = await selectRecommendations(profile, {
    apiClient: client,
    landmineAuthorizations: [{ recommendation_id: "REC-RSK-016", authorized_by: "WB-001" }],
  });
  assert.ok(!isFailure(result));
  // Verify the landmine authorization was passed in the user turn.
  const params = client.lastCall();
  assert.ok(params, "expected at least one API call");
  const userMessage = params!.messages[0];
  const userText = typeof userMessage.content === "string" ? userMessage.content : "";
  assert.match(userText, /<landmine_authorizations>/);
  assert.match(userText, /REC-RSK-016/);
  assert.match(userText, /WB-001/);
  // And the parser preserved the LLM-emitted landmine status.
  const landmineRec = result.selected.find((r) => r.recommendation_id === "REC-RSK-016");
  assert.ok(landmineRec);
  assert.equal(landmineRec!.landmine, true);
  assert.equal(landmineRec!.landmine_status, "landmine_authorized_by_WB-001");
});

test("7. KB file missing → kb_load_failed", async () => {
  _resetKBCacheForTesting();
  const profile = makeMinimalClientProfile("PRE");
  const client = makeMockClient([{ kind: "text", text: "{}" }]);
  const result = await selectRecommendations(profile, {
    apiClient: client,
    kbPath: "/tmp/this-does-not-exist-stage2",
  });
  assert.ok(isFailure(result));
  assert.equal(result._failure_type, "kb_load_failed");
  assert.equal(client.callCount(), 0, "API must not be called when KB load fails");
});

test("retry conversation includes assistant + correction user turn on schema retry", async () => {
  _resetKBCacheForTesting();
  const profile = makeMinimalClientProfile("PRE");
  const validBody = makeValidBody();
  const orphanBody = makeValidBody({
    selected: [
      makeRec("REC-TAX-001"),
      makeRec("REC-TAX-002"),
      makeRec("REC-EST-001", { category: "Estate" }),
      makeRec("REC-EST-006", { category: "Estate" }),
      makeRec("REC-XXX-999"),
    ],
  });
  const client = makeMockClient([
    { kind: "text", text: JSON.stringify(orphanBody) },
    { kind: "text", text: JSON.stringify(validBody) },
  ]);
  const result = await selectRecommendations(profile, { apiClient: client, maxRetries: 1 });
  assert.ok(!isFailure(result), "retry should succeed");
  assert.equal(result._metadata.attempts_made, 2);
  assert.equal(client.callCount(), 2);
  const secondCall = client.allCalls()[1];
  assert.equal(secondCall.messages.length, 3);
  assert.equal(secondCall.messages[0].role, "user");
  assert.equal(secondCall.messages[1].role, "assistant");
  assert.equal(secondCall.messages[2].role, "user");
  const correction = secondCall.messages[2].content as string;
  assert.match(correction, /(orphan|registry|schema)/i);
});

test("ARCHETYPE: ACT/FO/FOUND → master sequence omitted but stage runs", async () => {
  _resetKBCacheForTesting();
  const profile = makeMinimalClientProfile("ACT");
  const body = makeValidBody();
  const client = makeMockClient([{ kind: "text", text: JSON.stringify(body) }]);
  const result = await selectRecommendations(profile, { apiClient: client });
  assert.ok(!isFailure(result));
  // For non-PRE/POST archetypes the user turn should NOT include a master_sequence block.
  const userText = client.lastCall()!.messages[0].content as string;
  assert.doesNotMatch(userText, /<kb_master_sequence_/);
});

test("11. field length: brief_rationale > 80 chars → schema validation fails with field_length_exceeded", async () => {
  _resetKBCacheForTesting();
  const profile = makeMinimalClientProfile("PRE");
  const longRationale =
    "This recommendation has an excessively verbose brief_rationale that significantly exceeds the eighty-character limit imposed by the schema.";
  assert.ok(longRationale.length > 80, "test fixture must exceed the limit");
  const body = makeValidBody({
    selected: [
      makeRec("REC-TAX-001", { brief_rationale: longRationale }),
      makeRec("REC-TAX-002"),
      makeRec("REC-EST-001", { category: "Estate" }),
      makeRec("REC-EST-006", { category: "Estate" }),
      makeRec("REC-RSK-001", { category: "Risk & Insurance" }),
    ],
  });
  const client = makeMockClient([
    { kind: "text", text: JSON.stringify(body) },
    { kind: "text", text: JSON.stringify(body) },
  ]);
  const result = await selectRecommendations(profile, { apiClient: client, maxRetries: 1 });
  assert.ok(isFailure(result));
  assert.equal(result._failure_type, "max_retries_exceeded");
  assert.equal(result._failure_context.last_failure_type, "schema_validation_failed");
  const errors = result._failure_context.validation_errors ?? [];
  assert.ok(
    errors.some((e) => e.includes("field_length_exceeded") && e.includes("brief_rationale")),
    `expected field_length_exceeded for brief_rationale, got: ${errors.join(" | ")}`,
  );
});

test("11b. field length: triggers_matched entry > 25 chars → field_length_exceeded", async () => {
  _resetKBCacheForTesting();
  const profile = makeMinimalClientProfile("PRE");
  const longTrigger = "client owns an operating limited liability company";
  assert.ok(longTrigger.length > 25);
  const body = makeValidBody({
    selected: [
      makeRec("REC-TAX-001", { triggers_matched: [longTrigger] }),
      makeRec("REC-TAX-002"),
      makeRec("REC-EST-001", { category: "Estate" }),
      makeRec("REC-EST-006", { category: "Estate" }),
      makeRec("REC-RSK-001", { category: "Risk & Insurance" }),
    ],
  });
  const client = makeMockClient([
    { kind: "text", text: JSON.stringify(body) },
    { kind: "text", text: JSON.stringify(body) },
  ]);
  const result = await selectRecommendations(profile, { apiClient: client, maxRetries: 1 });
  assert.ok(isFailure(result));
  const errors = result._failure_context.validation_errors ?? [];
  assert.ok(
    errors.some((e) => e.includes("field_length_exceeded") && e.includes("triggers_matched")),
    `expected field_length_exceeded for triggers_matched, got: ${errors.join(" | ")}`,
  );
});

test("PRE archetype loads pre-exit master sequence into user turn", async () => {
  _resetKBCacheForTesting();
  const profile = makeMinimalClientProfile("PRE");
  const body = makeValidBody();
  const client = makeMockClient([{ kind: "text", text: JSON.stringify(body) }]);
  await selectRecommendations(profile, { apiClient: client });
  const userText = client.lastCall()!.messages[0].content as string;
  assert.match(userText, /<kb_master_sequence_pre_exit>/);
  assert.match(userText, /Master Sequence — Pre-Exit Engagement/);
});

// ────────────────────────────────────────────────────────────────────────
// Test 8 — Live API. Skipped without RUN_LIVE_API_TESTS=1. Pass B will wire.
// ────────────────────────────────────────────────────────────────────────

test(
  "8. Stage 2 selects valid recommendations for Holloway (live API)",
  { skip: !process.env.RUN_LIVE_API_TESTS },
  async () => {
    _resetKBCacheForTesting();
    _resetSystemPromptCacheForTesting();

    // Path (b): use the captured ClientProfile from a prior Stage 1 live run
    // if available; otherwise run Stage 1 fresh and persist the result so the
    // next Stage 2 / Stage 3 live test can re-use it.
    const cpPath = "artifacts/holloway_clientprofile.json";
    let clientProfile: ClientProfile;
    if (existsSync(cpPath)) {
      console.log(`[stage2 live] using cached ClientProfile at ${cpPath}`);
      clientProfile = JSON.parse(readFileSync(cpPath, "utf8")) as ClientProfile;
    } else {
      console.log("[stage2 live] no cached ClientProfile — running Stage 1 fresh");
      const stage1Result = await parseFactReview(
        "tests/fixtures/Holloway_Fact_Review_FILLED.docx",
        { apiClient: new Anthropic() },
      );
      assert.ok(
        !("_stage_status" in stage1Result),
        "Stage 1 must succeed for Stage 2 test to proceed",
      );
      if ("_stage_status" in stage1Result) return;
      clientProfile = stage1Result;
      mkdirSync("artifacts", { recursive: true });
      writeFileSync(cpPath, JSON.stringify(clientProfile, null, 2));
    }

    const apiClient = new Anthropic();
    // 3 attempts (maxRetries: 2) — Stage 2's compound constraints (cap +
    // orphan-refs + field lengths) sometimes need an extra cycle to converge.
    const result = await selectRecommendations(clientProfile, {
      apiClient,
      maxRetries: 2,
    });

    if ("_stage_status" in result) {
      // Persist full failure context to disk so we can diagnose without
      // hitting console output buffer limits.
      mkdirSync("artifacts", { recursive: true });
      writeFileSync(
        "artifacts/stage2_failure.json",
        JSON.stringify(result, null, 2),
      );
      const errorsPreview = (result._failure_context.validation_errors ?? [])
        .slice(0, 15)
        .map((e, i) => `  [${i + 1}] ${e.slice(0, 200)}`)
        .join("\n");
      console.error("STAGE 2 LIVE FAILURE summary:");
      console.error(`  failure_type: ${result._failure_type}`);
      console.error(`  last_failure_type: ${result._failure_context.last_failure_type ?? "(none)"}`);
      console.error(`  attempts_made: ${result._failure_context.attempts_made}`);
      console.error(`  validation_errors (first 15):\n${errorsPreview}`);
      console.error(`  full failure dumped to artifacts/stage2_failure.json`);
      assert.fail(
        `Stage 2 failed: ${result._failure_type} — ${result._failure_reason}`,
      );
      return;
    }

    // Persist Stage 2 output for Stage 3a's live test.
    mkdirSync("artifacts", { recursive: true });
    writeFileSync(
      "artifacts/holloway_selected_recommendations.json",
      JSON.stringify(result, null, 2),
    );

    // Structural assertions
    assert.ok(
      result.selected.length >= 20 && result.selected.length <= 50,
      `selected.length ${result.selected.length} outside expected 20-50 range`,
    );

    const ptet = result.selected.find((r) => r.recommendation_id === "REC-TAX-001");
    assert.ok(ptet, "REC-TAX-001 (PTET) should be selected for GA-domiciled operating LLC");
    assert.equal(ptet!.match_strength, "strong");

    const grat = result.selected.find((r) => r.recommendation_id === "REC-EST-006");
    assert.ok(grat, "REC-EST-006 (GRAT) should be selected for PRE-EXIT with transaction window");

    assert.ok(
      result.pass_summaries.pass_2_calibration.strong >= 5,
      `expect at least 5 strong-match recs; got ${result.pass_summaries.pass_2_calibration.strong}`,
    );
    assert.ok(
      result.pass_summaries.pass_3_sequencing.sequencing_relations_total >= 3,
      `expect at least 3 sequencing relations; got ${result.pass_summaries.pass_3_sequencing.sequencing_relations_total}`,
    );

    assert.ok(result._metadata.attempts_made <= 2);
    assert.ok(result._metadata.input_token_count > 0);
    assert.ok(result._metadata.output_token_count > 0);
    assert.ok(result._metadata.attempt_history.length >= 1);

    // Print structured summary for human review.
    console.log("\n========== STAGE 2 LIVE — METADATA ==========");
    console.log(JSON.stringify(result._metadata, null, 2));
    console.log("\n========== STAGE 2 LIVE — pass_summaries ==========");
    console.log(JSON.stringify(result.pass_summaries, null, 2));
    console.log("\n========== STAGE 2 LIVE — _stage_flags ==========");
    console.log(JSON.stringify(result._stage_flags, null, 2));
    console.log("\n========== STAGE 2 LIVE — selected[] (compact) ==========");
    for (const rec of result.selected) {
      const seqCount =
        rec.must_come_after.length +
        rec.must_come_before.length +
        rec.sequenced_with.length +
        rec.coordinated_with.length +
        rec.mutually_exclusive_with.length;
      console.log(
        `  ${rec.recommendation_id} | ${rec.match_strength.padEnd(10)} | ${rec.category.padEnd(22)} | seq=${seqCount} | landmine=${rec.landmine}`,
      );
    }
    console.log(
      `\n========== STAGE 2 LIVE — supplemental_candidates: ${result.supplemental_candidates.length} ==========`,
    );
    for (const sc of result.supplemental_candidates) {
      console.log(`  ${sc.recommendation_id} | ${sc.reason_supplemental.slice(0, 80)}`);
    }
    console.log(
      `\n========== STAGE 2 LIVE — speculative_dropped: ${result.speculative_dropped.length} ==========`,
    );
    for (const sd of result.speculative_dropped) {
      console.log(`  ${sd.recommendation_id} | ${sd.drop_reason.slice(0, 80)}`);
    }
    console.log("\n========== END STAGE 2 LIVE ==========\n");
  },
);
