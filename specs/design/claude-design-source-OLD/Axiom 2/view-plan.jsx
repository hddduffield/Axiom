// =============================================================================
// Plan view — /plans/[id]
// =============================================================================
// Renders a Stage4Result as a long-form, professional plan document.
//
// API contract surface (v1):
//   GET    /plans/{id}                 → returns plan + stage4_output (JSONB)
//   POST   /plans/{id}/approve         → status: ready_for_review → approved
//   POST   /plans/{id}/archive         → status: any → archived
//   GET    /plans/{id}/pdf             → returns React-PDF rendered binary
//   POST   /plans/{id}/regenerate      → enqueues new orchestrator run
//
// Data shape (stage4_output, when present):
//   { title_page, exec_summary, our_process, client_snapshot,
//     goals, findings, recs_business[], recs_personal[], roadmap[],
//     decisions[], advisory_team[], cadence[], glossary[], disclosures }
//
// Until stage4_output lands, every section renders a `placeholder-block`
// strip so the field path is visible to advisors AND to Claude Code
// during real-data wiring. The strip's text IS the JSON path.
//
// Tabs/states this page must handle:
//   - status: "draft" | "ready_for_review" | "approved" | "archived"
//   - empty:  stage4_output === null  (orchestrator hasn't run yet)
//   - loading: server-driven; we mock it via ?demo=loading
//   - error:  server-driven; we mock it via ?demo=error
// =============================================================================

