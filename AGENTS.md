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

# Phase 9 Tier 1 polish (9.12-9.16) — diagnosis-driven gap closure

After 9.11 a visual-gap diagnosis pass surfaced 5 root causes accounting
for ~70% of the perceived divergence from Claude Design. Each fix
landed as its own commit so individual reverts stay safe.

| Commit | Fix | Surfaces touched |
| --- | --- | --- |
| 9.12 | Dashboard hero → full-bleed navy with 38px Cormorant greeting + radial gradient overlay + dark composer | `_DashboardView.tsx` (Hero + QuickCompose) |
| 9.13 | Chip primitive `--accent` → `--n-900` per cascade-winning `.chip.is-active` (styles.css line 511) | `src/components/axiom/Chip.tsx` (new) + 3 surfaces |
| 9.14 | Stat tile sizes 92px hero / 38px satellites + alert linear-gradient bg (line 1228-1287) | `_DashboardView.tsx` (StatTile) |
| 9.15 | Tabs underline navy + baseline-aligned (replaces shadcn variant=line `after:bottom-[-5px]`) | `src/components/axiom/Tabs.tsx` (new) + client detail |
| 9.16 | PanelCard title eyebrow 12px mono uppercase letter-spacing 0.06em (cascade rule line 343 inheriting mono from line 112) | `src/components/axiom/PanelCard.tsx` (new) + 4 surfaces |

## New `src/components/axiom/` primitives

- `Chip.tsx` — filter / saved-view chip with `--n-900` active state and
  optional white/20% count-pill via `<Count onActive>`.
- `Tabs.tsx` — Base UI Tabs with design-correct `border-bottom` underline
  on the trigger itself (not pseudo-element 5px below baseline).
- `PanelCard.tsx` — unified panel card with eyebrow title, optional
  count badge, action cluster, flush mode for tables.

These replace per-surface duplicate definitions; future cross-cutting
visual changes are now single-file edits.

## Root-cause patterns surfaced by the diagnosis

1. **Design source has internally contradictory CSS**: Multiple
   `.chip.is-active` rules with different colors (line 138 `--accent`,
   line 511 `--n-900`); same for `.card__head h2` (line 112 + 343).
   Only the cascade-winner is the design intent. Always grep for the
   selector in full and trust the LATER rule.

2. **shadcn primitive defaults read as "tasteful but quiet"**:
   `Tabs variant="line"` underlines via pseudo-element 5px below
   baseline; `Card` semantic = "card has a heading" with mid-weight
   sans title vs design's eyebrow-style mono uppercase. Override by
   isolated wrapper component (per "wrap not edit" rule when fix has
   wider implications).

3. **Tailwind shorthand is approximate**: `text-5xl` ≈ 48px when design
   wants 92px (Cormorant editorial). Always use explicit pixel values
   when sources cite specific sizes; reach for shorthand only for the
   typical/sans range.

4. **Cascade-winner != most-recently-imported rule**: Phase 9 read
   styles.css selectively to convert each surface; reading partial
   rules without scanning the full file for selector overrides
   produced 5+ divergences. Diagnosis pass corrected this with a full
   grep-then-read sweep.

# Phase 9.17-9.19: action items kanban + UUID cleanup + DnD

After Tier 1 polish landed, three structural changes shipped together:

| Commit | Change |
| --- | --- |
| 9.17 | Stripped visible UUID rendering from cards / dashboard / notes / drawer / clients / plan view. URL routing + API + DB unchanged. `→ promoted to <id>` indicators replaced by green `PROMOTED` pills. |
| 9.18 | Replaced action items list-with-saved-views (1037 lines) with kanban + filterable backlog: top row is one column per active advisor (active=true) keyed by `advisor.id`, populated by `item.owner === advisor.email`; backlog list filterable by Timeline + Client; "Show completed" toggle reveals a 4th read-only column. |
| 9.19 | Added @dnd-kit drag-and-drop. Cards draggable from kanban or backlog; sticky bottom bar slides up with two drop zones (Complete + Backlog). Optimistic UI with snapshot rollback on error. Pointer sensor distance:5 preserves onClick. Lifecycle hooks (Phase 5d spawn / auto-close) toasts unchanged. |

## Action items architecture (post-9.19)

```
src/app/(app)/action-items/
├── page.tsx              Server: fetches advisors (active=true), clients, all action_items
├── _KanbanView.tsx       Client: DndContext root, owns items state + filters + drawer
├── _ActionCard.tsx       Visual card (forwardRef so DnD wrapper can attach)
└── _DropZoneBar.tsx      Sticky bottom bar with two useDroppable zones
```

### Owner-shape decision (kept email matching)

`action_items.owner` is a non-nullable string. Stage 3a writes
**advisor email** for advisor-owned items and literals like `client` /
`cpa` / `attorney` for non-advisor owners. The kanban matches columns
by `item.owner === advisor.email`; advisor.id is only the React key.
Drag onto an advisor column PATCHes `{ owner: advisor.email, status:
'in_progress' }`.

The brief originally specified `owner: advisor_id`. Switching would
require a schema migration plus a Stage 3a system-prompt update so
prior plan items stay aligned with the new column. Deferred to v1.5
unless a multi-advisor dataset surfaces a need.

### Backlog drop semantics (status only, owner unchanged)

The brief specified `PATCH owner: null` on the backlog drop. The
schema doesn't permit null `owner`, so the implementation PATCHes
**status: 'not_started' only** — the item leaves any in_progress
kanban column and joins the backlog list, but its assignment is
preserved as historical context. To support a true "unassign" on
drop, make `owner` nullable in the migration.

### Optimistic-UI pattern

Drag end:
1. Snapshot current `items` array.
2. Apply optimistic patch locally (status, owner if assigning, stamp
   `completed_at` if completing).
3. PATCH `/api/action-items/[id]`.
4. On success: replace the local row with the server's authoritative
   response (covers `updated_at`, definitive `completed_at`, etc.).
   Append any `spawned_reminders` so they appear in the kanban
   immediately; toast `auto_closed_reminders` count.
5. On error: restore the snapshot + toast the error.

No-op detection short-circuits before any state change when dropping
onto a target whose patch matches the item's current state.

# Phase 9.20: always-visible note composer

`/notes` ditches the dialog/inline-toggle "+ New Note" button in
favour of a persistent composer at the top of the page. Mid-day
capture flow:

- Inline client picker (required) + auto-grow textarea + tag chips
  (call / email / meeting / review) + "Convert to action item"
  checkbox + Save button.
- ⌘/Ctrl+Enter from inside the textarea submits; Shift+Enter inserts
  a newline (the default textarea behaviour, intentionally not
  intercepted).
- Optimistic UI: the new note appears at the top of the feed
  immediately with a `temp-…` id. After `api.notes.create` resolves,
  the temp id is swapped for the server's authoritative row. On
  failure the optimistic placeholder is removed + an error toast
  fires.
- Convert-to-action-item: when the checkbox is on, after the create
  succeeds the composer fires `api.notes.promoteToAction(id, …)` with
  quick-defaults (`category: "ENGAGEMENT"`, `duration_class:
  "one_time"`, `timing_bucket: "this_week"`, `owner: <current advisor
  email>`). Phase 5d lifecycle hooks fire on the server-side promote.
