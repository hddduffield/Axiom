// Stage 5 — Coherence Auditor output schema.
//
// Stage 5 audits a fully-assembled Stage 4 plan for contradictions, voice
// drift, broken references, and compliance hygiene before the plan reaches
// advisor review. Stage 5 is FLAG-ONLY — it surfaces findings; it does NOT
// auto-fix or trigger Stage 4 regeneration.
//
// Per spec Flagged Decision #12: Stage5Result types live here (not in
// pipelineTypes.ts) to keep cross-stage shared types focused.
//
// Architecture: hybrid (deterministic-first DC.1-DC.10 + single LLM call
// for LC.1-LC.6). Tool-use enforcement matches Stage 3a.1 + Stage 4 patterns.
// JSON Schema generated via Zod 4 native z.toJSONSchema() with allOf+if/then
// injection for cross-field rules.

import { z } from "zod";
import type {
  ClientProfile,
  StageMetadata,
  AttemptHistoryEntry,
} from "./clientProfile";
import type {
  Stage4Result,
  TopPriorityRow,
  NumbersDriftEntry,
} from "./stage4.types";
import type {
  ArchetypeIdentifier,
  PlanSectionName,
  RecommendationCategory,
  TimingBucket,
  NumericValue,
} from "./pipelineTypes";

// ────────────────────────────────────────────────────────────────────────
// Severity + category enums
// ────────────────────────────────────────────────────────────────────────

const SeverityEnum = z.enum(["critical", "warning", "info"]);
export type SeverityLevel = z.infer<typeof SeverityEnum>;

const AuditCategoryEnum = z.enum([
  // Deterministic check categories (DC.1-DC.10)
  "DC1_unresolved_cross_refs",
  "DC2_roadmap_orphans",
  "DC3_top5_mismatch",
  "DC4_missing_decisions",
  "DC5_unused_glossary",
  "DC6_missing_sections",
  "DC7_archetype_violations",
  "DC8_unused_numbers",
  "DC9_compliance_issues",
  "DC10_lifecycle_violations",
  // LLM check categories (LC.1-LC.6)
  "LC1_voice_consistency",
  "LC2_numerical_contradictions",
  "LC3_strategic_coherence",
  "LC4_findings_alignment",
  "LC5_narrative_weaving",
  "LC6_voice_quality",
]);
export type AuditCategory = z.infer<typeof AuditCategoryEnum>;

const SuggestedActionEnum = z.enum([
  "regenerate_section",
  "regenerate_plan",
  "hand_edit",
  "verify_with_advisor",
  "informational_only",
]);
export type SuggestedAction = z.infer<typeof SuggestedActionEnum>;

const OverallAssessmentEnum = z.enum([
  "ship_ready",
  "review_recommended",
  "regenerate_recommended",
]);
export type OverallAssessment = z.infer<typeof OverallAssessmentEnum>;

// ────────────────────────────────────────────────────────────────────────
// AuditFinding — the unit of observation. Both deterministic checks and
// the LLM emit findings into the same shape, merged into a single sorted
// list in the final Stage5Result.
// ────────────────────────────────────────────────────────────────────────

const AuditFindingSchema = z
  .object({
    finding_id: z.string().min(1),
    severity: SeverityEnum,
    category: AuditCategoryEnum,
    section_ids: z.array(z.string().min(1)).max(20),
    description: z.string().min(1).max(800),
    // evidence capped at 500 chars per spec — long evidence dumps bloat the
    // output. The advisor's UI can fetch fuller context from source artifact.
    evidence: z.string().min(1).max(500),
    suggested_action: SuggestedActionEnum,
  })
  .superRefine((f, ctx) => {
    // Severity vs suggested_action consistency. An "info"-severity finding
    // should not pair with "regenerate_plan" (that's reserved for critical
    // structural failures). Catch the mismatch as a soft signal — the
    // advisor still gets the finding, but the harness flags the inconsistency.
    if (f.severity === "info" && f.suggested_action === "regenerate_plan") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "AuditFinding invariant: severity 'info' should not pair with suggested_action 'regenerate_plan'.",
      });
    }
  });

export type AuditFinding = z.infer<typeof AuditFindingSchema>;

// ────────────────────────────────────────────────────────────────────────
// LlmAssessment — the LLM's holistic vote. Harness's overall_assessment is
// authoritative; LLM's vote is captured here as advisory + flagged when
// they disagree (Stage5Flags.assessment_disagreement).
// ────────────────────────────────────────────────────────────────────────

