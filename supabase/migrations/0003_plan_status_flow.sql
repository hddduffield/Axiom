-- Phase 5b — plan generation flow with deferred CLI processing.
--
-- Replaces the simple draft/approved/archived state machine with the full
-- queue → processing → ready_for_review → approved/archived/failed flow
-- the CLI script needs. Adds the input-storage path columns and processing
-- timestamps. Provisions the `plan-inputs` Supabase Storage bucket plus
-- RLS policies that allow active advisors to upload while keeping the
-- bucket private.
--
-- Apply via Supabase Dashboard SQL editor (or `supabase db push` once the
-- CLI is installed).

-- ────────────────────────────────────────────────────────────────────────
-- 1. Plans table — new columns + replacement status check
-- ────────────────────────────────────────────────────────────────────────

alter table public.plans
  add column if not exists input_clientprofile_path text,
  add column if not exists input_selected_recs_path text,
  add column if not exists processing_started_at timestamptz,
  add column if not exists processing_completed_at timestamptz,
  add column if not exists failure_reason text;

-- Replace the constraint to admit the new states. The old constraint name
-- is `plans_status_check` (set in 0001). Drop and re-add.
alter table public.plans drop constraint if exists plans_status_check;
alter table public.plans
  add constraint plans_status_check
  check (status in ('queued', 'processing', 'ready_for_review', 'approved', 'archived', 'failed'));

-- Default for new rows: 'queued'. (The previous default 'draft' is now
-- invalid under the new check; any existing 'draft' rows would also
-- violate the check — see migration note below.)
alter table public.plans alter column status set default 'queued';

-- Migration note: any existing rows with status='draft' must be updated
-- before the constraint is enforced, or the ALTER will fail. As of
-- Phase 5b deploy time the dev seed has not inserted any plans rows, so
-- the table should be empty. If a manually-inserted draft row exists,
-- run the following before re-applying:
--   update public.plans set status='ready_for_review' where status='draft';
update public.plans set status = 'ready_for_review' where status = 'draft';

-- Index supporting the CLI claim query: SELECT ... WHERE status='queued'
-- ORDER BY generated_at ASC LIMIT 1.
create index if not exists plans_status_generated_idx
  on public.plans (status, generated_at);

-- ────────────────────────────────────────────────────────────────────────
-- 2. Storage bucket — `plan-inputs` (private; advisors upload, CLI reads)
-- ────────────────────────────────────────────────────────────────────────

-- Idempotent bucket creation. `public = false` means objects are not
-- world-readable; access is gated by storage RLS policies below.
insert into storage.buckets (id, name, public)
values ('plan-inputs', 'plan-inputs', false)
on conflict (id) do nothing;

-- Storage RLS — Supabase enables RLS on `storage.objects` by default;
-- we add per-bucket policies. The `is_active_advisor()` helper from
-- migration 0001 is reused here for consistency.
--
-- Policy names are scoped to the bucket so dropping/recreating them
-- doesn't collide with other buckets we might add later (lens-runs,
-- plan-outputs, etc.).

drop policy if exists "plan-inputs: active advisors read" on storage.objects;
create policy "plan-inputs: active advisors read"
  on storage.objects
  for select to authenticated
  using (bucket_id = 'plan-inputs' and public.is_active_advisor());

drop policy if exists "plan-inputs: active advisors insert" on storage.objects;
create policy "plan-inputs: active advisors insert"
  on storage.objects
  for insert to authenticated
  with check (bucket_id = 'plan-inputs' and public.is_active_advisor());

drop policy if exists "plan-inputs: active advisors update" on storage.objects;
create policy "plan-inputs: active advisors update"
  on storage.objects
  for update to authenticated
  using (bucket_id = 'plan-inputs' and public.is_active_advisor())
  with check (bucket_id = 'plan-inputs' and public.is_active_advisor());

drop policy if exists "plan-inputs: active advisors delete" on storage.objects;
create policy "plan-inputs: active advisors delete"
  on storage.objects
  for delete to authenticated
  using (bucket_id = 'plan-inputs' and public.is_active_advisor());

-- Note: the CLI script (`scripts/generatePending.ts`) connects with the
-- service-role key and bypasses RLS entirely. The policies above govern
-- only browser/API-session access (uploads from POST /api/plans/generate).
