// Stage 4 — Plan Generator output schema.
//
// Stage 4 takes a QuantifiedRecommendations (Stage 3a output) plus ClientProfile
// and produces a complete Stage4Result carrying all 14 sections of a PSA Wealth
// financial plan. Six sections are LLM-generated narrative; eight are
// deterministic template-driven assemblies. The output is the canonical
// artifact that downstream PDF rendering consumes.
//
// Per spec Flagged Decision #11: Stage4Result and Stage4ResultFailed types live
// here (not in pipelineTypes.ts) to keep cross-stage shared types focused.
//
// Schema is generated via Zod 4 native z.toJSONSchema() with allOf+if/then
// injection for cross-field invariants — same pattern as Stage 3a.1.

import { z } from "zod";
import type { StageMetadata, AttemptHistoryEntry } from "./clientProfile";

// ────────────────────────────────────────────────────────────────────────
// Section ID space — stable, pipeline-wide, hardcoded.
// LLM emits cross_references against this ID space.
// ────────────────────────────────────────────────────────────────────────

export const STAGE4_SECTION_IDS = [
  "T",     // Title page
  "ES",    // Executive Summary
  "OP",    // Our Process
  "CS",    // Client Snapshot
  "GP",    // Goals & Priorities
  "FO",    // Findings & Observations
  "RB.1", "RB.2", "RB.3", "RB.4", "RB.5", "RB.6", "RB.7",  // Recommendations — Business
  "RP.8", "RP.9", "RP.10", "RP.11", "RP.12",  // Recommendations — Personal
  "IR",    // Implementation Roadmap
  "DN",    // Decisions Needed
  "AT",    // Advisory Team
  "MC",    // Meeting Cadence
  "GL",    // Glossary
  "DS",    // Disclosures
] as const;

export type Stage4SectionId = (typeof STAGE4_SECTION_IDS)[number];

const Stage4SectionIdEnum = z.enum(STAGE4_SECTION_IDS);

// ────────────────────────────────────────────────────────────────────────
// Section labels (the bracketed-label categories from voice calibration)
// ────────────────────────────────────────────────────────────────────────

export const SECTION_LABEL_CORE = "[CORE SECTION]" as const;
export const SECTION_LABEL_OPTIONAL_PRE_TRANSACTION =
  "[OPTIONAL — included because of pre-transaction posture]" as const;
export const SECTION_LABEL_PERSONAL = "[PERSONAL — for owner(s)]" as const;
export const SECTION_LABEL_OPTIONAL_CHILDREN =
  "[OPTIONAL — included because of three children at planning-relevant ages]" as const;

const SectionLabelEnum = z.enum([
  SECTION_LABEL_CORE,
  SECTION_LABEL_OPTIONAL_PRE_TRANSACTION,
  SECTION_LABEL_PERSONAL,
  SECTION_LABEL_OPTIONAL_CHILDREN,
]);

export type SectionLabel = z.infer<typeof SectionLabelEnum>;

// ────────────────────────────────────────────────────────────────────────
// Closer-paragraph label enum (limited set per voice calibration)
// ────────────────────────────────────────────────────────────────────────

const CloserLabelEnum = z.enum([
  "Why this sequence matters",
  "Quantified impact",
  "Combined estate impact",
  "Why the range is wide",
  "What this means",
]);

export type CloserLabel = z.infer<typeof CloserLabelEnum>;

// ────────────────────────────────────────────────────────────────────────
// Cross-reference shape — emitted by LLM, validated post-LLM
// ────────────────────────────────────────────────────────────────────────

const CrossReferenceSchema = z.object({
  target_section_id: Stage4SectionIdEnum,
  display_text: z.string().min(1).max(120),
});
export type CrossReference = z.infer<typeof CrossReferenceSchema>;

// ────────────────────────────────────────────────────────────────────────
// Recommendation bullet — `• **Bold imperative.** Briefing.`
// ────────────────────────────────────────────────────────────────────────

const RecommendationBulletSchema = z.object({
  bold_imperative: z.string().min(1).max(120),
  briefing: z.string().min(1),
  partner_role: z.string().nullable(),
  source_action_item_ids: z.array(z.string()),
});
export type RecommendationBullet = z.infer<typeof RecommendationBulletSchema>;

