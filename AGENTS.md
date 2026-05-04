<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Repository structure

The repo holds two things side by side, not one wrapped around the other:

- **`src/lib/orchestrator/`** — the AI engine (Phase 3). Stages 3a / 4 / 5
  with their schemas, glue, system prompts, and tests. Standalone Node
  modules; not coupled to Next.js. Live-validated via `scripts/run*.ts`.
- **`src/app/`** + everything else under `src/` — the Axiom advisor app
  (Phase 4). Next.js 16 App Router that wraps the AI engine and gives
  PSA Wealth advisors a UI to live in.

Phase 4 builds the app shell on top of the existing AI engine. Do not move,
rename, or refactor `src/lib/orchestrator/` while building the app shell —
its behavior is locked by live-validation artifacts and the v1.5 backlog
(see `specs/v1_5_backlog.md`).

# v1 ship state

Production deployed at **https://axiom-zeta-flax.vercel.app**. Full
snapshot of what runs where, what works, what's pending, and the demo
runbook lives at **`specs/v1_ship_state.md`** — read that first if you're
returning to the project after a gap.

# Phase 4: App Shell

**Stack** (versions as installed; check `package.json` for current):

- Next.js 16 (App Router, TypeScript, Turbopack default)
- React 19
- Tailwind CSS v4 (PostCSS plugin via `@tailwindcss/postcss`)
- shadcn/ui (style: `base-nova`, base color: `neutral`, CSS variables, RSC)
  — installed components live at `src/components/ui/`
- Supabase: `@supabase/supabase-js` + `@supabase/ssr` (cookie-based session)
- `react-hook-form` + `@hookform/resolvers` + `zod` for forms
- `lucide-react` for icons
- `sonner` for toasts (Toaster mounted in root layout)
- ESLint flat config (`eslint.config.mjs`) extending `next/core-web-vitals`
  + `next/typescript`

**Directory layout** (everything under `src/`; tsconfig paths `@/*` → `./src/*`):

```
src/
├── app/
│   ├── layout.tsx              root layout (fonts + Toaster)
│   ├── page.tsx                redirects to /dashboard (skeleton)
│   ├── globals.css             Tailwind v4 + shadcn theme tokens
│   ├── (auth)/                 unauthenticated route group
│   │   ├── layout.tsx          centered card shell
│   │   └── sign-in/page.tsx
│   └── (app)/                  authenticated route group
│       ├── layout.tsx          nav header + content container
│       ├── dashboard/page.tsx
│       ├── clients/page.tsx
│       ├── action-items/page.tsx
│       └── notes/page.tsx
├── components/
│   └── ui/                     shadcn components (button, card, input,
│                               label, form, avatar, dialog, sonner,
│                               tabs, badge)
├── lib/
│   ├── orchestrator/           AI engine — DO NOT MOVE
│   ├── supabase/
│   │   ├── client.ts           browser client (createBrowserClient)
│   │   ├── server.ts           server client (createServerClient + next/headers cookies)
│   │   ├── proxy.ts            proxy-context client (request/response cookies)
│   │   └── database.types.ts   typed schema (regenerate via npm run supabase:types)
│   ├── api/                    route handler helpers (Step 3)
│   └── utils.ts                shadcn cn()
├── app/auth/callback/route.ts  magic-link callback (exchangeCodeForSession)
└── proxy.ts                    Next.js 16 PROXY (renamed from middleware
                                in v16) — auth gate enforces session +
                                active-advisor check on every protected route
```

**Next.js 16 conventions to remember:**

- The file formerly known as `middleware.ts` is now **`proxy.ts`**, located
  at the same level as `app/` (so `src/proxy.ts` in this repo). Same
  `NextRequest` / `NextResponse` API, same `config.matcher`. See
  `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`.
- Turbopack is the default bundler; `--webpack` is opt-in.
- Use `npx next upgrade` (v16.1+) for version bumps; falls back to
  `@next/codemod@canary upgrade latest` on older versions.

# Auth + database

- Supabase project; 3 internal advisor accounts for v1 (no client portal,
  no partner portal).
- Public env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
  are safe to ship to the browser. Server-only env vars
  (`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`) must never appear in
  client components or be exposed via `NEXT_PUBLIC_*`.
- See `.env.example` for the required env vars.

## Database schema (Phase 4 Step 2)

Eight tables — schema lives at `supabase/migrations/0001_initial_schema.sql`,
seed at `supabase/migrations/0002_seed_advisors.sql`. RLS is **enabled** on
every table; v1 policy is uniform — any signed-in user with `advisors.active
= true` can read/write any row. Per-advisor isolation is a v2 concern.

Tables (FK chain: advisors → clients → lens_runs → plans → action_items, plus
notes / partners / audit_log):

| Table          | Purpose                                                  |
| ---            | ---                                                      |
| `advisors`     | The 3 PSA Wealth advisors. `id` mirrors `auth.users.id`. |
| `clients`      | Households (e.g., Holloway). `lead_advisor_id` FK.       |
| `lens_runs`    | Re-runnable lenses (Investment / Insurance / Cash Flow). |
| `plans`        | One row per generated plan; jsonb columns hold each Stage's output. |
| `action_items` | THE SPINE. Sources: plan / lens_run / manual. Self-FK for derivative reminders. |
| `notes`        | Free-form, client-attached. Optionally promotable to action_items. |
| `partners`     | CPA / attorney / broker contact roster, scoped per client. |
| `audit_log`    | Activity log. `entity_id` is polymorphic (no FK).        |

