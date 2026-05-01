// Stage-specific schemas live in their own files. Cross-stage shared types
// live in pipelineTypes.ts. This file owns the Stage 1 output contract:
// the ClientProfile zod schema (runtime validation) plus the inferred
// TypeScript type, the StageMetadata footprint, and the failure shape.

import { z } from "zod";

// ────────────────────────────────────────────────────────────────────────
// Primitives
// ────────────────────────────────────────────────────────────────────────

const ArchetypeIdentifier = z.enum(["PRE", "POST", "ACT", "FO", "FOUND"]);

// Three-state NumericValue:
//   1. Field absent from FR → use null at the parent level (no NumericValue at all)
//   2. Field present, value unknown → NumericValue with { value: null, known_unknown: true }
//   3. Field present with known value → NumericValue with { value: <number> }
const NumericValueSchema = z.object({
  value: z.union([z.number(), z.tuple([z.number(), z.number()])]).nullable(),
  unit: z.enum(["USD", "percent", "count", "years"]),
  narrative_context: z.string().optional(),
  is_approximate: z.boolean().optional(),
  known_unknown: z.boolean().optional(),
  is_annual: z.boolean().optional(),
});

// ────────────────────────────────────────────────────────────────────────
// Sub-record schemas
// ────────────────────────────────────────────────────────────────────────

const PersonRecord = z.object({
  full_legal_name: z.string(),
  short_name: z.string().nullable(),
  date_of_birth: z.string().nullable(),
  age: z.number().int().nullable(),
  relationship: z.string().nullable(),
  state_of_residence: z.string().nullable(),
  citizenship: z.string().nullable(),
  notes: z.string().nullable(),
});

const EntityRecord = z.object({
  legal_name: z.string(),
  short_name: z.string().nullable(),
  entity_type: z.string(),
  state_of_formation: z.string().nullable(),
  ein_last_four: z.string().nullable(),
  industry: z.string().nullable(),
  primary_owner_name: z.string().nullable(),
  ownership_percentage: NumericValueSchema.nullable(),
  founded_year: z.number().int().nullable(),
  notes: z.string().nullable(),
});

const AssetRecord = z.object({
  description: z.string(),
  category: z.string(),
  estimated_value: NumericValueSchema.nullable(),
  custodian_or_location: z.string().nullable(),
  notes: z.string().nullable(),
});

const LiabilityRecord = z.object({
  description: z.string(),
  category: z.string(),
  outstanding_balance: NumericValueSchema.nullable(),
  interest_rate: NumericValueSchema.nullable(),
  maturity_or_term: z.string().nullable(),
  notes: z.string().nullable(),
});

const TrustRecord = z.object({
  trust_name: z.string(),
  trust_type: z.string(),
  date_established: z.string().nullable(),
  trustee: z.string().nullable(),
  beneficiaries: z.array(z.string()),
  funded: z.boolean().nullable(),
  notes: z.string().nullable(),
});

const BeneficiaryRecord = z.object({
  beneficiary_name: z.string(),
  relationship: z.string().nullable(),
  designation_type: z.string().nullable(),
  account_or_policy: z.string().nullable(),
  notes: z.string().nullable(),
});

const PolicyRecord = z.object({
  carrier: z.string().nullable(),
  policy_type: z.string(),
  insured: z.string().nullable(),
  owner: z.string().nullable(),
  beneficiary: z.string().nullable(),
  face_amount: NumericValueSchema.nullable(),
  cash_value: NumericValueSchema.nullable(),
  annual_premium: NumericValueSchema.nullable(),
  policy_year: z.number().int().nullable(),
  notes: z.string().nullable(),
});

const TransactionRecord = z.object({
  description: z.string(),
  transaction_type: z.string(),
  completed_date: z.string().nullable(),
  proceeds: NumericValueSchema.nullable(),
  notes: z.string().nullable(),
});

const AdvisorRelationshipRecord = z.object({
  firm_or_advisor_name: z.string().nullable(),
  role: z.string(),
  contact: z.string().nullable(),
  scope_of_engagement: z.string().nullable(),
  notes: z.string().nullable(),
});

// ────────────────────────────────────────────────────────────────────────
// Section schemas
// ────────────────────────────────────────────────────────────────────────

const EngagementSection = z.object({
  advisor_id: z.string(),
  archetype: ArchetypeIdentifier,
  secondary_archetype: ArchetypeIdentifier.nullable(),
  engagement_date: z.string(),
  plan_purpose: z.string(),
});

const ClientAndFamilySection = z.object({
  primary_owner: PersonRecord,
  spouse: PersonRecord.nullable(),
  children: z.array(PersonRecord),
  dependents: z.array(PersonRecord),
});

const EntityStructureSection = z.object({
  has_holdco: z.boolean(),
  holdco_jurisdiction: z.string().nullable(),
  has_dynasty_trust: z.boolean(),
  has_foundation: z.boolean(),
  additional_entities: z.array(z.string()),
});

const PersonalBalanceSheetSection = z.object({
  liquid_assets: z.array(AssetRecord),
  retirement_accounts: z.array(AssetRecord),
  real_estate: z.array(AssetRecord),
  business_interests: z.array(AssetRecord),
  other_assets: z.array(AssetRecord),
  liabilities: z.array(LiabilityRecord),
  net_worth: NumericValueSchema,
});

const IncomeSection = z.object({
  wages_w2: NumericValueSchema,
  k1_distributions: NumericValueSchema,
  other_income: NumericValueSchema,
  agi: NumericValueSchema,
});

const CashFlowSection = z.object({
  monthly_inflows: NumericValueSchema,
  monthly_outflows: NumericValueSchema,
  monthly_savings: NumericValueSchema,
});

