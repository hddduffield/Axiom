// Mock data — mirrors shapes from src/lib/api/types.ts and uses
// the deterministic mock IDs from claude_design_handoff.md §"Mocks → real data"

const ME = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "hayden@psawealth.com",
  first_name: "Hayden",
  last_name: "Duffield",
  role: "advisor",
  active: true,
};

const ADVISORS = [
  ME,
  { id: "adv-2", email: "marcus@psawealth.com", first_name: "Marcus", last_name: "Pell", role: "advisor", active: true },
  { id: "adv-3", email: "rene@psawealth.com",   first_name: "René",   last_name: "Okafor", role: "advisor", active: true },
];

const CLIENTS = [
  {
    id: "mock-client-holloway",
    household_name: "Holloway Family",
    lead_advisor_id: ME.id,
    status: "active",
    archetype: "MID",
    last_activity_at: "2026-04-29T14:12:00.000Z",
    aum: 38400000,
    entity_count: 4,
    notes: "Operating co + holdco + two trusts. MEP roll-up under negotiation.",
  },
  {
    id: "mock-client-burke",
    household_name: "Burke Family",
    lead_advisor_id: "adv-2",
    status: "prospect",
    archetype: "PRE",
    last_activity_at: "2026-04-30T19:40:00.000Z",
    aum: 31000000,
    entity_count: 2,
    notes: "Engagement letter pending. Founder, pre-liquidity.",
  },
  {
    id: "mock-client-vance",
    household_name: "Vance Family",
    lead_advisor_id: ME.id,
    status: "active",
    archetype: "POST",
    last_activity_at: "2026-04-22T09:05:00.000Z",
    aum: 64200000,
    entity_count: 6,
    notes: "Post-liquidity. Foundation funded Q3 last year.",
  },
  {
    id: "mock-client-okonkwo",
    household_name: "Okonkwo Family",
    lead_advisor_id: ME.id,
    status: "active",
    archetype: "MID",
    last_activity_at: "2026-04-30T16:20:00.000Z",
    aum: 22800000,
    entity_count: 3,
    notes: "Two physician practices + rental real estate. Spouse expecting partner buy-in offer this fall.",
  },
  {
    id: "mock-client-sterling",
    household_name: "Sterling Family",
    lead_advisor_id: "adv-3",
    status: "active",
    archetype: "POST",
    last_activity_at: "2026-04-18T11:30:00.000Z",
    aum: 112500000,
    entity_count: 9,
    notes: "Three generations. Family office handoff in progress; PSA acts as overlay advisor.",
  },
  {
    id: "mock-client-mireles",
    household_name: "Mireles Family",
    lead_advisor_id: "adv-2",
    status: "prospect",
    archetype: "PRE",
    last_activity_at: "2026-05-01T13:45:00.000Z",
    aum: 0,
    entity_count: 1,
    notes: "Founder of regional logistics co. Initial discovery call Apr 24. AUM TBD post-engagement.",
  },
];