`update_updated_at()` trigger function bumps `updated_at` on advisors,
clients, action_items.

**Auth check helper:** `public.is_active_advisor()` (SECURITY DEFINER) is the
single source of truth used by every RLS policy.

## Generating database types

```
npm run supabase:types
```

This shells out to `supabase gen types typescript --local`, requiring the
Supabase CLI installed locally (Phase 4 Step 2 was authored without it; the
checked-in `src/lib/supabase/database.types.ts` is hand-crafted to mirror
the migration shape until the CLI is in place).

## Bringing up a fresh Supabase project (operator runbook)

1. Create the Supabase project; copy URL + anon key + service-role key into
   `.env.local`.
2. Apply migrations (`supabase db push` once the CLI is installed, or paste
   the SQL into the Dashboard SQL editor in order: 0001, then 0002).
3. Invite the 3 advisors via Dashboard → Auth → Users.
4. After each invite, either (a) update the `advisors.id` for that advisor
   to match the freshly-created `auth.users.id`, or (b) drop the seed row
   and let a Step 4 onboarding flow insert it on first sign-in.
5. Run `npm run supabase:types` to regenerate `database.types.ts` from
   live introspection.

## Auth flow

- Magic-link only (no password) via `supabase.auth.signInWithOtp`.
- Callback at `/auth/callback` exchanges the code for a session.
- `proxy.ts` refreshes the session cookie on every request and gates
  protected routes on both a valid session AND an active advisor row.
  Protected = anything not under `/sign-in` or `/auth/*`.
- `/api/*` paths get **JSON 401/403** instead of an HTML redirect — the
  browser API client (`@/lib/api/client`) catches 401 and bounces the
  user to `/sign-in?redirect=<path>`.

# Phase 4 Step 3: API surface

29 endpoints across 21 route handler files at `src/app/api/*`. All
handlers currently return mock data sourced from
`src/lib/api/_mocks.ts`; real Supabase + AI-engine wiring lands in
Phase 5. The wire shapes are stable — Claude Design can build against
them now without rework.

**Where to look:**

- Contract spec: `specs/api/v1_contract.md` — every endpoint, every
  shape, every error code.
- Claude Design handoff: `specs/api/claude_design_handoff.md` — onboarding,
  page scope, visual identity guidance.
- Wire types: `src/lib/api/types.ts` (per-resource namespaces).
- Browser client: `src/lib/api/client.ts` (`api.actionItems.list({...})`).
- Server-side helpers: `src/lib/api/auth.ts` (`requireAdvisor`),
  `src/lib/api/respond.ts` (`ok`, `list`, `created`, `noContent`, `err`).

**Endpoint inventory** (legend: 🔌 = real-wired to Supabase, 🪛 = mock):

| Resource | Endpoints | Status |
| --- | --- | --- |
| Advisors | `GET /api/advisors/me`, `GET /api/advisors` | 🔌 5a |
| Clients | `GET/POST /api/clients`, `GET/PATCH/DELETE /api/clients/[id]`, `GET /api/clients/[id]/{plans,notes,lens-runs,partners}` | 🔌 5a |
| Plans (read/transitions) | `GET /api/plans/[id]`, `POST /api/plans/[id]/{approve,archive}` | 🔌 5a |
| Plans (generation) | `POST /api/plans/generate` (multipart JSON: clientprofile + selected_recommendations) | 🔌 5b |
| Plans (queue widget) | `GET /api/plans/queued` | 🔌 5b |
| Action items | `GET/POST /api/action-items`, `GET/PATCH/DELETE /api/action-items/[id]` | 🔌 5a |
| Notes | `POST /api/notes`, `PATCH/DELETE /api/notes/[id]` (author-only), `POST /api/notes/[id]/promote-to-action` | 🔌 5a |
| Lens runs (read) | `GET /api/lens-runs/[id]` | 🔌 5a |
| Lens runs (generation) | `POST /api/lens-runs/generate` | 🪛 mock — Phase 5c |
| Partners | `POST /api/partners`, `PATCH/DELETE /api/partners/[id]` | 🔌 5a |
| **Dev seed** (gated `NODE_ENV !== "production"`) | `GET/POST /api/dev/seed` | 🔌 5a |

**Conventions** (mirrored in `specs/api/v1_contract.md`):

- Auth: Supabase session cookie via `proxy.ts` + per-handler
  `requireAdvisor()` call (defense in depth — handler still verifies
  even if the proxy matcher changes).
- Error format: `{ error: { code, message, details? } }` with
  HTTP-status mapping.
- Pagination: cursor-based (`limit` default 50, max 200; `cursor`
  opaque). Implemented as base64url JSON of `{ id, key }` for keyset
  paging. See `src/lib/api/db_queries.ts`.
