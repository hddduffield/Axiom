import type {
  AggregateMetrics,
  FirmPolicyQuestionId,
  MethodologyAppendixResult,
  MethodologyAppendixResultFailed,
  NumericValue,
  PerRecMethodologyEntry,
  SequencedPlan,
  SequencedRecommendation,
  SequencerMetadata,
} from "../schemas/pipelineTypes";
import { formatNumericValueMoney } from "../utils/numericValue";
import { detectRenderingState } from "../utils/renderingState";

// ────────────────────────────────────────────────────────────────────────
// Volatile-rate key detection (used to infer volatile_rates_referenced from
// computation_inputs in v1; v2 will pass this through explicitly).
//
// v2: When Stage 3a populates quantified_impact.volatile_rates_referenced
// explicitly, read from there instead of inferring from computation_inputs keys.
// ────────────────────────────────────────────────────────────────────────

const KNOWN_VOLATILE_RATE_KEYS = new Set([
  "s7520_rate",
  "afr_short_annual",
  "afr_short",
  "afr_mid_annual",
  "afr_mid",
  "afr_long_annual",
  "afr_long",
]);

function inferVolatileRatesReferenced(inputs: Record<string, unknown>): string[] {
  const found = new Set<string>();
  for (const key of Object.keys(inputs)) {
    if (KNOWN_VOLATILE_RATE_KEYS.has(key)) found.add(key);
  }
  return [...found].sort();
}

// ────────────────────────────────────────────────────────────────────────
// Volatile-rate rendering with "Pending refresh" fallbacks
// ────────────────────────────────────────────────────────────────────────

// §7520 published to 0.2% increments; reader needs precision signal → 2 decimal places.
function renderS7520(rate: number, month: string): string {
  const rateMissing = rate === 0;
  const monthMissing = month === "";
  if (rateMissing && monthMissing) return "Pending refresh";
  if (rateMissing) return `Pending refresh (${month})`;
  if (monthMissing) return `${rate.toFixed(2)}% (month pending)`;
  return `${rate.toFixed(2)}% (${month})`;
}

function renderAfr(rate: number | null): string {
  if (rate === null || rate === 0) return "Pending refresh";
  return `${rate.toFixed(2)}%`;
}

function renderLastRefreshed(value: string): string {
  return value === "" ? "Pending refresh" : value;
}

function renderVolatileRatesBlock(snapshot: SequencerMetadata["volatile_rates_snapshot"]): string {
  const lines = [
    "### Volatile Rates Snapshot",
    "",
    "This appendix's computations use the following volatile rates from the most recent KB lookup:",
    "",
    `- **§7520 rate:** ${renderS7520(snapshot.s7520_rate, snapshot.s7520_month)}`,
    `- **AFR Short-term:** ${renderAfr(snapshot.afr_short_annual)}`,
    `- **AFR Mid-term:** ${renderAfr(snapshot.afr_mid_annual)}`,
    `- **AFR Long-term:** ${renderAfr(snapshot.afr_long_annual)}`,
    `- **Last refreshed:** ${renderLastRefreshed(snapshot.last_refreshed)}`,
    `- **Days since refresh:** ${snapshot.days_since_refresh}`,
  ];
  return lines.join("\n");
}

// ────────────────────────────────────────────────────────────────────────
// Firm-policy resolutions snapshot
// ────────────────────────────────────────────────────────────────────────

function renderFirmPolicyBlock(applied: SequencerMetadata["firm_policy_resolutions_applied"]): string {
  const lines = ["### Firm-Policy Resolutions Applied", ""];
  if (applied.length === 0) {
    lines.push(
      "No firm-policy resolutions applied. Pending firm-policy items appear in the Decisions Needed page.",
    );
    return lines.join("\n");
  }
  lines.push(
    "The following firm-policy questions were resolved for this plan; affected recommendations cite them in their methodology entries above.",
  );
  lines.push("");
  // Sort by question_id for determinism.
  const sorted = [...applied].sort((a, b) => (a.question_id < b.question_id ? -1 : 1));
  for (const r of sorted) {
    lines.push(
      `- **${r.question_id}:** ${JSON.stringify(r.resolved_value)} (resolved by ${r.resolved_by}; applied to ${r.applied_to_recs.length} rec(s))`,
    );
  }
  return lines.join("\n");
}