- Slide-in animation on freshly-saved notes uses
  `tw-animate-css`'s `animate-in slide-in-from-top-2 fade-in
  duration-300` utilities. The id is tracked in a `freshIds` set on
  the parent for one second so re-renders don't loop the animation.

Schema notes flagged for v1.5:

- `notes.tag` is `string | null` — single-tag in this iteration. The
  composer's chip row toggles a single value (clicking the active
  chip clears it). Multi-tag would need `tags string[]` or a join
  table.
- The chip row's labels (`call` / `email` / `meeting` / `review`) are
  new short values; existing notes saved with the older
  `client_meeting` / `phone_call` / `partner_touchpoint` values still
  render fine in the feed via `TAG_LABEL` fallthrough.

The retroactive Promote-to-action dialog is preserved unchanged for
older notes saved without the composer's toggle.

# Phase 9.21: sign-in modern-glass-v2 variant

Hayden promoted `modern-glass-v2` (`sp-mglass2`) as the new default
sign-in design in Claude Design, replacing `split` (`sp-classic`).
Diff scope: a one-line change in `app.jsx` (`signinVariant` value);
all `styles.css` and view-`*.jsx` files unchanged. The `Axiom.html`
diff was a build-artifact swap (OLD had inlined Babel-compiled JS,
new is the 47-line source skeleton) — no production-code implication.

What landed:

- `public/psa-logo-full-white.png` — copied from
  `specs/design/claude-design-source/assets/`. Kept as PNG, not
  converted to webp.
- `src/app/(auth)/sign-in/sign-in.css` — scoped CSS file pasting the
  `.sp-mglass2__*` block (~225 lines) verbatim from
  `specs/design/claude-design-source/styles.css` lines 2725–2960.
  Two token renames applied: `var(--font-serif, Georgia, serif)` →
  `var(--font-display)`, `var(--text-1)` → `var(--text)`. All other
  tokens already exist in `src/styles/design-tokens.css`.
- `src/app/(auth)/sign-in/page.tsx` — rewrite. Two-pane structure
  preserved; left panel adds animated mesh + grid + the PSA full
  logo (next/image, clamp 340–520px); right panel renders the
  frosted glass card containing the form. The Axiom wordmark moved
  to top-right. "PSA · ADVISOR OS · 2026" mono caption renders at
  the bottom of the left panel.
- `src/app/(auth)/sign-in/sign-in-form.tsx` — rewrite. Replaced the
  shadcn `Form` / `Input` / `Button` stack with a bare `<input>` +
  sibling `<label>` (the floating-label CSS in sign-in.css drives
  the `:focus + label` and `.is-filled label` transitions; the
  shadcn primitives can't surface those state hooks cleanly). Title
  ("Welcome back." / "Check your inbox.") moved into the form
  because the text varies by sent-state.

Decisions kept from prior phase:

- "Continue to dashboard" arrow CTA in the sent-state is **dropped**
  (the source mockup includes it; production users click the email
  link rather than an in-app shortcut). Sent-state shows the green
  check confirmation row + ghost "Use a different email" button
  only.
- Empty `<span className="sp-mglass2__chip mono"></span>` placeholder
  from the source is dropped entirely (it renders blank).

Why a scoped CSS file rather than inline-styles:

The new variant has features that don't translate cleanly to inline
styles: `:focus + label` sibling selector, keyframe animations
(`spMglass2Drift`, `spMglass2In`), `mask-image` on the grid overlay,
`::before` halo on the logo wrap, hover transitions. Pasting the
class definitions verbatim keeps the production CSS 1:1 with the
design source — future tweak diffs land directly without
translation. Class names mirror Claude Design's source so a future
Phase 9.x diff against `view-notes-signin.jsx` stays readable.

Smoke: `tsc --noEmit` clean, `npm run build` clean (36 routes,
including `/sign-in`). Vercel auto-deploys on push to main.

# Phase 9.22: mock data cleanup

Production state pre-cleanup (queried via service role): 2 clients
(Holloway + Burke), 7 action items, 3 notes, 3 partners, 1 plan, 1
advisor. The "7 mock households" assumption from the brief was
wrong — Vance / Okonkwo / Sterling / Mireles never lived in the DB;
"Vance Family" was a static fixture in `src/lib/api/_mocks.ts` from
Phase 4 Step 3.

What landed:

- **`scripts/cleanupMockData.ts`** — idempotent, re-runnable cleanup.
  Default mode is dry-run (SELECT only); `--apply` flag executes
  DELETEs. Connects via service-role key (bypasses RLS), takes a
  pre-snapshot, lists each client and its cascading child counts,
  and deletes every household whose name doesn't start with
  "Holloway". Safety guard: aborts if zero clients match the keep
  prefix.

- **Cleanup applied** — Burke Family (`11111111-1111-1111-1111-000000000002`)
  deleted along with the 2 cascading rows (1 action item, 1 note).
  Cascade configured by migration 0001 (`clients` → all child tables
  ON DELETE CASCADE). Total destructive scope: 3 rows.

- **`src/app/api/dev/seed/route.ts`** — Burke removed entirely
  (constants, clients upsert row, action item, note). `/api/dev/seed`
  now only seeds Holloway. Re-running it post-cleanup will not
  reintroduce Burke. Counts in the response updated (clients 2→1,
  action_items 6→5, notes 3→2).

- **`src/lib/api/_mocks.ts`** — `MOCK_CLIENT_PROSPECT` (Burke) and
  `MOCK_CLIENT_INACTIVE` (Vance) constants removed; `LIST_CLIENTS`
  now contains only `MOCK_CLIENT_HOLLOWAY`. The 2 Burke action items
  (mock-ai-019, mock-ai-020) and 2 Burke notes (mock-note-004,
  mock-note-005) referencing the removed constant were also pruned.
  Only consumer outside the file is `lens-runs/generate/route.ts`,
  which validates `client_id` against `MOCK_CLIENTS_BY_ID` — that
  endpoint is "🪛 mock — Phase 5c" deferred and uses Holloway's
  string-id ("mock-client-holloway") rather than the real UUID, so
  it was already a stub against production callers.

Production state post-cleanup: 1 client (Holloway), 6 action items,
2 notes, 3 partners, 1 plan, 1 advisor. Idempotency confirmed by a
2nd dry-run reporting "Nothing to delete — already clean".

Hayden's advisor record untouched. `auth.users` untouched. Audit-log
rows referencing deleted Burke entity_ids remain (audit_log uses a
polymorphic `entity_id` with no FK; intentional — history outlives
data).

# Phase 10B: full Stage 0 → 5 pipeline wired into production

v1 production pipeline shipped Stage 3a → 4 → 5 only. Advisors had to
hand-author the ClientProfile + SelectedRecommendations JSONs and
upload them as pipeline INPUTS — but those files are pipeline OUTPUTS,
not advisor inputs. v1.5 closes the gap: advisors upload a Fact Review
(.docx or .pdf), and the orchestrator runs the entire chain
end-to-end.

## Submission

`/plans/generate` accepts a Fact Review file by default; the
ClientProfile / SelectedRecommendations file pickers are demoted to a
collapsible "advanced" fallback (kept for re-running plans where the
upstream parses are already on disk).

`POST /api/plans/generate` is **dual-mode** and dispatches by which
form fields are present:

| Mode | Trigger | Server-side actions |
| --- | --- | --- |
| FR mode (default) | `fact_review` File field present | Run Stage 0 preflight against /tmp/. On `failed` → 422 with `error.details = stage0Result.failures`. On pass → insert plans row, upload to `plan-inputs/{id}/fact_review.{ext}`, set `input_fact_review_path`. |
| JSON fallback | `clientprofile` + `selected_recommendations` File fields present (and no `fact_review`) | Validate via Zod, insert plans row, upload to `plan-inputs/{id}/{name}.json`, set `input_clientprofile_path` + `input_selected_recs_path`. CLI will skip Stages 1 + 2. |

Stage 0 422 errors (validation failures) render as a red bullet list
on the form with humanized check labels + remediation callouts;
client + filename selection are preserved across the failure roundtrip.

## CLI chain

`npm run generate-pending` (script: `scripts/generatePending.ts`)
claims the oldest queued plan and runs the appropriate chain:

| Mode | Stages |
| --- | --- |
| FR upload | Stage 0 (re-validate; diagnostic) → Stage 1 → Stage 2 → Stage 3a → Stage 3b (assemble, sanity check) → Stage 4 → Stage 5 |
| JSON fallback | Stage 3a → Stage 3b → Stage 4 → Stage 5 (Stages 1 + 2 skipped) |

Stage 3b is purely deterministic (no LLM). It builds a SequencedPlan
from the QR + selectedRecs, catching dependency cycles before Stage 4
fires. Stage 4 reads QR directly (not the SequencedPlan); the 3b pass
is a sanity gate, not a data feed. This preserves the v1 Stage 4
input contract.

## Per-stage budget caps

```
STAGE_BUDGET_CAPS = { stage1: 500, stage2: 1000, stage3a: 3000,
                     stage4: 2500, stage5: 500 }    // cents