- Dates: ISO 8601 UTC.
- IDs: lowercase RFC 4122 UUID. Dev seed uses stable deterministic
  UUIDs (e.g., `11111111-1111-1111-1111-000000000001` for Holloway) so
  re-seeding is idempotent.

# Phase 5a: real Supabase wiring

CRUD endpoints replaced their mock returns with `auth.supabase.from(...)`
queries. Helpers live in `src/lib/api/db_queries.ts`:

- `encodeCursor` / `decodeCursor` — base64url JSON cursor format.
- `clampLimit` — enforces default 50, max 200.
- `mapDbError` / `dbErrorMessage` — Postgres error codes →
  `ApiErrorCode` (`PGRST116` → `not_found`, `23505` → `conflict`,
  `42501` → `not_authorized`, etc.).

Notes-specific behavior: PATCH/DELETE on `/api/notes/[id]` enforce
author-only edit at the API layer (RLS uniformly allows any active
advisor to UPDATE/DELETE notes; the API check ensures only the author
can mutate). May tighten via stricter RLS in v1.5+.

Action item completion behavior: PATCH `/api/action-items/[id]` with
`status: "complete"` server-side stamps `completed_at` and
`completed_by_advisor_id` on the *first* transition only (re-PATCH to
"complete" on an already-complete item is idempotent for those fields).

Audit logging is **deferred to Phase 5e** — every mutation handler has
a `// TODO: Phase 5e — audit_log insert (...)` marker.

## Dev seed

```
# from a signed-in browser address bar OR curl with cookies:
GET /api/dev/seed
```

Idempotent upsert of Holloway + Burke clients, 3 partners, 6 action items,
3 notes (one promoted). Uses the signed-in advisor as `lead_advisor_id` /
`author_advisor_id` / `owner` so the data attaches to whoever ran the
seed. Returns 403 in production via `NODE_ENV` guard.

**Routing note:** the spec called for `/api/_dev/seed`, but Next.js 16
treats `_folder` as a private (non-routable) folder. Lives at
`/api/dev/seed` instead.

# Phase 5b: plan generation flow with deferred CLI

v1 skips Stages 0/1/2 — the advisor uploads pre-prepared `ClientProfile`
+ `SelectedRecommendations` JSON blobs (typically generated by a separate
intake workflow). The CLI processes one queued plan at a time.

## Plan status state machine

```
queued       (POST /api/plans/generate accepted; inputs in Storage)
  └─ processing  (CLI claimed via UPDATE … WHERE status='queued')
       ├─ ready_for_review  (Stage 3a → 4 → 5 all succeeded)
       └─ failed            (any stage failed OR cost cap hit)
ready_for_review
  └─ approved   (POST /api/plans/[id]/approve)
{any non-archived}
  └─ archived   (POST /api/plans/[id]/archive)
```

Approve endpoint guards `status === 'ready_for_review'` (was `'draft'`
in Phase 5a; `draft` no longer exists in the v1.5 state machine — see
migration 0003).

## Submitting a plan

`POST /api/plans/generate` — `multipart/form-data`, four required fields:

- `client_id` — UUID of an existing `clients` row.
- `fact_review_filename` — string, for record-keeping (not parsed).
- `clientprofile` — File, `application/json`, validated against
  `ClientProfileSchema` from `src/lib/orchestrator/schemas/clientProfile.ts`.
- `selected_recommendations` — File, `application/json`, validated
  against `SelectedRecommendationsSchema`.

On success returns 202 with `{ id, status: "queued", queued_at }`.
Storage layout: `plan-inputs/{plan_id}/{clientprofile,selected_recs}.json`.
On any post-validation failure the route rolls back: deletes the
storage object(s) and the `plans` row.

## Storage bucket

`plan-inputs` (private) created by migration 0003 via
`INSERT INTO storage.buckets`. RLS policies grant SELECT/INSERT/UPDATE/DELETE
to active advisors via the same `is_active_advisor()` helper used elsewhere.
The CLI uses the service-role key and bypasses RLS entirely.

## Running the CLI

```bash
npm run generate-pending
```

Behavior:

1. Connects to Supabase with `SUPABASE_SERVICE_ROLE_KEY`.
2. Atomically claims the oldest `status='queued'` plan via
   `UPDATE … WHERE id=X AND status='queued' RETURNING *`.
3. Downloads + re-validates the input JSONs from Storage.
4. Runs Stage 3a → 4 → 5 live against the Anthropic API, persisting each
   stage's output and accumulating cost on the `plans` row as it goes.
5. Flips status to `ready_for_review` on success or `failed` on any error
   (with `failure_reason` populated and partial outputs preserved).

**Hard cost cap:** $40 per plan. If exceeded mid-run, the next stage is
skipped and the plan is marked `failed`. If a single stage's actual cost
exceeds the cap, the plan still reaches `ready_for_review` (the cap is
checked *before* firing each stage, not after). Cumulative cost is
seeded from `plan.cost_cents` at claim time, so re-claimed plans honour
prior spend against the cap (a single plan can never burn $80 across
two attempts).

**Stage 3a is skipped on re-claim** when `plan.stage3a_output` is
already populated. Stage 3a is the most expensive stage and produces
stochastically-different output each run; re-running it after a Stage 4
failure would (a) waste $8-12 and (b) blur the Stage 4 diagnosis by
feeding it a different QR than the one that just failed. The cached
JSONB is cast back to `QuantifiedRecommendations` raw (no Zod, same
pattern as `downloadJsonRaw`).