// ────────────────────────────────────────────────────────────────────────
// Recommendation subsection (e.g., "3A. Implement This Year")
// ────────────────────────────────────────────────────────────────────────

const RecommendationSubsectionSchema = z.object({
  heading: z.string().min(1),
  intro: z.string().nullable(),
  bullets: z.array(RecommendationBulletSchema),
});
export type RecommendationSubsection = z.infer<typeof RecommendationSubsectionSchema>;

// ────────────────────────────────────────────────────────────────────────
// Closer paragraph — null OR { label, body }
// ────────────────────────────────────────────────────────────────────────

const CloserParagraphSchema = z.object({
  label: CloserLabelEnum,
  body: z.string().min(1),
});
export type CloserParagraph = z.infer<typeof CloserParagraphSchema>;

// ────────────────────────────────────────────────────────────────────────
// Recommendation section — the main repeating unit (sections 1-7 business,
// 8-12 personal). Either has subsections OR direct bullets, not both.
// ────────────────────────────────────────────────────────────────────────

const RecommendationSectionSchema = z
  .object({
    section_id: Stage4SectionIdEnum,
    numbered_heading: z.string().min(1),
    label: SectionLabelEnum,
    source_rec_ids: z.array(z.string()).min(1),
    intro_paragraph: z.string().min(1),
    subsections: z.array(RecommendationSubsectionSchema).nullable(),
    recommendations_bullets: z.array(RecommendationBulletSchema),
    closer_paragraph: CloserParagraphSchema.nullable(),
    cross_references: z.array(CrossReferenceSchema),
  })
  .superRefine((sec, ctx) => {
    // section_id must be in the RB.* or RP.* range for recommendation sections.
    if (
      !sec.section_id.startsWith("RB.") &&
      !sec.section_id.startsWith("RP.")
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `RecommendationSection.section_id must be in RB.1-7 or RP.8-12 range; got '${sec.section_id}'.`,
      });
    }
    // Either subsections OR direct bullets carry content. If subsections is
    // null, recommendations_bullets must be non-empty. If subsections is
    // non-empty, recommendations_bullets MAY be empty (the subsections
    // carry the bullets).
    if (
      sec.subsections === null &&
      sec.recommendations_bullets.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "RecommendationSection invariant: when subsections is null, recommendations_bullets must be non-empty.",
      });
    }
  });
export type RecommendationSection = z.infer<typeof RecommendationSectionSchema>;

// ────────────────────────────────────────────────────────────────────────
// Recommendations lens (Business or Personal) — wrapper around sections
// ────────────────────────────────────────────────────────────────────────

const RecommendationsLensSchema = z.object({
  intro_paragraph: z.string().min(1),
  sections: z.array(RecommendationSectionSchema).min(1).max(7),
});
export type RecommendationsLens = z.infer<typeof RecommendationsLensSchema>;

// ────────────────────────────────────────────────────────────────────────
// Executive Summary — Top 5 Priorities table is deterministic; the LLM
// produces the prose surrounding it (two-themes + closer).
// ────────────────────────────────────────────────────────────────────────

const TopPriorityRowSchema = z.object({
  rank: z.number().int().positive().max(5),
  descriptor: z.string().min(1),
  estimated_impact_text: z.string().min(1),
  timing_text: z.string().min(1),
});
export type TopPriorityRow = z.infer<typeof TopPriorityRowSchema>;

const ExecutiveSummarySchema = z.object({
  opening_paragraph: z.string().min(1),
  two_themes_paragraph: z.string().min(1),
  top_priorities: z.array(TopPriorityRowSchema).min(1).max(5),
  what_this_means_closer: z.string().min(1),
});
export type ExecutiveSummary = z.infer<typeof ExecutiveSummarySchema>;

// ────────────────────────────────────────────────────────────────────────
// Our Process — fixed-shape narrative page
// ────────────────────────────────────────────────────────────────────────

const ProcessStageSchema = z.object({
  number: z.number().int().min(1).max(4),
  name: z.string().min(1),
  body: z.string().min(1),
});

const OurProcessSchema = z.object({
  intro_paragraph: z.string().min(1),
  stages: z.array(ProcessStageSchema).length(4),
  how_to_read_paragraph: z.string().min(1),
});
export type OurProcess = z.infer<typeof OurProcessSchema>;

