-- Phase 10B.1 — Add input_fact_review_path column to plans.
--
-- v1 only stored the Fact Review *filename* as a string for record-keeping;
-- the .docx itself was never uploaded. v1.5 wires Stage 0 → 1 → 2 into the
-- production pipeline, so the .docx (or .pdf) needs a Storage path the CLI
-- can download from.
--
-- Apply via Supabase Dashboard SQL editor (or `supabase db push` once the
-- CLI is installed). Idempotent.
--
-- Existing rows: leave `input_fact_review_path` NULL. The Holloway plan
-- generated under the v1 flow had its inputs uploaded as pre-built JSONs
-- directly; that historical state is preserved.

alter table public.plans
  add column if not exists input_fact_review_path text;

comment on column public.plans.input_fact_review_path is
  'Supabase Storage path to the uploaded Fact Review (.docx or .pdf). '
  'NULL for plans created before the Phase 10B FR-upload flow, or for plans '
  'submitted via the power-user JSON fallback path (where ClientProfile and '
  'SelectedRecommendations are uploaded directly, skipping Stages 1+2).';
