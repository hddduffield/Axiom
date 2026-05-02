# Specialized Lens Contracts — Cash Flow / Investment / Insurance

**Type:** Architectural contract spec covering three sibling LLM-driven lens generators. Each lens is a single-call generator (not a multi-stage pipeline like the master Plan). Each consumes a master Plan + ClientProfile + optional supplemental uploads and produces a structured, typed lens output (CashFlowPlan / InvestmentPlan / InsurancePlan).

**Purpose:** The four "generators" originally conceived as siblings (Financial Plan, Cash Flow, Investment, Insurance) have been re-architected. The Financial Plan is the **mother** generator — it produces the master Plan via Stages 0–5. Cash Flow / Investment / Insurance are **lenses** on top of that master Plan: specialized views that take the master as input and project it through a domain-specific schema. A Plan can exist without any lens; a lens never exists without a parent Plan.

This separation is load-bearing for two reasons:
1. **Editorial coherence.** The master Plan owns selection, sequencing, quantification, and prose narrative. Lenses don't re-litigate selection — they translate selected recommendations into their domain's view.
2. **Cost and latency.** A lens is a single LLM call (~$0.50–$1.50 each). The master Plan is a multi-stage pipeline (~$5–$15). Forcing every advisor interaction through the master would be wasteful; lenses give cheap, focused outputs.

**Scope of this spec:** the *contracts* — input shapes, output shapes, algorithms, system-prompt outlines, test requirements. Implementation lands in Phase 5 of the build sequence. This spec is the contract that Phase 5 implementation must satisfy.

---

## Shared Lens Infrastructure

All three lenses share a common architectural pattern. New lens generators added in the future MUST conform to this pattern unless the spec is explicitly amended.

### Common input shape

```typescript
export interface LensInput {
  plan: Plan;                                  // master Plan; lens reads sequenced_plan + aggregate_metrics
  client_profile: ClientProfile;               // Stage 1 output, also persisted on the Plan
  supplemental_uploads?: SupplementalUpload[]; // optional client docs (statements, policies)
  focus?: string;                              // optional advisor-supplied steering (e.g., "emphasize Roth conversion modeling")
}

export interface SupplementalUpload {
  upload_id: string;
  upload_type:
    | "account_statement"
    | "policy_summary"
    | "tax_return"
    | "appraisal"
    | "other";
  redaction_applied: boolean;                  // True when PII redaction was run upstream
  extracted_text: string;                      // PII-redacted text content
  source_filename: string;
  uploaded_at: string;
}
```

`SupplementalUpload.extracted_text` is the redacted text the lens reads. The lens NEVER sees raw uploads — PII redaction is an upstream concern (separate spec). If `redaction_applied === false`, the lens harness MUST refuse to send the upload to the LLM and emit a flag in metadata.

`focus` is a free-text steering hint the advisor can provide ("emphasize Roth conversion modeling," "prioritize disability gap analysis"). The lens system prompt instructs the LLM to weight focus areas more heavily but never let focus override schema requirements.

### Common API client structural interface

Lenses use the same structural-interface pattern as Stage 1 / Stage 2:

```typescript
export interface LensApiClient {
  messages: {
    create: (
      params: Anthropic.MessageCreateParamsNonStreaming,
    ) => Promise<Anthropic.Message>;
  };
}
```

This is satisfied by both the real Anthropic SDK and test mocks; injection is type-clean without casts. Each lens declares its own ApiClient interface (`CashFlowLensApiClient`, `InvestmentLensApiClient`, `InsuranceLensApiClient`) by re-exporting the same shape, mirroring the Stage 1 / Stage 2 convention. The duplication is intentional and trivially cheap; it keeps a future per-lens divergence (e.g., a lens that needs streaming) from forcing a cross-lens refactor.

### Common options shape

```typescript
export interface LensOptions {
  apiClient: LensApiClient;
  referenceDate?: Date;                        // for testing volatile-rate freshness when a lens reads volatile rates
  maxRetries?: number;                         // default 1 (i.e., 2 total attempts), matching Stage 1
}
```

### Anthropic call configuration (shared)

- **Model:** `claude-opus-4-7`
- **`max_tokens: 16000`** — lens output is more focused than full plan; 16K is comfortable headroom. (Compare: master Stage 3a uses 24K.)
- **`temperature: 0.0`**
- **System prompt loaded from disk on first call, cached in module scope.** Same loader pattern as Stage 1.
- **Prompt caching enabled.** The system prompt is large and stable; using Anthropic's `cache_control: { type: "ephemeral" }` block on the system prompt cuts per-call cost meaningfully across multiple lens invocations within a session.

### Retry, attempt history, schema validation

All three lenses use the same retry pattern as Stage 1:

1. Attempt 1: standard call.
2. On JSON parse failure with retries remaining: append assistant turn (raw response) + user turn ("Your previous response was not valid JSON. The error was: …. Output ONLY a JSON object now.").
3. On schema validation failure with retries remaining: append assistant turn + user turn enumerating zod validation errors.
4. On API error: no automatic retry beyond Anthropic SDK's built-in retry; return `*_failed` after one attempt.
5. After retries exhausted: return `{LensName}PlanFailed` with the appropriate failure_type.

`attempt_history` is recorded in metadata for every attempt:

```typescript
interface AttemptHistoryEntry {
  attempt_number: number;
  outcome: "success" | "json_parse_failed" | "schema_validation_failed" | "api_error";
  failure_details: string | null;
  duration_ms: number;
  input_tokens: number;
  output_tokens: number;
}
```

This is the same `AttemptHistoryEntry` shape Stage 1 already exports from `clientProfile.ts`. Lenses reuse it (re-export from the lens schema module), not redefine it.

### Common metadata fields (LensMetadata)

Every lens output includes `_metadata` with the shared base:

```typescript
export interface LensMetadata {
  stage_version: string;                       // e.g., "cash-flow-lens-1.0.0"
  model_used: string;                          // "claude-opus-4-7"
  input_token_count: number;
  output_token_count: number;
  cache_creation_input_tokens: number;         // prompt-cache write tokens
  cache_read_input_tokens: number;             // prompt-cache read tokens
  attempts_made: number;
  attempt_history: AttemptHistoryEntry[];
  duration_ms: number;
  source_plan_id: string;                      // FK back to Plan
  source_plan_version: number;                 // Plan.plan_version at lens-generation time
  generated_at: string;                        // ISO 8601
  generated_by_advisor_id: string;
  total_cost_cents: number;                    // computed from token counts × Anthropic pricing
}
```

The lens-specific identity fields (`cash_flow_plan_id`, `plan_version` at the lens level, `status`, etc.) live in the lens body, not metadata.

### Schema validation gates

Each lens defines its own zod schema in `src/lib/orchestrator/schemas/{lensName}Plan.ts`. Schema-validate every response. Failures with retries remaining → retry. Failures after retries exhausted → return `*_failed` with `validation_errors[]` enumerated.

