# Stage 4 Deterministic-Glue: Aggregate Metrics Builder

**Type:** Deterministic. NO LLM call. Pure rules engine.

**Purpose:** Compute cross-rec aggregate metrics (estate_tax_savings_total, annual_income_tax_savings_total, structural_exposures_eliminated, etc.) that Stage 4's prose generation references. The Executive Summary's whitelist check validates against these aggregates plus per-rec values from sequenced_plan.

**Critical:** This is the builder that produces inputs the fabrication-prevention discipline depends on. If aggregate metrics are wrong, prose either fabricates numbers (bad) or fails QC (forces regeneration cycle, costs tokens). It has to be right.

**Input:** SequencedPlan (Stage 3 output)

**Output:** AggregateMetrics object (full schema below)

---

## Three-Tier Discipline (Per Compliance Patch 2)

For each metric, walk the contributing recs and classify each by quantified_impact state:

- **State A (computed):** rec contributes its estimate.value to the sum
- **State B (blocked):** rec is excluded; rec_id added to metrics_with_partial_inputs
- **State C (firm-policy unresolved):** rec is excluded; rec_id added to metrics_with_partial_inputs
- **State D (qualitative-only):** rec contributes 0 to the sum; rec_id added to metrics_with_partial_inputs

Then compute:
total_recs = count of contributing recs
excluded_count = count of State B + State C recs
partial_ratio = excluded_count / total_recs (0 if total_recs is 0)

Three branches:

1. **partial_ratio > 0.5:** metric value = null. metrics_skipped_due_to_pending_reconciliation lists the metric and its excluded rec_ids.

2. **partial_ratio <= 0.5 AND remaining_contribution_sum > 0:** metric value = sum of contributing values (NumericValue or NumericRange). Tag with `requires_hedge: true` if metrics_with_partial_inputs is non-empty for this metric. metrics_with_partial_inputs lists the excluded and qualitative-only rec_ids.

3. **All contributing recs in State A:** metric value = clean sum. No flags for this metric.

This is the three-state output Stage 4's Executive Summary prompt branches on (Branch 1 / 2 / 3 in its system prompt).

---

## The Metrics

### estate_tax_savings_total

Contributors: recs where plan_section is "Recommendations — Estate Planning" AND the rec's category-tagged impact is "estate-tax savings".

For v1 detection: any rec in plan_section "Recommendations — Estate Planning" whose recommendation_id starts with "REC-EST-" AND whose source_file_path or rec metadata indicates estate-tax-savings impact. For v1 simple heuristic: any REC-EST-* rec contributes. (v2 should read the rec file's METADATA → Subcategory or Quantified Impact Framework's tagging field.)

For Holloway: REC-EST-006 (GRAT) ~$3M, REC-EST-008 (IDGT) ~$2.4M-$4M, REC-EST-004 (ILIT, secondary impact). Sum is ~$4.5M-$5M (matching Holloway exemplar).

### annual_income_tax_savings_total

Contributors: recs where category is "Tax" AND `quantified_impact.estimate.is_annual === true` (the field added in pipelineTypes per Top Priorities builder spec).

For Holloway: REC-TAX-001 (PTET) $73K-$148K/yr, REC-TAX-007 (§469 grouping) $180K-$280K/yr, plus smaller items.

### annual_yield_capture_total

Contributors: recs where plan_section is "Recommendations — Investment & Cash" AND `quantified_impact.estimate.is_annual === true`.

For Holloway: REC-INV-001 (Tiered Business Cash) ~$110K/yr.

### insurance_face_amount_total

Contributors: recs where category is "Risk & Insurance" AND quantified_impact.estimate is a face amount (one-time, large value).

Used by Risk & Insurance section, not Executive Summary directly. Provided for completeness.

### recommended_implementation_cost_estimate

Contributors: every selected rec's typical professional fees, per the rec file's Quantified Impact Framework cost subsection.

For v1 with no rec file loading: use a heuristic table by category:
- Estate Planning: $15K-$25K per rec for setup year, $2K-$5K annual
- Entity Structure: $10K-$20K per rec for setup year, minimal annual  
- Risk & Insurance: $1K-$3K annual (premium notwithstanding; this is implementation cost only)
- Tax: $5K-$10K per rec for setup year, $2K-$5K annual
- Investment: $2K-$5K per rec for setup year, minimal annual
- Other: $5K per rec setup, $2K annual

Sum across all selected recs. For Holloway with 25-40 recs, expect ~$80K-$150K range.

