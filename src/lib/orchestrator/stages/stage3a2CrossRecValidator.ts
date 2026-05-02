// Stage 3a.2 — Cross-Rec Validator.
//
// Deterministic. NO LLM call. Takes the per-batch Stage3a1Result outputs from
// Stage 3a.1, merges them into a single QuantifiedRecommendations envelope,
// validates cross-batch sequencing references and ActionItem depends_on
// chains, consolidates batch-scoped flags, and surfaces failures.
//
// Pure synchronous function: same input → same output. No throws; failures
// surface via the optional `_sequencer_status: "FAILED"` field on the
// returned QuantifiedRecommendations container.

import type {
  QuantifiedRecommendations,
  SequencedRecommendation,
  SequencerFailure,
  SequencerFlags3a,
} from "../schemas/pipelineTypes";
import type {
  Stage3a1Result,
  Stage3a1ResultFailed,
} from "../schemas/stage3a1.types";
import { isStage3a1ResultFailed } from "../schemas/stage3a1.types";
import type { SelectedRecommendations } from "../schemas/selectedRecommendations";

const SEQUENCING_FIELDS = [
  "must_come_after",
  "must_come_before",
  "sequenced_with",
  "coordinated_with",
  "mutually_exclusive_with",
] as const;

// ────────────────────────────────────────────────────────────────────────
// Helpers — flag union + deterministic ordering
// ────────────────────────────────────────────────────────────────────────