Common cross-lens schema invariants:
- `_metadata.attempt_history.length === _metadata.attempts_made`
- `_metadata.attempt_history[last].outcome === "success"` when the result is a success type
- `source_plan_id` field on the lens body matches `_metadata.source_plan_id`
- `plan_version` (lens body) is a positive integer, independent of the master Plan's version
- `status: "draft" | "delivered"` is required

### Cost tracking per lens generation

Cost computation is deterministic post-call:

```typescript
total_cost_cents = round(
  (input_tokens × OPUS_INPUT_PER_TOKEN_CENTS) +
  (output_tokens × OPUS_OUTPUT_PER_TOKEN_CENTS) +
  (cache_creation_input_tokens × OPUS_CACHE_WRITE_PER_TOKEN_CENTS) +
  (cache_read_input_tokens × OPUS_CACHE_READ_PER_TOKEN_CENTS)
);
```

Constants live in a shared pricing module (`src/lib/orchestrator/utils/pricing.ts`, to be created in Phase 5). The lens harness records the result in `_metadata.total_cost_cents` and the Plan record's downstream rollup.

### Common BucketName type (used by Cash Flow + Investment)

```typescript
export type BucketName = "emergency_fund" | "tax_free" | "tax_deferred" | "taxable";
```

Defined in the Cash Flow lens schema module and imported by the Investment lens schema. Insurance does not reference buckets.

### Failure-type union (per lens)

Each lens follows the same shape:

```typescript
export interface {LensName}PlanFailed {
  _lens_status: "FAILED";
  _failure_type:
    | "json_parse_failed"
    | "schema_validation_failed"
    | "api_error"
    | "max_retries_exceeded"
    | "missing_redaction"            // when supplemental_upload had redaction_applied: false
    | "plan_not_persisted";          // when input plan is in draft (lenses require delivered or in_review)
  _failure_reason: string;
  _failure_context: {
    parse_error?: string;
    validation_errors?: string[];
    raw_response?: string;
    parsed_response?: unknown;
    api_error?: string;
    upload_id?: string;
    attempts_made: number;
  };
  _metadata: Partial<LensMetadata>;
}
```

### Module / file layout (shared)

```
src/lib/orchestrator/lenses/
├── cashFlowLens.ts                              (Phase 5)
├── cashFlow.system.md                           (Phase 5)
├── investmentLens.ts                            (Phase 5)
├── investment.system.md                         (Phase 5)
├── insuranceLens.ts                             (Phase 5)
├── insurance.system.md                          (Phase 5)
└── __tests__/
    ├── cashFlowLens.test.ts                     (Phase 5)
    ├── investmentLens.test.ts                   (Phase 5)
    └── insuranceLens.test.ts                    (Phase 5)

src/lib/orchestrator/schemas/
├── cashFlowPlan.ts                              (Phase 5)
├── investmentPlan.ts                            (Phase 5)
└── insurancePlan.ts                             (Phase 5)
```

### Common function signature pattern

```typescript
// Cash Flow
export async function generateCashFlowPlan(
  input: LensInput,
  options: LensOptions,
): Promise<CashFlowPlan | CashFlowPlanFailed>;

// Investment
export async function generateInvestmentPlan(
  input: LensInput,
  options: LensOptions,
): Promise<InvestmentPlan | InvestmentPlanFailed>;

// Insurance
export async function generateInsurancePlan(
  input: LensInput,
  options: LensOptions,
): Promise<InsurancePlan | InsurancePlanFailed>;
```

All three return-types are unions of the success type and the failed type. **No throws.** All errors caught and returned as the failed type, mirroring Stage 1 discipline.

### Pre-flight checks (deterministic, before LLM call)

Each lens runs the same pre-flight checks before sending the LLM call:

1. **Plan-status check.** `input.plan.status === "draft"` is rejected with `plan_not_persisted` failure. Lenses generate against `in_review` or `delivered` plans only — generating a lens against a still-being-iterated draft creates traceability problems.
2. **Redaction check.** Every `supplemental_uploads[i].redaction_applied === true`. If any upload fails this check, return `missing_redaction` failure with the offending `upload_id`.
3. **ClientProfile schema sanity.** The input ClientProfile validates against `ClientProfileSchema`. (Should be true by construction since it came from Stage 1; a tripwire here means an upstream bug.)

### Cross-lens architectural invariants

- **Lenses are single-call.** No multi-stage pipeline within a lens. If a lens grows beyond a single LLM call, that's a signal it should split into sibling lenses, not a multi-stage internal pipeline.
- **Lenses do not generate ActionItems in v1.** Lens output is advisory; nothing in a lens flows into the Tracker. v1.5 backlog: lens-derived ActionItems with the same lifecycle infrastructure as master-Plan ActionItems.
- **Lenses do not call other lenses.** Cross-lens coordination (e.g., Cash Flow's surplus distribution informing Investment's allocation) happens at the *advisor* level — the advisor reviews lens outputs together. Programmatic coordination is v1.5+.
- **Lenses are idempotent over inputs.** Two lens runs over identical inputs MUST produce schema-equivalent outputs (modulo LLM stochastic variation, which `temperature: 0.0` minimizes). Re-running a lens is cheap and safe.

---

## Cash Flow Lens

### Type

Single-call LLM lens. Reads master Plan + ClientProfile + optional account statements. Emits CashFlowPlan with three views: Hub, Tax Triangle, Distribution Plan.

### Purpose

Translate the master Plan's bucketing implications into a concrete cash-flow strategy. The lens computes:
- **Hub view** — the four-bucket allocation (emergency fund / tax-free / tax-deferred / taxable), with current balances, target balances, recommended monthly contributions, and 10-year / 20-year projections.
- **Tax Triangle view** — current vs. target percentages across the three tax-treatment buckets, with rationale and rebalancing steps.
- **Distribution Plan view** — year-by-year withdrawal sequence in retirement, including bucket-aware ordering, Roth conversion opportunity assessment, and slider-config metadata for the Phase 6 interactive UI.

### Input

```typescript
LensInput where:
  plan.sequenced_plan         // includes Roth conversion recs, retirement contribution recs, etc.
  plan.aggregate_metrics      // includes annual_yield_capture_total if Investment Lens has run
  client_profile.personal_balance_sheet  // current bucket positions
  client_profile.cash_flow    // monthly inflows / outflows / surplus
  client_profile.income       // K-1, W-2, AGI
  client_profile.tax_status   // marginal rate, residency
  client_profile.client_and_family.primary_owner.date_of_birth  // for retirement-year derivation
  supplemental_uploads        // optional account statements
  focus                       // optional ("emphasize Roth conversion", etc.)
```

### Output Schema (CashFlowPlan)