const LlmAssessmentSchema = z.object({
  voice_consistency_score: z.number().min(0).max(100),
  contradiction_count: z.number().int().nonnegative(),
  llm_overall_assessment: OverallAssessmentEnum,
});
export type LlmAssessment = z.infer<typeof LlmAssessmentSchema>;

// ────────────────────────────────────────────────────────────────────────
// LLM-emitted top-level shape (Stage5LlmRawOutputSchema)
// ────────────────────────────────────────────────────────────────────────

export const Stage5LlmRawOutputSchema = z.object({
  // findings array — LLM contributes its own findings; deterministic findings
  // are merged in by the harness post-LLM.
  findings: z.array(AuditFindingSchema),
  llm_assessment: LlmAssessmentSchema,
});

export type Stage5LlmRawOutput = z.infer<typeof Stage5LlmRawOutputSchema>;

// ────────────────────────────────────────────────────────────────────────
// Deterministic check result types
// ────────────────────────────────────────────────────────────────────────

export interface UnresolvedCrossRefFinding {
  source_section_id: string;
  target_section_id: string;
  display_text: string;
}

export interface TopFiveMismatch {
  // Ranks (1-5) where the emitted Top 5 disagreed with the deterministic
  // ranking from buildTopFivePriorities(quantifiedRecommendations).
  mismatched_ranks: number[];
  deterministic: TopPriorityRow[];
  emitted: TopPriorityRow[];
}

export interface DeterministicCheckResults {
  DC1_unresolved_cross_refs: UnresolvedCrossRefFinding[];
  DC2_roadmap_orphans: { source_action_item_id: string; absent_from: "qr" }[];
  DC3_top5_mismatch: TopFiveMismatch | null;
  DC4_missing_decisions: string[]; // rec_ids missing from DN
  DC5_unused_glossary: string[]; // glossary terms not appearing in prose
  DC6_missing_sections: string[]; // section IDs missing from output
  DC7_archetype_violations: {
    section_id: string;
    label: string;
    reason: string;
  }[];
  DC8_unused_numbers: { rec_id: string; expected_value: string }[];
  DC9_compliance_issues: string[];
  DC10_lifecycle_violations: { action_item_id: string; rule: string }[];
}

// ────────────────────────────────────────────────────────────────────────
// Stage5Flags — observability surface
// ────────────────────────────────────────────────────────────────────────

export interface Stage5Flags {
  // Harness-computed overall_assessment differs from LLM's emitted vote.
  // Indicates calibration drift between deterministic severity counts and
  // the LLM's holistic judgment.
  assessment_disagreement: boolean;
  // True when runLlmChecks: false at invocation OR when the LLM phase was
  // skipped because the projected input still exceeded the pre-flight
  // ceiling (see llm_skipped_due_to_context_overflow). In both cases the
  // result has deterministic findings only and llm_assessment is null.
  llm_skipped: boolean;
  // True when the LLM phase was skipped specifically because the projected
  // Stage5LlmAuditInput exceeded the chars/4 or count_tokens ceiling. The
  // deterministic findings are still authoritative; the audit just couldn't
  // do LC.1–LC.6. Phase 3.3 Step 3 recovery: a too-large plan is a
  // soft-degrade, not a hard failure.
  llm_skipped_due_to_context_overflow: boolean;
  // Findings emitted with no clear suggested_action (e.g., LLM didn't pick).
  // Surfaced for advisor triage.
  unresolved_findings_count: number;
}

// ────────────────────────────────────────────────────────────────────────
// Stage5Metadata — extends StageMetadata with Stage 5 specifics
// ────────────────────────────────────────────────────────────────────────

export interface Stage5Metadata extends StageMetadata {
  cost_cents: number;
  source_stage4_result_hash: string;
  source_quantified_recommendations_hash: string;
  source_client_profile_hash: string;
}

// ────────────────────────────────────────────────────────────────────────
// Stage5Result — the canonical envelope
// ────────────────────────────────────────────────────────────────────────

export interface Stage5Result {
  // Merged + sorted: deterministic findings + LLM findings, sorted by
  // severity (critical → warning → info), then by category, then by
  // section_id for deterministic ordering.
  findings: AuditFinding[];
  deterministic_checks: DeterministicCheckResults;
  // null when runLlmChecks: false at invocation.
  llm_assessment: LlmAssessment | null;
  // Harness-computed (authoritative). LLM's vote is captured in
  // llm_assessment.llm_overall_assessment for cross-checking.
  overall_assessment: OverallAssessment;
  _flags: Stage5Flags;
  _metadata: Stage5Metadata;
}

