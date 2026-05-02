# Axiom — App Architecture Overview (v1)

**Type:** Top-level architectural reference. Not a build doc; the v1 frame that all other features and components plug into. Lower-level specs (`plan_entity.spec.md`, `lens_contracts.spec.md`, the per-stage specs in `specs/stages/`) refine pieces of this overview.

**Purpose:** Define what Axiom v1 is, what it isn't, the durable invariants of v1, the data model, the API surface, the auth model, the mobile-app scope, the deployment shape, the background-worker contract, and the compliance posture. Phase 6 implementation reads this spec to know what to build; future specs reference it to know where their pieces fit.

**Critical:** This spec is the v1 contract. Anything not in v1 scope (multi-tenant, compliance enforcement, lens-derived ActionItems, etc.) is recorded here as v1.5+ backlog so future work has a clean starting point. Anything in v1 scope is pinned to specific tables, endpoints, and roles — implementation is the only ambiguity left.

---

## Product Frame

Axiom is the day-to-day operating system for **PSA Wealth**, a 3-advisor RIA team in Atlanta. The app exists to support advisor workflow:

1. **Auth + activity logging** — invitation-only access, full audit trail.
2. **Notes Hub** — free-form notes attached to clients, optional tag, manual promotion to action item.
3. **To-Do List** — per-advisor weekly view, drag/drop, populated from Notes promotions and Plan delivery.
4. **Client overview pages** — client list → individual overview; the client *is* the business; executives are individuals associated with the business.
5. **Financial Plan generator** — Stages 0–5 + glue + harness; produces master Plan via Anthropic Opus 4.7 (and Haiku 4.5 for Stage 2a).
6. **Cash Flow / Investment / Insurance lenses** — single-call lens generators on top of the master Plan (see `lens_contracts.spec.md`).
7. **Action Item Tracker** — auto-extracted from delivered plans; derivative reminders auto-spawn for long-running items.
8. **Partner Page** — CPAs, attorneys, brokers, etc., contact info, what they're handling for which clients.
9. **PDF export** — internal and client-facing plan PDFs; lens views render to PDF as well.
10. **Mobile app** — notes-only in v1 (see Mobile App Architecture below).

---

## High-Level Architecture Diagram

```
                ┌────────────────────────────┐         ┌────────────────────────────┐
                │   Web App (Next.js 16)     │         │   Mobile App (React        │
                │   Vercel-hosted serverless │         │   Native / Expo)           │
                │   tailwind + shadcn/ui     │         │   Notes-only scope (v1)    │
                └─────────────┬──────────────┘         └─────────────┬──────────────┘
                              │                                       │
                              │  HTTPS                                │  HTTPS
                              ▼                                       ▼
                ┌──────────────────────────────────────────────────────────────────┐
                │                         API Surface                              │
                │            Next.js route handlers (serverless functions)         │
                │      /api/clients, /api/plans, /api/lens/*, /api/action_items,   │
                │      /api/notes, /api/partners, /api/activity_log, /api/mobile/* │
                └─────────────┬───────────────────────────────────────┬────────────┘
                              │                                       │
                              ▼                                       ▼
              ┌────────────────────────────────┐      ┌────────────────────────────┐
              │   Supabase                     │      │   Anthropic API            │
              │   ─ Postgres (data)            │      │   ─ Opus 4.7 (Stages       │
              │   ─ Auth (JWT, magic link)     │      │     1, 2b, 3a, 4, lenses)  │
              │   ─ Storage (PDFs, FRs)        │      │   ─ Haiku 4.5 (Stage 2a)   │
              │   ─ Row-Level Security         │      │   ─ Prompt caching         │
              └────────────────────────────────┘      └────────────────────────────┘
                              │
                              ▼
              ┌────────────────────────────────┐
              │  Background Workers            │
              │  ─ Vercel cron (hourly tick)   │
              │  ─ Derivative Reminder Spawner │
              └────────────────────────────────┘
```

The diagram shows v1's three external dependencies: **Supabase** (data + auth + storage), **Anthropic API** (LLM), **Vercel** (hosting + cron). No other service is in the v1 critical path. (OneDrive runs in parallel for compliance redundancy but is not an Axiom integration in v1; see "V1 Invariants" below.)

---

## V1 Invariants

The following hold for v1 and are load-bearing for many architectural choices. Changing any of them is a v2 (or v1.5 with explicit revision) decision.

1. **Closed app, invitation-only.** No public sign-up. Admin (Hayden) creates accounts via Supabase admin API or a private admin page.
2. **3 advisor users initially**, extensible via the admin page.
3. **Single-tenant — PSA Wealth only.** All data belongs to one firm. v2 SaaS introduces multi-tenancy; v1 schema does not include a `tenant_id` because adding it later is a clean additive migration but adding it now is premature and complicates RLS.
4. **All client data also stored in OneDrive for compliance.** Axiom is a *supplement* to OneDrive in v1, not a replacement. This is an operational policy, not enforced by the app — advisors carry forward their existing OneDrive habits. Compliance investment phase may automate OneDrive sync.
5. **No PII in API calls during build/test phase.** Synthetic Holloway is the canonical test fixture. Live Anthropic test gates use `RUN_LIVE_API_TESTS` env var; CI never runs them. Production calls use real client data only post-delivery readiness sign-off.
6. **Synthetic Holloway is the canonical test fixture.** Stage 1 / 2 / 3a live tests, lens live tests, and end-to-end validation all run against synthetic Holloway. Real-client smoke tests happen in a private staging environment with explicit advisor consent.
7. **Stack is locked at v1.** Next.js 16 (TypeScript), Supabase (Postgres + Auth + Storage), Anthropic SDK (Opus 4.7 + Haiku 4.5), Tailwind + shadcn/ui, React Native (Expo) for mobile, Vercel for hosting. Substituting any of these is a v1.5+ decision.
8. **Plans persist indefinitely.** No retention enforcement in v1. Compliance investment phase introduces bounded retention.
9. **Pipeline determinism boundary.** LLM calls are at `temperature: 0.0` with prompt caching. Deterministic stages (Stage 0, Stage 2c, Stage 3b, Stage 5 mechanical pre-checks, all glue builders) produce identical output for identical input. Tests rely on this.
10. **Compliance ID is null in v1** (placeholder field). Compliance integration is deferred per architectural decision.

