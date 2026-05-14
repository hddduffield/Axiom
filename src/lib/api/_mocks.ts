// Mock fixtures used by Phase 4 Step 3 scaffolded route handlers.
//
// Phase 5 replaces these reads with real Supabase queries. Until then, every
// /api/* GET reads from this module so Claude Design has stable, realistic
// data to render against. The shapes mirror `database.types.ts` exactly.
//
// Naming convention: MOCK_<resource>_BY_ID for keyed lookups,
// LIST_<resource> for arrays. IDs are deterministic (mock-* prefix) so URLs
// are stable across reloads and Claude Design can hard-code links during
// component development.

import type {
  Advisor,
  Client,
  Plan,
  ActionItem,
  Note,
  LensRun,
  Partner,
} from "./types";

const ISO = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * 86_400_000).toISOString();

// ────────────────────────────────────────────────────────────────────────
// Advisors — mirrors the 3 PSA Wealth seats.
// ────────────────────────────────────────────────────────────────────────

export const MOCK_ADVISOR_HAYDEN: Advisor = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "hayden@psawealth.com",
  first_name: "Hayden",
  last_name: "Duffield",
  role: "advisor",
  active: true,
  created_at: ISO(-90),
  updated_at: ISO(-1),
};

export const MOCK_ADVISOR_WILL: Advisor = {
  id: "00000000-0000-0000-0000-000000000002",
  email: "will@psawealth.com",
  first_name: "Will",
  last_name: "Bearden",
  role: "advisor",
  active: true,
  created_at: ISO(-90),
  updated_at: ISO(-1),
};

export const MOCK_ADVISOR_THIRD: Advisor = {
  id: "00000000-0000-0000-0000-000000000003",
  email: "advisor3@psawealth.com",
  first_name: "TBD",
  last_name: "TBD",
  role: "advisor",
  active: true,
  created_at: ISO(-30),
  updated_at: ISO(-30),
};

export const LIST_ADVISORS: Advisor[] = [
  MOCK_ADVISOR_HAYDEN,
  MOCK_ADVISOR_WILL,
  MOCK_ADVISOR_THIRD,
];

export const MOCK_ADVISORS_BY_ID: Record<string, Advisor> = Object.fromEntries(
  LIST_ADVISORS.map((a) => [a.id, a]),
);

// Used by /api/advisors/me when the underlying user can't be resolved
// (Phase 4 Step 3 mock; Phase 5 reads from Supabase).
export const MOCK_CURRENT_ADVISOR: Advisor = MOCK_ADVISOR_HAYDEN;

// ────────────────────────────────────────────────────────────────────────
// Clients — Holloway is the canonical test fixture.
// ────────────────────────────────────────────────────────────────────────

export const MOCK_CLIENT_HOLLOWAY: Client = {
  id: "mock-client-holloway",
  lead_advisor_id: MOCK_ADVISOR_WILL.id,
  household_name: "Holloway Family",
  status: "active",
  archetype: "PRE",
  notes: "Marcus + Catherine; HIS owner-operator with $32–$48M valuation; transaction window 3–5 yrs.",
  created_at: ISO(-60),
  updated_at: ISO(-2),
  cadence_target_days: 30,
  cadence_custom_label: null,
  last_meaningful_contact_at: ISO(-7),
};

// Phase 9.22: removed MOCK_CLIENT_PROSPECT (Burke) + MOCK_CLIENT_INACTIVE
// (Vance) — Holloway is the sole production household. Only the lens-runs
// generate mock route consumes MOCK_CLIENTS_BY_ID for client_id existence
// validation; removing the extras leaves Holloway as the only valid mock id.

export const LIST_CLIENTS: Client[] = [MOCK_CLIENT_HOLLOWAY];

export const MOCK_CLIENTS_BY_ID: Record<string, Client> = Object.fromEntries(
  LIST_CLIENTS.map((c) => [c.id, c]),
);

// ────────────────────────────────────────────────────────────────────────
// Plans — one approved Holloway plan; Phase 5 will load the real Stage 4
// output from artifacts/integration_v1/stage4.json into stage4_output.
// ────────────────────────────────────────────────────────────────────────

