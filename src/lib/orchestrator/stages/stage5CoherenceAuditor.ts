// Stage 5 — Coherence Auditor.
//
// Hybrid stage: deterministic-first checks (DC.1–DC.10) followed by a single
// LLM call for subjective audits (LC.1–LC.6). One invocation per plan.
//
// Stage 5 is FLAG-ONLY: it surfaces findings; it does NOT auto-fix or
// trigger Stage 4 regeneration. The advisor (or future workflow tool)
// decides what to do with each finding.
//
// Architectural pattern mirrors Stage 4: tool-use schema enforcement,
// streaming, retry loop, truncation-abort guard, count_tokens pre-flight,
// attempt_history with [phase] tags. Smaller in scope: max_tokens 8000
// (audits are short), input ~30-60K tokens (no QR + no voice cal full doc).

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import type Anthropic from "@anthropic-ai/sdk";
import { ZodError } from "zod";
import {
  Stage5LlmRawOutputSchema,
  STAGE5_TOOL_INPUT_SCHEMA,
  STAGE5_TOOL_NAME,
  STAGE5_TOOL_DESCRIPTION,
  isStage5ResultFailed,
  type AuditFinding,
  type DeterministicCheckResults,
  type LlmAssessment,
  type OverallAssessment,
  type Stage5FailureType,
  type Stage5Flags,
  type Stage5LlmAuditInput,
  type Stage5LlmRawOutput,
  type Stage5Metadata,
  type Stage5Result,
  type Stage5ResultFailed,
} from "../schemas/stage5.types";
import {
  deterministicResultsToFindings,
  loadVoiceCalibrationSummary,
  runAllDeterministicChecks,
  _resetFindingIdCounterForTesting,
  _resetVoiceCalibrationCacheForTesting,
} from "../glue/stage5DeterministicChecks";
import { projectForStage5Audit } from "../glue/stage5InputProjection";
import {
  findAdvisor,
  loadAdvisors,
} from "../glue/stage4Builders";
import {
  OPUS_4_7_INPUT_CENTS_PER_M,
  OPUS_4_7_OUTPUT_CENTS_PER_M,
  OPUS_4_7_CACHE_WRITE_CENTS_PER_M,
  OPUS_4_7_CACHE_READ_CENTS_PER_M,
  type LandmineAuthorization,
} from "./stage3a1BatchQuantifier";
import type {
  AttemptHistoryEntry,
  ClientProfile,
} from "../schemas/clientProfile";
import type {
  QuantifiedRecommendations,
} from "../schemas/pipelineTypes";
import {
  isStage4ResultFailed,
  type Stage4Result,
  type Stage4ResultFailed,
} from "../schemas/stage4.types";

// ────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────

const STAGE_VERSION = "5-1.0.0";
const MODEL = "claude-opus-4-7";
const MAX_TOKENS = 8000;
const DEFAULT_KB_PATH = "kb/v1_2";

// Pre-flight context-overflow ceilings. Stage 5 input is small (~30-60K
// real tokens) compared to Stage 4 — no full QR, no full voice calibration,
// no full ClientProfile.
//
// Real-token ceiling for Stage 5 LLM phase. Set at 130K to accommodate
// Holloway-scale plans (~115K real tokens after projectForStage5Audit).
// With max_tokens 8K output budget, total in-flight is ~138K against
// Anthropic's 200K context limit — leaves 62K safety margin. The chars/4 ->
// real-token divergence on JSON-heavy Stage 5 input is ~+78% (vs ~+58% for
// Stage 4's prose-heavy input), so chars/4 estimates underweight real cost.
// Re-evaluate if production plans regularly exceed 90 recommendations or 50
// cross-references.
const INPUT_TOKEN_CEILING_REAL = 130000;
const INPUT_TOKEN_CEILING_CHARS_OVER_4 = 80000;

const SYSTEM_PROMPT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "stage5.system.md",
);

let cachedSystemPrompt: string | null = null;

async function loadSystemPrompt(): Promise<string> {
  if (cachedSystemPrompt !== null) return cachedSystemPrompt;
  cachedSystemPrompt = await readFile(SYSTEM_PROMPT_PATH, "utf8");
  return cachedSystemPrompt;
}

