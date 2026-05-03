# Welcome — Claude Design handoff for Axiom

You're building the UI for **Axiom**, the day-to-day operating system for
**PSA Wealth**, a 3-advisor RIA in Atlanta. The AI engine that powers Axiom's
financial-plan generator is already built and validated; your job is the
interface advisors live in.

---

## What you're building against

A Next.js 16 app shell with auth wired and a fully scaffolded HTTP API
returning **mock data**. Every endpoint Claude Design will call is in place;
real Supabase + AI-engine wiring lands in Phase 5. You can build the entire
UI end-to-end against the mocks today.

**The contract:** see `specs/api/v1_contract.md` — every endpoint, every
request/response shape, every error code.

---

## Stack

| | |
| --- | --- |
| Framework | Next.js 16 (App Router, TypeScript, Turbopack) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| UI primitives | shadcn/ui (style: `base-nova`, base color: `neutral`, CSS variables, RSC). Already installed: `button`, `card`, `input`, `label`, `form`, `avatar`, `dialog`, `sonner`, `tabs`, `badge`. |
| Forms | `react-hook-form` + `@hookform/resolvers` + `zod` |
| Icons | `lucide-react` |
| Toasts | `sonner` (Toaster mounted in `src/app/layout.tsx`) |
| Auth | Supabase Auth (magic link), wired |
| State / data | None opinionated yet. Use `fetch` via `@/lib/api/client` from server components for initial load; client components with React state for interactivity. SWR or TanStack Query are reasonable Phase 5 additions if needed. |

---

## Run locally

```bash
git clone <repo>
cd axiom
npm install

# .env.local must be populated — Hayden has the keys.
# See AGENTS.md "Bringing up a fresh Supabase project" for the steps if
# you're spinning up your own dev project.

npm run dev
# → http://localhost:3000
```

Sign in via the magic-link flow at `/sign-in`. Hayden adds your email to
the `advisors` table on his Supabase project so you can authenticate.

Type-check at any time with:

```bash
npx tsc --noEmit
```

---

## Where the API client lives

`src/lib/api/client.ts` exports a typed `api` object you import directly:

```ts
import { api, isApiError } from "@/lib/api/client";
import type { ActionItem } from "@/lib/api/types";

const { items } = await api.actionItems.list({ status: "in_progress" });
//      ^^^^^   typed as ActionItem[]
```

**From a Server Component:** call `api.*` directly in the async component
body — `fetch` happens server-to-server (same origin, cookie attached).

**From a Client Component:** same `api.*` import; runs in the browser.

**Auth is automatic** — the Supabase session cookie is included on every
request via `credentials: "same-origin"`. On 401, the wrapper auto-redirects
to `/sign-in?redirect=<current-path>`.

---

## Auth model

- **Magic link only** (no password). Advisor enters email → Supabase mails a
  link → clicking the link hits `/auth/callback` which exchanges the code
  for a session cookie.
- **Current user:** `await api.advisors.me()` returns the `Advisor` row.
- **Sign out:** call `supabase.auth.signOut()` from a client component
  (import `createClient` from `@/lib/supabase/client`), then redirect.
- **Active-advisor check:** the `proxy.ts` middleware verifies on every
  request that the session belongs to a row in `advisors` with
  `active = true`. Anyone else gets bounced to `/sign-in` (HTML routes) or
  a 403 JSON (`/api/*`).

---

## Mocks → real data

Every `/api/*` endpoint currently returns mock data sourced from
`src/lib/api/_mocks.ts`. Mock IDs are deterministic:

- `mock-client-holloway`, `mock-client-burke`, `mock-client-vance`
- `mock-plan-holloway-2026-Q1`, `mock-plan-holloway-2026-Q2`
- `mock-ai-001` … `mock-ai-020`
- `mock-note-001` … `mock-note-005`
- `mock-lens-run-001` … `mock-lens-run-002`
- `mock-partner-001` … `mock-partner-003`

You can hard-code these in component fixtures during development. Phase 5
replaces the mock returns with real Supabase queries; the response shapes
do not change.

---

## v1 product scope

PSA Wealth uses Axiom for **internal advisor workflow only**. Three things
to know:

1. **3 internal advisor accounts.** No client portal, no partner portal.
2. **Action items are the spine.** Every advisor view ladders back to the
   action item tracker — per-advisor weekly to-do, per-client status,
   partner-blocked filter.
3. **Plan generator is the marquee feature** — advisor uploads a `.docx`
   Fact Review, AI engine drafts a 14-section plan, advisor reviews and
   approves before it goes to the client as PDF.

Lenses (Investment / Insurance / Cash Flow), Notes Hub, Partner directory
all support that core advisor workflow.

---

## Initial UI scope — what to build first

Build in this order; each step works against the mock API end-to-end.

### Step A — Authenticated shell

