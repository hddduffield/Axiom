# Plan Entity

**Type:** Database-level architectural entity. Persists the full output of the plan generator pipeline and is the integration anchor for every downstream Axiom feature (Tracker, Notes, Client Overview, lens generators, year-over-year refresh, compliance audit).

**Purpose:** Bridge the deterministic in-memory pipeline output (Stages 0–5 + glue) and the broader Axiom application. The pipeline produces a SequencedPlan + AggregateMetrics + assembled prose in a single generation run; the Plan entity is what *persists* once the advisor decides this generation is ready to deliver. After delivery, the Plan is the canonical reference for everything that touches "this client's plan this year": ActionItems flow into the Tracker; Notes attach for advisor context; year-over-year refreshes link via predecessor_plan_id; compliance audits read from generation_log_path; lens generators (cash flow, investment, insurance) consume client_profile + sequenced_plan and link back via the lens FK fields.

**Critical:** The Plan entity is the only place where pipeline outputs become *durable*. Before a plan is persisted, every artifact lives in memory or the artifacts directory. After persistence, the Plan is the source of truth for downstream features; the pipeline is not re-run unless a refresh is explicitly requested. This means schema discipline at this layer is non-negotiable — Tracker, Notes, lens generators, and compliance all depend on Plan-shaped contracts.

This spec is architectural, not algorithmic. It defines the entity, its lifecycle, its persistence contract, and its integration surface. Database migrations and UI behaviors are explicitly out of scope and live in Phase 6.

---

## Plan Entity Schema

```typescript
interface Plan {
  // ─── Identity ───────────────────────────────────────────────────────
  plan_id: string;                                    // UUID v4
  client_id: string;                                  // FK → Client
  plan_version: number;                               // 1, 2, 3, … (per-client monotonic)
  is_current: boolean;                                // Exactly one true per client_id (DB-enforced)

  // ─── Provenance ─────────────────────────────────────────────────────
  generated_at: string;                               // ISO 8601, set on draft creation
  generated_by_advisor_id: string;                    // FK → Advisor
  source_fact_review_path: string;                    // Storage path to .docx
  source_fr_content_hash: string;                     // SHA-256 from Stage 0

  // ─── Lifecycle status ───────────────────────────────────────────────
  status: "draft" | "in_review" | "delivered" | "archived";
  delivery_date: string | null;                       // Set when status → "delivered"
  archive_date: string | null;                        // Set when status → "archived"

  // ─── Pipeline output (full pipeline artifacts persisted as JSON) ────
  client_profile: ClientProfile;                      // Stage 1 output
  selected_recommendations: SelectedRecommendations;  // Stage 2 output OR hand-authored fixture
  sequenced_plan: SequencedPlan;                      // Stage 3a + 3b output
  aggregate_metrics: AggregateMetrics;                // Stage 4 glue output

  // ─── Generated content artifacts (storage paths) ────────────────────
  internal_plan_pdf_path: string | null;              // Internal advisor version
  client_facing_plan_pdf_path: string | null;         // Client deliverable

  // ─── Lens linkages (set when respective lens is generated) ──────────
  cash_flow_plan_id: string | null;                   // FK → CashFlowPlan
  investment_plan_id: string | null;                  // FK → InvestmentPlan
  insurance_plan_id: string | null;                   // FK → InsurancePlan

  // ─── Tracker integration ────────────────────────────────────────────
  action_items: ActionItem[];                         // Top-level ActionItems with source_plan_id set

  // ─── Year-over-year linkage ─────────────────────────────────────────
  predecessor_plan_id: string | null;                 // Prior year's Plan; null for first plan

  // ─── Audit and compliance ───────────────────────────────────────────
  generation_log_path: string;                        // artifacts/{plan_id}/ directory
  total_generation_cost_cents: number;                // Cents, not dollars
  total_generation_duration_ms: number;
  compliance_id: string | null;                       // null in v1 (compliance integration deferred)
  supervisory_review_signal: SupervisoryReviewSignal; // Carried from sequenced_plan

  // ─── Notes attached to this specific plan ───────────────────────────
  attached_notes: Note[];                             // Notes with attached_plan_id === this.plan_id

  // ─── Metadata ───────────────────────────────────────────────────────
  archetype: ArchetypeIdentifier;                     // PRE / POST / ACT / FO / FOUND
  archetype_secondary: ArchetypeIdentifier | null;
}
```

### Field-level notes

- **`plan_id`** — UUID v4. Generated at draft creation (when the pipeline first runs). Stable for the entity's lifetime. Used as primary key and as the `artifacts/{plan_id}/` directory name.

- **`plan_version`** — per-client integer; not globally unique. The first plan a client receives is `plan_version = 1`. Year-over-year refresh increments. Combined with `client_id` it forms a candidate key.

- **`is_current`** — exactly one Plan per `client_id` may have `is_current: true`. Database enforces via partial unique index. Flipping the bit is part of the delivery transition (see Lifecycle below).

- **`source_fr_content_hash`** — SHA-256 of the FR content extracted by Stage 0. Used as a fast equality check during refresh ("did the FR actually change?") and as part of the generation_log audit trail. Stage 0 already computes this; the Plan reuses it.

- **`status`** — finite-state machine. Transitions are constrained (see Lifecycle). The DB layer enforces legal transitions via a CHECK constraint or trigger.