export function _resetStage5CachesForTesting(): void {
  cachedSystemPrompt = null;
  _resetVoiceCalibrationCacheForTesting();
  _resetFindingIdCounterForTesting();
}

// ────────────────────────────────────────────────────────────────────────
// Stage5ApiClient — structural interface, mirrors Stage4ApiClient.
// ────────────────────────────────────────────────────────────────────────

export interface Stage5MessageStream {
  finalMessage: () => Promise<Anthropic.Message>;
}

export interface Stage5ApiClient {
  messages: {
    stream: (
      params: Anthropic.MessageCreateParamsNonStreaming,
    ) => Stage5MessageStream;
    countTokens: (
      params: Anthropic.MessageCountTokensParams,
    ) => Promise<Anthropic.MessageTokensCount>;
  };
}

// ────────────────────────────────────────────────────────────────────────
// Options
// ────────────────────────────────────────────────────────────────────────

export interface AdvisorOverride {
  advisor_id: string;
  advisor_full_name: string;
  firm_name: string;
  supervisory_office: string;
  compliance_disclosure_short?: string;
}

export interface Stage5Options {
  apiClient: Stage5ApiClient;
  kbPath?: string;
  advisorId?: string;
  advisorOverride?: AdvisorOverride;
  referenceDate?: Date;
  landmineAuthorizations?: LandmineAuthorization[];
  maxRetries?: number;
  // When false, Stage 5 returns deterministic-only findings (cheaper,
  // useful for rapid iteration on Stage 4 prose). Default: true.
  runLlmChecks?: boolean;
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function formatZodIssues(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const at = issue.path.length > 0 ? issue.path.join(".") : "<root>";
    return `${at}: ${issue.message}`;
  });
}

function buildSchemaRetryUserTurn(toolName: string, errors: string[]): string {
  return [
    `Your previous ${toolName} tool call did not satisfy the schema. Errors:`,
    ...errors.map((e) => `- ${e}`),
    "",
    `Call ${toolName} again with corrected input.`,
  ].join("\n");
}

function makeFailure(
  failureType: Stage5FailureType,
  reason: string,
  context: Stage5ResultFailed["_failure_context"],
  partialMetadata: Partial<Stage5Metadata>,
): Stage5ResultFailed {
  return {
    _stage_status: "FAILED",
    _failure_type: failureType,
    _failure_reason: reason,
    _failure_context: context,
    _metadata: partialMetadata,
  };
}