**Failed envelopes are persisted to JSONB.** When Stage 4 or Stage 5
fails, the full `Stage4ResultFailed` / `Stage5ResultFailed` is written
to `plans.stage4_output` / `plans.stage5_output` *before* `markFailed`
flips status. Without this, `_failure_context.validation_errors`,
`raw_response`, `parsed_response`, and `_metadata.attempt_history` are
lost — and the only diagnostic record is the short `failure_reason`
text, which doesn't name which Zod path the LLM violated. Inspect the
detail via:

```sql
select jsonb_pretty(stage4_output -> '_failure_context')
from plans
where status = 'failed' and id = '<plan_id>';
```

If two CLI invocations race, the second sees `RETURNING *` come back
empty and exits "No pending plans" — no double-processing risk.

`scripts/generatePending.ts` mirrors the structure of
`scripts/runIntegrationStage3a4_5.ts`; reading both side-by-side is the
fastest way to understand what the CLI does on each iteration.

## Dev seed (Phase 5b enhancements)

`/api/dev/seed` now also:
- Reads `artifacts/holloway_clientprofile.json` +
  `artifacts/holloway_selected_recommendations.json` from disk.
- Uploads both to `plan-inputs/{seed-plan-id}/...` (idempotent via
  `upsert: true`).
- Inserts a `plans` row with `status='queued'` (deterministic id
  `55555555-5555-5555-5555-000000000001`) so `npm run generate-pending`
  has work to do immediately.

If the artifact files aren't present on disk (e.g., a fresh Vercel
deploy without `artifacts/`), the seed still completes — the queued
plan insert is skipped and `queued_plan_skip_reason` is surfaced in
the JSON response.

## Lens runs generation (still mocked)

`POST /api/lens-runs/generate` is unchanged from Phase 4. Phase 5c will
follow the same pattern as 5b: route inserts a `lens_runs` row with a
new `'queued'` status, CLI claims and processes. The lens generator
module itself doesn't exist yet; that's also a Phase 5c deliverable.

## v1.5 path: queue worker

When the team grows past 3 advisors or generation volume exceeds
~5/hour, the manual CLI gets replaced with a hosted worker (Inngest is
the leading candidate; pg-boss the self-hosted alternative). The
contract stays the same — the worker reads `status='queued'` rows from
Postgres and calls into `src/lib/orchestrator/` exactly like the CLI
does.

# Phase 5d: action item lifecycle

Two server-side hooks fire on `PATCH /api/action-items/[id]` after the
parent UPDATE commits. Logic lives in
`src/lib/api/action_item_lifecycle.ts`; both hooks are also called from
`POST /api/notes/[id]/promote-to-action` for consistency (no-op there
because the new item starts at `status='not_started'`).

## Spawn rule — `spawnDerivativeReminderIfNeeded`

Fires exactly when **all** these hold:

1. `newStatus === 'in_progress'` AND `oldStatus !== 'in_progress'` (first
   transition into in_progress, not idle re-PATCHes).
2. Parent's `duration_class === 'long_running'`.
3. Parent's `auto_generated_reminder_template` is non-null (Stage 3a
   populates this for every long_running ActionItem).
4. Parent is not itself a derivative (`is_derivative_reminder === false`)
   — recursion stop.
5. No derivative under this parent already exists (`SELECT id … WHERE
   parent_action_item_id = parent.id AND is_derivative_reminder = true`
   returns 0 rows). Idempotent — re-PATCHing through in_progress won't
   double-spawn.

Spawned row inherits from parent: `client_id`, `category`, `owner`,
`partner_required`, `partner_type`, `source_plan_id`, `source_lens_run_id`.
Set explicitly: `parent_action_item_id = parent.id`,
`is_derivative_reminder = true`, `duration_class = 'one_time'`,
`timing_bucket = 'next_30_days'`, `status = 'not_started'`,
`description = parent.auto_generated_reminder_template`,
`auto_generated_reminder_template = null`.

## Auto-close rule — `closeDerivativeRemindersIfNeeded`

Fires exactly when `newStatus === 'complete'` AND `oldStatus !== 'complete'`.
Updates every row matching `parent_action_item_id = parent.id AND
is_derivative_reminder = true AND status != 'complete'` to
`status='complete'`, `completed_at=now()`, `completed_by_advisor_id=
<closing advisor>`. Returns the count.

## PATCH response shape (Phase 5d)

```json
{
  "item": { /* updated ActionItem row */ },
  "spawned_reminders": [{ /* spawned ActionItem */ }] | null,
  "auto_closed_reminders": <integer count>
}
```

`spawned_reminders` is `null` (not `[]`) when no spawn fires, so the UI
can branch on truthiness. `auto_closed_reminders` is `0` for the no-op
case. Both fields are surfaced so the UI can toast without a follow-up
fetch ("1 reminder spawned" / "2 reminders auto-closed").

This is a **breaking change** to the prior `UpdateResponse = ActionItem`
contract; Claude Design hasn't built against the old shape yet so the
swap is safe but worth flagging for any future contract diffing.

