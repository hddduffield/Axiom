// Dashboard view — advisor's home.
//
// API contract surface (v1):
//   GET /api/me                                        → ME (cached on session)
//   GET /api/dashboard?for=me                          → server-aggregated bundle:
//                                                          { stats, triage[], pending[], recent_notes[], plan_status }
//                                                        Implementations may federate this from /api/action-items
//                                                        + /api/notes + /api/plans?stage=ready_for_review.
//   POST /api/notes                                    → quick-capture; returns NoteEntity
//
// Dashboard is a read-only view in v1. All mutations go through their dedicated endpoints.

const { useState: useStateD, useMemo: useMemoD, useEffect: useEffectD } = React;

function Dashboard({ openActionItem }) {
  const D = window.AXIOM_DATA;
  const me = D.ME;

  // Live clock for greeting (refreshes once a minute)
  const [now, setNow] = useStateD(() => new Date());
  useEffectD(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Greeting tone matches time of day
  const hour = now.getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // Pretty-format Sunday, May 3, 2026 — fixed for prototype data alignment
  const dateLine = "Sunday, May 3, 2026";

  const myItems = useMemoD(() =>
    D.ACTION_ITEMS.filter(a => a.owner === me.email && a.status !== "complete"),
  []);

  const overdue   = myItems.filter(a => a.timing_bucket === "overdue");
  const thisWeek  = myItems.filter(a => a.timing_bucket === "this_week");
  const next30    = myItems.filter(a => a.timing_bucket === "next_30_days");
  const pending   = myItems.filter(a => a.status === "pending_decision");
  const partnerBlocked = myItems.filter(a => a.partner_required);
  const completedThisWeek = D.ACTION_ITEMS.filter(a => a.status === "complete" && a.completed_at && a.completed_at >= "2026-04-26").length;

  const openClients = new Set(myItems.map(a => a.client_id)).size;

  const recentNotes = [...D.NOTES]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5);

  const bucketOrder = { overdue: 0, this_week: 1, next_30_days: 2, next_90_days: 3 };
  const triage = [...myItems].sort((a, b) =>
    (bucketOrder[a.timing_bucket] - bucketOrder[b.timing_bucket]) ||
    (a.due_at || "").localeCompare(b.due_at || "")
  );

  // Plan status across portfolio
  const draftPlans     = D.PLANS.filter(p => p.status === "draft").length;
  const reviewPlans    = D.PLANS.filter(p => p.status === "ready_for_review").length;
  const livePlans      = D.PLANS.filter(p => p.status === "approved" || p.status === "active" || p.status === "live").length;

  // Activity stream — combine completes, promotes, plan events
  const activity = useMemoD(() => {
    const events = [];
    D.ACTION_ITEMS.filter(a => a.status === "complete" && a.completed_at).forEach(a => {
      events.push({
        kind: "complete",
        ts: a.completed_at,
        label: <>Marked <span className="mono">{a.id}</span> complete · {getClient(a.client_id)?.household_name.replace(" Family", "")}</>,
        sub: a.description,
      });
    });
    D.NOTES.filter(n => n.promoted_to_action_item_id).forEach(n => {
      events.push({
        kind: "promote",
        ts: n.created_at,
        label: <>Promoted note <span className="mono">{n.id}</span> → <span className="mono">{n.promoted_to_action_item_id}</span></>,
        sub: getClient(n.client_id)?.household_name,
      });
    });
    (D.LENS_RUNS || []).forEach(r => {
      events.push({
        kind: "lens",
        ts: r.created_at,
        label: <>Lens run <span className="mono">{r.id}</span> ({r.lens_type}) · {getClient(r.client_id)?.household_name.replace(" Family", "")}</>,
        sub: r.context_input,
      });
    });
    return events.sort((a, b) => (b.ts || "").localeCompare(a.ts || "")).slice(0, 6);
  }, []);

  // Quick capture
  const [composing, setComposing] = useStateD(false);

  return (
    <div className="page page--dash" data-screen-label="01 Dashboard">
      {/* Greeting hero */}
      <div className="dash-hero">
        <div className="dash-hero__top">
          <div>
            <div className="dash-hero__date">{dateLine}</div>
            <h1 className="dash-hero__greet">{greet}, {me.first_name}.</h1>
            <div className="dash-hero__sub">
              {myItems.length === 0 ? (
                <>You're caught up. Take a breath.</>
              ) : (
                <>
                  <span className="mono">{myItems.length}</span> open across <span className="mono">{openClients}</span> clients ·
                  {" "}<span className="mono">{completedThisWeek}</span> completed this week
                </>
              )}
            </div>
          </div>
          <div className="dash-hero__actions">
            <button className="btn" onClick={() => setComposing(v => !v)}>
              <PlusIcon /> {composing ? "Close" : "Quick note"}
            </button>
            <button className="btn btn--primary" onClick={() => navigate("/plans/generate")}>
              <FileIcon /> Generate plan
            </button>
          </div>
        </div>

        {/* Quick capture slides in */}
        {composing && (
          <div className="dash-capture" data-api="POST /api/notes">
            <div className="dash-capture__row">
              <select defaultValue={D.CLIENTS[0]?.id} className="chip" style={{ height: 30, paddingRight: 24 }}>
                {D.CLIENTS.map(c => <option key={c.id} value={c.id}>{c.household_name}</option>)}
              </select>
              <select defaultValue="client_meeting" className="chip" style={{ height: 30, paddingRight: 24 }}>
                <option value="client_meeting">Client meeting</option>
                <option value="internal">Internal</option>
                <option value="phone_call">Phone call</option>
                <option value="partner_touchpoint">Partner touchpoint</option>
              </select>
              <span className="dim" style={{ fontSize: 11 }}>Tip: ⌘↵ to save · ⇧⌘↵ to save and promote</span>
            </div>
            <textarea
              className="dash-capture__body"
              rows={3}
              placeholder="What just happened? Decisions, asks, partner needs…"
              autoFocus
            />
            <div className="dash-capture__foot">
              <button className="btn btn--sm btn--ghost" onClick={() => setComposing(false)}>Cancel</button>
              <button className="btn btn--sm">Save and promote…</button>
              <button className="btn btn--sm btn--primary" onClick={() => setComposing(false)}>
                <CheckIcon /> Save note
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Stat tiles — editorial: hero on left, satellites stacked right */}
      <div className="dash-stats" style={{ marginBottom: 16 }}>
        <DashStat
          label="Overdue"
          value={overdue.length}
          delta={overdue.length ? "Needs attention now" : "All clear"}
          alert={overdue.length > 0}
          hero
          onClick={() => navigate("/action-items#overdue")}
        />
        <div className="dash-stats__sats">
          <DashStat
            label="Due this week"
            value={thisWeek.length}
            delta={`${next30.length} more in 30 days`}
            onClick={() => navigate("/action-items#this_week")}
          />
          <DashStat
            label="Pending decision"
            value={pending.length}
            delta={`${partnerBlocked.length} partner-blocked`}
            onClick={() => navigate("/action-items#pending")}
          />
          <DashStat
            label="Open clients"
            value={openClients}
            delta={`of ${D.CLIENTS.length} total`}
            onClick={() => navigate("/clients")}
          />
        </div>
      </div>

      {/* Plan pipeline rail (Draft → Review → Active) */}
      <div className="pipeline-rail">
        <div className="pipeline-rail__head">
          <span className="pipeline-rail__label">Plan pipeline</span>
          <span className="pipeline-rail__count mono">{D.PLANS.length} plans</span>
        </div>
        <div className="pipeline-rail__flow">
          <button className="pipeline-rail__node" onClick={() => navigate("/clients")}>
            <span className="pipeline-rail__node-value mono">{draftPlans}</span>
            <span className="pipeline-rail__node-label">Draft</span>
          </button>
          <span className="pipeline-rail__arrow" aria-hidden>→</span>
          <button className="pipeline-rail__node pipeline-rail__node--accent" onClick={() => navigate("/clients")}>
            <span className="pipeline-rail__node-value mono">{reviewPlans}</span>
            <span className="pipeline-rail__node-label">Ready for review</span>
          </button>
          <span className="pipeline-rail__arrow" aria-hidden>→</span>
          <button className="pipeline-rail__node" onClick={() => navigate("/clients")}>
            <span className="pipeline-rail__node-value mono">{livePlans}</span>
            <span className="pipeline-rail__node-label">Active</span>
          </button>
        </div>
        <button className="btn btn--sm" onClick={() => navigate("/plans/generate")}>
          <PlusIcon /> Queue new plan
        </button>
      </div>

      {/* Two-up: triage + side rail */}
      <div className="grid grid--dash">
        {/* Triage queue */}
        <div className="card">
          <div className="card__head">
            <h2>Your triage queue</h2>
            <div className="actions">
              <span className="muted" style={{ fontSize: 11 }}>Sorted by due date</span>
              <button className="btn btn--sm btn--ghost" onClick={() => navigate("/action-items")}>
                View all <ChevronIcon size={11} />
              </button>
            </div>
          </div>
          <div className="card__body card__body--flush">
            {triage.length === 0 ? (
              <div className="empty empty--lg">
                <div style={{ fontWeight: 500, color: "var(--text)", marginBottom: 4 }}>Nothing in your queue.</div>
                <div style={{ fontSize: 12, color: "var(--text-2)" }}>
                  Either generate a plan to seed actions, or take the rest of the day.
                </div>
              </div>
            ) : (
              <>
                {/* Priority cards — top 2 overdue items */}
                {overdue.slice(0, 2).length > 0 && (
                  <div className="priority-cards">
                    {overdue.slice(0, 2).map(a => {
                      const c = getClient(a.client_id);
                      return (
                        <div key={a.id} className="priority-card" onClick={() => openActionItem(a.id)}>
                          <div className="priority-card__head">
                            <Avatar name={c?.household_name} size={32} tone="navy" />
                            <div className="priority-card__client">
                              <div className="priority-card__client-name">{c?.household_name.replace(" Family", "")}</div>
                              <div className="priority-card__id mono">{a.id} · {a.category.toLowerCase()}</div>
                            </div>
                            <span className="priority-card__flag"><AlertIcon size={12} /> Overdue</span>
                          </div>
                          <div className="priority-card__body">{a.description}</div>
                          <div className="priority-card__foot">
                            <TimingBadge bucket={a.timing_bucket} />
                            {a.partner_required && (
                              <span className="badge badge--ghost"><LinkIcon size={10} />{a.partner_type}</span>
                            )}
                            <div className="priority-card__actions">
                              <button className="btn btn--sm btn--ghost" onClick={(e) => { e.stopPropagation(); }}>Snooze</button>
                              <button className="btn btn--sm btn--primary" onClick={(e) => { e.stopPropagation(); }}>
                                <CheckIcon /> Mark complete
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <table className="table table--compact">
                <thead>
                  <tr>
                    <th style={{ width: "auto" }}>Item</th>
                    <th style={{ width: 160 }}>Client</th>
                    <th style={{ width: 110 }}>Due</th>
                    <th style={{ width: 130 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {triage.slice(overdue.slice(0, 2).length, 8 + overdue.slice(0, 2).length).map(a => {
                    const c = getClient(a.client_id);
                    return (
                      <tr key={a.id} onClick={() => openActionItem(a.id)}>
                        <td>
                          <div className="tr" style={{ maxWidth: 460 }}>{a.description}</div>
                          <div className="dim" style={{ fontSize: 11, marginTop: 2, fontFamily: "var(--font-mono)" }}>
                            {a.id} · {a.category.toLowerCase()}{a.partner_required ? ` · ${a.partner_type?.toLowerCase()}-blocked` : ""}
                          </div>
                        </td>
                        <td>
                          <div className="row" style={{ gap: 8, alignItems: "center" }}>
                            <Avatar name={c?.household_name} size={22} tone="ivory" />
                            <span className="muted">{c?.household_name.replace(" Family", "")}</span>
                          </div>
                        </td>
                        <td><TimingBadge bucket={a.timing_bucket} /></td>
                        <td><StatusBadge status={a.status} /></td>
                      </tr>
                    );
                  })}
                </tbody>
                </table>
              </>
            )}
          </div>
          {triage.length > 8 && (
            <div className="card__foot">
              <button className="btn btn--sm btn--ghost" onClick={() => navigate("/action-items")}>
                {triage.length - 8} more in queue → Open action items
              </button>
            </div>
          )}
        </div>

        {/* Side rail */}
        <div className="col-stack">
          {/* Needs decision */}
          <div className="card">
            <div className="card__head">
              <h2>Needs your decision</h2>
              <span className="muted mono" style={{ fontSize: 11 }}>{pending.length}</span>
            </div>
            <div className="card__body" style={{ padding: 0 }}>
              {pending.length === 0 && <div className="empty">No pending decisions.</div>}
              {pending.map(p => {
                const c = getClient(p.client_id);
                return (
                  <div key={p.id}
                       onClick={() => openActionItem(p.id)}
                       className="dash-pending">
                    <div className="dash-pending__meta">
                      <div className="row" style={{ gap: 8, alignItems: "center" }}>
                        <Avatar name={c?.household_name} size={20} tone="ivory" />
                        <span>{c?.household_name.replace(" Family", "")}</span>
                      </div>
                      <span className="dim mono">{p.id}</span>
                    </div>
                    <div className="dash-pending__body">{p.description}</div>
                    <div className="row" style={{ gap: 6 }}>
                      <TimingBadge bucket={p.timing_bucket} />
                      {p.partner_required && (
                        <span className="badge badge--ghost"><LinkIcon size={10} />{p.partner_type}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent notes */}
          <div className="card">
            <div className="card__head">
              <h2>Recent notes</h2>
              <button className="btn btn--sm btn--ghost" onClick={() => navigate("/notes")}>
                Notes hub <ChevronIcon size={11} />
              </button>
            </div>
            <div className="card__body">
              <div className="timeline">
                {recentNotes.map(n => {
                  const c = getClient(n.client_id);
                  const a = getAdvisor(n.author_advisor_id);
                  const isMe = n.author_advisor_id === me.id;
                  return (
                    <div key={n.id} className={`timeline__item ${isMe ? "is-self" : ""}`}>
                      <div className="timeline__meta" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Avatar name={`${a?.first_name} ${a?.last_name}`} size={18} tone={isMe ? "navy" : "ivory"} />
                        <span>{fmtRelative(n.created_at)} · {a?.first_name} {a?.last_name[0]}. · {c?.household_name.replace(" Family", "")} · <span className="tag" style={{ display: "inline-flex" }}>{n.tag}</span></span>
                      </div>
                      <div className="timeline__body">{n.body}</div>
                      {n.promoted_to_action_item_id && (
                        <div className="dim mono" style={{ fontSize: 11, marginTop: 4 }}>
                          → promoted to {n.promoted_to_action_item_id}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Activity stream */}
          {activity.length > 0 && (
            <div className="card">
              <div className="card__head">
                <h2>Recent activity</h2>
                <span className="muted" style={{ fontSize: 11 }}>across all clients</span>
              </div>
              <div className="card__body">
                <ul className="dash-activity">
                  {activity.map((e, i) => (
                    <li key={i} className={`dash-activity__row dash-activity__row--${e.kind}`}>
                      <div className="dash-activity__dot" />
                      <div className="dash-activity__main">
                        <div className="dash-activity__label">{e.label}</div>
                        {e.sub && <div className="dash-activity__sub">{e.sub}</div>}
                      </div>
                      <div className="dash-activity__time mono">{fmtRelative(e.ts)}</div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="placeholder-block" style={{ marginTop: 16, fontSize: 11 }}>
        GET /api/dashboard?for=me · server-aggregates: stats / triage / pending / notes / plan_status / activity
      </div>
    </div>
  );
}

function DashStat({ label, value, delta, alert, hero, onClick }) {
  return (
    <div className={`card dash-stat ${alert ? "dash-stat--alert" : ""} ${hero ? "dash-stat--hero" : ""}`} onClick={onClick}>
      <div className="card__body">
        <div className="dash-stat__label">{label}</div>
        <div className="dash-stat__value">{value}</div>
        <div className={`dash-stat__delta ${alert ? "dash-stat__delta--alert" : ""}`}>{delta}</div>
      </div>
    </div>
  );
}

Object.assign(window, { Dashboard });
