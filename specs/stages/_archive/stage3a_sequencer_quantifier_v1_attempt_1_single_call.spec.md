# Stage 3a — Sequencer & Quantifier

> **ARCHIVED 2026-05-02.** Single-call architecture exceeded Opus 4.7 input context (200K) for Holloway-scale fixtures (81 selected recs at ~320K input tokens). Replaced by Stage 3a.1 / Stage 3a.2 sub-stage decomposition, mirroring the Stage 2a/2b/2c pattern:
>
> - `specs/stages/stage3a_1_batch_quantifier.spec.md` — LLM batch quantifier, runs once per batch (~20 recs each)
> - `specs/stages/stage3a_2_cross_rec_validator.spec.md` — deterministic merge + cross-rec validation, no LLM
> - `specs/stages/stage3a_orchestration.spec.md` — harness chaining 3a.1 batches → 3a.2
>
> The algorithm content here (four-state quantification, ActionItem lifecycle rules, derivative reminder templates, volatile-rates handling, firm-policy resolution semantics, system-prompt structure) carries forward into Stage 3a.1 with batch-scoping additions. Preserved for architectural reference and post-mortem reasoning. Do not implement against it.

---

**Type:** LLM stage. Calls Anthropic API. Single-pass quantification + ActionItem extraction.

**Purpose:** Given SelectedRecommendations from Stage 2 and the ClientProfile from Stage 1, produce a QuantifiedRecommendations object: every selected rec receives a QuantifiedImpact in one of four states (A: computed, B: blocked inputs, C: firm-policy pending, D: qualitative-only) AND an array of ActionItems extracted from the rec file's IMPLEMENTATION STEPS section, each populated with the full lifecycle metadata (duration class, check-in cadence, partner involvement, derivative-reminder template). Stage 3a is the bridge from "we picked these recs" to "here is what each rec is worth and what work it generates" — its output feeds Stage 3b (deterministic plan assembly), Stage 4 (prose), and the post-delivery Tracker.

**Critical:** Stage 3a is the only place in the pipeline where rec files are opened and parsed for IMPLEMENTATION STEPS. Stage 3b assumes ActionItems are already populated and lifecycle-tagged. Mistakes here propagate to the Tracker and to derivative reminder spawning — be conservative when classifying duration_class and partner involvement.

**Input:**
- clientProfile: ClientProfile (output of Stage 1)
- selectedRecommendations: SelectedRecommendations (output of Stage 2)
- options:
  - apiClient: Anthropic instance (for testing, allows injection)
  - kbPath?: string — default `"kb/v1_2/"`
  - referenceDate?: Date — used to evaluate volatile-rate freshness; defaults to now
  - firmPolicyResolutions?: Array<{ question_id: FirmPolicyQuestionId; resolved_value: unknown; resolved_by: string; resolved_at: string }> — already-decided firm policy answers
  - landmineAuthorizations?: Array<{ recommendation_id: string; authorized_by: string; authorized_at: string }>
  - maxRetries?: number — default 1 (i.e., 2 total attempts)

**Output:** QuantifiedRecommendations validated against schema, plus metadata. On failure: QuantifiedRecommendationsFailed with diagnostic context.

---

## Algorithm

Stage 3a runs in three phases. The LLM does Phase 2 (quantification + ActionItem extraction) in a single call; Phase 1 (KB context assembly) and Phase 3 (validation + metadata) are deterministic harness work.

### Phase 1 — Deterministic context assembly (no LLM)

#### Step 1.1 — Load rec files for every selected rec

For each `recommendation_id` in `selectedRecommendations.selected[]`, locate the rec file under `kbPath/01_recommendations/<category_dir>/<rec_id>_*.md`. Read full file content. Cap individual rec file size at ~12K tokens; if a rec file exceeds, truncate after the IMPLEMENTATION STEPS section (PLAN OUTPUT TEMPLATE may be truncated; SEQUENCING DEPENDENCIES must always survive).

If any rec file cannot be located: return QuantifiedRecommendationsFailed with `kb_load_failed` and the missing rec_id.

#### Step 1.2 — Load volatile rates

Read `kbPath/02_reference/08_volatile_rates_lookup.md`. Extract the active month's §7520 rate, AFRs (short/mid/long annual), §382 rate, and `last_refreshed` timestamp.

Compute `days_since_refresh = (referenceDate - last_refreshed).days`. If `days_since_refresh > 30`: emit a flag in `_sequencer_flags.volatile_rates_stale` but do NOT fail the stage — Stage 5 mechanical pre-checks owns the hard fail-closed gate per the rec author guidance in the volatile-rates file. Stage 3a emits a warning so downstream stages can decide.

The full volatile-rates section is passed inline to the LLM as KB context so the LLM can quote rates in qualitative_phrasing and computation_inputs without inferring from training data.

#### Step 1.3 — Load auxiliary KB context

- `kbPath/02_reference/02_federal_income_tax_limits.md` — for tax computation framing
- `kbPath/02_reference/01_federal_estate_gift_gst.md` — for estate computations
- `kbPath/02_reference/07_georgia_specifics.md` — for state-tax rates and PTET rate
- `kbPath/02_reference/05_obbba_changes_summary.md` — for current-law statute citations

Concatenate. Cache in module scope (the references rarely change within a session).

#### Step 1.4 — Resolve firm policy state per rec

For each selected rec, scan its rec file for marker patterns matching firm-policy question IDs (`{{firm_policy:<question_id>}}` or similar). Cross-reference against `firmPolicyResolutions[]`:

- If the rec's marker has a matching resolution → the resolution is provided to the LLM as a known answer. The LLM still emits `alternative_values[]` documenting what the alternative formulas WOULD have produced, and records the applied resolution in `computation_inputs._applied_firm_policy_resolutions[]`. **`alternative_values` is never deleted post-resolution** — it is the audit trail of what the firm chose between.
- If no matching resolution → Stage 3a should produce State C (firm-policy pending) for this rec, with `alternative_values[]` populated and `pending_reconciliation: true`.

#### Step 1.5 — Resolve landmine authorization per rec

For each rec where `selectedRecommendation.landmine === true`: check `landmineAuthorizations[]` for a matching entry. Pass `authorized: true | false` to the LLM as part of per-rec context. The LLM still quantifies authorized landmines as State A/B/C/D normally; default-excluded landmines are quantified at qualitative-only level (State D) with the phrasing "Excluded by firm default; quantification withheld pending advisor authorization."

