-- Phase 4 Step 2 — Axiom v1 initial schema.
--
-- v1 scope: 3 internal PSA Wealth advisor accounts only. No client portal,
-- no partner portal. Action items are the spine. RLS is enabled but uniform
-- (any active advisor can read/write any row); per-advisor isolation is a
-- v2 concern.
--
-- Table order matters because of FK dependencies:
--   advisors → clients → lens_runs → plans → action_items → notes / partners
--   audit_log references entity_id polymorphically (no FK, just text + uuid)

-- ────────────────────────────────────────────────────────────────────────
-- Helpers
-- ────────────────────────────────────────────────────────────────────────

-- Reusable trigger function: bump updated_at on every UPDATE.
create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ────────────────────────────────────────────────────────────────────────
-- advisors — the 3 PSA Wealth advisors (mirrors auth.users by id).
-- ────────────────────────────────────────────────────────────────────────

create table public.advisors (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  first_name text not null,
  last_name text not null,
  role text not null default 'advisor',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger advisors_updated_at
  before update on public.advisors
  for each row execute function public.update_updated_at();

-- ────────────────────────────────────────────────────────────────────────
-- clients — PSA's clients (e.g., Holloway).
-- ────────────────────────────────────────────────────────────────────────

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  lead_advisor_id uuid not null references public.advisors(id) on delete restrict,
  household_name text not null,
  status text not null default 'active',
  archetype text,                              -- PRE / MID / POST / NONE; populated post-Stage 1
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clients_status_check check (status in ('active', 'inactive', 'prospect')),
  constraint clients_archetype_check check (archetype is null or archetype in ('PRE', 'MID', 'POST', 'NONE'))
);

create trigger clients_updated_at
  before update on public.clients
  for each row execute function public.update_updated_at();

create index clients_lead_advisor_status_idx
  on public.clients (lead_advisor_id, status);

-- ────────────────────────────────────────────────────────────────────────
-- lens_runs — re-runnable lens invocations (Investment / Insurance / Cash Flow).
-- Defined before action_items because action_items.source_lens_run_id FKs here.
-- ────────────────────────────────────────────────────────────────────────

create table public.lens_runs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  generated_by_advisor_id uuid not null references public.advisors(id) on delete restrict,
  lens_type text not null,
  context_input text,
  status text not null default 'draft',
  generated_at timestamptz not null default now(),
  output jsonb,
  cost_cents integer,
  constraint lens_runs_lens_type_check check (lens_type in ('investment', 'insurance', 'cash_flow')),
  constraint lens_runs_status_check check (status in ('draft', 'approved', 'archived'))
);

create index lens_runs_client_lens_generated_idx
  on public.lens_runs (client_id, lens_type, generated_at desc);

-- ────────────────────────────────────────────────────────────────────────
-- plans — one row per generated plan; keeps history year-over-year.
-- ────────────────────────────────────────────────────────────────────────

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  generated_by_advisor_id uuid not null references public.advisors(id) on delete restrict,
  status text not null default 'draft',
  generated_at timestamptz not null default now(),
  approved_at timestamptz,
  archived_at timestamptz,
  fact_review_filename text,
  stage1_output jsonb,                         -- ClientProfile
  stage3a_output jsonb,                        -- QuantifiedRecommendations
  stage4_output jsonb,                         -- Stage4Result (assembled plan)
  stage5_output jsonb,                         -- Stage5Result (audit)
  cost_cents integer,
  compliance_tracking_id text,
  constraint plans_status_check check (status in ('draft', 'approved', 'archived'))
);

create index plans_client_status_generated_idx
  on public.plans (client_id, status, generated_at desc);

-- ────────────────────────────────────────────────────────────────────────
-- action_items — THE SPINE. All action items from plans, lens runs, manual
-- entry. Self-referential parent_action_item_id supports derivative reminders.
-- ────────────────────────────────────────────────────────────────────────

create table public.action_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  source_plan_id uuid references public.plans(id) on delete set null,
  source_lens_run_id uuid references public.lens_runs(id) on delete set null,
  parent_action_item_id uuid references public.action_items(id) on delete cascade,
  description text not null,
  category text not null,                      -- mirrors Stage 3a RecommendationCategory enum
  duration_class text not null,
  timing_bucket text not null,                 -- mirrors TimingBucket enum
  owner text not null,                         -- advisor email or "client"
  partner_required boolean not null default false,
  partner_type text,
  status text not null default 'not_started',
  completed_at timestamptz,
  completed_by_advisor_id uuid references public.advisors(id) on delete set null,
  is_derivative_reminder boolean not null default false,
  auto_generated_reminder_template text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint action_items_duration_class_check check (duration_class in ('one_time', 'long_running')),
  constraint action_items_status_check check (status in ('not_started', 'in_progress', 'pending_decision', 'complete'))
);

create trigger action_items_updated_at
  before update on public.action_items
  for each row execute function public.update_updated_at();

create index action_items_client_status_owner_idx
  on public.action_items (client_id, status, owner);

create index action_items_owner_status_timing_idx
  on public.action_items (owner, status, timing_bucket);

-- ────────────────────────────────────────────────────────────────────────
-- notes — Notes Hub. Free-form, client-attached. Optionally promotable to
-- action_items.
-- ────────────────────────────────────────────────────────────────────────

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  author_advisor_id uuid not null references public.advisors(id) on delete restrict,
  body text not null,
  tag text,
  promoted_to_action_item_id uuid references public.action_items(id) on delete set null,
  created_at timestamptz not null default now()
);

create index notes_client_created_idx
  on public.notes (client_id, created_at desc);

-- ────────────────────────────────────────────────────────────────────────
-- partners — CPA / attorney / broker contact roster, scoped per client.
-- ────────────────────────────────────────────────────────────────────────

create table public.partners (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  partner_type text not null,
  first_name text,
  last_name text,
  firm_name text,
  email text,
  phone text,
  notes text,
  created_at timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────────────
-- audit_log — activity logging across all entities. entity_id is a uuid but
-- references different tables based on entity_type, so no FK constraint.
-- ────────────────────────────────────────────────────────────────────────

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_advisor_id uuid references public.advisors(id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  details jsonb,
  occurred_at timestamptz not null default now(),
  constraint audit_log_entity_type_check check (entity_type in ('client', 'plan', 'action_item', 'note', 'lens_run', 'partner')),
  constraint audit_log_action_check check (action in ('created', 'updated', 'deleted', 'approved', 'completed'))
);

create index audit_log_entity_occurred_idx
  on public.audit_log (entity_type, entity_id, occurred_at desc);

-- ────────────────────────────────────────────────────────────────────────
-- Row Level Security
--
-- v1 policy: any signed-in advisor whose row in `advisors` has active = true
-- can read/write any row in any table. Per-advisor isolation is deferred
-- to v2 once we onboard a second firm or a non-advisor role.
--
-- The is_active_advisor() SECURITY DEFINER helper is used so that the
-- USING / WITH CHECK clauses can read public.advisors without each policy
-- needing to bypass its own RLS.
-- ────────────────────────────────────────────────────────────────────────

create or replace function public.is_active_advisor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.advisors
     where id = auth.uid()
       and active = true
  );
$$;

-- Grant execute on the helper to the standard PostgREST roles.
grant execute on function public.is_active_advisor() to anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'advisors', 'clients', 'lens_runs', 'plans',
    'action_items', 'notes', 'partners', 'audit_log'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_active_advisor()) with check (public.is_active_advisor());',
      t || '_rw_active_advisor', t
    );
  end loop;
end;
$$;