function PlanView({ planId }) {
  const D = window.AXIOM_DATA;
  const plan = D.PLANS.find(p => p.id === planId);

  // Demo state hooks — read ?state=loading|error|empty from hash for showcase.
  // In production these are driven by SWR/React Query against GET /plans/{id}.
  const demoState = getPlanDemoState();

  if (!plan) return <PlanNotFound planId={planId} />;
  if (demoState === "loading") return <PlanLoading plan={plan} />;
  if (demoState === "error")   return <PlanError plan={plan} />;

  const client = getClient(plan.client_id);
  const isEmpty = demoState === "empty" || !plan.has_stage4_output;

  const [activeSection, setActiveSection] = React.useState(2);

  // Status badge — drives header chrome + which action buttons render.
  const statusBadge = renderPlanStatus(plan);

  return (
    <div className="page" style={{ maxWidth: 1280 }} data-screen-label={`07 Plan · ${plan.title}`}>
      <PageHead
        crumbs={[
          { label: "Clients", to: "/clients" },
          { label: client.household_name, to: `/clients/${client.id}` },
          { label: plan.title },
        ]}
        title={plan.title}
        subtitle={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span className="mono">{plan.id}</span>
            <span className="dim">·</span>
            {statusBadge}
            <span className="dim">·</span>
            <span>Created {fmtDate(plan.created_at)}</span>
            {plan.fact_review_filename && (
              <>
                <span className="dim">·</span>
                <span>Fact review <span className="mono">{plan.fact_review_filename}</span></span>
              </>
            )}
          </span>
        }
        actions={<PlanActions plan={plan} />}
      />

      {/* Empty-state banner — orchestrator hasn't produced stage4_output yet. */}
      {isEmpty && (
        <div className="card" style={{
          marginBottom: 20,
          background: "var(--surface-2)",
          borderStyle: "dashed",
        }}>
          <div className="card__body" style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "14px 16px" }}>
            <div style={{ width: 28, height: 28, borderRadius: 4, background: "var(--surface)", border: "1px solid var(--border)", display: "grid", placeItems: "center" }}>
              <ClockIcon />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 2 }}>Plan content not yet generated</div>
              <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.5 }}>
                The orchestrator is queued to assemble this plan from the fact review and selected recommendations.
                Sections below show the document structure with field-path placeholders. Average run time: ~12 minutes.
              </div>
            </div>
            <button className="btn btn--sm"
                    data-api="POST /plans/{id}/regenerate"
                    title="Re-trigger orchestrator">
              <RefreshIcon /> Re-trigger
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 32 }}>
        {/* TOC rail — sticky; clicking scrolls to section. In production: smooth-scroll + IntersectionObserver to track active. */}
        <aside style={{ position: "sticky", top: 72, alignSelf: "start" }}>
          <div className="dim" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Contents</div>
          <nav style={{ display: "flex", flexDirection: "column", gap: 0 }}
               aria-label="Plan sections">
            {D.PLAN_SECTIONS.map(s => (
              <a key={s.num}
                 onClick={() => {
                   setActiveSection(s.num);
                   const el = document.getElementById(`s-${s.num}`);
                   if (el) el.scrollIntoView ? null : null; // intentionally no-op (rule); rely on hash
                   window.location.hash = `#/plans/${plan.id}#s-${s.num}`;
                 }}
                 className="plan-toc-link"
                 href={`#s-${s.num}`}
                 style={{
                   display: "flex", gap: 10, padding: "6px 8px",
                   fontSize: 12, color: activeSection === s.num ? "var(--text)" : "var(--text-2)",
                   borderLeft: activeSection === s.num ? "2px solid var(--accent)" : "2px solid transparent",
                   marginLeft: -10, paddingLeft: 12,
                   cursor: "pointer", lineHeight: 1.35,
                   fontWeight: activeSection === s.num ? 500 : 400,
                 }}>
                <span className="mono dim" style={{ fontSize: 10, paddingTop: 2, color: "var(--text-3)" }}>{String(s.num).padStart(2, "0")}</span>
                <span>{s.title}</span>
              </a>
            ))}
          </nav>

          {/* Doc-level metadata panel — useful for advisors during review. */}
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
            <div className="dim" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Plan facts</div>
            <dl className="kv" style={{ gridTemplateColumns: "1fr", gap: 6, fontSize: 11 }}>
              <div><dt className="dim" style={{ fontSize: 10 }}>Quarter</dt><dd>{plan.quarter || "Q2 2026"}</dd></div>
              <div><dt className="dim" style={{ fontSize: 10 }}>Recs included</dt><dd>{plan.rec_count || 12}</dd></div>
              <div><dt className="dim" style={{ fontSize: 10 }}>Lens runs</dt><dd>{plan.lens_run_count || 6}</dd></div>
              <div><dt className="dim" style={{ fontSize: 10 }}>Last regen</dt><dd>{fmtDate(plan.last_regenerated_at || plan.created_at)}</dd></div>
            </dl>
          </div>
        </aside>

        {/* Document body */}
        <article className="plan-doc">
          {/* §01 — Title page (always rendered; no placeholder strip) */}
          <PlanSection num={1} title="Title page" client={client} plan={plan}>
            <div style={{
              border: "1px solid var(--border)", borderRadius: 6, padding: "48px 32px",
              background: "var(--surface)", textAlign: "center"
            }}>
              <div className="mono dim" style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 32 }}>Confidential — for client use only</div>
              <div style={{ fontSize: 28, fontWeight: 500, letterSpacing: "-0.02em" }}>{client.household_name}</div>
              <div style={{ fontSize: 14, color: "var(--text-2)", marginTop: 6 }}>Comprehensive Wealth Plan · {plan.quarter || "Q2 2026"}</div>
              <div style={{ marginTop: 32 }} className="placeholder-block">
                stage4_output.title_page · prepared by PSA Wealth
              </div>
            </div>
          </PlanSection>

          {/* §02 — Executive summary */}
          <PlanSection num={2} title="Executive summary">
            <p>The {client.household_name} entered 2026 with $38.4M of investable assets across four primary entities: the operating company, a holding LLC, and two irrevocable trusts. The Q2 review focuses on three operative threads: (1) the inbound MEP roll-up and its tax sequencing, (2) holdco recapitalization to right-size estate exposure, and (3) tightening the foundation grant calendar against operating cash flow.</p>
            <p>This plan recommends seven business-side actions and five personal recommendations, summarized in §7–§8 and sequenced in §9. Three decisions require client input before May 30 — see §10.</p>
            <div className="placeholder-block" style={{ marginTop: 12 }}>stage4_output.exec_summary</div>
          </PlanSection>

          {/* §03 — Our process */}
          <PlanSection num={3} title="Our process">
            <p>This plan follows PSA Wealth's standard four-stage methodology: Discovery (fact review), Analysis (lens runs), Synthesis (recommendations), and Roadmap (implementation cadence). The fact review of <span className="mono">2026-04-21</span> serves as the baseline; recommendations herein supersede prior Q1 plan items still in flight.</p>
            <div className="placeholder-block" style={{ marginTop: 12 }}>stage4_output.our_process</div>
          </PlanSection>

          {/* §04 — Client snapshot — table renders from client_snapshot.entities[] */}
          <PlanSection num={4} title="Client snapshot">
            <table className="table" style={{ marginTop: 8 }}
                   data-api="GET /clients/{id}/snapshot">
              <thead>
                <tr><th>Entity</th><th>Type</th><th style={{ textAlign: "right" }}>Value</th><th>Lead counsel</th></tr>
              </thead>
              <tbody>
                <tr><td>Holloway Industries Inc.</td><td>S-Corp</td><td className="num" style={{ textAlign: "right" }}>$22.1M</td><td>Reeves</td></tr>
                <tr><td>HFG Holdings LLC</td><td>Holdco</td><td className="num" style={{ textAlign: "right" }}>$9.8M</td><td>Reeves</td></tr>
                <tr><td>Holloway 2018 Trust</td><td>IDGT</td><td className="num" style={{ textAlign: "right" }}>$4.6M</td><td>Reeves</td></tr>
                <tr><td>Holloway Family GST Trust</td><td>Dynasty</td><td className="num" style={{ textAlign: "right" }}>$1.9M</td><td>Reeves</td></tr>
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "1px solid var(--border-strong)" }}>
                  <td colSpan="2" style={{ fontWeight: 500 }}>Total investable</td>
                  <td className="num" style={{ textAlign: "right", fontWeight: 500 }}>$38.4M</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
            <div className="placeholder-block" style={{ marginTop: 12 }}>stage4_output.client_snapshot.entities[]</div>
          </PlanSection>

          {/* §05 — Goals & priorities */}
          <PlanSection num={5} title="Goals & priorities">
            <ol className="plan-list">
              <li><strong>Liquidity event readiness.</strong> Position holdco to absorb a 2027 partial recap with minimum estate friction.</li>
              <li><strong>Foundation cadence.</strong> Sustain a $1.2M/yr giving program without disrupting operating reserves.</li>
              <li><strong>Generational tax efficiency.</strong> Protect $25M+ of GST exemption while maintaining donor flexibility.</li>
              <li><strong>Family alignment.</strong> Quarterly family-meeting cadence with documented decisions.</li>
              <li><strong>Education funding.</strong> Fully fund 529s for the two college-bound grandchildren by year-end.</li>
            </ol>
            <div className="placeholder-block" style={{ marginTop: 12 }}>stage4_output.goals[]</div>
          </PlanSection>

          {/* §06 — Findings & observations */}
          <PlanSection num={6} title="Findings & observations">
            <p>Three findings drive the recommendations that follow:</p>
            <ul className="plan-list">
              <li><strong>F1 — Concentration risk.</strong> 71% of liquid net worth sits in one operating co. Diversification post-recap is the single largest lever on volatility.</li>
              <li><strong>F2 — Estate exposure.</strong> Current titling exposes ~$8M of holdco appreciation to estate tax in a 2027 valuation event.</li>
              <li><strong>F3 — Cash flow brittleness.</strong> Foundation grants and quarterly distributions are 89% of after-tax operating cash; a single bad quarter creates pressure.</li>
            </ul>
            <div className="placeholder-block" style={{ marginTop: 12 }}>stage4_output.findings[]</div>
          </PlanSection>

          {/* §07 — Business recs */}
          <PlanSection num={7} title="Recommendations — Business" code="RB.1–7">
            <PlanRec code="RB.1" title="Recapitalize HFG Holdings into voting/non-voting tranches" status="primary">Discount and gift non-voting interests to the 2018 Trust before any 409A revaluation tied to MEP discussions.</PlanRec>
            <PlanRec code="RB.2" title="Layer a GRAT on the operating co stake">Two-year zeroed-out GRAT, $4M funding, hedges valuation outcomes either direction.</PlanRec>
            <PlanRec code="RB.3" title="Adopt a written distribution policy">Distribution = 0.6 × trailing-12-mo after-tax operating income, smoothed quarterly. Removes negotiation friction.</PlanRec>
            <PlanRec code="RB.4" title="Engage Sterling & Hunt as MEP transactional counsel">Reeves remains lead estate counsel; Sterling handles the deal mechanics.</PlanRec>
            <PlanRec code="RB.5" title="Refresh the 401(k) safe-harbor election">Maximize owner contribution capacity given the new partner addition in Q3.</PlanRec>
            <PlanRec code="RB.6" title="Establish a $2M operating reserve floor">Stress-tested against a 25% revenue contraction scenario.</PlanRec>
            <PlanRec code="RB.7" title="Document succession of operating roles">Two-year horizon; reduces key-person insurance pricing pressure.</PlanRec>
            <div className="placeholder-block" style={{ marginTop: 12 }}>stage4_output.recs_business[]</div>
          </PlanSection>

          {/* §08 — Personal recs */}
          <PlanSection num={8} title="Recommendations — Personal" code="RP.8–12">
            <PlanRec code="RP.8"  title="Re-balance personal portfolio to 60/30/10">From current 71/19/10 — phased over six months to manage tax lots.</PlanRec>
            <PlanRec code="RP.9"  title="Fund 529s for grandchildren">$170K each; superfund the 2026–2030 window before tuition cycle hits.</PlanRec>
            <PlanRec code="RP.10" title="Increase term-life on Marcus to $8M">Through 2032 to bridge the recap-to-foundation transition.</PlanRec>
            <PlanRec code="RP.11" title="Convert spend-down DAF to a private foundation">Ready to file Q3; $4M opening corpus.</PlanRec>
            <PlanRec code="RP.12" title="Quarterly family meetings with written minutes">Standing first-Saturday cadence; rotate facilitator.</PlanRec>
            <div className="placeholder-block" style={{ marginTop: 12 }}>stage4_output.recs_personal[]</div>
          </PlanSection>

          {/* §09 — Implementation roadmap — denser, action-items-flavored table */}
          <PlanSection num={9} title="Implementation roadmap">
            <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
              7 of 12 recommendations are scheduled. Click any code to open the linked action item.
            </div>
            <table className="table table--dense"
                   style={{ marginTop: 4 }}
                   data-api="GET /plans/{id}/roadmap">
              <thead>
                <tr>
                  <th style={{ width: 64 }}>Code</th>
                  <th>Action</th>
                  <th style={{ width: 120 }}>Owner</th>
                  <th style={{ width: 130 }}>Window</th>
                  <th style={{ width: 110 }}>Partner</th>
                  <th style={{ width: 90 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                <RoadmapRow code="RB.1" action="Recap HFG voting/non-voting" owner="Hayden D." window="May–Jun 2026" partner="Reeves"        status="in_progress" />
                <RoadmapRow code="RB.2" action="Two-year zeroed-out GRAT"     owner="Hayden D." window="Jun 2026"     partner="Reeves + Park" status="not_started" />
                <RoadmapRow code="RB.3" action="Distribution policy memo"     owner="Marcus P." window="May 2026"     partner="—"             status="in_progress" />
                <RoadmapRow code="RB.4" action="Engage Sterling & Hunt"       owner="Marcus P." window="Q2 2026"      partner="Sterling"      status="not_started" />
                <RoadmapRow code="RP.9"  action="Superfund 529s"               owner="Hayden D." window="By 6/30"      partner="—"             status="in_progress" />
                <RoadmapRow code="RP.10" action="Term-life increase"           owner="Hayden D." window="Q2 2026"      partner="Cho Risk"      status="not_started" />
                <RoadmapRow code="RP.11" action="DAF → foundation conversion"  owner="Hayden D." window="Q3 2026"      partner="Reeves"        status="not_started" />
              </tbody>
            </table>
            <div className="placeholder-block" style={{ marginTop: 12 }}>stage4_output.roadmap[] · joins to action_items.plan_rec_code</div>
          </PlanSection>

          {/* §10 — Decisions needed — banner-styled to make blockers obvious */}
          <PlanSection num={10} title="Decisions needed">
            <div className="card" style={{ background: "var(--surface-2)", borderColor: "var(--border-strong)", marginTop: 4 }}>
              <div className="card__body" style={{ padding: "14px 16px" }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-3)", marginBottom: 8 }}>3 open decisions · earliest deadline May 30</div>
                <ol className="plan-list" style={{ margin: 0 }}>
                  <li><strong>D1.</strong> Approve the recap structure (RB.1) before May 30 to stay ahead of MEP valuation.</li>
                  <li><strong>D2.</strong> Confirm $4M GRAT funding source — operating co dividend vs. holdco distribution.</li>
                  <li><strong>D3.</strong> Sign-off on the two-year succession framing for key-person insurance.</li>
                </ol>
              </div>
            </div>
            <div className="placeholder-block" style={{ marginTop: 12 }}>stage4_output.decisions[] · open_decisions filtered server-side</div>
          </PlanSection>

          {/* §11 — Advisory team */}
          <PlanSection num={11} title="Advisory team">
            <table className="table" style={{ marginTop: 8 }}
                   data-api="GET /clients/{id}/partners">
              <thead><tr><th>Role</th><th>Person</th><th>Firm</th></tr></thead>
              <tbody>
                <tr><td>Lead advisor</td><td>Hayden Duffield</td><td>PSA Wealth</td></tr>
                <tr><td>Estate counsel</td><td>Daniel Reeves</td><td>Reeves Estate Counsel</td></tr>
                <tr><td>Tax / CPA</td><td>Lisa Park</td><td>Park & Associates</td></tr>
                <tr><td>P&C broker</td><td>Annette Cho</td><td>Cho Risk Advisors</td></tr>
                <tr><td>Transactional counsel</td><td><span className="dim">TBD</span></td><td>Sterling & Hunt (proposed)</td></tr>
              </tbody>
            </table>
            <div className="placeholder-block" style={{ marginTop: 12 }}>stage4_output.advisory_team[]</div>
          </PlanSection>

          {/* §12 — Meeting cadence */}
          <PlanSection num={12} title="Meeting cadence">
            <table className="table" style={{ marginTop: 8 }}>
              <thead><tr><th>Meeting</th><th>Frequency</th><th>Standing attendees</th></tr></thead>
              <tbody>
                <tr><td>Quarterly review</td><td>Q1 / Q2 / Q3 / Q4</td><td>Lead advisor + family principals</td></tr>
                <tr><td>Family meeting</td><td>1st Saturday quarterly</td><td>Full family + facilitator</td></tr>
                <tr><td>Tax-planning huddle</td><td>April + October</td><td>Lead advisor + Park</td></tr>
                <tr><td>Estate review</td><td>Annually (Sept)</td><td>Lead advisor + Reeves</td></tr>
              </tbody>
            </table>
            <div className="placeholder-block" style={{ marginTop: 12 }}>stage4_output.cadence[]</div>
          </PlanSection>

          {/* §13 — Glossary */}
          <PlanSection num={13} title="Glossary">
            <dl className="kv" style={{ gridTemplateColumns: "140px 1fr" }}>
              <dt>GRAT</dt><dd>Grantor Retained Annuity Trust — vehicle for moving appreciation out of the estate at minimal gift-tax cost.</dd>
              <dt>GST exemption</dt><dd>Generation-Skipping Transfer tax exemption — protects assets passed to grandchildren or later generations.</dd>
              <dt>IDGT</dt><dd>Intentionally Defective Grantor Trust — irrevocable trust that the grantor pays income tax on, effectively gifting more without using exemption.</dd>
              <dt>MEP</dt><dd>Multi-Entity Platform — sector-specific holding-company roll-up structure.</dd>
            </dl>
            <div className="placeholder-block" style={{ marginTop: 12 }}>stage4_output.glossary[]</div>
          </PlanSection>

          {/* §14 — Disclosures */}
          <PlanSection num={14} title="Disclosures">
            <p style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.6 }}>
              PSA Wealth is a registered investment advisor in the State of Georgia. This document is prepared for the named client and is confidential. Recommendations herein reflect facts and circumstances as of the fact-review date and may require revision as those facts change. Past performance is not indicative of future results. Tax and legal recommendations should be confirmed with the client's CPA and attorney prior to implementation. Form ADV Part 2A available upon request.
            </p>
            <div className="placeholder-block" style={{ marginTop: 12 }}>stage4_output.disclosures · auto-stamped at approval</div>
          </PlanSection>

          <div style={{ height: 80 }} />
        </article>
      </div>

      <style>{`
        .plan-doc { max-width: 760px; }
        .plan-doc h2 {
          font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em;
          color: var(--text-3); font-weight: 500; margin: 0 0 4px 0;
        }
        .plan-doc h3 {
          font-size: 22px; font-weight: 500; letter-spacing: -0.015em;
          margin: 0 0 16px 0; line-height: 1.2;
        }
        .plan-doc p { font-size: 14px; line-height: 1.65; color: var(--text); margin: 0 0 12px 0; max-width: 70ch; text-wrap: pretty; }
        .plan-doc .plan-section + .plan-section { margin-top: 56px; padding-top: 32px; border-top: 1px solid var(--border); }
        .plan-doc .plan-section { scroll-margin-top: 80px; }
        .plan-list { font-size: 14px; line-height: 1.7; padding-left: 22px; max-width: 70ch; }
        .plan-list li + li { margin-top: 6px; }
        .plan-rec {
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 14px 16px;
          margin-bottom: 10px;
          background: var(--surface);
          transition: border-color 120ms ease, background 120ms ease;
        }
        .plan-rec:hover { border-color: var(--border-strong); }
        .plan-rec--primary { border-left: 3px solid var(--accent); }
        .plan-rec__head { display: flex; gap: 10px; align-items: baseline; margin-bottom: 4px; }
        .plan-rec__code { font-family: var(--font-mono); font-size: 11px; color: var(--text-3); }
        .plan-rec__title { font-weight: 500; font-size: 14px; }
        .plan-rec__body { font-size: 13px; color: var(--text-2); line-height: 1.55; }

        .table--dense tbody td { padding: 8px 14px; font-size: 12.5px; }
        .table--dense thead th { padding: 8px 14px; }
      `}</style>
    </div>
  );
}