- **`client_profile`, `selected_recommendations`, `sequenced_plan`, `aggregate_metrics`** — persisted as `jsonb` columns at v1 (Postgres). Schema-validated against the corresponding zod schema at write time. Once persisted, treated as immutable — re-runs create a new Plan, not in-place mutations. This preserves audit traceability and matches the year-over-year archive semantics.

- **`internal_plan_pdf_path` / `client_facing_plan_pdf_path`** — storage paths (Supabase Storage or Vercel Blob keys), not file contents. Null while in `draft` / `in_review`; populated at delivery.

- **`cash_flow_plan_id` / `investment_plan_id` / `insurance_plan_id`** — nullable FKs. Lens-derived plans are generated lazily from a Plan + ClientProfile + SequencedPlan; the Plan back-references them so the Tracker and Client Overview can render lens summaries without a join chain. When a lens is regenerated, the FK swaps to the new lens-plan id and the prior lens-plan archives.

- **`action_items`** — at draft / in_review status, this array is empty (the source-of-truth ActionItems live inside `sequenced_plan.action_items_flat[]`). At delivery, ActionItems are *copied* (not moved) from `sequenced_plan` into top-level ActionItem records with `source_plan_id` set. The two locations stay in sync logically; `sequenced_plan.action_items_flat` is the as-generated record (immutable), top-level `action_items` is the live working set the Tracker mutates. See ActionItem Extraction section below.

- **`predecessor_plan_id`** — null for `plan_version = 1`. Otherwise points at the most recent prior delivered Plan for the same client. Forms a reverse-linked list across years; combined with the predecessor's predecessor field, supports "show me this client's plan history" without a separate index table.

- **`generation_log_path`** — directory path (typically `artifacts/{plan_id}/`). All per-stage JSON outputs and intermediate artifacts live here. Treated as part of the audit trail; never mutated post-delivery.

- **`compliance_id`** — null in v1. Reserved for post-v1 compliance investment (see Compliance Considerations).

- **`supervisory_review_signal`** — full object, copied from `sequenced_plan.supervisory_review_signal` at delivery. Surfacing it at the Plan level (rather than nested in `sequenced_plan`) lets compliance dashboards filter without parsing the SequencedPlan blob.

- **`attached_notes`** — Notes are a separate top-level entity (`Note` type, defined elsewhere) with an optional `attached_plan_id` FK. The Plan record reads them via that FK; this field is the eager-loaded view. Notes can outlive a Plan and reattach across versions; deleting a Plan does NOT cascade to Notes.

- **`archetype` / `archetype_secondary`** — copied from `client_profile.engagement.archetype` and `engagement.secondary_archetype`. Surfacing at Plan level supports archetype-filtered queries without parsing the ClientProfile blob.

---

## Plan Entity Lifecycle

The Plan moves through four states: `draft` → `in_review` → `delivered` → `archived`. Transitions are unidirectional except that `draft` ↔ `in_review` may bounce while the advisor iterates. After `delivered`, the only forward transition is `archived` (triggered by year-over-year refresh).

### State 1 — Draft

**Trigger:** Pipeline first runs (advisor uploads a fact review and kicks the generator).
**Who triggers:** Advisor manual action via the generator UI (Phase 6) OR direct CLI invocation.
**State entry actions (system, automatic):**
1. New Plan record created with a fresh UUID.
2. `client_id` resolved from FR (or supplied by advisor at upload time).
3. `generated_at`, `generated_by_advisor_id`, `source_fact_review_path`, `source_fr_content_hash` populated.
4. `plan_version` computed: query for max existing `plan_version` for this `client_id` and add 1; if none exist, set to 1.
5. `predecessor_plan_id` resolved: most recent delivered Plan for this client, or null.
6. `archetype` / `archetype_secondary` set to placeholder values; updated once Stage 1 completes and ClientProfile is available.
7. `status: "draft"`.
8. `is_current: false`. (Stays false until delivery.)
9. `generation_log_path: "artifacts/{plan_id}/"` — directory created.
10. As pipeline stages complete, their outputs are written into the Plan record AND mirrored to the generation_log_path: `client_profile`, `selected_recommendations`, `sequenced_plan`, `aggregate_metrics`. Each is schema-validated at write.
11. `action_items: []` — the top-level array stays empty during draft. The source-of-truth lives inside `sequenced_plan.action_items_flat[]`.
12. PDFs NOT rendered.

**Invariants while in draft:**
- `is_current === false`
- `delivery_date === null`
- `archive_date === null`
- `internal_plan_pdf_path === null`
- `client_facing_plan_pdf_path === null`
- `action_items.length === 0`
- Compliance fields all null.

### State 2 — In Review

**Trigger:** Advisor opens the draft Plan in the review UI and begins iterating.
**Who triggers:** Advisor manual action.
**State entry actions:** No data mutation; this is primarily a status flag for UI surfacing ("this Plan is being actively reviewed by an advisor — don't touch").

In this state, the advisor may:
- Re-run individual stages (e.g., re-quantify after editing ClientProfile).
- Edit the prose output in place (a re-run replaces the prose JSON; an edit appends a revision marker).
- Toggle landmine authorizations and re-run Stage 3a.
- Resolve firm policy questions and re-run Stage 3a.

