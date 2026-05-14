# v1.5 Backlog

Cross-stage ship-risk callouts and follow-ups deferred from v1. These are
NOT blockers for v1 ship, but should be addressed before v1.5 calibration
freeze. Each item links to the originating phase + commit context where the
issue surfaced.

Stage-specific backlog items also live inline in their respective spec files
under `## v1.5 backlog` sections; this file is the cross-cutting roll-up that
spans architecture, reliability, and observability concerns.

---

## Resolved in Phase 10B (2026-05-04)

- **Stage 0/1/2 production integration** — `/plans/generate` accepts a
  Fact Review .docx/.pdf; the CLI runs the full Stage 0 → 5 chain.
  Manual JSON authoring is preserved as a power-user fallback.
- **Hardcoded advisor ID** in `generatePending.ts` — replaced with a
  dynamic lookup against `advisors` rowed by `plans.generated_by_advisor_id`,
  slug-matched to the KB advisor registry.
- **Stage 3a `_sequencer_status: undefined` on success** — orchestration
  now stamps `"SUCCESS"` explicitly; the field's type widens to
  `"SUCCESS" | "FAILED" | undefined`.
- **PDF support** — `pdf-parse` wired into `factReviewIO`; advisors can
  upload either .docx or .pdf. Image-only/scanned PDFs surface as a
  Stage 0 file_integrity failure (OCR remains out of scope).

## Resolved in Phase 10C (2026-05-05) — first production hardening pass

- **Vercel KB bundling** — `next.config.ts` adds
  `outputFileTracingIncludes` for `/api/plans/generate`. Trace manifest
  shows kb/ files included, but runtime path resolution proved
  unreliable; Phase 10D.2 follows up by inlining the only KB file Stage
  0 actually reads.
- **Stage 0 strictness for real Fact Reviews** — REQUIRED_SECTIONS,
  OWNER_NAME_LABELS, ENTITY_NAME_LABELS, and ARCHETYPES alternative
  lists massively expanded; Haiku 4.5 LLM fallback added that fires
  only when deterministic matching leaves gaps. Cost ~$0.01–$0.05 per
  fallback when triggered, $0 otherwise.
- **Stage 0 error messaging** — failure remediation now surfaces the
  exact first 8 alternative labels Stage 0 looked for, plus an explicit
  fallback pattern advisors can drop into the FR (e.g., "Name: <Full
  Name>") rather than asking them to restructure headers.

## Resolved in Phase 10D (2026-05-05) — Stage 0 architectural rethink

- **Stage 0 reclassified as a diagnostic checkpoint** (10D.1) — only
  `file_integrity` failures return 422. Section / field / archetype /
  freshness misses are surfaced as warnings in the 202 response body
  and rendered as a yellow informational notice on the form's success
  state. Stage 1's LLM parser is robust enough to recover from
  heuristic misses; Stage 1's Zod schema validation gates data
  correctness downstream.
- **KB volatile rates inlined** (10D.2) — Stage 0 no longer reads
  `kb/v1_2/02_reference/08_volatile_rates_lookup.md` at runtime.
  Reads from inlined `src/lib/orchestrator/data/volatileRates.ts`
  constant. Eliminates Vercel filesystem dependency. Refresh requires
  updating both the KB markdown (still consumed by Stage 3a's CLI
  context) and the TS module.

---

## Stage 3a reliability at Holloway scale

**Surfaced:** Phase 3.4 first attempt (full Stage 3a→4→5 live), 2026-05-03.

Stage 3a's stochastic schema-retry behavior cost an entire lens (Succession,
8 recs) and burned $32.74 before the orchestrator halted the pipeline. Two
contributing root causes:

1. **Schema-retry instability.** Three of eleven Holloway batches needed a
   schema-validation retry on first attempt; the cached run had four retries
   that all succeeded, while the Phase 3.4 fresh run had three retries and
   one (batch 5, Succession) failed both attempts. The retry mechanism is
   working — but the underlying failure rate per batch is high enough that
   on a standard 11-batch engagement we should expect roughly one full-batch
   loss per N runs at the current settings. The empirical retry-rate
   observation has been logged across Phase 3.1c and Phase 3.4; the v1.5
   prompt-engineering pass should target a measurable reduction.