// 20 action items, mapped to the spec's mock IDs.
const ACTION_ITEMS = [
  // Holloway — Hayden's pile
  { id: "mock-ai-001", client_id: "mock-client-holloway", description: "Confirm MEP roll-up terms with Marcus before Friday's call.",       category: "BUSINESS",     duration_class: "one_time",     timing_bucket: "this_week",   owner: "hayden@psawealth.com", status: "in_progress",     partner_required: false, partner_type: null,     created_at: "2026-04-22T13:00:00.000Z", due_at: "2026-05-08T17:00:00.000Z" },
  { id: "mock-ai-002", client_id: "mock-client-holloway", description: "Engagement letter signature follow-up — Lisa Park (CPA).",         category: "ENGAGEMENT",   duration_class: "one_time",     timing_bucket: "this_week",   owner: "hayden@psawealth.com", status: "pending_decision", partner_required: true,  partner_type: "CPA",    created_at: "2026-04-19T10:00:00.000Z", due_at: "2026-05-07T17:00:00.000Z" },
  { id: "mock-ai-003", client_id: "mock-client-holloway", description: "Reconcile Q1 distribution schedule against operating cash flow.",  category: "CASH_FLOW",    duration_class: "one_time",     timing_bucket: "this_week",   owner: "hayden@psawealth.com", status: "not_started",     partner_required: false, partner_type: null,     created_at: "2026-04-25T09:00:00.000Z", due_at: "2026-05-09T17:00:00.000Z" },
  { id: "mock-ai-004", client_id: "mock-client-holloway", description: "Draft estate-tax memo for Holloway holdco recapitalization.",      category: "ESTATE",       duration_class: "long_running", timing_bucket: "next_30_days", owner: "hayden@psawealth.com", status: "in_progress",     partner_required: true,  partner_type: "ATTORNEY", created_at: "2026-04-10T15:00:00.000Z", due_at: "2026-05-22T17:00:00.000Z" },
  { id: "mock-ai-005", client_id: "mock-client-holloway", description: "Reschedule Q2 review — Holloway requested late May.",              category: "MEETING",      duration_class: "one_time",     timing_bucket: "next_30_days", owner: "hayden@psawealth.com", status: "not_started",     partner_required: false, partner_type: null,     created_at: "2026-04-28T11:00:00.000Z", due_at: "2026-05-25T17:00:00.000Z" },

  // Vance — Hayden's pile
  { id: "mock-ai-006", client_id: "mock-client-vance",    description: "Foundation grant calendar — confirm Q3 disbursement amounts.",     category: "PHILANTHROPY", duration_class: "long_running", timing_bucket: "next_30_days", owner: "hayden@psawealth.com", status: "in_progress",     partner_required: false, partner_type: null,     created_at: "2026-04-12T10:00:00.000Z", due_at: "2026-05-30T17:00:00.000Z" },
  { id: "mock-ai-007", client_id: "mock-client-vance",    description: "Insurance lens — re-run after Q1 valuations land.",                category: "INSURANCE",    duration_class: "one_time",     timing_bucket: "next_30_days", owner: "hayden@psawealth.com", status: "not_started",     partner_required: false, partner_type: null,     created_at: "2026-04-22T16:00:00.000Z", due_at: "2026-05-28T17:00:00.000Z" },
  { id: "mock-ai-008", client_id: "mock-client-vance",    description: "Get IRS determination letter for the Vance foundation refresh.",   category: "TAX",          duration_class: "one_time",     timing_bucket: "this_week",   owner: "hayden@psawealth.com", status: "pending_decision", partner_required: true,  partner_type: "ATTORNEY", created_at: "2026-04-20T08:00:00.000Z", due_at: "2026-05-09T17:00:00.000Z" },
  { id: "mock-ai-009", client_id: "mock-client-vance",    description: "Wire instructions confirmation — quarterly fee debit.",            category: "OPERATIONS",   duration_class: "one_time",     timing_bucket: "overdue",     owner: "hayden@psawealth.com", status: "in_progress",     partner_required: false, partner_type: null,     created_at: "2026-04-08T08:00:00.000Z", due_at: "2026-04-30T17:00:00.000Z" },

  // Burke — Marcus's pile (still visible — no per-advisor isolation in v1)
  { id: "mock-ai-010", client_id: "mock-client-burke",    description: "Send Burke initial engagement letter (Marcus to sign).",           category: "ENGAGEMENT",   duration_class: "one_time",     timing_bucket: "this_week",   owner: "marcus@psawealth.com", status: "not_started",     partner_required: false, partner_type: null,     created_at: "2026-04-30T13:00:00.000Z", due_at: "2026-05-08T17:00:00.000Z" },
  { id: "mock-ai-011", client_id: "mock-client-burke",    description: "Pre-liquidity tax planning intro deck.",                           category: "TAX",          duration_class: "long_running", timing_bucket: "next_30_days", owner: "marcus@psawealth.com", status: "in_progress",     partner_required: false, partner_type: null,     created_at: "2026-04-25T11:00:00.000Z", due_at: "2026-05-26T17:00:00.000Z" },
  { id: "mock-ai-012", client_id: "mock-client-burke",    description: "Schedule Burke + spouse fact-review session.",                     category: "MEETING",      duration_class: "one_time",     timing_bucket: "this_week",   owner: "client",                status: "pending_decision", partner_required: false, partner_type: null,     created_at: "2026-04-28T09:00:00.000Z", due_at: "2026-05-09T17:00:00.000Z" },

  // More Holloway — secondary owner cases
  { id: "mock-ai-013", client_id: "mock-client-holloway", description: "Confirm 401(k) contribution maxing for Holloway operating co.",    category: "RETIREMENT",   duration_class: "one_time",     timing_bucket: "next_90_days", owner: "hayden@psawealth.com", status: "not_started",     partner_required: false, partner_type: null,     created_at: "2026-04-15T09:00:00.000Z", due_at: "2026-07-15T17:00:00.000Z" },
  { id: "mock-ai-014", client_id: "mock-client-holloway", description: "Annual Reg BI disclosure refresh — file by 6/30.",                  category: "COMPLIANCE",   duration_class: "one_time",     timing_bucket: "next_90_days", owner: "rene@psawealth.com",   status: "not_started",     partner_required: false, partner_type: null,     created_at: "2026-04-02T10:00:00.000Z", due_at: "2026-06-30T17:00:00.000Z" },
  { id: "mock-ai-015", client_id: "mock-client-holloway", description: "Update Schwab account beneficiary docs post recapitalization.",    category: "OPERATIONS",   duration_class: "one_time",     timing_bucket: "next_30_days", owner: "hayden@psawealth.com", status: "complete",        partner_required: false, partner_type: null,     created_at: "2026-04-01T10:00:00.000Z", due_at: "2026-04-25T17:00:00.000Z", completed_at: "2026-04-24T15:00:00.000Z" },

  // Vance closeouts
  { id: "mock-ai-016", client_id: "mock-client-vance",    description: "Custodian transfer — old DAF closeout.",                           category: "OPERATIONS",   duration_class: "one_time",     timing_bucket: "next_30_days", owner: "hayden@psawealth.com", status: "complete",        partner_required: false, partner_type: null,     created_at: "2026-03-28T10:00:00.000Z", due_at: "2026-04-22T17:00:00.000Z", completed_at: "2026-04-22T11:00:00.000Z" },
  { id: "mock-ai-017", client_id: "mock-client-vance",    description: "Request updated K-1s from Vance LLC accountant.",                  category: "TAX",          duration_class: "one_time",     timing_bucket: "overdue",     owner: "hayden@psawealth.com", status: "in_progress",     partner_required: true,  partner_type: "CPA",    created_at: "2026-04-05T10:00:00.000Z", due_at: "2026-04-28T17:00:00.000Z" },

  // Burke pipeline
  { id: "mock-ai-018", client_id: "mock-client-burke",    description: "Coordinate corporate counsel intro — Sterling & Hunt.",            category: "PARTNERS",     duration_class: "one_time",     timing_bucket: "next_30_days", owner: "marcus@psawealth.com", status: "in_progress",     partner_required: true,  partner_type: "ATTORNEY", created_at: "2026-04-26T10:00:00.000Z", due_at: "2026-05-26T17:00:00.000Z" },
  { id: "mock-ai-019", client_id: "mock-client-burke",    description: "Pre-mortem doc for Q3 transaction sequencing.",                    category: "BUSINESS",     duration_class: "long_running", timing_bucket: "next_90_days", owner: "marcus@psawealth.com", status: "not_started",     partner_required: false, partner_type: null,     created_at: "2026-04-29T10:00:00.000Z", due_at: "2026-07-30T17:00:00.000Z" },
  { id: "mock-ai-020", client_id: "mock-client-holloway", description: "Compile family-meeting agenda — June 14 offsite.",                 category: "MEETING",      duration_class: "one_time",     timing_bucket: "next_30_days", owner: "hayden@psawealth.com", status: "not_started",     partner_required: false, partner_type: null,     created_at: "2026-04-27T10:00:00.000Z", due_at: "2026-06-10T17:00:00.000Z" },

  // Okonkwo — Hayden's pile (active, MID archetype, real estate + practice complexity)
  { id: "mock-ai-021", client_id: "mock-client-okonkwo",  description: "Cost-segregation study quote on the Buford Hwy rental — push to Q3.", category: "TAX",         duration_class: "one_time",     timing_bucket: "next_30_days", owner: "hayden@psawealth.com", status: "in_progress",     partner_required: true,  partner_type: "CPA",      created_at: "2026-04-21T09:00:00.000Z", due_at: "2026-05-29T17:00:00.000Z" },
  { id: "mock-ai-022", client_id: "mock-client-okonkwo",  description: "Disability insurance review — practice partnership clause.",         category: "INSURANCE",    duration_class: "one_time",     timing_bucket: "this_week",   owner: "hayden@psawealth.com", status: "not_started",     partner_required: true,  partner_type: "BROKER",   created_at: "2026-04-26T10:00:00.000Z", due_at: "2026-05-09T17:00:00.000Z" },
  { id: "mock-ai-023", client_id: "mock-client-okonkwo",  description: "Cash sweep — $640K from practice distribution to brokerage.",         category: "OPERATIONS",   duration_class: "one_time",     timing_bucket: "this_week",   owner: "hayden@psawealth.com", status: "pending_decision", partner_required: false, partner_type: null,       created_at: "2026-04-29T10:00:00.000Z", due_at: "2026-05-08T17:00:00.000Z" },
  { id: "mock-ai-024", client_id: "mock-client-okonkwo",  description: "529 contribution catch-up for both kids.",                            category: "CASH_FLOW",    duration_class: "one_time",     timing_bucket: "next_30_days", owner: "hayden@psawealth.com", status: "not_started",     partner_required: false, partner_type: null,       created_at: "2026-04-23T10:00:00.000Z", due_at: "2026-05-30T17:00:00.000Z" },

  // Sterling — René's pile (large family-office overlay engagement)
  { id: "mock-ai-025", client_id: "mock-client-sterling", description: "Coordinate G2 family meeting — investment policy review.",            category: "MEETING",      duration_class: "long_running", timing_bucket: "next_30_days", owner: "rene@psawealth.com",   status: "in_progress",     partner_required: false, partner_type: null,       created_at: "2026-04-08T10:00:00.000Z", due_at: "2026-05-28T17:00:00.000Z" },
  { id: "mock-ai-026", client_id: "mock-client-sterling", description: "Sign updated IMA — Sterling Holdings entity addition.",                category: "ENGAGEMENT",   duration_class: "one_time",     timing_bucket: "overdue",     owner: "rene@psawealth.com",   status: "pending_decision", partner_required: true,  partner_type: "ATTORNEY", created_at: "2026-04-04T10:00:00.000Z", due_at: "2026-04-29T17:00:00.000Z" },
  { id: "mock-ai-027", client_id: "mock-client-sterling", description: "Annual G3 education session — investing fundamentals.",               category: "MEETING",      duration_class: "one_time",     timing_bucket: "next_90_days", owner: "rene@psawealth.com",   status: "not_started",     partner_required: false, partner_type: null,       created_at: "2026-04-14T10:00:00.000Z", due_at: "2026-07-22T17:00:00.000Z" },
  { id: "mock-ai-028", client_id: "mock-client-sterling", description: "Estate refresh — review trust amendments from Beasley & Co.",         category: "ESTATE",       duration_class: "long_running", timing_bucket: "next_30_days", owner: "rene@psawealth.com",   status: "in_progress",     partner_required: true,  partner_type: "ATTORNEY", created_at: "2026-04-02T10:00:00.000Z", due_at: "2026-05-30T17:00:00.000Z" },

  // Mireles — Marcus's pile (prospect, just discovered)
  { id: "mock-ai-029", client_id: "mock-client-mireles",  description: "Send follow-up materials post-discovery (capabilities deck + bio).",  category: "ENGAGEMENT",   duration_class: "one_time",     timing_bucket: "this_week",   owner: "marcus@psawealth.com", status: "in_progress",     partner_required: false, partner_type: null,       created_at: "2026-04-30T13:00:00.000Z", due_at: "2026-05-07T17:00:00.000Z" },
  { id: "mock-ai-030", client_id: "mock-client-mireles",  description: "Schedule fact-review intake — coordinate with Mireles' assistant.",   category: "MEETING",      duration_class: "one_time",     timing_bucket: "this_week",   owner: "client",                status: "pending_decision", partner_required: false, partner_type: null,       created_at: "2026-05-01T10:00:00.000Z", due_at: "2026-05-09T17:00:00.000Z" },
];