TOTAL_CAP_PER_RUN_CENTS = 15000                     // $150
```

Each stage is gated twice: **pre-flight** (would the next stage even
fit under the per-run cap?) and **post-flight** (did the stage's
actual cost breach its own cap?). On any breach, the stage's output
(success or failure envelope) is persisted to JSONB + Storage before
`markFailed` flips status='failed'. Cumulative cost is seeded from
`plans.cost_cents` at claim time so a re-claim after a partial failure
can never burn 2× the cap.

## Skip-on-cache

Each stage checks if its output is already persisted before firing:

- **Stage 1**: `plans.stage1_output` JSONB column.
- **Stage 2**: `plans.input_selected_recs_path` Storage path.
- **Stage 3a**: `plans.stage3a_output` JSONB column.

Re-claiming a plan after a partial failure (e.g., Stage 4 failed)
skips already-completed Stages 1/2/3a and resumes at the failed point.
Idempotent.

## DB migration 0004

Adds `plans.input_fact_review_path text` (nullable). Existing rows
(Holloway's v1 plan) leave it NULL — historical state preserved.
The migration is **manual** in v1.5: paste
`supabase/migrations/0004_input_fact_review_path.sql` into the
Supabase Dashboard SQL editor (the JS service-role client cannot run
DDL). Verifier: `tsx scripts/applyMigration0004.ts` reports column
status + prints SQL on miss.

## PDF support

`pdf-parse` 1.1.4 added; `factReviewIO.extractFactReviewText`
dispatches by file extension:

- `.docx` → `mammoth.extractRawText` (preserves the v1 path that
  produced the Holloway baseline).
- `.pdf`  → `pdf-parse`, imported via `pdf-parse/lib/pdf-parse.js` to
  skip the package's index.js smoke-test side effect on require.

Image-only / scanned PDFs return empty text + a warning; Stage 0's
file_integrity check then fails on text length. OCR is out of scope.

## Advisor identity

`generatePending.ts` no longer hardcodes `"will-bearden"`. The CLI
queries the `advisors` table for the row matching
`plans.generated_by_advisor_id`, then slug-matches `${first_name}-${last_name}`
to a known KB advisor_id (`hayden-duffield`, `will-bearden`,
`third-advisor-placeholder`). Falls back to `"hayden-duffield"` when
the slug doesn't match.

## Stage 3a `_sequencer_status` SUCCESS sentinel

Stage 3a orchestration now explicitly stamps `"SUCCESS"` on the clean
path (was undefined). Type widened to `"SUCCESS" | "FAILED" | undefined`.
External runners can now detect status from a single field.

## UI sub-stage progress

`/plans/[id]` derives finer progress when `status='processing'`:

| stageN_output state | Sub-stage label |
| --- | --- |
| stage1_output null + FR path | "Parsing Fact Review" |
| stage1_output set, stage3a null | "Selecting recs / Quantifying" (or "Quantifying" in JSON fallback) |
| stage3a set, stage4 null | "Generating plan body" |
| stage4 set, stage5 null | "Auditing" |

Pulse animation on the status dot for 'processing'. Failed banner
surfaces last stage reached + cumulative cost + a re-claim hint.

## Local E2E test

`npm run test:integration:e2e` runs the full Stage 0 → 5 chain against
`tests/fixtures/Holloway_Fact_Review_FILLED.docx` using the same
per-stage caps. No DB / Storage; outputs land in
`artifacts/integration_v2/`. Manifest at
`artifacts/integration_v2/manifest.json` summarizes per-stage status /
cost / duration plus cumulative totals.

## Expected first live test cost

~$23–$38 per plan, ~25–40 min wall-clock. Per-stage approximations
(Holloway scale):

| Stage | Cost | Wall-clock |
| --- | --- | --- |
| 0 | $0 | <1s |
| 1 | $1.50–$3 | 2–3 min |
| 2 | $3–$7 | 3–5 min |
| 3a | $10–$15 | 12–18 min |
| 3b | $0 | <1s |
| 4 | $8–$10 | 4–6 min |
| 5 | $1–$3 | 2–3 min |

# Phase 10C: v1.5 production hardening

First production live test surfaced two issues the local Holloway E2E
didn't catch.

## Vercel KB bundling (10C.1)

Stage 0 reads `kb/v1_2/02_reference/08_volatile_rates_lookup.md` at
runtime. Next.js's nft tracer doesn't see this dynamic readFile path
(constructed at runtime, not statically imported), so kb/ was excluded
from the serverless bundle. Vercel returned "file unreadable" against
`/var/task/kb/...` on cold start.

Fix: `next.config.ts` declares `outputFileTracingIncludes` mapping
`/api/plans/generate` → `./kb/v1_2/**/*`. Build trace manifest
(`route.js.nft.json`) now lists kb/ entries; total bundle weight ~1.2 MB,
well under Vercel's 50 MB function ceiling.

The CLI (`npm run generate-pending`) runs on Hayden's laptop with the
repo cwd, so it never hit this. Only Vercel-side reads (Stage 0
preflight in the API route) needed the bundling hint.

## Stage 0 permissive matching (10C.2)

Real PSA Fact Reviews don't always use the exact "Section 3 / Entities"
header or "Primary Owner Name" label. Stage 0's strict matching blocked
real-world documents.

Hybrid approach:

1. **Expanded deterministic alternative lists** — broadened
   REQUIRED_SECTIONS, OWNER_NAME_LABELS, ENTITY_NAME_LABELS, and
   ARCHETYPES to cover real-world wording (business / company /
   operating entities for entities; exit / liquidity / succession for
   transaction posture; Husband Name / Wife Name / Member 1-2 for
   names; "transaction posture:" / "archetype:" loose archetype
   markers).
2. **Haiku 4.5 LLM fallback** — `validateFactReview` accepts an
   optional `apiClient`. When deterministic matching leaves any
   section/owner/entity/archetype unresolved, fires a single Haiku
   call asking it to identify still-missing items semantically + extract
   field values (constrained to the 5 KB archetype enums). Cost
   ~$0.01–$0.05 per fallback; hard cap $2/run.

Call sites updated to inject the Anthropic client:
- `src/app/api/plans/generate/route.ts` (production preflight; falls
  back to deterministic-only if `ANTHROPIC_API_KEY` is absent).
- `scripts/generatePending.ts` (CLI re-validation passes existing
  client through).
- `scripts/testIntegrationE2E.ts` (E2E test).

Failure messaging now lists the first 8 alternative labels Stage 0
actually looked for, plus a fallback pattern hint ("…or include the
owner's name on a single line as 'Name: <Full Name>'"). Advisors can
fix the FR by adding ONE explicit label rather than rewriting
headers.

Stage 1's ClientProfile schema enforces archetype enum + required
fields downstream — Stage 0 misses that get through here surface as
clean Stage 1 schema validation failures. The right boundary: Stage 0
= format check, Stage 1+ = data correctness.

All 4 existing Stage 0 unit tests pass unchanged (deterministic path
handles Holloway cleanly; Haiku fallback never fires for it).

# Phase 10D: Stage 0 architectural rethink + KB inlining

Phase 10C made Stage 0 more permissive but kept it as a strict gate.
Real-world Fact Reviews from PSA still failed on archetype detection,
and Vercel's `outputFileTracingIncludes` hint for the kb/ directory
turned out not to be reliably honored at runtime. Phase 10D reframes
Stage 0 entirely.

## Stage 0 is a diagnostic checkpoint, not a gate (10D.1)

Hard fail (block submission with 422):
  - **file_integrity** only — file unreadable, empty extraction,
    suspiciously short text (<2000 chars), corrupt format, password-
    protected, image-only PDF without OCR.

Soft warnings (proceed to queue with 202):
  - **required_sections_present** — heuristic header miss
  - **required_field_markers** — owner/entity/archetype label miss
  - **volatile_rates_freshness** — >30 days stale (no longer ever
    fails; was a hard fail at >45 days)
  - **content_hash** — runtime safety; warning if hashing fails

Stage 1's LLM parser already has explicit guidance for inferring
archetype from context when not labeled, and reads the whole document
to extract content semantically — section heuristic misses are recovered
there. If Stage 1 also can't recover, the failure surfaces cleanly at
Stage 1's ClientProfile schema validation with precise diagnostics. The
right boundary: Stage 0 = format check, Stage 1+ = data correctness.

`POST /api/plans/generate` returns 202 with a `stage0_warnings: string[]`
field on the response body. The form's success state renders warnings
as a yellow informational notice above the plan-id detail block, with
copy: "Stage 0 noted N concerns. Pipeline will proceed; check the
generated plan for accuracy. Stage 1's LLM parser is robust enough to
recover from heuristic misses." The plan still queues regardless.

## KB volatile rates inlined (10D.2)

Stage 0's freshness check no longer reads
`kb/v1_2/02_reference/08_volatile_rates_lookup.md`. Instead it imports
from `src/lib/orchestrator/data/volatileRates.ts`, an inlined
`VOLATILE_RATES` snapshot containing the active month, current §7520
rate, last-refreshed ISO date, §7520 history, and the §382 long-term
rate.

No filesystem readFile, no kb/ path resolution at runtime, no
serverless bundling dependency. Stage 3a's CLI-side LLM context still
loads the markdown file (it runs on Hayden's laptop with the repo cwd,
so no issue).

Refresh procedure:
  1. On the 19th of each month, pull the new IRS Rev. Rul. rates.
  2. Update BOTH the KB markdown AND
     `src/lib/orchestrator/data/volatileRates.ts`.
  3. Bump `last_refreshed_iso`. The 30-day soft-warning threshold
     gates against this date.

## Stage 0 unit tests

Test count grew to 5:
  1. Holloway fixture passes
  2. Nonexistent file fails on file_integrity
  3. Empty/invalid file fails on file_integrity
  4. Stale volatile rates yield warning (never fail) — exercises the
     30-day, 60-day reference-date paths against the inlined constant.
  5. Stage 0 only fails on file_integrity — explicit guard that
     section / field misses don't trigger failure.

# Phase 11: Client management UI complete (Edit + Archive + Restore)

Backend client CRUD has been fully wired since Phase 5a (the
api.clients.* methods). v1.5 surfaces Edit, Archive, and Restore in the
UI for the first time. Client management is now end-to-end clickable.

## Three new Client Components

All under `src/app/(app)/clients/[id]/`:

- **`_ClientEditDialog.tsx`** — opens from a new "Edit" button in the
  detail-page header. Pre-fills from the current client record;
  fields: household_name / archetype / status (active|prospect only) /
  lead_advisor_id / notes. No-op short-circuit: buildPatch() compares
  each form value to the incoming client and only includes changed
  keys in the PATCH body. If nothing changed, API call is skipped and
  a toast.info("No changes to save.") fires. Status="inactive" is
  deliberately excluded from the dropdown — the dedicated Archive
  flow owns that transition with its typo-confirm guard.

- **`_ClientArchiveDialog.tsx`** — opens from a red-toned "Archive"
  button. Modal shows AlertTriangle icon + body explaining the
  soft-delete semantic. **Typo-confirm guard**: the destructive button
  stays disabled until the user types the household name verbatim
  into a confirmation input. Prevents accidental archives from a
  misclicked button. Submit fires `api.clients.softDelete(id)` (which
  the route translates to `UPDATE clients SET status='inactive'`); on
  success, toast + `router.push('/clients')` so the advisor lands in
  a coherent state.

- **`_ClientRestoreDialog.tsx`** — opens from a primary "Restore"
  button visible only when `client.status === 'inactive'`. Single
  confirmation prompt (no typo guard — non-destructive). Submit fires
  `api.clients.update(id, { status: 'active' })` and
  `router.refresh()` so the detail page renders without the
  archived treatment immediately.

## Detail-page header reshaping

`_ClientDetailView.tsx` derives `isArchived = client.status === "inactive"`
and branches the header button cluster:

- **Active / prospect:** Edit + Archive + (existing stub buttons:
  Note + Item + Generate plan)
- **Archived:** Restore (only)

When archived: the entire page renders at opacity 0.85 + an "ARCHIVED"
slate pill renders next to the household-name h1 in the page head.

## List-view filter integration

`_ClientsView.tsx`:

- "Inactive" status chip relabeled to "Archived". Same DB value, clearer
  surface label. The `statusBadge()` helper also surfaces "Archived" for
  any inactive row.
- **Default-hide behavior**: the "All" status filter now excludes
  archived clients. Archived rows only appear when the "Archived" chip
  is explicitly selected. Matches CRM convention — archived is
  reachable but doesn't clutter the working view.
- "All" chip count = active + prospect; "Archived" chip count =
  status='inactive' rows.
- Archived rows in the table render at opacity 0.65 when the Archived
  filter is selected — visually deprioritized. Click-row still
  navigates to the detail page where the user can hit Restore.

## Server data flow update

`page.tsx` for `/clients/[id]` now fetches the active advisor list in
parallel with the existing six-table query (clientRes / plansRes /
actionItemsRes / notesRes / partnersRes / lensRunsRes + advisorsRes).
The advisors prop threads through `_ClientDetailView` →
`_ClientEditDialog` to populate the lead-advisor dropdown.

## Schema gaps deferred to v1.5+

The Phase 11 brief mentioned `aum`, `entity_count`,
`last_activity_at` columns and Family-Office / Pre-Liquidity-Founder
archetype enums. The clients-table schema only has `archetype enum
('PRE','MID','POST','NONE')` and lacks those numeric columns. The
Edit form matches the schema as-is; expanding the form requires a
DB migration first.

# Phase 11.5: Hide archived clients' related data app-wide

Phase 11 added the archive flow at the client level. Phase 11.5
extends the same default-hide semantic to every surface that displays
client-related data, so archiving a client genuinely declutters the
working view (not just the clients list).

## Pattern across the affected surfaces

Server-side query-time filtering. Each affected page.tsx pre-fetches
the clients table with status, derives `activeClientIds` (status !=
'inactive'), and threads `.in("client_id", activeClientIds)` into the
related queries. No archived data leaves the database for the default
view.

URL search params drive the toggle: `?archived=1` re-runs the page
with the looser filter. The toggle Chip in the page-head/filter row
calls `router.replace(pathname?archived=1)` to flip state, so the
toggle is bookmarkable and shareable.

Display layer: when archived data IS rendered (toggle on), cards /
note rows render at opacity 0.65 to read as deprioritized.

## Per-surface differences

| Surface | Toggle | Composer dropdown | Visual |
| --- | --- | --- | --- |
| `/action-items` | "Include archived" Chip in page head | n/a (no compose flow here) | ActionCard.archived → opacity 0.65 |
| `/notes` | "Include archived" Chip in filter row | always active+prospect only (composerClients prop separate from feed clients) | NoteCard.archived → opacity 0.65 |
| `/dashboard` | none — clean working view | QuickCompose only sees active+prospect (passed clients are pre-filtered) | n/a (archived never rendered) |
| `/clients/[id]` | n/a — explicit archived-client view shows all that client's data | n/a | page-level treatment from Phase 11 |

## Composer dropdowns

Notes composer + dashboard QuickCompose both restrict their client
dropdown to **active + prospect only**, regardless of toggle state.
You don't add new notes to an archived household — the workflow
itself is gated on the client side.

## Edge cases handled

- Empty `activeClientIds` set: queries pass `["__none__"]` so the
  `.in()` clause stays well-formed and matches nothing rather than
  matching everything.
- Lookup maps: NotesView's `clientById` consumes the FULL clients
  list (including archived) so `clientById.get(n.client_id)` resolves
  correctly when the toggle is on and archived clients' notes appear.
  `composerClients` is a separate prop passed to the composer with
  active+prospect only.
- Action item lifecycle (Phase 5d spawn / auto-close hooks): unchanged.
  The archived filter only affects which items render, not how they
  behave when transitioned.

# Phase 12: web sign-in migrated from magic-link to OTP code

Corporate-email URL prefetchers (Microsoft Safe Links, Mimecast, Google
Workspace's link-warming) consume the one-time code embedded in
Supabase magic links *before* the user clicks. Three @psawealth.com
accounts hit this in production. The fix is the same flow mobile has
used since Phase 7: ship the 6-digit code in the email body and verify
it via `verifyOtp` instead of `exchangeCodeForSession`.

## User flow

1. User enters email on `/sign-in` → form transitions to step 2.
2. Email arrives with a 6-digit code (lives in the Magic Link
   template's `{{ .Token }}` rendering — no link click required).
3. User types the code into a single large input on the still-open
   `/sign-in` tab (numeric inputmode for mobile keyboards).
4. `verifyOtp({ email, token, type: 'email' })` succeeds → session
   cookie set → full-page navigation to `/dashboard` lets `proxy.ts`
   read the new cookie cleanly.

## Supabase API shape

- Send: `signInWithOtp({ email, options: { shouldCreateUser: false } })`.
  **No `emailRedirectTo`** — its presence is what flips Supabase from
  OTP-code mode to magic-link mode. Omitting it requests the code.
- Verify: `verifyOtp({ email, token: code, type: 'email' })`.
- Resend: same `signInWithOtp` call; client enforces a 60-second
  cooldown on the Resend button to keep clear of Supabase's per-email
  rate limit.

## Backward compatibility

`src/app/auth/callback/route.ts` is **kept** as a legacy fallback. Any
magic link already sitting in someone's inbox (or from a surface that
re-opts into `emailRedirectTo`) still exchanges the code via
`exchangeCodeForSession`. The route is no longer the primary path; the
file's header comment reflects this.

No changes to: `advisors` table, `auth.users`, RLS policies,
`is_active_advisor()`, `proxy.ts`. Only the form and its CSS shifted.

## Email template

Supabase Dashboard → Auth → Email Templates → Magic Link. The default
template renders both a link and `{{ .Token }}`; the OTP code path
needs `{{ .Token }}` to be visible. Polishing the template (PSA
branding, removing the link block, etc.) is deferred to v1.6.

## Rate limits unchanged

3/hour per email + 30/hour project-wide (Supabase defaults). The
client-side 60s Resend cooldown reduces accidental hits but doesn't
change the server-enforced limits.

## Files touched

- `src/app/(auth)/sign-in/sign-in-form.tsx` — two-step state machine,
  preserves Phase 9.21 sp-mglass2 styling.
- `src/app/(auth)/sign-in/sign-in.css` — added `.sp-mglass2__code`
  (large monospace input, letter-spacing 0.5em) + `.sp-mglass2__row`
  (two-button cluster for "Use a different email" + "Resend code").
- `src/app/auth/callback/route.ts` — header comment update, no logic
  change.

# Phase 13: Cash Flow Lens v1

First of four lens generators in the v2 vision. The advisor inputs a
client's cash-flow data via fixed fields (NOT another doc upload), the
system models the resulting distribution + tax bill across three
treatments, and Claude Haiku 4.5 generates allocation suggestions and
year-by-year action recommendations on demand. Recommendations push
into `action_items` with `source_lens_run_id` for traceability.

## Schema (migration 0005)

No new table — cash-flow lens data lives in the existing `lens_runs`
table with `lens_type='cash_flow'` and the full state in `output`
JSONB. Migration 0005 adds two utility columns to `lens_runs`:

- `updated_at timestamptz` (with `update_updated_at()` trigger) — bumps
  on each PATCH so the per-client list sorts by most-recently-touched
- `archived_at timestamptz` — stamped when status transitions to
  `archived` (soft delete; row is preserved)

The `lens_runs.status` enum (already `'draft' | 'approved' | 'archived'`
from migration 0001) maps cleanly to the spec's "draft / finalized /
archived" lifecycle.

**Apply manually**: `supabase/migrations/0005_cash_flow_lens.sql` via
Supabase Dashboard SQL editor. Verifier:
`tsx scripts/applyMigration0005.ts` reports column status + prints SQL
on miss. Idempotent.

## Canonical types + pure helpers

`src/lib/api/cash_flow_lens.ts` owns:

- `CashFlowLensOutput` — JSONB shape. All money in cents (integers, no
  float drift). All allocation %s as 0..100 integers. Growth rates as
  decimal (0.07 = 7%). `schema_version: 1` sentinel for future migrations.
- `BUCKET_PRESETS` — five starter buckets: 401(k), Roth IRA, Brokerage,
  Whole Life Insurance, Annuity. Custom buckets get `preset_id: null`
  and the advisor picks `tax_treatment` manually.
- `defaultCashFlowOutput()` — seeds a new lens with all five preset
  buckets, three time horizons (5y / 10y / At Retirement), and standard
  growth-rate / tax-rate assumptions.
- Pure calculation helpers: `netIncomeAnnualCents`,
  `emergencyFundTargetCents`, `availableMonthlyAllocationCents`,
  `projectBucketBalanceCents` (FV with monthly contributions over n
  years), `currentTaxMix` / `projectedTaxMixAtRetirement` (by
  tax-treatment center-of-mass), `annualRetirementTaxBillCents`
  (simplified federal+state+capital-gains model),
  `buildYearlyDistribution` (30-year inflated drawdown bar-chart data),
  `cumulativeTaxSavingsCents` (current-mix vs recommended-mix delta).

## API surface

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/lens-runs/cash-flow` | POST | Create new draft (returns the row) |
| `/api/lens-runs/cash-flow/[id]` | PATCH | Full output JSONB replace (validates `schema_version: 1`) |
| `/api/lens-runs/cash-flow/[id]/finalize` | POST | draft → approved |
| `/api/lens-runs/cash-flow/[id]/suggest-allocation` | POST | Haiku 4.5 alloc rec |
| `/api/lens-runs/cash-flow/[id]/generate-recommendations` | POST | Haiku 4.5 distribution recs |
| `/api/lens-runs/cash-flow/[id]/push-action-items` | POST | Insert checked recs into `action_items` |
| `/api/lens-runs/[id]/archive` | POST | Soft-delete (any lens type) |
| `/api/lens-runs/[id]/pdf` | GET | Dispatches to `CashFlowLensDocument` for cash_flow type |