// ────────────────────────────────────────────────────────────────────────
// Findings & Observations — Strengths + Opportunities by category
// ────────────────────────────────────────────────────────────────────────

const StrengthEntrySchema = z.object({
  body: z.string().min(1),
});

const OpportunityCategoryGroupSchema = z.object({
  category: z.string().min(1),
  bullets: z.array(z.string().min(1)).min(1),
});

const FindingsObservationsSchema = z.object({
  intro_paragraph: z.string().min(1),
  strengths: z.array(StrengthEntrySchema).min(4).max(8),
  opportunities: z.array(OpportunityCategoryGroupSchema).min(1),
});
export type FindingsObservations = z.infer<typeof FindingsObservationsSchema>;

// ────────────────────────────────────────────────────────────────────────
// Meeting Cadence intro — narrative that precedes the (deterministic) table
// ────────────────────────────────────────────────────────────────────────

const MeetingCadenceIntroSchema = z.object({
  intro_paragraph: z.string().min(1),
  immediate_next_steps: z.array(z.string().min(1)).min(2).max(6),
});
export type MeetingCadenceIntro = z.infer<typeof MeetingCadenceIntroSchema>;

// ────────────────────────────────────────────────────────────────────────
// LLM-emitted top-level shape (Stage4LlmRawOutputSchema)
//
// Phase 3.2 Step 3 architecture revision: Stage 4 now uses a two-pass
// architecture because Holloway's 81 recs × 14 sections exceed the 32K
// MAX_TOKENS output ceiling in a single call. Pass 1 emits framing + the
// Business lens (RB.1-7); Pass 2 emits the Personal lens (RP.8-12). The
// post-LLM merge produces this same Stage4LlmRawOutput shape downstream
// validation expects, so cross-ref resolution / glossary / number-drift /
// archetype-gating logic is unchanged.
// ────────────────────────────────────────────────────────────────────────

export const Stage4LlmRawOutputSchema = z.object({
  executive_summary: ExecutiveSummarySchema,
  our_process: OurProcessSchema,
  findings_observations: FindingsObservationsSchema,
  recommendations_business: RecommendationsLensSchema,
  recommendations_personal: RecommendationsLensSchema,
  meeting_cadence_intro: MeetingCadenceIntroSchema,
});

export type Stage4LlmRawOutput = z.infer<typeof Stage4LlmRawOutputSchema>;

// Pass 1 — Framing + Business lens (5 of the 6 LLM-generated sections).
export const Stage4Pass1OutputSchema = z.object({
  executive_summary: ExecutiveSummarySchema,
  our_process: OurProcessSchema,
  findings_observations: FindingsObservationsSchema,
  recommendations_business: RecommendationsLensSchema,
  meeting_cadence_intro: MeetingCadenceIntroSchema,
});
export type Stage4Pass1Output = z.infer<typeof Stage4Pass1OutputSchema>;

// Pass 2 — Personal lens only.
export const Stage4Pass2OutputSchema = z.object({
  recommendations_personal: RecommendationsLensSchema,
});
export type Stage4Pass2Output = z.infer<typeof Stage4Pass2OutputSchema>;

// ────────────────────────────────────────────────────────────────────────
// Deterministic section types — built by stage4Builders.ts
// ────────────────────────────────────────────────────────────────────────

export interface AdvisorEntry {
  advisor_id: string;
  full_name: string;
  title: string;
  firm: string;
  supervisory_office_text: string;
  compliance_disclosure_short: string;
  email: string | null;
  phone: string | null;
}

export interface AdvisorsFile {
  advisors: AdvisorEntry[];
  _metadata: {
    schema_version: string;
    purpose: string;
  };
}

export interface GlossaryTerm {
  term: string;
  acronym: string | null;
  plain_english_definition: string;
}

export interface TitlePage {
  client_full_name: string;
  spouse_full_name: string | null;
  business_name: string | null;
  ownership_summary: string | null;
  prepared_date: string;       // ISO date string
  prepared_by_name: string;
  prepared_by_firm: string;
  compliance_tracking_id: string;
}

export interface ClientSnapshotEntityRow {
  business_name: string;
  entity_type: string;
  ownership: string;
  industry_or_operations: string | null;
}

