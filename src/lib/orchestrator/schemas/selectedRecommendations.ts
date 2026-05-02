// Stage 2 output schema. Cross-stage shared types live in pipelineTypes.ts;
// this file owns the Stage 2 contract: zod schema, inferred types, the
// failure shape, and the cross-reference validators (orphan rec_id, orphan
// sequencing reference, selected-count cap). Custom validators run AFTER zod
// shape validation and surface errors in the same format so retries can use
// them as correction hints.

import { z } from "zod";
import { StageMetadataSchema, type StageMetadata } from "./clientProfile";

// ────────────────────────────────────────────────────────────────────────
// Primitives
// ────────────────────────────────────────────────────────────────────────

const RecIdRefSchema = z.object({ recommendation_id: z.string() });

const RecommendationCategorySchema = z.enum([
  "Tax",
  "Estate",
  "Entity Structure",
  "Risk & Insurance",
  "Retirement",
  "Investment",
  "Succession & Continuity",
  "Family",
  "Charitable",
  "Specialty",
]);

const MatchStrengthSchema = z.enum(["strong", "borderline"]);
const PreliminaryPreferenceSchema = z
  .enum(["preferred", "alternative", "tie"])
  .nullable();

// ────────────────────────────────────────────────────────────────────────
// SelectedRecommendation
// ────────────────────────────────────────────────────────────────────────

// Field-length discipline mirrors the system prompt's FIELD LENGTH DISCIPLINE
// section. Stage 2 produces structured selection data for up to 30 recs;
// verbose per-rec fields multiply across the set and exceed token budgets.
// Concise fields preserve budget for sequencing relations and pass summaries.
//
// Custom error messages are surfaced via .max(n, { message }) so the retry
// correction prompt names the field and limit explicitly.
const BRIEF_RATIONALE_MAX = 80;
const TRIGGER_ENTRY_MAX = 25;
const PREFERENCE_RATIONALE_MAX = 100;

export const SelectedRecommendationSchema = z.object({
  recommendation_id: z.string().regex(/^REC-[A-Z]{3}-\d{3}$/),
  category: RecommendationCategorySchema,
  match_strength: MatchStrengthSchema,

  triggers_matched: z.array(
    z
      .string()
      .max(TRIGGER_ENTRY_MAX, {
        message: `field_length_exceeded: triggers_matched entries must be ≤${TRIGGER_ENTRY_MAX} chars (e.g. "operating LLC", "GA residency"). One short descriptor per entry, not a sentence.`,
      }),
  ),
  triggers_partial: z.array(
    z
      .string()
      .max(TRIGGER_ENTRY_MAX, {
        message: `field_length_exceeded: triggers_partial entries must be ≤${TRIGGER_ENTRY_MAX} chars. One short descriptor per entry, not a sentence.`,
      }),
  ),

  must_come_after: z.array(RecIdRefSchema),
  must_come_before: z.array(RecIdRefSchema),
  sequenced_with: z.array(RecIdRefSchema),
  coordinated_with: z.array(RecIdRefSchema),
  mutually_exclusive_with: z.array(RecIdRefSchema),

  preliminary_preference: PreliminaryPreferenceSchema,
  preliminary_preference_rationale: z
    .string()
    .max(PREFERENCE_RATIONALE_MAX, {
      message: `field_length_exceeded: preliminary_preference_rationale must be ≤${PREFERENCE_RATIONALE_MAX} chars when populated. Brief reasoning only.`,
    })
    .nullable(),

  landmine: z.boolean(),
  landmine_status: z.string(),

  brief_rationale: z
    .string()
    .max(BRIEF_RATIONALE_MAX, {
      message: `field_length_exceeded: brief_rationale must be ≤${BRIEF_RATIONALE_MAX} chars. One brief sentence stating the core fit. Detailed reasoning belongs in Stage 4 prose, not Stage 2 metadata.`,
    }),
});

export const SupplementalCandidateSchema = z.object({
  recommendation_id: z.string().regex(/^REC-[A-Z]{3}-\d{3}$/),
  reason_supplemental: z.string(),
  match_strength: z.literal("borderline"),
  brief_rationale: z
    .string()
    .max(BRIEF_RATIONALE_MAX, {
      message: `field_length_exceeded: brief_rationale must be ≤${BRIEF_RATIONALE_MAX} chars.`,
    }),
});

export const SpeculativeDroppedSchema = z.object({
  recommendation_id: z.string().regex(/^REC-[A-Z]{3}-\d{3}$/),
  drop_reason: z.string(),
});

const PassSummariesSchema = z.object({
  pass_1_hard_filter: z.object({
    input_universe: z.literal(130),
    eliminated: z.number().int().nonnegative(),
    survived: z.number().int().nonnegative(),
  }),
  pass_2_calibration: z.object({
    strong: z.number().int().nonnegative(),
    borderline: z.number().int().nonnegative(),
    speculative: z.number().int().nonnegative(),
  }),
  pass_3_sequencing: z.object({
    sequencing_relations_total: z.number().int().nonnegative(),
    landmines_marked: z.number().int().nonnegative(),
  }),
});

const StageFlagsSchema = z.object({
  candidate_set_unusually_small: z.boolean(),
  candidate_set_unusually_large: z.boolean(),
  landmines_present_count: z.number().int().nonnegative(),
  mutually_exclusive_pairs_present: z.number().int().nonnegative(),
});