export type Stage5FailureType =
  | "stage4_input_failed" // input was Stage4ResultFailed
  | "kb_load_failed"
  | "schema_validation_failed"
  | "api_error"
  | "max_retries_exceeded"
  | "context_overflow";

export interface Stage5ResultFailed {
  _stage_status: "FAILED";
  _failure_type: Stage5FailureType;
  _failure_reason: string;
  _failure_context: {
    validation_errors?: string[];
    raw_response?: string;
    parsed_response?: unknown;
    api_error?: string;
    attempts_made: number;
    estimated_input_tokens?: number;
    last_failure_type?: "schema_validation_failed";
    stage4_failure_type?: string;
    kb_path_attempted?: string;
  };
  _metadata: Partial<Stage5Metadata>;
}

export function isStage5ResultFailed(
  r: Stage5Result | Stage5ResultFailed,
): r is Stage5ResultFailed {
  return (r as Stage5ResultFailed)._stage_status === "FAILED";
}

// ────────────────────────────────────────────────────────────────────────
// JSON Schema for Anthropic tool use.
//
// Generated via Zod 4 native z.toJSONSchema() with allOf+if/then injection
// for the AuditFinding cross-field rule (severity 'info' must not pair
// with suggested_action 'regenerate_plan'). Same pattern as Stage 4.
// ────────────────────────────────────────────────────────────────────────

type JsonSchemaObject = {
  type?: string;
  properties?: Record<string, JsonSchemaObject>;
  items?: JsonSchemaObject;
  allOf?: unknown[];
  [k: string]: unknown;
};

const AUDIT_FINDING_INVARIANTS = [
  {
    if: { properties: { severity: { const: "info" } } },
    then: {
      properties: {
        suggested_action: { not: { const: "regenerate_plan" } },
      },
    },
  },
];

function buildToolInputSchema(): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { $schema, ...base } = z.toJSONSchema(Stage5LlmRawOutputSchema) as Record<
    string,
    unknown
  > & { $schema?: string };
  const root = base as JsonSchemaObject;

  // Inject AuditFinding invariants on the items shape.
  const findingItems = root.properties?.findings?.items;
  if (findingItems) {
    findingItems.allOf = [
      ...(findingItems.allOf ?? []),
      ...AUDIT_FINDING_INVARIANTS,
    ];
  }

  return root as Record<string, unknown>;
}

export const STAGE5_TOOL_INPUT_SCHEMA: Record<string, unknown> =
  buildToolInputSchema();

export const STAGE5_TOOL_NAME = "submit_audit_findings";
export const STAGE5_TOOL_DESCRIPTION =
  "Submit audit findings + holistic assessment for this plan. Call exactly once. Each finding has severity (critical/warning/info), category (LC.1-LC.6), affected section IDs, description, evidence (verbatim quote from prose, ≤ 500 chars), and suggested action. Voice and reasoning quality of the audit is your responsibility — flag real issues, not stylistic preferences.";

// ────────────────────────────────────────────────────────────────────────
// Stage5LlmAuditInput — the trimmed projection of audit inputs that the
// LLM sees in the user turn.
//
// **Purpose.** The full Stage 4 plan + full QuantifiedRecommendations + full
// ClientProfile are ~213K chars/4 (~150K real tokens) at Holloway scale —
// well over both the chars-over-4 fast-fail (80K) and the real-token ceiling
// (100K). Phase 3.3 Step 3 recovery: this projection drops fields the LLM
// auditor doesn't read (Stage 4 _metadata; full Implementation Roadmap row
// descriptions; QR action_item bodies / sub_steps / depends_on /
// computation_inputs; ClientProfile balance-sheet line items + entities;
// etc.) while preserving every field the LC.1–LC.6 checks need to do their
// job (all Stage 4 prose, cross_references, glossary, top_priorities, plus
// per-rec category / plan_section / decisions_needed / estimate / qualitative
// phrasing for cross-checks).
//
// **Critical:** This is a TYPE ONLY. The deterministic checks (DC.1–DC.10)
// receive the FULL Stage4Result + FULL QuantifiedRecommendations + FULL
// ClientProfile and bypass this projection entirely. Only the LLM auditor
// sees this trimmed shape.
//
// **Implementation note:** explicit field selection (no spread operators) so
// any future addition to upstream types does not silently leak into the LLM
// input. Adding a field to Stage5LlmAuditInput is a deliberate decision.
// ────────────────────────────────────────────────────────────────────────