const NOTES = [
  { id: "mock-note-001", client_id: "mock-client-holloway", author_advisor_id: ME.id, body: "Marcus mentioned MEP roll-up inbound is 'serious' — letter this week. Lisa Park (CPA) will draft the side letter; we sign Friday.", tag: "call",     created_at: "2026-04-29T14:12:00.000Z", promoted_to_action_item_id: "mock-ai-001" },
  { id: "mock-note-002", client_id: "mock-client-holloway", author_advisor_id: ME.id, body: "Holloway daughter starting at Northwestern in fall. Discuss 529 funding strategy at Q2 review.",                                  tag: "review",   created_at: "2026-04-27T11:00:00.000Z", promoted_to_action_item_id: null },
  { id: "mock-note-003", client_id: "mock-client-vance",    author_advisor_id: ME.id, body: "Foundation Q3 grant calendar finalized w/ Vance — 4 grantees, $1.2M total. Need IRS determination letter ahead of disbursement.", tag: "meeting",  created_at: "2026-04-25T16:30:00.000Z", promoted_to_action_item_id: "mock-ai-008" },
  { id: "mock-note-004", client_id: "mock-client-burke",    author_advisor_id: "adv-2", body: "Burke called — wants to push fact-review to next week. Wife has work travel through 5/6.",                                       tag: "call",     created_at: "2026-04-28T09:15:00.000Z", promoted_to_action_item_id: "mock-ai-012" },
  { id: "mock-note-005", client_id: "mock-client-vance",    author_advisor_id: ME.id, body: "Discussed 2026 RMD strategy — Vance prefers QCDs over taxable distribution. Will model both at next Cash Flow lens run.",          tag: "review",   created_at: "2026-04-22T09:05:00.000Z", promoted_to_action_item_id: null },
  { id: "mock-note-006", client_id: "mock-client-okonkwo",  author_advisor_id: ME.id,   body: "Adaeze called re: practice partnership offer arriving Sept. Wants to model two scenarios: full buy-in vs phased. Books cost-seg conversation for May.", tag: "call",     created_at: "2026-04-30T16:20:00.000Z", promoted_to_action_item_id: "mock-ai-021" },
  { id: "mock-note-007", client_id: "mock-client-okonkwo",  author_advisor_id: ME.id,   body: "Reviewed beneficiary designations across both retirement accounts — primary outdated (still listed prior spouse). Adaeze to send updated forms.",        tag: "review",   created_at: "2026-04-26T11:00:00.000Z", promoted_to_action_item_id: null },
  { id: "mock-note-008", client_id: "mock-client-sterling", author_advisor_id: "adv-3", body: "Sterling family office handoff: their CFO Karen wants quarterly reporting in their format. Sent template request to ops.",                                tag: "meeting",  created_at: "2026-04-18T11:30:00.000Z", promoted_to_action_item_id: null },
  { id: "mock-note-009", client_id: "mock-client-sterling", author_advisor_id: "adv-3", body: "G2 (the three siblings) aligned on pulling forward generational gifting given current exemption sunset risk. Beasley drafting amendments.",                tag: "meeting",  created_at: "2026-04-09T14:00:00.000Z", promoted_to_action_item_id: "mock-ai-028" },
  { id: "mock-note-010", client_id: "mock-client-mireles",  author_advisor_id: "adv-2", body: "Discovery call w/ Rafael Mireles. Logistics co doing ~$84M revenue, considering recap. Pre-engagement; positioned us as transition partner not just AUM shop.", tag: "call",     created_at: "2026-04-24T15:00:00.000Z", promoted_to_action_item_id: null },
];