## Manual smoke test

The dev seed includes a long_running action item (`SEED_AI_REAL_ESTATE`
isn't actually long_running — pick one whose `duration_class` is
`long_running` and `auto_generated_reminder_template` is non-null after
a real Stage 3a run; or hand-craft one in the DB):

```bash
# 1. Find a long_running parent with a template:
#   select id, description, auto_generated_reminder_template
#     from action_items where duration_class='long_running'
#       and auto_generated_reminder_template is not null limit 1;

# 2. PATCH it to in_progress (cookie from a signed-in browser session):
curl -X PATCH 'http://localhost:3000/api/action-items/<id>' \
  -H 'Cookie: sb-…' -H 'Content-Type: application/json' \
  -d '{"status":"in_progress"}'
# Response should include spawned_reminders: [{...}] with one row.

# 3. Confirm the derivative exists:
#   select id, description, is_derivative_reminder, parent_action_item_id, status
#     from action_items where parent_action_item_id='<id>';

# 4. PATCH parent to complete:
curl -X PATCH 'http://localhost:3000/api/action-items/<id>' \
  -H 'Cookie: sb-…' -H 'Content-Type: application/json' \
  -d '{"status":"complete"}'
# Response should include auto_closed_reminders: 1.

# 5. Confirm the derivative also flipped to complete:
#   select status, completed_at, completed_by_advisor_id
#     from action_items where parent_action_item_id='<id>';
```

# Phase 6: PDF export

`@react-pdf/renderer` 4.5.1. Vercel-friendly (no headless browser
dependencies). Two endpoints, two Document components.

## Endpoints

| Endpoint | Renderer | Notes |
| --- | --- | --- |
| `GET /api/plans/[id]/pdf` | `PlanDocument` (14 sections) | Status-gated to `ready_for_review` / `approved` / `archived` |
| `GET /api/lens-runs/[id]/pdf` | `LensRunDocument` (placeholder) | Status-gated to `draft` / `approved` / `archived`; full per-lens-type rendering lands in Phase 5c |

Both stream `application/pdf` with
`Content-Disposition: attachment; filename="…"`. Browser-side wrappers
`api.plans.exportPdf(id)` and `api.lensRuns.exportPdf(id)` return
`Promise<Blob>` (Phase 6 added a `requestBlob` helper alongside the
existing JSON `request` in `src/lib/api/client.ts`).

## Renderer modules

```
src/lib/pdf/
├── PlanDocument.tsx          14-section plan body
├── LensRunDocument.tsx       lens-run placeholder (Phase 5c expands)
├── styles.ts                 StyleSheet tokens (colors, sizes, spacing)
├── components/
│   ├── PageChrome.tsx        PageHeader, PageFooter, TitlePageFooter
│   ├── Atoms.tsx             H1/H2/H3, Paragraph, SectionLabel, Bullet
│   └── Tables.tsx            generic Table<T> + GroupBand
└── index.ts                  barrel
```

Typography: Helvetica family throughout (PDFKit-built-in; no font
registration). Body 10.5pt, h1 16pt navy, h2 13pt navy, h3 11.5pt
mid-navy. Letter page size, 0.75″/1″ margins. Holloway-scale plan
renders to ~64 pages / ~290 KB / ~4s wall-clock.

## v1 footer (no page numbers)

The footer on every body page:

```
PSA Wealth | Confidential | Compliance ID: <tracking_id>
Plan ID <plan_id_first_8_chars>… · For informational purposes only. …
```

**Page numbers are deferred to v1.5.** `@react-pdf/renderer` 4.5.1's
`<Text render={({ pageNumber, totalPages }) => …}>` callback throws
`unsupported number: -8.987253937891275e+21` from PDFKit's
`clipBorderTop` whenever paired with a multi-page body. Eight-test
bisection isolated the bug to the `render` callback path itself
(independent of position, layout, or whether `totalPages` is requested).
See `specs/v1_5_backlog.md` for the full diagnosis + recovery paths.

## Markdown formatting

Stage 4 prose is rendered as plain text — no markdown parsing in v1.
The only "bold" rendering is the `bold_imperative` prefix on
recommendation bullets, which is its own field and is wrapped in a
`<Text style={bold}>` directly. If Stage 4 ever starts emitting inline
emphasis (`**bold**`, `*italic*`, etc.), add a tiny markdown→React-PDF
bridge in `src/lib/pdf/components/Atoms.tsx`'s `Paragraph`.

## Local test

```
1. npm run dev
2. Sign in via /sign-in (magic link).
3. Navigate to http://localhost:3000/api/plans/<plan_id>/pdf
4. Browser downloads the PDF.
```

For the seeded Holloway plan (status=ready_for_review after running
`npm run generate-pending`), the URL is
`http://localhost:3000/api/plans/55555555-5555-5555-5555-000000000001/pdf`.

# Phase 5e: functional UI

7 pages live, all routed through the existing `(app)` route group. Visual
polish is **not** in scope here — Phase 9 will swap in the Claude Design
HTML references. Default shadcn styling throughout.