---

## Database Schema (Postgres on Supabase)

All tables live in the `public` schema. UUIDs use `gen_random_uuid()`. Timestamps are `timestamptz` (Postgres timezone-aware). All tables have `created_at`; mutable tables have `updated_at` maintained by trigger.

This section is the v1 schema contract. Migrations are Phase 6 work; this is the design they conform to.

### `advisors`

| Column | Type | Notes |
|---|---|---|
| advisor_id | uuid PRIMARY KEY DEFAULT gen_random_uuid() | |
| email | text UNIQUE NOT NULL | |
| full_name | text NOT NULL | |
| short_name | text | |
| role | text NOT NULL CHECK (role IN ('advisor','admin')) | |
| created_at | timestamptz NOT NULL DEFAULT now() | |
| last_login_at | timestamptz | |
| active | boolean NOT NULL DEFAULT true | |
| avatar_url | text | |
| mobile_app_enrolled | boolean NOT NULL DEFAULT false | |

Indexes: `(email)`, `(active) WHERE active = true`.

### `clients`

The Axiom unit of "client" is a **business**. Individuals associated with the business live in `client_executives`.

| Column | Type | Notes |
|---|---|---|
| client_id | uuid PRIMARY KEY DEFAULT gen_random_uuid() | |
| business_legal_name | text NOT NULL | |
| business_short_name | text | |
| primary_advisor_id | uuid NOT NULL REFERENCES advisors(advisor_id) | |
| advisory_team | uuid[] NOT NULL DEFAULT '{}' | array of advisor_ids; `primary_advisor_id` is implicitly part of the team |
| onboarding_date | date | |
| engagement_status | text NOT NULL CHECK (engagement_status IN ('prospective','active','paused','departed')) | |
| archetype | text CHECK (archetype IN ('PRE','POST','ACT','FO','FOUND')) | nullable until first plan delivered |
| notes | text | free-form |
| created_at | timestamptz NOT NULL DEFAULT now() | |
| updated_at | timestamptz NOT NULL DEFAULT now() | |

Indexes: `(primary_advisor_id)`, `(engagement_status)`, `(business_legal_name)` for search.

### `client_executives`

| Column | Type | Notes |
|---|---|---|
| executive_id | uuid PRIMARY KEY DEFAULT gen_random_uuid() | |
| client_id | uuid NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE | |
| full_legal_name | text NOT NULL | |
| short_name | text | |
| relationship_to_business | text NOT NULL CHECK (relationship_to_business IN ('primary_owner','spouse','co_owner','executive','family_member')) | |
| contact_email | text | |
| contact_phone | text | |
| date_of_birth | date | |
| citizenship | text | |
| state_of_residence | text | |
| notes | text | |
| created_at | timestamptz NOT NULL DEFAULT now() | |

Indexes: `(client_id)`, `(client_id, relationship_to_business)`.

### `plans`

The full schema lives in `specs/architecture/plan_entity.spec.md`. SQL form summary:

| Column | Type | Notes |
|---|---|---|
| plan_id | uuid PRIMARY KEY | |
| client_id | uuid NOT NULL REFERENCES clients(client_id) | |
| plan_version | integer NOT NULL | per-client monotonic |
| is_current | boolean NOT NULL DEFAULT false | |
| generated_at | timestamptz NOT NULL | |
| generated_by_advisor_id | uuid NOT NULL REFERENCES advisors(advisor_id) | |
| source_fact_review_path | text NOT NULL | Supabase Storage key |
| source_fr_content_hash | text NOT NULL | SHA-256 from Stage 0 |
| status | text NOT NULL CHECK (status IN ('draft','in_review','delivered','archived')) | |
| delivery_date | timestamptz | |
| archive_date | timestamptz | |
| client_profile | jsonb NOT NULL | Stage 1 output |
| selected_recommendations | jsonb NOT NULL | Stage 2 output |
| sequenced_plan | jsonb NOT NULL | Stage 3 output |
| aggregate_metrics | jsonb NOT NULL | Stage 4 glue |
| internal_plan_pdf_path | text | nullable until delivery |
| client_facing_plan_pdf_path | text | nullable until delivery |
| cash_flow_plan_id | uuid REFERENCES cash_flow_plans(cash_flow_plan_id) | |
| investment_plan_id | uuid REFERENCES investment_plans(investment_plan_id) | |
| insurance_plan_id | uuid REFERENCES insurance_plans(insurance_plan_id) | |
| predecessor_plan_id | uuid REFERENCES plans(plan_id) | self-referential |
| generation_log_path | text NOT NULL | `artifacts/{plan_id}/` |
| total_generation_cost_cents | integer NOT NULL DEFAULT 0 | |
| total_generation_duration_ms | bigint NOT NULL DEFAULT 0 | |
| compliance_id | text | null in v1 |
| supervisory_review_signal | jsonb NOT NULL | |
| archetype | text NOT NULL CHECK (archetype IN ('PRE','POST','ACT','FO','FOUND')) | |
| archetype_secondary | text CHECK (archetype_secondary IN ('PRE','POST','ACT','FO','FOUND')) | |
| created_at | timestamptz NOT NULL DEFAULT now() | |
| updated_at | timestamptz NOT NULL DEFAULT now() | |

Indexes:
- `UNIQUE (client_id, plan_version)`
- `UNIQUE (client_id) WHERE is_current = true` — enforces one current plan per client
- `(client_id, status)`, `(generated_by_advisor_id, status)`
- GIN on `client_profile`, `sequenced_plan`

### `cash_flow_plans`, `investment_plans`, `insurance_plans` (lens tables)

Each lens has its own table, keyed on its lens_id. All three tables share the same shape:

| Column | Type | Notes |
|---|---|---|
| {lens}_plan_id | uuid PRIMARY KEY | |
| source_plan_id | uuid NOT NULL REFERENCES plans(plan_id) | |
| plan_version | integer NOT NULL | lens-level version, independent of master Plan version |
| generated_at | timestamptz NOT NULL | |
| generated_by_advisor_id | uuid NOT NULL REFERENCES advisors(advisor_id) | |
| status | text NOT NULL CHECK (status IN ('draft','delivered')) | |
| body | jsonb NOT NULL | full lens output (CashFlowPlan / InvestmentPlan / InsurancePlan minus _metadata) |
| metadata | jsonb NOT NULL | LensMetadata |
| total_cost_cents | integer NOT NULL DEFAULT 0 | |
| created_at | timestamptz NOT NULL DEFAULT now() | |

Indexes: `(source_plan_id, status)`, `(generated_by_advisor_id, status)`.

The Plan-side FKs (`plans.cash_flow_plan_id` etc.) point at the most recent lens of each kind for that plan; older lens versions stay in their respective tables but aren't referenced from Plan.

### `action_items` (top-level, post-delivery)

| Column | Type | Notes |
|---|---|---|
| action_item_id | text PRIMARY KEY | from pipeline (Stage 3a-assigned id) |
| source_plan_id | uuid NOT NULL REFERENCES plans(plan_id) | |
| description | text NOT NULL | |
| category | text NOT NULL | RecommendationCategory enum value |
| duration_class | text NOT NULL CHECK (duration_class IN ('point_in_time','short_running','long_running')) | |
| check_in_cadence | text CHECK (check_in_cadence IS NULL OR check_in_cadence IN ('weekly','biweekly','monthly','quarterly','annually')) | non-null only when long_running |
| partner_required | boolean NOT NULL DEFAULT false | |
| partner_type | text CHECK (partner_type IS NULL OR partner_type IN ('CPA','Estate Attorney','Business Attorney','M&A Counsel','Commercial P&C','Health Insurance Broker','Banker','Valuation Provider','Specialty Tax Credits','Other')) | non-null only when partner_required |
| timing_bucket | text NOT NULL | from pipeline TimingBucket enum |
| assigned_advisor_id | uuid REFERENCES advisors(advisor_id) | nullable until assigned |
| status | text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','blocked','done')) | |
| assigned_week | date | Monday of the week; supports the weekly To-Do view |
| due_date | date | derived from `delivery_date + timing_bucket` initially; advisor-overridable |
| in_progress_started_at | timestamptz | set when status moves to in_progress |
| completed_at | timestamptz | set when status moves to done |
| completion_notes | text | |
| blocked_reason | text | when status = 'blocked' |
| parent_action_item_id | text REFERENCES action_items(action_item_id) | for derivative reminders |
| is_derivative_reminder | boolean NOT NULL DEFAULT false | |
| auto_generated_reminder_template | jsonb | non-null only when long_running; structure per `pipelineTypes.ts` AutoGeneratedReminderTemplate |
| sub_steps | jsonb NOT NULL DEFAULT '[]' | string[] from pipeline |
| depends_on | text[] NOT NULL DEFAULT '{}' | array of action_item_ids |
| source_recommendation_id | text NOT NULL | for grouping |
| source_phase_or_step | text NOT NULL | |
| owner | text NOT NULL | role-level owner from pipeline (e.g., 'PSA','CPA','Attorney') — distinct from `assigned_advisor_id` (named user) |
| reminder_count | integer NOT NULL DEFAULT 0 | how many derivative reminders have spawned from this item |
| last_reminder_spawned_at | timestamptz | |
| created_at | timestamptz NOT NULL DEFAULT now() | |
| updated_at | timestamptz NOT NULL DEFAULT now() | |

Indexes:
- `(source_plan_id)`
- `(assigned_advisor_id, assigned_week)` — drives the weekly To-Do view
- `(status)`
- `(parent_action_item_id) WHERE parent_action_item_id IS NOT NULL` — derivative reminder lookups
- `(source_recommendation_id)` — cross-version "all PTET items for client X over time"
- `(due_date) WHERE status IN ('not_started','in_progress')` — overdue surfacing

Lifecycle invariant (Postgres CHECK or trigger): when `status = 'done'`, `completed_at IS NOT NULL`. When `status = 'in_progress'`, `in_progress_started_at IS NOT NULL`. When `status = 'blocked'`, `blocked_reason IS NOT NULL`.

### `notes`

| Column | Type | Notes |
|---|---|---|
| note_id | uuid PRIMARY KEY DEFAULT gen_random_uuid() | |
| client_id | uuid NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE | |
| author_advisor_id | uuid NOT NULL REFERENCES advisors(advisor_id) | |
| text | text NOT NULL | |
| tag | text | single optional tag (free-text in v1; v1.5 may introduce a tag taxonomy) |
| created_at | timestamptz NOT NULL DEFAULT now() | |
| attached_plan_id | uuid REFERENCES plans(plan_id) ON DELETE SET NULL | optional plan attachment |
| promoted_to_action_item_id | text REFERENCES action_items(action_item_id) ON DELETE SET NULL | non-null after manual promotion |
| visible_to_team | boolean NOT NULL DEFAULT true | per-note privacy flag |

Indexes:
- `(client_id, created_at DESC)`
- `(author_advisor_id)`
- `(promoted_to_action_item_id) WHERE promoted_to_action_item_id IS NOT NULL`
- `(attached_plan_id) WHERE attached_plan_id IS NOT NULL`

Note: Notes survive Plan deletion (`ON DELETE SET NULL` on `attached_plan_id`); they survive ActionItem deletion (`ON DELETE SET NULL` on `promoted_to_action_item_id`); they cascade-delete with the client. Rationale: notes are advisor work product about the client and outlive plan / item lifecycle, but vanish if the client engagement ends.

### `partners`

| Column | Type | Notes |
|---|---|---|
| partner_id | uuid PRIMARY KEY DEFAULT gen_random_uuid() | |
| firm_or_individual_name | text NOT NULL | |
| partner_type | text NOT NULL CHECK (partner_type IN ('CPA','Estate Attorney','Business Attorney','M&A Counsel','Commercial P&C','Health Insurance Broker','Banker','Valuation Provider','Specialty Tax Credits','Other')) | |
| contact_name | text | |
| contact_email | text | |
| contact_phone | text | |
| notes | text | |
| created_at | timestamptz NOT NULL DEFAULT now() | |
| active | boolean NOT NULL DEFAULT true | |