const TaxStatusSection = z.object({
  filing_status: z.string(),
  federal_marginal_rate: NumericValueSchema,
  state_residency: z.string(),
  ptet_election_status: z.enum(["elected", "not_elected", "pending", "not_applicable"]),
  prior_returns_received: z.boolean(),
});

const EstatePlanningSection = z.object({
  will_status: z.enum(["current", "stale", "missing", "draft"]),
  will_date: z.string().nullable(),
  trusts: z.array(TrustRecord),
  beneficiaries: z.array(BeneficiaryRecord),
  dpoa_in_place: z.boolean(),
  healthcare_directive_in_place: z.boolean(),
});

const InsuranceSection = z.object({
  life_insurance_policies: z.array(PolicyRecord),
  dis_insurance: z.array(PolicyRecord),
  ltc_insurance: z.array(PolicyRecord),
  umbrella_liability: PolicyRecord.nullable(),
  errors_omissions: PolicyRecord.nullable(),
});

const TransactionPostureSection = z.object({
  transaction_window: z.string().nullable(),
  transaction_status: z.string(),
  inbound_interest: z.boolean(),
  advisor_engaged: z.string().nullable(),
  valuation_status: z.string().nullable(),
});

const GoalsAndValuesSection = z.object({
  financial_goals: z.string(),
  philanthropic_goals: z.string().nullable(),
  family_priorities: z.string().nullable(),
  succession_goals: z.string().nullable(),
  raw_values_text: z.string(),
});

// ────────────────────────────────────────────────────────────────────────
// StageMetadata
// ────────────────────────────────────────────────────────────────────────

// attempt_history is mandatory in StageMetadata for every LLM stage going
// forward. It is the diagnostic substrate for prompt iteration: when a stage
// fails on retry, the history shows what was wrong on the failed attempts.
const AttemptHistoryEntrySchema = z.object({
  attempt_number: z.number().int().positive(),
  outcome: z.enum([
    "success",
    "json_parse_failed",
    "schema_validation_failed",
    "api_error",
  ]),
  failure_details: z.string().nullable(),
  duration_ms: z.number().int().nonnegative(),
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
});

const StageMetadataSchema = z.object({
  stage_version: z.string(),
  model_used: z.string(),
  input_token_count: z.number().int().nonnegative(),
  output_token_count: z.number().int().nonnegative(),
  cache_creation_input_tokens: z.number().int().nonnegative(),
  cache_read_input_tokens: z.number().int().nonnegative(),
  attempts_made: z.number().int().positive(),
  attempt_history: z.array(AttemptHistoryEntrySchema),
  duration_ms: z.number().int().nonnegative(),
  source_fr_content_hash: z.string(),
  parsed_at: z.string(),
});

// ────────────────────────────────────────────────────────────────────────
// Top-level ClientProfile schemas
// ────────────────────────────────────────────────────────────────────────

// Schema the LLM must emit (no _metadata yet — that's appended after).
export const ClientProfileBodySchema = z.object({
  engagement: EngagementSection,
  client_and_family: ClientAndFamilySection,
  entities: z.array(EntityRecord),
  entity_structure: EntityStructureSection,
  personal_balance_sheet: PersonalBalanceSheetSection,
  income: IncomeSection,
  cash_flow: CashFlowSection,
  tax_status: TaxStatusSection,
  estate_planning: EstatePlanningSection,
  insurance: InsuranceSection,
  transaction_posture: TransactionPostureSection,
  prior_transactions: z.array(TransactionRecord),
  goals_and_values: GoalsAndValuesSection,
  documents_received: z.array(z.string()),
  existing_advisor_relationships: z.array(AdvisorRelationshipRecord),
  advisor_observations: z.string(),
});

// Final ClientProfile = body + _metadata.
export const ClientProfileSchema = ClientProfileBodySchema.extend({
  _metadata: StageMetadataSchema,
});

// ────────────────────────────────────────────────────────────────────────
// Inferred types
// ────────────────────────────────────────────────────────────────────────

export type ClientProfileBody = z.infer<typeof ClientProfileBodySchema>;
export type ClientProfile = z.infer<typeof ClientProfileSchema>;
export type StageMetadata = z.infer<typeof StageMetadataSchema>;
export type AttemptHistoryEntry = z.infer<typeof AttemptHistoryEntrySchema>;
export type Archetype = z.infer<typeof ArchetypeIdentifier>;
export type NumericValueClient = z.infer<typeof NumericValueSchema>;

// ────────────────────────────────────────────────────────────────────────
// Failure shape
// ────────────────────────────────────────────────────────────────────────

export type ClientProfileFailureType =
  | "fr_extraction_failed"
  | "json_parse_failed"
  | "schema_validation_failed"
  | "api_error"
  | "max_retries_exceeded";

export interface ClientProfileFailed {
  _stage_status: "FAILED";
  _failure_type: ClientProfileFailureType;
  _failure_reason: string;
  _failure_context: {
    parse_error?: string;
    validation_errors?: string[];
    raw_response?: string;
    parsed_response?: unknown;
    api_error?: string;
    attempts_made: number;
    // Set when _failure_type is "max_retries_exceeded": the underlying issue
    // that recurred across all retries.
    last_failure_type?: "json_parse_failed" | "schema_validation_failed";
  };
  _metadata: Partial<StageMetadata>;
}

// Re-export the schema constants used elsewhere.
export {
  ArchetypeIdentifier,
  NumericValueSchema,
  PersonRecord,
  EntityRecord,
  StageMetadataSchema,
};
