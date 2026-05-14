-- Phase 17.1 — Cadence engine foundation + action item source provenance.
--
-- Purpose: every client gets an expected contact cadence so a "Going Stale"
-- dashboard module can surface overdue households by name. Every action
-- item gains optional provenance pointers so plan approvals and lens
-- finalizations can spawn action items without losing their origin.
--
-- This migration is idempotent (IF NOT EXISTS everywhere). No backfill —
-- existing rows leave the new columns NULL until updated by runtime code.
--
-- Apply manually via Supabase Dashboard SQL editor.

-- ────────────────────────────────────────────────────────────────────────
-- 1. clients — cadence + last meaningful contact
-- ────────────────────────────────────────────────────────────────────────

alter table public.clients
  add column if not exists cadence_target_days integer,
  add column if not exists cadence_custom_label text,
  add column if not exists last_meaningful_contact_at timestamptz;

comment on column public.clients.cadence_target_days is
  'Expected days between meaningful client contacts. Default by archetype '
  '(PRE=30, MID=21, POST=60, NONE=90 — see src/lib/cadence/defaults.ts). '
  'Custom values allowed; cadence_custom_label may explain.';

comment on column public.clients.cadence_custom_label is
  'Optional human label for a non-preset cadence (e.g. "monthly during '
  'transition"). Display-only.';

comment on column public.clients.last_meaningful_contact_at is
  'Stamped by recordMeaningfulTouch() in src/lib/cadence/touchHelpers.ts '
  'on note save, plan generated/approved, lens finalized, action item '
  'completed, or meeting logged. Used by the Going Stale dashboard query.';

-- ────────────────────────────────────────────────────────────────────────
-- 2. action_items — source recommendation tracking
--    (source_plan_id + source_lens_run_id already exist from 0001)
-- ────────────────────────────────────────────────────────────────────────

alter table public.action_items
  add column if not exists source_recommendation_id text;

comment on column public.action_items.source_recommendation_id is
  'REC-XX identifier from the originating Stage 3a recommendation when '
  'spawned via plan approval. Forms the idempotency key '
  '(source_plan_id, source_recommendation_id) for re-approval safety.';

-- ────────────────────────────────────────────────────────────────────────
-- 3. Indexes
-- ────────────────────────────────────────────────────────────────────────

create index if not exists idx_clients_cadence_lookup
  on public.clients (status, cadence_target_days, last_meaningful_contact_at);

create index if not exists idx_action_items_source_plan
  on public.action_items (source_plan_id)
  where source_plan_id is not null;

create index if not exists idx_action_items_source_lens
  on public.action_items (source_lens_run_id)
  where source_lens_run_id is not null;

-- Idempotency guard for re-approving the same plan: one action item per
-- (plan, recommendation) pair. Plan-spawn code does an upsert/onConflict.
create unique index if not exists idx_action_items_plan_rec_unique
  on public.action_items (source_plan_id, source_recommendation_id)
  where source_plan_id is not null and source_recommendation_id is not null;

-- ────────────────────────────────────────────────────────────────────────
-- 4. lens_runs status taxonomy expansion (Phase 17.4)
--    From: draft | approved | archived
--    To:   draft | reviewed | presented | current | superseded |
--          approved | archived
--    'approved' is retained so existing rows + the legacy finalize
--    endpoints keep working without a data migration. UI surfaces the
--    full workflow; finalize endpoints still emit 'approved' today.
-- ────────────────────────────────────────────────────────────────────────

alter table public.lens_runs drop constraint if exists lens_runs_status_check;
alter table public.lens_runs add constraint lens_runs_status_check
  check (status in ('draft', 'reviewed', 'presented', 'current', 'superseded', 'approved', 'archived'));

comment on column public.lens_runs.status is
  'Workflow state — draft (in progress), reviewed (self sign-off), '
  'presented (shown to client, locked), current (live scenario for the '
  'client+lens_type pair), superseded (auto-demoted by promote-to-current), '
  'approved (legacy finalize value, still valid), archived (soft-deleted).';