```typescript
export interface CashFlowPlan {
  cash_flow_plan_id: string;                   // UUID v4
  source_plan_id: string;                      // FK → Plan
  plan_version: number;                        // lens-level version, increments on regeneration
  generated_at: string;
  generated_by_advisor_id: string;
  status: "draft" | "delivered";

  // ─── Hub View ────────────────────────────────────────────────────────
  hub: {
    emergency_fund: BucketAllocation;
    tax_free: BucketAllocation;
    tax_deferred: BucketAllocation;
    taxable: BucketAllocation;

    monthly_inflow: NumericValue;
    monthly_fixed_expenses: NumericValue;
    monthly_discretionary: NumericValue;
    monthly_surplus: NumericValue;

    surplus_distribution: Record<BucketName, NumericValue>;

    projection_10yr: BucketProjection;
    projection_20yr: BucketProjection;
  };

  // ─── Tax Triangle View ───────────────────────────────────────────────
  tax_triangle: {
    current_tax_free_pct: number;
    current_tax_deferred_pct: number;
    current_taxable_pct: number;

    target_tax_free_pct: number;
    target_tax_deferred_pct: number;
    target_taxable_pct: number;

    current_position: { x: number; y: number };
    target_position: { x: number; y: number };

    rationale: string;
    rebalancing_steps: string[];
  };

  // ─── Distribution Plan View ──────────────────────────────────────────
  distribution_plan: {
    expected_retirement_year: number;
    annual_distribution_target: NumericValue;

    projected_buckets_at_retirement: {
      tax_free: NumericValue;
      tax_deferred: NumericValue;
      taxable: NumericValue;
    };

    distribution_strategy: DistributionStep[];

    roth_conversion_recommendation: {
      recommended: boolean;
      rationale: string;
      annual_conversion_amount: NumericValue | null;
      conversion_window_years: number | null;
      tax_savings_estimate: NumericValue | null;
    };

    sliders: {
      retirement_age_range: [number, number];
      annual_distribution_range: [NumericValue, NumericValue];
      conversion_amount_range: [NumericValue, NumericValue];
    };
  };

  // ─── Reasoning ───────────────────────────────────────────────────────
  rationale: string;
  recommendations: string[];

  _metadata: LensMetadata;
}

export interface BucketAllocation {
  current_balance: NumericValue;
  target_balance: NumericValue;
  monthly_contribution_recommended: NumericValue;
  account_types_in_bucket: string[];
  tax_treatment: "tax_free" | "tax_deferred" | "taxable" | "emergency";
  rationale: string;
}

export interface BucketProjection {
  emergency_fund_balance: NumericValue;
  tax_free_balance: NumericValue;
  tax_deferred_balance: NumericValue;
  taxable_balance: NumericValue;
  total_balance: NumericValue;
  assumptions: string;                         // explicit growth-rate / contribution-rate assumptions
}

export interface DistributionStep {
  year: number;
  age_at_year: number;
  withdrawal_from_tax_free: NumericValue;
  withdrawal_from_tax_deferred: NumericValue;
  withdrawal_from_taxable: NumericValue;
  estimated_tax_owed: NumericValue;
  remaining_balance: NumericValue;
  notes: string;                               // free-text annotation per year
}
```

### Algorithm (LLM-internal, encoded in system prompt)

1. **Parse current bucket positions** from `client_profile.personal_balance_sheet`:
   - emergency_fund ← liquid_assets categorized as cash / money-market / high-yield-savings.
   - tax_free ← Roth IRAs, Roth 401(k)s, HSAs, life-insurance cash value (when applicable).
   - tax_deferred ← Traditional IRAs, Traditional 401(k)s, deferred comp, profit-sharing.
   - taxable ← brokerage, savings (excluding emergency-fund portion), business equity post-exit (when post-transaction archetype).
2. **Compute target bucket allocations.**
   - emergency_fund target = 3–6 × `client_profile.cash_flow.monthly_outflows` (monthly fixed expenses). Default to 4× unless client has high income volatility (use 6×) or stable W-2 (use 3×).
   - tax-bucket targets derived from Tax Triangle math (next step).
3. **Compute monthly surplus** = `monthly_inflow - monthly_fixed_expenses - monthly_discretionary`. If negative, output a flag in `recommendations[]` ("expenses exceed income; budget review required") and proceed with target balances derived from existing positions only.
4. **Recommend surplus distribution** across buckets given client's stage of life:
   - Pre-retirement (>15 years to retirement): bias to tax_deferred up to employer-match cap, then tax_free, then taxable.
   - Mid-career (5–15 years): balance tax_deferred and tax_free; redirect new contributions toward Roth if marginal rate is currently low or expected to rise.
   - Near-retirement (<5 years): bias to taxable + emergency_fund preservation; consider Roth conversions during low-income transition years.
5. **Project 10-year and 20-year balances** using growth-rate assumptions:
   - tax_free / taxable equity-heavy buckets: 6% nominal annual growth (firm default; system prompt declares this constant).
   - tax_deferred mixed buckets: 5% nominal annual growth.
   - emergency_fund: 3% nominal annual growth (high-yield savings tracking).
   - Document the assumptions in `BucketProjection.assumptions` so the prose layer can quote them.
6. **Compute Tax Triangle current vs. target.**
   - current percentages from current balances.
   - target percentages derived from a firm rubric (system prompt encodes: "target ~30% tax_free / ~40% tax_deferred / ~30% taxable for HNW pre-retirement clients" — adjusted by archetype, age, income volatility, and any constraints surfaced by the master Plan).
   - position {x, y} maps to a 2D rendering coordinate (system prompt encodes the projection: x = tax_free_pct - taxable_pct; y = tax_deferred_pct - 50). UI consumes the coordinates as-is.
7. **Generate distribution plan** for retirement years (typically a 25–30 year horizon from `expected_retirement_year`). Year-by-year withdrawal sequence applies bucket-aware ordering:
   - Year 1–N (early retirement, pre-RMD): draw from taxable to fund living, leaving tax-deferred to grow.
   - Year N+ (RMD-active): take RMDs from tax_deferred first; fill remainder from taxable; reserve tax_free for the longest horizon.
   - Roth conversion windows (low-income years between retirement and RMDs): convert tax_deferred → tax_free up to the top of the current marginal bracket.
8. **Identify Roth conversion opportunity** if applicable:
   - `recommended: true` when client has substantial tax_deferred AND projected low-income years before RMDs AND current marginal rate likely lower than retirement marginal rate.
   - `annual_conversion_amount` derived from "fill the bracket to threshold" math.
   - `conversion_window_years` derived from years between retirement and RMD start.
   - `tax_savings_estimate` derived from arbitrage between current and projected RMD-era marginal rates.
   - When the master Plan already includes a Roth conversion recommendation (REC-RET-005-class), the lens should align — do not contradict the master Plan's direction; the lens may recommend a different conversion *amount* with explicit rationale.
9. **Generate slider configuration** for the Phase 6 UI:
   - `retirement_age_range`: [client_age_today + 5, client_age_today + 30] capped at 70 high.
   - `annual_distribution_range`: [0.5× current_expenses_annualized, 2× current_expenses_annualized].
   - `conversion_amount_range`: [0, total_tax_deferred_balance].
10. **Produce `rationale`** (3–6 sentences) and **`recommendations[]`** (5–12 bullet-shaped items).

### KB context required