export interface ClientSnapshotRevenueRow {
  year: string;
  revenue_text: string;
  ebitda_text: string | null;
}

export interface ClientSnapshotCoverageRow {
  category: string;
  in_place: string;
  notes: string;
}

export interface ClientSnapshot {
  entity: ClientSnapshotEntityRow | null;
  revenue_profit_table: ClientSnapshotRevenueRow[];
  valuation_text: string | null;
  why_range_wide_text: string | null;
  coverage_table: ClientSnapshotCoverageRow[];
}

export interface GoalRow {
  number: number;
  goal_name: string;
  what_this_means_in_practice: string;
}

export interface GoalsPriorities {
  intro_paragraph: string;
  goals: GoalRow[];
}

export interface RoadmapRow {
  action: string;
  timing_bucket: string;
  owner: string;
  status: "Not Started" | "In Progress" | "Pending Decision" | "Complete";
  source_action_item_id: string;
  source_recommendation_id: string;
}

export interface RoadmapBucketGroup {
  timing_bucket: string;        // e.g., "0-30 days"
  bucket_label: string;          // e.g., "0–30 Days │ Foundations"
  rows: RoadmapRow[];
}

export interface ImplementationRoadmap {
  intro_paragraph: string;
  groups: RoadmapBucketGroup[];
  total_action_count: number;
}

export interface DecisionsNeededRow {
  number: number;
  decision_question: string;
  recommended_path: string;
  decision_needed_by: string;
  source_recommendation_id: string;
}

export interface DecisionsNeeded {
  intro_paragraph: string;
  rows: DecisionsNeededRow[];
}

export interface AdvisoryTeamRow {
  role: string;
  firm_or_contact: string;
  notes: string;
  is_tbd: boolean;
}

export interface AdvisoryTeam {
  intro_paragraph: string;
  rows: AdvisoryTeamRow[];
}

export interface MeetingCadenceTableRow {
  meeting_name: string;
  frequency: string;
  agenda: string;
}

export interface MeetingCadenceTable {
  rows: MeetingCadenceTableRow[];
}

export interface GlossaryEntry {
  term: string;
  acronym: string | null;
  plain_english_definition: string;
}

export interface Glossary {
  intro_paragraph: string;
  entries: GlossaryEntry[];
}

export interface Disclosures {
  body_paragraphs: string[];
  compliance_tracking_id: string;
}

// ────────────────────────────────────────────────────────────────────────
// Stage4Flags — soft warnings + observability surface
// ────────────────────────────────────────────────────────────────────────

export interface NumbersDriftEntry {
  rec_id: string;
  expected: string;
  emitted: string;
  severity: "soft" | "hard";
}

export interface UnresolvedCrossReference {
  source_section_id: string;
  target_section_id: string;
  display_text: string;
}

export interface ConditionalSectionOmitted {
  section_id: string;
  reason: string;
}

export interface OptionalSectionIncluded {
  section_id: string;
  archetype: string;
}

export interface Stage4Flags {
  numbers_drift: NumbersDriftEntry[];
  unresolved_cross_references: UnresolvedCrossReference[];
  glossary_terms_used: string[];
  conditional_sections_omitted: ConditionalSectionOmitted[];
  optional_sections_included: OptionalSectionIncluded[];
}

// ────────────────────────────────────────────────────────────────────────
// Stage4Metadata — extends StageMetadata with Stage 4 specifics
// ────────────────────────────────────────────────────────────────────────

export interface Stage4Metadata extends StageMetadata {
  // Inherits stage_version, model_used, input/output token counts,
  // cache_creation/cache_read input tokens, attempts_made, attempt_history,
  // duration_ms, source_fr_content_hash, parsed_at.
  source_quantified_recommendations_hash: string;
  source_client_profile_hash: string;
  cost_cents: number;
}

// ────────────────────────────────────────────────────────────────────────
// Stage4Result — the canonical envelope
// ────────────────────────────────────────────────────────────────────────