export const MOCK_PLAN_HOLLOWAY_V1: Plan = {
  id: "mock-plan-holloway-2026-Q1",
  client_id: MOCK_CLIENT_HOLLOWAY.id,
  generated_by_advisor_id: MOCK_ADVISOR_WILL.id,
  status: "approved",
  generated_at: ISO(-30),
  approved_at: ISO(-25),
  archived_at: null,
  fact_review_filename: "Holloway_FactReview_2026-Q1.docx",
  // The real Stage 1/3a/4/5 outputs are large JSONB blobs — mocks set
  // null and Claude Design renders "(plan body loading)" placeholders
  // for the body sections. Real wiring lands in Phase 5.
  stage1_output: null,
  stage3a_output: null,
  stage4_output: null,
  stage5_output: null,
  cost_cents: 999,
  compliance_tracking_id: "PSA-2026-HOLL-Q1-A1B2",
  input_clientprofile_path: null,
  input_selected_recs_path: null,
  input_fact_review_path: null,
  processing_started_at: ISO(-30),
  processing_completed_at: ISO(-30),
  failure_reason: null,
};

export const MOCK_PLAN_HOLLOWAY_QUEUED: Plan = {
  id: "mock-plan-holloway-2026-Q2",
  client_id: MOCK_CLIENT_HOLLOWAY.id,
  generated_by_advisor_id: MOCK_ADVISOR_HAYDEN.id,
  status: "queued",
  generated_at: ISO(-2),
  approved_at: null,
  archived_at: null,
  fact_review_filename: "Holloway_FactReview_2026-Q2.docx",
  stage1_output: null,
  stage3a_output: null,
  stage4_output: null,
  stage5_output: null,
  cost_cents: null,
  compliance_tracking_id: null,
  input_clientprofile_path: "plan-inputs/mock-plan-holloway-2026-Q2/clientprofile.json",
  input_selected_recs_path: "plan-inputs/mock-plan-holloway-2026-Q2/selected_recs.json",
  input_fact_review_path: null,
  processing_started_at: null,
  processing_completed_at: null,
  failure_reason: null,
};

export const LIST_PLANS: Plan[] = [MOCK_PLAN_HOLLOWAY_V1, MOCK_PLAN_HOLLOWAY_QUEUED];

export const MOCK_PLANS_BY_ID: Record<string, Plan> = Object.fromEntries(
  LIST_PLANS.map((p) => [p.id, p]),
);

// ────────────────────────────────────────────────────────────────────────
// Action Items — the spine. Realistic mix of categories, statuses, owners.
// 18 entries (post-Phase-9.22): all Holloway plan items.
// ────────────────────────────────────────────────────────────────────────

const ai = (
  index: number,
  patch: Partial<ActionItem>,
): ActionItem => ({
  id: `mock-ai-${String(index).padStart(3, "0")}`,
  client_id: MOCK_CLIENT_HOLLOWAY.id,
  source_plan_id: MOCK_PLAN_HOLLOWAY_V1.id,
  source_lens_run_id: null,
  source_recommendation_id: null,
  parent_action_item_id: null,
  description: "—",
  category: "ENTITY",
  duration_class: "one_time",
  timing_bucket: "next_30_days",
  owner: MOCK_ADVISOR_WILL.email,
  partner_required: false,
  partner_type: null,
  status: "not_started",
  completed_at: null,
  completed_by_advisor_id: null,
  is_derivative_reminder: false,
  auto_generated_reminder_template: null,
  created_at: ISO(-25),
  updated_at: ISO(-25),
  ...patch,
});