### Phase 2 — Single LLM call (quantification + ActionItem extraction)

#### Step 2.1 — Build user turn

User turn structure:

```
<client_profile>{ClientProfile JSON}</client_profile>
<selected_recommendations>{SelectedRecommendations JSON}</selected_recommendations>
<volatile_rates>
{full volatile rates lookup file content}
</volatile_rates>
<reference_kb>
{concatenated reference files}
</reference_kb>
<firm_policy_resolutions>
{firmPolicyResolutions JSON, possibly empty}
</firm_policy_resolutions>
<landmine_authorizations>
{landmineAuthorizations JSON, possibly empty}
</landmine_authorizations>
<rec_files>
<rec id="REC-TAX-001">{full rec file content}</rec>
<rec id="REC-EST-006">{full rec file content}</rec>
... one per selected rec ...
</rec_files>

For every recommendation in selected_recommendations.selected[], produce a SequencedRecommendation with quantified_impact and action_items per your system prompt. Output ONLY the QuantifiedRecommendations JSON — no preamble, no commentary, no markdown code fences.
```

Token budget at v1: typically 60K–110K input tokens for a 25-rec selected set. We do not lazy-load; all rec files travel inline. V2 may shard by category if budgets tighten.

#### Step 2.2 — Call Anthropic API

```typescript
const response = await apiClient.messages.create({
  model: "claude-opus-4-7",
  max_tokens: 24000,
  system: STAGE_3A_SYSTEM_PROMPT,
  messages: [{ role: "user", content: userTurn }],
  temperature: 0.0
});
```

`max_tokens: 24000` is required because output scales linearly with selected-rec count. A 25-rec output with 4–8 action items per rec, full computation_inputs maps, and worked-numerical context can run 12K–18K tokens. Headroom prevents truncation; truncation is the leading cause of JSON parse failures observed in pilot.

#### Step 2.3 — Extract response text, parse, validate

Same shape as Stage 1 / Stage 2:
- Extract text-block content
- JSON parse → on failure with retries remaining, retry with explicit "your previous response was not valid JSON" correction turn
- Schema validate (zod) → on failure with retries remaining, retry with validation errors enumerated
- After retries exhausted: return QuantifiedRecommendationsFailed with the appropriate failure_type

#### Step 2.4 — Per-rec quantification logic (encoded in system prompt)

For each rec in `selectedRecommendations.selected[]`, the LLM determines which of four states the QuantifiedImpact lands in:

**State A — computed.** All required formula inputs are present in ClientProfile, no firm-policy alternative_values apply, and the rec file has a QUANTIFIED IMPACT FRAMEWORK section.
- `estimate`: NumericValue populated with the computed point estimate (or a `[low, high]` range if the rec uses range parameters; preserve the dual-number form from `NumericValue.value: number | [number, number]`).
- `formula_id`: a stable identifier the LLM constructs from the rec file (e.g., `"ptet_federal_savings_method_v1"`, `"grat_walton_zeroed_3yr"`).
- `formula_source_file`: the rec file path.
- `computation_inputs`: object with every named input the formula consumed (e.g., `{ k1_income_usd: 4000000, ga_ptet_rate_percent: 5.19, federal_marginal_rate_percent: 37, salt_cap_personally_available_usd: 10000 }`).
- `pending_reconciliation`: `false`.
- `alternative_values`: `[]`.
- `qualitative_phrasing`: `null`.
- `reason_no_formula`: `null`.
- `blocked_inputs`: `[]`.

**State B — blocked inputs.** A formula exists in the rec file but one or more required inputs are absent / unknown / null in ClientProfile.
- `estimate`: `null`.
- `formula_id` and `formula_source_file`: populated (the formula is identified, just not executable).
- `computation_inputs`: contains the inputs that ARE known; missing inputs surface in `blocked_inputs[]`.
- `pending_reconciliation`: `false` (this is a data gap, not a firm-policy gap).
- `alternative_values`: `[]`.
- `qualitative_phrasing`: a one-sentence describing the rec's value qualitatively (so the plan can still discuss it).
- `reason_no_formula`: `null`.
- `blocked_inputs`: each missing input as `{ input_name, blocked_reason, source: "FR.<section>" | "CPA" | "Attorney" | "Appraiser" | "Client", would_unblock_when }`.

**State C — firm-policy pending.** A formula exists but the firm has not chosen between methodological alternatives (e.g., "should PTET federal savings be modeled at full marginal rate or post-SALT-cap differential?").
- `estimate`: `null`.
- `formula_id` and `formula_source_file`: populated.
- `computation_inputs`: populated with whatever inputs are common across alternatives.
- `pending_reconciliation`: `true`.
- `alternative_values`: each candidate value as `{ value: NumericValue, formula_variant, awaiting: FirmPolicyQuestionId, context }`. **Multiple entries** when multiple variants are plausible. Stays populated even after firm resolution (audit trail).
- `qualitative_phrasing`: optional; usually a range phrasing ("between $X and $Y annually depending on firm methodology choice").
- `reason_no_formula`: `null`.
- `blocked_inputs`: `[]` unless blocked AND pending; in that case list both.

**State D — qualitative-only.** Rec file lacks a QUANTIFIED IMPACT FRAMEWORK section, OR the rec is intentionally qualitative (family mission statement, written investment policy, plan-restatement review, default-excluded landmine).
- `estimate`: `null`.
- `formula_id`: `null`.
- `formula_source_file`: `null`.
- `computation_inputs`: `{}`.
- `pending_reconciliation`: `false`.
- `alternative_values`: `[]`.
- `qualitative_phrasing`: required, non-null. One sentence describing the rec's value or purpose, suitable for the plan prose ("Establishes shared family decision-making framework before wealth transitions").
- `reason_no_formula`: required, non-null. One of: `"no_formula_in_rec_file"`, `"intentionally_qualitative"`, `"landmine_default_excluded"`, `"all_inputs_qualitative"`.
- `blocked_inputs`: `[]`.

#### Step 2.5 — Per-category quantification framework (system-prompt section)

The system prompt encodes a category-specific rubric. Summary of the rubric the LLM follows:

**Tax recommendations (Tax category):**
- Inputs: K-1 income, W-2 income, AGI, federal marginal rate, state residency, state PTET rate, SALT cap utilization. Output unit: USD/year (annual savings) unless one-time event (cost seg → multi-year).
- Formula sources: each rec file's QUANTIFIED IMPACT FRAMEWORK → "Range parameters" subsection, augmented by `02_federal_income_tax_limits.md` and `07_georgia_specifics.md`.
- Cross-rec coordination: PTET base interacts with W-2/K-1 mix optimization (REC-TAX-002). When both selected, document coordination in computation_inputs but do not double-count.

**Estate recommendations (Estate category):**
- Inputs: gift exemption used / remaining, federal estate exemption (current and post-TCJA-sunset), §7520 rate at funding (from volatile rates file), AFR (for IDGT), client age(s), expected asset growth assumptions, taxable estate sizing.
- Formula sources: rec file QUANTIFIED IMPACT FRAMEWORK; volatile rates lookup; `01_federal_estate_gift_gst.md`.
- §7520-driven recs (GRAT, IDGT, QPRT, CRT, CLT, CGA): always cite the §7520 rate and source month in computation_inputs (`s7520_rate_at_funding_percent`, `s7520_rate_source_month`). State A is acceptable; the rate is locked at "current at funding" semantics — do not inject volatility ranges into the estimate.
- Estate transfer tax savings: estimate as `taxable_remainder_avoided × current_estate_tax_rate (40%)` unless rec specifies a different methodology.

**Risk & Insurance recommendations:**
- Inputs: face amount needed, policy structure (term vs. permanent), client age(s), risk profile, existing coverage gap.
- Formula sources: rec file QUANTIFIED IMPACT FRAMEWORK; coordination with `11_section_101_life_insurance.md`.
- Output unit: USD face amount or USD annual premium, depending on the rec. Quantify both when both are present in the rec file.
- ILIT and 831(b) captive land in State C until firm has decided trustee partner / captive structuring partner.

**Retirement recommendations:**
- Inputs: account balances by tax-treatment bucket (Trad IRA, Roth IRA, Roth 401k, Trad 401k, brokerage), age, marginal rate trajectory, retirement age, RMD horizon.
- Roth conversion recs: estimate is the present-value tax-arbitrage benefit over the conversion window. State C if firm has not chosen "convert evenly over N years" vs. "fill bracket annually" methodology.

**Investment recommendations:**
- Inputs: liquid asset balance, embedded gains, current allocation, risk tolerance, tax bracket, transaction window.
- Direct-indexing / loss-harvesting: annual yield-capture as `assets_under_strategy × harvest_yield_assumption_percent × marginal_rate`. State C if firm has not chosen platform.

**Charitable recommendations:**
- Inputs: charitable intent indicator, target charitable budget, asset basis vs. FMV, time horizon.
- DAF / CRT / CLAT: standard charitable deduction × marginal rate, plus capital gains avoidance on appreciated-asset gifts.
- §7520-sensitive recs (CRAT, CLAT, CGA): cite the §7520 rate and direction of preference (higher §7520 favors CRAT remainder; lower §7520 favors CLAT).

**Entity Structure recommendations:**
- Inputs: existing entity stack, jurisdictions, ownership percentages, transaction window.
- F-reorg / recap / holdco: usually quantified as "enables downstream rec X" rather than standalone savings. Estimate may be `null` with qualitative_phrasing pointing to dependent rec(s); reason_no_formula = `"all_inputs_qualitative"`.

**Family / Succession & Continuity / Specialty recommendations:**
- Largely State D unless rec file has a quantified framework. Family mission statement, family meetings, written-process recs are intentionally qualitative.
- Specialty (QSBS verification, R&D credit study, cost seg): quantified at expected refund / expected accelerated depreciation × marginal rate.

#### Step 2.6 — ActionItem extraction (per rec)

For each selected rec, parse the rec file's `## IMPLEMENTATION STEPS` section. Each numbered step becomes (at minimum) one ActionItem; some steps split into multiple ActionItems if they describe multiple discrete actions ("Coordinate with CPA. Confirm CPA experience; if not, flag CPA-transition rec." → two action items: one CPA confirmation, one CPA-transition flag).

For each extracted ActionItem, the LLM populates ALL fields of the extended ActionItem schema (see Output Schema section below). Lifecycle-field rules:

**duration_class — assignment rules:**
- `"point_in_time"` if the step is a discrete event with no follow-up: filing a form, making an election, executing a document, writing a check.
  - Example: "File Form 600S with PTET election box checked" → point_in_time.
  - Example: "Execute joint revocable trust" → point_in_time.
- `"short_running"` if the step takes hours to days, typically completed within 30 days, and does not require multi-stakeholder coordination over time.
  - Example: "Review existing umbrella policy declarations and identify coverage gap" → short_running.
  - Example: "Run side-by-side projection with vs. without PTET" → short_running.
- `"long_running"` if the step requires multi-month coordination, multi-year execution, partner-coordinated drafting, or staged implementation across a horizon.
  - Example: "Draft buy/sell agreement with M&A counsel" → long_running.
  - Example: "Convert IRA over 5-year window" → long_running.
  - Example: "Coordinate qualified appraisal and GRAT funding" → long_running (multi-stakeholder, multi-week).

When the IMPLEMENTATION STEPS section is ambiguous, default toward `short_running`. Emit `_sequencer_flags.duration_class_inferred[]` with the rec_id, action_item_id, and the inference rationale.

**check_in_cadence — assignment rules:**
- Required (non-null) when `duration_class === "long_running"`.
- Forbidden (null) when `duration_class !== "long_running"`. Schema enforces.
- Default cadences by domain:
  - Estate-planning items requiring attorney coordination (GRAT funding coordination, ILIT setup, dynasty trust drafting, buy/sell agreement) → `"biweekly"`.
  - Tax-strategy items requiring CPA during active phase (cost seg study, R&D credit study, multi-year Roth conversion in active conversion year) → `"monthly"`.
  - Long-horizon multi-year items where activity cadence is paced (Roth conversion across years 2–5, life insurance premium-finance unwinds, multi-year exit prep) → `"quarterly"`.
  - Annual-review items (PTET annual re-election, beneficiary designations review) → `"annually"`.
  - Weekly cadence is reserved for active deal-execution windows; do not assign weekly unless the rec file explicitly indicates active transaction support.