| Route | Component split |
| --- | --- |
| `/dashboard` | Server (greeting, 4 stat cards, triage queue, recent notes) + client island for "+ New note" dialog |
| `/clients` | Server (table + status filter) + client island for "+ New Client" dialog and filter chips |
| `/clients/[id]` | Server (5-tab Tabs with all data parallel-loaded server-side) |
| `/action-items` | Server shell loads advisor + client lookup, rest is one big Client Component (filter state + status toggle + detail dialog) |
| `/notes` | Server pre-loads notes + advisor + client lookup, Client Component handles filters + new-note dialog + promote-to-action dialog |
| `/plans/[id]` | Server-renders the 14-section plan body from `plans.stage4_output`; client island for Approve / Archive / Export PDF |
| `/plans/generate` | Server pre-loads client list, Client Component handles multipart upload (ClientProfile + SelectedRecommendations + fact_review_filename) |

## Server vs Client component pattern

Server Components read **directly via Supabase server client** (`@/lib/supabase/server`). The
typed API client at `@/lib/api/client` is **browser-only** — it constructs URLs from
`window.location.origin` — so calling `api.*` from a server context would
hit `http://localhost/...` and fail. Client Components import `api` from
`@/lib/api/client` and use it normally; Server Components import the
**typed shapes** from `@/lib/api/types` for prop typing but do their fetches
through Supabase.

This is the same pattern used by the dashboard widget in Phase 5b. It
trades "single source of fetch logic" for "no internal HTTP hop on SSR".

## shadcn quirks (base-nova preset)

The `base-nova` preset uses Base UI primitives, **not** Radix. Two
consequences:

- **No `asChild` prop** on `Button` or trigger components. Use
  `buttonVariants()` directly on a `<Link>` for nav buttons; put the
  styled className directly on `DialogTrigger` / `DropdownMenuTrigger`
  for trigger buttons.
- `Select.onValueChange` is `(value: string | null, eventDetails) => void`.
  Wrap the callback to coerce: `onValueChange={(v) => onChange(v ?? "")}`.

## Layout

`src/app/(app)/layout.tsx` is now a Server Component that loads the
current advisor and renders the top nav. The avatar dropdown (sign-out)
is a Client island at `src/app/(app)/_layout/TopNavRight.tsx`.

The `_layout/` folder is a private folder (Next.js excludes underscore-
prefixed dirs from routing) so the client island doesn't accidentally
become a route.

## Deferred to Phase 9

- Visual polish to match Claude Design HTML references
- Search input (placeholder in nav today)
- "+ New" dropdown menu (separate dialogs today, one per resource)
- Loading skeletons in places where Server Components render synchronously
- Empty-state illustrations
- Mobile responsive layouts (current is laptop-first)
- Pagination UI for the action-items table (cursor pagination is wired in
  the API but the UI loads up to the default limit and stops)

# Phase 7: mobile (Expo)