export const LIST_ACTION_ITEMS: ActionItem[] = [
  // Entity / RB.1
  ai(1, {
    description: "Form Holloway Properties, LLC (Georgia) for the Kennesaw real estate.",
    category: "ENTITY",
    timing_bucket: "next_30_days",
    partner_required: true,
    partner_type: "Business Attorney",
    status: "in_progress",
  }),
  ai(2, {
    description: "Engage broker to opine on market rent for Kennesaw triple-net lease.",
    category: "ENTITY",
    timing_bucket: "next_30_days",
    partner_required: true,
    partner_type: "Commercial Real Estate Broker",
    status: "not_started",
  }),
  ai(3, {
    description: "Truist consent on LOC for HIS → Holloway Properties transfer.",
    category: "ENTITY",
    timing_bucket: "next_60_days",
    partner_required: true,
    partner_type: "Banker",
    status: "pending_decision",
  }),
  // Estate / RB.4 + RB.5
  ai(4, {
    description: "Update wills (currently 2014 — net worth then $3M; now $32–$48M).",
    category: "ESTATE",
    timing_bucket: "next_60_days",
    partner_required: true,
    partner_type: "Estate Attorney",
    owner: MOCK_ADVISOR_HAYDEN.email,
    status: "in_progress",
  }),
  ai(5, {
    description: "Establish ILIT (Irrevocable Life Insurance Trust) and fund with new $5M policy.",
    category: "ESTATE",
    timing_bucket: "next_90_days",
    partner_required: true,
    partner_type: "Estate Attorney",
    owner: MOCK_ADVISOR_HAYDEN.email,
    duration_class: "long_running",
    status: "not_started",
  }),
  ai(6, {
    description: "Q4 GRAT funding — $2.5M trailing 24-month average HIS valuation.",
    category: "ESTATE",
    timing_bucket: "this_year",
    partner_required: true,
    partner_type: "Estate Attorney",
    duration_class: "long_running",
    status: "not_started",
  }),
  // Tax / RB.6
  ai(7, {
    description: "File Georgia PTET election for 2026 tax year.",
    category: "TAX",
    timing_bucket: "next_30_days",
    partner_required: true,
    partner_type: "CPA",
    owner: "client",
    status: "not_started",
  }),
  ai(8, {
    description: "Coordinate Q3 estimated tax payments with PTET election timing.",
    category: "TAX",
    timing_bucket: "this_year",
    partner_required: true,
    partner_type: "CPA",
    status: "in_progress",
  }),
  // Risk / RB.2
  ai(9, {
    description: "Buy/sell agreement — fund with key-person life insurance ($8M total face).",
    category: "RISK",
    timing_bucket: "next_60_days",
    partner_required: true,
    partner_type: "Insurance Broker",
    duration_class: "long_running",
    status: "not_started",
  }),
  ai(10, {
    description: "Update HIS general liability coverage; current limits last reviewed 2022.",
    category: "RISK",
    timing_bucket: "next_90_days",
    partner_required: true,
    partner_type: "Insurance Broker",
    status: "not_started",
  }),
  // Cash flow / RP.8
  ai(11, {
    description: "Layer $310K personal cash into operating / emergency / near-term Treasury ladder.",
    category: "CASH_FLOW",
    timing_bucket: "next_30_days",
    owner: MOCK_ADVISOR_WILL.email,
    status: "not_started",
  }),
  // Investment / RP.9
  ai(12, {
    description: "Move Schwab joint brokerage to a 60/40 with municipal bond tilt (GA-state-tax-exempt).",
    category: "INVESTMENT",
    timing_bucket: "next_60_days",
    owner: MOCK_ADVISOR_WILL.email,
    status: "in_progress",
  }),
  // Retirement / RP.11
  ai(13, {
    description: "Open Solo 401(k) for HIS — Marcus contributes max $69K including profit-sharing.",
    category: "RETIREMENT",
    timing_bucket: "next_30_days",
    partner_required: true,
    partner_type: "CPA",
    status: "not_started",
  }),
  // Family / RP.12
  ai(14, {
    description: "Open 529 plans for both kids — fund with $19K annual exclusion gifts.",
    category: "FAMILY",
    timing_bucket: "this_year",
    duration_class: "long_running",
    owner: "client",
    status: "not_started",
  }),
  // Charity / RP.10
  ai(15, {
    description: "Open DAF at Schwab; fund with $50K of appreciated HIS shares.",
    category: "CHARITY",
    timing_bucket: "this_year",
    owner: "client",
    status: "not_started",
  }),
  // Succession / RB.7
  ai(16, {
    description: "Begin Q1 strategic-buyer prep: financials package + management presentation deck.",
    category: "SUCCESSION",
    timing_bucket: "this_year",
    duration_class: "long_running",
    partner_required: true,
    partner_type: "Investment Banker",
    status: "not_started",
  }),
  // Long-running with derivative reminder
  ai(17, {
    description: "Quarterly review of HIS financials with CPA — 2026 cadence.",
    category: "TAX",
    timing_bucket: "ongoing",
    duration_class: "long_running",
    is_derivative_reminder: true,
    auto_generated_reminder_template: "Quarterly review reminder, fires Q1/Q2/Q3/Q4.",
    status: "in_progress",
  }),
  // Completed example
  ai(18, {
    description: "Discovery call summary — 60-day deliverables timeline ratified with Marcus + Catherine.",
    category: "ENGAGEMENT",
    timing_bucket: "next_30_days",
    status: "complete",
    completed_at: ISO(-29),
    completed_by_advisor_id: MOCK_ADVISOR_WILL.id,
  }),
  // Phase 9.22: removed Burke prospect items (mock-ai-019, mock-ai-020)
  // alongside the MOCK_CLIENT_PROSPECT removal.
];

export const MOCK_ACTION_ITEMS_BY_ID: Record<string, ActionItem> = Object.fromEntries(
  LIST_ACTION_ITEMS.map((a) => [a.id, a]),
);