The lens reads these KB files inline in the user turn (cached via prompt caching):
- `kb/v1_2/02_reference/02_federal_income_tax_limits.md` — current bracket thresholds, contribution limits.
- `kb/v1_2/02_reference/05_obbba_changes_summary.md` — current SALT cap, current PTET interactions.
- `kb/v1_2/02_reference/07_georgia_specifics.md` — state tax for Georgia residents (firm's primary jurisdiction).

Volatile rates are NOT used by the Cash Flow lens (no §7520-driven calculations).

### System prompt outline (~5,000 words)

1. **Role and goal** — "You are the Cash Flow Lens of Axiom. You take a master Plan and ClientProfile and produce a structured Cash Flow Plan covering Hub, Tax Triangle, and Distribution Plan views."
2. **Bucketing philosophy** — emergency-fund-first, layered above; tax-treatment mix tunes based on stage of life and marginal rate trajectory.
3. **Four-bucket model** — exact definitions of each bucket; account-type → bucket mapping rules; edge cases (life-insurance cash value as tax_free, HSA dual-status, deferred-comp 409A nuance).
4. **Tax Triangle math** — target percentages by archetype + age band; the 2D projection formula; rebalancing-steps generation (concrete actions: "redirect $X/month from tax_deferred contribution to Roth contribution").
5. **Distribution sequencing rules** — pre-RMD draw order; RMD-era draw order; Roth conversion window logic; survivor-considerations for couples.
6. **Roth conversion decision rubric** — full rubric covering when to recommend, how much, over what window, how to size against bracket thresholds.
7. **Projection assumptions** — the specific growth-rate constants (6% / 5% / 3%), withdrawal-tax assumptions, inflation handling. The prompt names every constant explicitly so plans can quote them.
8. **Slider configuration generation** — the formulas above, made deterministic.
9. **Rationale and recommendations format** — sentence-count caps, tone, mandatory inclusions.
10. **Output format strict** — JSON only, no preamble, no markdown fences. Schema reproduced.
11. **What NOT to do** — don't pick specific funds, don't quote specific tickers, don't recommend specific carriers (that's the Investment Lens / Insurance Lens). Don't contradict the master Plan's selected recommendations.
12. **Examples** — 2 worked examples (PRE-EXIT archetype and POST-EXIT archetype), each showing full CashFlowPlan output for a synthetic client.

System prompt cached via Anthropic prompt-caching `cache_control: { type: "ephemeral" }`.

### Test requirements

Standard mock test suite at `src/lib/orchestrator/lenses/__tests__/cashFlowLens.test.ts`:

1. **Mock API success — full Holloway-shaped input** → returns valid CashFlowPlan. Structural assertions: hub.emergency_fund.target_balance ≈ 4× monthly fixed expenses; tax_triangle current_*/target_* percentages sum to 100; distribution_plan.distribution_strategy.length ≥ 20; sliders well-formed; `_metadata.attempt_history.length === _metadata.attempts_made`.
2. **Mock API returns invalid JSON** → returns CashFlowPlanFailed with `json_parse_failed`.
3. **Mock API returns valid JSON but schema-invalid** (e.g., tax-triangle percentages > 100 sum) → returns CashFlowPlanFailed with `schema_validation_failed`.
4. **Mock API success with retry** — first invalid JSON, second valid → returns CashFlowPlan with `attempts_made: 2`.
5. **Plan in draft status** → returns CashFlowPlanFailed with `plan_not_persisted`.
6. **Supplemental upload missing redaction** → returns CashFlowPlanFailed with `missing_redaction` and the offending `upload_id`.
7. **API error (mock 500)** → returns CashFlowPlanFailed with `api_error`.
8. **Mock API success with `focus: "emphasize Roth conversion modeling"`** → roth_conversion_recommendation is populated and rationale references the focus directive.

Live Holloway test marked `{ skip: !process.env.RUN_LIVE_API_TESTS }` — placeholder for Phase 5 when live wiring is added. Real API calls cost ~$0.50–$1.00 each.

Use Node's `node:test` runner.

---

## Investment Lens

### Type

Single-call LLM lens. Reads master Plan + ClientProfile + optional redacted account statements. Emits InvestmentPlan with suitability assessment, current portfolio analysis, asset allocation target, asset location guidance, rebalancing triggers, and aggression dial guidance.

### Purpose

Translate the master Plan's investment-implications into a concrete portfolio strategy *at the type level*, not the security level. v1 produces portfolio-type recommendations (e.g., "Three-Fund Index Portfolio," "Tax-Efficient Direct Indexing") with reasoning. **v1 does NOT pick specific tickers, funds, or carrier products** — that's an editorial decision the advisor makes informed by the lens output. v1.5 introduces carrier-specific / ticker-specific guidance once a vetted product KB is integrated.

### Input

```typescript
LensInput where:
  plan.sequenced_plan
  plan.aggregate_metrics
  client_profile.personal_balance_sheet  // current investment positions
  client_profile.income                  // for suitability income-replacement math
  client_profile.client_and_family       // age, dependents
  client_profile.transaction_posture     // pre-exit vs. post-exit shifts allocation
  client_profile.goals_and_values        // stated risk preferences
  supplemental_uploads                   // optional redacted statements showing current holdings
  focus                                  // optional
```

### Output Schema (InvestmentPlan)

```typescript
export interface InvestmentPlan {
  investment_plan_id: string;
  source_plan_id: string;
  plan_version: number;
  generated_at: string;
  generated_by_advisor_id: string;
  status: "draft" | "delivered";

  // ─── Suitability ─────────────────────────────────────────────────────
  suitability: {
    risk_tolerance:
      | "conservative"
      | "moderate"
      | "moderate_growth"
      | "growth"
      | "aggressive";
    time_horizon_years: number;
    rationale: string;
    factors_considered: string[];
    risk_capacity_assessment: string;
    risk_willingness_assessment: string;
    suitability_reconciliation: string | null;
  };

  // ─── Current Portfolio (when statements provided) ────────────────────
  current_portfolio_assessment: {
    has_uploaded_statements: boolean;
    current_holdings_summary: string | null;
    diversification_assessment: string | null;
    fee_assessment: string | null;
    asset_location_assessment: string | null;
    issues_identified: string[];
  } | null;

  // ─── Recommendations ─────────────────────────────────────────────────
  recommended_portfolio_types: PortfolioRecommendation[];

  asset_allocation_target: {
    equity_pct: number;
    fixed_income_pct: number;
    cash_pct: number;
    alternative_pct: number;
    real_estate_pct: number;
    rationale: string;
  };

  asset_location_recommendations: {
    in_taxable_accounts: string[];
    in_tax_deferred_accounts: string[];
    in_tax_free_accounts: string[];
    rationale: string;
  };

  rebalancing_triggers: string[];

  aggression_dial_guidance: {
    dial_up_signals: string[];
    dial_down_signals: string[];
    current_position:
      | "dial_up_warranted"
      | "current_appropriate"
      | "dial_down_warranted";
    rationale: string;
  };

  rationale: string;
  recommendations: string[];

  _metadata: LensMetadata;
}

export interface PortfolioRecommendation {
  portfolio_type: string;
  description: string;
  appropriate_for_buckets: BucketName[];        // imported from Cash Flow lens schema
  expected_return_annualized: NumericValue;
  expected_volatility: NumericValue;
  rationale: string;
  alternatives_considered: string[];
}
```

