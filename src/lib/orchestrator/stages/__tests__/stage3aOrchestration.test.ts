import { test } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { runStage3a } from "../stage3aOrchestration";
import {
  _resetCachesForTesting,
  type Stage3a1ApiClient,
} from "../stage3a1BatchQuantifier";
import type { ClientProfile } from "../../schemas/clientProfile";
import type { SelectedRecommendations } from "../../schemas/selectedRecommendations";

const KB_PATH = path.resolve("kb/v1_2");

// ────────────────────────────────────────────────────────────────────────
// Mock client — programmable per-call response based on which batch is asked
// ────────────────────────────────────────────────────────────────────────

// Stage 3a.1 uses tool-use schema enforcement (Phase 3.1c). Mock LLM
// responses must therefore deliver the structured payload via a tool_use
// content block named "submit_quantified_batch". The orchestration tests
// always supply a JSON-stringified body via `text`; we parse it and emit
// the corresponding tool_use block.
function makeMockMessage(text: string, inputTokens = 4000, outputTokens = 2000): Anthropic.Message {
  const input: unknown = JSON.parse(text);
  return {
    id: "msg_mock",
    type: "message",
    role: "assistant",
    model: "claude-opus-4-7",
    stop_reason: "tool_use",
    stop_sequence: null,
    content: [
      {
        type: "tool_use",
        id: "toolu_mock",
        name: "submit_quantified_batch",
        input,
      } as unknown as Anthropic.ToolUseBlock,
    ],
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      service_tier: "standard",
    },
  } as unknown as Anthropic.Message;
}

// Build a mock client that inspects the user turn for "<batch_index>: N" and
// returns a fitting valid response. The orchestrator passes batchIndex through
// the BatchContext block in the user turn JSON.
function makeBatchAwareClient(opts: {
  buildResponseForBatch: (batchIndex: number, recIds: string[], totalBatches: number) => string;
  failBatchIndices?: number[];
}): Stage3a1ApiClient & {
  callCount: () => number;
  callsByBatch: () => Map<number, number>;
} {
  let i = 0;
  const callsByBatch = new Map<number, number>();
  return {
    callCount: () => i,
    callsByBatch: () => callsByBatch,
    messages: {
      stream: (params) => {
        i += 1;
        const userMsg = params.messages[0];
        const content =
          typeof userMsg.content === "string"
            ? userMsg.content
            : JSON.stringify(userMsg.content);
        const m = content.match(/"batch_index":\s*(\d+)/);
        const batchIndex = m ? parseInt(m[1], 10) : 0;
        const tm = content.match(/"total_batches":\s*(\d+)/);
        const totalBatches = tm ? parseInt(tm[1], 10) : 1;
        callsByBatch.set(batchIndex, (callsByBatch.get(batchIndex) ?? 0) + 1);

        // Extract rec_ids from <batch> JSON.
        const batchMatch = content.match(/<batch>\n([\s\S]*?)\n<\/batch>/);
        const batchJson = batchMatch ? JSON.parse(batchMatch[1]) : [];
        const recIds = (batchJson as Array<{ recommendation_id: string }>).map(
          (r) => r.recommendation_id,
        );
        return {
          finalMessage: async () => {
            if (opts.failBatchIndices?.includes(batchIndex)) {
              throw new Error(`mock failure for batch ${batchIndex}`);
            }
            return makeMockMessage(
              opts.buildResponseForBatch(batchIndex, recIds, totalBatches),
            );
          },
        };
      },
    },
  };
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function makeSelected(count: number): SelectedRecommendations {
  // Use real KB rec_ids that we know exist so KB loading succeeds.
  const taxIds = [
    "REC-TAX-001", "REC-TAX-002", "REC-TAX-003", "REC-TAX-004", "REC-TAX-005",
    "REC-TAX-006", "REC-TAX-007", "REC-TAX-008", "REC-TAX-009", "REC-TAX-010",
  ];
  const estIds = [
    "REC-EST-001", "REC-EST-002", "REC-EST-003", "REC-EST-004", "REC-EST-005",
    "REC-EST-006", "REC-EST-007", "REC-EST-008", "REC-EST-009", "REC-EST-010",
  ];
  const allIds = [...taxIds, ...estIds].slice(0, count);
  return {
    selected: allIds.map((id) => ({
      recommendation_id: id,
      category: id.startsWith("REC-EST") ? ("Estate" as const) : ("Tax" as const),
      match_strength: "strong" as const,
      triggers_matched: [],
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
      brief_rationale: "x",
    })),
  } as unknown as SelectedRecommendations;
}

function makeMinimalClientProfile(): ClientProfile {
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
      source_fr_content_hash: "abc",
      parsed_at: new Date().toISOString(),
    },
  } as unknown as ClientProfile;
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