// ────────────────────────────────────────────────────────────────────────
// Per-rec methodology
// ────────────────────────────────────────────────────────────────────────

interface FirmPolicyAffectingRec {
  question_id: FirmPolicyQuestionId;
  resolved_value: unknown;
  resolved_by: string;
}

function firmPolicyResolutionsForRec(
  recId: string,
  applied: SequencerMetadata["firm_policy_resolutions_applied"],
): FirmPolicyAffectingRec[] {
  const out: FirmPolicyAffectingRec[] = [];
  for (const r of applied) {
    if (r.applied_to_recs.includes(recId)) {
      out.push({
        question_id: r.question_id,
        resolved_value: r.resolved_value,
        resolved_by: r.resolved_by,
      });
    }
  }
  return out.sort((a, b) => (a.question_id < b.question_id ? -1 : 1));
}

function renderComputationInputs(inputs: Record<string, unknown>): string {
  const keys = Object.keys(inputs).sort();
  if (keys.length === 0) return "  - (none recorded)";
  return keys.map((k) => `  - ${k}: ${JSON.stringify(inputs[k])}`).join("\n");
}

function renderListOrNone(items: string[]): string {
  if (items.length === 0) return "None";
  return items.join(", ");
}

function renderFirmPolicyApplied(items: FirmPolicyAffectingRec[]): string {
  if (items.length === 0) return "None";
  return items
    .map((r) => `${r.question_id} = ${JSON.stringify(r.resolved_value)} (by ${r.resolved_by})`)
    .join("; ");
}

function renderAlternativeValues(
  alts: SequencedRecommendation["quantified_impact"]["alternative_values"],
): string {
  if (alts.length === 0) return "None";
  return alts
    .map(
      (av) =>
        `${av.formula_variant}: ${formatNumericValueMoney(av.value)} (awaiting ${av.awaiting}; ${av.context})`,
    )
    .join("; ");
}

function renderBlockedInputs(
  blocked: SequencedRecommendation["quantified_impact"]["blocked_inputs"],
): string {
  if (blocked.length === 0) return "None";
  return blocked
    .map((b) => `${b.input_name}: ${b.blocked_reason} (source: ${b.source}; unblocks when ${b.would_unblock_when})`)
    .join("; ");
}

function buildPerRecBlock(
  rec: SequencedRecommendation,
  title: string,
  firmPolicyApplied: FirmPolicyAffectingRec[],
  volatileRatesReferenced: string[],
): string {
  const qi = rec.quantified_impact;
  const lines = [
    `### ${rec.recommendation_id} — ${title}`,
    "",
    `- **Plan section:** ${rec.plan_section ?? "(unassigned)"}`,
    `- **Category:** ${rec.category}`,
    `- **Formula ID:** ${qi.formula_id ?? "(none)"}`,
    `- **Formula source:** ${qi.formula_source_file ?? "(none)"}`,
    `- **Computed estimate:** ${qi.estimate ? formatNumericValueMoney(qi.estimate) : "(none)"}`,
    qi.estimate
      ? `- **Exact estimate:** ${JSON.stringify(qi.estimate)}`
      : "- **Exact estimate:** null",
    "- **Computation inputs:**",
    renderComputationInputs(qi.computation_inputs),
    `- **Volatile rates referenced:** ${renderListOrNone(volatileRatesReferenced)}`,
    `- **Firm-policy resolutions applied:** ${renderFirmPolicyApplied(firmPolicyApplied)}`,
    `- **Alternative values considered:** ${renderAlternativeValues(qi.alternative_values)}`,
    `- **Pending reconciliation:** ${qi.pending_reconciliation ? "Yes — see Decisions Needed page" : "No"}`,
    `- **Blocked inputs:** ${renderBlockedInputs(qi.blocked_inputs)}`,
  ];
  return lines.join("\n");
}