### Algorithm (LLM-internal, encoded in system prompt)

1. **Assess suitability** by triangulating risk capacity (objective: can the client afford to lose money?) against risk willingness (subjective: stated preference). Drivers:
   - Age, dependents, time horizon to retirement
   - Net worth, income stability, business concentration
   - Transaction window (pre-exit illiquidity dominance shifts target down; post-exit liquidity allows re-allocation flexibility)
   - Stated values from `goals_and_values.raw_values_text` (key phrases: "aggressive growth," "preservation," "income," "legacy")
   - When risk capacity and risk willingness diverge, populate `suitability_reconciliation` with the resolution narrative (e.g., "stated preference for aggressive growth, but business concentration risk requires moderate stance until exit completes").
2. **Parse current holdings** from supplemental_uploads when provided. Set `has_uploaded_statements` accordingly. When statements are present, summarize:
   - holdings concentration (top 5 positions as % of total)
   - asset-class diversification
   - fee load (expense ratios cited where extractable; advisory fees if present)
   - asset location (are tax-inefficient holdings in taxable accounts? are munis in tax-deferred?)
   - issues (concentration risk, high fees, asset-location inefficiency, tax-loss-harvesting missed opportunities)
3. **Recommend portfolio types** appropriate for the client's situation. v1 uses a fixed catalog of broad portfolio types defined in the system prompt:
   - "Three-Fund Index Portfolio (Total Stock / Total International / Total Bond)"
   - "Tax-Efficient Direct Indexing"
   - "Factor-Tilted Equity (Value / Quality / Momentum)"
   - "Diversified Core + Satellite (Core index + tactical satellites)"
   - "Income-Focused Bond Ladder + Dividend Equity"
   - "Alternative Sleeve (private equity / private credit / hedged)" — reserved for accredited investors with appetite
   - "Concentrated Single-Stock Hedge Strategy (collar, exchange fund, charitable)" — for pre-exit founders with concentrated positions
   For each recommendation, declare appropriate buckets (`appropriate_for_buckets: BucketName[]`), expected return and volatility, rationale, and alternatives considered.
4. **Set asset allocation target** by translating risk_tolerance into equity/fixed-income/cash/alternative/real-estate percentages. System prompt encodes per-tolerance defaults:
   - conservative: 30/55/10/0/5
   - moderate: 50/40/5/0/5
   - moderate_growth: 65/25/3/2/5
   - growth: 75/15/2/3/5
   - aggressive: 85/8/1/3/3
   Adjust per archetype: PRE-EXIT clients with concentrated business equity already carry implicit equity exposure; the recommended *liquid-portfolio* target should bias toward fixed income / cash to hedge.
5. **Recommend asset location** — which holdings go in which accounts for tax efficiency:
   - Taxable accounts: tax-efficient equity (broad-market index, direct indexing for loss harvesting), municipal bonds for high-bracket clients.
   - Tax-deferred accounts: tax-inefficient fixed income (corporate bonds, high-yield, REITs), actively-managed equity with high turnover.
   - Tax-free accounts: highest-expected-return positions (small-cap, emerging markets, growth equity); positions intended for long-horizon legacy.
6. **Define rebalancing triggers** — concrete conditions that warrant rebalancing actions. System prompt encodes a default set: ±5% drift on any major asset class; tax-loss-harvesting opportunities; major life event (job change, exit completion, inheritance); annual review cadence.
7. **Provide aggression dial guidance** — when to dial up vs. dial down based on life stage and goals. Dial-up signals: post-exit liquidity, multi-decade horizon, no near-term cash needs, tax_free buckets dominant. Dial-down signals: imminent liquidity need (transaction, retirement transition, healthcare), volatility intolerance demonstrated, business-concentration shock event. Determine `current_position` based on the signals balance.
8. **Produce `rationale`** (4–6 sentences) and **`recommendations[]`** (6–10 items).

### KB context required

The Investment lens reads:
- `kb/v1_2/02_reference/02_federal_income_tax_limits.md`
- `kb/v1_2/02_reference/05_obbba_changes_summary.md`
- `kb/v1_2/02_reference/07_georgia_specifics.md` (for muni-bond residency analysis)

Volatile rates not used. Specific carrier KB not used (deferred to v1.5).

### System prompt outline (~5,000 words)

1. **Role and goal** — "You are the Investment Lens. You produce structured portfolio-type recommendations grounded in suitability, never picking specific securities."
2. **Suitability rubric** — capacity vs. willingness, the reconciliation narrative when they diverge, archetype-driven adjustments.
3. **Portfolio type catalog** — the seven canonical types listed above with full descriptions, appropriate-for matrices, and expected return/volatility baselines.
4. **Asset allocation framework** — per-tolerance defaults, archetype overlays, business-concentration adjustments.
5. **Asset location principles** — tax-efficient placement rules, the high-bracket muni-bond consideration, the Roth-bucket-for-highest-growth principle.
6. **Rebalancing logic** — drift thresholds, opportunistic triggers (tax-loss harvest, life events).
7. **Aggression dial mechanics** — life-stage and goal-driven dial signals; how to weigh competing signals.
8. **Statement parsing rules** — when supplemental_uploads are present, what to extract and how to summarize.
9. **Coordination with master Plan** — never contradict the master Plan's selected investment recommendations (REC-INV-*); when the master Plan recommends direct indexing, the lens elaborates on it; when the master Plan defers, the lens may propose; when the master Plan declines a strategy, the lens does not resurrect it.
10. **Output format strict** — JSON only, schema reproduced, examples.
11. **What NOT to do** — no specific securities or funds in v1; no specific carrier products; no advisory fee or platform recommendations; do not pick managers.
12. **Examples** — 2 worked examples covering different risk profiles and presence/absence of uploaded statements.

### Test requirements

Standard mock test suite at `src/lib/orchestrator/lenses/__tests__/investmentLens.test.ts`:

1. **Mock API success without supplemental_uploads** → `current_portfolio_assessment.has_uploaded_statements === false`; rest of fields populated; allocation percentages sum to 100.
2. **Mock API success with supplemental_uploads provided** → `has_uploaded_statements === true`; `current_holdings_summary !== null`; `issues_identified.length >= 0`.
3. **Mock API returns invalid JSON** → InvestmentPlanFailed with `json_parse_failed`.
4. **Mock API returns allocation percentages summing to 105** → schema validation fails.
5. **Mock API returns risk_tolerance not in enum** → schema validation fails.
6. **Plan in draft status** → InvestmentPlanFailed with `plan_not_persisted`.
7. **Supplemental upload missing redaction** → InvestmentPlanFailed with `missing_redaction`.
8. **Mock API success with retry** → returns InvestmentPlan with `attempts_made: 2`.
9. **API error** → InvestmentPlanFailed with `api_error`.