const PLANS = [
  { id: "mock-plan-holloway-2026-Q1", client_id: "mock-client-holloway", title: "Holloway 2026 Q1 Plan",       status: "approved",         created_at: "2026-02-14T10:00:00.000Z", approved_at: "2026-02-21T14:00:00.000Z", archived_at: null, quarter: "Q1 2026", rec_count: 11, lens_run_count: 5, fact_review_filename: "holloway_fr_2026-01-30.docx", has_stage4_output: true,  last_regenerated_at: "2026-02-14T10:00:00.000Z" },
  { id: "mock-plan-holloway-2026-Q2", client_id: "mock-client-holloway", title: "Holloway 2026 Q2 Plan",       status: "ready_for_review", created_at: "2026-04-21T10:00:00.000Z", approved_at: null,                       archived_at: null, quarter: "Q2 2026", rec_count: 12, lens_run_count: 6, fact_review_filename: "holloway_fr_2026-04-21.docx", has_stage4_output: true,  last_regenerated_at: "2026-04-29T08:14:00.000Z" },
  { id: "mock-plan-vance-2026-Q2",    client_id: "mock-client-vance",    title: "Vance 2026 Q2 Plan",          status: "draft",            created_at: "2026-05-01T10:00:00.000Z", approved_at: null,                       archived_at: null, quarter: "Q2 2026", rec_count: 0,  lens_run_count: 0, fact_review_filename: "vance_fr_2026-04-28.docx",    has_stage4_output: false, last_regenerated_at: null },
  { id: "mock-plan-okonkwo-2026-Q1",  client_id: "mock-client-okonkwo",  title: "Okonkwo 2026 Q1 Plan",        status: "approved",         created_at: "2026-02-08T10:00:00.000Z", approved_at: "2026-02-19T10:00:00.000Z", archived_at: null, quarter: "Q1 2026", rec_count: 9,  lens_run_count: 4, fact_review_filename: "okonkwo_fr_2026-01-25.docx",  has_stage4_output: true,  last_regenerated_at: "2026-02-08T10:00:00.000Z" },
  { id: "mock-plan-okonkwo-2026-Q2",  client_id: "mock-client-okonkwo",  title: "Okonkwo 2026 Q2 Plan",        status: "ready_for_review", created_at: "2026-04-24T10:00:00.000Z", approved_at: null,                       archived_at: null, quarter: "Q2 2026", rec_count: 10, lens_run_count: 5, fact_review_filename: "okonkwo_fr_2026-04-22.docx",  has_stage4_output: true,  last_regenerated_at: "2026-04-30T11:00:00.000Z" },
  { id: "mock-plan-sterling-2026-Q1", client_id: "mock-client-sterling", title: "Sterling 2026 Q1 Plan",       status: "approved",         created_at: "2026-01-22T10:00:00.000Z", approved_at: "2026-02-04T10:00:00.000Z", archived_at: null, quarter: "Q1 2026", rec_count: 14, lens_run_count: 8, fact_review_filename: "sterling_fr_2026-01-12.docx", has_stage4_output: true,  last_regenerated_at: "2026-01-22T10:00:00.000Z" },
  { id: "mock-plan-sterling-2025-Q4", client_id: "mock-client-sterling", title: "Sterling 2025 Q4 Plan",       status: "archived",         created_at: "2025-10-15T10:00:00.000Z", approved_at: "2025-10-28T10:00:00.000Z", archived_at: "2026-02-04T10:00:00.000Z", quarter: "Q4 2025", rec_count: 13, lens_run_count: 7, fact_review_filename: "sterling_fr_2025-10-04.docx", has_stage4_output: true,  last_regenerated_at: "2025-10-15T10:00:00.000Z" },
];