function buildPerRecEntry(
  rec: SequencedRecommendation,
  metadata: SequencerMetadata,
  titleMap: Map<string, string> | undefined,
): PerRecMethodologyEntry {
  const title = titleMap?.get(rec.recommendation_id) ?? "[Title pending KB integration]";
  const firmPolicy = firmPolicyResolutionsForRec(
    rec.recommendation_id,
    metadata.firm_policy_resolutions_applied,
  );
  const volatileRefs = inferVolatileRatesReferenced(rec.quantified_impact.computation_inputs);
  const rendered_block = buildPerRecBlock(rec, title, firmPolicy, volatileRefs);
  return {
    recommendation_id: rec.recommendation_id,
    plan_section: rec.plan_section,
    category: rec.category,
    formula_id: rec.quantified_impact.formula_id,
    formula_source_file: rec.quantified_impact.formula_source_file,
    computation_inputs: rec.quantified_impact.computation_inputs,
    volatile_rates_referenced: volatileRefs,
    firm_policy_resolutions_applied: firmPolicy,
    alternative_values_considered: rec.quantified_impact.alternative_values,
    pending_reconciliation: rec.quantified_impact.pending_reconciliation,
    blocked_inputs: rec.quantified_impact.blocked_inputs,
    rendered_block,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Aggregate metric methodology rendering
// ────────────────────────────────────────────────────────────────────────

interface AggregateMetricSpec {
  name: string;
  value: NumericValue | null;
}

const AGGREGATE_METRIC_NAMES = [
  "annual_income_tax_savings_total",
  "annual_yield_capture_total",
  "estate_tax_savings_total",
  "insurance_face_amount_total",
  "recommended_implementation_cost_estimate",
] as const;

function buildAggregateBlock(
  name: string,
  value: NumericValue | null,
  metrics: AggregateMetrics,
): { rendered: string; partial: boolean; skipped: boolean } {
  const provenance = metrics._metric_provenance[name];
  const skippedFlag = metrics._aggregator_flags.metrics_skipped_due_to_pending_reconciliation.find(
    (m) => m.metric === name,
  );
  const partialFlag = metrics._aggregator_flags.metrics_with_partial_inputs.find(
    (m) => m.metric === name,
  );

  const lines: string[] = [`### Aggregate: ${name}`, ""];

  if (value === null && skippedFlag) {
    const total =
      provenance.contributing_rec_ids.length +
      provenance.excluded_rec_ids.length +
      provenance.qualitative_only_rec_ids.length;
    lines.push("- **Computed value:** Null (skipped)");
    lines.push("- **Exact value:** null");
    lines.push(
      `- **Reason:** ${provenance.excluded_rec_ids.length} of ${total} contributing recommendations are pending reconciliation`,
    );
    lines.push(
      `- **Excluded recommendations:** ${renderListOrNone(provenance.excluded_rec_ids)}`,
    );
    return { rendered: lines.join("\n"), partial: false, skipped: true };
  }

  if (value === null) {
    lines.push("- **Computed value:** Null");
    lines.push("- **Exact value:** null");
    lines.push(
      `- **Contributing recommendations:** ${renderListOrNone(provenance?.contributing_rec_ids ?? [])}`,
    );
    return { rendered: lines.join("\n"), partial: false, skipped: false };
  }

  lines.push(`- **Computed value:** ${formatNumericValueMoney(value)}`);
  lines.push(`- **Exact value:** ${JSON.stringify(value)}`);
  lines.push(
    `- **Contributing recommendations:** ${renderListOrNone(provenance.contributing_rec_ids)}`,
  );
  lines.push(
    `- **Excluded due to pending reconciliation:** ${renderListOrNone(provenance.excluded_rec_ids)}`,
  );
  lines.push(
    `- **Qualitative-only contributors (counted as zero):** ${renderListOrNone(provenance.qualitative_only_rec_ids)}`,
  );
  lines.push(`- **Hedge required in prose:** ${provenance.requires_hedge ? "Yes" : "No"}`);
  return {
    rendered: lines.join("\n"),
    partial: !!partialFlag,
    skipped: false,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Main entry
// ────────────────────────────────────────────────────────────────────────

export interface MethodologyAppendixOptions {
  includeStateBRecs?: boolean;
  includeRecTitles?: Map<string, string>;
}

function fail(reason: string): MethodologyAppendixResultFailed {
  return { _builder_status: "FAILED", _failure_reason: reason };
}

export function buildMethodologyAppendix(
  sequencedPlan: SequencedPlan,
  aggregateMetrics: AggregateMetrics | null,
  options: MethodologyAppendixOptions = {},
): MethodologyAppendixResult | MethodologyAppendixResultFailed {
  try {
    if (!sequencedPlan || !Array.isArray(sequencedPlan.sequenced_recommendations)) {
      return fail("SequencedPlan input is malformed");
    }

    const includeStateB = options.includeStateBRecs ?? true;
    const titleMap = options.includeRecTitles;
    const metadata = sequencedPlan._metadata;
    const allRecs = sequencedPlan.sequenced_recommendations;

    // Step 1: filter recs.
    const eligible = allRecs.filter((rec) => {
      const state = detectRenderingState(rec);
      if (state === "A") return true;
      if (state === "C") return true;
      if (state === "B") return includeStateB;
      // State D and ineligible → skip
      return false;
    });

    // Step 2: build per-rec entries.
    const perRecEntries = eligible.map((rec) => buildPerRecEntry(rec, metadata, titleMap));

    // Sort: plan_section then rec_id.
    const sectionKey = (e: PerRecMethodologyEntry): string => e.plan_section ?? "~~unassigned";
    perRecEntries.sort((a, b) => {
      const sa = sectionKey(a);
      const sb = sectionKey(b);
      if (sa !== sb) return sa < sb ? -1 : 1;
      return a.recommendation_id < b.recommendation_id ? -1 : 1;
    });

    // Step 3: aggregate methodology.
    const aggregateSpecs: AggregateMetricSpec[] = [];
    if (aggregateMetrics) {
      for (const name of AGGREGATE_METRIC_NAMES) {
        const value = aggregateMetrics[name];
        aggregateSpecs.push({ name, value });
      }
    }
    aggregateSpecs.sort((a, b) => (a.name < b.name ? -1 : 1));

    const aggregatesPartial: string[] = [];
    const aggregatesSkipped: string[] = [];
    const aggregateBlocks: string[] = [];
    for (const spec of aggregateSpecs) {
      if (!aggregateMetrics) continue;
      const { rendered, partial, skipped } = buildAggregateBlock(
        spec.name,
        spec.value,
        aggregateMetrics,
      );
      aggregateBlocks.push(rendered);
      if (partial) aggregatesPartial.push(spec.name);
      if (skipped) aggregatesSkipped.push(spec.name);
    }

    // Step 4 + 5 + 6: assemble final.
    const sections: string[] = [];
    sections.push("## Methodology Appendix");
    sections.push("");
    sections.push(
      "This appendix documents the formula sources, inputs, and firm-policy resolutions applied to every quantified figure cited in the plan body. Methodology is provided for audit and reproducibility.",
    );
    sections.push("");
    sections.push(renderVolatileRatesBlock(metadata.volatile_rates_snapshot));
    sections.push("");
    sections.push(renderFirmPolicyBlock(metadata.firm_policy_resolutions_applied));
    sections.push("");
    sections.push("### Per-Recommendation Methodology");
    sections.push("");
    if (perRecEntries.length === 0) {
      sections.push("No quantified recommendations in this plan.");
    } else {
      for (const entry of perRecEntries) {
        sections.push(entry.rendered_block);
        sections.push("");
      }
    }
    sections.push("### Aggregate Metric Methodology");
    sections.push("");
    if (aggregateBlocks.length === 0) {
      sections.push("No aggregate metrics computed.");
    } else {
      for (const block of aggregateBlocks) {
        sections.push(block);
        sections.push("");
      }
    }

    const rendered_appendix = sections.join("\n").replace(/\n+$/, "\n");

    const recsPending = perRecEntries
      .filter((e) => e.pending_reconciliation)
      .map((e) => e.recommendation_id)
      .sort();

    return {
      rendered_appendix,
      rec_count: perRecEntries.length,
      aggregate_count: aggregateBlocks.length,
      per_rec_entries: perRecEntries,
      _orchestrator_flags: {
        recs_pending_reconciliation_in_appendix: recsPending,
        aggregates_with_partial_inputs_in_appendix: aggregatesPartial.sort(),
        aggregates_skipped_in_appendix: aggregatesSkipped.sort(),
      },
    };
  } catch (err) {
    return fail(`Unexpected error in methodology appendix builder: ${(err as Error).message}`);
  }
}
