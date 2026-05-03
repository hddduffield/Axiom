// Stage 4 — Plan Generator.
//
// Takes Stage 3a's QuantifiedRecommendations envelope plus ClientProfile and
// produces a complete Stage4Result carrying all 14 sections of a PSA Wealth
// financial plan. Six sections are LLM-generated narrative; eight are
// deterministic template-driven assemblies. Single LLM call (tool-use) for
// the six narrative sections; deterministic builders run synchronously
// before/after.
//
// Architectural pattern: mirrors Stage 3a.1 (tool-use schema enforcement,
// streaming via messages.stream + finalMessage, retry loop, truncation-abort
// guard, attempt_history). Voice calibration doc loaded as user-turn block
// (Flagged Decision #4 in spec).

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import type Anthropic from "@anthropic-ai/sdk";
import { ZodError } from "zod";
import {
  Stage4Pass1OutputSchema,
  Stage4Pass2OutputSchema,
  STAGE4_PASS1_TOOL_INPUT_SCHEMA,
  STAGE4_PASS2_TOOL_INPUT_SCHEMA,
  STAGE4_TOOL_NAME_PASS1,
  STAGE4_TOOL_NAME_PASS2,
  STAGE4_PASS1_TOOL_DESCRIPTION,
  STAGE4_PASS2_TOOL_DESCRIPTION,
  isStage4ResultFailed,
  type AdvisorEntry,
  type Stage4FailureType,
  type Stage4Flags,
  type Stage4LlmInput,
  type Stage4LlmInputActionItem,
  type Stage4LlmInputRec,
  type Stage4LlmRawOutput,
  type Stage4Metadata,
  type Stage4Pass1Output,
  type Stage4Pass2Output,
  type Stage4Result,
  type Stage4ResultFailed,
  type NumbersDriftEntry,
  type UnresolvedCrossReference,
} from "../schemas/stage4.types";
import {
  ARCHETYPE_INCLUDES_OPTIONAL_PRE_TRANSACTION,
  buildAdvisoryTeam,
  buildClientSnapshot,
  buildComplianceTrackingId,
  buildDecisionsNeeded,
  buildDisclosures,
  buildGlossarySubset,
  buildGoalsPriorities,
  buildImplementationRoadmap,
  buildMeetingCadenceTable,
  buildTitlePage,
  buildTopFivePriorities,
  detectNumberDriftForRec,
  extractAllProseFromLlmOutput,
  findAdvisor,
  loadAdvisors,
  loadGlossaryTerms,
} from "../glue/stage4Builders";
import {
  OPUS_4_7_INPUT_CENTS_PER_M,
  OPUS_4_7_OUTPUT_CENTS_PER_M,
  OPUS_4_7_CACHE_WRITE_CENTS_PER_M,
  OPUS_4_7_CACHE_READ_CENTS_PER_M,
  type FirmPolicyResolution,
  type LandmineAuthorization,
} from "./stage3a1BatchQuantifier";
import type { ClientProfile, AttemptHistoryEntry } from "../schemas/clientProfile";
import type { QuantifiedRecommendations, SequencedRecommendation } from "../schemas/pipelineTypes";

// ────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────

const STAGE_VERSION = "4-1.0.0";
const MODEL = "claude-opus-4-7";
const MAX_TOKENS = 32000;
const DEFAULT_KB_PATH = "kb/v1_2";
// Pre-flight context-overflow ceilings. Two thresholds:
//
// 1. INPUT_TOKEN_CEILING_REAL — the authoritative cap, using Anthropic's
//    count_tokens API. Anthropic's hard context limit is 200K; we need
//    32K output budget per pass; that leaves 168K input. We cap at 165K
//    for a 3K safety margin against tokenizer drift.
//
// 2. INPUT_TOKEN_CEILING_CHARS_OVER_4 — a quick chars/4 sanity check that
//    runs first to short-circuit egregiously-too-large inputs without
//    incurring a count_tokens API call. Tuned empirically: Holloway
//    chars/4 estimate was 97K but real tokens were 144K (~48% under-count).
//    We set chars/4 ceiling at 130K to catch inputs where even the
//    optimistic chars/4 estimate is in the danger zone.
const INPUT_TOKEN_CEILING_REAL = 165000;
const INPUT_TOKEN_CEILING_CHARS_OVER_4 = 130000;

const SYSTEM_PROMPT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "stage4.system.md",
);

// Voice calibration is checked into specs/. Loaded once at module init and
// cached. Path is relative to the module's location (src/lib/orchestrator/stages/)
// resolved up to the repo root.
const VOICE_CALIBRATION_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../specs/stages/stage4_voice_calibration.md",
);

let cachedSystemPrompt: string | null = null;
let cachedVoiceCalibration: string | null = null;

async function loadSystemPrompt(): Promise<string> {
  if (cachedSystemPrompt !== null) return cachedSystemPrompt;
  cachedSystemPrompt = await readFile(SYSTEM_PROMPT_PATH, "utf8");
  return cachedSystemPrompt;
}

async function loadVoiceCalibration(): Promise<string> {
  if (cachedVoiceCalibration !== null) return cachedVoiceCalibration;
  cachedVoiceCalibration = await readFile(VOICE_CALIBRATION_PATH, "utf8");
  return cachedVoiceCalibration;
}

// Test-only cache reset.
export function _resetStage4CachesForTesting(): void {
  cachedSystemPrompt = null;
  cachedVoiceCalibration = null;
}

// ────────────────────────────────────────────────────────────────────────
// Stage4ApiClient — structural interface, mirrors Stage3a1ApiClient.
//
// Phase 3.2 Step 3 multi-pass refactor adds `countTokens` so the harness
// can ask Anthropic for the real token count of an in-flight request
// before the LLM call fires. This replaces the chars/4 pre-flight estimate,
// which under-counted by ~48% on Holloway content (97K chars/4 vs 144K
// real tokens). With real tokens we can enforce a tight ceiling against
// Anthropic's 200K context limit and avoid silent breaches.
// ────────────────────────────────────────────────────────────────────────

export interface Stage4MessageStream {
  finalMessage: () => Promise<Anthropic.Message>;
}