// ────────────────────────────────────────────────────────────────────────
// Notes — Notes Hub. Holloway only (post-Phase-9.22).
// ────────────────────────────────────────────────────────────────────────

const note = (
  index: number,
  patch: Partial<Note>,
): Note => ({
  id: `mock-note-${String(index).padStart(3, "0")}`,
  client_id: MOCK_CLIENT_HOLLOWAY.id,
  author_advisor_id: MOCK_ADVISOR_WILL.id,
  body: "—",
  tag: null,
  promoted_to_action_item_id: null,
  created_at: ISO(-10),
  ...patch,
});

export const LIST_NOTES: Note[] = [
  note(1, {
    body: "Marcus mentioned MEP roll-up inbound is ‘serious’ — letter this week. Tag for transaction window urgency.",
    tag: "call",
    created_at: ISO(-3),
  }),
  note(2, {
    body: "Catherine wants to revisit charitable giving structure before year-end — DAF vs CRT.",
    tag: "meeting",
    promoted_to_action_item_id: "mock-ai-015",
    created_at: ISO(-7),
  }),
  note(3, {
    body: "CPA confirmed PTET election deadline is March 15. Move action item up.",
    tag: "email",
    created_at: ISO(-1),
  }),
  // Phase 9.22: removed Burke prospect notes (mock-note-004, mock-note-005)
  // alongside the MOCK_CLIENT_PROSPECT removal.
];

export const MOCK_NOTES_BY_ID: Record<string, Note> = Object.fromEntries(
  LIST_NOTES.map((n) => [n.id, n]),
);

// ────────────────────────────────────────────────────────────────────────
// Lens Runs
// ────────────────────────────────────────────────────────────────────────

export const LIST_LENS_RUNS: LensRun[] = [
  {
    id: "mock-lens-run-001",
    client_id: MOCK_CLIENT_HOLLOWAY.id,
    generated_by_advisor_id: MOCK_ADVISOR_WILL.id,
    lens_type: "investment",
    context_input: "Focus on Schwab joint brokerage repositioning post-PTET.",
    status: "approved",
    generated_at: ISO(-15),
    output: null,
    cost_cents: 84,
    updated_at: ISO(-15),
    archived_at: null,
  },
  {
    id: "mock-lens-run-002",
    client_id: MOCK_CLIENT_HOLLOWAY.id,
    generated_by_advisor_id: MOCK_ADVISOR_HAYDEN.id,
    lens_type: "insurance",
    context_input: null,
    status: "draft",
    generated_at: ISO(-3),
    output: null,
    cost_cents: 76,
    updated_at: ISO(-3),
    archived_at: null,
  },
];

export const MOCK_LENS_RUNS_BY_ID: Record<string, LensRun> = Object.fromEntries(
  LIST_LENS_RUNS.map((l) => [l.id, l]),
);

// ────────────────────────────────────────────────────────────────────────
// Partners
// ────────────────────────────────────────────────────────────────────────

export const LIST_PARTNERS: Partner[] = [
  {
    id: "mock-partner-001",
    client_id: MOCK_CLIENT_HOLLOWAY.id,
    partner_type: "CPA",
    first_name: "Lisa",
    last_name: "Park",
    firm_name: "Park & Associates",
    email: "lisa@parkcpa.com",
    phone: "404-555-0142",
    notes: "20 years with HIS — handles all entity returns + PTET filing.",
    created_at: ISO(-60),
  },
  {
    id: "mock-partner-002",
    client_id: MOCK_CLIENT_HOLLOWAY.id,
    partner_type: "Estate Attorney",
    first_name: "James",
    last_name: "Whitfield",
    firm_name: "Whitfield Estate Planning",
    email: "james@whitfield-estate.com",
    phone: "404-555-0177",
    notes: "Drafting GRAT + ILIT instruments.",
    created_at: ISO(-30),
  },
  {
    id: "mock-partner-003",
    client_id: MOCK_CLIENT_HOLLOWAY.id,
    partner_type: "Insurance Broker",
    first_name: "Maria",
    last_name: "Chen",
    firm_name: "Chen Risk Advisors",
    email: "maria@chenrisk.com",
    phone: "404-555-0123",
    notes: "Quoting key-person + ILIT funding policies.",
    created_at: ISO(-20),
  },
];

export const MOCK_PARTNERS_BY_ID: Record<string, Partner> = Object.fromEntries(
  LIST_PARTNERS.map((p) => [p.id, p]),
);