Existing list endpoint `GET /api/clients/[id]/lens-runs` is unchanged
and naturally surfaces cash flow lenses.

Auth: every handler calls `requireAdvisor()` for defense in depth.
Service-role bypass not used; advisors directly mutate via session
cookie.

PATCH only accepts mutations on draft-state lenses. Restoring an
approved lens to draft is a v1.5 deferral.

## AI suggestion flow (Haiku 4.5)

Two on-demand calls. Both persist their result back into the
`ai_suggestions` field of the lens output JSONB so the UI can
re-render without re-rolling on every navigation.

- **Suggest allocation** (Section H of Input tab): given current
  buckets + goals + assumptions + available monthly cash, returns
  whole-percentage allocation per bucket with a 1-2 sentence
  reasoning. Sum to exactly 100. Renders alongside the manual
  allocation inputs as an advisory column — never auto-applies.
  Cost: ~$0.01-$0.05 per call (1500 max output tokens).

- **Generate recommendations** (Distribution Plan tab): given current
  bucket balances + slider state + tax-rate assumptions, returns 3-8
  sequenced action items ("Year 1: Convert $X from 401(k) to Roth";
  "Years 1-5: Backdoor $7K/yr") with year, action, estimated tax
  impact (negative = savings), reason. Cost: ~$0.05-$0.20 per call
  (3000 max output tokens). Generated only on explicit button click —
  not slider-debounced — to keep cost in advisor's hands.

