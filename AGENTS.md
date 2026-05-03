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
checked *before* firing each stage, not after).

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