Already exists at `src/app/(app)/layout.tsx` with a basic top-nav. Polish:

- Replace the placeholder nav with a clean topbar: Axiom wordmark left,
  primary nav (`Dashboard`, `Clients`, `Action Items`, `Notes`) center,
  signed-in advisor avatar + dropdown right (sign out).
- Active-route highlighting.
- Mobile-responsive: collapse nav into a sheet on narrow screens.

### Step B — Sign-in page

Already functional at `src/app/(auth)/sign-in/page.tsx`. Polish only — the
email-magic-link form is wired and shows toasts.

### Step C — Dashboard (`/dashboard`)

Advisor's home. Surfaces:

- Current advisor's open action items (top 5 by `timing_bucket`).
- "Needs your attention" tile: pending-decision items where `owner = me`.
- Recent activity (last 5 notes I authored or that mention my clients).
- Quick "+ New note" / "+ Generate plan" entry points.

Data sources: `api.advisors.me()`, `api.actionItems.list({ owner: me.email, status: "in_progress" })`, `api.actionItems.list({ owner: me.email, status: "pending_decision" })`.

### Step D — Action items list (`/action-items`)

The spine view. Build:

- Filter chips: status, owner (me / all), client, timing bucket,
  partner-required.
- Sortable columns: description, client, owner, due bucket, status.
- Inline status edit (chip click → cycle).
- Detail drawer (Sheet) on row click with full action item view + edit.

### Step E — Clients list + detail (`/clients`, `/clients/[id]`)

- List: household name, lead advisor, status, last activity.
- Detail page tabs: Overview, Plans, Action Items, Notes, Lens Runs, Partners.
- Each tab uses the appropriate `api.*.listByClient(id)`.

### Step F — Notes Hub (`/notes`)

- Cross-client notes feed, newest first.
- Filter by client / tag / author.
- Inline "Promote to action item" → opens dialog with prefilled fields.
- New note from any page via topbar `+`.

### Step G — Plan view (`/plans/[id]`)

The most visually involved page — render the 14-section plan with proper
typography. (Real plan content lives in `stage4_output` JSONB; mock
returns null in v1 Step 3 so render placeholder section cards.)

Sections to render (full schema in `src/lib/orchestrator/schemas/stage4.types.ts`):

1. Title page
2. Executive summary
3. Our process
4. Client snapshot
5. Goals & priorities
6. Findings & observations
7. Recommendations — Business (RB.1–7)
8. Recommendations — Personal (RP.8–12)
9. Implementation roadmap
10. Decisions needed
11. Advisory team
12. Meeting cadence
13. Glossary
14. Disclosures

---

## Visual identity

Axiom advisors are working with **HNW (high net worth) clients** ($30M+
business owners). The visual language should signal:

- **Trust + clarity.** Generous whitespace, restrained color, serif-free
  type stack (Geist Sans is already wired). Numbers and tables get to
  breathe.
- **Professional, not flashy.** No gradients, no glows, no marketing-page
  hero animations. This is software people use for 6+ hours a day —
  legibility and density tradeoffs win over flourish.
- **Document-friendly density** in the plan view: full-width readable
  measure (~70 char lines) for narrative; tighter columnar density for
  tables (Implementation Roadmap, Top 5 Priorities).
- **Action-first affordances.** The primary affordance on every list view
  is "do something with this row" — a row click should always lead to a
  next action, never a dead-end detail page.

shadcn defaults are a good starting point. Lean on `Card` for grouping,
`Tabs` for client overview, `Badge` for status pills (use the variants:
`default` for not_started, `secondary` for in_progress, `outline` for
pending_decision, `default` with custom green tint for complete).

---

## Adding more shadcn components

If you need components not in the initial set (e.g., `select`, `sheet`,
`table`, `dropdown-menu`, `command`):

```bash
npx shadcn@latest add select sheet table dropdown-menu command
```

The `components.json` is already configured with `style: base-nova` and
`baseColor: neutral`.

---

## What's NOT in v1 (don't build)

- Client portal / client-facing surfaces.
- Partner portal / partner-facing surfaces.
- Per-advisor data isolation (all 3 advisors see all rows).
- Mobile app (notes-only mobile is a v1.5 item).
- Real-time updates (subscriptions, websockets — polling is fine).
- PDF export (Phase 6+).
- Compliance enforcement / audit-log immutability (the `audit_log`
  table exists but is append-only at the application layer in v1).

---

## Asking questions

The architecture spec at `specs/architecture/app_overview.spec.md` has
deep context on every entity, the AI engine pipeline, the v1 invariants,
and what's punted to v1.5+. Read it once for grounding before opinionating
on data shapes.

For UX questions where the spec is silent, default to: **what serves a
busy advisor on a 6-hour workday in front of HNW clients?**

Hayden is reachable for product questions; the AI engine is locked
behind the API surface above and not your concern for the first sprint.