- Biweekly is reserved for active drafting windows. If the rec is "draft something with attorney" but the partner isn't actively engaged yet, prefer `"monthly"`.

**partner_required and partner_type — assignment rules:**
- Read the rec file's `## COORDINATION NOTES` section. Each role mentioned (CPA, Attorney, Appraiser, Banker, etc.) signals a partner involvement candidate.
- For each ActionItem, set `partner_required: true` if the action item's text mentions or implies a partner role; otherwise `false`.
- `partner_type` enumeration:
  - `"CPA"` — tax-return preparation, projections, elections requiring tax filings.
  - `"Estate Attorney"` — wills, trusts, GRAT/IDGT/ILIT/SLAT/dynasty docs, beneficiary designations.
  - `"Business Attorney"` — operating agreements, F-reorg docs, recap docs, entity formation.
  - `"M&A Counsel"` — buy/sell agreements, transaction-related docs, post-transaction restructuring.
  - `"Commercial P&C"` — umbrella, E&O, business liability.
  - `"Health Insurance Broker"` — health plan, LTC, disability brokerage.
  - `"Banker"` — credit lines, intra-family loan documentation, banking relationship migration.
  - `"Valuation Provider"` — qualified appraisals (estate gifts, GRAT funding, QSBS verification).
  - `"Specialty Tax Credits"` — R&D credit firms, cost-seg engineering firms, Section 1202 verification.
  - `"Other"` — anything not matching above (e.g., insurance carrier underwriting team).
  - `null` — when `partner_required: false`.
- An action item that requires multiple partners (e.g., "GRAT funding requires both Estate Attorney and Valuation Provider") → split into two action items, each with one partner_type, OR keep as one action item with the primary partner_type and note the secondary in `sub_steps[]`. Default: split, with `depends_on[]` linking them.

**parent_action_item_id and is_derivative_reminder:**
- For ActionItems extracted from rec IMPLEMENTATION STEPS: `parent_action_item_id: null`, `is_derivative_reminder: false`. Stage 3a does NOT spawn derivative reminders — those are spawned at runtime by the Tracker after plan delivery.
- Schema preserves these fields so that derivative reminder records (created post-delivery) carry consistent typing through the same ActionItem type.

**source_plan_id:**
- Stage 3a sets `source_plan_id: null` for all ActionItems. The Plan entity does not yet exist at Stage 3a time; the Plan is created at delivery, and `source_plan_id` is back-filled there.

**auto_generated_reminder_template — assignment rules:**
- Required (non-null) when `duration_class === "long_running"`. Forbidden otherwise.
- `cadence`: copy the value from `check_in_cadence`.
- `trigger_threshold_days`: derive from cadence — `weekly` → 7, `biweekly` → 14, `monthly` → 30, `quarterly` → 90, `annually` → 365.
- `reminder_text_template`: a one-sentence template using `{{partner_type}}` and `{{description_short}}` placeholders. Examples:
  - Buy/sell agreement drafting: `"Check in with {{partner_type}} on buy/sell agreement progress"`
  - GRAT funding coordination: `"Check in with {{partner_type}} on GRAT funding milestones (appraisal, trust execution, funding transfer)"`
  - Roth conversion year-N: `"Confirm with {{partner_type}} that year {{conversion_year}} Roth conversion executed and reported"`
  - Estate doc restatement: `"Check in with {{partner_type}} on estate document restatement progress"`

The template uses `{{partner_type}}` literally — runtime substitution at reminder spawn time turns it into "Check in with Estate Attorney on...". Stage 3a does NOT pre-substitute.

#### Step 2.7 — Plan-section assignment, timing-bucket, owner

For each rec, in addition to QuantifiedImpact and ActionItems, the LLM populates SequencedRecommendation envelope fields:

- `plan_section` — read from rec file's PLAN OUTPUT TEMPLATE → "Section assignment" subsection, mapped to the PlanSectionName enum.
  - Ambiguity (multiple plausible sections): emit `_sequencer_flags.section_assignment_ambiguity[]` with candidate sections; pick the most-cited primary.
- `subsection_within_section` — short label from rec file (e.g., `"Federal Tax Optimization"`, `"Pre-Transaction Sequence"`); null if rec file does not specify.
- `co_triggered_with` — propagate from `selectedRecommendation.coordinated_with` and `sequenced_with`. Used by Stage 3b for cluster detection.
- `timing_bucket` — read from rec file's PLAN OUTPUT TEMPLATE → "Timing" subsection. Map to TimingBucket enum. If rec file omits explicit timing, infer from urgency cues ("before year-end", "pre-transaction", "ongoing") and emit `_sequencer_flags.timing_bucket_inferred[]`.
- `owner` — primary owner of the rec ("PSA", "CPA", "Attorney", "Client", etc.); typically set to PSA for advisory-led recs and to the partner_type for partner-led recs.
- `owner_name` — null at Stage 3a (specific partner name is filled at delivery).
- `decisions_needed` — true if any QuantifiedImpact landed in State C OR if rec is mutually-exclusive-tie at advisor judgment.
- `cluster_id` and `cluster_sequence_closer` — null at Stage 3a; Stage 3b assigns these.
- `position_in_sequence` — null or 0 at Stage 3a; Stage 3b's topological sort assigns.
- `landmine`, `landmine_status`, `default_excluded`, `plan_output_variant` — propagate from `selectedRecommendation.landmine` and authorization state.
  - `default_excluded: true` and `plan_output_variant: "default_excluded"` when landmine and not authorized.
  - `default_excluded: false` and `plan_output_variant: "authorized"` when landmine and authorized.
  - Both `null` and `false` when not a landmine.
- `match_strength` — propagate from `selectedRecommendation.match_strength`.
- `_audit_notes` — optional; populated when the LLM made a non-obvious quantification choice ("Used 37% federal marginal rate inferred from AGI > $605K under post-OBBBA brackets; CPA confirmation pending in blocked_inputs").

### Phase 3 — Deterministic post-LLM validation

#### Step 3.1 — Schema validation (zod)

Validate the parsed response against the QuantifiedRecommendations zod schema. Fail-loud invariants:

- Every `recommendations[i].recommendation_id` exists in `selectedRecommendations.selected[]`.
- Every `recommendations[i]` has a `quantified_impact` object whose state-shape is internally consistent (per-state field requirements above).
- `quantified_impact.estimate !== null` ⇒ State A constraints (no blocked_inputs, no alternative_values, no qualitative_phrasing).
- `quantified_impact.alternative_values.length > 0` ⇒ `pending_reconciliation === true`.
- `quantified_impact.blocked_inputs.length > 0` ⇒ `estimate === null`.
- `quantified_impact.qualitative_phrasing === null` ⇒ NOT State D (D requires non-null phrasing).
- `quantified_impact.reason_no_formula !== null` ⇒ State D (estimate null, formula_id null).
- For each ActionItem: `duration_class === "long_running"` ⇔ `check_in_cadence !== null` ⇔ `auto_generated_reminder_template !== null`. (All three or none of the three.)
- For each ActionItem: `partner_required === false` ⇒ `partner_type === null`. `partner_required === true` ⇒ `partner_type !== null`.
- For each ActionItem: `is_derivative_reminder === false` and `parent_action_item_id === null` (Stage 3a never spawns derivatives).
- For each ActionItem: `source_plan_id === null` (Stage 3a never sets this).

Validation failures retry once with the validation-error list explicitly enumerated in the correction turn. After retries exhausted: return QuantifiedRecommendationsFailed with `schema_validation_failed` and the validation_errors array.

#### Step 3.2 — Cross-rec orphan check

Every action_item.depends_on[] entry must reference another action_item_id that exists in the output. Orphan dependencies fail validation.

#### Step 3.3 — Compute metadata

Build StageMetadata (Stage 1/2 shape) plus Stage 3a-specific fields:

- stage_version: "3a-1.0.0"
- model_used: "claude-opus-4-7"
- input_token_count, output_token_count, attempts_made, duration_ms, parsed_at
- source_client_profile_version: hash or version field from input ClientProfile
- source_selected_recommendations_version: hash from input SelectedRecommendations
- volatile_rates_snapshot: { s7520_rate, s7520_month, afr_short_annual, afr_mid_annual, afr_long_annual, last_refreshed, days_since_refresh }
- firm_policy_resolutions_applied: list of question_ids actually consumed by the LLM (subset of input firmPolicyResolutions)
- landmine_authorizations_applied: list of authorized rec_ids actually consumed

#### Step 3.4 — Return QuantifiedRecommendations + metadata

```typescript
return {
  recommendations: [...],
  _sequencer_flags: { ... },
  _metadata: stageMetadata
};
```

---

## Volatile Rates Handling

Volatile rates (§7520, AFRs, §382) MUST be read from `kb/v1_2/02_reference/08_volatile_rates_lookup.md` at every Stage 3a invocation. Stage 3a does NOT cache volatile rates across invocations — the file is the source of truth and may be updated between runs.

**Pass-through to LLM:** Full file content goes into `<volatile_rates>` block in the user turn. The LLM is instructed (system prompt) to:
1. Always cite the active month's §7520 rate when quantifying §7520-sensitive recs (GRAT, IDGT, QPRT, CRT, CLT, CGA, SCIN, intra-family loans).
2. Quote the rate as "current at funding" or "as of <month>" — never present as static.
3. Use the rate value from the file, never from training data.

**Staleness handling:** The harness (Phase 1) computes `days_since_refresh`. If > 30: emit `_sequencer_flags.volatile_rates_stale: { last_refreshed, days_since_refresh }` and proceed. Stage 5 mechanical pre-checks owns the hard fail-closed gate. Stage 3a's job is to surface, not block. Rationale: a stale-rates run can still produce a useful draft for review; Stage 5's gate prevents stale rates from reaching delivery.

**Snapshot in metadata:** The volatile-rates values used for THIS run are captured in `_metadata.volatile_rates_snapshot` so downstream stages, audits, and re-runs can compare.

---

## Firm Policy Resolution Handling

Firm policy questions (`FirmPolicyQuestionId`) represent methodological choices the firm has not standardized. Examples: PTET federal-savings calculation method, default GRAT term, default ILIT trustee, default DAF sponsor.

**Two states per rec × per question:**

1. **Resolution provided** — the orchestrator passes a resolution in `firmPolicyResolutions[]`. Stage 3a:
   - Treats the resolution as a known input. The LLM uses the resolved_value as if it were a normal input.
   - **Still emits `alternative_values[]` with each plausible alternative methodology and its computed result.** This is the audit trail. Even after resolution, the plan can show "we modeled this at X using firm methodology Y; the alternative methodology Z would have yielded W."
   - Emits `_metadata.firm_policy_resolutions_applied[]` with `{ question_id, resolved_value, resolved_by, applied_to_recs[] }`.
   - `pending_reconciliation: false` (because firm has decided).

2. **Resolution NOT provided** — Stage 3a:
   - Produces State C (pending) for affected recs.
   - `alternative_values[]` populated with each plausible methodology variant.
   - `pending_reconciliation: true`.
   - The Decisions Needed Page (Stage 3b) will surface the firm policy question to the advisor for resolution.

**Important invariant:** `alternative_values[]` never gets emptied post-resolution. It is a permanent record. Stage 5 mechanical pre-checks have a "State C protection canary" (already implemented) that fires if `alternative_values[]` content is silently dropped during prose rendering.

---

## ActionItem Lifecycle Field Population (Codified Rules)

Authoritative rule table the system prompt encodes:

| Pattern in IMPLEMENTATION STEPS | duration_class | check_in_cadence | partner_required | example partner_type |
|---|---|---|---|---|
| File a form, make an election, sign a doc | point_in_time | null | depends on step text | CPA / Estate Attorney |
| Review existing policy / pull declarations | short_running | null | depends | Commercial P&C / Health Insurance Broker |
| Run a projection / model a strategy | short_running | null | true | CPA |
| Coordinate qualified appraisal | long_running | biweekly | true | Valuation Provider |
| Draft trust / buy-sell / partnership doc | long_running | biweekly | true | Estate Attorney / M&A Counsel |
| Multi-year Roth conversion | long_running | quarterly | true | CPA |
| Annual re-election (PTET, beneficiary review) | point_in_time | null | true | CPA |
| Establish family mission / hold family meeting | short_running OR long_running | annually if recurring | false | null |
| Set up new banking / credit relationship | short_running | null | true | Banker |
| R&D credit study / cost seg / QSBS verification | long_running | monthly | true | Specialty Tax Credits |