function makeStateARec(recId: string, category = "Tax") {
  return {
    recommendation_id: recId,
    source_file_path: `kb/v1_2/01_recommendations/${category.toLowerCase()}/${recId}.md`,
    category,
    status: "Active",
    position_in_sequence: 0,
    plan_section:
      category === "Estate"
        ? "Recommendations — Estate Planning"
        : "Recommendations — Business Tax",
    subsection_within_section: null,
    co_triggered_with: [],
    quantified_impact: {
      estimate: { value: 100000, unit: "USD", is_annual: true },
      formula_id: "f1",
      formula_source_file: "x",
      computation_inputs: {},
      pending_reconciliation: false,
      alternative_values: [],
      qualitative_phrasing: null,
      reason_no_formula: null,
      blocked_inputs: [],
    },
    scenario_range: null,
    timing_bucket: "0-30 days",
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

function buildResponseForBatch(batchIndex: number, recIds: string[], totalBatches: number): string {
  return JSON.stringify({
    batch_index: batchIndex,
    total_batches: totalBatches,
    recommendations: recIds.map((id) =>
      makeStateARec(id, id.startsWith("REC-EST") ? "Estate" : "Tax"),
    ),
    _stage_flags: VALID_FLAGS,
  });
}

// ────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────

test("runStage3a — 20 recs at batchSize: 20 → 1 batch, all recs in output", async () => {
  // Pin batchSize: 20 explicitly so this test keeps validating single-batch
  // behavior independent of the orchestrator default (which lowered to 12 to
  // preserve output-token headroom under the 32K Stage 3a.1 cap).
  _resetCachesForTesting();
  const profile = makeMinimalClientProfile();
  const sel = makeSelected(20);
  const client = makeBatchAwareClient({ buildResponseForBatch });

  const result = await runStage3a(profile, sel, {
    apiClient: client,
    kbPath: KB_PATH,
    batchSize: 20,
  });
  assert.equal(result.recommendations.length, 20);
  assert.equal(result._sequencer_status, undefined);
  assert.equal(client.callCount(), 1);
});

test("runStage3a — 5 recs split into 3 batches at batchSize: 2 → 3 batches, all in output", async () => {
  _resetCachesForTesting();
  const profile = makeMinimalClientProfile();
  const sel = makeSelected(5);
  const client = makeBatchAwareClient({ buildResponseForBatch });

  const result = await runStage3a(profile, sel, {
    apiClient: client,
    kbPath: KB_PATH,
    batchSize: 2,
  });
  assert.equal(result.recommendations.length, 5);
  assert.equal(client.callCount(), 3); // batches: [2, 2, 1]
});

test("runStage3a — parallel execution issues all calls concurrently (default)", async () => {
  _resetCachesForTesting();
  const profile = makeMinimalClientProfile();
  const sel = makeSelected(6);
  const client = makeBatchAwareClient({ buildResponseForBatch });

  const result = await runStage3a(profile, sel, {
    apiClient: client,
    kbPath: KB_PATH,
    batchSize: 2,
  });
  assert.equal(result.recommendations.length, 6);
  // Each batch called exactly once.
  assert.equal(client.callsByBatch().get(0), 1);
  assert.equal(client.callsByBatch().get(1), 1);
  assert.equal(client.callsByBatch().get(2), 1);
});

test("runStage3a — serial execution produces same result", async () => {
  _resetCachesForTesting();
  const profile = makeMinimalClientProfile();
  const sel = makeSelected(4);
  const client = makeBatchAwareClient({ buildResponseForBatch });

  const result = await runStage3a(profile, sel, {
    apiClient: client,
    kbPath: KB_PATH,
    batchSize: 2,
    parallelism: "serial",
  });
  assert.equal(result.recommendations.length, 4);
  assert.equal(client.callCount(), 2);
});

test("runStage3a — single-batch failure propagates as _sequencer_status FAILED", async () => {
  _resetCachesForTesting();
  const profile = makeMinimalClientProfile();
  const sel = makeSelected(4);
  const client = makeBatchAwareClient({
    buildResponseForBatch,
    failBatchIndices: [1],
  });

  const result = await runStage3a(profile, sel, {
    apiClient: client,
    kbPath: KB_PATH,
    batchSize: 2,
  });
  assert.equal(result._sequencer_status, "FAILED");
  // Successful batch's recs preserved (batch 0).
  assert.equal(result.recommendations.length, 2);
  assert.equal(result._sequencer_failures?.length, 1);
});

test("runStage3a — all-batches-fail produces empty recommendations + failures", async () => {
  _resetCachesForTesting();
  const profile = makeMinimalClientProfile();
  const sel = makeSelected(4);
  const client = makeBatchAwareClient({
    buildResponseForBatch,
    failBatchIndices: [0, 1],
  });

  const result = await runStage3a(profile, sel, {
    apiClient: client,
    kbPath: KB_PATH,
    batchSize: 2,
  });
  assert.equal(result._sequencer_status, "FAILED");
  assert.equal(result.recommendations.length, 0);
  assert.equal(result._sequencer_failures?.length, 2);
  // All 4 selected recs are coverage gaps.
  assert.equal(result._sequencer_flags.coverage_gaps.length, 4);
});

test("runStage3a — metadata aggregation: per-batch breakdown + cost computation", async () => {
  _resetCachesForTesting();
  const profile = makeMinimalClientProfile();
  const sel = makeSelected(4);
  const client = makeBatchAwareClient({ buildResponseForBatch });

  const result = await runStage3a(profile, sel, {
    apiClient: client,
    kbPath: KB_PATH,
    batchSize: 2,
  });
  assert.ok(result._metadata);
  assert.equal(result._metadata.per_batch.length, 2);
  // 2 batches × 4000 input tokens × ($15/M = 1500c/M = 0.0015c/token) = 12c
  // 2 batches × 2000 output tokens × ($75/M = 7500c/M = 0.0075c/token) = 30c
  // Total: 42c
  assert.equal(result._metadata.cost_cents, 42);
  assert.equal(result._metadata.total_input_tokens, 8000);
  assert.equal(result._metadata.total_output_tokens, 4000);
  assert.equal(result._metadata.total_attempts, 2);
});

test("runStage3a — BatchContext correctly carries sibling-batch rec_ids", async () => {
  _resetCachesForTesting();
  const profile = makeMinimalClientProfile();
  const sel = makeSelected(6);
  const seenContexts: Array<{ batchIndex: number; preceding: string[]; following: string[] }> = [];

  const client: Stage3a1ApiClient = {
    messages: {
      stream: (params) => {
        const userMsg = params.messages[0];
        const content =
          typeof userMsg.content === "string"
            ? userMsg.content
            : JSON.stringify(userMsg.content);
        const ctxMatch = content.match(/<batch_context>\n([\s\S]*?)\n<\/batch_context>/);
        if (ctxMatch) {
          const ctx = JSON.parse(ctxMatch[1]);
          seenContexts.push({
            batchIndex: ctx.batch_index,
            preceding: ctx.preceding_batch_rec_ids,
            following: ctx.following_batch_rec_ids,
          });
        }
        const batchMatch = content.match(/<batch>\n([\s\S]*?)\n<\/batch>/);
        const batchJson = batchMatch ? JSON.parse(batchMatch[1]) : [];
        const recIds = (batchJson as Array<{ recommendation_id: string }>).map(
          (r) => r.recommendation_id,
        );
        const tm = content.match(/"total_batches":\s*(\d+)/);
        const totalBatches = tm ? parseInt(tm[1], 10) : 1;
        const bm = content.match(/"batch_index":\s*(\d+)/);
        const batchIndex = bm ? parseInt(bm[1], 10) : 0;
        return {
          finalMessage: async () =>
            makeMockMessage(buildResponseForBatch(batchIndex, recIds, totalBatches)),
        };
      },
    },
  };

  await runStage3a(profile, sel, {
    apiClient: client,
    kbPath: KB_PATH,
    batchSize: 2,
  });
  // 3 batches at size 2. Sort by batchIndex for deterministic check.
  seenContexts.sort((a, b) => a.batchIndex - b.batchIndex);
  assert.equal(seenContexts.length, 3);
  // Batch 0: nothing preceding, 4 rec_ids following
  assert.equal(seenContexts[0].preceding.length, 0);
  assert.equal(seenContexts[0].following.length, 4);
  // Batch 1: 2 preceding, 2 following
  assert.equal(seenContexts[1].preceding.length, 2);
  assert.equal(seenContexts[1].following.length, 2);
  // Batch 2: 4 preceding, 0 following
  assert.equal(seenContexts[2].preceding.length, 4);
  assert.equal(seenContexts[2].following.length, 0);
});