export interface Stage4Result {
  llm_sections: {
    executive_summary: ExecutiveSummary;
    our_process: OurProcess;
    findings_observations: FindingsObservations;
    recommendations_business: RecommendationsLens;
    recommendations_personal: RecommendationsLens;
    meeting_cadence_intro: MeetingCadenceIntro;
  };
  deterministic_sections: {
    title_page: TitlePage;
    client_snapshot: ClientSnapshot;
    goals_priorities: GoalsPriorities;
    implementation_roadmap: ImplementationRoadmap;
    decisions_needed: DecisionsNeeded;
    advisory_team: AdvisoryTeam;
    meeting_cadence_table: MeetingCadenceTable;
    glossary: Glossary;
    disclosures: Disclosures;
  };
  _flags: Stage4Flags;
  _metadata: Stage4Metadata;
}

export type Stage4FailureType =
  | "kb_load_failed"
  | "schema_validation_failed"
  | "api_error"
  | "max_retries_exceeded"
  | "context_overflow"
  | "client_profile_invalid"
  | "advisor_lookup_failed";

export interface Stage4ResultFailed {
  _stage_status: "FAILED";
  _failure_type: Stage4FailureType;
  _failure_reason: string;
  _failure_context: {
    validation_errors?: string[];
    raw_response?: string;
    parsed_response?: unknown;
    api_error?: string;
    attempts_made: number;
    estimated_input_tokens?: number;
    last_failure_type?: "schema_validation_failed";
    advisor_id_attempted?: string;
    kb_path_attempted?: string;
  };
  _metadata: Partial<Stage4Metadata>;
}

export function isStage4ResultFailed(
  r: Stage4Result | Stage4ResultFailed,
): r is Stage4ResultFailed {
  return (r as Stage4ResultFailed)._stage_status === "FAILED";
}

// ────────────────────────────────────────────────────────────────────────
// JSON Schema for Anthropic tool use.
//
// Generated via Zod 4 native z.toJSONSchema() with allOf+if/then injection
// for cross-field invariants — same pattern as Stage 3a.1.
// ────────────────────────────────────────────────────────────────────────

type JsonSchemaObject = {
  type?: string;
  properties?: Record<string, JsonSchemaObject>;
  items?: JsonSchemaObject;
  allOf?: unknown[];
  [k: string]: unknown;
};

// RecommendationSection has a cross-field invariant: when subsections is null,
// recommendations_bullets must be non-empty. We restore this as JSON Schema
// allOf+if/then so Anthropic's tool-use validator enforces it at protocol
// layer when possible (best-effort — Phase 3.1c learnings: Anthropic's
// validator honors structural rules but treats cross-field if/then as guidance,
// so the zod superRefine remains the hard gate).
const RECOMMENDATION_SECTION_INVARIANTS = [
  {
    if: { properties: { subsections: { type: "null" } } },
    then: {
      properties: {
        recommendations_bullets: { minItems: 1 },
      },
    },
  },
];

function buildToolInputSchemaFor(
  schema: z.ZodTypeAny,
  lensFields: string[],
): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { $schema, ...base } = z.toJSONSchema(schema) as Record<
    string,
    unknown
  > & { $schema?: string };
  const root = base as JsonSchemaObject;

  // Inject RecommendationSection invariants into present lenses.
  for (const lens of lensFields) {
    const lensSchema = root.properties?.[lens];
    const sectionItems = lensSchema?.properties?.sections?.items;
    if (sectionItems) {
      sectionItems.allOf = [
        ...(sectionItems.allOf ?? []),
        ...RECOMMENDATION_SECTION_INVARIANTS,
      ];
    }
  }

  return root as Record<string, unknown>;
}

// Legacy single-pass tool kept for backward compatibility with any caller
// that imports it (currently unused after Phase 3.2 Step 3 two-pass
// refactor). Pass 1 / Pass 2 schemas + tool names below are the active
// surface.
export const STAGE4_TOOL_INPUT_SCHEMA: Record<string, unknown> =
  buildToolInputSchemaFor(Stage4LlmRawOutputSchema, [
    "recommendations_business",
    "recommendations_personal",
  ]);

export const STAGE4_TOOL_NAME = "submit_plan_sections";
export const STAGE4_TOOL_DESCRIPTION =
  "Submit the six LLM-generated narrative sections of the financial plan. Call exactly once with all six sections populated. The schema enforces section structure, cross-reference targets in the stable section ID space, and recommendation-bullet shape — your input must satisfy all of them. Voice and reasoning quality are your responsibility.";