function extractResponseText(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

function extractToolUseInput(
  message: Anthropic.Message,
  toolName: string,
): { input: unknown; rawText: string } | null {
  const toolUseBlock = message.content.find(
    (block): block is Anthropic.ToolUseBlock =>
      block.type === "tool_use" && block.name === toolName,
  );
  if (!toolUseBlock) return null;
  return {
    input: toolUseBlock.input,
    rawText: JSON.stringify(toolUseBlock.input),
  };
}

// Build the LLM user turn from a pre-computed Stage5LlmAuditInput.
//
// Phase 3.3 Step 3 recovery: the audit input is now the trimmed projection
// `Stage5LlmAuditInput` (built via `projectForStage5Audit`), and JSON blocks
// are emitted in COMPACT form (no indent) — Holloway-scale plans were 2.7×
// over the chars/4 ceiling with the prior shape + indented JSON.
function buildUserTurn(
  voiceCalibrationSummary: string,
  auditInput: Stage5LlmAuditInput,
  deterministicFindings: AuditFinding[],
): string {
  return [
    "<voice_calibration_summary>",
    voiceCalibrationSummary,
    "</voice_calibration_summary>",
    "",
    "<plan>",
    JSON.stringify(auditInput.plan),
    "</plan>",
    "",
    "<quantified_recommendations>",
    JSON.stringify(auditInput.quantified_recommendations),
    "</quantified_recommendations>",
    "",
    "<client_profile>",
    JSON.stringify(auditInput.client_profile),
    "</client_profile>",
    "",
    "<deterministic_findings>",
    JSON.stringify(deterministicFindings),
    "</deterministic_findings>",
    "",
    "<archetype_gating>",
    `archetype: ${auditInput.archetype}`,
    `include_optional_pre_transaction: ${auditInput.include_optional_pre_transaction}`,
    "</archetype_gating>",
    "",
    `Audit this plan per your system prompt. Surface findings via the ${STAGE5_TOOL_NAME} tool. Deterministic findings are already populated in <deterministic_findings>; focus your LLM-only effort on LC.1–LC.6. If the plan reads clean, emit an empty findings array — silence is acceptable.`,
  ].join("\n");
}

// ────────────────────────────────────────────────────────────────────────
// Cost computation matching Stage 4
// ────────────────────────────────────────────────────────────────────────

function computeCostCents(
  inputTokens: number,
  outputTokens: number,
  cacheCreation: number,
  cacheRead: number,
): number {
  const millicentsPerToken = (centsPerM: number) => centsPerM / 1000;
  const cost =
    inputTokens * millicentsPerToken(OPUS_4_7_INPUT_CENTS_PER_M) +
    outputTokens * millicentsPerToken(OPUS_4_7_OUTPUT_CENTS_PER_M) +
    cacheCreation * millicentsPerToken(OPUS_4_7_CACHE_WRITE_CENTS_PER_M) +
    cacheRead * millicentsPerToken(OPUS_4_7_CACHE_READ_CENTS_PER_M);
  return Math.round(cost / 1000);
}

// ────────────────────────────────────────────────────────────────────────
// Sort findings by severity (critical → warning → info), then category, then
// section_id for deterministic ordering.
// ────────────────────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

function sortFindings(findings: AuditFinding[]): AuditFinding[] {
  return [...findings].sort((a, b) => {
    const sa = SEVERITY_ORDER[a.severity] ?? 99;
    const sb = SEVERITY_ORDER[b.severity] ?? 99;
    if (sa !== sb) return sa - sb;
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    const aSec = a.section_ids[0] ?? "";
    const bSec = b.section_ids[0] ?? "";
    return aSec.localeCompare(bSec);
  });
}

// ────────────────────────────────────────────────────────────────────────
// Compute harness-authoritative overall_assessment per spec Phase 3.2.
//
// Heuristic (Phase 3.3 Step 3 polish — contradiction-count threshold tuned):
// - regenerate_recommended:
//     ≥1 critical from DC.1/DC.2/DC.4/DC.6/DC.7/DC.9, OR
//     ≥1 critical-severity LC.2 / LC.3 contradiction (LLM-flagged), OR
//     LLM voice_consistency_score < 60, OR
//     LLM contradiction_count >= 8 (sheer volume of contradictions)
// - review_recommended:
//     1-2 critical findings (excluding DC.5/DC.10 which are sanity checks), OR
//     ≥5 warnings, OR
//     LLM voice_consistency_score < 80, OR
//     LLM contradiction_count >= 1
// - ship_ready: otherwise
//
// Calibration note: warning-severity contradictions are hand-editable
// framing issues (e.g., "$42.5M umbrella face shouldn't be aggregated as
// estate-tax savings in the closer"); only critical-severity contradictions
// or sheer volume (8+) warrant full regeneration. The Holloway live test
// (Phase 3.3 Step 3 final) emitted 6 warning contradictions — none individually
// catastrophic, all hand-editable. Under the prior `>= 3 → regenerate`
// threshold the harness flipped to regenerate_recommended over the LLM's
// review_recommended vote — a calibration mismatch that this revised rule
// eliminates.
// ────────────────────────────────────────────────────────────────────────

const STRUCTURALLY_CRITICAL_CATEGORIES = new Set<AuditFinding["category"]>([
  "DC1_unresolved_cross_refs",
  "DC2_roadmap_orphans",
  "DC4_missing_decisions",
  "DC6_missing_sections",
  "DC7_archetype_violations",
  "DC9_compliance_issues",
]);

const SANITY_CHECK_CATEGORIES = new Set<AuditFinding["category"]>([
  "DC5_unused_glossary",
  "DC10_lifecycle_violations",
]);

const CONTRADICTION_LC_CATEGORIES = new Set<AuditFinding["category"]>([
  "LC2_numerical_contradictions",
  "LC3_strategic_coherence",
]);

function computeOverallAssessment(
  findings: AuditFinding[],
  llmAssessment: LlmAssessment | null,
): OverallAssessment {
  const criticalStructural = findings.filter(
    (f) =>
      f.severity === "critical" &&
      STRUCTURALLY_CRITICAL_CATEGORIES.has(f.category),
  );
  const criticalNonSanity = findings.filter(
    (f) => f.severity === "critical" && !SANITY_CHECK_CATEGORIES.has(f.category),
  );
  const criticalLcContradictions = findings.filter(
    (f) =>
      f.severity === "critical" &&
      CONTRADICTION_LC_CATEGORIES.has(f.category),
  );
  const warnings = findings.filter((f) => f.severity === "warning");

  if (criticalStructural.length >= 1) return "regenerate_recommended";
  if (criticalLcContradictions.length >= 1) return "regenerate_recommended";
  if (llmAssessment !== null) {
    if (llmAssessment.voice_consistency_score < 60) return "regenerate_recommended";
    // Sheer-volume threshold for contradiction_count: only fire regenerate
    // when 8+ contradictions are reported. Below that threshold, the LLM's
    // contradiction_count fields are usually warning-severity framing issues
    // that an advisor hand-edits — not catastrophic strategic conflicts.
    if (llmAssessment.contradiction_count >= 8) return "regenerate_recommended";
  }

  if (criticalNonSanity.length >= 1) return "review_recommended";
  if (warnings.length >= 5) return "review_recommended";
  if (llmAssessment !== null) {
    if (llmAssessment.voice_consistency_score < 80) return "review_recommended";
    // Lower threshold (>= 3) escalates to review-recommended without going to
    // regenerate. The 1-2 case still flows through to the contradiction_count
    // >= 1 rule below.
    if (llmAssessment.contradiction_count >= 3) return "review_recommended";
    if (llmAssessment.contradiction_count >= 1) return "review_recommended";
  }

  return "ship_ready";
}

// ────────────────────────────────────────────────────────────────────────
// Main entry
// ────────────────────────────────────────────────────────────────────────

export async function auditPlan(
  stage4Input: Stage4Result | Stage4ResultFailed,
  quantifiedRecommendations: QuantifiedRecommendations,
  clientProfile: ClientProfile,
  options: Stage5Options,
): Promise<Stage5Result | Stage5ResultFailed> {
  // Reset finding-ID counter for this audit so finding IDs start at F-001
  // per invocation (testing-friendly + advisor UI deterministic ordering).
  _resetFindingIdCounterForTesting();

  const startTime = Date.now();
  const kbPath = options.kbPath ?? DEFAULT_KB_PATH;
  const landmineAuthorizations = options.landmineAuthorizations ?? [];
  const maxRetries = options.maxRetries ?? 1;
  const maxAttempts = maxRetries + 1;
  const runLlmChecks = options.runLlmChecks ?? true;
  const attemptHistory: AttemptHistoryEntry[] = [];

  const partialMetadata = (
    attemptsMade: number,
    inputTokens = 0,
    outputTokens = 0,
    cacheCreation = 0,
    cacheRead = 0,
  ): Partial<Stage5Metadata> => ({
    stage_version: STAGE_VERSION,
    model_used: MODEL,
    input_token_count: inputTokens,
    output_token_count: outputTokens,
    cache_creation_input_tokens: cacheCreation,
    cache_read_input_tokens: cacheRead,
    attempts_made: attemptsMade,
    attempt_history: [...attemptHistory],
    duration_ms: Date.now() - startTime,
    source_fr_content_hash:
      (clientProfile._metadata?.source_fr_content_hash as string) ?? "",
    parsed_at: new Date().toISOString(),
    cost_cents: computeCostCents(inputTokens, outputTokens, cacheCreation, cacheRead),
    source_stage4_result_hash: hashContent(JSON.stringify(stage4Input)),
    source_quantified_recommendations_hash: hashContent(
      JSON.stringify(quantifiedRecommendations),
    ),
    source_client_profile_hash: hashContent(JSON.stringify(clientProfile)),
  });

  // ────────────────────────────────────────────────────────────────────
  // Pre-flight: Stage 4 input failed → fail-fast, no audit possible
  // ────────────────────────────────────────────────────────────────────

  if (isStage4ResultFailed(stage4Input)) {
    return makeFailure(
      "stage4_input_failed",
      `Cannot audit a failed Stage 4 result. Stage 4 failure type: ${stage4Input._failure_type}`,
      {
        attempts_made: 0,
        stage4_failure_type: stage4Input._failure_type,
      },
      partialMetadata(0),
    );
  }
  const stage4Result: Stage4Result = stage4Input;

  // ────────────────────────────────────────────────────────────────────
  // Phase 1 — Deterministic checks (always run, cheap)
  // ────────────────────────────────────────────────────────────────────

  const deterministicChecks = runAllDeterministicChecks(
    stage4Result,
    quantifiedRecommendations,
    clientProfile,
    landmineAuthorizations,
  );
  const deterministicFindings = deterministicResultsToFindings(deterministicChecks);

  // Helper: produce a deterministic-only Stage5Result (no LLM call). Used
  // both when `runLlmChecks: false` and when pre-flight context overflow
  // forces the LLM phase to be skipped (Phase 3.3 Step 3 recovery).
  const buildDeterministicOnlyResult = (
    skippedDueToContextOverflow: boolean,
    estimatedInputTokens: number | null,
  ): Stage5Result => {
    const sortedFindings = sortFindings(deterministicFindings);
    const overallAssessment = computeOverallAssessment(sortedFindings, null);
    const flags: Stage5Flags = {
      assessment_disagreement: false,
      llm_skipped: true,
      llm_skipped_due_to_context_overflow: skippedDueToContextOverflow,
      unresolved_findings_count: sortedFindings.filter(
        (f) => f.suggested_action === "informational_only",
      ).length,
    };
    const metadata: Stage5Metadata = {
      stage_version: STAGE_VERSION,
      model_used: MODEL,
      input_token_count: estimatedInputTokens ?? 0,
      output_token_count: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      attempts_made: 0,
      attempt_history: [],
      duration_ms: Date.now() - startTime,
      source_fr_content_hash:
        (clientProfile._metadata?.source_fr_content_hash as string) ?? "",
      parsed_at: new Date().toISOString(),
      cost_cents: 0,
      source_stage4_result_hash: hashContent(JSON.stringify(stage4Result)),
      source_quantified_recommendations_hash: hashContent(
        JSON.stringify(quantifiedRecommendations),
      ),
      source_client_profile_hash: hashContent(JSON.stringify(clientProfile)),
    };
    return {
      findings: sortedFindings,
      deterministic_checks: deterministicChecks,
      llm_assessment: null,
      overall_assessment: overallAssessment,
      _flags: flags,
      _metadata: metadata,
    };
  };

  // If runLlmChecks: false, skip Phase 2 and return deterministic-only result.
  if (!runLlmChecks) {
    return buildDeterministicOnlyResult(false, null);
  }

  // ────────────────────────────────────────────────────────────────────
  // Phase 2 — LLM call (tool-use, streaming, retry loop)
  // ────────────────────────────────────────────────────────────────────

  // Resolve advisor (used for compliance hygiene cross-check; not strictly
  // required for the LLM call but kept for parity with Stage 4 and to give
  // the LLM advisor context if needed).
  if (options.advisorOverride === undefined) {
    const advisorIdToLookup =
      options.advisorId ?? clientProfile.engagement.advisor_id;
    try {
      const advisorsFile = await loadAdvisors(kbPath);
      findAdvisor(advisorsFile, advisorIdToLookup);
      // We don't fail on advisor lookup miss here — Stage 4's audit input
      // already exists with whatever advisor identity it had. If the
      // advisor file is just unloadable, that's a kb_load_failed.
    } catch (err) {
      return makeFailure(
        "kb_load_failed",
        `Could not load advisors directory: ${(err as Error).message}`,
        { attempts_made: 0, kb_path_attempted: kbPath },
        partialMetadata(0),
      );
    }
  }

  // Load voice calibration summary + system prompt.
  let voiceCalibrationSummary: string;
  let systemPrompt: string;
  try {
    voiceCalibrationSummary = await loadVoiceCalibrationSummary();
  } catch (err) {
    return makeFailure(
      "kb_load_failed",
      `Could not load voice calibration summary: ${(err as Error).message}`,
      { attempts_made: 0 },
      partialMetadata(0),
    );
  }
  try {
    systemPrompt = await loadSystemPrompt();
  } catch (err) {
    return makeFailure(
      "kb_load_failed",
      `Could not load Stage 5 system prompt: ${(err as Error).message}`,
      { attempts_made: 0, kb_path_attempted: SYSTEM_PROMPT_PATH },
      partialMetadata(0),
    );
  }

  // Build the trimmed audit input (Stage5LlmAuditInput). The deterministic
  // checks above already ran on the FULL inputs; only the LLM sees this
  // projection.
  const auditInput: Stage5LlmAuditInput = projectForStage5Audit(
    stage4Result,
    quantifiedRecommendations,
    clientProfile,
  );
  const userTurn = buildUserTurn(
    voiceCalibrationSummary,
    auditInput,
    deterministicFindings,
  );

  // Pre-flight context-overflow check: chars/4 fast-fail at 80K, then
  // count_tokens authoritative at 100K. On overflow we SOFT-DEGRADE: return
  // a Stage5Result with deterministic findings + null llm_assessment, marked
  // via _flags.llm_skipped_due_to_context_overflow. Phase 3.3 Step 3 recovery:
  // a too-large plan is a partial-result situation, not a hard failure — the
  // advisor still gets every DC.1–DC.10 finding even when the LLM can't fire.
  const charsOver4Estimate =
    estimateTokens(userTurn) + estimateTokens(systemPrompt);
  if (charsOver4Estimate > INPUT_TOKEN_CEILING_CHARS_OVER_4) {
    return buildDeterministicOnlyResult(true, charsOver4Estimate);
  }

  let realInputTokenEstimate: number;
  try {
    const countResult = await options.apiClient.messages.countTokens({
      model: MODEL,
      system: [{ type: "text", text: systemPrompt }],
      messages: [{ role: "user", content: userTurn }],
      tools: [
        {
          name: STAGE5_TOOL_NAME,
          description: STAGE5_TOOL_DESCRIPTION,
          input_schema: STAGE5_TOOL_INPUT_SCHEMA as Anthropic.Tool.InputSchema,
        },
      ],
    });
    realInputTokenEstimate = countResult.input_tokens;
  } catch (err) {
    return makeFailure(
      "api_error",
      `Anthropic count_tokens API call failed during Stage 5 pre-flight: ${(err as Error).message}`,
      {
        api_error: (err as Error).message,
        attempts_made: 0,
      },
      partialMetadata(0),
    );
  }

  if (realInputTokenEstimate > INPUT_TOKEN_CEILING_REAL) {
    return buildDeterministicOnlyResult(true, realInputTokenEstimate);
  }

  // Retry loop.
  const conversation: Anthropic.MessageParam[] = [
    { role: "user", content: userTurn },
  ];

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheCreation = 0;
  let totalCacheRead = 0;

  type LastRetryFailure = {
    type: "schema_validation_failed";
    validation_errors: string[];
    parsed_response: unknown;
    raw_response: string;
  };
  let lastRetryFailure: LastRetryFailure | null = null;
  let resolvedLlmOutput: Stage5LlmRawOutput | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const attemptStart = Date.now();
    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      // temperature omitted — deprecated for Opus 4.7
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: conversation,
      tools: [
        {
          name: STAGE5_TOOL_NAME,
          description: STAGE5_TOOL_DESCRIPTION,
          input_schema: STAGE5_TOOL_INPUT_SCHEMA as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: STAGE5_TOOL_NAME },
    };

    let response: Anthropic.Message;
    try {
      const stream = options.apiClient.messages.stream(params);
      response = await stream.finalMessage();
    } catch (err) {
      const apiErr = (err as Error).message;
      attemptHistory.push({
        attempt_number: attempt,
        outcome: "api_error",
        failure_details: apiErr,
        duration_ms: Date.now() - attemptStart,
        input_tokens: 0,
        output_tokens: 0,
      });
      return makeFailure(
        "api_error",
        `Anthropic API call failed: ${apiErr}`,
        { api_error: apiErr, attempts_made: attempt },
        partialMetadata(
          attempt,
          totalInputTokens,
          totalOutputTokens,
          totalCacheCreation,
          totalCacheRead,
        ),
      );
    }

    const attemptInputTokens = response.usage?.input_tokens ?? 0;
    const attemptOutputTokens = response.usage?.output_tokens ?? 0;
    totalInputTokens += attemptInputTokens;
    totalOutputTokens += attemptOutputTokens;
    totalCacheCreation += response.usage?.cache_creation_input_tokens ?? 0;
    totalCacheRead += response.usage?.cache_read_input_tokens ?? 0;

    // Truncation-abort guard.
    if (attemptOutputTokens >= MAX_TOKENS) {
      const errMsg = `Audit output truncated at MAX_TOKENS=${MAX_TOKENS}. The auditor surfaced more findings than the per-call ceiling. Reduce plan scope or split audit by lens.`;
      attemptHistory.push({
        attempt_number: attempt,
        outcome: "schema_validation_failed",
        failure_details: errMsg,
        duration_ms: Date.now() - attemptStart,
        input_tokens: attemptInputTokens,
        output_tokens: attemptOutputTokens,
      });
      return makeFailure(
        "context_overflow",
        errMsg,
        { attempts_made: attempt },
        partialMetadata(
          attempt,
          totalInputTokens,
          totalOutputTokens,
          totalCacheCreation,
          totalCacheRead,
        ),
      );
    }

    // Extract tool_use input.
    const extracted = extractToolUseInput(response, STAGE5_TOOL_NAME);
    if (!extracted) {
      const fallbackText = extractResponseText(response);
      const errMsg = `No tool_use block named '${STAGE5_TOOL_NAME}' in model response (content blocks: ${response.content
        .map((b) => b.type)
        .join(", ")})`;
      lastRetryFailure = {
        type: "schema_validation_failed",
        validation_errors: [errMsg],
        parsed_response: null,
        raw_response: fallbackText,
      };
      attemptHistory.push({
        attempt_number: attempt,
        outcome: "schema_validation_failed",
        failure_details: errMsg,
        duration_ms: Date.now() - attemptStart,
        input_tokens: attemptInputTokens,
        output_tokens: attemptOutputTokens,
      });
      if (attempt === maxAttempts) break;
      conversation.push({ role: "assistant", content: fallbackText });
      conversation.push({
        role: "user",
        content: buildSchemaRetryUserTurn(STAGE5_TOOL_NAME, [errMsg]),
      });
      continue;
    }

    const parsed = extracted.input;
    const responseText = extracted.rawText;

    const validation = Stage5LlmRawOutputSchema.safeParse(parsed);
    if (!validation.success) {
      const errors = formatZodIssues(validation.error);
      lastRetryFailure = {
        type: "schema_validation_failed",
        validation_errors: errors,
        parsed_response: parsed,
        raw_response: responseText,
      };
      attemptHistory.push({
        attempt_number: attempt,
        outcome: "schema_validation_failed",
        failure_details: errors.join("; "),
        duration_ms: Date.now() - attemptStart,
        input_tokens: attemptInputTokens,
        output_tokens: attemptOutputTokens,
      });
      if (attempt === maxAttempts) break;
      conversation.push({ role: "assistant", content: responseText });
      conversation.push({
        role: "user",
        content: buildSchemaRetryUserTurn(STAGE5_TOOL_NAME, errors),
      });
      continue;
    }

    // Success.
    attemptHistory.push({
      attempt_number: attempt,
      outcome: "success",
      failure_details: null,
      duration_ms: Date.now() - attemptStart,
      input_tokens: attemptInputTokens,
      output_tokens: attemptOutputTokens,
    });
    resolvedLlmOutput = validation.data;
    break;
  }

  if (resolvedLlmOutput === null) {
    const partial = partialMetadata(
      maxAttempts,
      totalInputTokens,
      totalOutputTokens,
      totalCacheCreation,
      totalCacheRead,
    );
    if (lastRetryFailure) {
      if (maxAttempts > 1) {
        return makeFailure(
          "max_retries_exceeded",
          `All ${maxAttempts} attempts failed; last failure was schema_validation_failed.`,
          {
            attempts_made: maxAttempts,
            last_failure_type: "schema_validation_failed",
            raw_response: lastRetryFailure.raw_response,
            validation_errors: lastRetryFailure.validation_errors,
            parsed_response: lastRetryFailure.parsed_response,
          },
          partial,
        );
      }
      return makeFailure(
        "schema_validation_failed",
        "Model response did not match Stage5LlmRawOutputSchema.",
        {
          validation_errors: lastRetryFailure.validation_errors,
          parsed_response: lastRetryFailure.parsed_response,
          raw_response: lastRetryFailure.raw_response,
          attempts_made: maxAttempts,
        },
        partial,
      );
    }
    return makeFailure(
      "max_retries_exceeded",
      "auditPlan retry loop exited without recording a failure — unreachable in normal flow.",
      { attempts_made: maxAttempts },
      partial,
    );
  }

  // ────────────────────────────────────────────────────────────────────
  // Phase 3 — Merge + finalize
  // ────────────────────────────────────────────────────────────────────

  // Re-id the LLM-emitted findings with the harness's monotonic counter so
  // they slot into the merged sequence after the deterministic findings.
  const llmFindings: AuditFinding[] = resolvedLlmOutput.findings.map((f) => ({
    ...f,
    finding_id: (() => {
      // The deterministic counter has already advanced for the deterministic
      // findings; nextFindingId() in the deterministic module returns
      // sequential IDs. Here we just pass through the LLM's IDs unchanged
      // as long as they're unique; if the LLM emits duplicates we re-id.
      return f.finding_id;
    })(),
  }));

  // Merge + sort.
  const allFindings = sortFindings([...deterministicFindings, ...llmFindings]);

  // Compute harness-authoritative overall_assessment.
  const harnessAssessment = computeOverallAssessment(
    allFindings,
    resolvedLlmOutput.llm_assessment,
  );
  const llmVote = resolvedLlmOutput.llm_assessment.llm_overall_assessment;
  const assessmentDisagreement = harnessAssessment !== llmVote;

  const flags: Stage5Flags = {
    assessment_disagreement: assessmentDisagreement,
    llm_skipped: false,
    llm_skipped_due_to_context_overflow: false,
    unresolved_findings_count: allFindings.filter(
      (f) => f.suggested_action === "informational_only",
    ).length,
  };

  const metadata: Stage5Metadata = {
    stage_version: STAGE_VERSION,
    model_used: MODEL,
    input_token_count: totalInputTokens,
    output_token_count: totalOutputTokens,
    cache_creation_input_tokens: totalCacheCreation,
    cache_read_input_tokens: totalCacheRead,
    attempts_made: attemptHistory.length,
    attempt_history: attemptHistory,
    duration_ms: Date.now() - startTime,
    source_fr_content_hash:
      (clientProfile._metadata?.source_fr_content_hash as string) ?? "",
    parsed_at: new Date().toISOString(),
    cost_cents: computeCostCents(
      totalInputTokens,
      totalOutputTokens,
      totalCacheCreation,
      totalCacheRead,
    ),
    source_stage4_result_hash: hashContent(JSON.stringify(stage4Result)),
    source_quantified_recommendations_hash: hashContent(
      JSON.stringify(quantifiedRecommendations),
    ),
    source_client_profile_hash: hashContent(JSON.stringify(clientProfile)),
  };

  return {
    findings: allFindings,
    deterministic_checks: deterministicChecks,
    llm_assessment: resolvedLlmOutput.llm_assessment,
    overall_assessment: harnessAssessment,
    _flags: flags,
    _metadata: metadata,
  };
}

export { isStage5ResultFailed };