// -------- Helpers ----------------------------------------------------------

function getPlanDemoState() {
  // Read ?state=… from hash query for showcase. Not used in production.
  // e.g. #/plans/mock-plan-…?state=loading
  const h = window.location.hash;
  const q = h.split("?")[1];
  if (!q) return "ok";
  const params = new URLSearchParams(q);
  return params.get("state") || "ok";
}

function renderPlanStatus(plan) {
  const s = plan.status;
  if (s === "approved") {
    return <span className="badge badge--green" data-api={`GET /plans/${plan.id}`}>
      <span className="dot"></span>Approved {plan.approved_at ? fmtDate(plan.approved_at) : ""}
    </span>;
  }
  if (s === "ready_for_review") {
    return <span className="badge badge--blue">
      <span className="dot"></span>Ready for review
    </span>;
  }
  if (s === "archived") {
    return <span className="badge">
      <span className="dot"></span>Archived
    </span>;
  }
  // draft (orchestrator hasn't completed)
  return <span className="badge badge--amber">
    <span className="dot"></span>Draft
  </span>;
}

function PlanActions({ plan }) {
  // Status-aware action buttons. data-api wires each to its v1 endpoint.
  const s = plan.status;
  return (
    <>
      <button className="btn"
              data-api={`GET /plans/${plan.id}/pdf`}
              title="Download as PDF (React-PDF)">
        <DownloadIcon /> Export PDF
      </button>
      {s !== "archived" && (
        <button className="btn"
                data-api={`POST /plans/${plan.id}/archive`}
                title="Archive — keeps record but hides from active list">
          Archive
        </button>
      )}
      {s === "ready_for_review" && (
        <button className="btn btn--primary"
                data-api={`POST /plans/${plan.id}/approve`}
                title="Approve — locks the plan and stamps disclosures">
          <CheckIcon /> Approve plan
        </button>
      )}
      {s === "approved" && (
        <button className="btn btn--primary"
                data-api={`POST /plans/{client_id}/generate`}
                title="Start Q3 plan from same fact-review baseline">
          Generate next quarter
        </button>
      )}
      {s === "draft" && (
        <button className="btn"
                data-api={`POST /plans/${plan.id}/regenerate`}
                title="Re-trigger the orchestrator">
          <RefreshIcon /> Re-trigger
        </button>
      )}
    </>
  );
}