const LENS_RUNS = [
  { id: "mock-lens-run-001", client_id: "mock-client-holloway", lens_type: "investment", status: "complete", created_at: "2026-04-15T10:00:00.000Z", context_input: "Re-run after Q1 valuations." },
  { id: "mock-lens-run-002", client_id: "mock-client-holloway", lens_type: "cash_flow",  status: "draft",    created_at: "2026-04-26T10:00:00.000Z", context_input: "Stress test against MEP roll-up scenarios." },
  { id: "mock-lens-run-003", client_id: "mock-client-okonkwo",  lens_type: "tax",        status: "complete", created_at: "2026-04-19T10:00:00.000Z", context_input: "Cost-seg viability on 3 rental properties." },
  { id: "mock-lens-run-004", client_id: "mock-client-okonkwo",  lens_type: "insurance",  status: "complete", created_at: "2026-04-12T10:00:00.000Z", context_input: "Disability gap analysis pre-partnership." },
  { id: "mock-lens-run-005", client_id: "mock-client-sterling", lens_type: "estate",     status: "complete", created_at: "2026-04-02T10:00:00.000Z", context_input: "Generational gifting acceleration scenarios." },
  { id: "mock-lens-run-006", client_id: "mock-client-sterling", lens_type: "investment", status: "draft",    created_at: "2026-04-28T10:00:00.000Z", context_input: "IPS refresh — 60/40 floor sensitivity." },
];