iOS notes-only companion app at `mobile/`. Expo SDK 54, expo-router 6,
React Native 0.81. Two separate `package.json` files (no monorepo
tooling); the mobile app talks to the same Supabase project as the web,
with **direct table reads/writes** (not via the Next /api/* routes).

## Layout

```
mobile/
├── package.json              (expo-router/entry main)
├── app.json                  (scheme: axiom, bundle: com.psawealth.axiom)
├── .env.example              EXPO_PUBLIC_SUPABASE_URL + ANON_KEY placeholders
├── README.md                 first-time setup + auth flow
├── app/
│   ├── _layout.tsx           root Stack + SafeAreaProvider
│   ├── index.tsx             session-aware redirect
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── sign-in.tsx       email → request OTP
│   │   └── verify.tsx        paste 6-digit code
│   └── (app)/
│       ├── _layout.tsx       auth gate + protected stack
│       ├── index.tsx         recent notes list (FlatList + FAB)
│       └── new-note.tsx      modal: client picker + body + tag
├── lib/
│   ├── supabase.ts           createClient w/ AsyncStorage adapter
│   ├── types.ts              inline minimal types (Advisor, Client, Note, …)
│   └── api.ts                getCurrentAdvisor / listClients / listRecentNotes / createNote
└── components/NoteCard.tsx
```

## Setup + run

```bash
cd mobile
npm install
cp .env.example .env
# Paste the same Supabase URL + anon key the web app uses (with EXPO_PUBLIC_ prefix).
npx expo start
```

Distribute via **Expo Go** (App Store, free) — phone scans the QR from
the dev server. Same Wi-Fi required.

## Auth model

OTP, not magic-link: `signInWithOtp({ email, options: { shouldCreateUser:
false } })` then `verifyOtp({ email, token, type: 'email' })`. Sessions
persist via AsyncStorage. Mobile relies on the same `is_active_advisor()`
RLS gate as web — only invited PSA Wealth advisors can sign in.

## Why mobile reads Supabase directly (not the /api routes)

The Next.js /api routes assume `same-origin` cookies. From a native app,
the cookie story is much messier (you'd need a custom URL scheme +
manual cookie management or a hosted endpoint that issues bearer
tokens). With direct Supabase access via the supabase-js client +
AsyncStorage session storage, the same JWT that signed in the user
gates every query through RLS. No additional surface to maintain.

## v1 scope (mobile)

In: notes list, write a note, sign out.

Out (deferred):
- Action item viewing or editing
- Client detail / plan viewing  
- Plan generation
- Push notifications
- Offline queueing
- TestFlight distribution

## v1.5 backlog (mobile)

- Apple Developer enrollment + TestFlight (currently distributing via
  Expo Go which requires the Expo Go app on each phone).
- Action item view-only mode (read existing items + cycle status).
- Plan view-only mode.
- Native picker for client (currently a horizontal pill scroll which is
  fine ≤ 20 clients).
- Pagination on the notes list (currently loads default 30).

# Phase 9 polish conventions

Phase 9 converts Claude Design's high-fidelity HTML references into
production Next.js components. Each conversion is a focused per-page
prompt; this section documents the rules every conversion follows so
they don't drift from page to page.

## Where references live

- **Reference HTML** — `specs/design/<page-name>.html` (e.g.,
  `specs/design/dashboard.html`). Kept in the repo so future conversions
  can diff against the source of truth.
- **Converted page** — replaces the existing `src/app/(app)/<page>/page.tsx`
  (and inline client islands as needed).

## What to preserve from the reference

1. **DOM hierarchy.** The semantic structure Claude Design chose
   (sections, articles, ordering of cards, table column order). If
   the reference shows a sidebar-then-main layout, don't flip it to
   main-then-sidebar.
2. **Tailwind class names** present on the reference, where possible.
   When Claude Design picks `gap-6`, `rounded-xl`, `text-sm`, keep
   them. Phase 9 should mostly look like a reskin, not a rewrite.
3. **ARIA roles, `data-*` attributes, semantic landmarks** Claude
   Design annotated.
4. **Loading, error, empty states** as drawn in the reference.
5. **Annotated API endpoints.** Claude Design tags every interactive
   element with the endpoint it must call (typically as a comment or
   `data-endpoint` attribute). Honor those — wire each to the matching
   `api.*` method from `@/lib/api/client`.

## What to substitute

- **Plain `<button>`, `<input>`, `<dialog>`** → matching shadcn
  primitive from `@/components/ui/*` (Button, Input, Dialog, etc.).
- **Mock data in the reference** → real API calls. The mock shapes
  are TypeScript inference helpers, not data sources.
- **Inline styles** → Tailwind classes (Tailwind first; fall back to a
  `style={{}}` only when the value isn't expressible in Tailwind).
- **Hardcoded colors / fonts** that recur → tokens in
  `src/styles/design-tokens.css`. Once stable across multiple pages,
  promote into `globals.css`'s `@theme inline` so they become Tailwind
  classes (`bg-axiom-primary`).

## Custom components

- Recurring Axiom-specific compositions go in `src/components/axiom/`.
  See `src/components/axiom/README.md` for the convention.
- One-off compositions can stay inlined in the page file; promote to
  `axiom/` once they show up on a second page.

## Server vs Client component split

Same rule as Phase 5e:

- Pages that read data → **Server Components** (read directly via
  `@/lib/supabase/server`'s `createClient`, type the result with the
  shape from `@/lib/api/types`).
- Forms, dialogs, status toggles, anything with hooks or event handlers
  → **Client islands** at `_<Name>.tsx` (underscore prefix is a Next.js
  private folder convention so the islands aren't accidentally routed).
- Client islands import `api` from `@/lib/api/client` for mutations.

## Per-conversion checklist

When the per-page conversion prompt arrives, the work is:

1. Save Claude Design's HTML to `specs/design/<page>.html`.
2. Read the existing `src/app/(app)/<page>/page.tsx` to understand the
   current data wiring + client islands.
3. Replace the page (and create / update islands) preserving the
   reference's structure + classes + endpoint annotations.
4. Wire data fetches to real API methods.
5. tsc + dev-server smoke (verify no 500s; the per-page prompt may
   include visual spot-checks).
6. Commit with message `Phase 9.<n>: <page> polish — converted Claude Design reference; …`.

## Tokens — verbatim from Claude Design (Phase 9.1)

`src/styles/design-tokens.css` mirrors Claude Design's source 1:1 — token
names match (`--bg`, `--surface`, `--accent`, `--n-100`, `--psa-navy`,
`--s-amber-bg`, `--text-2`, `--gold`, `--font-display`, etc.). The
JSX-to-TSX conversions in 9.2+ reference these directly (`var(--bg)`,
`var(--accent)`) without any `--axiom-*` rename hop. **Don't re-namespace
to `--axiom-*`** — the prior Phase 9.0 convention was a stub assumption
overridden once Claude Design's source landed.

`src/app/globals.css` then maps shadcn's primitive tokens
(`--background`, `--primary`, `--card`, `--border`, `--muted`,
`--muted-foreground`, etc.) to Axiom's palette (`var(--bg)`,
`var(--psa-navy)`, `var(--surface)`, `var(--border)`, `var(--surface-2)`,
`var(--text-3)`, …). Net effect: every shadcn primitive (Button, Card,
Dialog, Badge, Tabs, Select, Table, Input, Skeleton, Alert, Sonner)
picks up Axiom's brand without primitive source edits.

### Usage rules

- **Inside `axiom/` components or page-level JSX**: reference Axiom
  tokens directly via `style={{ color: 'var(--text-2)' }}` or by adding
  Tailwind utility classes that resolve through the @theme inline
  bridge (`text-foreground`, `bg-card`, `border-border`,
  `text-muted-foreground` all already work).
- **Inside `ui/` shadcn primitives**: don't edit. They consume the
  shadcn-named tokens which globals.css already remapped.
- **Promote a token to a Tailwind utility** only when 3+ surfaces use
  it AND no shadcn-named token already covers it. Add to globals.css's
  `@theme inline` block and the Tailwind class (`text-axiom-gold`,
  etc.) becomes available.
- **Type families**: `font-sans` (Geist), `font-mono` (Geist Mono),
  `font-display` and `font-heading` (both Cormorant Garamond) are
  Tailwind utilities. Reach for them directly.

# Phase 9 complete — what shipped

11 conversions, one commit each. Production state at end of phase:
`https://axiom-zeta-flax.vercel.app`. AI engine (`src/lib/orchestrator/`)
untouched; only the app shell (`src/app/(app)/*` + `_layout/` + brand
assets) changed.

| # | Surface | Notable preservation / shift |
| --- | --- | --- |
| 9.1 | Brand tokens | verbatim Claude Design tokens, shadcn primitive remap via globals.css `:root` |
| 9.2 | Sign-in | `sp-classic` two-pane (PSA navy left / ivory right); RHF + magic-link wiring preserved |
| 9.3 | Action item drawer | `src/components/axiom/ActionItemDrawer.tsx` (shadcn Sheet); origin-note reverse lookup; lifecycle toasts unchanged |
| 9.4 | Plan generate | crumbs + Cormorant heading + JSON-parse validation; `api.plans.generate` multipart unchanged |
| 9.5 | Clients list | 3-axis filter chips (Status / Archetype / Lead) + sortable Household / Open items / Added; New Client modal preserves `api.clients.create`. Schema gap: no `aum`, no `last_activity_at` — column dropped, "Added" uses `created_at`. |
| 9.6 | Client detail | 6 tabs (Overview / Plan / Items / Notes / Lenses / Partners); ActionItemDrawer reused; PanelCard primitive |
| 9.7 | Notes hub | Date-grouped feed (Today / This week / This month / Earlier); scope chips + curated NOTE_TAGS; PromoteDialog with source preview. `api.notes.create` + `api.notes.promoteToAction` preserved |
| 9.8 | Action items global | **Architecture shift**: previous version round-tripped to API on every filter change; the polished view loads the full universe once and runs filter/sort/group in memory. Required for saved-views with live counts. Bulk "Mark complete" loops `api.actionItems.update` (no bulk endpoint yet). |
| 9.9 | Dashboard | Hero + stat satellites + plan pipeline rail + triage queue with priority cards (functional Mark complete) + side rail (decisions / notes / activity). Inline compose replaces the dialog `_NewNoteButton.tsx` (deleted). |
| 9.10 | Plan view | Sticky TOC rail with IntersectionObserver active-section tracking (`_PlanToc.tsx` Client island); 14 sections rendered from real `Stage4Result`; tightened Implementation Roadmap; status-aware actions via existing `_PlanActions.tsx` |
| 9.11 | Top nav | Navy 56px topbar (sticky), `public/psa-mark.webp` brand mark + Cormorant wordmark, gold underline on active route via `_layout/TopNavLinks.tsx` Client island. Existing `TopNavRight.tsx` unchanged. |

## v1.5 backlog created during Phase 9

- **Bulk action-item endpoint** (`POST /api/action-items/bulk`) — 9.8 wires "Mark complete" via per-item PATCH loop; Reassign / Archive disabled with hint.
- **`/api/dashboard?for=me` aggregator** — 9.9 reads each panel's slice from a single batched query in `page.tsx` instead.
- **Cmd-K palette** — 9.11 ships the search visual element only; behaviour deferred.
- **Cmd-K + global "+ New" dropdown** — Phase 5e original deferral still pending.
- **Schema gaps surfaced**: `clients.aum`, `clients.entity_count`, `clients.last_activity_at`, `clients.notes` (freeform). Mid-/post-liquidity panels and partial-row layouts depend on these.
- **Notes**: tag column is free-form `string|null`; curated `NOTE_TAGS` chips intersect with usedTags but historic non-curated tags fall through as plain `Tag` chips.
- **Plan re-trigger from web** — Phase 9.10 deferred `POST /plans/[id]/regenerate` and "Generate next quarter" actions; CLI re-runs are still the path.
- **TestFlight + native Apple distribution** — Phase 7 mobile is Expo Go only.

## Smoke-test scope at end of phase

Programmatic checks performed:

- `npx tsc --noEmit` — clean.
- `npm run build` — full prod build: 36 routes compile, TypeScript clean.
- HTTP smoke (`curl`) for every page route — all return 200 (sign-in) or 307 (protected → sign-in via proxy.ts). No 500s.

Manual browser click-through against an authenticated session was **not**
done as part of this phase; production parity is implicit via Vercel
auto-deploy on each conversion's push to `main`. If a runtime issue
surfaces in browser, it lives in the per-conversion commit (granular
revert is safe).