Each re-run mutates the relevant pipeline artifact JSON in the Plan record AND writes a new versioned file into generation_log_path (e.g., `client_profile.v2.json`). The `total_generation_cost_cents` and `total_generation_duration_ms` accumulate. **The Plan record's pipeline artifacts always reflect the most recent run.** Prior versions live in generation_log_path for audit.

**Invariants while in_review:** Same as draft, except the pipeline artifacts are populated and may have been re-run. `action_items.length === 0` still holds.

**Reverse transition:** `in_review → draft` is allowed but rare; conceptually identical to "we backed out and need to start over." Equivalent to no-op for the data layer; just a status flag flip.

### State 3 — Delivered

**Trigger:** Advisor marks the Plan as ready for client delivery via the generator UI.
**Who triggers:** Advisor manual action. This is a deliberate, recorded event.
**Pre-conditions (system enforces):**
- All pipeline stages have completed successfully (no `_stage_status: "FAILED"` markers in any artifact).
- Stage 5 mechanical pre-checks `overall_status === "passed"` OR `"failed_auto_fixed"`. `"failed_blocked"` blocks delivery.
- `supervisory_review_signal.required === false` OR the supervisory review has been recorded as completed (post-v1 enhancement; v1 surfaces a warning but does not block).

**State entry actions (system, automatic, in order):**
1. **ActionItem extraction:** For each ActionItem in `sequenced_plan.action_items_flat[]`, create a top-level ActionItem record copied from the source. Set `source_plan_id` to this `plan_id`. See ActionItem Extraction section below for the full field-level rules.
2. **PDF rendering:** Internal plan PDF and client-facing plan PDF render. Storage paths populate `internal_plan_pdf_path` and `client_facing_plan_pdf_path`.
3. **Predecessor archive:** If `predecessor_plan_id !== null`, the predecessor Plan transitions: `is_current → false`, `status → "archived"`, `archive_date → now()`. ActionItems owned by the predecessor preserve their final completion status (see Year-Over-Year Refresh section).
4. **Current-flag flip:** This Plan's `is_current → true`.
5. **Status update:** `status → "delivered"`, `delivery_date → now()`.
6. **Generation log finalization:** Write a `delivery_manifest.json` to generation_log_path capturing the delivery state (PDFs rendered, ActionItems extracted count, predecessor archived, etc.).
7. **Cost / duration finalization:** `total_generation_cost_cents` and `total_generation_duration_ms` are frozen — no further accumulation.