Live Holloway test marked skip — placeholder.

---

## Insurance Lens

### Type

Single-call LLM lens. Reads master Plan + ClientProfile + optional redacted policy summaries. Emits InsurancePlan with current coverage analysis, gap identification, product-type recommendations, implementation timeline, and conversion recommendations.

### Purpose

Translate the master Plan's risk-management implications into a structured insurance strategy *at the product-type level*. v1 produces product-type recommendations (term, perm whole, perm UL, VUL, individual disability, LTC, LTC hybrid, fixed/variable/indexed annuities, buy/sell funding, key person, business overhead) with reasoning. **v1 does NOT name specific carriers or specific products** — that requires carrier-product KB integration which is v1.5 work. The MassMutual product KB integration is the canonical v1.5 milestone for this lens.

### Input

```typescript
LensInput where:
  plan.sequenced_plan                        // includes ILIT, buy/sell, umbrella, etc.
  plan.aggregate_metrics                     // includes insurance_face_amount_total
  client_profile.insurance                   // current policies inventory
  client_profile.client_and_family           // ages, dependents, health flags
  client_profile.entities                    // for business coverage analysis
  client_profile.transaction_posture         // shapes timing
  client_profile.estate_planning             // ILIT coordination
  supplemental_uploads                       // optional policy summaries
  focus                                      // optional
```

### Output Schema (InsurancePlan)

```typescript
export interface InsurancePlan {
  insurance_plan_id: string;
  source_plan_id: string;
  plan_version: number;
  generated_at: string;
  generated_by_advisor_id: string;
  status: "draft" | "delivered";

  // ─── Current Coverage Analysis ───────────────────────────────────────
  current_coverage_summary: {
    life: PolicyAnalysis[];
    disability: PolicyAnalysis[];
    long_term_care: PolicyAnalysis[];
    annuities: PolicyAnalysis[];
    business_coverage: PolicyAnalysis[];
  };

  // ─── Gap Analysis ────────────────────────────────────────────────────
  identified_gaps: InsuranceGap[];

  // ─── Recommendations ─────────────────────────────────────────────────
  recommendations: InsuranceProductRecommendation[];

  // ─── Implementation Timeline ─────────────────────────────────────────
  implementation_timeline: ImplementationStep[];

  // ─── Conversion Recommendations ──────────────────────────────────────
  conversion_recommendations: ConversionRecommendation[];

  // ─── Cross-cutting ───────────────────────────────────────────────────
  business_estate_coordination: string;        // how insurance coordinates with buy/sell + estate plan
  funding_strategy: string;                    // how premiums get funded

  rationale: string;
  recommendations_summary: string[];

  _metadata: LensMetadata;
}

export interface PolicyAnalysis {
  policy_type: string;
  carrier: string | null;
  insured: string;
  current_face_amount: NumericValue | null;
  current_cash_value: NumericValue | null;
  current_premium: NumericValue | null;
  appropriate_for_situation: boolean;
  issues_identified: string[];
  recommendation:
    | "keep_as_is"
    | "modify"
    | "replace"
    | "supplement"
    | "convert"
    | "exchange_1035";
  rationale: string;
}

export interface InsuranceGap {
  gap_type:
    | "life_underinsured"
    | "disability_underinsured"
    | "ltc_uncovered"
    | "buy_sell_unfunded"
    | "key_person_uncovered"
    | "umbrella_inadequate"
    | "professional_liability_inadequate"
    | "other";
  severity: "critical" | "material" | "minor";
  description: string;
  impact_if_unaddressed: string;
}

export interface InsuranceProductRecommendation {
  recommendation_id: string;
  product_type:
    | "term_life"
    | "permanent_life_whole"
    | "permanent_life_universal"
    | "vul"
    | "individual_disability"
    | "ltc"
    | "ltc_hybrid"
    | "annuity_fixed"
    | "annuity_variable"
    | "annuity_indexed"
    | "buy_sell_funding"
    | "key_person"
    | "business_overhead";
  insured: string;
  recommended_face_amount: NumericValue | null;
  recommended_premium: NumericValue | null;
  product_features: string[];
  why_this_type: string;
  why_this_amount: string;
  funding_source: string;
  underwriting_considerations: string[];
  alternatives_considered: string[];
  expected_implementation_timeline: TimingBucket;
  carrier_specific_recommendation: string | null;  // v1: always null; v1.5: populated when carrier KB integrated
}

export interface ImplementationStep {
  step_number: number;
  description: string;
  timing_bucket: TimingBucket;
  action_owner: ActionOwner;
  prerequisites: string[];
}

export interface ConversionRecommendation {
  conversion_type:
    | "term_to_perm"
    | "1035_exchange"
    | "ira_to_annuity"
    | "policy_lapse_replacement"
    | "other";
  source_policy_id: string;
  target_product_type: string;
  rationale: string;
  expected_timing: TimingBucket;
  tax_implications: string;
}
```

### Algorithm (LLM-internal, encoded in system prompt)

1. **Inventory current coverage** from `client_profile.insurance` plus any uploaded policy summaries. For each policy:
   - extract policy_type, carrier (if known), insured, face amount, cash value, premium
   - assess `appropriate_for_situation` (true/false)
   - enumerate `issues_identified[]` (mismatched coverage type, expensive premium, policy lapse risk, beneficiary stale, ownership wrong-trust, conversion deadline approaching)
   - assign `recommendation` enum: keep_as_is / modify / replace / supplement / convert / exchange_1035
2. **Identify gaps by category:**
   - **life_underinsured**: face amount < 10–20× annual income for primary breadwinner with dependents (rule of thumb; refine per dependents count and net worth).
   - **disability_underinsured**: own-occupation coverage < 60–70% of earned income.
   - **ltc_uncovered**: client age > 50 OR aging-parent dependents present, no LTC coverage in place.
   - **buy_sell_unfunded**: master Plan recommends a buy/sell agreement, but no funding insurance exists.
   - **key_person_uncovered**: business has key-person dependence, no key-person life or disability coverage.
   - **umbrella_inadequate**: net worth > $5M, umbrella coverage < $5M (firm rule of thumb; system prompt encodes).
   - **professional_liability_inadequate**: client is a licensed professional (physician, attorney, etc.) with no E&O or low limits.
   Severity:
   - **critical**: catastrophic unfunded exposure (uninsured $10M+ buy/sell, $5M+ umbrella gap with HNW exposure).
   - **material**: significant exposure but not catastrophic.
   - **minor**: optimization-level (current coverage works but suboptimal).
