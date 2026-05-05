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