function emptyFlags(): SequencerFlags3a {
  return {
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
}

function unionStage3a1Flags(succeeded: Stage3a1Result[]): SequencerFlags3a {
  const merged = emptyFlags();
  for (const batch of succeeded) {
    const f = batch._stage_flags;
    merged.unenumerated_question_ids.push(...f.unenumerated_question_ids);
    merged.formula_yielded_unviable_value.push(...f.formula_yielded_unviable_value);
    merged.cluster_closer_skipped.push(...f.cluster_closer_skipped);
    merged.section_assignment_ambiguity.push(...f.section_assignment_ambiguity);
    merged.timing_bucket_inferred.push(...f.timing_bucket_inferred);
    merged.qualitative_fallback_used.push(...f.qualitative_fallback_used);
    merged.blocked_inputs_summary.push(...f.blocked_inputs_summary);
    merged.volatile_rates_stale.push(...f.volatile_rates_stale);
    // The Stage-3a.2-only arrays start empty in batch results; defensively
    // pass through any entries the LLM populated.
    merged.orphan_action_item_dependencies.push(...f.orphan_action_item_dependencies);
    merged.orphan_sequencing_references.push(...f.orphan_sequencing_references);
  }
  return merged;
}

// Sort flag arrays for deterministic output (snapshot-test friendliness).
function sortFlags(flags: SequencerFlags3a): SequencerFlags3a {
  flags.unenumerated_question_ids.sort((a, b) =>
    a.rec_id.localeCompare(b.rec_id) || a.marker_text.localeCompare(b.marker_text),
  );
  flags.formula_yielded_unviable_value.sort((a, b) =>
    a.rec_id.localeCompare(b.rec_id) || a.formula_id.localeCompare(b.formula_id),
  );
  flags.section_assignment_ambiguity.sort((a, b) =>
    a.rec_id.localeCompare(b.rec_id),
  );
  flags.timing_bucket_inferred.sort((a, b) =>
    a.action_item_id.localeCompare(b.action_item_id),
  );
  flags.qualitative_fallback_used.sort((a, b) =>
    a.rec_id.localeCompare(b.rec_id),
  );
  flags.blocked_inputs_summary.sort((a, b) =>
    a.rec_id.localeCompare(b.rec_id),
  );
  flags.orphan_action_item_dependencies.sort(
    (a, b) =>
      a.source_rec_id.localeCompare(b.source_rec_id) ||
      a.source_action_item_id.localeCompare(b.source_action_item_id) ||
      a.missing_dependency_id.localeCompare(b.missing_dependency_id),
  );
  flags.orphan_sequencing_references.sort(
    (a, b) =>
      a.source_rec_id.localeCompare(b.source_rec_id) ||
      a.field.localeCompare(b.field) ||
      a.missing_rec_id.localeCompare(b.missing_rec_id),
  );
  flags.batch_failures_summary.sort((a, b) => a.batch_index - b.batch_index);
  flags.coverage_gaps.sort();
  flags.volatile_rates_stale.sort((a, b) => a.batch_index - b.batch_index);
  return flags;
}

// ────────────────────────────────────────────────────────────────────────
// Main entry
// ────────────────────────────────────────────────────────────────────────

export function validateAndMerge(
  batchResults: Array<Stage3a1Result | Stage3a1ResultFailed>,
  selectedRecommendations: SelectedRecommendations,
): QuantifiedRecommendations {
  // Step 1 — Partition into succeeded vs failed
  const succeeded: Stage3a1Result[] = [];
  const failed: Stage3a1ResultFailed[] = [];
  for (const r of batchResults) {
    if (isStage3a1ResultFailed(r)) {
      failed.push(r);
    } else {
      succeeded.push(r);
    }
  }
  // Order succeeded batches by batch_index for deterministic output ordering.
  succeeded.sort((a, b) => a.batch_index - b.batch_index);

  // Step 2 — Concatenate batch recommendations
  const consolidatedRecs: SequencedRecommendation[] = [];
  for (const batch of succeeded) {
    consolidatedRecs.push(...batch.recommendations);
  }

  // Coverage check
  const coveredRecIds = new Set(
    consolidatedRecs.map((r) => r.recommendation_id),
  );
  const coverageGaps = selectedRecommendations.selected
    .map((r) => r.recommendation_id)
    .filter((id) => !coveredRecIds.has(id));

  // Step 3 — Validate cross-rec sequencing references and ActionItem depends_on
  const flags = unionStage3a1Flags(succeeded);
  flags.coverage_gaps = coverageGaps;

  // Build action_item_id index for dependency validation.
  const coveredActionItemIds = new Set<string>();
  // Map rec_id → batch_index so we can attribute orphans to source batches.
  const recIdToBatchIndex = new Map<string, number>();
  for (const batch of succeeded) {
    for (const rec of batch.recommendations) {
      recIdToBatchIndex.set(rec.recommendation_id, batch.batch_index);
      for (const ai of rec.action_items) {
        coveredActionItemIds.add(ai.action_item_id);
      }
    }
  }

  // Sequencing relations live on the SelectedRecommendation input (Stage 2's
  // shape carries them). The slim SequencedRecommendation type used downstream
  // doesn't, so we look up by rec_id from the SelectedRecommendations argument.
  const selectedByRecId = new Map(
    selectedRecommendations.selected.map((r) => [r.recommendation_id, r]),
  );

  // 3a — Rec-level sequencing references
  for (const rec of consolidatedRecs) {
    const sourceBatchIndex = recIdToBatchIndex.get(rec.recommendation_id) ?? 0;
    const selectedSrc = selectedByRecId.get(rec.recommendation_id);
    if (!selectedSrc) continue; // Defensive: a rec in output without a source selection is its own bug.
    for (const field of SEQUENCING_FIELDS) {
      const refs = selectedSrc[field];
      for (const ref of refs) {
        if (!coveredRecIds.has(ref.recommendation_id)) {
          flags.orphan_sequencing_references.push({
            source_rec_id: rec.recommendation_id,
            field,
            missing_rec_id: ref.recommendation_id,
            source_batch_index: sourceBatchIndex,
          });
        }
      }
    }

    // 3b — ActionItem depends_on chains
    for (const ai of rec.action_items) {
      for (const dep of ai.depends_on) {
        if (!coveredActionItemIds.has(dep)) {
          flags.orphan_action_item_dependencies.push({
            source_action_item_id: ai.action_item_id,
            source_rec_id: rec.recommendation_id,
            missing_dependency_id: dep,
            source_batch_index: sourceBatchIndex,
          });
        }
      }
    }
  }

  // Step 4 — Failed-batch summary
  const sequencerFailures: SequencerFailure[] = failed.map((f) => ({
    stage: "3a" as const,
    rec_id: null,
    reason: f._failure_reason,
    context: `batch ${f._failure_context.batch_index}: ${f._failure_type}`,
  }));
  flags.batch_failures_summary = failed.map((f) => ({
    batch_index: f._failure_context.batch_index,
    failure_type: f._failure_type,
    failure_reason: f._failure_reason,
  }));

  sortFlags(flags);

  // Step 5 — Emit envelope
  if (failed.length === 0) {
    return {
      _sequencer_flags: flags,
      recommendations: consolidatedRecs,
    };
  }

  // Partial or full failure
  return {
    _sequencer_status: "FAILED",
    _sequencer_failures: sequencerFailures,
    _sequencer_flags: flags,
    recommendations: consolidatedRecs,
  };
}