**Edge cases the system prompt addresses explicitly:**

- "Schedule annual review" steps → point_in_time annually-recurring is NOT modeled; instead, the rec generates one ActionItem with `duration_class: "long_running"`, `check_in_cadence: "annually"`, and an auto_generated_reminder_template that triggers yearly reminders.
- "Coordinate with X" where X is undefined → assume PSA-led, `partner_required: false`, but flag in `_audit_notes` so reviewers can clarify.
- A single IMPLEMENTATION STEPS bullet with sub-bullets → bullet becomes the parent ActionItem, sub-bullets become `sub_steps[]` strings (not separate ActionItems unless they imply distinct ownership/timing).
- "Time-sensitive" / "before <date>" cues in SEQUENCING DEPENDENCIES → set `timing_bucket` to the urgency-appropriate value but keep `duration_class` per the action's nature.

---

## Derivative Reminder Template Generation

`auto_generated_reminder_template` is populated for `long_running` ActionItems to define how the Tracker should auto-spawn check-in reminders during the action's in_progress lifecycle.

**Schema:**
```typescript
interface AutoGeneratedReminderTemplate {
  trigger_threshold_days: number;     // days since last check-in or last reminder
  cadence: TimingBucket;              // matches check_in_cadence
  reminder_text_template: string;     // template with {{partner_type}}, {{description_short}}, ... placeholders
}
```

**Generation rules (encoded in system prompt):**

- `trigger_threshold_days` is derived deterministically from cadence:
  - weekly → 7
  - biweekly → 14
  - monthly → 30
  - quarterly → 90
  - annually → 365

- `cadence` MUST equal the parent ActionItem's `check_in_cadence`.

- `reminder_text_template` shape: imperative-mood single sentence, ≤ 100 chars, using template placeholders.
  - Allowed placeholders: `{{partner_type}}`, `{{description_short}}`, `{{rec_id}}`, `{{conversion_year}}` (for multi-year recs).
  - Stage 3a does NOT pre-substitute; the Tracker substitutes at spawn time.

- For `partner_required: false` long_running items: use `{{description_short}}` only; omit `{{partner_type}}`. Example: `"Check in on {{description_short}}"`.

**The template is a *recipe*, not a *reminder*.** Stage 3a writes the recipe; the Tracker uses it to spawn actual derivative ActionItems (which themselves have `is_derivative_reminder: true` and `parent_action_item_id: <original>`). Stage 3a never generates derivative ActionItems directly.

---

## Output Schema

The Stage 3a output extends the existing QuantifiedRecommendations type with the extended ActionItem schema. Schema location: `src/lib/orchestrator/schemas/quantifiedRecommendations.ts` (zod). The TypeScript type lives in `src/lib/orchestrator/schemas/pipelineTypes.ts` and is updated additively.

```typescript
export interface ActionItem {
  // existing fields
  action_item_id: string;
  description: string;
  sub_steps: string[];
  category: RecommendationCategory;
  source_recommendation_id: string;
  source_phase_or_step: string;
  owner: ActionOwner;
  owner_name: string | null;
  timing_bucket: TimingBucket;
  depends_on: string[];
  is_decision_needed: boolean;

  // lifecycle additions (Stage 3a-populated)
  duration_class: "point_in_time" | "short_running" | "long_running";
  check_in_cadence: TimingBucket | null;            // required when long_running, else null
  partner_required: boolean;
  partner_type: PartnerType | null;                  // null when partner_required: false
  parent_action_item_id: string | null;              // null at Stage 3a; set by Tracker for derivatives
  is_derivative_reminder: boolean;                   // false at Stage 3a
  source_plan_id: string | null;                     // null at Stage 3a; set on plan delivery
  auto_generated_reminder_template: AutoGeneratedReminderTemplate | null; // required when long_running
}

export type PartnerType =
  | "CPA"
  | "Estate Attorney"
  | "Business Attorney"
  | "M&A Counsel"
  | "Commercial P&C"
  | "Health Insurance Broker"
  | "Banker"
  | "Valuation Provider"
  | "Specialty Tax Credits"
  | "Other";

export interface AutoGeneratedReminderTemplate {
  trigger_threshold_days: number;
  cadence: TimingBucket;
  reminder_text_template: string;
}
```

`TimingBucket` is reused for `check_in_cadence` only with values constrained to the cadence subset: `"weekly" | "biweekly" | "monthly" | "quarterly" | "annually"`. Note: existing TimingBucket enum members (`"0-30 days"`, `"30-60 days"`, etc.) are NOT valid for check_in_cadence. Schema enforces a refined union for check_in_cadence at validation time. **Decision flagged:** existing TimingBucket type lacks the cadence values (`"weekly"`, `"biweekly"`, `"monthly"`, `"quarterly"`, `"annually"`); see "Flagged decisions" at the end of this spec for resolution path.

The QuantifiedRecommendations container type is unchanged in shape (already in pipelineTypes.ts); only ActionItem is extended.

```typescript
export interface QuantifiedRecommendationsFailed {
  _stage_status: "FAILED";
  _failure_type:
    | "kb_load_failed"
    | "rec_file_not_found"
    | "volatile_rates_load_failed"
    | "json_parse_failed"
    | "schema_validation_failed"
    | "api_error"
    | "max_retries_exceeded"
    | "cross_rec_orphan_dependency";
  _failure_reason: string;
  _failure_context: {
    missing_rec_id?: string;
    parse_error?: string;
    validation_errors?: string[];
    raw_response?: string;
    parsed_response?: unknown;
    api_error?: string;
    orphan_dependency?: { action_item_id: string; missing_dependency_id: string };
    attempts_made: number;
  };
  _metadata: Partial<StageMetadata>;
}
```

---

## System Prompt

The Stage 3a system prompt is the largest in the pipeline (~12,000–14,000 words). Critical sections:

1. **Role and goal:** "You are Stage 3a of an automated financial planning pipeline. For each selected recommendation, you produce a quantified impact in one of four states (A/B/C/D) and a list of ActionItems with full lifecycle metadata..."

2. **Four-state quantification rubric:** Each state explicitly described with the per-field requirement matrix from this spec.