// Pass 1 — Framing + Business lens.
export const STAGE4_PASS1_TOOL_INPUT_SCHEMA: Record<string, unknown> =
  buildToolInputSchemaFor(Stage4Pass1OutputSchema, [
    "recommendations_business",
  ]);
export const STAGE4_TOOL_NAME_PASS1 = "submit_plan_sections_pass1";
export const STAGE4_PASS1_TOOL_DESCRIPTION =
  "Pass 1 of 2: submit the framing + Business-lens sections of the plan. Sections required: executive_summary, our_process, findings_observations, recommendations_business (RB.1-RB.7), meeting_cadence_intro. The Personal lens (RP.8-RP.12) is generated in Pass 2 — do NOT emit recommendations_personal here. Call exactly once.";

// Pass 2 — Personal lens.
export const STAGE4_PASS2_TOOL_INPUT_SCHEMA: Record<string, unknown> =
  buildToolInputSchemaFor(Stage4Pass2OutputSchema, [
    "recommendations_personal",
  ]);
export const STAGE4_TOOL_NAME_PASS2 = "submit_plan_sections_pass2";
export const STAGE4_PASS2_TOOL_DESCRIPTION =
  "Pass 2 of 2: submit the Personal-lens sections of the plan. The framing sections + Business lens are already produced in Pass 1; this call emits ONLY recommendations_personal (sections RP.8-RP.12, [PERSONAL — for owner(s)] label). Call exactly once.";

// ────────────────────────────────────────────────────────────────────────
// Stage4LlmInput — the trimmed projection of QuantifiedRecommendations
// sent to the LLM in the user turn.
//
// **Purpose.** The full QuantifiedRecommendations envelope is ~148K tokens
// at Holloway scale (81 recs, 380 ActionItems). Combined with the voice
// calibration doc, ClientProfile, and system prompt, this exceeds the
// pre-flight 150K ceiling. The diagnosis at
// `specs/stages/stage4_input_trim_diagnosis.md` identified ~29K tokens of
// fields that the LLM does not narrate from. This shape projects only the
// fields the LLM actually reads.
//
// **Critical:** This is a TYPE ONLY, not a Zod schema. The trim is a
// projection applied inside `buildUserTurn()` before serialization. The
// deterministic builders (`buildImplementationRoadmap`, `buildDecisionsNeeded`,
// `buildAdvisoryTeam`, `buildTopFivePriorities`, drift detection) continue to
// read from the FULL QuantifiedRecommendations envelope passed into
// `generatePlan()` — they bypass this projection entirely.
//
// **Fields excluded from this shape (drop in trim):**
//   Per-recommendation:
//     - `source_file_path` (not narrated)
//     - `status` (not narrated)
//     - `position_in_sequence` (always 0 at Stage 3a)
//     - `owner_name` (always null at Stage 3a)
//     - `cluster_id` (always null at Stage 3a; Stage 3b assigns)
//     - `cluster_sequence_closer` (always null at Stage 3a)
//     - `match_strength` (not narrated)
//     - `_audit_notes` (output style pattern, not LLM input)
//     - `quantified_impact.formula_source_file` (not narrated)
//     - `quantified_impact.computation_inputs` (not cited by LLM in voice rules)
//   Per-action-item:
//     - `sub_steps` (Implementation Roadmap renders these from full envelope)
//     - `depends_on` (sequencing internal; not narrated)
//     - `auto_generated_reminder_template` (Tracker spawn metadata)
//     - `owner_name` (always null at Stage 3a)
//     - `parent_action_item_id` (always null at Stage 3a)
//     - `is_derivative_reminder` (always false at Stage 3a)
//     - `source_plan_id` (always null at Stage 3a)
//   Envelope-level:
//     - `_metadata` (Stage 3a aggregate, not narrative input)
//     - `_sequencer_flags` (Stage 3a observability)
//     - `_sequencer_status` / `_sequencer_failures` (failure paths only)
// ────────────────────────────────────────────────────────────────────────

import type {
  ActionOwner,
  CheckInCadence,
  DurationClass,
  FirmPolicyQuestionId,
  NumericValue,
  PartnerType,
  PlanSectionName,
  RecommendationCategory,
  ScenarioRange,
  TimingBucket,
} from "./pipelineTypes";