Indexes: `(partner_type)`, `(active) WHERE active = true`.

### `partner_assignments`

Many-to-many relationship between partners and clients.

| Column | Type | Notes |
|---|---|---|
| partner_assignment_id | uuid PRIMARY KEY DEFAULT gen_random_uuid() | |
| partner_id | uuid NOT NULL REFERENCES partners(partner_id) ON DELETE CASCADE | |
| client_id | uuid NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE | |
| assignment_role | text | e.g., "tax preparation", "estate drafting" |
| since | date | |
| active | boolean NOT NULL DEFAULT true | |

Indexes:
- `UNIQUE (partner_id, client_id, assignment_role)` — same partner can have multiple roles for same client but not duplicated within a role
- `(client_id, active) WHERE active = true`
- `(partner_id, active) WHERE active = true`

### `activity_log`

Audit trail for compliance + visibility. Append-only at the application layer.

| Column | Type | Notes |
|---|---|---|
| log_id | uuid PRIMARY KEY DEFAULT gen_random_uuid() | |
| advisor_id | uuid REFERENCES advisors(advisor_id) | nullable for system-generated events |
| action_type | text NOT NULL | e.g., 'plan_generated', 'plan_delivered', 'action_item_completed', 'note_sent', 'note_promoted_to_action_item', 'client_created', 'partner_assigned', 'derivative_reminder_spawned' |
| subject_type | text NOT NULL CHECK (subject_type IN ('plan','action_item','note','client','partner','executive','lens','advisor')) | |
| subject_id | text NOT NULL | id of the affected entity (text to handle both uuid and pipeline-string ids) |
| subject_metadata | jsonb NOT NULL DEFAULT '{}' | e.g., `{ "old_status": "in_progress", "new_status": "done" }` |
| timestamp | timestamptz NOT NULL DEFAULT now() | |
| ip_address | inet | |
| user_agent | text | |

Indexes:
- `(advisor_id, timestamp DESC)`
- `(subject_type, subject_id, timestamp DESC)`
- `(timestamp DESC)` — global timeline
- `(action_type, timestamp DESC)` — "all plan_delivered events this month"

The activity log is **append-only at the application layer**. The DB doesn't enforce write-once; v1.5+ compliance work may introduce row-level immutability (e.g., a per-row digital signature, WORM storage flag). v1 relies on policy + RLS (advisors cannot UPDATE/DELETE log rows; only the system can INSERT).

### `derivative_reminder_schedule`

Drives the auto-spawn worker. One row per active long-running ActionItem.

| Column | Type | Notes |
|---|---|---|
| schedule_id | uuid PRIMARY KEY DEFAULT gen_random_uuid() | |
| parent_action_item_id | text NOT NULL REFERENCES action_items(action_item_id) ON DELETE CASCADE | |
| next_reminder_due_at | timestamptz NOT NULL | |
| cadence | text NOT NULL CHECK (cadence IN ('weekly','biweekly','monthly','quarterly','annually')) | |
| last_reminder_spawned_at | timestamptz | |
| last_spawned_action_item_id | text REFERENCES action_items(action_item_id) ON DELETE SET NULL | |
| active | boolean NOT NULL DEFAULT true | flips to false when parent reaches `status = 'done'` or 'cancelled' (v1 has no 'cancelled'; see Flagged Decisions) |

Indexes: `(next_reminder_due_at) WHERE active = true` — the worker's primary query.

A row is created when an ActionItem with `duration_class = 'long_running'` is extracted at Plan delivery. Initial `next_reminder_due_at` is `delivery_date + auto_generated_reminder_template.trigger_threshold_days`. A trigger on `action_items` flips `active = false` when the parent moves to terminal status.

---

## Auth Architecture

### Invitation-only access

- No public sign-up.
- Admin (Hayden) creates accounts via Supabase admin API or via a private `/admin/advisors` page.
- New advisor receives email with magic link or temporary password.
- First login forces password set + 2FA enrollment. v1 marks 2FA as **recommended**; v1.5 makes it **required** for all roles.

### Session management

- Supabase Auth handles JWT sessions.
- Session cookies: `HttpOnly`, `Secure`, `SameSite=Strict`.
- Session lifetime: 8 hours (re-authenticate at start of work day).
- Refresh tokens: 30 days.
- Sessions are bound to user agent + IP at issuance; significant change triggers re-auth (Supabase default behavior).

### Mobile app auth

- Same Supabase Auth backend.
- Magic-link login OR device-bound credential (TBD in Phase 6 mobile build; magic link is the simpler v1 default).
- Mobile app stores session in secure keychain (Expo SecureStore on iOS / EncryptedSharedPreferences on Android).
- Auto-logout after 30 days of inactivity.

### Roles

V1 has two roles:

- **`advisor`** — read/write access to assigned clients; can send notes, complete action items, generate plans.
- **`admin`** — same as advisor + can create advisors + manage system settings.

V2 may introduce read-only assistant / paraplanner roles.

### Row-Level Security (Postgres RLS)

All tables have RLS enabled. Policies (v1):

- **`advisors`**: each row readable by all authenticated advisors. Only admins can INSERT or UPDATE rows for OTHER advisors. Self-update (e.g., name change) allowed for own row.
- **`clients`**, **`client_executives`**: readable by all authenticated advisors (small team — full visibility is the operational policy). UPDATE allowed by `primary_advisor_id` or by any member of `advisory_team`. INSERT by admins only (creating new client engagements is a deliberate event).
- **`plans`**, **`cash_flow_plans`**, **`investment_plans`**, **`insurance_plans`**: readable by all advisors. UPDATE allowed by `generated_by_advisor_id` or admins. INSERT triggered by the API layer (which checks advisor permissions).
- **`action_items`**: readable by all advisors. UPDATE (status, assignment, completion) allowed by `assigned_advisor_id` or admins or any member of the source plan's `advisory_team`.
- **`notes`**: readable by all advisors when `visible_to_team = true`; readable only by `author_advisor_id` and admins when `visible_to_team = false`. INSERT by author. DELETE by author or admin.
- **`partners`**, **`partner_assignments`**: readable + UPDATE-able by all advisors. INSERT by all advisors.
- **`activity_log`**: readable by all advisors. INSERT by the system only (via service-role key, not user JWT). UPDATE / DELETE forbidden for everyone (including admins).
- **`derivative_reminder_schedule`**: readable by all advisors. INSERT / UPDATE / DELETE by the system worker only.