function RoadmapRow({ code, action, owner, window: win, partner, status }) {
  // Each row is clickable → opens the linked action_item drawer.
  // In production: row.onClick → openActionItem(action_items.find(a => a.plan_rec_code === code))
  const statusBadge = {
    not_started: <span className="badge"><span className="dot"></span>Not started</span>,
    in_progress: <span className="badge badge--blue"><span className="dot"></span>In progress</span>,
    blocked:     <span className="badge badge--amber"><span className="dot"></span>Blocked</span>,
    done:        <span className="badge badge--green"><span className="dot"></span>Done</span>,
  }[status] || <span className="badge"><span className="dot"></span>—</span>;
  return (
    <tr style={{ cursor: "pointer" }}
        data-api="GET /action-items?plan_rec_code={code}"
        title="Open linked action item">
      <td className="mono" style={{ color: "var(--accent)", fontWeight: 500 }}>{code}</td>
      <td>{action}</td>
      <td>{owner}</td>
      <td>{win}</td>
      <td>{partner}</td>
      <td>{statusBadge}</td>
    </tr>
  );
}

// -------- Section primitives -----------------------------------------------

function PlanSection({ num, title, children, code }) {
  return (
    <section className="plan-section" id={`s-${num}`}>
      <h2>§{String(num).padStart(2, "0")} {code && <span className="mono dim" style={{ marginLeft: 8, fontSize: 10 }}>{code}</span>}</h2>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function PlanRec({ code, title, children, status }) {
  return (
    <div className={`plan-rec ${status === "primary" ? "plan-rec--primary" : ""}`}
         data-api={`GET /recommendations/${code}`}>
      <div className="plan-rec__head">
        <span className="plan-rec__code">{code}</span>
        <span className="plan-rec__title">{title}</span>
      </div>
      <div className="plan-rec__body">{children}</div>
    </div>
  );
}

// -------- Empty / loading / error / not-found ------------------------------

function PlanLoading({ plan }) {
  return (
    <div className="page" style={{ maxWidth: 1280 }} data-screen-label="07a Plan · Loading">
      <PageHead title={plan.title} subtitle={<span className="mono">{plan.id}</span>} />
      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 32 }}>
        <aside><Skeleton lines={14} small /></aside>
        <article style={{ maxWidth: 760 }}>
          <Skeleton lines={3} />
          <div style={{ height: 24 }} />
          <Skeleton lines={6} />
          <div style={{ height: 24 }} />
          <Skeleton lines={4} />
        </article>
      </div>
    </div>
  );
}