Cost cents accumulate on `lens_runs.cost_cents` per call. No hard cap
in v1; advisor monitors via the header pill.

## Pages + tabs

`/clients/[id]/lens-runs/cash-flow/[runId]` — single Server Component
page hands off to `_CashFlowLensView` (Client). Tabs:

- **Input** — only visible while `status='draft'`. 9 sections (A
  Client info, B Income & expenses, C Goals, D Emergency fund, E Time
  horizons, F Assumptions, G Buckets, H Allocation with AI button, I
  Save/Finalize). Manual save via "Save draft" button + auto-save when
  the Distribution tab moves a slider.
- **Hub** — navy header band + 5-stat metrics row, cream EF tracker
  with progress bar, white-center hub-and-spoke with Household icon →
  Financial Foundation pillar → numbered bucket cards. Tax-treatment
  colored tags. Per-bucket projection row uses the FIRST configured
  time horizon. Bottom cream summary band.
- **Tax Triangle** — side-by-side equilateral SVG triangles (Current
  vs After Recommendations); dot positioned via barycentric
  coordinates from (tax_free%, tax_deferred%, taxable%). Below: tax
  bill projection table (Year 1/5/10/20 of retirement) for each mix.
  Footer block surfaces 20-year cumulative tax differential (green =
  savings, amber = additional tax).
- **Distribution Plan** — three sliders (TF/TD/TX) auto-balance to
  total 100. KPIs (Year-1 savings, 30-year cumulative, Year-1 tax
  bill, Year-1 effective rate). SVG stacked bar chart over 30 years
  with tax-bill overlay line. AI recommendations list with
  default-checked checkboxes; "Push selected to action items" inserts
  into `action_items` with `category='CASH_FLOW'`,
  `source_lens_run_id`, owner = current advisor email,
  `timing_bucket` derived from the rec's year.

## Lens Runs tab integration

`/clients/[id]` Lens Runs tab now:

- Fetches lens runs with `status != 'archived'` filter (archived hidden
  by default; v1.5 may add a toggle).
- Surfaces a "+ New Cash Flow Lens" button that POSTs to
  `/api/lens-runs/cash-flow` and navigates into the new draft.
- Cash flow rows are clickable (navigate to detail page); other lens
  types remain passive (no detail page until Phase 5c).

## PDF export

`CashFlowLensDocument` (`src/lib/pdf/`) renders a 7-page sequence:

1. Cover (client + date + PSA branding).
2. Hub view (navy stat band, EF tracker, bucket-row list).
3. Tax Triangle — Current Allocation (SVG triangle + tax bill table).
4. Tax Triangle — After Recommendations.
5. Distribution Plan (year-by-year stacked bar chart).
6. Recommendations & Timeline (advisor-selected recs).
7. Disclosures.

Pre-export modal (`_PdfExportDialog.tsx`): advisor picks which layouts
to include + which recommendations. Selection encoded as query params
(`?include_hub=1&include_triangle=1&...&recommendation_ids=<csv>`).
Existing `/api/lens-runs/[id]/pdf` route now dispatches by `lens_type`:
cash_flow goes through `CashFlowLensDocument`, others fall through to
the existing `LensRunDocument` placeholder.

## Decisions made autonomously (v1)

- **One JSONB blob, not a normalized table**: spec said "use JSONB
  extensively for flexibility" — built around `lens_runs.output`
  rather than a dedicated `cash_flow_lenses` table to keep the
  existing list/detail wiring + RLS unchanged.
- **All money in cents (integers)**: no float drift on persistence
  round-trips. Conversion to dollars happens only at the presentation
  layer.
- **Slider behavior is proportional auto-balance**: when one slider
  moves, the other two scale by their existing ratio. Edge case (other
  two are both 0) splits evenly. Final pass re-normalizes for
  rounding.
