# Axiom v1 — API Contract

**Status:** Phase 4 Step 3 — endpoints **scaffolded**, return mock data, real
Supabase + AI-engine wiring lands in Phase 5.
**Audience:** Claude Design (frontend), and any future consumer of the
Axiom HTTP API.
**Source of truth for types:** `src/lib/api/types.ts` (TypeScript) and the
database schema at `supabase/migrations/0001_initial_schema.sql`.

---

## 1. Conventions

### 1.1 Authentication

All endpoints require an authenticated **PSA Wealth advisor** session.
Authentication is handled via the **Supabase session cookie**, set by the
magic-link callback at `GET /auth/callback`. The browser fetch client sends
the cookie automatically (`credentials: "same-origin"`); no manual header
handling is required.

The proxy (`src/proxy.ts`) refreshes the session on every request and
gates all `/api/*` paths. Unauthenticated API requests get a JSON 401 (not
an HTML redirect). Sessions for users without a corresponding active
`advisors` row get a JSON 403.

### 1.2 Base URL

- Local dev: `http://localhost:3000`
- Production: TBD (Vercel deployment in Phase 5+)

All endpoints are under the `/api/` namespace.

### 1.3 Request body format

JSON unless explicitly noted. The single exception in v1 is
`POST /api/plans/generate`, which is `multipart/form-data` because it
accepts a `.docx` upload.

### 1.4 Error envelope

Every non-2xx response is JSON:

```json
{
  "error": {
    "code": "validation_failed",
    "message": "Human-readable description.",
    "details": "Optional, code-specific (e.g., Zod issues array)."
  }
}
```

Error code → HTTP status mapping:

| Code                | HTTP | Meaning |
| ---                 | ---  | --- |
| `unauthenticated`   | 401  | No active session. Client redirects to /sign-in. |
| `not_authorized`    | 403  | Session exists but user is not an active advisor. |
| `not_found`         | 404  | Entity by ID not present. |
| `conflict`          | 409  | Operation invalid for current state (e.g., approving an already-approved plan). |
| `validation_failed` | 422  | Request payload failed schema validation. `details` is the Zod issues array. |
| `rate_limited`      | 429  | (Reserved; not used in v1.) |
| `internal_error`    | 500  | Unexpected server-side failure. |

Codes are stable identifiers Claude Design can switch on; messages are
informational and may change between releases.

### 1.5 Success envelope

- **Single resource:** the resource object as the top-level body.
- **List endpoints:** `{ items: T[], next_cursor: string | null }`.
- **DELETE:** 204 No Content (empty body).
- **Async accepted (POST .../generate):** 202 Accepted with a small
  envelope: `{ <id>, status, queued_at }`.

### 1.6 Pagination

Cursor-based for all list endpoints:

- Query params: `?limit=N&cursor=OPAQUE`.
- `limit` default 50, max 200.
- `cursor` is opaque — clients pass back what they received in
  `next_cursor`. (Phase 4 mock returns `null` always; Phase 5 implements
  real cursors.)

### 1.7 Date format

ISO 8601 UTC strings (`2026-05-03T17:21:11.897Z`) for every timestamp
column.

### 1.8 IDs

Lowercase RFC 4122 UUIDs for entity IDs. Phase 4 mocks use deterministic
prefixes (`mock-client-holloway`, `mock-ai-001`) to keep URLs stable
during UI development; Phase 5 replaces with real Postgres
`gen_random_uuid()` values.

### 1.9 Phase status legend (for each endpoint below)

- 🪛 **MOCK** — handler returns mock data; payload validation works,
  state changes are not persisted.
- 🔌 **WIRED** — handler hits the real database / engine. (None in v1
  Step 3; everything is MOCK.)

---

## 2. Resources

### 2.1 Advisors

The 3 PSA Wealth advisors. Read-only API in v1; advisor onboarding happens
through Supabase Dashboard invitations (see operator runbook in AGENTS.md).

#### 🪛 GET `/api/advisors/me`

Current signed-in advisor's profile.

- **Auth:** required.
- **Response 200:** `Advisor` row.
- **Errors:** `unauthenticated`, `not_authorized`.

```json
{
  "id": "00000000-0000-0000-0000-000000000001",
  "email": "hayden@psawealth.com",
  "first_name": "Hayden",
  "last_name": "Duffield",
  "role": "advisor",
  "active": true,
  "created_at": "2026-02-02T17:00:00.000Z",
  "updated_at": "2026-05-02T17:00:00.000Z"
}
```

#### 🪛 GET `/api/advisors`

List all advisors (used for owner selectors).

- **Query:** `active?: boolean`.
- **Response 200:** `{ items: Advisor[], next_cursor: null }`.