2. **Output near MAX_TOKENS.** Batch 5's failed retry produced 34,726 output
   tokens, exceeding the 32K MAX_TOKENS cap. Truncation likely contributed to
   the schema failure. Two batches in the cached run produced 35K+ on retry
   and succeeded, so the relationship between truncation and schema-validation
   failure is probabilistic, not deterministic. The current `DEFAULT_BATCH_SIZE
   = 8` already represents a Phase 3.1c reduction from 12 → 8 to protect
   against high-density outliers; further reduction (to 6 or 5) trades
   reliability for batch count and cost. Worth profiling on additional client
   fixtures before deciding.

**Why:** Pipeline reliability is the single biggest blocker to advisor trust
in production. Losing an entire lens silently is worse than a slow run.

**How to apply:** Plan two work items: (a) prompt-engineering pass on
`stage3a1.system.md` targeting schema-conformance density on the categories
that retry most often (Succession, Estate, Entity); (b) revisit
`DEFAULT_BATCH_SIZE` once we have run-rate data from a second client.

---

## Stage 3a State A estimate run-to-run drift

**Surfaced:** Phase 3.4 first attempt cross-stage comparison vs cached
artifact, 2026-05-03.

Even on batches that "succeed" (no schema retry, all recs returned), Stage 3a
estimate values vary meaningfully across runs:

- `REC-CHR-001`: $28K (cached) vs $280K (fresh) — **+900%** drift
- `REC-FAM-003`: $230K (cached) vs $15K (fresh) — **-93.5%** drift
- `REC-RSK-007`: $6K vs $5K — -16.7% drift (modest)
- `REC-EST-006`, `REC-RET-001`: 0% drift on both runs

10x swings on individual recs suggest the LLM is picking different scenarios
or assumptions from the same underlying fact pattern. This is invisible at
the orchestrator level (the rec count matches; the schema validates) but
materially affects the dollar figures advisors will discuss with clients.

**Why:** Advisors anchor on the dollar figures. If the same client fact set
produces $28K one run and $280K the next, the figures are not load-bearing
and the advisor's trust in the system collapses.

**How to apply:** Calibrate by running Stage 3a 5–10× against the same
fixture and quantifying drift distribution per category. Items beyond a
defined drift threshold (e.g., >25% midpoint variance) may need explicit
scenario-disambiguation in the system prompt or formula-id pinning. Pair
this with the existing detectAllNumbersDrift v2 work item (Phase 3.2 backlog).

---

## Stage 3a `_sequencer_status` field inconsistency

**Surfaced:** Phase 3.4 Option C cross-stage report, 2026-05-03.

The cached Stage 3a artifact (`stage3a_full_pipeline_test_v2.json`, written
pre-Phase 3.3) reports `_sequencer_status: undefined` on a clean SUCCESS
run, while the Phase 3.4 first-attempt FAILED artifact reports
`_sequencer_status: "FAILED"`. The field is only set on the failure path;
the orchestrator's success path leaves it absent.

This makes external runners' status-detection logic asymmetric — they have
to combine "is `_sequencer_status === 'FAILED'`?" OR "are there failed
batches in `_metadata.per_batch`?" rather than reading a single field.

**Why:** Defensive runner code that branches on `_sequencer_status` will
silently misclassify a clean run as "unknown status" and may emit confusing
diagnostics (as Phase 3.4's Option C report did, printing `undefined` next
to the SUCCESS path).

**How to apply:** Either (a) populate `_sequencer_status: "SUCCESS"` on the
clean path in `stage3aOrchestration.ts`, or (b) document the field as
"FAILED-only sentinel" and update the schema doc + downstream consumers.
Option (a) is the lower-risk change; option (b) preserves the current shape
but requires more downstream awareness.

---

## Phase 6 PDF — page numbers

**Surfaced:** Phase 6 (React-PDF integration), 2026-05-03.