(v2 reads actual figures from each rec file's cost subsection.)

### structural_exposures_eliminated

A list (not a sum) of named structural exposures the plan addresses. v1 heuristic: maintain a hardcoded mapping from recommendation_id to exposure descriptor:

- REC-RSK-001 / REC-RSK-002 (buy/sell): "unfunded buy/sell"
- REC-ENT-001 (real estate separation): "real estate inside operating LLC"
- REC-EST-001 (will replacement): "stale will"
- REC-EST-004 (ILIT): "missing ILIT for estate liquidity"
- REC-ENT-002 (F-reorg): "operating-LLC structure suboptimal for transaction"
- REC-RSK-005 (umbrella liability): "insufficient liability coverage"
- (extend as recommendation files are reviewed)

For each rec in selected set with a mapping entry, include the descriptor. Deduplicate. Order by plan_section then alphabetically.

(v2 reads "WHY WE RECOMMEND IT" section's identified exposures from each rec file.)

### any_pending_reconciliations

Boolean. True if any rec in sequenced_plan has `quantified_impact.pending_reconciliation: true`.

### transaction_window

Verbatim from `client_profile.section_11.transaction_window` for PRE-EXIT archetype. Null otherwise. For v1, accept as input parameter to the builder (will be wired through orchestrator when client_profile flows through).

### roi_framing

Computed as:
total_benefit_5yr = estate_tax_savings_total + (annual_income_tax_savings_total + annual_yield_capture_total) × 5
ratio = total_benefit_5yr / recommended_implementation_cost_estimate

If either input is null, roi_framing is null. Otherwise format:

- ratio > 100 → ">100×"
- ratio 10-100 → "X×" rounded to nearest integer
- ratio range (when total_benefit is a NumericRange) → "X×–Y× depending on horizon"
- ratio < 10 → render as integer "X×"

For Holloway: estate ~$4.75M + (annual savings $250K-$330K + yield $110K) × 5y = $6.55M-$6.95M total benefit; cost ~$100K-$130K; ratio ~50x. Format: "~50×" or "funds professional fees many times over" (qualitative pool option).

---

## Output Schema

```typescript
export interface AggregateMetrics {
  estate_tax_savings_total: NumericValue | null;
  annual_income_tax_savings_total: NumericValue | null;
  annual_yield_capture_total: NumericValue | null;
  insurance_face_amount_total: NumericValue | null;
  recommended_implementation_cost_estimate: NumericValue | null;
  
  structural_exposures_eliminated: string[];
  any_pending_reconciliations: boolean;
  transaction_window: string | null;
  roi_framing: string | null;
  
  _aggregator_flags: AggregatorFlags;
  
  _metric_provenance: Record<string, MetricProvenance>;
}

export interface AggregatorFlags {
  metrics_with_partial_inputs: Array<{
    metric: string;
    excluded_rec_ids: string[];
    qualitative_only_rec_ids: string[];
    remaining_contributors: number;
  }>;
  metrics_skipped_due_to_pending_reconciliation: Array<{
    metric: string;
    reason: string;
    excluded_rec_ids: string[];
    qualitative_only_rec_ids: string[];
  }>;
}

export interface MetricProvenance {
  contributing_rec_ids: string[];
  excluded_rec_ids: string[];
  qualitative_only_rec_ids: string[];
  partial_ratio: number;
  requires_hedge: boolean;
}

export interface AggregateMetricsFailed {
  _builder_status: "FAILED";
  _failure_reason: string;
}
```

NumericValue type already exists in pipelineTypes.

---

## Implementation Requirements

1. **Module location:** `src/lib/orchestrator/glue/aggregateMetricsBuilder.ts`

2. **Function signature:**
```typescript
   export function buildAggregateMetrics(
     sequencedPlan: SequencedPlan,
     options?: {
       transactionWindow?: string | null;
       implementationCostHeuristic?: Map<RecommendationCategory, { setup: NumericValue; annual: NumericValue }>;
       structuralExposureMapping?: Map<string, string>;
     }
   ): AggregateMetrics | AggregateMetricsFailed
```

3. **Pure function. No throws. Same input → same output.**

4. **Schema:** add types to pipelineTypes.ts.

5. **NumericValue arithmetic helper functions** are needed for summing values (and ranges). Define in a shared util file:
   - `addNumericValues(a, b)` — sums two NumericValues, returns NumericValue or NumericRange
   - `extractMidpoint(v)` — returns single number from NumericValue (midpoint for ranges)
   - `multiplyNumericByScalar(v, scalar)` — for the 5-year multiplication in roi_framing
   - These should live in `src/lib/orchestrator/utils/numericValue.ts`

6. **Handle NumericRange correctly throughout.** When summing two ranges, sum lows-to-lows and highs-to-highs producing a wider range. Do NOT collapse to midpoints during summation.

---

## Test Requirements

Create `src/lib/orchestrator/glue/__tests__/aggregateMetricsBuilder.test.ts`:

### Test cases

1. **All State A contributors (clean sum)** — fixture with 3 estate recs, all State A computed. Expect estate_tax_savings_total = clean sum. _aggregator_flags empty for that metric.

2. **Partial inputs (state mix below 50% threshold)** — 4 estate recs: 3 State A + 1 State C. partial_ratio = 0.25 < 0.5. Expect non-null estate_tax_savings_total computed from 3 State A recs, with metrics_with_partial_inputs flagging the State C rec. Expect requires_hedge: true in MetricProvenance.

3. **Mostly excluded (state mix above 50% threshold)** — 4 estate recs: 1 State A + 3 State C. partial_ratio = 0.75 > 0.5. Expect estate_tax_savings_total = null. metrics_skipped_due_to_pending_reconciliation lists the metric.

4. **NumericRange summation** — fixture with 2 estate recs producing NumericRange impacts ($2M-$3M and $1.5M-$2.5M). Expect summed range $3.5M-$5.5M (lows-to-lows, highs-to-highs).

5. **Holloway-style fixture full run** — estate, tax, investment, insurance recs. Verify all five primary metrics populate. Verify structural_exposures_eliminated contains expected entries. Verify any_pending_reconciliations is true (PTET in State C). Verify roi_framing computes a ratio.

6. **Determinism** — 100 calls, byte-identical output.

7. **Empty plan** — no recs. All metrics null. structural_exposures_eliminated empty array. any_pending_reconciliations false. No errors thrown.

8. **State C only metric** — fixture where the only recs in a category are all State C. Metric is null. Flag set.

Use Node's node:test runner.

---

## What This Does NOT Do

- Does not call LLM
- Does not generate prose
- Does not compute any value not already present in sequenced_plan (no first-principles math)
- Does not write to disk
- Does not load KB files (heuristic tables for v1; rec-file reading is v2)
- Does not validate against the eventual Executive Summary's whitelist (the consumer of this builder's output handles that)