---

### 2.2 Clients

PSA's clients (e.g., the Holloway family). One advisor leads each client
(`lead_advisor_id`); v1 has no per-advisor data isolation.

#### 🪛 GET `/api/clients`

List clients.

- **Query:** `status?: "active"|"inactive"|"prospect"`,
  `lead_advisor_id?: uuid`, `limit?: number`, `cursor?: string`.
- **Response 200:** `{ items: Client[], next_cursor }`.

#### 🪛 POST `/api/clients`

Create a new client.

- **Body:**

  ```json
  {
    "lead_advisor_id": "uuid",
    "household_name": "Holloway Family",
    "status": "prospect",            // optional, defaults to "prospect"
    "archetype": null,               // optional, "PRE"|"MID"|"POST"|"NONE"|null
    "notes": null                    // optional
  }
  ```

- **Response 201:** the created `Client`.
- **Errors:** `validation_failed`.

#### 🪛 GET `/api/clients/[id]`

Get a single client.

- **Response 200:** `Client`.
- **Errors:** `not_found`.

#### 🪛 PATCH `/api/clients/[id]`

Update a client. All fields optional.

- **Body:** any subset of the create body fields.
- **Response 200:** updated `Client`.
- **Errors:** `not_found`, `validation_failed`.

#### 🪛 DELETE `/api/clients/[id]`

Soft-delete (sets `status = "inactive"`; Phase 5 will preserve plan
history).

- **Response 204:** empty.
- **Errors:** `not_found`.

---

### 2.3 Plans

One row per generated plan. v1 keeps plan history year-over-year (each
generation creates a new row). The `stage1_output`, `stage3a_output`,
`stage4_output`, `stage5_output` JSONB fields hold the raw AI engine
artifacts (see `src/lib/orchestrator/schemas/`).

#### 🪛 GET `/api/clients/[id]/plans`

List plans for a client (newest first).

- **Query:** `status?: "draft"|"approved"|"archived"`, `limit`, `cursor`.
- **Response 200:** `{ items: Plan[], next_cursor }`.
- **Errors:** `not_found` (client).

#### 🪛 GET `/api/plans/[id]`

Plan detail.

- **Response 200:** `Plan`.
- **Errors:** `not_found`.

#### 🪛 POST `/api/plans/generate`

**Multipart/form-data only.** Accepts a `.docx` Fact Review and a
`client_id`; queues a draft plan and returns immediately.

- **Body (form fields):**
  - `client_id` (string, required)
  - `fact_review` (File, required, MIME
    `application/vnd.openxmlformats-officedocument.wordprocessingml.document`,
    ≤ 25 MB)
- **Response 202:**

  ```json
  {
    "plan_id": "uuid",
    "status": "draft",
    "queued_at": "2026-05-03T17:30:00.000Z"
  }
  ```

- **Errors:** `validation_failed` (wrong MIME, missing fields), `not_found`
  (client).
- **Phase 5 plan:** the file lands in Supabase Storage; a background worker
  fires Stages 0/1 → 3a → 4 → 5; the plan row's status transitions
  `draft → ready_for_review` when complete. Clients poll
  `GET /api/plans/[id]` for status updates.

#### 🪛 POST `/api/plans/[id]/approve`

Transition a draft plan to approved.

- **Body:** none.
- **Response 200:** updated `Plan` (status=approved, approved_at set).
- **Errors:** `not_found`, `conflict` (only drafts can be approved).

#### 🪛 POST `/api/plans/[id]/archive`

Archive a plan.

- **Body:** none.
- **Response 200:** updated `Plan` (status=archived, archived_at set).
- **Errors:** `not_found`.

#### 🔌 GET `/api/plans/[id]/pdf`

Render the plan's `stage4_output` to PDF and stream it as a download.

- **Auth:** required.
- **Status guard:** plan must be `ready_for_review`, `approved`, or
  `archived`. `queued` / `processing` / `failed` plans return `422
  validation_failed`.
- **Response 200:** `application/pdf` (Letter, ~60-70pp for Holloway-scale
  plans — most of the bulk is the ~380-row Implementation Roadmap)
  with `Content-Disposition: attachment; filename="PSA-Plan-<client>-<date>.pdf"`.
- **Errors:** `not_found`, `validation_failed` (status guard or missing
  `stage4_output`), `internal_error` (PDF render failed).
- **Wrapper:** `api.plans.exportPdf(id)` returns `Promise<Blob>`.
- **v1 caveat:** no per-page numbering. `@react-pdf/renderer` 4.5.1's
  `Text render` callback fails on multi-page bodies (see
  `specs/v1_5_backlog.md`). The footer shows firm name, "Confidential",
  compliance ID, plan-ID slug, and a one-line disclosure on every page;
  page 1-of-N is deferred to v1.5.