export interface Stage4ApiClient {
  messages: {
    stream: (
      params: Anthropic.MessageCreateParamsNonStreaming,
    ) => Stage4MessageStream;
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

export interface Stage4Options {
  apiClient: Stage4ApiClient;
  kbPath?: string;
  advisorId?: string;             // looked up in advisors.json
  advisorOverride?: AdvisorOverride; // bypass file lookup; use this entry directly
  generatedDate?: Date;
  complianceTrackingId?: string;
  referenceDate?: Date;
  firmPolicyResolutions?: FirmPolicyResolution[];
  landmineAuthorizations?: LandmineAuthorization[];
  maxRetries?: number;
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildNumberDriftRetryUserTurn(
  toolName: string,
  hardDrifts: NumbersDriftEntry[],
): string {
  return [
    `Your previous ${toolName} tool call emitted dollar figures that don't match the values in <quantified_recommendations>. Hard drift entries:`,
    ...hardDrifts.map(
      (d) =>
        `- ${d.rec_id}: emitted ${d.emitted}, expected ${d.expected}`,
    ),
    "",
    `Call ${toolName} again using the exact values from <quantified_recommendations>. Use ranges, "approximately X" phrasing, and assumption parentheticals — but do not invent values outside Stage 3a's emitted range.`,
  ].join("\n");
}

function makeFailure(
  failureType: Stage4FailureType,
  reason: string,
  context: Stage4ResultFailed["_failure_context"],
  partialMetadata: Partial<Stage4Metadata>,
): Stage4ResultFailed {
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

// Project a full QuantifiedRecommendations envelope down to the trimmed
// Stage4LlmInput shape that gets serialized into the user turn. Per the
// diagnosis at `specs/stages/stage4_input_trim_diagnosis.md`, this excludes
// fields the LLM does not narrate from (~29K tokens at Holloway scale).
//
// Phase 3.2 Step 3 mitigation A: action_items[*].description is dropped for
// non-State-A recs (estimate === null). The LLM narrates non-State-A recs
// from `qualitative_phrasing`; description is redundant in the bullet
// briefings for State B (blocked), State C (firm-policy pending), and
// State D (qualitative-only). The deterministic Implementation Roadmap
// still renders every action's description from the full envelope.
//
// **The deterministic builders DO NOT call this projection.** They consume
// the full envelope passed into `generatePlan()` directly. The trim only
// applies to what the LLM sees in `<quantified_recommendations>`.
//
// Implementation note: explicit field selection (no spread operators) so any
// future addition to QuantifiedRecommendations does not silently leak into
// the LLM input. Adding a field to Stage4LlmInput is a deliberate decision.
export function projectQuantifiedRecsForLlm(
  quantified: QuantifiedRecommendations,
): Stage4LlmInput {
  return {
    recommendations: quantified.recommendations.map((rec): Stage4LlmInputRec => {
      const isStateA = rec.quantified_impact.estimate !== null;
      return {
        recommendation_id: rec.recommendation_id,
        category: rec.category,
        plan_section: rec.plan_section,
        subsection_within_section: rec.subsection_within_section,
        co_triggered_with: rec.co_triggered_with,
        quantified_impact: {
          estimate: rec.quantified_impact.estimate,
          formula_id: rec.quantified_impact.formula_id,
          // formula_source_file dropped
          // computation_inputs dropped
          pending_reconciliation: rec.quantified_impact.pending_reconciliation,
          alternative_values: rec.quantified_impact.alternative_values,
          qualitative_phrasing: rec.quantified_impact.qualitative_phrasing,
          reason_no_formula: rec.quantified_impact.reason_no_formula,
          blocked_inputs: rec.quantified_impact.blocked_inputs,
        },
        scenario_range: rec.scenario_range,
        timing_bucket: rec.timing_bucket,
        owner: rec.owner,
        // owner_name dropped (always null)
        decisions_needed: rec.decisions_needed,
        // cluster_id, cluster_sequence_closer dropped (always null at Stage 3a)
        action_items: rec.action_items.map((ai): Stage4LlmInputActionItem => {
          const projected: Stage4LlmInputActionItem = {
            action_item_id: ai.action_item_id,
            // description: kept only for State A recs (mitigation A).
            // sub_steps dropped
            category: ai.category,
            source_recommendation_id: ai.source_recommendation_id,
            source_phase_or_step: ai.source_phase_or_step,
            owner: ai.owner,
            // owner_name dropped (always null)
            timing_bucket: ai.timing_bucket,
            // depends_on dropped
            is_decision_needed: ai.is_decision_needed,
            duration_class: ai.duration_class,
            check_in_cadence: ai.check_in_cadence,
            partner_required: ai.partner_required,
            partner_type: ai.partner_type,
            // parent_action_item_id, is_derivative_reminder, source_plan_id,
            //   auto_generated_reminder_template all dropped
          };
          if (isStateA) projected.description = ai.description;
          return projected;
        }),
        landmine: rec.landmine,
        landmine_status: rec.landmine_status,
        default_excluded: rec.default_excluded,
        plan_output_variant: rec.plan_output_variant,
        // status, position_in_sequence, source_file_path, match_strength,
        //   _audit_notes all dropped (per diagnosis §3.2)
      };
    }),
    // Top-level _metadata, _sequencer_flags, _sequencer_status,
    // _sequencer_failures all dropped — Stage 3a observability, not narrative.
  };
}

// Trim the ClientProfile for Pass 2 (Personal lens). Pass 2 narrates only
// Personal-lens recommendations (RP.8-12); it does not need business-entity
// context or transaction-posture data. This is Phase 3.2 Step 3 mitigation B
// — drops business-only sections from Pass 2's user turn to free real-token
// budget. Pass 1 always receives the full ClientProfile.
//
// Sections kept: engagement (archetype gating), client_and_family (Marcus,
// Catherine, kids), personal_balance_sheet, income, cash_flow, tax_status,
// estate_planning, insurance, goals_and_values, existing_advisor_relationships,
// documents_received, advisor_observations, _metadata.
//
// Sections dropped: entities, entity_structure, transaction_posture,
// prior_transactions.
export function trimClientProfileForPass2(clientProfile: ClientProfile): ClientProfile {
  // Cast through `as unknown as ClientProfile` because we're returning a
  // shape with business sections elided — TypeScript would reject the
  // direct return otherwise. The LLM's user turn JSON-stringifies this;
  // structurally absent properties simply don't appear in the JSON.
  return {
    engagement: clientProfile.engagement,
    client_and_family: clientProfile.client_and_family,
    personal_balance_sheet: clientProfile.personal_balance_sheet,
    income: clientProfile.income,
    cash_flow: clientProfile.cash_flow,
    tax_status: clientProfile.tax_status,
    estate_planning: clientProfile.estate_planning,
    insurance: clientProfile.insurance,
    goals_and_values: clientProfile.goals_and_values,
    existing_advisor_relationships:
      clientProfile.existing_advisor_relationships,
    documents_received: clientProfile.documents_received,
    advisor_observations: clientProfile.advisor_observations,
    _metadata: clientProfile._metadata,
    // entities, entity_structure, transaction_posture, prior_transactions all dropped.
  } as unknown as ClientProfile;
}

// Build the shared user-turn content (everything except the closing
// pass-specific instruction). The shared portion is mostly identical across
// Pass 1 and Pass 2 — voice calibration, full QuantifiedRecommendations
// (trimmed via projectQuantifiedRecsForLlm), top priorities, archetype gating
// — but ClientProfile is slimmed for Pass 2 (Personal lens) per mitigation B.
function buildSharedUserTurnBody(
  voiceCalibration: string,
  clientProfile: ClientProfile,
  quantifiedRecommendations: QuantifiedRecommendations,
  topPriorities: ReturnType<typeof buildTopFivePriorities>,
  archetype: string,
  includeOptionalPreTransaction: boolean,
  firmPolicyResolutions: FirmPolicyResolution[],
  landmineAuthorizations: LandmineAuthorization[],
  passNumber: 1 | 2,
): string {
  const cpForPass =
    passNumber === 2 ? trimClientProfileForPass2(clientProfile) : clientProfile;
  // Trim the QuantifiedRecommendations envelope to the Stage4LlmInput shape
  // before serializing. This is the SOLE call site for the trim — builders
  // continue to receive the full envelope through `generatePlan()`.
  const trimmedForLlm = projectQuantifiedRecsForLlm(quantifiedRecommendations);

  return [
    "<voice_calibration>",
    voiceCalibration,
    "</voice_calibration>",
    "",
    "<client_profile>",
    JSON.stringify(cpForPass, null, 2),
    "</client_profile>",
    "",
    "<quantified_recommendations>",
    JSON.stringify(trimmedForLlm, null, 2),
    "</quantified_recommendations>",
    "",
    "<top_priorities>",
    JSON.stringify(topPriorities, null, 2),
    "</top_priorities>",
    "",
    "<archetype_gating>",
    `archetype: ${archetype}`,
    `include_optional_pre_transaction: ${includeOptionalPreTransaction}`,
    "</archetype_gating>",
    "",
    "<firm_policy_resolutions>",
    JSON.stringify(firmPolicyResolutions, null, 2),
    "</firm_policy_resolutions>",
    "",
    "<landmine_authorizations>",
    JSON.stringify(landmineAuthorizations, null, 2),
    "</landmine_authorizations>",
  ].join("\n");
}

const PASS1_INSTRUCTION = `Generate the Pass 1 sections per your system prompt and the voice calibration. Sections required: executive_summary, our_process, findings_observations, recommendations_business (RB.1–RB.7), meeting_cadence_intro. The Personal lens (RP.8–RP.12) is generated in Pass 2 — do NOT emit recommendations_personal here. Submit via the ${STAGE4_TOOL_NAME_PASS1} tool exactly once. Use the numbers from <quantified_recommendations> verbatim — do not invent new estimates.`;

const PASS2_INSTRUCTION = `Generate the Pass 2 sections per your system prompt and the voice calibration. Sections required: recommendations_personal (RP.8–RP.12, [PERSONAL — for owner(s)] label). The framing sections + Business lens were already generated in Pass 1 — emit ONLY recommendations_personal here. Submit via the ${STAGE4_TOOL_NAME_PASS2} tool exactly once. Use the numbers from <quantified_recommendations> verbatim — do not invent new estimates.`;

function buildPassUserTurn(sharedBody: string, passInstruction: string): string {
  return `${sharedBody}\n\n${passInstruction}`;
}

// Build a per-rec prose excerpt for number-drift detection. Concatenates the
// section's intro_paragraph + any bullet bodies whose source_action_item_ids
// reference the rec, producing the prose surface where dollar figures for
// this rec would appear.
function gatherProseForRec(
  rec: SequencedRecommendation,
  llm: Stage4LlmRawOutput,
): string {
  const recId = rec.recommendation_id;
  const aiIdsForRec = new Set(rec.action_items.map((ai) => ai.action_item_id));
  const parts: string[] = [];

  for (const lens of [llm.recommendations_business, llm.recommendations_personal]) {
    for (const sec of lens.sections) {
      if (sec.source_rec_ids.includes(recId)) {
        parts.push(sec.intro_paragraph);
        if (sec.closer_paragraph) parts.push(sec.closer_paragraph.body);
      }
      // Bullets that reference this rec's action_items.
      for (const b of sec.recommendations_bullets) {
        if (b.source_action_item_ids.some((id) => aiIdsForRec.has(id))) {
          parts.push(b.briefing);
        }
      }
      if (sec.subsections) {
        for (const sub of sec.subsections) {
          for (const b of sub.bullets) {
            if (b.source_action_item_ids.some((id) => aiIdsForRec.has(id))) {
              parts.push(b.briefing);
            }
          }
        }
      }
    }
  }
  return parts.join("\n");
}

function detectAllNumbersDrift(
  quantified: QuantifiedRecommendations,
  llm: Stage4LlmRawOutput,
): NumbersDriftEntry[] {
  const out: NumbersDriftEntry[] = [];
  for (const rec of quantified.recommendations) {
    const proseAboutRec = gatherProseForRec(rec, llm);
    if (proseAboutRec.length === 0) continue;
    const result = detectNumberDriftForRec(rec, proseAboutRec);
    for (const d of result.drifts) {
      out.push({
        rec_id: rec.recommendation_id,
        expected: d.expected,
        emitted: d.emitted,
        severity: d.severity,
      });
    }
  }
  return out;
}

// Validate cross-references emitted by the LLM. Each cross-reference's
// target_section_id must resolve to a real section in the assembled output.
// The deterministic section IDs (T, ES, OP, CS, GP, FO, IR, DN, AT, MC, GL,
// DS) always exist; the recommendation section IDs (RB.1-7, RP.8-12) only
// exist if the LLM emitted that section. Unresolved refs are stripped.
function resolveAndStripCrossReferences(
  llm: Stage4LlmRawOutput,
): { stripped: Stage4LlmRawOutput; unresolved: UnresolvedCrossReference[] } {
  const validSectionIds = new Set<string>([
    "T", "ES", "OP", "CS", "GP", "FO", "IR", "DN", "AT", "MC", "GL", "DS",
    ...llm.recommendations_business.sections.map((s) => s.section_id),
    ...llm.recommendations_personal.sections.map((s) => s.section_id),
  ]);

  const unresolved: UnresolvedCrossReference[] = [];

  const filterAndStrip = (
    sectionId: string,
    crossRefs: typeof llm.recommendations_business.sections[number]["cross_references"],
  ) => {
    const kept: typeof crossRefs = [];
    for (const cr of crossRefs) {
      if (validSectionIds.has(cr.target_section_id)) {
        kept.push(cr);
      } else {
        unresolved.push({
          source_section_id: sectionId,
          target_section_id: cr.target_section_id,
          display_text: cr.display_text,
        });
      }
    }
    return kept;
  };

  // Rebuild lenses with stripped cross_references.
  const stripLens = (lens: typeof llm.recommendations_business) => ({
    ...lens,
    sections: lens.sections.map((s) => ({
      ...s,
      cross_references: filterAndStrip(s.section_id, s.cross_references),
    })),
  });

  return {
    stripped: {
      ...llm,
      recommendations_business: stripLens(llm.recommendations_business),
      recommendations_personal: stripLens(llm.recommendations_personal),
    },
    unresolved,
  };
}

// Validate archetype gating against an arbitrary set of recommendation
// sections. Used per-pass (Pass 1 emits Business sections; Pass 2 emits
// Personal sections) and on the merged output.
function validateArchetypeGatingSections(
  sections: Stage4LlmRawOutput["recommendations_business"]["sections"],
  archetype: string,
  includeOptionalPreTransaction: boolean,
): {
  optionalIncluded: { section_id: string; archetype: string }[];
  conditionalOmitted: { section_id: string; reason: string }[];
  errors: string[];
} {
  const optionalIncluded: { section_id: string; archetype: string }[] = [];
  const errors: string[] = [];

  for (const sec of sections) {
    if (sec.label === "[OPTIONAL — included because of pre-transaction posture]") {
      if (!includeOptionalPreTransaction) {
        errors.push(
          `Section ${sec.section_id} carries label '[OPTIONAL — pre-transaction]' but archetype gating disallows it for archetype=${archetype}.`,
        );
      } else {
        optionalIncluded.push({ section_id: sec.section_id, archetype });
      }
    }
  }

  const conditionalOmitted: { section_id: string; reason: string }[] = [];
  if (!includeOptionalPreTransaction) {
    conditionalOmitted.push({
      section_id: "<any>",
      reason: `archetype=${archetype} excludes [OPTIONAL — pre-transaction] sections`,
    });
  }

  return { optionalIncluded, conditionalOmitted, errors };
}

// Compatibility wrapper: validate gating across the merged Stage4LlmRawOutput
// (post-Pass-1+Pass-2). Mirrors the original single-call entry point.
function validateArchetypeGating(
  llm: Stage4LlmRawOutput,
  archetype: string,
  includeOptionalPreTransaction: boolean,
): {
  optionalIncluded: { section_id: string; archetype: string }[];
  conditionalOmitted: { section_id: string; reason: string }[];
  errors: string[];
} {
  return validateArchetypeGatingSections(
    [
      ...llm.recommendations_business.sections,
      ...llm.recommendations_personal.sections,
    ],
    archetype,
    includeOptionalPreTransaction,
  );
}

// Cost-cents computation matching Stage 3a's pricing.
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
// Per-pass LLM runner — encapsulates the retry loop for one of the two
// passes. Pass 1 generates framing + Business; Pass 2 generates Personal.
// Both use the same retry semantics, truncation-abort guard, and
// archetype-gating validation; they differ only in tool definition + zod
// schema + per-pass user-turn instruction.
// ────────────────────────────────────────────────────────────────────────

interface PassRunResult<T> {
  output: T | null;
  inputTokens: number;
  outputTokens: number;
  cacheCreation: number;
  cacheRead: number;
  // If output is null, one of these failure shapes is populated.
  contextOverflow?: { reason: string };
  apiError?: { message: string };
  // If both output and contextOverflow/apiError are null, the pass exhausted
  // schema-validation retries.
  lastValidationFailure?: {
    validation_errors: string[];
    raw_response: string;
    parsed_response: unknown;
  };
}

async function runStage4LlmPass<T>(args: {
  passLabel: "pass1" | "pass2";
  passSchema: { safeParse: (x: unknown) => { success: true; data: T } | { success: false; error: import("zod").ZodError } };
  toolName: string;
  toolDescription: string;
  toolInputSchema: Record<string, unknown>;
  initialUserTurn: string;
  systemPrompt: string;
  apiClient: Stage4ApiClient;
  maxAttempts: number;
  attemptHistory: AttemptHistoryEntry[];
  archetypeValidator: (data: T) => string[];
}): Promise<PassRunResult<T>> {
  const conversation: Anthropic.MessageParam[] = [
    { role: "user", content: args.initialUserTurn },
  ];
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheCreation = 0;
  let cacheRead = 0;
  let lastValidationFailure: PassRunResult<T>["lastValidationFailure"];

  for (let attempt = 1; attempt <= args.maxAttempts; attempt += 1) {
    const attemptStart = Date.now();
    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      // temperature parameter removed: Anthropic deprecated it for Claude
      // Opus 4.7 (returns 400 invalid_request_error). Matches Stage 3a.1's
      // production module which has never set temperature.
      system: [
        {
          type: "text",
          text: args.systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: conversation,
      tools: [
        {
          name: args.toolName,
          description: args.toolDescription,
          input_schema: args.toolInputSchema as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: args.toolName },
    };

    let response: Anthropic.Message;
    try {
      const stream = args.apiClient.messages.stream(params);
      response = await stream.finalMessage();
    } catch (err) {
      const apiErr = (err as Error).message;
      args.attemptHistory.push({
        attempt_number: attempt,
        outcome: "api_error",
        failure_details: `[${args.passLabel}] ${apiErr}`,
        duration_ms: Date.now() - attemptStart,
        input_tokens: 0,
        output_tokens: 0,
      });
      return {
        output: null,
        inputTokens,
        outputTokens,
        cacheCreation,
        cacheRead,
        apiError: { message: apiErr },
      };
    }

    const attemptInputTokens = response.usage?.input_tokens ?? 0;
    const attemptOutputTokens = response.usage?.output_tokens ?? 0;
    inputTokens += attemptInputTokens;
    outputTokens += attemptOutputTokens;
    cacheCreation += response.usage?.cache_creation_input_tokens ?? 0;
    cacheRead += response.usage?.cache_read_input_tokens ?? 0;

    // Truncation-abort guard.
    if (attemptOutputTokens >= MAX_TOKENS) {
      const errMsg = `[${args.passLabel}] Output truncated at MAX_TOKENS=${MAX_TOKENS}; this pass's output volume exceeds the per-call ceiling. Reduce QuantifiedRecommendations scope or split further.`;
      args.attemptHistory.push({
        attempt_number: attempt,
        outcome: "schema_validation_failed",
        failure_details: errMsg,
        duration_ms: Date.now() - attemptStart,
        input_tokens: attemptInputTokens,
        output_tokens: attemptOutputTokens,
      });
      return {
        output: null,
        inputTokens,
        outputTokens,
        cacheCreation,
        cacheRead,
        contextOverflow: { reason: errMsg },
      };
    }

    // Extract tool_use input.
    const extracted = extractToolUseInput(response, args.toolName);
    if (!extracted) {
      const fallbackText = extractResponseText(response);
      const errMsg = `[${args.passLabel}] No tool_use block named '${args.toolName}' in model response (content blocks: ${response.content
        .map((b) => b.type)
        .join(", ")})`;
      lastValidationFailure = {
        validation_errors: [errMsg],
        raw_response: fallbackText,
        parsed_response: null,
      };
      args.attemptHistory.push({
        attempt_number: attempt,
        outcome: "schema_validation_failed",
        failure_details: errMsg,
        duration_ms: Date.now() - attemptStart,
        input_tokens: attemptInputTokens,
        output_tokens: attemptOutputTokens,
      });
      if (attempt === args.maxAttempts) break;
      conversation.push({ role: "assistant", content: fallbackText });
      conversation.push({
        role: "user",
        content: buildSchemaRetryUserTurn(args.toolName, [errMsg]),
      });
      continue;
    }

    const parsed = extracted.input;
    const responseText = extracted.rawText;

    // Schema validation against the pass-specific shape.
    const validation = args.passSchema.safeParse(parsed);
    if (!validation.success) {
      const errors = formatZodIssues(validation.error);
      lastValidationFailure = {
        validation_errors: errors,
        raw_response: responseText,
        parsed_response: parsed,
      };
      args.attemptHistory.push({
        attempt_number: attempt,
        outcome: "schema_validation_failed",
        failure_details: `[${args.passLabel}] ${errors.join("; ")}`,
        duration_ms: Date.now() - attemptStart,
        input_tokens: attemptInputTokens,
        output_tokens: attemptOutputTokens,
      });
      if (attempt === args.maxAttempts) break;
      conversation.push({ role: "assistant", content: responseText });
      conversation.push({
        role: "user",
        content: buildSchemaRetryUserTurn(args.toolName, errors),
      });
      continue;
    }

    // Archetype-gating validation against this pass's section subset.
    const gatingErrors = args.archetypeValidator(validation.data);
    if (gatingErrors.length > 0) {
      lastValidationFailure = {
        validation_errors: gatingErrors,
        raw_response: responseText,
        parsed_response: parsed,
      };
      args.attemptHistory.push({
        attempt_number: attempt,
        outcome: "schema_validation_failed",
        failure_details: `[${args.passLabel}] ${gatingErrors.join("; ")}`,
        duration_ms: Date.now() - attemptStart,
        input_tokens: attemptInputTokens,
        output_tokens: attemptOutputTokens,
      });
      if (attempt === args.maxAttempts) break;
      conversation.push({ role: "assistant", content: responseText });
      conversation.push({
        role: "user",
        content: buildSchemaRetryUserTurn(args.toolName, gatingErrors),
      });
      continue;
    }

    // Success — record and return.
    args.attemptHistory.push({
      attempt_number: attempt,
      outcome: "success",
      failure_details: `[${args.passLabel}] success`,
      duration_ms: Date.now() - attemptStart,
      input_tokens: attemptInputTokens,
      output_tokens: attemptOutputTokens,
    });
    return {
      output: validation.data,
      inputTokens,
      outputTokens,
      cacheCreation,
      cacheRead,
    };
  }

  return {
    output: null,
    inputTokens,
    outputTokens,
    cacheCreation,
    cacheRead,
    lastValidationFailure,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Main entry
// ────────────────────────────────────────────────────────────────────────

export async function generatePlan(
  clientProfile: ClientProfile,
  quantifiedRecommendations: QuantifiedRecommendations,
  options: Stage4Options,
): Promise<Stage4Result | Stage4ResultFailed> {
  const startTime = Date.now();
  const kbPath = options.kbPath ?? DEFAULT_KB_PATH;
  const generatedDate = options.generatedDate ?? new Date();
  const firmPolicyResolutions = options.firmPolicyResolutions ?? [];
  const landmineAuthorizations = options.landmineAuthorizations ?? [];
  const maxRetries = options.maxRetries ?? 1;
  const maxAttempts = maxRetries + 1;
  const attemptHistory: AttemptHistoryEntry[] = [];

  const partialMetadata = (
    attemptsMade: number,
    inputTokens = 0,
    outputTokens = 0,
    cacheCreation = 0,
    cacheRead = 0,
  ): Partial<Stage4Metadata> => ({
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
    source_quantified_recommendations_hash: hashContent(
      JSON.stringify(quantifiedRecommendations),
    ),
    source_client_profile_hash: hashContent(JSON.stringify(clientProfile)),
  });

  // ────────────────────────────────────────────────────────────────────
  // Phase 1 — Deterministic context assembly
  // ────────────────────────────────────────────────────────────────────

  // 1.0 — Resolve advisor entry (override OR file lookup)
  let advisor: AdvisorEntry;
  if (options.advisorOverride) {
    advisor = {
      advisor_id: options.advisorOverride.advisor_id,
      full_name: options.advisorOverride.advisor_full_name,
      title: "Advisor",
      firm: options.advisorOverride.firm_name,
      supervisory_office_text: options.advisorOverride.supervisory_office,
      compliance_disclosure_short:
        options.advisorOverride.compliance_disclosure_short ??
        `Securities and investment advisory services offered through ${options.advisorOverride.firm_name}.`,
      email: null,
      phone: null,
    };
  } else {
    const advisorIdToLookup =
      options.advisorId ?? clientProfile.engagement.advisor_id;
    let advisorsFile;
    try {
      advisorsFile = await loadAdvisors(kbPath);
    } catch (err) {
      return makeFailure(
        "kb_load_failed",
        `Could not load advisors directory: ${(err as Error).message}`,
        { attempts_made: 0, kb_path_attempted: kbPath },
        partialMetadata(0),
      );
    }
    const found = findAdvisor(advisorsFile, advisorIdToLookup);
    if (!found) {
      return makeFailure(
        "advisor_lookup_failed",
        `Advisor '${advisorIdToLookup}' not found in advisors directory at ${kbPath}/02_reference/advisors.json`,
        {
          attempts_made: 0,
          advisor_id_attempted: advisorIdToLookup,
          kb_path_attempted: kbPath,
        },
        partialMetadata(0),
      );
    }
    advisor = found;
  }

  // 1.1 — Load voice calibration + system prompt + glossary terms
  let voiceCalibration: string;
  let systemPrompt: string;
  let glossaryTerms;
  try {
    voiceCalibration = await loadVoiceCalibration();
  } catch (err) {
    return makeFailure(
      "kb_load_failed",
      `Could not load voice calibration doc: ${(err as Error).message}`,
      { attempts_made: 0, kb_path_attempted: VOICE_CALIBRATION_PATH },
      partialMetadata(0),
    );
  }
  try {
    systemPrompt = await loadSystemPrompt();
  } catch (err) {
    return makeFailure(
      "kb_load_failed",
      `Could not load Stage 4 system prompt: ${(err as Error).message}`,
      { attempts_made: 0, kb_path_attempted: SYSTEM_PROMPT_PATH },
      partialMetadata(0),
    );
  }
  try {
    glossaryTerms = await loadGlossaryTerms(kbPath);
  } catch (err) {
    return makeFailure(
      "kb_load_failed",
      `Could not load glossary terms file: ${(err as Error).message}`,
      { attempts_made: 0, kb_path_attempted: kbPath },
      partialMetadata(0),
    );
  }

  // 1.2 — Compute Top 5 priorities
  const topPriorities = buildTopFivePriorities(quantifiedRecommendations);

  // 1.3 — Resolve archetype gating
  const archetype = clientProfile.engagement.archetype;
  const includeOptionalPreTransaction =
    ARCHETYPE_INCLUDES_OPTIONAL_PRE_TRANSACTION[archetype] ?? false;

  // 1.4 — Build deterministic sections (no LLM dependency)
  const complianceTrackingId =
    options.complianceTrackingId ??
    buildComplianceTrackingId(clientProfile, generatedDate);
  const titlePage = buildTitlePage(
    clientProfile,
    advisor,
    generatedDate,
    complianceTrackingId,
  );
  const clientSnapshot = buildClientSnapshot(clientProfile);
  const goalsPriorities = buildGoalsPriorities(clientProfile);
  const implementationRoadmap = buildImplementationRoadmap(quantifiedRecommendations);
  const decisionsNeeded = buildDecisionsNeeded(quantifiedRecommendations);
  const advisoryTeam = buildAdvisoryTeam(
    clientProfile,
    quantifiedRecommendations,
    advisor,
  );
  const meetingCadenceTable = buildMeetingCadenceTable();
  const disclosures = buildDisclosures(advisor, complianceTrackingId);
  // Glossary built in Phase 3 (depends on LLM prose).

  // 1.5 — Build per-pass user turns. Pass 1 receives the full ClientProfile;
  // Pass 2 receives the slimmed ClientProfile (Personal-lens only) per
  // Phase 3.2 Step 3 mitigation B. Each pass's body is built independently
  // so the CP shape can differ between them.
  const pass1Body = buildSharedUserTurnBody(
    voiceCalibration,
    clientProfile,
    quantifiedRecommendations,
    topPriorities,
    archetype,
    includeOptionalPreTransaction,
    firmPolicyResolutions,
    landmineAuthorizations,
    1,
  );
  const pass2Body = buildSharedUserTurnBody(
    voiceCalibration,
    clientProfile,
    quantifiedRecommendations,
    topPriorities,
    archetype,
    includeOptionalPreTransaction,
    firmPolicyResolutions,
    landmineAuthorizations,
    2,
  );
  const pass1UserTurn = buildPassUserTurn(pass1Body, PASS1_INSTRUCTION);
  const pass2UserTurn = buildPassUserTurn(pass2Body, PASS2_INSTRUCTION);

  // 1.6 — Pre-flight context-overflow check.
  // Two-tier check, applied per-pass:
  //   (a) chars/4 estimate for fast fail-fast (cheap, no API call). Checks
  //       Pass 1 only since it's the larger of the two passes (Pass 2's
  //       ClientProfile is slimmed via mitigation B).
  //   (b) Anthropic count_tokens API for accurate gating against the real
  //       200K context limit. Pass 1 and Pass 2 are gated independently —
  //       Pass 2 is smaller, but checking both is cheap insurance and
  //       provides better diagnostics.
  const pass1CharsOver4 =
    estimateTokens(pass1UserTurn) + estimateTokens(systemPrompt);
  if (pass1CharsOver4 > INPUT_TOKEN_CEILING_CHARS_OVER_4) {
    return makeFailure(
      "context_overflow",
      `Pass-1 chars/4 estimate (${pass1CharsOver4}) exceeds chars-over-4 ceiling (${INPUT_TOKEN_CEILING_CHARS_OVER_4}). Input too large; reduce QuantifiedRecommendations scope before retry.`,
      {
        attempts_made: 0,
        estimated_input_tokens: pass1CharsOver4,
      },
      partialMetadata(0),
    );
  }

  // Real-token pre-flight via Anthropic count_tokens API. Both passes
  // gated independently. Pass 1's gate fires immediately after its count
  // — if Pass 1 fails, we don't burn the second count_tokens call on Pass 2.
  let pass1RealTokens: number;
  try {
    const pass1Count = await options.apiClient.messages.countTokens({
      model: MODEL,
      system: [{ type: "text", text: systemPrompt }],
      messages: [{ role: "user", content: pass1UserTurn }],
      tools: [
        {
          name: STAGE4_TOOL_NAME_PASS1,
          description: STAGE4_PASS1_TOOL_DESCRIPTION,
          input_schema:
            STAGE4_PASS1_TOOL_INPUT_SCHEMA as Anthropic.Tool.InputSchema,
        },
      ],
    });
    pass1RealTokens = pass1Count.input_tokens;
  } catch (err) {
    return makeFailure(
      "api_error",
      `Anthropic count_tokens API call failed during Pass-1 pre-flight: ${(err as Error).message}`,
      {
        api_error: (err as Error).message,
        attempts_made: 0,
      },
      partialMetadata(0),
    );
  }
  if (pass1RealTokens > INPUT_TOKEN_CEILING_REAL) {
    return makeFailure(
      "context_overflow",
      `Pass-1 real-token count (${pass1RealTokens}) exceeds ceiling (${INPUT_TOKEN_CEILING_REAL}). With ${MAX_TOKENS} output budget per pass, total in-flight would breach Anthropic's 200K context limit. Reduce QuantifiedRecommendations scope or further trim Stage4LlmInput before retry.`,
      {
        attempts_made: 0,
        estimated_input_tokens: pass1RealTokens,
      },
      partialMetadata(0),
    );
  }

  let pass2RealTokens: number;
  try {
    const pass2Count = await options.apiClient.messages.countTokens({
      model: MODEL,
      system: [{ type: "text", text: systemPrompt }],
      messages: [{ role: "user", content: pass2UserTurn }],
      tools: [
        {
          name: STAGE4_TOOL_NAME_PASS2,
          description: STAGE4_PASS2_TOOL_DESCRIPTION,
          input_schema:
            STAGE4_PASS2_TOOL_INPUT_SCHEMA as Anthropic.Tool.InputSchema,
        },
      ],
    });
    pass2RealTokens = pass2Count.input_tokens;
  } catch (err) {
    return makeFailure(
      "api_error",
      `Anthropic count_tokens API call failed during Pass-2 pre-flight: ${(err as Error).message}`,
      {
        api_error: (err as Error).message,
        attempts_made: 0,
      },
      partialMetadata(0),
    );
  }
  if (pass2RealTokens > INPUT_TOKEN_CEILING_REAL) {
    return makeFailure(
      "context_overflow",
      `Pass-2 real-token count (${pass2RealTokens}) exceeds ceiling (${INPUT_TOKEN_CEILING_REAL}). With ${MAX_TOKENS} output budget per pass, total in-flight would breach Anthropic's 200K context limit. Reduce QuantifiedRecommendations scope or further trim Stage4LlmInput before retry.`,
      {
        attempts_made: 0,
        estimated_input_tokens: pass2RealTokens,
      },
      partialMetadata(0),
    );
  }

  // ────────────────────────────────────────────────────────────────────
  // Phase 2 — Two-pass LLM execution
  //
  // Pass 1: framing + Business lens (executive_summary, our_process,
  //   findings_observations, recommendations_business, meeting_cadence_intro).
  // Pass 2: Personal lens (recommendations_personal).
  //
  // Each pass uses the same cached system prompt + voice calibration block,
  // which preserves voice consistency and benefits from prompt-cache reuse.
  // The two passes differ only in tool definition + tool_choice + a one-line
  // user-turn instruction. Per-pass retry logic is encapsulated in
  // runStage4LlmPass(); this section orchestrates the two calls and merges
  // their outputs.
  // ────────────────────────────────────────────────────────────────────

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheCreation = 0;
  let totalCacheRead = 0;

  // Pass 1 — Framing + Business lens.
  const pass1Result = await runStage4LlmPass<Stage4Pass1Output>({
    passLabel: "pass1",
    passSchema: Stage4Pass1OutputSchema,
    toolName: STAGE4_TOOL_NAME_PASS1,
    toolDescription: STAGE4_PASS1_TOOL_DESCRIPTION,
    toolInputSchema: STAGE4_PASS1_TOOL_INPUT_SCHEMA,
    initialUserTurn: pass1UserTurn,
    systemPrompt,
    apiClient: options.apiClient,
    maxAttempts,
    attemptHistory,
    archetypeValidator: (data) =>
      validateArchetypeGatingSections(
        data.recommendations_business.sections,
        archetype,
        includeOptionalPreTransaction,
      ).errors,
  });
  totalInputTokens += pass1Result.inputTokens;
  totalOutputTokens += pass1Result.outputTokens;
  totalCacheCreation += pass1Result.cacheCreation;
  totalCacheRead += pass1Result.cacheRead;

  if (pass1Result.output === null) {
    // Pass 1 failed; do not attempt Pass 2 (it would either hit the same
    // failure or compound the cost without recovering Pass 1's output).
    const partial = partialMetadata(
      maxAttempts,
      totalInputTokens,
      totalOutputTokens,
      totalCacheCreation,
      totalCacheRead,
    );
    if (pass1Result.contextOverflow) {
      return makeFailure(
        "context_overflow",
        pass1Result.contextOverflow.reason,
        { attempts_made: maxAttempts },
        partial,
      );
    }
    if (pass1Result.apiError) {
      return makeFailure(
        "api_error",
        `Pass 1 Anthropic API call failed: ${pass1Result.apiError.message}`,
        { api_error: pass1Result.apiError.message, attempts_made: maxAttempts },
        partial,
      );
    }
    if (pass1Result.lastValidationFailure) {
      const lvf = pass1Result.lastValidationFailure;
      if (maxAttempts > 1) {
        return makeFailure(
          "max_retries_exceeded",
          `[pass1] All ${maxAttempts} attempts failed; last failure was schema_validation_failed.`,
          {
            attempts_made: maxAttempts,
            last_failure_type: "schema_validation_failed",
            raw_response: lvf.raw_response,
            validation_errors: lvf.validation_errors,
            parsed_response: lvf.parsed_response,
          },
          partial,
        );
      }
      return makeFailure(
        "schema_validation_failed",
        "[pass1] Model response did not match Stage4Pass1OutputSchema.",
        {
          validation_errors: lvf.validation_errors,
          parsed_response: lvf.parsed_response,
          raw_response: lvf.raw_response,
          attempts_made: maxAttempts,
        },
        partial,
      );
    }
    return makeFailure(
      "max_retries_exceeded",
      "[pass1] retry loop exited without recording a failure — unreachable in normal flow.",
      { attempts_made: maxAttempts },
      partial,
    );
  }

  // Pass 2 — Personal lens.
  const pass2Result = await runStage4LlmPass<Stage4Pass2Output>({
    passLabel: "pass2",
    passSchema: Stage4Pass2OutputSchema,
    toolName: STAGE4_TOOL_NAME_PASS2,
    toolDescription: STAGE4_PASS2_TOOL_DESCRIPTION,
    toolInputSchema: STAGE4_PASS2_TOOL_INPUT_SCHEMA,
    initialUserTurn: pass2UserTurn,
    systemPrompt,
    apiClient: options.apiClient,
    maxAttempts,
    attemptHistory,
    archetypeValidator: (data) =>
      validateArchetypeGatingSections(
        data.recommendations_personal.sections,
        archetype,
        includeOptionalPreTransaction,
      ).errors,
  });
  totalInputTokens += pass2Result.inputTokens;
  totalOutputTokens += pass2Result.outputTokens;
  totalCacheCreation += pass2Result.cacheCreation;
  totalCacheRead += pass2Result.cacheRead;

  if (pass2Result.output === null) {
    // Pass 2 failed after Pass 1 succeeded. Pass 1's output is preserved in
    // attempt_history for diagnostic purposes but the result is FAILED —
    // the plan is incomplete without the Personal lens.
    const partial = partialMetadata(
      attemptHistory.length,
      totalInputTokens,
      totalOutputTokens,
      totalCacheCreation,
      totalCacheRead,
    );
    if (pass2Result.contextOverflow) {
      return makeFailure(
        "context_overflow",
        pass2Result.contextOverflow.reason,
        { attempts_made: attemptHistory.length },
        partial,
      );
    }
    if (pass2Result.apiError) {
      return makeFailure(
        "api_error",
        `Pass 2 Anthropic API call failed: ${pass2Result.apiError.message}`,
        {
          api_error: pass2Result.apiError.message,
          attempts_made: attemptHistory.length,
        },
        partial,
      );
    }
    if (pass2Result.lastValidationFailure) {
      const lvf = pass2Result.lastValidationFailure;
      if (maxAttempts > 1) {
        return makeFailure(
          "max_retries_exceeded",
          `[pass2] All ${maxAttempts} attempts failed; last failure was schema_validation_failed.`,
          {
            attempts_made: attemptHistory.length,
            last_failure_type: "schema_validation_failed",
            raw_response: lvf.raw_response,
            validation_errors: lvf.validation_errors,
            parsed_response: lvf.parsed_response,
          },
          partial,
        );
      }
      return makeFailure(
        "schema_validation_failed",
        "[pass2] Model response did not match Stage4Pass2OutputSchema.",
        {
          validation_errors: lvf.validation_errors,
          parsed_response: lvf.parsed_response,
          raw_response: lvf.raw_response,
          attempts_made: attemptHistory.length,
        },
        partial,
      );
    }
    return makeFailure(
      "max_retries_exceeded",
      "[pass2] retry loop exited without recording a failure — unreachable in normal flow.",
      { attempts_made: attemptHistory.length },
      partial,
    );
  }

  // Merge Pass 1 + Pass 2 into the unified Stage4LlmRawOutput shape that
  // the rest of the post-LLM logic expects.
  const resolvedLlmOutput: Stage4LlmRawOutput = {
    executive_summary: pass1Result.output.executive_summary,
    our_process: pass1Result.output.our_process,
    findings_observations: pass1Result.output.findings_observations,
    recommendations_business: pass1Result.output.recommendations_business,
    recommendations_personal: pass2Result.output.recommendations_personal,
    meeting_cadence_intro: pass1Result.output.meeting_cadence_intro,
  };

  // ────────────────────────────────────────────────────────────────────
  // Phase 3 — Post-LLM stitching
  // ────────────────────────────────────────────────────────────────────

  // 3.1 — Cross-reference resolution
  const { stripped, unresolved } = resolveAndStripCrossReferences(resolvedLlmOutput);

  // 3.2 — Glossary auto-extraction
  const proseText = extractAllProseFromLlmOutput(stripped);
  const { glossary, termsUsed } = buildGlossarySubset(proseText, glossaryTerms);

  // 3.3 — Number-drift finalization (soft + any remaining hard drifts that
  // survived the retry path on the final attempt)
  const finalDrifts = detectAllNumbersDrift(quantifiedRecommendations, stripped);

  // 3.4 — Archetype-gating flags
  const gatingFlags = validateArchetypeGating(
    stripped,
    archetype,
    includeOptionalPreTransaction,
  );

  // 3.5 — Build flags + metadata
  const flags: Stage4Flags = {
    numbers_drift: finalDrifts,
    unresolved_cross_references: unresolved,
    glossary_terms_used: termsUsed,
    conditional_sections_omitted: gatingFlags.conditionalOmitted,
    optional_sections_included: gatingFlags.optionalIncluded,
  };

  const metadata: Stage4Metadata = {
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
    source_quantified_recommendations_hash: hashContent(
      JSON.stringify(quantifiedRecommendations),
    ),
    source_client_profile_hash: hashContent(JSON.stringify(clientProfile)),
  };

  // 3.6 — Return Stage4Result with LLM sections + deterministic sections.
  // The Top 5 from the deterministic builder is the source of truth; we
  // overwrite the LLM's top_priorities array with the deterministic result
  // (the LLM may have rephrased descriptors, but rank order and impact
  // figures must come from the deterministic pre-compute).
  const executiveSummaryWithDeterministicTop5 = {
    ...stripped.executive_summary,
    top_priorities: topPriorities,
  };

  return {
    llm_sections: {
      executive_summary: executiveSummaryWithDeterministicTop5,
      our_process: stripped.our_process,
      findings_observations: stripped.findings_observations,
      recommendations_business: stripped.recommendations_business,
      recommendations_personal: stripped.recommendations_personal,
      meeting_cadence_intro: stripped.meeting_cadence_intro,
    },
    deterministic_sections: {
      title_page: titlePage,
      client_snapshot: clientSnapshot,
      goals_priorities: goalsPriorities,
      implementation_roadmap: implementationRoadmap,
      decisions_needed: decisionsNeeded,
      advisory_team: advisoryTeam,
      meeting_cadence_table: meetingCadenceTable,
      glossary,
      disclosures,
    },
    _flags: flags,
    _metadata: metadata,
  };
}

export { isStage4ResultFailed };