// Body the LLM must emit (no _metadata yet — appended after).
//
// Caps loosened from initial v1 draft (30/10/10) to accommodate hand-authored
// complex client fixtures. Stage 2's actual LLM-based discipline lives in
// prompt engineering, not schema enforcement, per Phase 1 spec.
export const SelectedRecommendationsBodySchema = z.object({
  selected: z.array(SelectedRecommendationSchema),
  supplemental_candidates: z
    .array(SupplementalCandidateSchema)
    .max(30, {
      message:
        "supplemental_candidates exceeds 30 entries; surface only items the advisor would actually want to review.",
    }),
  speculative_dropped: z
    .array(SpeculativeDroppedSchema)
    .max(50, {
      message:
        "speculative_dropped exceeds 50 entries; do not exhaustively list every rec eliminated in Pass 1.",
    }),
  pass_summaries: PassSummariesSchema,
  _stage_flags: StageFlagsSchema,
});

export const SelectedRecommendationsSchema = SelectedRecommendationsBodySchema.extend({
  _metadata: StageMetadataSchema,
});

export type SelectedRecommendation = z.infer<typeof SelectedRecommendationSchema>;
export type SupplementalCandidate = z.infer<typeof SupplementalCandidateSchema>;
export type SpeculativeDropped = z.infer<typeof SpeculativeDroppedSchema>;
export type SelectedRecommendationsBody = z.infer<typeof SelectedRecommendationsBodySchema>;
export type SelectedRecommendations = z.infer<typeof SelectedRecommendationsSchema>;

// ────────────────────────────────────────────────────────────────────────
// Failure shape
// ────────────────────────────────────────────────────────────────────────

export type SelectedRecommendationsFailureType =
  | "json_parse_failed"
  | "schema_validation_failed"
  | "api_error"
  | "max_retries_exceeded"
  | "kb_load_failed";

export interface SelectedRecommendationsFailed {
  _stage_status: "FAILED";
  _failure_type: SelectedRecommendationsFailureType;
  _failure_reason: string;
  _failure_context: {
    parse_error?: string;
    validation_errors?: string[];
    raw_response?: string;
    parsed_response?: unknown;
    api_error?: string;
    kb_load_error?: string;
    attempts_made: number;
    last_failure_type?: "json_parse_failed" | "schema_validation_failed";
  };
  _metadata: Partial<StageMetadata>;
}

// ────────────────────────────────────────────────────────────────────────
// Cross-reference validators
//
// Run AFTER zod shape validation. Surfaced as plain string errors so the
// retry loop can fold them into the correction prompt alongside zod issues.
// ────────────────────────────────────────────────────────────────────────

export const SELECTED_COUNT_CAP = 100;
export const SELECTED_COUNT_FLOOR = 5;

interface CrossRefError {
  code:
    | "orphan_recommendation_id"
    | "orphan_sequencing_reference"
    | "selected_count_exceeds_cap"
    | "selected_count_below_floor"
    | "duplicate_recommendation_id";
  detail: string;
}

export function validateCrossReferences(
  body: SelectedRecommendationsBody,
  registryIds: ReadonlySet<string>,
): CrossRefError[] {
  const errors: CrossRefError[] = [];
  const selectedIds = new Set(body.selected.map((r) => r.recommendation_id));

  // Selected count cap.
  if (body.selected.length > SELECTED_COUNT_CAP) {
    errors.push({
      code: "selected_count_exceeds_cap",
      detail: `selected.length is ${body.selected.length}; max is ${SELECTED_COUNT_CAP}. Drop weakest matches into supplemental_candidates.`,
    });
  }
  if (body.selected.length < SELECTED_COUNT_FLOOR) {
    errors.push({
      code: "selected_count_below_floor",
      detail: `selected.length is ${body.selected.length}; minimum is ${SELECTED_COUNT_FLOOR}. The candidate set looks too thin — re-walk the triggering matrix.`,
    });
  }

  // Duplicate rec_ids in selected[].
  const seen = new Set<string>();
  for (const r of body.selected) {
    if (seen.has(r.recommendation_id)) {
      errors.push({
        code: "duplicate_recommendation_id",
        detail: `selected[] contains "${r.recommendation_id}" more than once. Each rec_id must appear only once.`,
      });
    }
    seen.add(r.recommendation_id);
  }

  // Every selected rec_id and every supplemental/speculative rec_id must exist
  // in the registry.
  const allRefs: Array<{ where: string; id: string }> = [
    ...body.selected.map((r) => ({ where: "selected[]", id: r.recommendation_id })),
    ...body.supplemental_candidates.map((r) => ({
      where: "supplemental_candidates[]",
      id: r.recommendation_id,
    })),
    ...body.speculative_dropped.map((r) => ({
      where: "speculative_dropped[]",
      id: r.recommendation_id,
    })),
  ];
  for (const { where, id } of allRefs) {
    if (!registryIds.has(id)) {
      errors.push({
        code: "orphan_recommendation_id",
        detail: `${where}: "${id}" is not in the recommendation ID registry. Use only IDs from the registry; do not invent IDs.`,
      });
    }
  }

  // Every sequencing-relation rec_id MUST point at another entry in selected[].
  const relationFields: Array<keyof Pick<
    SelectedRecommendation,
    | "must_come_after"
    | "must_come_before"
    | "sequenced_with"
    | "coordinated_with"
    | "mutually_exclusive_with"
  >> = [
    "must_come_after",
    "must_come_before",
    "sequenced_with",
    "coordinated_with",
    "mutually_exclusive_with",
  ];
  for (const rec of body.selected) {
    for (const field of relationFields) {
      for (const ref of rec[field]) {
        if (!selectedIds.has(ref.recommendation_id)) {
          errors.push({
            code: "orphan_sequencing_reference",
            detail: `${rec.recommendation_id}.${field} references "${ref.recommendation_id}", which is not in selected[]. Sequencing relations must point only at other selected recs.`,
          });
        }
      }
    }
  }

  return errors;
}

export function formatCrossRefErrors(errors: CrossRefError[]): string[] {
  return errors.map((e) => `[${e.code}] ${e.detail}`);
}
