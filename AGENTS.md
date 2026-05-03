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

**Endpoint inventory** (all 🪛 MOCK in Step 3):

| Resource | Endpoints |
| --- | --- |
| Advisors | `GET /api/advisors/me`, `GET /api/advisors` |
| Clients | `GET/POST /api/clients`, `GET/PATCH/DELETE /api/clients/[id]`, `GET /api/clients/[id]/{plans,notes,lens-runs,partners}` |
| Plans | `GET /api/plans/[id]`, `POST /api/plans/generate` (multipart .docx), `POST /api/plans/[id]/{approve,archive}` |
| Action items | `GET/POST /api/action-items`, `GET/PATCH/DELETE /api/action-items/[id]` |
| Notes | `POST /api/notes`, `PATCH/DELETE /api/notes/[id]`, `POST /api/notes/[id]/promote-to-action` |
| Lens runs | `GET /api/lens-runs/[id]`, `POST /api/lens-runs/generate` |
| Partners | `POST /api/partners`, `PATCH/DELETE /api/partners/[id]` |

**Conventions** (mirrored in `specs/api/v1_contract.md`):

- Auth: Supabase session cookie via `proxy.ts` + per-handler
  `requireAdvisor()` call (defense in depth — handler still verifies
  even if the proxy matcher changes).
- Error format: `{ error: { code, message, details? } }` with
  HTTP-status mapping.
- Pagination: cursor-based (`limit` default 50, max 200; `cursor`
  opaque). Phase 4 mock returns `next_cursor: null` always.
- Dates: ISO 8601 UTC.
- IDs: lowercase RFC 4122 UUID; mocks use stable `mock-*` prefixes.

When wiring Phase 5: every `// TODO: Phase 5 — ...` marker in
`src/app/api/**/route.ts` is the one-line spec for the Supabase query
to slot in. The trigger endpoints (`POST .../generate`) need a
background-worker enqueue (likely Inngest or a Postgres-backed queue)
that calls into `src/lib/orchestrator/`.