const PARTNERS = [
  { id: "mock-partner-001", client_id: "mock-client-holloway", partner_type: "CPA",      first_name: "Lisa",   last_name: "Park",   firm_name: "Park & Associates",     email: "lisa@parkcpa.com",       phone: "404-555-0142", notes: "Handles entity returns + PTET." },
  { id: "mock-partner-002", client_id: "mock-client-holloway", partner_type: "ATTORNEY", first_name: "Daniel", last_name: "Reeves", firm_name: "Reeves Estate Counsel", email: "dreeves@reevescounsel.com", phone: "404-555-0188", notes: "Estate, holdco recapitalization." },
  { id: "mock-partner-003", client_id: "mock-client-holloway", partner_type: "BROKER",   first_name: "Annette", last_name: "Cho",  firm_name: "Cho Risk Advisors",     email: "annette@chorisk.com",     phone: "404-555-0177", notes: "P&C + key-person." },
  { id: "mock-partner-004", client_id: "mock-client-okonkwo",  partner_type: "CPA",      first_name: "Marcus",  last_name: "Whitfield", firm_name: "Whitfield Tax Group",   email: "mwhitfield@whitfieldtax.com", phone: "770-555-0210", notes: "Practice + rental real estate; cost-seg specialist." },
  { id: "mock-partner-005", client_id: "mock-client-okonkwo",  partner_type: "BROKER",   first_name: "Sasha",   last_name: "Brennan",   firm_name: "Brennan Disability",     email: "sasha@brennandi.com",      phone: "770-555-0245", notes: "Physician-specific DI & life." },
  { id: "mock-partner-006", client_id: "mock-client-sterling", partner_type: "ATTORNEY", first_name: "Robert",  last_name: "Beasley",   firm_name: "Beasley & Co.",          email: "rbeasley@beasleylaw.com",  phone: "212-555-0301", notes: "Family trusts, three-generation structure." },
  { id: "mock-partner-007", client_id: "mock-client-sterling", partner_type: "CPA",      first_name: "Karen",   last_name: "Iverson",   firm_name: "Sterling Family Office", email: "kiverson@sterlingfo.com",  phone: "212-555-0312", notes: "Internal CFO. Quarterly reporting liaison." },
  { id: "mock-partner-008", client_id: "mock-client-mireles",  partner_type: "ATTORNEY", first_name: "Diego",   last_name: "Ramos",     firm_name: "Ramos Corporate",         email: "dramos@ramoslaw.com",      phone: "713-555-0188", notes: "Existing corporate counsel — recap advisor." },
];

