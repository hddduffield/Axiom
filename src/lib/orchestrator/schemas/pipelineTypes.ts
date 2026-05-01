// Canonical pipeline types shared across all Axiom orchestrator stages.
// Each stage extends or consumes the types declared here; do not duplicate
// these definitions elsewhere.

// ────────────────────────────────────────────────────────────────────────
// Core shared types
// ────────────────────────────────────────────────────────────────────────

export interface NumericValue {
  value: number | [number, number];
  unit: "USD" | "percent" | "count" | "years";
  narrative_context?: string;
  is_approximate?: boolean;
  known_unknown?: boolean;
}

export type RecommendationCategory =
  | "Tax"
  | "Estate"
  | "Entity Structure"
  | "Risk & Insurance"
  | "Retirement"
  | "Investment"
  | "Succession & Continuity"
  | "Family"
  | "Charitable"
  | "Specialty";

export type ArchetypeIdentifier = "PRE" | "POST" | "ACT" | "FO" | "FOUND";

export type PlanSectionName =
  | "Executive Summary"
  | "Your Situation"
  | "Goals and Priorities"
  | "Recommendations — Personal Tax"
  | "Recommendations — Business Tax"
  | "Recommendations — Entity Structure"
  | "Recommendations — Estate Planning"
  | "Recommendations — Risk & Insurance"
  | "Recommendations — Retirement & Benefits"
  | "Recommendations — Investment & Cash"
  | "Recommendations — Succession & Continuity"
  | "Recommendations — Family"
  | "Recommendations — Charitable Planning"
  | "Recommendations — Specialty"
  | "Pre-Transaction Sequence"
  | "Implementation Timeline"
  | "Strategies Considered But Not Included"
  | "Open Items and Decisions Needed"
  | "References"
  | "Disclosures";

export type TimingBucket =
  | "0-30 days"
  | "30-60 days"
  | "60-120 days"
  | "4-6 months"
  | "6-12 months"
  | "12-24 months"
  | "Ongoing";

export type ActionOwner =
  | "PSA"
  | "CPA"
  | "Attorney"
  | "Client"
  | "Banker"
  | "Insurance Broker"
  | "Other";

export type FirmPolicyQuestionId =
  | "ptet_federal_savings_method"
  | "default_grat_term"
  | "default_ilit_trustee"
  | "default_childrens_trust_structure"
  | "default_estate_attorney_partners"
  | "default_cpa_partners_for_ma"
  | "default_daf_sponsor"
  | "default_direct_indexing_platform"
  | "default_corporate_trustee_partner"
  | "landmine_opt_in_protocol"
  | "massmutual_secondary_carrier";

// ────────────────────────────────────────────────────────────────────────
// Stage 2 output (only fields Stage 3b reads)
// ────────────────────────────────────────────────────────────────────────

export interface SelectedRecommendation {
  recommendation_id: string;
  category: RecommendationCategory;
  must_come_after: Array<{ recommendation_id: string }>;
  must_come_before: Array<{ recommendation_id: string }>;
  sequenced_with: Array<{ recommendation_id: string }>;
  coordinated_with: Array<{ recommendation_id: string }>;
  mutually_exclusive_with: Array<{ recommendation_id: string }>;
  preliminary_preference: "preferred" | "alternative" | "tie" | null;
  preliminary_preference_rationale: string | null;
  landmine: boolean;
  landmine_status: string;
  match_strength: "strong" | "borderline";
}

export interface SelectedRecommendations {
  selected: SelectedRecommendation[];
}

// ────────────────────────────────────────────────────────────────────────
// Stage 3a output (QuantifiedRecommendations)
// ────────────────────────────────────────────────────────────────────────

export interface ScenarioRange {
  low_value: number;
  midpoint_value: number;
  high_value: number;
  computation_method: string;
}

export interface QuantifiedImpact {
  estimate: NumericValue | null;
  formula_id: string | null;
  formula_source_file: string | null;
  computation_inputs: Record<string, unknown>;
  pending_reconciliation: boolean;
  alternative_values: Array<{
    value: NumericValue;
    formula_variant: string;
    awaiting: FirmPolicyQuestionId | string;
    context: string;
  }>;
  qualitative_phrasing: string | null;
  reason_no_formula: string | null;
  blocked_inputs: Array<{
    input_name: string;
    blocked_reason: string;
    source: string;
    would_unblock_when: string;
  }>;
}

export interface ActionItem {
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
}

export interface SequencedRecommendation {
  recommendation_id: string;
  source_file_path: string;
  category: RecommendationCategory;
  status: "Active" | "Active-Cautioned" | "Advanced" | "Landmine" | "Deprecated";
  position_in_sequence: number;
  plan_section: PlanSectionName | null;
  subsection_within_section: string | null;
  co_triggered_with: string[];
  quantified_impact: QuantifiedImpact;
  scenario_range: ScenarioRange | null;
  timing_bucket: TimingBucket;
  owner: ActionOwner;
  owner_name: string | null;
  decisions_needed: boolean;
  cluster_id: string | null;
  cluster_sequence_closer: string | null;
  action_items: ActionItem[];
  landmine: boolean;
  landmine_status: string;
  default_excluded: boolean;
  plan_output_variant: "default_excluded" | "authorized" | null;
  match_strength: "strong" | "borderline";
  _audit_notes: string | null;
}

export interface SequencerFailure {
  stage: "3a" | "3b";
  rec_id: string | null;
  reason: string;
  context: string;
}

