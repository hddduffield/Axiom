import type {
  AggregateMetrics,
  AggregateMetricsFailed,
  AggregatorFlags,
  MetricProvenance,
  NumericValue,
  RecommendationCategory,
  RenderingState,
  SequencedPlan,
  SequencedRecommendation,
} from "../schemas/pipelineTypes";
import {
  addNumericValues,
  isPositiveValue,
  multiplyNumericByScalar,
  rangeBounds,
} from "../utils/numericValue";
import { detectRenderingState } from "../utils/renderingState";

// ────────────────────────────────────────────────────────────────────────
// Defaults
// ────────────────────────────────────────────────────────────────────────

interface CategoryCost {
  setup: NumericValue;
  annual: NumericValue;
}

const ZERO: NumericValue = { value: 0, unit: "USD" };

const DEFAULT_COST_HEURISTIC: ReadonlyMap<RecommendationCategory, CategoryCost> = new Map([
  ["Estate", { setup: { value: [15000, 25000], unit: "USD" }, annual: { value: [2000, 5000], unit: "USD", is_annual: true } }],
  ["Entity Structure", { setup: { value: [10000, 20000], unit: "USD" }, annual: ZERO }],
  ["Risk & Insurance", { setup: { value: [5000, 15000], unit: "USD" }, annual: { value: [1000, 3000], unit: "USD", is_annual: true } }],
  ["Tax", { setup: { value: [5000, 10000], unit: "USD" }, annual: { value: [2000, 5000], unit: "USD", is_annual: true } }],
  ["Investment", { setup: { value: [2000, 5000], unit: "USD" }, annual: ZERO }],
] as const);

const FALLBACK_COST: CategoryCost = {
  setup: { value: 5000, unit: "USD" },
  annual: { value: 2000, unit: "USD", is_annual: true },
};

const DEFAULT_STRUCTURAL_EXPOSURE_MAPPING: ReadonlyMap<string, string> = new Map([
  ["REC-RSK-001", "unfunded buy/sell"],
  ["REC-RSK-002", "unfunded buy/sell"],
  ["REC-ENT-001", "real estate inside operating LLC"],
  ["REC-EST-001", "stale will"],
  ["REC-EST-004", "missing ILIT for estate liquidity"],
  ["REC-ENT-002", "operating-LLC structure suboptimal for transaction"],
  ["REC-RSK-005", "insufficient liability coverage"],
] as const);

// ────────────────────────────────────────────────────────────────────────
// Per-metric three-tier classification
// ────────────────────────────────────────────────────────────────────────

interface ClassifiedContributor {
  rec: SequencedRecommendation;
  state: RenderingState | null;
}

interface MetricComputation {
  value: NumericValue | null;
  provenance: MetricProvenance;
  flagPartial: boolean;
  flagSkipped: boolean;
  reason: string | null;
}

function emptyProvenance(): MetricProvenance {
  return {
    contributing_rec_ids: [],
    excluded_rec_ids: [],
    qualitative_only_rec_ids: [],
    partial_ratio: 0,
    requires_hedge: false,
  };
}

function classify(recs: SequencedRecommendation[]): ClassifiedContributor[] {
  return recs.map((rec) => ({ rec, state: detectRenderingState(rec) }));
}