function PlanError({ plan }) {
  return (
    <div className="page" data-screen-label="07b Plan · Error">
      <PageHead title={plan.title} />
      <div className="card">
        <div className="card__body" style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start", padding: 24 }}>
          <div style={{ width: 40, height: 40, borderRadius: 6, background: "var(--status-red-bg)", border: "1px solid var(--status-red-border)", display: "grid", placeItems: "center" }}>
            <AlertIcon />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>Couldn't load this plan</div>
            <div style={{ fontSize: 13, color: "var(--text-2)", marginTop: 4 }}>The orchestrator returned an error during stage 4 assembly. Engineering has been notified.</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" data-api={`POST /plans/${plan.id}/regenerate`}>Re-trigger orchestrator</button>
            <button className="btn">Open run logs</button>
          </div>
          <code className="mono dim" style={{ fontSize: 11, padding: "8px 10px", background: "var(--surface-2)", borderRadius: 4, display: "block", width: "100%" }}>
            stage4_assembly_failed: timeout after 600s · run_id=run_2026-05-01_aabb
          </code>
        </div>
      </div>
    </div>
  );
}

function PlanNotFound({ planId }) {
  return (
    <div className="page" data-screen-label="07c Plan · Not found">
      <PageHead title="Plan not found" />
      <div className="card">
        <div className="card__body" style={{ padding: 24 }}>
          <p style={{ margin: 0 }}>No plan with id <span className="mono">{planId}</span>. It may have been archived.</p>
          <button className="btn" style={{ marginTop: 12 }} onClick={() => navigate("/clients")}>Back to clients</button>
        </div>
      </div>
    </div>
  );
}

function Skeleton({ lines = 3, small }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: small ? 6 : 10 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} style={{
          height: small ? 10 : 14,
          background: "linear-gradient(90deg, var(--surface-2), var(--border), var(--surface-2))",
          backgroundSize: "200% 100%",
          animation: "shimmer 1.4s ease-in-out infinite",
          borderRadius: 3,
          width: i % 3 === 2 ? "60%" : "100%",
        }} />
      ))}
      <style>{`@keyframes shimmer { 0%{background-position: 200% 0} 100%{background-position: -200% 0} }`}</style>
    </div>
  );
}

Object.assign(window, { PlanView });