3. **Per-category quantification framework:** The seven category-specific rubrics (Tax / Estate / Risk & Insurance / Retirement / Investment / Charitable / Entity Structure / Family / Succession / Specialty).

4. **Volatile rates discipline:** Always cite from the `<volatile_rates>` block, never from training data. Use "current at funding" framing.

5. **Firm policy resolution handling:** When resolutions provided, alternative_values stays populated; when not provided, State C with alternative_values populated.

6. **ActionItem extraction rules:** The complete lifecycle-field rule table, edge cases, partner_type enumeration with examples.

7. **Derivative reminder template generation:** Cadence-to-trigger_threshold_days mapping, allowed placeholders, single-sentence imperative shape.

8. **Plan-section assignment, timing-bucket inference, owner assignment.**

9. **Schema discipline:**
   - JSON only, no preamble, no markdown fences
   - Every recommendation_id from selected[]
   - Every state-shape internally consistent (per-state field requirements)
   - All ActionItem invariants satisfied
   - depends_on[] references valid action_item_ids only

10. **Examples:** 3 worked examples (one State A tax rec, one State C estate rec, one State D family rec) showing full SequencedRecommendation including ActionItems with lifecycle fields.

The full system prompt goes into `src/lib/orchestrator/stages/stage3a.system.md`.

---

## Implementation Requirements

1. **Module location:** `src/lib/orchestrator/stages/stage3aSequencerQuantifier.ts`

2. **Schema location:** `src/lib/orchestrator/schemas/quantifiedRecommendations.ts` — defines zod schema for QuantifiedRecommendations and the extended ActionItem; exports inferred TypeScript types.

3. **System prompt location:** `src/lib/orchestrator/stages/stage3a.system.md`

4. **Function signature:**

```typescript
export async function quantifyAndSequence(
  clientProfile: ClientProfile,
  selectedRecommendations: SelectedRecommendations,
  options: {
    apiClient: Anthropic;
    kbPath?: string;
    referenceDate?: Date;
    firmPolicyResolutions?: Array<{
      question_id: FirmPolicyQuestionId;
      resolved_value: unknown;
      resolved_by: string;
      resolved_at: string;
    }>;
    landmineAuthorizations?: Array<{
      recommendation_id: string;
      authorized_by: string;
      authorized_at: string;
    }>;
    maxRetries?: number;
  }
): Promise<QuantifiedRecommendations | QuantifiedRecommendationsFailed>;
```

5. **No throws.** All errors caught and returned as QuantifiedRecommendationsFailed.

6. **Anthropic call config:**
   - `model: "claude-opus-4-7"`
   - `max_tokens: 24000` (REQUIRED for output headroom; truncation is the leading cause of JSON parse failures)
   - `temperature: 0.0`
   - System prompt loaded from disk at module load and cached.

7. **Retry pattern matches Stage 1/2:**
   - Attempt 1: standard turn
   - On JSON parse failure with retries remaining: append assistant turn with raw response + user turn with explicit "your previous response was not valid JSON. Error: <error>. Output ONLY the QuantifiedRecommendations JSON now."
   - On schema validation failure with retries remaining: append assistant turn with raw response + user turn enumerating validation errors.
   - On API error: no automatic retry beyond Anthropic SDK's built-in retry; return api_error failure after one attempt.
   - `attempts_made` recorded in metadata.

8. **KB context caching:** rec files for the SELECTED set are loaded per-invocation (not cached) because the selected set varies. Reference KB files (federal limits, GA specifics, OBBBA, estate-gift-GST) ARE cached at module scope. Volatile rates file is read every invocation (no caching — rates can move between runs).

9. **Mammoth not needed.** Stage 3a operates on JSON inputs and markdown KB files only.

10. **Logging:** include token-count breakdown by section in the metadata (`_metadata.input_breakdown: { client_profile, selected_recommendations, volatile_rates, reference_kb, rec_files, firm_policy, landmine }`) so we can monitor per-section growth and decide when to lazy-load.

---

## Test Requirements

Create `src/lib/orchestrator/stages/__tests__/stage3aSequencerQuantifier.test.ts`. Use Node's `node:test` runner.

### Mock test cases (always-on)

1. **Mock API success — full Holloway-shaped input** → returns valid QuantifiedRecommendations. Structural assertions:
   - `recommendations.length === selectedRecommendations.selected.length`
   - At least one rec with `quantified_impact.estimate !== null` (State A)
   - At least one rec with `quantified_impact.alternative_values.length > 0` (State C)
   - At least one rec with `quantified_impact.qualitative_phrasing !== null` and `formula_id === null` (State D)
   - Every long_running ActionItem has non-null `check_in_cadence` AND non-null `auto_generated_reminder_template`
   - Every point_in_time and short_running ActionItem has null `check_in_cadence` AND null `auto_generated_reminder_template`

2. **Mock API returns invalid JSON** → returns QuantifiedRecommendationsFailed with `json_parse_failed`.

3. **Mock API returns valid JSON but schema-invalid (state C with empty alternative_values)** → returns QuantifiedRecommendationsFailed with `schema_validation_failed`; validation_errors includes the state-shape violation.

4. **Mock API returns ActionItem with `duration_class: "long_running"` and `check_in_cadence: null`** → schema validation fails; validation_errors includes the lifecycle-field invariant violation.

5. **Mock API returns ActionItem with `partner_required: true` and `partner_type: null`** → schema validation fails.

6. **Mock API returns recommendation_id NOT in selectedRecommendations.selected[]** → schema validation fails with orphan rec_id error.

7. **Mock API success with retry** — first call returns invalid JSON, retry returns valid → returns QuantifiedRecommendations with `attempts_made: 2`.

8. **Mock API success with firmPolicyResolutions provided** → verify:
   - Affected recs land in State A (with the resolved value applied), not State C.
   - `alternative_values[]` STILL populated on those recs.
   - `_metadata.firm_policy_resolutions_applied[]` lists the question_ids consumed.

9. **Mock API success with landmineAuthorizations provided** → verify:
   - Authorized landmines land in State A/B/C/D normally per their formula availability.
   - `default_excluded: false` on authorized landmines.
   - Unauthorized landmines land in State D with `reason_no_formula: "landmine_default_excluded"`.