3. **Recommend product types for each gap.** For each recommendation, articulate `why_this_type` (why term vs. perm, why fixed annuity vs. variable, etc.) and `why_this_amount` (gap math: income × multiplier - existing coverage). Funding source must be stated (cash flow, OPM via deferred comp, premium financing, business cash). Underwriting considerations include health flags from ClientProfile, age windows, exam requirements.
4. **Sequence implementation timeline.** Underwriting times vary: term life 2–6 weeks, permanent 6–12 weeks, large face amounts (>$5M) 8–16 weeks with reinsurer involvement. Disability 4–10 weeks. LTC 8–16 weeks with cognitive testing for older applicants. Order steps so:
   - underwriting-intensive applications start first (parallel to allow simultaneous progress)
   - 1035 exchanges sequence after replacement coverage is in force (never lapse old before new is bound)
   - ILIT-owned policies wait until trust is established (coordinate with master Plan's REC-EST-004)
   - buy/sell funding awaits buy/sell agreement execution
5. **Identify conversion opportunities.**
   - Term policies approaching conversion deadline → recommend term_to_perm conversion if client wants permanent coverage and has health that could degrade.
   - Existing permanent policies with poor performance → 1035_exchange to better-performing contract.
   - IRA balances ill-suited to current plan → ira_to_annuity for clients seeking guaranteed income (high bar; only when income certainty trumps growth potential).
   - Lapsing-risk policies with cash value → replacement or lapse to capture value.
6. **Coordinate with master Plan.**
   - ILIT (REC-EST-004): if master Plan includes ILIT, recommendations specify ILIT-owned ownership for new permanent policies; conversion recommendations for existing personally-owned policies note ILIT transfer mechanics (3-year rule).
   - Buy/sell (REC-SUC-* class): if master Plan includes buy/sell, insurance lens populates buy_sell_funding recommendation matched to entity ownership structure.
   - Estate plan (REC-EST-001): umbrella adequacy framed against the estate-tax exposure.
7. **Note funding strategy.** Free-text narrative explaining how premiums get funded across the recommendations: cash flow, deferred-comp accumulation, premium-financed for HNW, business-paid for buy-sell and key-person.
8. **Produce `rationale`** and **`recommendations_summary[]`**.

### KB context required

- `kb/v1_2/02_reference/11_section_101_life_insurance.md`
- `kb/v1_2/02_reference/01_federal_estate_gift_gst.md` (for ILIT and estate-tax-funding analysis)
- `kb/v1_2/02_reference/05_obbba_changes_summary.md`

Volatile rates not used by Insurance lens at v1 (annuity rate analysis is qualitative; specific annuity quoting deferred to v1.5).

### System prompt outline (~6,000 words)

1. **Role and goal** — "You are the Insurance Lens. You produce structured insurance product-type recommendations grounded in gap analysis."
2. **Insurance product catalog by type** — full descriptions of each product_type enum value, what each is for, when to recommend, common pitfalls.
3. **Gap analysis framework** — the eight gap types listed above, severity rubric, the rules of thumb for sizing each.
4. **Sequencing rules** — underwriting times, premium funding sequencing, never-lapse-before-new-is-bound, ILIT-ownership timing rules.
5. **1035 exchange rules** — when valid, tax-free vs. taxable boot, basis carryover, common abuses to avoid.
6. **ILIT coordination** — 3-year lookback rule, owner-applicant-beneficiary structure, Crummey notice mechanics (cross-reference `09_crummey_mechanics.md`).
7. **Buy/sell funding mechanics** — entity-purchase vs. cross-purchase, cross-purchase via insurance LLC for >2 owners, valuation triggers.
8. **Key-person and business overhead** — sizing methodology, deductibility rules, beneficiary-equals-business mechanics.
9. **Coordination with master Plan** — never contradict; align with ILIT, buy/sell, umbrella recs.
10. **Output format strict** — JSON only, schema reproduced, examples.
11. **What NOT to do (v1)** — do not name specific carriers; do not name specific MassMutual products (v1.5); do not quote specific premiums (give ranges in narrative if needed); do not predict carrier underwriting outcomes definitively (always frame as "subject to underwriting").
12. **Examples** — 2–3 worked examples (PRE-EXIT founder with concentrated estate-tax exposure; HNW couple with mature whole-life portfolio in need of restructuring; aging parent with LTC gap).

### Test requirements

Standard mock test suite at `src/lib/orchestrator/lenses/__tests__/insuranceLens.test.ts`:

1. **Mock API success — full Holloway-shaped input** → returns valid InsurancePlan. Structural assertions: `current_coverage_summary` populated for all five categories (arrays may be empty); `identified_gaps[]` non-empty for HNW; `recommendations[]` non-empty; every recommendation has `carrier_specific_recommendation: null` (v1 invariant); `implementation_timeline` non-empty.
2. **Mock API returns invalid JSON** → InsurancePlanFailed with `json_parse_failed`.
3. **Mock API returns recommendation with non-null `carrier_specific_recommendation`** → schema validation fails (v1 invariant: must be null).
4. **Mock API returns gap with severity not in enum** → schema validation fails.
5. **Mock API returns recommendation with `product_type` not in enum** → schema validation fails.
6. **Plan in draft status** → InsurancePlanFailed with `plan_not_persisted`.
7. **Supplemental upload missing redaction** → InsurancePlanFailed with `missing_redaction`.
8. **Mock API success with retry** → InsurancePlan with `attempts_made: 2`.
9. **API error** → InsurancePlanFailed with `api_error`.
10. **Mock API success where master Plan has REC-EST-004 ILIT** → at least one InsuranceProductRecommendation references ILIT ownership in `product_features` or `funding_source`; `business_estate_coordination` mentions ILIT.

Live Holloway test marked skip — placeholder.

---

## Common Implementation Requirements (Phase 5)

For all three lenses, Phase 5 implementation must satisfy:

1. **Module location:** `src/lib/orchestrator/lenses/{cashFlow|investment|insurance}Lens.ts`.
2. **Schema location:** `src/lib/orchestrator/schemas/{cashFlow|investment|insurance}Plan.ts` (zod schemas + inferred types).
3. **System prompt location:** `src/lib/orchestrator/lenses/{cashFlow|investment|insurance}.system.md` (markdown, loaded at first call, cached).
4. **Function signature:** `generate{Lens}Plan(input: LensInput, options: LensOptions): Promise<{Lens}Plan | {Lens}PlanFailed>`.
5. **No throws.** All errors caught and returned as `*Failed`.
6. **Same retry / attempt_history pattern as Stage 1.**
7. **`max_tokens: 16000`**, `temperature: 0.0`, `model: "claude-opus-4-7"`.
8. **Schema validation strict** with retry on failure.
9. **Anthropic prompt caching enabled** on the system prompt.
10. **Test pattern matches Stage 1**: Node `node:test` runner; MockAnthropicClient for unit tests; live Holloway test gated on `RUN_LIVE_API_TESTS` env var.
11. **Pre-flight checks** (deterministic, before LLM call): plan-status check (must not be `draft`), redaction check (every supplemental_upload must have `redaction_applied: true`), ClientProfile schema sanity.
12. **Cost computation post-call** with the constants in `pricing.ts` (Phase 5 work).
13. **Lens metadata recorded on the Plan record** at lens-generation time (`Plan.cash_flow_plan_id` etc.) when the lens completes successfully and the advisor commits the lens (separate from lens generation; an unsaved lens does not link).

---

## What This Does NOT Do

- Does NOT implement the lenses. Implementation is Phase 5; this spec is the contract.
- Does NOT include MassMutual or any carrier-specific product knowledge. v1.5 work; v1 emits `carrier_specific_recommendation: null` always.
- Does NOT include specific tickers, fund symbols, or platform recommendations. v1.5 work for Investment lens.
- Does NOT include UI for lens consumption. Phase 6 work — viewing lens output, slider interactivity, lens-vs-master comparison views.
- Does NOT generate ActionItems from lens output. Lenses are advisory in v1; lens recommendations do not flow into the Tracker. v1.5 backlog: lens-derived ActionItems with the same lifecycle infrastructure as master-Plan ActionItems.
- Does NOT define multi-lens coordination logic (Cash Flow influencing Investment, etc.). v1.5 backlog.
- Does NOT define re-generation cadence or auto-refresh policy. Lenses are user-triggered in v1.
- Does NOT define lens-output PDF rendering. Separate spec when PDF export for lenses is built.
- Does NOT define authentication or authorization rules for lens generation. Separate auth spec.
- Does NOT define database migration scripts for lens persistence. Phase 6.
- Does NOT define the Plan ↔ Lens FK update mechanics in detail (e.g., what happens when the master Plan is regenerated after a lens exists). Outlined in the Plan Entity spec under "Lens-plan refresh"; lens-side mechanics deferred to Phase 5/6.

---

## V1.5 Backlog (Documented in Spec)

- **MassMutual product KB integration for Insurance Lens.** Adds a vetted carrier-product catalog the LLM can quote from. Once integrated, `carrier_specific_recommendation` populates with concrete product names (e.g., "MassMutual Whole Life Legacy 100"). The schema field already exists at v1 with `null`; no schema migration needed.
- **Carrier-specific recommendations across all three lenses** — Investment lens picks specific managers / funds where allowed; Insurance lens names carrier products; Cash Flow lens may name specific high-yield-savings products.
- **Lens-derived ActionItems** — InsuranceProductRecommendation, ConversionRecommendation, and key Investment recommendations should flow into the Tracker as ActionItems with the same lifecycle metadata pattern Stage 3a uses. Requires a new lens-to-ActionItem extraction step (analogous to but smaller than Stage 3a).
- **Multi-lens coordination** — Cash Flow's surplus-distribution recommendation should be readable by the Investment lens to inform new-money allocation; Investment's allocation target should inform the Cash Flow distribution-plan-at-retirement projections; Insurance's premium funding should appear in Cash Flow's recommendations[]. Requires a coordination layer that runs after individual lenses complete.
- **Auto-regeneration triggers** — when master Plan refreshes, lenses should optionally auto-regenerate (with advisor confirmation). Requires a delta-detection layer.
- **Specific securities / managers / platforms** in Investment Lens — once a vetted KB exists. Same pattern as Insurance carrier work.
- **Annuity quoting integration** in Insurance Lens — real-time rate quotes from annuity carriers, integrated into recommendation output.
- **Lens versioning UI** — viewing prior versions of a lens, diffing across versions, marking a lens as "delivered with annotations."

---

## Flagged Decisions (Made Autonomously During Spec Authoring)

The following decisions were made while authoring this spec to keep it self-consistent. Each is reversible.

1. **Lenses pre-flight reject `plan.status === "draft"`.** Rationale: a draft plan may be mid-iteration; generating a lens against it produces traceability ambiguity ("which version of the master Plan did this lens consume?"). Lenses generate against `in_review` or `delivered` only. If the advisor needs a draft-state preview, they can promote to `in_review` first. Reversible if the cost is too high; flag a `plan_status_warning` in metadata instead of failing.

2. **Lenses pre-flight reject any supplemental_upload with `redaction_applied: false`.** Rationale: PII exposure to the LLM is a hard line. Failing fast at the harness level prevents accidental PII leak. Redaction belongs upstream; lenses validate, never redact.

3. **Lens-level `plan_version` is independent of master `Plan.plan_version`.** Rationale: a lens may be regenerated multiple times against the same master Plan. Lens-version tracks lens-regeneration history. The lens carries `source_plan_id` + `_metadata.source_plan_version` to link unambiguously back to the master state at lens-generation time.

4. **`BucketName` lives in the Cash Flow lens schema and is imported by Investment lens.** Rationale: avoids a third home for the type. Cash Flow is its primary owner. If the Insurance lens ever needs it, it imports from the same module.

5. **`carrier_specific_recommendation: string | null` is in the v1 schema with the v1 invariant that it MUST be null.** Rationale: forward-compatible — when v1.5 lands, the field's domain expands from `null` only to `null | string` populated; no schema migration needed at the persistence layer. v1 schema enforces the null invariant via zod; v1.5 relaxes the constraint.

6. **System prompts cached via Anthropic prompt caching, not module-cache only.** Rationale: prompt caching cuts per-call cost meaningfully for the large lens system prompts (5K–6K words). The harness sets `cache_control: { type: "ephemeral" }` on the system block. Cost-tracking math accounts for cache_creation/cache_read tokens separately.

7. **`max_tokens: 16000` for all three lenses.** Output for any lens is more focused than the master Plan's Stage 3a (which uses 24K). 16K is conservative headroom; if a lens hits truncation in practice, raise per lens. Insurance has the largest output (multiple categories of policies + recommendations + timeline + conversions); 16K should still suffice given the type-level (not security-level) detail constraint.

8. **Lenses do NOT generate ActionItems in v1.** Critical decision called out in the user's prompt; surfaced explicitly here. v1 lens output is advisory. v1.5 introduces lens-derived ActionItems with the lifecycle infrastructure Stage 3a defines.

9. **No volatile-rates handling at v1.** Cash Flow doesn't use §7520; Investment doesn't use §7520; Insurance doesn't use §7520 in product-type recommendations (annuity rate quoting is v1.5 carrier work). Reversible if a v1.5 lens needs rates.

10. **Lens system prompts duplicate, rather than share, common scaffolding.** Each lens has its own ~5K–6K word system prompt covering its full domain. There is no shared "lens preamble" file at v1. Rationale: domain-specific prompting outweighs DRY at the prompt level. If common scaffolding emerges (e.g., a shared "no carrier names in v1" boilerplate), it can be extracted later via a build-time include step.

11. **`focus` field is plain string, not structured.** Free-text steering hint. Rationale: the LLM is the consumer; strings are sufficient. Structuring it would force the advisor through a UI grammar. If specific focus codes become valuable (e.g., `focus_code: "roth_emphasis"`), v1.5 can add a parallel structured field.

12. **Lens-failed types share a common shape across all three lenses.** Rationale: shared harness logic in Phase 5 can be written once over the union; per-lens divergence is unnecessary. The `_failure_type` enum is identical across all three lenses; lens-specific failure context lives inside `_failure_context` which is loose-typed.