// AlternativeValue is an inline anonymous shape on QuantifiedImpact in
// pipelineTypes.ts; mirror it here so the trim projection has a stable type
// surface.
export interface Stage4LlmInputAlternativeValue {
  value: NumericValue;
  formula_variant: string;
  awaiting: FirmPolicyQuestionId | string;
  context: string;
}

export interface Stage4LlmInputBlockedInput {
  input_name: string;
  blocked_reason: string;
  source: string;
  would_unblock_when: string;
}

export interface Stage4LlmInputQuantifiedImpact {
  estimate: NumericValue | null;
  formula_id: string | null;
  // formula_source_file dropped — not narrated.
  // computation_inputs dropped — LLM doesn't cite specific named inputs;
  //   assumption phrasing comes from estimate.narrative_context.
  pending_reconciliation: boolean;
  alternative_values: Stage4LlmInputAlternativeValue[];
  qualitative_phrasing: string | null;
  reason_no_formula: string | null;
  blocked_inputs: Stage4LlmInputBlockedInput[];
}

export interface Stage4LlmInputActionItem {
  action_item_id: string;
  // description is OPTIONAL: kept for State A recs (estimate populated;
  // LLM narrates from action descriptions in the bullet briefings) but
  // dropped for State B/C/D recs (qualitative_phrasing carries the
  // primary narrative; description is redundant and costly at scale).
  // Phase 3.2 Step 3 mitigation A: ~10-15K real-token savings on Holloway
  // by dropping description from the ~30 non-State-A recs. The deterministic
  // Implementation Roadmap continues to render every action's description
  // verbatim from the full QuantifiedRecommendations envelope.
  description?: string;
  // sub_steps dropped — Implementation Roadmap renders these deterministically
  //   from the full envelope; the LLM doesn't enumerate sub-steps in bullets.
  category: RecommendationCategory;
  source_recommendation_id: string;
  source_phase_or_step: string;
  owner: ActionOwner;
  // owner_name dropped (always null at Stage 3a).
  timing_bucket: TimingBucket;
  // depends_on dropped — sequencing internal; not narrated.
  is_decision_needed: boolean;
  duration_class: DurationClass;
  check_in_cadence: CheckInCadence | null;
  partner_required: boolean;
  partner_type: PartnerType | null;
  // parent_action_item_id, is_derivative_reminder, source_plan_id dropped —
  //   always null/false at Stage 3a.
  // auto_generated_reminder_template dropped — Tracker spawn metadata; the
  //   LLM doesn't narrate trigger thresholds or template strings.
}

export interface Stage4LlmInputRec {
  recommendation_id: string;
  category: RecommendationCategory;
  // source_file_path dropped — not narrated.
  // status dropped — not narrated.
  // position_in_sequence dropped — always 0 at Stage 3a.
  plan_section: PlanSectionName | null;
  subsection_within_section: string | null;
  co_triggered_with: string[];
  quantified_impact: Stage4LlmInputQuantifiedImpact;
  scenario_range: ScenarioRange | null;
  timing_bucket: TimingBucket;
  owner: ActionOwner;
  // owner_name dropped (always null at Stage 3a).
  decisions_needed: boolean;
  // cluster_id, cluster_sequence_closer dropped — always null at Stage 3a.
  action_items: Stage4LlmInputActionItem[];
  landmine: boolean;
  landmine_status: string;
  default_excluded: boolean;
  plan_output_variant: "default_excluded" | "authorized" | null;
  // match_strength dropped — not narrated.
  // _audit_notes dropped — system prompt cites it as an OUTPUT pattern,
  //   not INPUT for LLM consumption. `buildDecisionsNeeded` still reads
  //   `_audit_notes` from the full envelope as a fallback for the
  //   recommended_path string.
}

export interface Stage4LlmInput {
  recommendations: Stage4LlmInputRec[];
  // Top-level _metadata, _sequencer_flags, _sequencer_status, _sequencer_failures
  //   all dropped — Stage 3a observability, not LLM narrative input.
}

// ────────────────────────────────────────────────────────────────────────
// Re-exports for convenience
// ────────────────────────────────────────────────────────────────────────

export type { StageMetadata, AttemptHistoryEntry };