- **Tax-bill model is intentionally simple**: ordinary income rate on
  tax-deferred withdrawals, capital gains × 50% on taxable (basis
  approximation), $0 on tax-free. Real bracket engine is v1.5+.
- **Compound growth assumptions are seeded but advisor-overridable**:
  defaults (7% taxable / 6% tax-deferred / 6.5% tax-free / 4%
  emergency-fund) match standard conservative planning. Sliders in
  Section F update the lens's `assumptions` JSONB directly.
- **AI calls are explicit-button only, never auto-fired**: spec
  considered debounce-on-slider but cost control wins; advisor decides
  when to spend.
- **Backlog drop semantics on action-item push**: `category='CASH_FLOW'`
  (uniform; no per-rec category inference). `owner` = current advisor's
  email. `timing_bucket` mapped from rec year (current = `this_week`,
  +1y = `next_30_days`, +2y = `next_90_days`, beyond = `this_year`).
  Phase 5d derivative-reminder logic does NOT fire on these inserts
  (no `auto_generated_reminder_template`, no `parent_action_item_id`).
- **Lens runs hide archived in default view**: parallels the Phase 11.5
  archived-clients pattern but at the lens-run level. Toggle to show
  archived deferred to v1.5.
- **Cost-cents tracking accumulates per-lens** in `lens_runs.cost_cents`
  across all AI calls. No per-lens hard cap in v1 (the build-time $10
  cap was self-imposed; not enforced at runtime).

## Smoke test scope

Programmatic checks performed:

- `npx tsc --noEmit` — clean.
- `npm run build` — full prod build: 44 routes compile (was 36 +
  8 new), TypeScript clean.
- HTTP smoke (`node fetch`) on key new routes — `/sign-in` 200,
  `/clients/.../lens-runs/cash-flow/...` 307 to sign-in (proxy gate),
  `/api/lens-runs/cash-flow` 401 (JSON; correct).
- Manual click-through against an authenticated session NOT done
  (autonomous build; AI testing self-budgeted to $0 for build phase).
  Production parity will surface on Vercel auto-deploy.

## v1.5 backlog created during Phase 13

- **Migration 0005 manual-apply step**: must run via Supabase Dashboard
  SQL editor before advisors can use the feature in production.
- **Bracket-aware tax engine**: v1 uses flat effective rates per
  treatment. A real bracket model (federal + Georgia state) would
  improve cumulative-savings estimates for high-income clients.
- **Re-open finalized lens**: PATCH currently rejects with 409 if
  status != 'draft'. Add an `unfinalize` endpoint that flips back to
  draft for advisors who want to iterate post-approval.
- **Lens-run cost cap**: a runtime guard analogous to plans'
  `TOTAL_CAP_PER_RUN_CENTS = 15000` that refuses further AI calls
  beyond a configured ceiling.
- **Per-rec category from AI**: instead of uniform `CASH_FLOW`, ask the
  recommendation prompt to emit a category per item (`ESTATE`,
  `INVESTMENT`, `INSURANCE`) so pushed action items align with the
  Stage 3a recommendation taxonomy.
- **Archive toggle on Lens Runs tab**: parallel to Phase 11.5
  notes/action-items toggle.
- **Slider-debounced AI (opt-in)**: a "live mode" toggle that fires
  `generate-recommendations` 2 seconds after the slider settles.
  Pre-set cost guard required.
- **Lens templating from previous lens**: "Duplicate from prior" so
  next-quarter or next-year cash flow updates start from the prior
  state instead of `defaultCashFlowOutput`.
- **Editable bucket-preset descriptions**: presets currently expose
  hard-coded descriptions; add an admin-only override UI in v1.6.
- **Push-back from action_items to lens**: when an advisor closes a
  pushed action item, surface that completion on the originating lens
  view.

# Phase 14: Estate Lens v1

Second of the four planned lens generators in the v2 vision (after
Cash Flow Lens, Phase 13). The estate lens models three interconnected
calculators for HNW estate planning:

  01. Estate Tax Projection — federal + state estate tax + cap gains
      drag on out-of-estate trust liquidation, year-by-year trajectory
  02. Trust Planning Calculator — compare a proposed Note Sale or Gift
      to a grantor trust against the no-planning baseline
  03. Tax Payment Strategy — funding the estate tax bill via cash, life
      insurance held out of estate, trust liquidation, or a mix

All math is **deterministic in the browser** — no LLM cost ($0 per
scenario). Cost cents stay at 0 on the lens_runs row.

## Math reverse-engineered from screenshots

**This is the highest-risk item from Phase 14.** Hayden did not provide
formula derivations — only screenshots of calculated outputs. The math
in `src/lib/estate-lens/calc.ts` was reverse-engineered from input ↔
output numerical relationships. Three mitigations are **MANDATORY** and
enforced on every output:

1. **Formula tooltips ("?")** — every calculated field renders an
   info icon that opens a popover showing the exact formula used.
   Implemented via `_atoms.tsx`'s `FormulaTooltip` + `OutputRow`.
2. **Compliance disclaimer** — `ComplianceFooter` renders on every tab
   and on every PDF page with the full PSA Wealth / MassMutual
   disclaimer plus: "Calculations are planning estimates only. Verify
   all figures with qualified tax counsel before client decisions."
3. **math.md derivation document** at `src/lib/estate-lens/math.md`
   explains every formula with IRC § / Rev. Rul. / Treas. Reg.
   citations. Advisors should review math.md BEFORE first client use.

## Schema (migration 0006)

No new table — estate-lens state lives in `lens_runs.output` JSONB
with `lens_type='estate'`. Migration 0006 only:

- Expands the lens_runs.lens_type CHECK constraint to include
  `'estate'` (alongside investment / insurance / cash_flow).
- Adds a partial index `lens_runs_estate_client_idx` on
  `(client_id, generated_at desc)` filtered on `lens_type='estate'`
  for fast per-client scenario lookups.

`src/lib/supabase/database.types.ts` is hand-updated to include
`'estate'` in `LensRunLensType`.

**Apply manually**: paste `supabase/migrations/0006_estate_lens.sql`
into the Supabase Dashboard SQL editor.

## State estate tax lookup

`src/lib/estate-lens/state-tax-table.ts` exports
`STATE_ESTATE_TAX_RATES`: a hard-coded `Record<state_code, {
rate_pct, exemption_amount, has_inheritance_tax, sources }>` covering
all 50 states + DC. As of 2026:

- **States with NO estate tax**: 37 states (FL, TX, NV, GA, etc.) →
  `rate_pct: 0`
- **States WITH estate tax**: CT, DC, HI, IL, ME, MD, MA, MN, NY, OR,
  RI, VT, WA — each entry shows the top marginal rate (12-20%) +
  exemption amount + source citation
- **Inheritance-tax-only states** flagged via `has_inheritance_tax`:
  KY, MD, NE, NJ, PA (IA repealed 2025). v1 does not compute
  inheritance tax math — flag only.

Refresh annually. State rates change frequently; verify against
the cited state DOR before client delivery.

## Canonical types

`src/lib/estate-lens/types.ts` — `EstateLensOutput`:

```
{ schema_version: 1, client_snapshot, scenario_name, scenario_description,
  assumptions, assets_out, planning_move, life_insurance, recommendations,
  ai_suggestions, pushed_action_item_ids, linked_to_main_plan, tracking_id }
```

`defaultEstateOutput()` seeds the screenshot defaults (Estate Today
$100M, Annual Spend $2M, Growth 7%, 30 years, Exemption $30M, etc.).
`tracking_id` is auto-generated CRN + YYYYMM + 7-digit sequence.

