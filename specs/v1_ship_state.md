# Axiom v1 — Ship State

**Status:** v1.5 build complete. Full Stage 0 → 5 pipeline wired into
production via Phase 10B (12 commits, all on main, all pushed). Holloway
local E2E validated end-to-end at $35.60 / 25m 42s / 0 stage failures
on 2026-05-04 (`artifacts/integration_v2/manifest.json`). Pending: first
production live test on a real client Fact Review (Hayden's call) +
manual application of migration `0004_input_fact_review_path.sql` to
Supabase project `giukjljtruxygyzwvtiz` before that production run.

**Demo target:** Will + Carl walkthrough (v1 click-through still
exercises every UI surface; v1.5 added FR upload as the new default
generation path).

---

## Production coordinates

| | |
| --- | --- |
| **Web URL** | https://axiom-zeta-flax.vercel.app |
| **GitHub repo** | https://github.com/hddduffield/Axiom (private) |
| **Vercel project** | `axiom` (under Hayden's personal Vercel account, free Hobby tier, auto-deploy from `main`) |
| **Supabase project** | `giukjljtruxygyzwvtiz` (single project for both dev and prod — v1.5 will split if/when warranted) |
| **Mobile** | `mobile/` Expo app, distributed via Expo Go (App Store) — no TestFlight in v1 |

## Active advisor accounts

- **Hayden Duffield** — `hayden@psawealth.com` — invited via Supabase Auth Dashboard, signed in to web in dev + prod
- **Will Bearden** — `will@psawealth.com` — to invite via Supabase Dashboard before demo
- **Carl** — to invite (email TBD per advisor onboarding)

Invitation flow: Supabase Dashboard → Authentication → Users → "Invite user" → enter email → first sign-in via magic link triggers an `advisors` row insert (manual `INSERT INTO advisors` may be needed depending on the post-invite trigger state — see operator runbook in AGENTS.md).

---

## What works in v1

### Web app — every page is real-wired and clickable

| Surface | What it does |
| --- | --- |
| Sign-in (`/sign-in`) | Magic-link email; click link in email → `/auth/callback` exchanges the code → `/dashboard` |
| Dashboard (`/dashboard`) | Time-aware greeting, 4 stat cards (overdue / in-progress / pending decision / active clients), per-advisor triage queue, "Needs Your Decision" panel, recent notes, "+ New note" + "Generate plan" buttons |
| Clients list (`/clients`) | Status filter chips (active / prospect / inactive / all), table sorted by recency, "+ New Client" dialog |
| Client detail (`/clients/[id]`) | 5 tabs: Plan, Action Items, Notes, Partners, Lens Runs (each tab parallel-loads its slice via Supabase) |
| Action items (`/action-items`) | 4 filters (owner / status / client / partner-required), table, click-row detail dialog, click-status-badge to advance lifecycle, sonner toasts when spawn / auto-close fires |
| Notes hub (`/notes`) | 3 filters (client / author / tag), full body display, "+ New Note" + "Promote to action item" dialogs |
| Plan view (`/plans/[id]`) | 14-section long-form rendering with sticky section nav; Approve / Archive / Export PDF actions |
| Plan generation (`/plans/generate`) | Multipart upload form: pick client, paste fact_review filename, upload ClientProfile JSON + SelectedRecommendations JSON → queues plan |

### AI engine — full Stage 0 → 5 live (Phase 10B / v1.5)

- **Holloway end-to-end validation (2026-05-04):** $35.60 / 25m 42s
  cumulative across Stages 0/1/2/3a/3b/4/5, all clean, 24/24 expected
  Stage 4 sections present, 6 Stage 5 findings. Per-stage:
  - Stage 0: $0 / <1s — `passed_with_warnings` (volatile-rates).
  - Stage 1: $0.97 / 2m 9s — ClientProfile (archetype=PRE).
  - Stage 2: $4.33 / 6m 9s — 62 recs selected.
  - Stage 3a: $22.05 / 6m 24s — 62 recs quantified, 1 retry batch.
  - Stage 3b: $0 / <1s — deterministic; 62 sequenced recs.
  - Stage 4: $6.66 / 10m 15s — 2-pass tool-use; 286-row roadmap.
  - Stage 5: $1.59 / 44s — 6 audit findings.
- **Pre-Phase-10B baseline (v1):** 81-rec Holloway Stage 3a→5 at
  $14.17 / 18.6 min — preserved at `artifacts/integration_v1/`.
- Status state machine: `queued → processing → ready_for_review →
  approved` (or `→ failed` / `→ archived`). Sub-stage labels derived
  from which `stageN_output` JSONB columns are populated; rendered on
  `/plans/[id]` ("Processing — Parsing Fact Review", etc.).
- **Per-stage budget caps**: stage1 $5 / stage2 $10 / stage3a $30 /
  stage4 $25 / stage5 $5; total per-run cap $150. Cumulative cost
  honored across re-claims; skip-on-cache short-circuits already-
  completed stages on a re-claim.
- **Submission**: `/plans/generate` accepts `.docx` or `.pdf` Fact
  Review by default; ClientProfile + SelectedRecommendations JSON
  upload preserved as a power-user fallback (skips Stages 1+2).

### PDF export — React-PDF, ~290 KB / ~64 pages on Holloway

- Cover page + 14-section body + 380-row Implementation Roadmap + compliance footer (firm name + Confidential + plan/compliance ID + disclosure line).
- Page numbers deferred to v1.5 (React-PDF 4.5.1 `<Text render>` callback bug — see `specs/v1_5_backlog.md`).

### Mobile — Notes-only iOS via Expo Go

- 6-digit OTP auth (no password, no magic link in mobile flow).
- Recent 30 notes list with pull-to-refresh.
- New-note modal: client picker (horizontal pill scroll) + body + tag chips.
- Same Supabase project as web — notes written on phone appear in web Notes Hub immediately.

---

## End-to-end plan generation flow (Phase 10B / v1.5)

This is the marquee v1.5 deliverable. Full pipeline runs from a Fact
Review .docx/.pdf, no manual JSON authoring required.

1. Advisor goes to `/plans/generate`, selects a client, uploads a
   **Fact Review (.docx or .pdf, ≤25 MB)**. Filename auto-syncs from
   the picked file. Click submit.
2. Web app runs **Stage 0 preflight** server-side against `/tmp/`
   (deterministic, <1s). On `failed` → 422 with the failures list
   surfaced as a red bullet list above the form (humanized check
   labels + remediation callouts; client + filename selection
   preserved). On `passed`/`passed_with_warnings` → upload to
   `plan-inputs/{plan_id}/fact_review.{ext}`, insert `plans` row with
   `status='queued'` and `input_fact_review_path` populated.
3. **Hayden runs the CLI locally:** `npm run generate-pending` claims
   the oldest queued plan atomically. Detects FR mode (`input_fact_review_path`
   set) and runs the full chain Stage 0 → 1 → 2 → 3a → 3b → 4 → 5
   against Anthropic Opus 4.7. Per-stage budget caps + skip-on-cache
   make re-claims after a partial failure idempotent. Persists each
   stage's output to JSONB + Storage. Flips `status` to
   `ready_for_review`. Cost ≈ $23–38 per plan, wall-clock ≈ 25–40 min.
4. Advisor opens `/plans/[id]`. Mid-flight the status badge derives
   sub-stage from `stageN_output` columns ("Processing — Generating
   plan body", etc., with a pulsed dot). Reviews the 14-section body,
   clicks **Approve** → status flips to `approved`.
5. Advisor clicks **Export PDF** → downloads `PSA-Plan-<client>-<date>.pdf`
   to email or hand to the client.

The CLI runs on Hayden's laptop because v1.5 doesn't have a hosted
worker yet. v2 path: Inngest or pg-boss processes queued plans
automatically.

**Power-user fallback path:** the form's collapsed "Or upload pre-built
JSONs (advanced)" expander accepts `ClientProfile.json` +
`SelectedRecommendations.json` directly; the CLI detects this mode via
the `input_clientprofile_path` + `input_selected_recs_path` columns
(with `input_fact_review_path` NULL) and skips Stages 1+2. Useful for
re-running plans where the upstream parses already exist.

---

## Action item lifecycle (the spine)

- Action items originate from a generated plan (`source_plan_id`),
  from a lens run (`source_lens_run_id`), or from a manually-promoted
  note (`source_*_id` both null).
- Status transitions:
  `not_started → in_progress → pending_decision → complete` (cyclic
  via the dashboard / action-items list status badge).
- **Spawn rule:** `long_running` parent transitioning to `in_progress`
  for the first time spawns a derivative reminder
  (`is_derivative_reminder=true`, parent's
  `auto_generated_reminder_template` becomes the description, owner
  inherited). Idempotent: only one spawn per parent.
- **Auto-close rule:** any parent transitioning to `complete` for the
  first time auto-closes all open derivative reminders under it.
- Both effects surfaced in the PATCH response:
  `{ item, spawned_reminders, auto_closed_reminders }` so the UI can
  toast without a follow-up fetch.

---

## Known v1.5 backlog

Detail in `specs/v1_5_backlog.md`. Headline items:

| | |
| --- | --- |
| Supabase email rate limit (3/hour/email, 30/hour project) | Move to custom SMTP via Resend OR upgrade Supabase to Pro |
| PDF page numbers | React-PDF 4.5.1 `<Text render>` callback regression — wait for upstream fix or migrate to v5 |
| Stage 3a reliability at Holloway scale | Schema-retry instability on ~1-of-N batches — prompt-engineering pass on `stage3a1.system.md` |
| Stage 3a estimate run-to-run drift | Up to 10× swings on individual recs between runs (REC-CHR-001, REC-FAM-003) — calibration corpus + scenario disambiguation |
| Mobile TestFlight | Apple Developer enrollment, replace Expo Go distribution |
| Mobile action-item view-only mode | Tactical addition once advisors ask for it |
| Mobile push notifications | Defer until volume warrants |
| Audit log immutability | Phase 5e deferred audit logging entirely; current `audit_log` table is unused. Promote to a Postgres RPC + WORM policy in v1.5. |
| Architecture spec divergence | `specs/architecture/app_overview.spec.md` describes a richer schema (executives, partner_assignments, lens-derived ActionItems) than what shipped — needs an update pass |
| Hosted plan-generation worker | Replace `npm run generate-pending` CLI with Inngest / pg-boss / Vercel cron once volume requires |

---

## Demo runbook (Will + Carl)

A 12-minute click-through to show v1.

1. **(1 min) Sign-in flow.** Open https://axiom-zeta-flax.vercel.app on
   their phone or laptop. Enter their PSA Wealth email. They get a
   magic link; click it; land on the dashboard.

2. **(2 min) Dashboard tour.** Greeting, 4 stat cards (point out that
   "Pending Decision" is the highest-friction column — it's the queue
   that needs *their* attention). Triage queue is their personal
   to-do; recent notes panel is the team's collective memory. Show the
   "+ New note" button — quick capture during a client call.

3. **(2 min) Clients list + Holloway detail.** From dashboard nav, go
   to Clients. Click Holloway. Show the 5 tabs:
   - **Plan** — there's an approved plan from the live test
   - **Action Items** — count + table view, scroll through a few
   - **Notes** — show the seeded ones (MEP roll-up, PTET deadline)
   - **Partners** — Lisa Park (CPA), James Whitfield (Estate Atty), etc.
   - **Lens Runs** — empty, "Phase 5c will wire generation"

4. **(3 min) Action items spine.** Navigate to /action-items. Show the
   filter chips. Click on a `long_running` item with status `not_started`
   → click status badge → cycles to `in_progress` → toast: "1 reminder
   spawned". Refresh table → new derivative reminder appears with
   `is_derivative_reminder=true` and the parent's
   `auto_generated_reminder_template` as its description.

5. **(2 min) Plan view + PDF.** From the Holloway detail, open the
   approved plan. Scroll through the 14 sections via the sticky nav.
   Click **Export PDF** → downloads a 64-page document. Open the PDF
   to show the cover, executive summary, recommendations, IR table,
   compliance footer. *This is what gets emailed to the client.*

6. **(2 min) Mobile.** Pull out an iPhone with Expo Go installed. Scan
   the dev QR (or hit the deployed Expo URL). Sign in with 6-digit
   code. Scroll the recent notes (showing the ones Will / Carl just
   wrote on web). Tap +, write a note, save → appears in web Notes Hub
   immediately. *"This is for during the meeting."*

If they ask "what's next" — surface a couple from the v1.5 backlog above
to show there's a roadmap.

---

## What runs where

| | |
| --- | --- |
| Web app SSR + API routes | Vercel serverless functions (Hobby tier, 60s timeout) |
| Database + auth + storage | Supabase (giukjljtruxygyzwvtiz, free tier) |
| AI engine (Stages 3a/4/5) | **Hayden's laptop** via `npm run generate-pending`; Vercel only does CRUD + PDF render |
| PDF rendering | Vercel function on demand (~4s per request, 290KB output for Holloway) |
| Mobile app | Hayden's Mac → Expo dev server → Expo Go on iPhone |

---

## When v1 is "shipped"

- [x] Web deployed to Vercel, sign-in page renders publicly
- [x] All 7 web pages click-through end-to-end against real data
- [x] Plan generation flow validated end-to-end on Holloway (v1: $14.17 / 18.6 min Stage 3a→5; v1.5: $35.60 / 25m 42s Stage 0→5)
- [x] PDF export works (visually approved by Hayden)
- [x] Mobile app structurally complete (auth + notes list + new-note)
- [x] All commits on `main`, pushed to GitHub
- [x] Phase 10B build complete (12 commits 10B.1 → 10B.12)
- [ ] Migration 0004 applied to production Supabase (manual; paste SQL into Dashboard)
- [ ] Production sign-in verified
- [ ] Will + Carl invited and signed in
- [ ] First production live test (real client FR upload → Stage 0→5 → approved plan)

## v1.5 readiness statement

**v1.5 is build-complete and ready for first production live test on a
real client Fact Review.**

The unchecked items above don't require any more code — only operational
follow-through (one DB migration paste + one operator-driven test run).
