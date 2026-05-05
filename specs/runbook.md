# Axiom — Plan Generation Runbook

Advisor-facing walkthrough for generating a comprehensive financial plan
from a Fact Review. v1.5.

---

## What you need

- A completed Fact Review document (`.docx` or `.pdf`) for the client.
  The Fact Review must include the structured sections + field markers
  Stage 0 looks for; if the validator rejects your file, the form will
  surface the exact issues to fix.
- The client must already exist in Axiom (Clients → New Client if not).
- Hayden must be near a terminal — the orchestrator runs locally on his
  machine. Same-day turnaround for plans submitted before 5pm ET.

---

## Generate a plan

1. **Sign in** at https://axiom-zeta-flax.vercel.app via your PSA Wealth
   email. Magic-link only — click the link in the email, land on the
   dashboard.

2. **Navigate to** Plans → **Generate** (or click the "Generate plan"
   button on the dashboard).

3. **Select the household** from the dropdown. Status filter is
   pre-applied to active + prospect clients.

4. **Upload the Fact Review.**
   - Click the upload area; pick the `.docx` or `.pdf`.
   - The filename auto-populates; edit it if needed.
   - The file is validated client-side (extension, ≤25 MB) before
     submission.

5. **Click "Queue plan."** What happens:
   - The form posts to `POST /api/plans/generate`.
   - **Stage 0** runs server-side as a preflight (deterministic; <1s).
     If it fails, you'll see a red banner with the specific issues to
     fix. The client + filename selection is preserved — fix the FR
     and re-upload.
   - On Stage 0 pass, the file lands in Supabase Storage and a plan
     row is created with `status='queued'`.

6. **Wait for Hayden to process.**
   - Hayden runs `npm run generate-pending` on his laptop.
   - The CLI claims the oldest queued plan and runs Stages 0 → 1 → 2 →
     3a → 3b → 4 → 5 against Anthropic Opus 4.7.
   - Typical wall-clock: ~25–40 min. Cost: ~$23–38.
   - The plan view (`/plans/[id]`) updates in near real-time:
     "Queued" → "Processing — Parsing Fact Review" → "Processing —
     Selecting recs / Quantifying" → "Processing — Generating plan
     body" → "Processing — Auditing" → "Ready for review."

7. **Review the plan.** Click into the plan from the client detail page
   or the dashboard plan-pipeline rail. 14-section body, sticky
   contents nav. Click **Approve** to flip to approved, then **Export
   PDF** to download a 60+ page document for the client.

---

## Power-user fallback: pre-built JSONs

If you have already-parsed `ClientProfile.json` + `SelectedRecommendations.json`
on disk (e.g., from a test fixture, or re-running a plan after a
Stage 4 failure), expand the **"Or upload pre-built JSONs (advanced)"**
section on the Generate form and upload both. The CLI will skip Stages
1 + 2 and run only Stage 3a → 5.

---

## What if it fails?

Plans can fail at any stage. The plan view's failed banner shows:

- **Failure reason** — one-line summary.
- **Cumulative cost** — what was spent before the abort.
- **Last stage reached** — Stage 0 / 1 / 3a / 4 / 5 (whichever has
  output persisted).
- **Failed-at** timestamp.

Full failure envelopes (validation errors, raw responses, attempt
history) are persisted to the corresponding `stageN_output` JSONB
column for diagnostic. Inspect via:

```sql
select jsonb_pretty(stage4_output -> '_failure_context')
from plans
where status = 'failed' and id = '<plan_id>';
```

To re-run after fixing the cause: re-claim the plan via
`npm run generate-pending`. Cached stages (anything already populated
in `stageN_output` JSONB or `input_*_path` Storage paths) are skipped,
so cost is bounded to the failed-and-after stages.

---

## Budget caps

Each plan has hard per-stage caps and a $150 per-run total cap:

| Stage | Cap | Typical |
| --- | --- | --- |
| 0 | $0 | $0 (deterministic) |
| 1 | $5 | $1.50–$3 |
| 2 | $10 | $3–$7 |
| 3a | $30 | $10–$15 |
| 3b | $0 | $0 (deterministic) |
| 4 | $25 | $8–$10 |
| 5 | $5 | $1–$3 |
| **Total cap per run** | **$150** | $23–38 |

Cumulative cost is honored across re-claims, so a single plan can
never burn 2× the cap even after a partial failure.

---

## Runbook for Hayden (local CLI processing)

```bash
# Once Will / Carl queue plans via the web form:
cd /Users/haydenduffield/projects/axiom
npm run generate-pending
# Watch the per-stage logging; ~25-40 min for a Holloway-scale FR.

# Local end-to-end pipeline test (no DB; uses Holloway fixture):
npm run test:integration:e2e
# Outputs land in artifacts/integration_v2/.
```

Migration 0004 (`input_fact_review_path` column) must be applied to the
Supabase project before the form's FR-upload path will succeed:

```bash
# Verify whether migration 0004 has been applied:
tsx scripts/applyMigration0004.ts

# If missing: paste supabase/migrations/0004_input_fact_review_path.sql
# into Supabase Dashboard → SQL Editor for project giukjljtruxygyzwvtiz.
```

---

## Known limitations (v1.5)

- **Manual CLI** — the orchestrator runs on Hayden's laptop. v2 will
  move to a hosted worker (Inngest / pg-boss / Vercel cron).
- **Stage 3a stochastic retries** — ~1-of-N batches needs a schema
  retry; one full-batch loss per N runs is possible. See
  `specs/v1_5_backlog.md`.
- **State A estimate drift** — same FR can produce different dollar
  estimates run-to-run by up to 10× on individual recs. Calibration
  pass deferred.
- **No OCR** — image-only / scanned PDFs fail Stage 0 file_integrity.
  Re-export the FR as native-text PDF or .docx.
- **No production live test yet** — Phase 10B ships the build; first
  real-client live test is Hayden's call.