10. **Volatile rates stale (referenceDate set 60 days after last_refreshed)** → result includes `_sequencer_flags.volatile_rates_stale: { last_refreshed, days_since_refresh: 60 }` but stage does NOT fail.

11. **Missing rec file** → returns QuantifiedRecommendationsFailed with `rec_file_not_found` and the missing rec_id in failure_context.

12. **Cross-rec orphan dependency in ActionItems** → schema validation fails with orphan_dependency error.

13. **API error (mock 500 response)** → returns QuantifiedRecommendationsFailed with `api_error`.

### Live API test (skipped without env var)

14. **Live Holloway test, marked `{ skip: !process.env.RUN_LIVE_API_TESTS }`** — uses the hand-authored Holloway SelectedRecommendations fixture at `artifacts/holloway_selected_recommendations.json` (per Stage 2 v1 mitigation). Real Anthropic API call. Structural assertions:
   - `recommendations.length` matches fixture's selected count
   - REC-TAX-001 quantified in State A; estimate is a NumericValue with USD unit and value > $50K (PTET Holloway-scale)
   - REC-EST-006 (GRAT) cites §7520 rate from current volatile rates file in computation_inputs
   - At least one ActionItem has `duration_class: "long_running"` with populated `auto_generated_reminder_template`
   - At least 3 ActionItems have `partner_required: true` with non-null `partner_type`
   - `_metadata.volatile_rates_snapshot` populated with current §7520 rate from volatile_rates file
   - `_metadata.attempts_made` ≥ 1

Mock the Anthropic client via a `MockAnthropicClient` that returns a configurable response, mirroring Stage 1/2 test pattern. Real API tests cost ~$0.40–$0.80 each (input ~80K tokens, output ~15K tokens at Opus pricing).

---

## What This Does NOT Do

- Does NOT call other LLM stages.
- Does NOT compute the topological sort, cluster detection, or `position_in_sequence`. Those are Stage 3b (deterministic).
- Does NOT assemble plan_sections or global_order. Stage 3b owns plan structure.
- Does NOT generate prose. Stage 4 owns prose.
- Does NOT spawn derivative reminder ActionItems. The Tracker spawns those at runtime using `auto_generated_reminder_template`.
- Does NOT set `parent_action_item_id` or `source_plan_id` (both null at Stage 3a).
- Does NOT validate the firm policy resolution values (e.g., does NOT check that `default_grat_term` is a sensible integer). Validation is the orchestrator config layer's job.
- Does NOT run mechanical pre-checks (Stage 5) on its own output. Each stage is independent.
- Does NOT decide whether a landmine should be authorized — it consumes the authorization state and quantifies accordingly.
- Does NOT fail-closed on stale volatile rates (Stage 5 owns that gate). Stage 3a flags but proceeds.
- Does NOT generate `compliance_id` or supervisory review signals. Stage 3b / aggregate metrics builder own those.

---

## Flagged Decisions (Made Autonomously During Spec Authoring)

The following decisions were made during spec authoring to keep the spec coherent. Each is reversible; all are documented here so Hayden can review.

1. **`max_tokens: 24000` for the Anthropic call.** Output scales with selected-rec count and per-rec lifecycle metadata is verbose. This headroom prevents truncation. If Stage 2 caps selected at 30 recs, this should comfortably accommodate the worst case.

2. **Volatile-rates staleness emits a flag but does NOT fail-close at Stage 3a.** Rationale: Stage 5 mechanical pre-checks already owns the "fail-closed if rates > 30 days stale" gate, per the volatile_rates_lookup.md author guidance. Duplicating the gate at Stage 3a would block useful draft iteration runs. If Hayden wants Stage 3a to fail-close instead, swap the flag for a `volatile_rates_stale_failure` failure_type.

3. **TimingBucket vs check_in_cadence value mismatch.** The existing TimingBucket type uses date-range strings (`"0-30 days"`, etc.), but check_in_cadence semantics demand cadence words (`"weekly"`, `"biweekly"`, `"monthly"`, `"quarterly"`, `"annually"`). I considered three resolutions:
   - **(a)** Add cadence values to TimingBucket as a union extension (loosens TimingBucket semantics).
   - **(b)** Define a separate `CheckInCadence` enum and use it in place of `TimingBucket | null` for the check_in_cadence field.
   - **(c)** Refine TimingBucket via zod into two named subsets.
   - **My choice:** Option (b) — `CheckInCadence` as a separate type, used both in the ActionItem schema and inside `AutoGeneratedReminderTemplate.cadence`. Cleaner than option (a) and avoids zod gymnastics of option (c). The pipelineTypes.ts addition for ActionItem follows this; if Hayden prefers (a), the swap is mechanical.

4. **Derivative reminder cadence-to-threshold mapping (weekly→7, biweekly→14, monthly→30, quarterly→90, annually→365)** is hardcoded as a deterministic derivation in the system prompt rather than parameterized. Rationale: this is a recipe, not a tuning surface; if a rec needs a special trigger threshold, the rec file should specify it explicitly and the LLM can override.

5. **Default-excluded landmines land in State D** with `reason_no_formula: "landmine_default_excluded"`. Alternative would be to skip them entirely from `recommendations[]`, but that would break Stage 2's intent that landmines remain visible in the audit trail (just default-suppressed in plan output). Keeping them as State D preserves traceability.

6. **ActionItem extraction is per-rec; rec files travel inline.** No lazy-loading at v1. If token budgets tighten in v2, shard by category (tax block, estate block, etc.) and run multiple Stage 3a sub-calls in parallel. Captured as v2 backlog.

7. **`source_plan_id` field is in the Stage 3a-emitted schema but always null.** Rationale: keeps the ActionItem type stable across the lifecycle (Stage 3a emit → Plan delivery → Tracker mutation). Avoids needing two near-identical types.

---

## V2 Architectural Backlog: Stage 3a

- **Sharding by category** if token budgets tighten beyond ~120K input.
- **Lazy rec-file loading** keyed off Stage 2 candidate set rather than full inline pass-through.
- **Per-rec parallelization** — each selected rec quantified in its own LLM call, with a deterministic merge step.
- **Formula library externalization** — replace LLM-driven formula synthesis with a registered formula library that the LLM picks from rather than reconstructs each time.
- **Volatile-rates auto-refresh** — pipeline checks rates file age and auto-runs a refresh job before invocation if stale.