function computeMetricFromContributors(
  contributors: SequencedRecommendation[],
): MetricComputation {
  const provenance = emptyProvenance();
  if (contributors.length === 0) {
    return { value: null, provenance, flagPartial: false, flagSkipped: false, reason: null };
  }
  const classified = classify(contributors);

  const stateA: SequencedRecommendation[] = [];
  const stateB: SequencedRecommendation[] = [];
  const stateC: SequencedRecommendation[] = [];
  const stateD: SequencedRecommendation[] = [];
  for (const { rec, state } of classified) {
    if (state === "A") stateA.push(rec);
    else if (state === "B") stateB.push(rec);
    else if (state === "C") stateC.push(rec);
    else if (state === "D") stateD.push(rec);
  }

  const total = contributors.length;
  const excluded = stateB.length + stateC.length;
  const partial_ratio = total === 0 ? 0 : excluded / total;

  provenance.contributing_rec_ids = stateA.map((r) => r.recommendation_id).sort();
  provenance.excluded_rec_ids = [...stateB, ...stateC].map((r) => r.recommendation_id).sort();
  provenance.qualitative_only_rec_ids = stateD.map((r) => r.recommendation_id).sort();
  provenance.partial_ratio = partial_ratio;

  // Branch 1: too many excluded → metric null, skip flag.
  if (partial_ratio > 0.5) {
    return {
      value: null,
      provenance,
      flagPartial: false,
      flagSkipped: true,
      reason: `partial_ratio ${partial_ratio.toFixed(2)} exceeds 0.5 threshold`,
    };
  }

  // Branch fallback: ratio acceptable, but no State A contributors → cannot sum.
  if (stateA.length === 0) {
    return {
      value: null,
      provenance,
      flagPartial: provenance.qualitative_only_rec_ids.length > 0 || provenance.excluded_rec_ids.length > 0,
      flagSkipped: false,
      reason: "no State A contributors to sum",
    };
  }

  // Sum State A values.
  let sum: NumericValue | null = null;
  for (const rec of stateA) {
    const est = rec.quantified_impact.estimate;
    if (!est) continue;
    sum = sum === null ? { ...est } : addNumericValues(sum, est);
  }

  // Branch 2 vs 3: clean if no excluded/qualitative; partial otherwise.
  const hasPartial = excluded > 0 || stateD.length > 0;
  if (hasPartial) {
    provenance.requires_hedge = true;
  }

  // If sum exists but is non-positive (defensive), treat as null/partial.
  if (sum && !isPositiveValue(sum)) {
    return {
      value: null,
      provenance,
      flagPartial: true,
      flagSkipped: false,
      reason: "remaining_contribution_sum non-positive",
    };
  }

  return {
    value: sum,
    provenance,
    flagPartial: hasPartial,
    flagSkipped: false,
    reason: null,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Metric contributor selection
// ────────────────────────────────────────────────────────────────────────

function isEstateContributor(rec: SequencedRecommendation): boolean {
  return (
    rec.plan_section === "Recommendations — Estate Planning" &&
    rec.recommendation_id.startsWith("REC-EST-")
  );
}

function isAnnualTaxContributor(rec: SequencedRecommendation): boolean {
  if (rec.category !== "Tax") return false;
  const est = rec.quantified_impact.estimate;
  if (est && est.is_annual === true) return true;
  // State C with alternative_values that are annual still contributes (will be excluded by state).
  if (rec.quantified_impact.alternative_values.some((av) => av.value.is_annual === true)) return true;
  return false;
}

function isAnnualYieldContributor(rec: SequencedRecommendation): boolean {
  if (rec.plan_section !== "Recommendations — Investment & Cash") return false;
  const est = rec.quantified_impact.estimate;
  if (est && est.is_annual === true) return true;
  if (rec.quantified_impact.alternative_values.some((av) => av.value.is_annual === true)) return true;
  return false;
}

function isInsuranceFaceContributor(rec: SequencedRecommendation): boolean {
  if (rec.category !== "Risk & Insurance") return false;
  const est = rec.quantified_impact.estimate;
  // Face amounts are one-time, large values (not annual). State C also counts as contributor.
  if (est && est.is_annual !== true) return true;
  if (
    rec.quantified_impact.alternative_values.some((av) => av.value.is_annual !== true) &&
    rec.quantified_impact.alternative_values.length > 0
  )
    return true;
  return false;
}

// ────────────────────────────────────────────────────────────────────────
// Implementation cost
// ────────────────────────────────────────────────────────────────────────

function computeImplementationCost(
  recs: SequencedRecommendation[],
  heuristic: ReadonlyMap<RecommendationCategory, CategoryCost>,
): NumericValue | null {
  if (recs.length === 0) return null;
  let total: NumericValue | null = null;
  for (const rec of recs) {
    const cost = heuristic.get(rec.category) ?? FALLBACK_COST;
    total = total === null ? { ...cost.setup } : addNumericValues(total, cost.setup);
  }
  if (total && !isPositiveValue(total)) return null;
  return total;
}

// ────────────────────────────────────────────────────────────────────────
// Structural exposures
// ────────────────────────────────────────────────────────────────────────

function computeStructuralExposures(
  recs: SequencedRecommendation[],
  mapping: ReadonlyMap<string, string>,
): string[] {
  const seen = new Map<string, string>(); // descriptor → first plan_section seen
  for (const rec of recs) {
    const descriptor = mapping.get(rec.recommendation_id);
    if (!descriptor) continue;
    if (!seen.has(descriptor)) {
      seen.set(descriptor, rec.plan_section ?? "");
    }
  }
  return [...seen.entries()]
    .sort((a, b) => {
      if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
      return a[0] < b[0] ? -1 : 1;
    })
    .map(([d]) => d);
}

// ────────────────────────────────────────────────────────────────────────
// ROI framing
// ────────────────────────────────────────────────────────────────────────

function formatRoiRatio(ratio: number): string {
  if (ratio > 100) return ">100×";
  if (ratio < 1) return "<1×";
  return `${Math.round(ratio)}×`;
}

function computeRoiFraming(
  estate: NumericValue | null,
  annualIncome: NumericValue | null,
  annualYield: NumericValue | null,
  cost: NumericValue | null,
): string | null {
  if (!estate || !cost) return null;
  // Annual sum may be missing entirely (both null). Treat missing as zero.
  let annualSum: NumericValue;
  if (annualIncome && annualYield) {
    annualSum = addNumericValues(annualIncome, annualYield);
  } else if (annualIncome) {
    annualSum = annualIncome;
  } else if (annualYield) {
    annualSum = annualYield;
  } else {
    annualSum = { value: 0, unit: "USD" };
  }
  const annualFiveYr = multiplyNumericByScalar(annualSum, 5);
  // Drop is_annual on the 5-year cumulative.
  delete annualFiveYr.is_annual;

  const totalBenefit = addNumericValues(estate, annualFiveYr);
  const benefitBounds = rangeBounds(totalBenefit);
  const costBounds = rangeBounds(cost);

  // Conservative range: benefitLow / costHigh ↔ benefitHigh / costLow.
  const ratioLow = benefitBounds.low / costBounds.high;
  const ratioHigh = benefitBounds.high / costBounds.low;

  if (Number.isNaN(ratioLow) || !Number.isFinite(ratioLow)) return null;

  // Collapse to single ratio when range is tight: floor of 2 handles small ratios,
  // 5% scales with magnitude (e.g., for ratio ~50, threshold is max(2, 2.5) = 2.5).
  const collapseThreshold = Math.max(2, 0.05 * ratioLow);
  if (ratioHigh - ratioLow < collapseThreshold) {
    return `~${formatRoiRatio((ratioLow + ratioHigh) / 2)}`;
  }
  return `${formatRoiRatio(ratioLow)}–${formatRoiRatio(ratioHigh)} depending on horizon`;
}

// ────────────────────────────────────────────────────────────────────────
// Main entry
// ────────────────────────────────────────────────────────────────────────

export interface AggregateMetricsOptions {
  transactionWindow?: string | null;
  implementationCostHeuristic?: ReadonlyMap<RecommendationCategory, CategoryCost>;
  structuralExposureMapping?: ReadonlyMap<string, string>;
}

function fail(reason: string): AggregateMetricsFailed {
  return { _builder_status: "FAILED", _failure_reason: reason };
}

function applyFlags(
  metricName: string,
  comp: MetricComputation,
  flags: AggregatorFlags,
): void {
  if (comp.flagSkipped) {
    flags.metrics_skipped_due_to_pending_reconciliation.push({
      metric: metricName,
      reason: comp.reason ?? "skipped",
      excluded_rec_ids: comp.provenance.excluded_rec_ids,
      qualitative_only_rec_ids: comp.provenance.qualitative_only_rec_ids,
    });
  }
  if (comp.flagPartial) {
    flags.metrics_with_partial_inputs.push({
      metric: metricName,
      excluded_rec_ids: comp.provenance.excluded_rec_ids,
      qualitative_only_rec_ids: comp.provenance.qualitative_only_rec_ids,
      remaining_contributors: comp.provenance.contributing_rec_ids.length,
    });
  }
}

export function buildAggregateMetrics(
  sequencedPlan: SequencedPlan,
  options: AggregateMetricsOptions = {},
): AggregateMetrics | AggregateMetricsFailed {
  try {
    if (!sequencedPlan || !Array.isArray(sequencedPlan.sequenced_recommendations)) {
      return fail("SequencedPlan input is malformed");
    }

    const heuristic = options.implementationCostHeuristic ?? DEFAULT_COST_HEURISTIC;
    const mapping = options.structuralExposureMapping ?? DEFAULT_STRUCTURAL_EXPOSURE_MAPPING;
    const allRecs = sequencedPlan.sequenced_recommendations;

    const flags: AggregatorFlags = {
      metrics_with_partial_inputs: [],
      metrics_skipped_due_to_pending_reconciliation: [],
    };
    const provenance: Record<string, MetricProvenance> = {};

    // Estate.
    const estateContributors = allRecs.filter(isEstateContributor);
    const estateComp = computeMetricFromContributors(estateContributors);
    provenance.estate_tax_savings_total = estateComp.provenance;
    applyFlags("estate_tax_savings_total", estateComp, flags);

    // Annual income tax.
    const taxContributors = allRecs.filter(isAnnualTaxContributor);
    const taxComp = computeMetricFromContributors(taxContributors);
    provenance.annual_income_tax_savings_total = taxComp.provenance;
    applyFlags("annual_income_tax_savings_total", taxComp, flags);

    // Annual yield capture.
    const yieldContributors = allRecs.filter(isAnnualYieldContributor);
    const yieldComp = computeMetricFromContributors(yieldContributors);
    provenance.annual_yield_capture_total = yieldComp.provenance;
    applyFlags("annual_yield_capture_total", yieldComp, flags);

    // Insurance face.
    const insuranceContributors = allRecs.filter(isInsuranceFaceContributor);
    const insuranceComp = computeMetricFromContributors(insuranceContributors);
    provenance.insurance_face_amount_total = insuranceComp.provenance;
    applyFlags("insurance_face_amount_total", insuranceComp, flags);

    // Implementation cost (heuristic; no state-tier discipline applied — every selected rec contributes).
    // v2: when Stage 3a populates real cost figures from rec files (not heuristic), apply three-tier discipline.
    const implementationCost = computeImplementationCost(allRecs, heuristic);
    provenance.recommended_implementation_cost_estimate = {
      contributing_rec_ids: allRecs.map((r) => r.recommendation_id).sort(),
      excluded_rec_ids: [],
      qualitative_only_rec_ids: [],
      partial_ratio: 0,
      requires_hedge: false,
    };

    const structuralExposures = computeStructuralExposures(allRecs, mapping);

    const anyPending = allRecs.some((r) => r.quantified_impact.pending_reconciliation === true);

    const roiFraming = computeRoiFraming(
      estateComp.value,
      taxComp.value,
      yieldComp.value,
      implementationCost,
    );

    return {
      estate_tax_savings_total: estateComp.value,
      annual_income_tax_savings_total: taxComp.value,
      annual_yield_capture_total: yieldComp.value,
      insurance_face_amount_total: insuranceComp.value,
      recommended_implementation_cost_estimate: implementationCost,
      structural_exposures_eliminated: structuralExposures,
      any_pending_reconciliations: anyPending,
      transaction_window: options.transactionWindow ?? null,
      roi_framing: roiFraming,
      _aggregator_flags: flags,
      _metric_provenance: provenance,
    };
  } catch (err) {
    return fail(`Unexpected error in aggregate metrics builder: ${(err as Error).message}`);
  }
}
