-- Phase 13.1 — Cash Flow Lens v1.
--
-- v1 stores all cash-flow lens data in the existing `lens_runs` table:
--   - lens_type = 'cash_flow'
--   - status: 'draft' (editable) → 'approved' (finalized) → 'archived'
--   - output JSONB carries every input/output/AI-suggestion field
--
-- Rather than over-normalizing into a dedicated cash_flow_lenses table for
-- v1, this migration just adds the two columns the lens UI needs to track
-- edits cleanly:
--   - updated_at  bumps on each PATCH so the list/detail view sorts by
--                 most-recently-touched, not just generated_at
--   - archived_at records soft-delete time (status='archived' + stamp)
--
-- The output JSONB shape is documented in
-- src/lib/api/cash_flow_lens.ts (CashFlowLensOutput type). It contains:
--   client_snapshot, gross_income_annual, expenses_annual, goals_narrative,
--   emergency_fund, time_horizons[], assumptions, buckets[], allocation_pct,
--   distribution_plan, ai_suggestions, pushed_action_item_ids
--
-- Apply via Supabase Dashboard SQL editor (or `supabase db push` once the
-- CLI is installed). Idempotent.

-- ────────────────────────────────────────────────────────────────────────
-- 1. lens_runs — add updated_at + archived_at
-- ────────────────────────────────────────────────────────────────────────

alter table public.lens_runs
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists archived_at timestamptz;

drop trigger if exists lens_runs_updated_at on public.lens_runs;
create trigger lens_runs_updated_at
  before update on public.lens_runs
  for each row execute function public.update_updated_at();

-- Comment on the canonical output shape so future maintainers can find
-- it without grepping. The full TypeScript type lives at
-- src/lib/api/cash_flow_lens.ts.
comment on column public.lens_runs.output is
  'JSONB output. For lens_type=cash_flow this matches CashFlowLensOutput '
  'in src/lib/api/cash_flow_lens.ts: { client_snapshot, gross_income_annual, '
  'expenses_annual, goals_narrative, emergency_fund, time_horizons[], '
  'assumptions, buckets[], allocation_pct, distribution_plan, '
  'ai_suggestions, pushed_action_item_ids }. For other lens types the '
  'shape is defined per-lens-type in Phase 5c+.';

comment on column public.lens_runs.archived_at is
  'Set when status transitions to archived. NULL otherwise.';

-- ────────────────────────────────────────────────────────────────────────
-- 2. RLS — already enabled by 0001 (lens_runs_rw_active_advisor). No new
--    policies needed; the new columns inherit the existing policy.
-- ────────────────────────────────────────────────────────────────────────