---

### 2.4 Action Items — THE SPINE

Action items are the operational core of Axiom — they originate from plans,
lens runs, or manual creation; they're how advisors drive day-to-day work.
Long-running items spawn derivative reminders (Phase 5 cron).

#### 🪛 GET `/api/action-items`

Global list with multi-axis filtering.

- **Query:** `owner?: string` (advisor email or "client"),
  `status?: "not_started"|"in_progress"|"pending_decision"|"complete"`,
  `timing_bucket?: string`, `client_id?: uuid`,
  `partner_required?: boolean`, `limit`, `cursor`.
- **Response 200:** `{ items: ActionItem[], next_cursor }`.

Common queries the UI will run:

- **Per-advisor to-do list:** `?owner=hayden@psawealth.com&status=not_started,in_progress` (note: comma-separated status not yet supported — Phase 5).
- **Per-client view:** `?client_id=mock-client-holloway`.
- **Partner-blocked filter:** `?partner_required=true&status=pending_decision`.

#### 🪛 POST `/api/action-items`

Create a manual action item (not derived from a plan).

- **Body:**

  ```json
  {
    "client_id": "uuid",
    "description": "Send Burke initial engagement letter.",
    "category": "ENGAGEMENT",
    "duration_class": "one_time",     // or "long_running"
    "timing_bucket": "next_30_days",
    "owner": "hayden@psawealth.com",  // or "client"
    "partner_required": false,
    "partner_type": null,
    "parent_action_item_id": null
  }
  ```

- **Response 201:** the created `ActionItem`.

#### 🪛 GET `/api/action-items/[id]`

- **Response 200:** `ActionItem`.

#### 🪛 PATCH `/api/action-items/[id]`

Update fields. Setting `status: "complete"` auto-fills `completed_at` and
`completed_by_advisor_id` (the current advisor) on the server side.

Two server-side lifecycle effects fire after the update commits (Phase 5d):

- **Spawn**: a `long_running` parent transitioning to `in_progress` for the
  first time spawns a derivative reminder (`is_derivative_reminder=true`,
  `parent_action_item_id` set, description = parent's
  `auto_generated_reminder_template`, owner/partner_type/category inherited).
  Idempotent: if a derivative already exists under this parent, no new
  spawn fires.
- **Auto-close**: any parent transitioning to `complete` for the first
  time updates every open derivative reminder under it to
  `status='complete'` (`completed_at`/`completed_by_advisor_id` stamped
  with the closing advisor).

The response body surfaces both effects so the UI can toast without a
follow-up fetch:

- **Body:** any subset of `description`, `category`, `duration_class`,
  `timing_bucket`, `owner`, `partner_required`, `partner_type`, `status`.
- **Response 200:**

  ```json
  {
    "item": { /* updated ActionItem row */ },
    "spawned_reminders": [ /* ActionItem[] — null when no spawn fired */ ],
    "auto_closed_reminders": 0
  }
  ```

  `spawned_reminders` is `null` (not `[]`) when no spawn happened — clients
  can branch on truthiness. `auto_closed_reminders` is the integer count
  of derivative reminders the auto-close updated; `0` is the no-op case.

#### 🪛 DELETE `/api/action-items/[id]`

- **Response 204.**

---

### 2.5 Notes — Notes Hub

Free-form, client-attached. Optionally promotable to action items.

#### 🪛 GET `/api/clients/[id]/notes`

Notes for a client, newest first.

- **Response 200:** `{ items: Note[], next_cursor }`.

#### 🪛 POST `/api/notes`

Create a note. The `author_advisor_id` is set server-side from the session.

- **Body:**

  ```json
  {
    "client_id": "uuid",
    "body": "Marcus mentioned MEP roll-up inbound is 'serious' — letter this week.",
    "tag": "call"
  }
  ```

- **Response 201:** created `Note`.

#### 🪛 PATCH `/api/notes/[id]`

Update note body and/or tag.

- **Response 200:** updated `Note`.

#### 🪛 DELETE `/api/notes/[id]`

- **Response 204.**

#### 🪛 POST `/api/notes/[id]/promote-to-action`

Promote a note to an action item. Atomically inserts the action item AND
sets the note's `promoted_to_action_item_id`.

- **Body:**

  ```json
  {
    "description": "Optional override — defaults to note.body.",
    "category": "ENGAGEMENT",
    "duration_class": "one_time",
    "timing_bucket": "next_30_days",
    "owner": "hayden@psawealth.com",
    "partner_required": false,
    "partner_type": null
  }
  ```

