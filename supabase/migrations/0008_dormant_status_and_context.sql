-- Phase 18.3 + 18.4 — Dormant client status + written context paragraph.
--
-- Two bundled schema changes:
--   1. Expand clients.status enum with 'dormant' (maintenance-mode
--      clients that aren't archived but aren't active either).
--   2. Add clients.context_paragraph + context_updated_at — advisor-
--      written narrative shown on the Client Overview.
--
-- Apply via Supabase Dashboard SQL editor. Idempotent.

-- ────────────────────────────────────────────────────────────────────────
-- 1. clients.status — add 'dormant'
-- ────────────────────────────────────────────────────────────────────────

alter table public.clients drop constraint if exists clients_status_check;
alter table public.clients add constraint clients_status_check
  check (status in ('active', 'prospect', 'inactive', 'dormant'));

comment on column public.clients.status is
  'Lifecycle state — active (working), prospect (pre-engagement), '
  'dormant (engaged but maintenance-mode; reduced cadence), inactive '
  '(archived; default-hidden in UI).';

-- ────────────────────────────────────────────────────────────────────────
-- 2. clients context paragraph
-- ────────────────────────────────────────────────────────────────────────

alter table public.clients
  add column if not exists context_paragraph text,
  add column if not exists context_updated_at timestamptz;

comment on column public.clients.context_paragraph is
  'Advisor-written narrative (3-5 sentences) about the client: who they '
  'are, the business, planning thesis, sensitivities, current focus. '
  'Surfaced prominently on the Client Overview. May be AI-suggested via '
  'POST /api/clients/[id]/generate-context but must be reviewed by an '
  'advisor before saving.';

comment on column public.clients.context_updated_at is
  'Stamped on every successful PATCH of context_paragraph. NULL until '
  'first save.';