The "small team — full visibility" stance reflects PSA's operational reality. v2 multi-tenant introduces per-tenant scoping; v1 does not.

---

## API Surface

Next.js route handlers under `/api/`. All routes require authenticated session unless noted.

### Auth (Supabase passthrough)

- `POST /auth/signin`
- `POST /auth/signout`
- `POST /auth/refresh`

### Clients

- `GET /api/clients` — list, filtered by RLS
- `GET /api/clients/:client_id` — detail
- `POST /api/clients` — create (admin only)
- `PATCH /api/clients/:client_id` — update
- `GET /api/clients/:client_id/executives`
- `POST /api/clients/:client_id/executives`
- `PATCH /api/executives/:executive_id`
- `DELETE /api/executives/:executive_id` — admin only

### Plans

- `GET /api/clients/:client_id/plans` — list plans for a client
- `GET /api/plans/:plan_id` — detail
- `POST /api/plans` — body `{ client_id, fact_review_path }`; kicks off Stages 0–5 pipeline (background job; returns plan_id immediately, status `draft`)
- `GET /api/plans/:plan_id/status` — pipeline progress for the draft (stage_0_completed / stage_1_completed / etc.)
- `PATCH /api/plans/:plan_id/status` — transition status (draft → in_review → delivered); body `{ to: 'in_review' | 'delivered' }`
- `GET /api/plans/:plan_id/internal_pdf` — download internal PDF (signed URL)
- `GET /api/plans/:plan_id/client_pdf` — download client-facing PDF
- `GET /api/plans/:plan_id/generation_log` — admin-level access to `artifacts/{plan_id}/`

### Lenses

- `POST /api/plans/:plan_id/cash_flow_lens` — generate Cash Flow lens; body `{ supplemental_uploads?, focus? }`
- `POST /api/plans/:plan_id/investment_lens`
- `POST /api/plans/:plan_id/insurance_lens`
- `GET /api/cash_flow_plans/:cash_flow_plan_id`
- `GET /api/investment_plans/:investment_plan_id`
- `GET /api/insurance_plans/:insurance_plan_id`
- `PATCH /api/cash_flow_plans/:id/status` — `draft → delivered`
- (similar PATCH for investment / insurance)

### Action Items

- `GET /api/action_items?advisor_id=X&assigned_week=YYYY-MM-DD` — weekly view
- `GET /api/action_items?client_id=X` — per-client view
- `GET /api/action_items?status=in_progress&assigned_advisor_id=me` — "my active" view
- `GET /api/action_items/:action_item_id` — detail
- `PATCH /api/action_items/:action_item_id/status` — body `{ to, completion_notes?, blocked_reason? }`
- `PATCH /api/action_items/:action_item_id/assignment` — body `{ assigned_advisor_id? }`
- `PATCH /api/action_items/:action_item_id/week` — drag/drop to a different week; body `{ assigned_week }`
- `PATCH /api/action_items/:action_item_id/due_date` — manual override

### Notes

- `GET /api/notes?client_id=X` — chronological, client-scoped
- `GET /api/notes?author_advisor_id=X` — my notes
- `POST /api/notes` — body `{ client_id, text, tag?, visible_to_team?, attached_plan_id? }`
- `POST /api/notes/:note_id/promote_to_action_item` — body `{ description?, category?, timing_bucket?, partner_required?, partner_type?, ... }` (action item fields, advisor fills); creates a top-level ActionItem (without a plan source) and links the note
- `DELETE /api/notes/:note_id` — author or admin only

### Partners

- `GET /api/partners`
- `POST /api/partners`
- `PATCH /api/partners/:partner_id`
- `GET /api/partner_assignments?client_id=X`
- `POST /api/partner_assignments`
- `PATCH /api/partner_assignments/:partner_assignment_id` — toggle active, change role
- `GET /api/clients/:client_id/partners` — convenience for client-overview page

### Mobile-app subset

Lighter, simpler responses; same auth.

- `POST /api/mobile/notes` — same shape as `POST /api/notes`
- `GET /api/mobile/clients` — minimal client list `{ client_id, business_short_name, primary_advisor_id }`
- `GET /api/mobile/clients/:client_id/notes` — recent notes for client
- `GET /api/mobile/clients/:client_id/notes/recent?limit=20`

### Activity log

- `GET /api/activity_log?advisor_id=X&since=YYYY-MM-DD&until=YYYY-MM-DD&action_type=...` — admin-level query support
- `GET /api/activity_log/subject/:subject_type/:subject_id` — full audit for a specific entity

The activity log is read-only via the API; writes happen inside the app's mutation paths (each PATCH / POST / DELETE handler logs the event before responding).

### Admin

- `GET /api/admin/advisors` — admin only; full advisor list
- `POST /api/admin/advisors` — invite a new advisor
- `PATCH /api/admin/advisors/:advisor_id/role` — promote/demote
- `PATCH /api/admin/advisors/:advisor_id/active` — deactivate

### Health / metrics

- `GET /api/health` — public; returns basic readiness
- `GET /api/metrics` — admin only; per-month plan generation count, total cost, average duration

---

## Mobile App Architecture

V1 mobile app scope: **notes-only**.

Stack: **React Native (Expo)** for fast iteration. Backend uses the same Next.js API.

### V1 mobile features