`@react-pdf/renderer` 4.5.1's `<Text render={({ pageNumber, totalPages }) => …}>`
callback throws `unsupported number: -8.987253937891275e+21` from
`pdfkit`'s `clipBorderTop` whenever paired with a body that exceeds one
page. Reproduced via 8-test bisection (smoke script preserved in
`baf60b7..HEAD` if/when reverted from the Phase 6 commit).

The failure is independent of:
- whether `totalPages` is requested or just `pageNumber`
- where the page-number `Text` is positioned (split fixed View, inlined
  in same `Text render`, separate fixed View at right edge)
- whether borders are present on the footer
- which body content triggers it (RB lens alone, IR table alone, full
  PlanDocument — all multi-page bodies fail)

Without `Text render`, every variant renders cleanly. v1 ships with no
per-page numbering — footer shows firm + "Confidential" + compliance ID
+ plan-ID slug + disclosure line.

**Why:** "Page 12 of 38" is nice-to-have on a 30-page client-emailed PDF;
it's load-bearing on a 200-page printed binder, which v1 doesn't ship.
Compliance ID + plan-ID slug are already on every page; auditors care
about those.

**How to apply:** Three paths, in order of preference:
1. Monitor `@react-pdf/renderer` 4.x patch releases for a fix; restore
   the page-number `Text render` in `src/lib/pdf/components/PageChrome.tsx`
   when the upstream bug is closed.
2. Migrate to `@react-pdf/renderer` 5.x if it ships and the regression
   is gone.
3. Workaround: render the document twice — first pass to count pages,
   second pass with a hardcoded `Page N of TOTAL` per page. Hacky;
   doubles render cost; not robust if React-PDF computes a different
   page split on the second pass. Last resort.


---

## Phase 17 follow-ups (Architecture foundation)

Tracking the v1.5 backlog created by Phase 17. Full per-item context is
in the AGENTS.md "Phase 17" section.

### Plan / Lens execution

- **Phase 18: Hosted orchestrator** — replace the manual
  `npm run generate-pending` SPOF with Inngest or pg-boss. Removes the
  Phase 17.9 transparency banner. Critical when the team grows past 3
  advisors or volume exceeds ~5 plans/hour.
- **Approval promotion preview** — modal before `POST /plans/[id]/approve`
  listing the N action items about to spawn so advisor can review
  category / timing / owner mappings before committing.
- **Per-nested-action-item promotion mode (Phase 19)** — opt-in toggle
  that emits ~400 rows for Holloway-scale plans instead of 80. Most
  clients won't want this granularity, but power users will.
- **Approve-without-promotion mode** — for compliance-only re-approvals
  that don't need a fresh action item batch.
- **Lens "current" cross-reference in plan body (Phase 20)** — when a
  plan is generated for a client with a current lens, the plan body
  could deep-link the lens.

### Cadence engine

- **last_meaningful_contact_at backfill (Phase 21)** — derive from
  latest existing note / audit_log entry per client so the Going Stale
  module doesn't paint every existing client as overdue on day one.
- **Cadence color coding on /clients list** — surface red / amber
  chips on rows past their threshold for the same at-a-glance signal
  the dashboard module provides.
- **Cadence-based notifications** — Slack / email / iMessage when a
  client crosses their threshold.
- **Stage 1/4 cadence override emission** — plan generator could
  propose Monthly during the transaction window, then Quarterly
  post-exit.

### Provenance UX

- **Action item drawer: source link** — surface `source_plan_id` in
  the drawer with a deep link back to the plan.
- **Lens-source provenance includes rec id** — currently the chip
  shows only "from lens" without the rec slug. Phase 13/14 push
  endpoints don't write source_recommendation_id; could be added so
  the chip carries the same fidelity as plan-sourced items.

### Audit log

- **Add 'meaningful_touch' as explicit audit_log.action** — currently
  recordMeaningfulTouch writes `action='updated'` +
  `details.kind='meaningful_touch'`. A first-class enum value would
  make audit_log queries cleaner. Requires migration to expand
  audit_log_action_check.

### Migration tracking

- **Apply migration 0007** via Supabase Dashboard SQL editor before
  Phase 17 features are live in production. Idempotent.