**Invariants in delivered state:**
- `is_current === true` (until next year's plan delivers and supersedes).
- `delivery_date !== null`.
- `internal_plan_pdf_path !== null` and `client_facing_plan_pdf_path !== null`.
- `action_items.length > 0` (assuming the plan had any action items at all — qualitative-only plans may have zero).
- Pipeline artifacts (`client_profile`, `sequenced_plan`, etc.) are now considered immutable. Edits create new Plans, not mutations.

**Reverse transition:** `delivered → in_review` is NOT allowed via the data layer. If a delivery turns out to be incorrect, the operational path is to generate a new plan version and supersede. The original delivered Plan stays as-was for audit.

### State 4 — Archived

**Trigger:** A new Plan for the same client transitions to `delivered`.
**Who triggers:** System auto-trigger as part of the predecessor-archive step in State 3.
**State entry actions:**
- `is_current → false` (already handled by the successor's delivery transition).
- `status → "archived"`.
- `archive_date → now()`.
- ActionItems owned by the archived Plan: NO mutation. They retain whatever completion status they have at the moment of archive. The Tracker UI separates "current plan items" (active) from "historical items" (read-only by default, toggleable to view).

**Invariants in archived state:**
- `is_current === false`.
- `archive_date !== null`.
- All other fields immutable.

**Manual archive:** An advisor MAY manually archive a delivered Plan (e.g., client terminated the engagement) without a successor existing. In that case `is_current → false` and `status → "archived"`, but no successor Plan replaces it. The client has zero current plans until a new one delivers.

### Lifecycle invariants summary

| State | is_current | delivery_date | archive_date | PDFs | action_items | pipeline artifacts |
|---|---|---|---|---|---|---|
| draft | false | null | null | null | empty | partial / completing |
| in_review | false | null | null | null | empty | populated, may re-run |
| delivered | true | set | null | rendered | populated | immutable |
| archived | false | set | set | rendered | populated, retained | immutable |

---

## ActionItem Extraction From SequencedPlan

When a Plan transitions from `in_review` (or `draft` directly, in skip-review flows) to `delivered`, ActionItems flow from `sequenced_plan.sequenced_recommendations[*].action_items[]` (mirrored in `sequenced_plan.action_items_flat[]`) into top-level ActionItem records. This is a **deterministic copy operation, not a generative step.**

### Copy rules

For each ActionItem in `sequenced_plan.action_items_flat[]`:

1. **Identity preserved:** `action_item_id` carries forward unchanged. The Stage 3a-assigned id is the canonical id throughout the lifecycle. Idempotency: re-running the extraction (e.g., after a delivery rollback in a future schema) MUST NOT mint new ids.

2. **Lifecycle-class fields preserved:** All Stage 3a-populated fields carry over verbatim — `duration_class`, `check_in_cadence`, `partner_required`, `partner_type`, `is_derivative_reminder`, `auto_generated_reminder_template`, `category`, `source_recommendation_id`, `source_phase_or_step`, `description`, `sub_steps`, `timing_bucket`, `depends_on`, `is_decision_needed`. These are the action item's identity; nothing about the act of extraction changes them.

3. **`source_plan_id` populated:** Set to this Plan's `plan_id`. This is the primary new field at extraction time. Stage 3a leaves it null; delivery is where it gets bound.

4. **`status` initialized:** Top-level ActionItem status is `"not_started"` initially. (The `status` field is not part of the Stage 3a-emitted ActionItem schema in pipelineTypes.ts; it is added at extraction time as part of the top-level ActionItem record.) See "Top-level ActionItem schema additions" below.

5. **`owner` initialized to null:** Stage 3a sets `owner` to a role enum (`"PSA"`, `"CPA"`, etc.); the *named* owner (specific person) is null at extraction. Owners are assigned in morning meetings or as the advisor decides who-does-what. The role-level `owner` enum stays for filtering ("show me all CPA-owned items").

6. **`parent_action_item_id` carried (null for non-derivative items):** Stage 3a always emits `parent_action_item_id: null` and `is_derivative_reminder: false`. Those carry over. Derivative reminders are spawned at runtime by the Tracker post-delivery, NOT at extraction.

7. **`auto_generated_reminder_template` carried (non-null for long_running items):** The template recipe carries forward unchanged. The Tracker uses it to spawn reminders during the lifetime of long_running items.

### Top-level ActionItem schema additions

The top-level ActionItem record (the row in the ActionItems table) extends the in-pipeline ActionItem type with mutation fields the Tracker owns:

```typescript
interface TopLevelActionItem extends ActionItem {
  status: "not_started" | "in_progress" | "blocked" | "done";
  status_updated_at: string;                     // ISO 8601
  status_updated_by: string | null;              // Advisor / user id
  assigned_owner_user_id: string | null;         // FK → User; null until assigned
  completed_at: string | null;
  completion_notes: string | null;               // Free-text closing note
  blocked_reason: string | null;                 // When status === "blocked"
  due_date: string | null;                       // Computed from timing_bucket + delivery_date; advisor may override
  last_reminder_spawned_at: string | null;       // Tracks derivative reminder cadence
  reminder_count: number;                        // Number of derivative reminders spawned
}
```

**These fields belong to the Plan/Tracker layer, NOT the pipeline.** They are intentionally not part of `pipelineTypes.ts` because they have no meaning in pipeline output — they only exist after a Plan is delivered. The schema definition for TopLevelActionItem lives in the Plan persistence layer (Phase 6 work).

### Extraction is a copy, not a move

The original ActionItems remain inside `sequenced_plan.action_items_flat[]` as part of the immutable pipeline artifact record. Top-level ActionItems are a separate row in the ActionItems table, joined to the Plan via `source_plan_id`. Both records exist after delivery:

- `sequenced_plan.action_items_flat[]` — the as-generated, immutable record. Stays inside the Plan's `sequenced_plan` jsonb column.
- Top-level ActionItem rows — the live, mutable working set the Tracker reads and writes.

This dual-existence is intentional: the pipeline artifact is the audit trail (what we generated), the top-level row is the operational state (what we did with it).

### Extraction error handling

ActionItem extraction is deterministic and should not fail under normal conditions. If it does fail (e.g., DB constraint violation, schema validation failure on a top-level field):

1. The Plan stays in `in_review` (delivery transaction rolls back).
2. Error logged to generation_log_path as `delivery_extraction_error.json`.
3. Advisor sees a delivery-blocked banner with the error and a "retry delivery" option.

PDF rendering (a separate substep of delivery) likewise must succeed before status flips to `delivered`. Both are inside the same delivery transaction.

---

## Year-Over-Year Refresh

Plans version annually. Each year's fact review submission produces a new Plan; the prior year's Plan archives. ActionItem completion status is preserved across the boundary.

### Refresh trigger

A new fact review submitted for an existing client triggers a new Plan generation. The trigger may be:
- **Advisor-driven** — the advisor uploads a fresh FR via the generator UI.
- **Cadence-driven (post-v1)** — annual reminder workflow surfaces "client X is due for a refresh; advisor please submit FR."

The pipeline runs identically to a first-time generation. The only differences are:
1. `predecessor_plan_id` resolves to the prior-year Plan.
2. `plan_version` increments.
3. The pipeline MAY take advantage of predecessor data for change-detection (e.g., "client_profile delta vs. predecessor: new entity added") but this is an optimization, not a requirement. v1 generates fresh from the new FR alone.

### Refresh delivery semantics

When the new Plan transitions to `delivered` (per State 3 above):

1. **Predecessor `is_current → false`** — DB partial unique index ensures only the new Plan holds is_current.
2. **Predecessor `status → "archived"`, `archive_date → now()`** — see State 4 transition.
3. **Predecessor's ActionItems retain their final completion status** — no mutation. An item completed last year stays completed; an item still in_progress stays in_progress against its (now-archived) Plan.
4. **New Plan's ActionItems become the active set** — extracted at delivery per the rules above. They have their own `action_item_id`s and `source_plan_id` pointing at the new Plan.
5. **Tracker UI surfacing** (Phase 6 detail): default view shows current Plan's items as active; predecessor's items are visible as "show completed historical" with read-only treatment. Cross-version analytics ("of last year's items, how many got completed?") are queryable via `WHERE source_plan_id = predecessor_plan.plan_id`.

### Recurring-rec handling

When a recommendation appears in both the predecessor and the new Plan (e.g., REC-TAX-001 PTET annual re-election), each Plan generates its own ActionItems with new `action_item_id`s. The new ActionItems are NOT copies of the predecessor's; they are freshly extracted from the new SequencedPlan. The Tracker can correlate by `source_recommendation_id` if it wants to show "this year's PTET task succeeds last year's" — but the action_item_id is distinct and the lifecycle is independent.

If the predecessor's PTET ActionItem is still incomplete at the moment of refresh delivery, it stays incomplete — it is not auto-closed by the existence of a successor task. The advisor can mark it `done` via Tracker UI if the successor effectively supersedes it; otherwise it stays in `not_started` / `in_progress` / `blocked` against the archived plan.

### PDF preservation

Old Plan PDFs stay downloadable indefinitely. The internal version preserves as-delivered with no annotations. The client-facing version preserves as-delivered.

**v1.5 enhancement (deferred):** the client-facing PDF for an archived Plan COULD be re-rendered with completion annotations baked in (showing a checkmark next to completed items, a status label next to in_progress, etc.). This requires a re-render pipeline that takes a delivered Plan + its ActionItem completion state and produces an annotated PDF. For v1, archived PDFs are immutable and reflect the as-delivered state only. Annotation overlay is a v1.5 backlog item.

### Lens-plan refresh

If the predecessor had lens-derived plans (cash_flow_plan_id, investment_plan_id, insurance_plan_id), those lens plans:
- Stay attached to the predecessor Plan (the FK does not move).
- May be regenerated against the new Plan, in which case the new Plan's lens FKs populate to the regenerated lens-plan ids.
- May NOT be regenerated, in which case the new Plan's lens FKs stay null. Advisors can choose to regenerate per-lens on demand.

Lens plans, like Plans, archive when superseded. Their archive triggers are independent of the parent Plan's lifecycle (a lens may be regenerated mid-Plan-lifecycle if firm decides to refresh a single lens).

---

## PDF Artifact Path Conventions

The `generation_log_path` directory is the canonical audit trail for a Plan. Structure:

```
artifacts/{plan_id}/
├── internal_plan.pdf
├── client_facing_plan.pdf
├── delivery_manifest.json                         (created at delivery transition)
├── cost_log.json                                  (per-stage cost rollup)
└── generation_log/
    ├── stage_0_validation.json
    ├── client_profile.json                        (Stage 1 output)
    ├── selected_recommendations.json              (Stage 2 output OR fixture)
    ├── quantified_recommendations.json            (Stage 3a output)
    ├── sequenced_plan.json                        (Stage 3b output)
    ├── aggregate_metrics.json                     (Stage 4 glue)
    ├── methodology_appendix.md                    (Stage 4 glue)
    ├── top_priorities_block.md                    (Stage 4 glue)
    ├── stage_4_executive_summary_raw.json         (Stage 4 LLM)
    ├── stage_5_audit_result.json                  (Stage 5 LLM, post-prose audit)
    ├── mechanical_check_results.json              (Stage 5 mechanical pre-checks)
    └── qc_results.json                            (final QC roll-up)
```

### Naming and versioning

- During `in_review` re-runs, prior versions of mutated artifacts live alongside the current version with a `.v{N}.json` suffix (e.g., `client_profile.v2.json`). The unsuffixed file is always the most recent.
- After delivery, the unsuffixed files are frozen. Versioned files stay for audit.
- File names use snake_case to match the JSON output convention used throughout the pipeline.

### Storage backend

For v1: Vercel Blob OR Supabase Storage (decision deferred to Phase 6 infrastructure pick). The path is logical (`artifacts/{plan_id}/...`); the storage layer maps it to the underlying backend.

PDFs are typically a few MB each. JSON artifacts vary from tens of KB (Stage 0 validation result) to several MB (full SequencedPlan with 25+ recs). Total directory size: typically 5–15 MB per Plan.

### Retention

For v1: indefinite retention. Storage cost is negligible relative to the audit value. Post-v1 compliance work may introduce explicit retention-expiry dates and archival-tier transitions (see Compliance Considerations).

### Audit reconstruction

A compliance reviewer or auditor can fully reconstruct a Plan's generation by reading the generation_log_path:
- `client_profile.json` shows what Stage 1 extracted from the FR.
- `selected_recommendations.json` shows what Stage 2 chose and why (rationales embedded).
- `quantified_recommendations.json` shows the per-rec quantification state and ActionItem extraction.
- `sequenced_plan.json` shows the deterministic assembly.
- `aggregate_metrics.json` shows aggregate roll-ups with provenance.
- `methodology_appendix.md` documents how every number was derived.
- `mechanical_check_results.json` shows what Stage 5 caught and what it auto-fixed.

This reconstruction is a primary requirement of the audit story; the PDF alone is insufficient.

---

## Database Considerations

For v1 (Vercel + Supabase + Postgres), the persistence sketch below is illustrative, not migration-ready. Migration scripts and final column types belong to Phase 6.

### Tables (v1)

**`plans`** — primary entity. Columns:

| Column | Type | Notes |
|---|---|---|
| plan_id | uuid PRIMARY KEY | |
| client_id | uuid NOT NULL | FK → `clients.client_id` |
| plan_version | integer NOT NULL | |
| is_current | boolean NOT NULL DEFAULT false | |
| generated_at | timestamptz NOT NULL | |
| generated_by_advisor_id | uuid NOT NULL | FK → `advisors.advisor_id` |
| source_fact_review_path | text NOT NULL | |
| source_fr_content_hash | text NOT NULL | |
| status | text NOT NULL CHECK (status IN ('draft','in_review','delivered','archived')) | |
| delivery_date | timestamptz | |
| archive_date | timestamptz | |
| client_profile | jsonb NOT NULL | |
| selected_recommendations | jsonb NOT NULL | |
| sequenced_plan | jsonb NOT NULL | |
| aggregate_metrics | jsonb NOT NULL | |
| internal_plan_pdf_path | text | |
| client_facing_plan_pdf_path | text | |
| cash_flow_plan_id | uuid | FK → `cash_flow_plans` |
| investment_plan_id | uuid | FK → `investment_plans` |
| insurance_plan_id | uuid | FK → `insurance_plans` |
| predecessor_plan_id | uuid | FK → `plans.plan_id` (self-referential) |
| generation_log_path | text NOT NULL | |
| total_generation_cost_cents | integer NOT NULL DEFAULT 0 | |
| total_generation_duration_ms | bigint NOT NULL DEFAULT 0 | |
| compliance_id | text | null in v1 |
| supervisory_review_signal | jsonb NOT NULL | |
| archetype | text NOT NULL CHECK (archetype IN ('PRE','POST','ACT','FO','FOUND')) | |
| archetype_secondary | text | same CHECK list |
| created_at | timestamptz NOT NULL DEFAULT now() | |
| updated_at | timestamptz NOT NULL DEFAULT now() | |

Indexes:
- `(client_id, plan_version)` — UNIQUE.
- `(client_id) WHERE is_current = true` — UNIQUE PARTIAL. Enforces "one current plan per client."
- `(client_id, status)` — supports "list all delivered plans for client."
- `(generated_by_advisor_id, status)` — supports "show me my drafts."
- GIN on `client_profile` and `sequenced_plan` jsonb — supports content search and archetype/category filtering.

**`action_items`** — top-level, separate from the `sequenced_plan` jsonb embedding.

| Column | Type | Notes |
|---|---|---|
| action_item_id | text PRIMARY KEY | Stage 3a-assigned id; carried verbatim |
| source_plan_id | uuid NOT NULL | FK → `plans.plan_id` |
| source_recommendation_id | text NOT NULL | |
| description | text NOT NULL | |
| sub_steps | jsonb NOT NULL DEFAULT '[]' | |
| category | text NOT NULL | |
| owner | text NOT NULL | role-enum |
| owner_name | text | |
| timing_bucket | text NOT NULL | |
| depends_on | jsonb NOT NULL DEFAULT '[]' | array of action_item_id strings |
| is_decision_needed | boolean NOT NULL DEFAULT false | |
| duration_class | text NOT NULL | |
| check_in_cadence | text | |
| partner_required | boolean NOT NULL | |
| partner_type | text | |
| parent_action_item_id | text | self-reference for derivative reminders |
| is_derivative_reminder | boolean NOT NULL DEFAULT false | |
| auto_generated_reminder_template | jsonb | |
| status | text NOT NULL DEFAULT 'not_started' | |
| status_updated_at | timestamptz NOT NULL DEFAULT now() | |
| status_updated_by | uuid | FK → users |
| assigned_owner_user_id | uuid | FK → users |
| completed_at | timestamptz | |
| completion_notes | text | |
| blocked_reason | text | |
| due_date | date | |
| last_reminder_spawned_at | timestamptz | |
| reminder_count | integer NOT NULL DEFAULT 0 | |
| created_at | timestamptz NOT NULL DEFAULT now() | |
| updated_at | timestamptz NOT NULL DEFAULT now() | |

Indexes:
- `(source_plan_id, status)` — primary Tracker query.
- `(source_plan_id)` — for "show all items on this plan."
- `(assigned_owner_user_id, status) WHERE status IN ('not_started','in_progress')` — "my active items."
- `(parent_action_item_id) WHERE parent_action_item_id IS NOT NULL` — derivative reminder lookups.
- `(source_recommendation_id)` — cross-version "all PTET tasks for client X over time" via join.

**`notes`** — separate top-level entity. Optional FKs: `attached_plan_id`, `attached_action_item_id`, `attached_client_id`. Schema details defined in Notes spec (out of scope here).

**PDF storage:** Supabase Storage or Vercel Blob. Path keys stored in `internal_plan_pdf_path` / `client_facing_plan_pdf_path`. No DB column for blob contents.

### State-transition enforcement

Plan status transitions enforced via a CHECK constraint or trigger:
- `draft → in_review`, `draft → delivered` (skip-review), `in_review → delivered`, `in_review → draft`, `delivered → archived` are legal.
- All other transitions rejected.

The `is_current` partial unique index handles the predecessor-archive race: the new Plan's delivery transaction must update the predecessor's `is_current → false` *before* setting its own `is_current → true`, all within a single transaction.

### Rationale: jsonb for pipeline artifacts vs. normalized tables

Pipeline artifacts (`client_profile`, `sequenced_plan`, etc.) are stored as jsonb rather than fully normalized. Trade-offs:

- **Pro jsonb (what we picked):** schemas evolve at pipeline-spec speed, not migration speed. The pipeline already produces validated JSON; no additional ORM mapping needed. GIN indexes give content-search adequacy. Document-style storage matches the read pattern (the Tracker / Client Overview reads "the whole plan" or "specific top-level fields," rarely a deep slice).
- **Con jsonb:** harder to query for cross-plan analytics ("which clients have an active GRAT?"). Mitigated by GIN indexes plus, where critical, materialized views or computed columns. v1 can ship without those; if cross-plan queries become hot paths, add them in Phase 6+.

Top-level entities the broader app reads heavily (ActionItems, Notes) ARE normalized into their own tables; the jsonb embedding inside `sequenced_plan` is the audit copy, the table rows are the operational copy.

---

## Compliance Considerations

### v1 stance

Compliance integration is deferred. The v1 Plan record:
- Carries `compliance_id: null`.
- Carries `supervisory_review_signal: SupervisoryReviewSignal` populated from the pipeline.
- Provides `generation_log_path` as the audit trail.

These three together meet the v1 audit-readiness bar: a reviewer can reconstruct any plan from generation_log_path, and the supervisory_review_signal flags any plan that needs special attention.

The `compliance_id` field stays in the schema as a forward-compatible placeholder; it is never read or written in v1 code paths.

### Post-v1 compliance fields (deferred)

When compliance integration is built (post-v1), the Plan schema gains:

- `compliance_review_status` — enum: `"pending" | "approved" | "rejected_with_feedback" | "approved_with_conditions"`.
- `compliance_reviewer_id` — FK → ComplianceReviewer.
- `compliance_review_date` — timestamptz.
- `compliance_review_notes` — text.
- `retention_expiry_date` — date. Default 6 years post-delivery (RIA recordkeeping rule).
- `worm_storage_flag` — boolean. WORM-equivalent storage for delivered plans (write-once, read-many) — when true, the storage layer enforces immutability at the object-store level.

These additions are **schema-only** at the Plan layer; the actual compliance workflow (review queue, reviewer UI, condition tracking) lives in a separate compliance subsystem spec.

**Do not build these fields in v1.** They are documented here so the Plan schema's evolution path is visible and so post-v1 work can land them without surprise.

### Audit retention semantics (v1 implicit)

In v1, all Plans and their generation_log_path artifacts persist indefinitely. The implicit retention is "forever." When post-v1 compliance lands, retention becomes explicit and bounded; archival tiering (move to cold storage after N years) becomes possible.

### Supervisory review signal usage

`supervisory_review_signal.required === true` indicates the Plan needs principal/OSJ review before client delivery (regulatory or firm-policy reasons). v1 surfaces this as a warning banner in the delivery UI and logs it; v1 does NOT block delivery automatically. Post-v1: an admin setting can toggle "block delivery on supervisory_review.required" for firms that want hard enforcement.

---

## Integration Surface (Read Contracts for Downstream Features)

The Plan entity is read by:

- **Tracker** — reads `action_items` joined via `source_plan_id`, scoped by `is_current` for the active view. Mutates ActionItem status/owner/completion fields.
- **Client Overview** — reads `aggregate_metrics`, `archetype`, `delivery_date`, `internal_plan_pdf_path`. Renders summary cards.
- **Notes** — Notes attach via `attached_plan_id`. Plan reads attached notes via `attached_notes` (eager) or via Note table query (lazy).
- **Lens generators (Cash Flow / Investment / Insurance)** — read `client_profile` and `sequenced_plan`. Generated lens-plans link back via the FK fields on Plan.
- **Year-over-year refresh trigger** — reads `client_id`, `is_current`, `delivery_date`, `predecessor_plan_id` for cadence logic.
- **Compliance audit (v1: manual; post-v1: structured)** — reads `generation_log_path`, `supervisory_review_signal`, `compliance_*` fields.

All downstream readers should treat pipeline artifacts (`client_profile`, `sequenced_plan`, etc.) as **read-only**. Mutation happens only via the controlled transitions above (re-runs in `in_review`; never in `delivered` / `archived`).

---

## What This Does NOT Do

- Does NOT define database migration scripts (Phase 6 owns this).
- Does NOT define the UI for plan management — generator review screens, delivery confirmation modals, archive views (Phase 6).
- Does NOT define PDF rendering details — layout, theme, completion annotations, watermarks (separate spec when PDF export is built).
- Does NOT define Tracker UI behaviors — list views, filtering, derivative reminder display, completion flows (Phase 6).
- Does NOT define Notes schema, attachment UI, or threading (separate Notes spec).
- Does NOT define lens-plan schemas (CashFlowPlan, InvestmentPlan, InsurancePlan have their own specs).
- Does NOT define the Client entity, Advisor entity, or User entity (separate specs).
- Does NOT define compliance workflow (post-v1 compliance spec).
- Does NOT define authentication or authorization rules for plan access (separate auth spec).
- Does NOT define background job / queue infrastructure for delivery transactions (Phase 6 infrastructure).

---

## Flagged Decisions (Made Autonomously During Spec Authoring)

The following decisions were made while authoring this spec to keep it self-consistent. Each is reversible.

1. **`action_items: []` during draft / in_review.** I chose to keep the top-level `action_items` array empty until delivery, with the source-of-truth living in `sequenced_plan.action_items_flat[]` until the extraction copy at delivery. Alternative: extract eagerly at draft creation and have the Tracker show "draft items." I picked late extraction because (a) draft / in_review iterations may re-run Stage 3a multiple times, and eager extraction would mean repeatedly creating and orphaning ActionItem rows, and (b) the Tracker should not surface items from a plan the advisor has not yet decided to deliver. If we want a "draft preview" mode in the Tracker, we'd build a separate read path that pulls from `sequenced_plan.action_items_flat` directly, no top-level extraction needed.

2. **Top-level ActionItem schema additions (`status`, `assigned_owner_user_id`, `completed_at`, etc.) live OUTSIDE `pipelineTypes.ts`.** Rationale: these fields have no meaning in pipeline output. Adding them to the pipeline ActionItem type would force every pipeline test fixture and every Stage 3a output to populate them with placeholders. Cleaner to define `TopLevelActionItem extends ActionItem` at the Plan persistence layer. The `pipelineTypes.ts` ActionItem stays pure to the generation contract.

   **Status enum aligned with Spec 5 (App Architecture).** The initial Spec 2 draft proposed `completed | deferred | cancelled`; v1 ships with the simpler `not_started | in_progress | blocked | done` per `app_overview.spec.md`. v1.5 may add `deferred` / `cancelled` if usage demands. The TopLevelActionItem schema above reflects the v1 enum; `completion_notes`, `completed_at`, and `blocked_reason` are retained as descriptive fields alongside the simpler enum.

3. **`is_current` enforced via partial unique index, not trigger.** Postgres partial unique indexes (`UNIQUE (client_id) WHERE is_current = true`) are the idiomatic way; triggers would work but are less standard. Both transactions involving an `is_current` flip (predecessor's flip-to-false, new Plan's flip-to-true) must occur in the same DB transaction to avoid the brief window where neither plan is current.

4. **`delivered → in_review` reverse transition is NOT supported at the data layer.** If a delivery is incorrect, the operational path is "generate a successor plan." This avoids the complexity of un-extracting ActionItems, un-archiving the predecessor, and un-rendering PDFs. If the advisor needs to retract a delivery within seconds (e.g., they hit "Deliver" by accident), the UI can offer a "soft retract" within a short window that simply un-flips status and clears delivery_date — but this is a UI concern, not a data-model concern, and is deferred to Phase 6.

5. **Lens-plan FKs are nullable and lazy.** Plans do not auto-generate lens-derived plans at delivery. Lens plans are generated on demand. The Plan record carries the FK so downstream features can answer "does this client have a current cash-flow plan?" with a single field check rather than a separate table scan.

6. **`generation_log_path` as a single string rather than structured columns.** All the per-stage artifacts live under `artifacts/{plan_id}/...` and the path is uniformly derivable from `plan_id`. Flattening into structured columns (one path per stage) would balloon the schema for no read-time benefit. The path string is the convention; readers concatenate the stage filename.

7. **Pipeline artifacts stored as `jsonb`, not normalized.** Discussed in Database Considerations. Trade-off accepted: write-time schema-validation discipline + GIN indexes for content search, in exchange for migration-velocity and read-pattern alignment. Reversible if cross-plan analytics become a hot path.

8. **Indefinite retention in v1.** No retention-expiry logic in v1 schema. Post-v1 compliance will introduce bounded retention. Storage cost is negligible at v1 client volumes (single-digit-thousands of plans).

9. **Note as a forward reference.** This spec references `Note[]` and `attached_notes` but does not define the Note type. The Notes spec is a separate deliverable in Phase 1 or later. The Plan schema's `attached_notes` field is a forward-compatible placeholder; v1 code can leave it as `Note[]` with `Note` defined as `unknown` until the Notes spec lands.

10. **Compliance fields documented but not in v1 schema.** Per the architecture decision that compliance integration is deferred. v1 ships with `compliance_id: null` only; the post-v1 compliance fields are documented for forward planning but not implemented. This keeps the v1 schema lean and lets compliance work land as an additive migration without rework.

---

## V2 / Post-v1 Backlog

- **Compliance fields** — `compliance_review_status`, `compliance_reviewer_id`, `compliance_review_date`, `retention_expiry_date`, `worm_storage_flag`.
- **Annotated archived PDFs** — re-render archived client-facing PDFs with completion annotations baked in.
- **Cross-plan analytics indexes** — materialized views for "active GRATs across all clients," "PTET adoption rate by year," etc.
- **Plan diff view** — UI feature reading two adjacent Plans and highlighting deltas (new recs, dropped recs, changed quantification states). Schema unaffected; pure read-side.
- **Lens regeneration triggers** — when a Plan refresh detects a material delta in inputs that drive a lens plan, auto-flag the lens for regeneration.
- **Soft-retract delivery window** — short post-delivery grace period during which the advisor can un-deliver without creating a successor plan.
- **Archival storage tiering** — move generation_log_path artifacts to cold storage after N years.