- Login (invitation-only; same Supabase Auth as web)
- List clients (search/filter; minimal fields)
- View notes for a client (read-only history, paginated)
- Send a new note (text + optional tag + select client + optional plan attachment)
- Notes appear in web app immediately (no separate sync; same DB)
- Push notifications: deferred to v1.5

### Out of scope for v1 mobile

- Plan generation
- Action item management (no Tracker view on mobile)
- Lens generation
- PDF download
- Partner page
- Activity log

### Distribution

- **iOS** via TestFlight (internal team only at v1)
- **Android** via internal Google Play track
- **Auto-update** via Expo OTA for non-native changes; native rebuilds for major version bumps

### Offline behavior

V1 mobile is online-only. No offline-first sync. Notes typed without connectivity show a clear "not sent yet" state; sending requires connectivity. v1.5 may introduce optimistic local persistence + background sync.

---

## Deployment Architecture

### Web app

- Hosted on **Vercel**.
- Custom domain: `axiom.psawealth.com` (DNS to be set up in Phase 6 ops; Vercel manages TLS).
- HTTPS enforced everywhere.
- Serverless functions for API routes (Next.js native runtime on Vercel).
- Environment variables managed via Vercel dashboard:
  - `ANTHROPIC_API_KEY` — production key for plan + lens generation
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY` — used by client-side via Supabase JS SDK
  - `SUPABASE_SERVICE_KEY` — server-side only; used for admin operations (advisor creation, activity log writes)
  - `RUN_LIVE_API_TESTS` — empty in CI; set in dev for live LLM tests
  - `NODE_ENV` — `development` / `staging` / `production`

### Database

- **Supabase managed Postgres**.
- Daily automated backups (Supabase default).
- Connection pooling enabled (Supabase pgBouncer).
- Row-Level Security policies enforced (see Auth Architecture).
- Migrations in version control under `db/migrations/` (Phase 6 work).

### Storage

- **Supabase Storage** for PDF artifacts, FR uploads, generation logs.
- Buckets per environment: `axiom-dev`, `axiom-staging`, `axiom-prod`.
- Bucket structure:
  - `factreviews/` — uploaded `.docx` files (per Plan record's `source_fact_review_path`)
  - `plans/{plan_id}/internal_plan.pdf`, `plans/{plan_id}/client_facing_plan.pdf`
  - `plans/{plan_id}/generation_log/...`
  - `lenses/{lens_plan_id}/...` (when lens PDFs land in v1.5)
- Access via signed URLs (time-limited) for advisor downloads.
- Direct uploads from web app use signed-upload URLs.

### Mobile app

- iOS via TestFlight, Android via internal Google Play (v1).
- Auto-update via Expo OTA for JS-only changes.
- Native rebuild required for SDK upgrades or new native modules.

### Anthropic API

- Production endpoint (`api.anthropic.com`).
- API key stored as Vercel env var.
- Per-stage cost tracking already in pipeline metadata (input_token_count × pricing + cache costs).
- Budget alarms (v1.5): per-day cost ceiling, alert if exceeded.

### Environments

- **dev** — Hayden's local + a Vercel preview branch; uses `axiom-dev` storage bucket and a separate Supabase project.
- **staging** — pre-production environment for advisor walkthrough; gates promotion to prod.
- **prod** — live deployment for the 3 advisors.

---

## Background Workers

V1 has one mandatory worker, plus one v1.5 placeholder.

### Derivative Reminder Spawner (v1)

**Schedule:** Hourly via Vercel cron (`/api/cron/derivative_reminder_spawn` configured as a Vercel Cron Job; the Vercel platform invokes the route on the cron schedule).

**Algorithm:**

1. Query `derivative_reminder_schedule WHERE active = true AND next_reminder_due_at <= now()`.
2. For each due row:
   a. Spawn a derivative ActionItem:
      - `is_derivative_reminder: true`
      - `parent_action_item_id: <parent>`
      - `description`: substitute the parent's `auto_generated_reminder_template.reminder_text_template` with `{{partner_type}}`, `{{description_short}}`, `{{rec_id}}`, `{{conversion_year}}` (if applicable).
      - `category`: copy from parent
      - `duration_class`: `'point_in_time'` (derivative reminders are themselves point-in-time)
      - `check_in_cadence: null`
      - `auto_generated_reminder_template: null`
      - `partner_required: parent.partner_required`, `partner_type: parent.partner_type`
      - `assigned_advisor_id: parent.assigned_advisor_id` (inherits owner)
      - `assigned_week`: Monday of the current week
      - `due_date`: `next_reminder_due_at` rounded to end-of-day
      - `status: 'not_started'`
      - `source_plan_id: parent.source_plan_id`
      - `source_recommendation_id: parent.source_recommendation_id`
      - `source_phase_or_step: 'derivative_reminder'`
      - `owner: parent.owner`
   b. Update the schedule row:
      - `last_reminder_spawned_at = now()`
      - `last_spawned_action_item_id = <new id>`
      - `next_reminder_due_at = now() + cadence_to_days(cadence)`
   c. Log to `activity_log` with `action_type = 'derivative_reminder_spawned'`, `subject_type = 'action_item'`, `subject_id = <new id>`, `subject_metadata = { parent_action_item_id }`.
   d. Increment parent's `reminder_count`; update parent's `last_reminder_spawned_at`.

**Idempotency:** the worker queries by `next_reminder_due_at <= now()` and updates `next_reminder_due_at` immediately after spawning. A double-invocation within the same hour will not double-spawn because the second pass sees the advanced `next_reminder_due_at`.

**Failure handling:** if spawning fails for any individual row, log the error to `activity_log` with `action_type = 'derivative_reminder_spawn_failed'` and skip; other rows still process. Repeated failures on the same row surface as an admin alert (v1.5).

### Notification Worker (v1.5 placeholder)

Email digests + push notifications for mobile. Deferred to v1.5 — v1 advisors check the app actively; nudges are a quality-of-life improvement, not a v1 requirement.

---

## Compliance Architecture (V1 Forward-Compatible Stub)

V1 does not enforce compliance constraints, but the architecture accommodates the post-v1 compliance investment without rework.

### V1 stance

- `activity_log` captures who did what when (the audit substrate).
- Plan retention is indefinite (no purge in v1).
- PDF artifacts persist in Supabase Storage indefinitely.
- WORM-equivalent storage flag on plans / action_items: deferred.
- `compliance_id` on `plans`: present in schema but always `null` in v1.
- `supervisory_review_signal` on `plans`: populated by the pipeline; surfaced as a UI banner but does NOT block delivery in v1.

### Post-v1 compliance additions (forward-planned, not built)

- Retention enforcement: `retention_expiry_date` on plans (default 6 years post-delivery, RIA recordkeeping rule).
- WORM storage: a `worm_storage_flag` on plans + an object-store-level immutability lock on the corresponding generation_log_path.
- Compliance review workflow: `compliance_review_status` column + a queue UI; new role `compliance_reviewer`.
- Audit log export: scheduled export of `activity_log` to a tamper-evident archive.
- 2FA required for all roles (currently recommended).

These additions are additive migrations; v1 schema does not need to be touched to add them.

---

## Operational Concerns

### Cost tracking

- Per-plan generation cost stored on `plans.total_generation_cost_cents` (sum of all stage cost contributions).
- Per-lens generation cost stored on each lens table's `total_cost_cents`.
- `GET /api/metrics` (admin) returns monthly summary: count of plans generated, total cost, average duration, breakdown by stage.
- Anthropic API budget alarms: v1.5 work; v1 relies on manual review of metrics dashboard.

### Error handling

- **Plan generation failure (any stage):** Plan stays in `status = 'draft'`. Failure log accessible at `artifacts/{plan_id}/generation_log/`. Email notification to assigned advisor; in-app banner on the plan detail view.
- **Stage 5 QC blocking failure:** plan does NOT transition to `delivered` until the issue is fixed. Mechanical pre-checks blocked-issues display on the plan detail; advisor either edits the underlying input + re-runs the affected stage(s) OR overrides with rationale (admin only).
- **Lens generation failure:** lens record not persisted; failed-result returned to the UI with the failure reason. Advisor can retry.
- **Missed derivative reminder cadence:** logged to `activity_log` with `action_type = 'derivative_reminder_spawn_failed'`; admin alert surfaces in the metrics view (v1.5 may add inline notification).
- **API errors at the Anthropic edge:** the harness already returns `*Failed` shapes with `failure_type: 'api_error'`. The web layer surfaces "Anthropic API unavailable; please retry" with a Retry button.
- **Database connection failures:** Supabase pooler handles retries; persistent failures surface a "Service temporarily unavailable" page.

### Backups

- **Database:** daily automated backups via Supabase. Point-in-time recovery available within the retention window (Supabase plan-dependent).
- **Storage:** Supabase replication.
- **Code:** Git in this repo + GitHub remote (Phase 6 will set up the remote if not yet present).
- **Generation logs:** stored in Supabase Storage with the rest of plan artifacts; backed up via storage replication.

### Monitoring

- Vercel built-in: function execution metrics, error rates, deploy logs.
- Supabase built-in: query performance, connection counts, storage usage.
- Custom: in-app metrics dashboard (cost / count / duration), surfaced via `/api/metrics`.
- Anthropic dashboard for token / cost / model-mix monitoring.

### Logging

- Server-side logs: Vercel function logs (retained per Vercel plan).
- Application audit: `activity_log` table.
- Pipeline trace: per-plan generation_log_path artifacts.
- LLM call traces: Anthropic dashboard + per-stage attempt_history in the pipeline metadata.

---

## V1.5+ Backlog

- **Multi-tenant SaaS architecture (v2)** — adds `tenant_id` to every table, scopes RLS by tenant, introduces tenant onboarding flows.
- **Email integrations** — Gmail / Outlook bi-directional for client correspondence threading.
- **Calendar integrations** — Google / Outlook calendar for advisor schedules and meeting auto-attach.
- **Zocks integration** — meeting-notes import.
- **OneDrive sync** — currently parallel; would automate. Removes the v1 invariant that Axiom is supplemental.
- **Compliance investment** — WORM storage, retention enforcement, audit log export, compliance reviewer role.
- **MassMutual product KB for Insurance Lens** — populate `carrier_specific_recommendation` field.
- **Lens-derived ActionItems** — Lens recommendations flow into the Tracker with the same lifecycle infrastructure as master-Plan ActionItems.
- **Real-time collaboration on plan drafts** — multi-advisor concurrent editing.
- **Plan version compare** — diff between this year's plan and last year's, with delta highlighting.
- **Push notifications + email digests** — Notification Worker.
- **Per-day cost ceiling alarms** for Anthropic API spend.
- **Streaming pipeline progress** to the UI during plan generation (currently fire-and-poll).
- **Mobile app: ActionItem view + offline sync** — broaden mobile scope beyond notes.
- **2FA required** for all roles.
- **Soft-retract delivery window** for accidentally-delivered plans (per Plan Entity spec).

---

## What This Does NOT Do

- Does NOT implement any of v1 (Phase 6 build).
- Does NOT include detailed UI mockups or page designs (Phase 7 design).
- Does NOT enforce v1.5+ compliance constraints (deferred).
- Does NOT address v2 multi-tenant requirements.
- Does NOT define migration scripts (Phase 6 schema work).
- Does NOT define detailed RLS policy SQL (Phase 6 RLS work).
- Does NOT define mobile app screen-by-screen behavior (Phase 6 mobile build).
- Does NOT define PDF rendering details (separate spec).
- Does NOT define KB authoring workflow (separate KB spec, when needed).
- Does NOT define the specific lens-coordination logic (v1.5 backlog).

---

## Cross-Spec References

This spec presumes and references the following companion specs:

- `specs/architecture/plan_entity.spec.md` — full Plan entity schema, lifecycle, ActionItem extraction, year-over-year refresh.
- `specs/architecture/lens_contracts.spec.md` — Cash Flow / Investment / Insurance lens contracts.
- `specs/stages/stage1_fact_review_parser.spec.md` — Stage 1.
- `specs/stages/stage2a_hard_filter.spec.md` / `stage2b_calibration.spec.md` / `stage2c_sequencing.spec.md` — Stage 2 decomposition.
- `specs/stages/stage3a_sequencer_quantifier.spec.md` — Stage 3a.
- `specs/glue/*.spec.md` — Stage 0 validator, Stage 3b assembler, Stage 4 builders, Stage 5 mechanical pre-checks, cascade walking, top priorities builder.

When information conflicts between this spec and a lower-level spec, the lower-level spec wins for its domain (Plan Entity spec is authoritative on Plan lifecycle; this spec is authoritative on app-level integration). Conflicts that surface during build are flagged for spec reconciliation.

---

## Flagged Decisions (Made Autonomously During Spec Authoring)

The following decisions were made while authoring this spec to keep it self-consistent. Each is reversible.

1. **Action item `status` enum is `'not_started' | 'in_progress' | 'blocked' | 'done'`.** This matches the explicit enum in the Spec 5 prompt. **Note inconsistency with Plan Entity spec (Spec 2)**: Spec 2 used a richer enum `'not_started' | 'in_progress' | 'blocked' | 'completed' | 'deferred' | 'cancelled'`. I went with the Spec 5 enum (more recent prompt, presumably Hayden's current thinking). Spec 2 should be updated to match — flagging for cleanup at Phase 1 review. The Tracker may want `deferred` and `cancelled` operationally; if so, expand the enum at that point.

2. **Action item lifecycle CHECK constraints** (status='done' ⇒ completed_at IS NOT NULL; etc.) live at the DB layer. Rationale: prevents drift between status and timestamps; the application layer already maintains them, but DB-level enforcement is a cheap safety net.

3. **`assigned_week` as a `date` column (Monday of the week).** The Spec 5 prompt declares this; I kept it as Monday-of-the-week (advisor weekly views typically anchor on Monday). Reversible to "Sunday of the week" if PSA's convention differs; harmless either way as long as it's consistent.

4. **Notes survive Plan / ActionItem deletion via `ON DELETE SET NULL`** on `attached_plan_id` and `promoted_to_action_item_id`, but cascade-delete with the client (`ON DELETE CASCADE` on `client_id`). Rationale: notes are advisor work product *about* the client and should outlive plan / item lifecycle; they vanish only when the client engagement terminates and the client record is removed. Reversible to fully soft-delete-only if "actually purging clients" is undesirable.

5. **`activity_log.subject_id` is `text`, not `uuid`**, because Stage 3a-assigned action_item_ids are pipeline strings, not UUIDs, and the activity log spans both. The trade-off is losing FK enforcement on subject_id; mitigated by `subject_type` discriminating the type and the application layer doing the integrity check at write time. v1.5 may introduce per-type FK columns (`subject_uuid uuid`, `subject_text_id text`, mutually exclusive) if the looseness causes problems.

6. **Activity log is append-only at the application layer, NOT enforced by DB-level immutability.** Rationale: v1 doesn't have compliance-grade write-once storage. RLS forbids UPDATE / DELETE for advisor and admin roles; only the system service-role key can INSERT. v1.5+ compliance work introduces row-level immutability via a per-row digital signature or WORM storage flag.

7. **`partners` table has a `partner_type` CHECK constraint matching the pipeline's `PartnerType` enum** (CPA / Estate Attorney / Business Attorney / M&A Counsel / Commercial P&C / Health Insurance Broker / Banker / Valuation Provider / Specialty Tax Credits / Other). Keeps app-level partner records typed identically to ActionItem `partner_type`. The two columns can join cleanly when surfacing "all CPAs working with client X."

8. **Lens tables (`cash_flow_plans`, `investment_plans`, `insurance_plans`) share an identical column shape**, with the lens-specific output stored in `body jsonb`. Rationale: matches the Plan-table strategy of `jsonb` for pipeline artifacts. Avoids per-lens normalized columns at the cost of cross-lens analytics queries (acceptable in v1).

9. **`derivative_reminder_schedule` is a *separate* table** rather than a column on `action_items`. Rationale: the worker's primary query (`WHERE active = true AND next_reminder_due_at <= now()`) wants a focused index; mixing scheduling state into the wide `action_items` table would force the worker through a heavier table scan. Keeping it separate also clarifies that scheduling state is system-owned, not advisor-mutable.

10. **No `cancelled` status in v1 ActionItem enum** (per the prompt's enum). The `derivative_reminder_schedule.active` flips to `false` when the parent ActionItem reaches `status = 'done'`. v1.5 may introduce a `cancelled` status; if so, the schedule trigger needs to flip on cancelled too.

11. **Mobile app is online-only at v1.** Notes typed offline cannot be sent. v1.5 may introduce optimistic local persistence + background sync. Reversible if v1 advisors hit this limitation in production use.

12. **Vercel cron for the Derivative Reminder Spawner** rather than a long-running worker. Rationale: matches the rest of the stack (serverless, no persistent workers in v1). Hourly granularity is sufficient for derivative reminders; sub-hourly cadence is not a v1 requirement.

13. **`SUPABASE_SERVICE_KEY` used server-side only.** Strict separation between the service-role key (admin operations, system writes to activity_log) and the anon key (client-side via Supabase JS SDK). Service key never reaches the browser.

14. **Custom domain `axiom.psawealth.com` is the suggested v1 endpoint** but DNS configuration is Phase 6 ops. The spec records the intent; setup is downstream.

15. **One Vercel cron route at `/api/cron/derivative_reminder_spawn`** rather than a generic cron dispatcher. v1 has one cron job; if more land in v1.5+ (notification worker, retention sweeper), introduce a dispatcher pattern then.

16. **No `client_id` on `action_items` directly** — clients are reachable via `action_items → source_plan_id → plans → client_id`. This is a denormalization choice: the join is one hop; querying "all action items for client X" is `JOIN plans USING (plan_id) WHERE plans.client_id = X` and is efficient. Adding `client_id` directly to `action_items` would denormalize for slight read-time savings at the cost of write-time integrity. v1 stays normalized; if a hot read path emerges, denormalize then.
