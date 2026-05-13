-- Phase 14.1 — Estate Lens v1.
--
-- The estate lens lives in the existing `lens_runs` table, mirroring the
-- Cash Flow Lens pattern from Phase 13. This migration:
--
--   1. Expands the lens_runs.lens_type CHECK constraint to allow 'estate'.
--   2. Adds a partial-index for fast "list estate lenses for client"
--      queries (Lens Runs tab + scenario picker).
--
-- The estate-specific JSONB shape is documented in
-- src/lib/estate-lens/types.ts (EstateLensOutput type). It contains:
--   client_snapshot, scenario_name, assumptions, assets_out, planning_move,
--   life_insurance, ai_suggestions, pushed_action_item_ids,
--   linked_to_main_plan.
--
-- Apply via Supabase Dashboard SQL editor (or `supabase db push` once the
-- CLI is installed). Idempotent.

-- ────────────────────────────────────────────────────────────────────────
-- 1. Expand lens_runs.lens_type to include 'estate'
-- ────────────────────────────────────────────────────────────────────────

alter table public.lens_runs
  drop constraint if exists lens_runs_lens_type_check;

alter table public.lens_runs
  add constraint lens_runs_lens_type_check
  check (lens_type in ('investment', 'insurance', 'cash_flow', 'estate'));

-- ────────────────────────────────────────────────────────────────────────
-- 2. Partial-index for estate lens scenario lookup per client
-- ────────────────────────────────────────────────────────────────────────

create index if not exists lens_runs_estate_client_idx
  on public.lens_runs (client_id, generated_at desc)
  where lens_type = 'estate';

-- ────────────────────────────────────────────────────────────────────────
-- 3. Documentation comment update
-- ────────────────────────────────────────────────────────────────────────

comment on column public.lens_runs.output is
  'JSONB output. For lens_type=cash_flow this matches CashFlowLensOutput '
  'in src/lib/api/cash_flow_lens.ts. For lens_type=estate this matches '
  'EstateLensOutput in src/lib/estate-lens/types.ts: { schema_version, '
  'client_snapshot, scenario_name, assumptions, assets_out, planning_move, '
  'life_insurance, pushed_action_item_ids, linked_to_main_plan, '
  'tracking_id }. For other lens types the shape is defined per-lens-type '
  'in Phase 5c+.';

-- ────────────────────────────────────────────────────────────────────────
-- 4. RLS — already enabled by 0001 (lens_runs_rw_active_advisor). No new
--    policies needed.
-- ────────────────────────────────────────────────────────────────────────