export interface SequencerFlags3a {
  unenumerated_question_ids: Array<{
    rec_id: string;
    marker_text: string;
    source_file: string;
    context: string;
  }>;
  formula_yielded_unviable_value: Array<{
    rec_id: string;
    formula_id: string;
    computed_value: number;
    reason: string;
  }>;
  cluster_closer_skipped: Array<{
    cluster_id: string;
    member_rec_ids: string[];
    rationale: string;
  }>;
  section_assignment_ambiguity: Array<{
    rec_id: string;
    source_metadata_text: string;
    candidate_sections: PlanSectionName[];
  }>;
  timing_bucket_inferred: Array<{
    action_item_id: string;
    inferred_bucket: TimingBucket;
    source_signal: string;
  }>;
  qualitative_fallback_used: Array<{
    rec_id: string;
    phrasing_used: string;
    reason: string;
  }>;
  blocked_inputs_summary: Array<{
    rec_id: string;
    blocked_inputs: string[];
    awaiting: string[];
  }>;
}

export interface QuantifiedRecommendations {
  _sequencer_status?: "FAILED";
  _sequencer_failures?: SequencerFailure[];
  _sequencer_flags: SequencerFlags3a;
  recommendations: SequencedRecommendation[];
}

// ────────────────────────────────────────────────────────────────────────
// Orchestrator config
// ────────────────────────────────────────────────────────────────────────

export interface OrchestratorConfig {
  firm_policy_resolutions: Array<{
    question_id: FirmPolicyQuestionId;
    resolved_value: unknown;
    resolved_by: string;
    resolved_at: string;
  }>;
  landmine_authorizations: Array<{
    recommendation_id: string;
    authorized_by: string;
    authorized_at: string;
  }>;
  advisor_id: string;
}

// ────────────────────────────────────────────────────────────────────────
// Stage 3b output (SequencedPlan)
// ────────────────────────────────────────────────────────────────────────

export interface SequencerMetadata {
  sequencer_a_version: string;
  assembler_b_version: string;
  sequenced_at: string;
  source_fr_content_hash: string;
  source_client_profile_version: string;
  source_selected_recommendations_version: string;
  archetype: ArchetypeIdentifier;
  archetype_secondary: ArchetypeIdentifier | null;
  volatile_rates_snapshot: {
    s7520_rate: number;
    s7520_month: string;
    afr_short_annual: number | null;
    afr_mid_annual: number | null;
    afr_long_annual: number | null;
    last_refreshed: string;
    days_since_refresh: number;
  };
  firm_policy_resolutions_applied: Array<{
    question_id: FirmPolicyQuestionId;
    resolved_value: unknown;
    resolved_by: string;
    applied_to_recs: string[];
  }>;
  landmine_authorizations_applied: string[];
  recommendation_count_total: number;
  recommendation_count_pending_reconciliation: number;
  recommendation_count_qualitative_only: number;
  compliance_id: string | null;
  compliance_id_format_version: string | null;
}

export interface AssemblerFlags {
  from_stage_3a: SequencerFlags3a;
  from_stage_3b: {
    cycles_detected: string[][];
    soft_constraint_violations: Array<{
      type: "coordinated_with_proximity" | "sequenced_with_clustering";
      rec_ids_involved: string[];
      reason: string;
    }>;
    section_assignment_skipped_count: number;
    decisions_page_size: number;
    strategies_excluded_count: number;
  };
}

export interface ClusterIndexEntry {
  cluster_id: string;
  members: string[];
  closer_carrier: string | null;
  primary_section: PlanSectionName | null;
  spans_sections: PlanSectionName[];
}

export interface Decision {
  decision_id: string;
  decision_type:
    | "firm_policy_resolution"
    | "mutually_exclusive_tie"
    | "landmine_opt_in"
    | "advisor_judgment";
  source_recommendation_id: string;
  decision_summary: string;
  options: Array<{ label: string; value: unknown; rationale: string }>;
  recommended_option: string | null;
  deadline: string;
}

export interface ExcludedStrategy {
  recommendation_id: string;
  category: RecommendationCategory;
  exclusion_reason:
    | "landmine_default_excluded"
    | "mutually_exclusive_alternative"
    | "advisor_explicit_exclusion";
  rationale: string;
  could_revisit_when: string;
}

export type SupervisoryReviewReasonCode =
  | "landmine_authorized"
  | "landmine_excluded_default_with_trigger"
  | "firm_policy_resolution_applied"
  | "firm_policy_resolution_pending"
  | "mutually_exclusive_tie_resolved_at_advisor_judgment"
  | "tax_strategy_outside_advisor_scope"
  | "specialty_recommendation_present"
  | "alternative_investment_recommended"
  | "performance_projection_above_threshold"
  | "templatization_threshold_warning";

export interface SupervisoryReviewReason {
  reason_code: SupervisoryReviewReasonCode;
  description: string;
  source_recommendation_id: string | null;
  routing_implication: "OSJ_principal" | "compliance_general" | "advisor_self_review";
}

export interface SupervisoryReviewSignal {
  required: boolean;
  reasons: SupervisoryReviewReason[];
  triggered_by_recommendations: string[];
  routing_recommendation: "OSJ_principal" | "compliance_general" | "advisor_self_review";
  templatization_threshold_warning: boolean;
}

export interface SequencedPlan {
  _metadata: SequencerMetadata;
  _assembler_flags: AssemblerFlags;
  sequenced_recommendations: SequencedRecommendation[];
  plan_sections: Partial<Record<PlanSectionName, SequencedRecommendation[]>>;
  global_order: string[];
  cluster_index: Record<string, ClusterIndexEntry>;
  decisions_needed_page: Decision[];
  strategies_considered_but_excluded: ExcludedStrategy[];
  action_items_flat: ActionItem[];
  supervisory_review_signal: SupervisoryReviewSignal;
}

export interface SequencedPlanFailed {
  _sequencer_status: "FAILED" | "STAGE_3B_FAILED";
  _failures: SequencerFailure[];
}