// Speech bubble for the 14-section plan view. Real plans come from
// stage4_output JSONB; in v1 mock returns null. The structure here is
// faithful to the section list in claude_design_handoff.md §G.
const PLAN_SECTIONS = [
  { num: 1,  title: "Title page",                    placeholder: false },
  { num: 2,  title: "Executive summary",             placeholder: false },
  { num: 3,  title: "Our process",                   placeholder: false },
  { num: 4,  title: "Client snapshot",               placeholder: false },
  { num: 5,  title: "Goals & priorities",            placeholder: false },
  { num: 6,  title: "Findings & observations",       placeholder: false },
  { num: 7,  title: "Recommendations — Business",    placeholder: false, code: "RB.1–7"  },
  { num: 8,  title: "Recommendations — Personal",    placeholder: false, code: "RP.8–12" },
  { num: 9,  title: "Implementation roadmap",        placeholder: false },
  { num: 10, title: "Decisions needed",              placeholder: false },
  { num: 11, title: "Advisory team",                 placeholder: false },
  { num: 12, title: "Meeting cadence",               placeholder: false },
  { num: 13, title: "Glossary",                      placeholder: false },
  { num: 14, title: "Disclosures",                   placeholder: false },
];

window.AXIOM_DATA = {
  ME, ADVISORS, CLIENTS, ACTION_ITEMS, NOTES, PLANS, LENS_RUNS, PARTNERS, PLAN_SECTIONS,
};