// Slim Implementation Roadmap row — strips full action description; keeps
// just IDs and timing/ownership for cross-reference. The auditor cross-checks
// roadmap rows against QR action_items by ID, not by re-reading descriptions.
export interface Stage5IrRowSlim {
  owner: string;
  status: "Not Started" | "In Progress" | "Pending Decision" | "Complete";
  source_action_item_id: string;
  source_recommendation_id: string;
}

export interface Stage5IrGroupSlim {
  timing_bucket: string;
  bucket_label: string;
  row_count: number;
  rows: Stage5IrRowSlim[];
}

export interface Stage5ImplementationRoadmapSlim {
  intro_paragraph: string; // narrative prose — needed for LC.5/LC.6
  groups: Stage5IrGroupSlim[];
  total_action_count: number;
}

// Stage 4 plan slice — keep all narrative-bearing prose; slim mechanical
// tables. Cross-references are kept verbatim (LC.5 narrative weaving cites
// them). Glossary entries are kept (LC.5/LC.6 read defs).
export interface Stage5PlanSlice {
  llm_sections: Stage4Result["llm_sections"]; // ALL prose — LC.1/LC.6 read this
  deterministic_sections: {
    title_page: Stage4Result["deterministic_sections"]["title_page"];
    goals_priorities: Stage4Result["deterministic_sections"]["goals_priorities"];
    decisions_needed: Stage4Result["deterministic_sections"]["decisions_needed"];
    advisory_team: Stage4Result["deterministic_sections"]["advisory_team"];
    glossary: Stage4Result["deterministic_sections"]["glossary"];
    disclosures: Stage4Result["deterministic_sections"]["disclosures"];
    implementation_roadmap_summary: Stage5ImplementationRoadmapSlim;
    // client_snapshot dropped (data tables; no narrative voice)
    // meeting_cadence_table dropped (data; cadence prose lives in llm_sections)
  };
  // _flags slimmed — keep numbers_drift summary so LC.2 can see what Stage 4
  // already flagged; drop unresolved_cross_references (DC.1 already covers).
  flags_summary: {
    numbers_drift_hard_count: number;
    numbers_drift_soft_count: number;
    numbers_drift_hard_entries: NumbersDriftEntry[]; // capped to ~20 in projection
    glossary_terms_used: string[];
  };
  // _metadata dropped entirely.
}

// QR per-rec slice — drops action_item bodies (auditor cross-checks by ID),
// computation_inputs, _audit_notes, alternative_values raw shape.
export interface Stage5QrRecSlim {
  recommendation_id: string;
  category: RecommendationCategory;
  plan_section: PlanSectionName | null;
  timing_bucket: TimingBucket;
  decisions_needed: boolean;
  landmine: boolean;
  landmine_status: string;
  default_excluded: boolean;
  quantified_impact: {
    estimate: NumericValue | null; // LC.2 numerical cross-check
    qualitative_phrasing: string | null; // LC.3 strategic context
    pending_reconciliation: boolean;
    // alternative_values, blocked_inputs, formula_id, computation_inputs all
    // dropped — LLM doesn't cite these.
  };
  action_item_ids: string[]; // for DC.2 / IR cross-check (just IDs)
}

export interface Stage5QrSlice {
  recommendations: Stage5QrRecSlim[];
  // _sequencer_flags, _metadata, _sequencer_status, _sequencer_failures all
  // dropped — Stage 3a observability, not audit input.
}

// ClientProfile slice — keep archetype + names + goals + advisor observations;
// drop balance sheet, income, tax status, estate planning, insurance line items
// (Stage 4 prose has already synthesized these into the plan; the auditor
// reads the synthesis, not the source).
export interface Stage5ClientProfileSlice {
  engagement: ClientProfile["engagement"];
  client_and_family: ClientProfile["client_and_family"];
  goals_and_values: ClientProfile["goals_and_values"];
  advisor_observations: string;
  // entities, entity_structure, personal_balance_sheet, income, cash_flow,
  // tax_status, estate_planning, insurance, transaction_posture,
  // prior_transactions, documents_received, existing_advisor_relationships,
  // _metadata all dropped.
}

export interface Stage5LlmAuditInput {
  plan: Stage5PlanSlice;
  quantified_recommendations: Stage5QrSlice;
  client_profile: Stage5ClientProfileSlice;
  // Convenience: surface archetype + plan-output gating directly so the LLM
  // doesn't have to dig into client_profile.engagement.
  archetype: ArchetypeIdentifier;
  include_optional_pre_transaction: boolean;
}

// ────────────────────────────────────────────────────────────────────────
// Re-exports for convenience
// ────────────────────────────────────────────────────────────────────────

export type { StageMetadata, AttemptHistoryEntry, TopPriorityRow };
