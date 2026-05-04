# Axiom v1 — Ship State

**Status:** v1 production-deployed, mid-internal-rollout to PSA Wealth's
3-advisor team. Pending production sign-in verification (deferred ~12h
due to Supabase free-tier email rate limit hit during build iteration).

**Demo target:** Will + Carl walkthrough.

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

### AI engine — Stage 3a → 4 → 5 live

- 81-rec Holloway plan generation validated end-to-end at $14.17 / 18.6 min wall-clock (3rd attempt; first two surfaced a Stage 4 schema-validation failure that the diagnostic patch in `baf60b7` resolved by persisting `Stage4ResultFailed._failure_context` to JSONB and skipping cached Stage 3a on re-claim).
- Status state machine: `queued → processing → ready_for_review → approved` (or `→ failed` / `→ archived`).
- Hard cost cap: $40 per plan, honored across re-claims (cumulative cost seeded from `plans.cost_cents` at claim time).

### PDF export — React-PDF, ~290 KB / ~64 pages on Holloway

- Cover page + 14-section body + 380-row Implementation Roadmap + compliance footer (firm name + Confidential + plan/compliance ID + disclosure line).
- Page numbers deferred to v1.5 (React-PDF 4.5.1 `<Text render>` callback bug — see `specs/v1_5_backlog.md`).

### Mobile — Notes-only iOS via Expo Go

- 6-digit OTP auth (no password, no magic link in mobile flow).
- Recent 30 notes list with pull-to-refresh.
- New-note modal: client picker (horizontal pill scroll) + body + tag chips.
- Same Supabase project as web — notes written on phone appear in web Notes Hub immediately.

---

## End-to-end plan generation flow

This is the marquee v1 deliverable. Walkthrough:

1. Advisor goes to `/plans/generate`, selects a client, enters the Fact
   Review filename (record-keeping), uploads the prepared
   `ClientProfile.json` + `SelectedRecommendations.json`. Click submit.
2. Web app validates the JSONs server-side (Zod schemas from the
   orchestrator), uploads both to Supabase Storage at
   `plan-inputs/{plan_id}/{name}.json`, inserts a `plans` row with
   `status='queued'`. UI navigates back to the client detail page; the
   dashboard widget updates to "1 queued".
3. **Hayden runs the CLI locally:** `npm run generate-pending` claims
   the oldest queued plan atomically, downloads inputs from Storage,
   runs Stages 3a → 4 → 5 against Anthropic Opus 4.7, persists each
   stage's output back to the `plans` row, flips `status` to
   `ready_for_review`. Cost ≈ $14-18 per plan, wall-clock ≈ 15-25 min.
4. Advisor opens `/plans/[id]`, reviews the 14-section body, clicks
   **Approve** → status flips to `approved`.
5. Advisor clicks **Export PDF** → downloads `PSA-Plan-<client>-<date>.pdf`
   to email or hand to the client.

The CLI runs on Hayden's laptop because v1 doesn't have a hosted worker
yet. v1.5 path: Inngest or pg-boss processes queued plans automatically.

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
- [x] Plan generation flow validated end-to-end on Holloway ($14.17, 18.6 min)
- [x] PDF export works (visually approved by Hayden)
- [x] Mobile app structurally complete (auth + notes list + new-note)
- [x] All 28 commits on `main`, pushed to GitHub
- [ ] Production sign-in verified (deferred ~12h due to email rate limit; pre-demo morning)
- [ ] Will + Carl invited and signed in
- [ ] Demo delivered

The unchecked items don't require any more code — only operational
follow-through.