## API surface

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/lens-runs/estate` | POST | Create new draft scenario (auto-named "Scenario N") |
| `/api/lens-runs/estate/[id]` | PATCH | Full output JSONB replace |
| `/api/lens-runs/estate/[id]/finalize` | POST | draft → approved |
| `/api/lens-runs/estate/[id]/push-action-items` | POST | Insert checked recs → action_items |
| `/api/lens-runs/[id]/archive` | POST | Soft-delete (any lens type) |
| `/api/lens-runs/[id]/pdf` | GET | Dispatches to EstateLensDocument when lens_type='estate' |

Existing list endpoint `GET /api/clients/[id]/lens-runs` surfaces
estate runs naturally.

Auth: every handler calls `requireAdvisor()` for defense in depth.
PATCH only accepts mutations on draft-state lenses.

## Pages

`/clients/[id]/lens-runs/estate/[runId]` — Server Component fetches
the lens + client, hands off to `_EstateLensView` (Client). The view
owns output state + debounced auto-save (1500ms idle) + 3-tab nav
matching the screenshots:

- **01 ESTATE TAX PROJECTION** — 3-column: inputs (Estate Assumptions
  + Assets Out) / serif title + SVG trajectory chart / per-year
  outputs + navy/gold LI Need card
- **02 TRUST PLANNING CALCULATOR** — 3-column: Current State mirror
  + comparison chart / Note Sale / Gift toggle + planning move inputs
  + Trust Outputs / Aggregate Family Outcome comparison + gold
  FAMILY SAVES card
- **03 TAX PAYMENT STRATEGY** — 3-column: navy Tax Bill card + LI
  Plan / 4 payment-option comparison cards (CHEAPEST/MOST EXPENSIVE
  badges) / "Why not just invest?" rebuttal + mortality leverage
  chart + gold Recommended Strategy card

Plus the action-item recommendations panel below the 3 columns on
Tab 3 with "Generate defaults" + per-rec checkbox push.

## Shared atoms

`_atoms.tsx`:
- **`MoneyInput`** — cents-backed dollar input ($ prefix + comma format)
- **`PctInput`** / **`NumberInput`** — percent + integer inputs
- **`FieldLabel`** — uppercase mono eyebrow
- **`OutputRow`** — labeled read-only output with optional formula tooltip
- **`FormulaTooltip`** — "?" icon → popover with formula + note
- **`ComplianceFooter`** — disclaimer + tracking ID on every tab/PDF

## PDF export

`src/lib/pdf/EstateLensDocument.tsx` — 5-page React-PDF document:

1. Cover (client + scenario name + date + tracking ID)
2. 01 Estate Tax Projection (year-N output table + LI Need)
3. 02 Trust Planning Calculator (comparison table + Family Saves)
4. 03 Tax Payment Strategy (4 options + recommended + mortality)
5. (optional) Recommendations + Disclosures

Pre-export `_EstatePdfDialog.tsx` lets the advisor pick filename +
per-section toggle + recommendation checkbox. The PDF route at
`/api/lens-runs/[id]/pdf` dispatches by `lens_type`:

```
if (lens_type === 'cash_flow') → CashFlowLensDocument
else if (lens_type === 'estate') → EstateLensDocument
else → LensRunDocument (placeholder)
```

## Push to action items

Tab 3's `_EstateRecommendations.tsx` exposes "Generate defaults"
seeding 3-4 standard recs from the current planning move + LI state
(Execute Note Sale to IDGT / Acquire LI / Coordinate ILIT / Annual
Review). Each rec has a stable id; advisor checks the ones to push;
"Push selected to action items" calls
`api.lensRuns.estate.pushActionItems` which inserts into action_items
with `category='ESTATE'`, `source_lens_run_id=lens.id`, deterministic
timing_bucket derived from year_offset.

Idempotency: `pushed_action_item_ids` JSONB array tracks which rec
ids have been pushed. Re-clicking push skips already-pushed.

## Multiple scenarios per client

Each lens_runs row with `lens_type='estate'` is an independent
scenario. Default name is "Scenario N" where N is the per-client
estate-lens count + 1. The Lens Runs tab on the client detail page
lists all scenarios; each clicks through to its own detail page.

Side-by-side scenario comparison is **deferred to v1.5**.

## Decisions made autonomously

- **One JSONB blob, not a normalized table**: same pattern as Cash
  Flow Lens. Future state can be added without schema churn.
- **All money in cents**: integer arithmetic, no float drift.
- **State estate tax**: hard-coded lookup table — no runtime queries.
  Top marginal rate (conservative overestimate for HNW estates).
- **Tab 2 simplifications**: Gift / Note Sale both reduce in-estate
  by discounted FMV at t=0; Note Sale adds back the frozen note face
  value at the horizon. AFR interest cash flow is NOT modeled (the
  spread between trust growth and AFR is captured by the trust's
  independent compounding).
- **Tab 3 simplifications**: pay-options use flat effective rates,
  not real bracket models. Mortality leverage chart uses estate growth
  rate for self-insure assumption (not advisor-overridable).
- **Recommendations**: explicit-button only ("Generate defaults"),
  not auto-generated. Default rec set is rule-based (no LLM).

## Pixel-perfect match status

Built from screenshot inspection without access to source design CSS.
Brand tokens (PSA navy, cream, gold, Cormorant serif, mono mono)
match the existing app. Recharts not installed — used pure SVG for
charts (smaller bundle, matches cash flow pattern).

**Visual gap candidates that may surface in browser**: chart aspect
ratios, exact endpoint label positioning, animated transitions. Tweaks
land as Phase 14.7+ visual polish commits if needed.

## Smoke test scope

- `npx tsc --noEmit` clean.
- `npm run build` — 49 routes compile (was 44 + estate routes added).
- Manual click-through against an authenticated session NOT done —
  autonomous build, AI testing self-budgeted to $0. Production parity
  surfaces on Vercel auto-deploy.

## v1.5 backlog created during Phase 14

- **Migration 0006 manual-apply step**: must run via Supabase Dashboard
  SQL editor before advisors can use the feature in production.
- **NY cliff exemption** (entire estate taxed > 105% of exemption)
- **CT $15M tax cap**
- **State-specific bracket schedules** (currently flat top rate)
- **Federal progressive brackets (IRC §2001(c))** — currently flat 40%
- **AFR interest income flow** on Note Sale (paid back to estate)
- **GST tax allocations** (IRC §2641)
- **Inheritance tax math** for NE / NJ / PA / KY / MD (flagged only)
- **DSUE / portability** between spouses
- **Side-by-side scenario comparison view** (each scenario is currently
  its own page)
- **Re-open finalized lens**: PATCH rejects status != draft; unfinalize
  endpoint deferred
- **Editable AFR via §7520 lookup**: advisor types AFR manually today;
  a §7520 monthly-rate import could auto-populate
- **Per-rec category from defaults**: uniform `ESTATE` today; could
  emit `INSURANCE` for LI Purchase, `ESTATE` for trust setup, etc.
- **Section 7520 valuation tables** for GRAT / CLT / QPRT specifics
- **`linked_to_main_plan` integration**: flag exists, but the main plan
  body doesn't yet reference linked lens scenarios. Phase 15 deliverable.
- **Refresh annual rates**: state-tax-table.ts is dated 2026; annual
  refresh procedure should be documented in a runbook.

# Phase 15: Lens run archive + restore UI

Database has supported `lens_runs.status='archived'` + `archived_at`
since Phase 13.1 (migration 0005). UI to drive it landed in Phase 15
across three commits. Mirrors the client-level Phase 11 pattern.

## Endpoints

| Endpoint | Phase | Notes |
| --- | --- | --- |
| `POST /api/lens-runs/[id]/archive` | 13 | Already existed — flips status to archived, stamps archived_at |
| `POST /api/lens-runs/[id]/restore` | 15.1 | New — inverse: archived → draft, clears archived_at. 409 if not currently archived |

`api.lensRuns.archive(id)` and `api.lensRuns.restore(id)` are the
client wrappers. Both return the updated `LensRun` row.

## UI surfaces (Lens Runs tab on /clients/[id])

- **Archive trigger** — small red destructive Archive icon button at
  the end of each non-archived row. Click opens `_LensRunArchiveDialog`
  with a typo-confirm guard (advisor must type the scenario name
  verbatim — identical UX to Phase 11.2 ClientArchiveDialog). Click
  propagation is stopped so the row's open-on-click navigation doesn't
  fire when the icon is clicked.
- **Restore trigger** — same slot, RotateCcw icon, on archived rows.
  Click opens `_LensRunRestoreDialog` — simple confirmation, no typo
  guard (non-destructive). Calls `api.lensRuns.restore` then
  `router.refresh()` so the parent server data re-fetches in place.
- **Show archived chip** — alongside the New Cash Flow / New Estate
  Lens buttons on the table header. Toggles `?archived=1` on the URL
  (state is shareable + survives refresh). When on AND archived rows
  exist, a Count badge appears in the chip.
- **Archived row treatment** — opacity 0.65 when displayed. Click-to-
  open still navigates to the lens detail page so the advisor can read
  historical state without restoring first.

## Server-side filtering

`/clients/[id]/page.tsx` reads `searchParams.archived`. When `==='1'`,
the lens_runs query drops `.neq("status","archived")`; otherwise the
default-hide filter applies. Same query-time filter pattern as Phase
11.5 (notes / action-items archived toggles).

## Why these aren't generic PATCH calls

The existing `/archive` endpoint POSTs (not PATCH) and stamps
`archived_at` server-side. For symmetry I added a dedicated `/restore`
POST that clears `archived_at` server-side. A generic PATCH endpoint
on `/api/lens-runs/[id]` doesn't exist (the per-lens-type PATCH on
cash-flow + estate is intentionally narrow); adding one would require
designing what other fields are mutable through it. The dedicated
archive/restore pair keeps the surface area small and the
status-transition semantics explicit.

## v1.5 backlog from Phase 15

- **Audit log**: archive + restore mutations are not yet written to
  `audit_log`. Phase 5e marker still applies — wire whenever the
  audit_log surface lands across other mutations.
- **Bulk archive** for a multi-scenario cleanup workflow.
- **Re-open finalized lens** is still separately deferred from Phase
  13 — restore goes archived → draft, not approved → draft.

# Phase 16: Fact Review → Lens auto-population

Cash Flow Lens (Phase 13) and Estate Lens (Phase 14) shipped with
manual-entry-only flows. Phase 16 closes the loop: when an advisor
creates a new lens for a client that already has a finalized plan,
the lens pre-fills from `plans.stage1_output` (the ClientProfile
Stage 1 extracted from the Fact Review). $0 LLM cost — all
deterministic mapping.

## Where ClientProfile lives

ClientProfile is the JSONB at `plans.stage1_output`, NOT
`plans.client_profile`. Schema reference:
`src/lib/orchestrator/schemas/clientProfile.ts`. State (e.g. "GA") is
at `profile.client_and_family.primary_owner.state_of_residence` — the
`clients` table does NOT have a state field.

## Extractor library — `src/lib/lens-prefill/`

| File | Purpose |
| --- | --- |
| `extractors.ts` | `extractCashFlowFromClientProfile` + `extractEstateFromClientProfile`. Pure functions. |
| `sourceLookup.ts` | `getLatestFinalizedPlanForClient(supabase, client_id)` — `WHERE status IN (ready_for_review, approved, archived) AND stage1_output IS NOT NULL ORDER BY generated_at DESC LIMIT 1`. |
| `merge.ts` | `mergeRefresh<T>` — dotted-path overlay used by both refresh endpoints. |
| `diff.ts` | `diffSourcedFields(prev, next)` — detects edits by walking sourced paths. `applyEditedFields` / `isSourced` / `isEdited` helpers. |
| `index.ts` | Barrel export. |

### NumericValueSchema gotchas

ClientProfile uses a wrapped `{ value, unit, is_annual, ... }` shape
for every monetary field. The extractor handles:

- `value: null` → field omitted (no source path stamped)
- `value: [low, high]` tuple → midpoint used
- `unit !== "USD"` for USD-expected fields → rejected (null fallback)
- AGI / net_worth / monthly_outflows have stable section conventions
  (income is annual, cash_flow.monthly_* is monthly × 12)

### Cash Flow field map

| ClientProfile path | CashFlowLensOutput field |
| --- | --- |
| `income.agi.value` | `gross_income_annual_cents` |
| `cash_flow.monthly_outflows.value × 12` | `expenses_annual_cents` |
| `goals_and_values.financial_goals` | `goals_narrative` |
| `client_and_family.primary_owner.age` | `client_snapshot.age` |
| `tax_status.federal_marginal_rate.value` | `assumptions.effective_tax_rate_now` |
| `personal_balance_sheet.retirement_accounts[]` | `buckets[]` (classified into 401k / Roth / IRA / SEP / 403b / Annuity by regex on description+category) |
| `personal_balance_sheet.liquid_assets[]` where category includes broker/taxable/investment | `buckets[]` (brokerage preset) |
| `insurance.life_insurance_policies[]` where cash_value > 0 | `buckets[]` (whole_life preset) |
| `liquid_assets[]` where category includes emergency/savings/checking/money market | `emergency_fund.current_balance_cents` (summed) |

### Estate field map

| ClientProfile path | EstateLensOutput field |
| --- | --- |
| `client_and_family.primary_owner.state_of_residence` | `client_snapshot.state_code` (normalized full-name → 2-letter via `STATE_NAME_TO_CODE`) |
| (state code) → `STATE_ESTATE_TAX_RATES` lookup | `assumptions.state_estate_tax_pct` |
| `personal_balance_sheet.net_worth.value` | `assumptions.estate_today_cents` |
| `cash_flow.monthly_outflows.value × 12` | `assumptions.annual_spend_cents` |
| `client_and_family.primary_owner.age` | `assumptions.client_age_today` |
| (derived 85 − age, clamp 15..50) | `assumptions.years_out` |
| Constant $30M (2026 married snapshot) | `assumptions.combined_exemption_cents` |
| `tax_status.federal_marginal_rate.value` → bracket proxy 0/15/20 | `assets_out.federal_ltcg_pct` + `planning_move.federal_ltcg_pct` |

Funded irrevocable trust assets are NOT extracted (TrustRecord has no
balance field). The banner surfaces "Some fields blank" when this
matters and the advisor fills `fmv_out_today` manually.

## Schema impact

Both lens output JSONB shapes gained a `source` field:

```
{
  plan_id: string;
  plan_generated_at: string;
  sourced_fields: string[];   // dotted paths the extractor filled
  edited_fields: string[];    // paths the advisor has hand-edited
} | null
```

`null` = manual-entry path (no finalized plan available at creation).
No DB migration required — JSONB rolls forward. `defaultXxxOutput()`
seeds set `source: null` so existing rows without the field still
type-check on read.

## API surface (Phase 16 additions)

| Endpoint | Behavior |
| --- | --- |
| `POST /api/lens-runs/cash-flow` | If `getLatestFinalizedPlanForClient` returns a row, run extractor and stamp `source` on the seed. Else fall back to `defaultCashFlowOutput`. |
| `POST /api/lens-runs/estate` | Same pattern. Caller-supplied `state_code` overrides extracted state (what-if scenarios). |
| `POST /api/lens-runs/cash-flow/[id]/refresh-from-plan` | Re-extract + merge. Preserves `edited_fields`. 409 if lens ≠ draft or no plan exists. |
| `POST /api/lens-runs/estate/[id]/refresh-from-plan` | Same. Preserves `tracking_id` (not part of extraction). |

Client wrappers: `api.lensRuns.cashFlow.refreshFromPlan(id)` /
`api.lensRuns.estate.refreshFromPlan(id)`.

## UI surfaces

- **`src/components/axiom/LensSourceBanner.tsx`** — gold-tinted banner
  at the top of every lens view. Shows source plan id-prefix + date,
  field counts (sourced + edited), partial-data warning, "View plan"
  deep link, "Refresh from plan" button with confirm dialog. Quieter
  "Manual entry" muted variant when `source === null`.
- **`src/components/axiom/FieldStatus.tsx`** — small 9pt mono badge
  shown beside input labels: "from plan" (gold FileText) when sourced
  + unedited; "edited" (text-3 Pencil) when advisor has overridden.
  Wired into 4 representative inputs in 16.3 (gross income, expenses,
  estate today, annual spend, age, state). Pattern can be extended to
  any input by importing FieldStatus + isSourced/isEdited.
- Edit-tracking: `diffSourcedFields(prev, next)` runs on every
  `setOutput` in both lens views and appends newly-edited paths into
  `source.edited_fields`. The refresh endpoint reads this list and
  skips those paths on merge.

## Edge cases handled

| Case | Behavior |
| --- | --- |
| No finalized plan for client | Lens creates with default seed, `source: null`, banner shows "Manual entry" variant. |
| Plan exists, ClientProfile partial | Extractor fills what it can; banner shows amber "Some fields blank" warning when `sourced_fields.length < expectedFieldCount` (threshold 6). |
| Multiple finalized plans | Always picks most-recent by `generated_at`. Plan-selector at create time is a v1.5 backlog item. |
| Advisor edits a sourced field then hits Refresh | The edit is preserved; the rest of `sourced_fields` re-pulls from the current plan. |
| Lens is finalized/archived | Refresh button is disabled (refresh endpoint 409s). Source banner still shows for auditability. |
| Bucket regeneration on refresh | `merge.ts` replaces the whole `buckets[]` array wholesale unless the advisor has edited any element of it (paths like `buckets[2].current_balance_cents`). |

## v1.5 backlog from Phase 16

- **Plan selector** at lens creation — pick which finalized plan to
  source from instead of always "most recent".
- **Per-field badge coverage** — only 6 inputs got `<FieldStatus />`
  in 16.3. Wire it into the rest (time horizons, assumptions,
  emergency fund inputs, each bucket card, estate planning move
  inputs, life insurance plan inputs).
- **Funded trust balances** — `TrustRecord.funded` is boolean only.
  Add an asset-side join (e.g. `category="irrevocable_trust"` in
  liquid_assets) to populate `assets_out.fmv_out_today_cents`
  automatically.
- **Effective tax rate at retirement** — currently uses default 24%.
  Could derive from a retirement bracket assumption against the AGI.
- **Refresh-from-plan history** — keep a log of when each refresh
  fired and which fields changed.
- **Stage 1 archetype → cash-flow assumptions** — POST archetype
  could swap default growth_rate / capital_gains_rate to PSA's
  archetype-tuned defaults.
