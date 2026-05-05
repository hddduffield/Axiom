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