- **Response 200:** `{ note: Note, action_item: ActionItem }`.
- **Errors:** `not_found`, `conflict` (note already promoted),
  `validation_failed`.

---

### 2.6 Lens Runs

Re-runnable lenses (Investment / Insurance / Cash Flow) on top of a plan
or client context. Each invocation is a row.

#### 🪛 GET `/api/clients/[id]/lens-runs`

- **Query:** `lens_type?`, `status?`, `limit`, `cursor`.
- **Response 200:** `{ items: LensRun[], next_cursor }`.

#### 🪛 GET `/api/lens-runs/[id]`

- **Response 200:** `LensRun`.

#### 🪛 POST `/api/lens-runs/generate`

Kick off a lens run.

- **Body:**

  ```json
  {
    "client_id": "uuid",
    "lens_type": "investment",        // or "insurance" | "cash_flow"
    "context_input": "Optional advisor brief for this run."
  }
  ```

- **Response 202:**

  ```json
  {
    "lens_run_id": "uuid",
    "status": "draft",
    "queued_at": "2026-05-03T17:35:00.000Z"
  }
  ```

- **Phase 5 plan:** background worker fires the lens-specific generator;
  client polls `GET /api/lens-runs/[id]` for status.

#### 🔌 GET `/api/lens-runs/[id]/pdf`

Render the lens run as a PDF and stream it as a download.

- **Auth:** required.
- **Status guard:** lens run must be `draft`, `approved`, or `archived`.
  (Unlike plans, lens-run `draft` IS exportable — the lens flow is
  "advisor reviews then approves" and the body is populated at the draft
  stage.)
- **Response 200:** `application/pdf` (currently a minimal placeholder
  layout — full per-lens-type rendering lands in Phase 5c).
- **Errors:** `not_found`, `validation_failed`, `internal_error`.
- **Wrapper:** `api.lensRuns.exportPdf(id)` returns `Promise<Blob>`.

---

### 2.7 Partners

CPA / attorney / broker contact roster, scoped per client.

#### 🪛 GET `/api/clients/[id]/partners`

- **Response 200:** `{ items: Partner[], next_cursor }`.

#### 🪛 POST `/api/partners`

- **Body:**

  ```json
  {
    "client_id": "uuid",
    "partner_type": "CPA",
    "first_name": "Lisa",
    "last_name": "Park",
    "firm_name": "Park & Associates",
    "email": "lisa@parkcpa.com",
    "phone": "404-555-0142",
    "notes": "Handles all entity returns + PTET filing."
  }
  ```

- **Response 201:** created `Partner`.

#### 🪛 PATCH `/api/partners/[id]`

- **Body:** any subset of the create fields except `client_id`.
- **Response 200:** updated `Partner`.

#### 🪛 DELETE `/api/partners/[id]`

- **Response 204.**

---

## 3. TypeScript types

Every shape above is mirrored in `src/lib/api/types.ts` under
per-resource namespaces:

```ts
import { ClientsApi, ActionItemsApi, NotesApi } from "@/lib/api/types";

const body: ClientsApi.CreateRequest = { lead_advisor_id: "...", household_name: "..." };
const list: ActionItemsApi.ListResponse = { items: [...], next_cursor: null };
```

Resource Row types (`Advisor`, `Client`, `Plan`, `ActionItem`, `Note`,
`LensRun`, `Partner`) are re-exported from
`src/lib/supabase/database.types.ts` so the wire format stays in sync with
the database schema.

---

## 4. Client wrapper

`src/lib/api/client.ts` exposes a typed `api` object Claude Design imports
directly:

```ts
import { api, isApiError } from "@/lib/api/client";

try {
  const { items } = await api.actionItems.list({
    owner: "hayden@psawealth.com",
    status: "in_progress",
  });
  // items: ActionItem[]
} catch (err) {
  if (isApiError(err) && err.code === "not_authorized") {
    // already auto-redirected to /sign-in
  }
}
```

The wrapper:
- Sends the session cookie automatically (`credentials: "same-origin"`).
- Throws `ApiClientError` (with `status`, `code`, `message`, `details`)
  on any non-2xx response.
- Auto-redirects to `/sign-in?redirect=<path>` on 401 so stale sessions
  bounce back cleanly.

---

## 5. Phase 5 wiring plan (preview)

When Phase 5 begins, every `// TODO: Phase 5 — ...` marker in
`src/app/api/**/route.ts` is replaced with the corresponding Supabase
query. Trigger endpoints (`POST .../generate`) gain real background-job
enqueueing (likely Inngest or a Postgres-backed queue) and call into
`src/lib/orchestrator/` for the AI engine work.

The contract above is intended to be **stable** between Phase 4 and
Phase 5 — Claude Design can build against it now without rework.
