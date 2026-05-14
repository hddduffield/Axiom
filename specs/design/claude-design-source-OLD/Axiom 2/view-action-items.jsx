// Action items list view + detail drawer.
//
// API contract surface (v1):
//   GET    /api/action-items                     → list, filterable by query params
//                                                   ?owner=&status=&bucket=&client_id=&partner_required=
//                                                   ?sort=due&dir=asc
//   POST   /api/action-items                     → body: AICreate; returns AIEntity
//   PATCH  /api/action-items/[id]                → body: AIPatch (status, owner, due_at, ...)
//   DELETE /api/action-items/[id]                → soft-delete (archived_at)
//   POST   /api/action-items/bulk                → body: { ids[], op: 'complete'|'reassign'|'archive', ... }
//
// Saved views are client-side only in v1 (URL hash). Phase 5d may add
// /api/action-views per-advisor. Bulk ops are mocked in this prototype.

const SAVED_VIEWS = [
  { id: "my-open",      label: "My open",          fn: (a, me) => a.owner === me.email && a.status !== "complete" },
  { id: "my-overdue",   label: "My overdue",       fn: (a, me) => a.owner === me.email && a.timing_bucket === "overdue" && a.status !== "complete" },
  { id: "pending",      label: "Pending decision", fn: (a, _ ) => a.status === "pending_decision" },
  { id: "partner",      label: "Partner-blocked",  fn: (a, _ ) => a.partner_required && a.status !== "complete" },
  { id: "long-running", label: "Long-running",     fn: (a, _ ) => a.duration_class === "long_running" && a.status !== "complete" },
  { id: "all",          label: "All items",        fn: () => true },
];

function ActionItems({ openActionItem }) {
  const D = window.AXIOM_DATA;
  const me = D.ME;

  const [savedView, setSavedView]       = React.useState("my-open");
  const [ownerFilter, setOwnerFilter]   = React.useState("me");
  const [statusFilter, setStatusFilter] = React.useState("open");
  const [bucketFilter, setBucketFilter] = React.useState("all");
  const [clientFilter, setClientFilter] = React.useState("all");
  const [partnerOnly, setPartnerOnly]   = React.useState(false);
  const [search, setSearch]             = React.useState("");
  const [groupBy, setGroupBy]           = React.useState("none"); // none | bucket | client
  const [sortKey, setSortKey]           = React.useState("due");
  const [sortDir, setSortDir]           = React.useState("asc");
  const [selected, setSelected]         = React.useState(new Set());

  // Apply saved-view first (it widens base filter), then narrow with chips.
  // Only "all" saved view runs across complete items; otherwise we exclude complete.
  const baseView = SAVED_VIEWS.find(v => v.id === savedView);
  const inView   = (a) => baseView ? baseView.fn(a, me) : true;

  const filtered = D.ACTION_ITEMS.filter(a => {
    if (!inView(a)) return false;
    // chips operate as further refinement (only if not on default-aligned saved view)
    if (savedView === "all") {
      // chips fully active on "all"
    }
    if (ownerFilter === "me"     && a.owner !== me.email) return false;
    if (ownerFilter === "client" && a.owner !== "client") return false;
    if (ownerFilter === "team"   && a.owner === "client") return false;
    if (statusFilter === "open" && a.status === "complete") return false;
    if (statusFilter !== "open" && statusFilter !== "all" && a.status !== statusFilter) return false;
    if (bucketFilter !== "all" && a.timing_bucket !== bucketFilter) return false;
    if (clientFilter !== "all" && a.client_id !== clientFilter) return false;
    if (partnerOnly && !a.partner_required) return false;
    if (search) {
      const s = search.toLowerCase();
      const c = getClient(a.client_id);
      if (!a.description.toLowerCase().includes(s) &&
          !a.id.toLowerCase().includes(s) &&
          !(c && c.household_name.toLowerCase().includes(s))) return false;
    }
    return true;
  });

  const bucketOrder = { overdue: 0, this_week: 1, next_30_days: 2, next_90_days: 3 };
  const sortFn = (a, b) => {
    let av, bv;
    switch (sortKey) {
      case "due":    av = a.due_at || "";    bv = b.due_at || "";    break;
      case "client": av = a.client_id;       bv = b.client_id;       break;
      case "owner":  av = a.owner;           bv = b.owner;           break;
      case "bucket": av = bucketOrder[a.timing_bucket]; bv = bucketOrder[b.timing_bucket]; break;
      case "status": av = a.status;          bv = b.status;          break;
      default:       av = a.description.toLowerCase(); bv = b.description.toLowerCase();
    }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ?  1 : -1;
    return 0;
  };
  const sorted = [...filtered].sort(sortFn);

  // Build groups
  const groups = React.useMemo(() => {
    if (groupBy === "none") return [{ key: null, label: null, items: sorted }];
    if (groupBy === "bucket") {
      const order = ["overdue", "this_week", "next_30_days", "next_90_days"];
      const labelMap = { overdue: "Overdue", this_week: "This week", next_30_days: "Next 30 days", next_90_days: "Next 90 days" };
      return order.map(k => ({
        key: k, label: labelMap[k],
        items: sorted.filter(a => a.timing_bucket === k),
      })).filter(g => g.items.length > 0);
    }
    if (groupBy === "client") {
      const byClient = {};
      sorted.forEach(a => { (byClient[a.client_id] = byClient[a.client_id] || []).push(a); });
      return Object.entries(byClient).map(([cid, items]) => {
        const c = getClient(cid);
        return { key: cid, label: c?.household_name || cid, items };
      }).sort((x, y) => (x.label || "").localeCompare(y.label || ""));
    }
    return [{ key: null, label: null, items: sorted }];
  }, [sorted.map(a => a.id).join(","), groupBy]);

  const toggleSort = (k) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  };
  const arrow = (k) => sortKey === k ? <span className="arrow">{sortDir === "asc" ? "▲" : "▼"}</span> : null;

  // Saved view click resets refinement chips to that view's "neutral" config
  const applySavedView = (id) => {
    setSavedView(id);
    setSelected(new Set());
    if (id === "my-open")      { setOwnerFilter("me");     setStatusFilter("open");             setBucketFilter("all");      setPartnerOnly(false); }
    if (id === "my-overdue")   { setOwnerFilter("me");     setStatusFilter("open");             setBucketFilter("overdue");  setPartnerOnly(false); }
    if (id === "pending")      { setOwnerFilter("all");    setStatusFilter("pending_decision"); setBucketFilter("all");      setPartnerOnly(false); }
    if (id === "partner")      { setOwnerFilter("all");    setStatusFilter("open");             setBucketFilter("all");      setPartnerOnly(true);  }
    if (id === "long-running") { setOwnerFilter("all");    setStatusFilter("open");             setBucketFilter("all");      setPartnerOnly(false); }
    if (id === "all")          { setOwnerFilter("all");    setStatusFilter("all");              setBucketFilter("all");      setPartnerOnly(false); }
  };

  // Bulk selection
  const flatVisible = sorted.map(a => a.id);
  const allSelected = selected.size > 0 && flatVisible.every(id => selected.has(id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(flatVisible));
  };
  const toggleOne = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  // Header counts
  const cnt = (pred) => D.ACTION_ITEMS.filter(pred).length;
  const completedThisWeek = cnt(a => a.status === "complete" && a.completed_at && a.completed_at >= "2026-04-26");

  return (
    <div className="page" data-screen-label="03 Action Items">
      <PageHead
        title="Action items"
        subtitle={
          <>
            <span className="mono">{cnt(a => a.owner === me.email && a.status !== "complete")}</span> open ·
            {" "}<span className="mono">{completedThisWeek}</span> completed this week
          </>
        }
        actions={
          <>
            <button className="btn" data-api="GET /api/action-items?export=csv"><DownloadIcon /> Export</button>
            <button className="btn btn--primary" data-api="POST /api/action-items"><PlusIcon /> New item</button>
          </>
        }
      />

      {/* Saved views */}
      <div className="saved-views">
        <span className="saved-views__label">View</span>
        <div className="saved-views__list">
          {SAVED_VIEWS.map(v => (
            <button
              key={v.id}
              className={`saved-view ${savedView === v.id ? "is-active" : ""}`}
              onClick={() => applySavedView(v.id)}>
              {v.label}
              <span className="saved-view__count">{D.ACTION_ITEMS.filter(a => v.fn(a, me)).length}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Filter row */}
      <div className="filter-row">
        <span className="filter-row__label">Owner</span>
        <div className="chips">
          <Chip active={ownerFilter === "me"}     onClick={() => setOwnerFilter("me")}>Me</Chip>
          <Chip active={ownerFilter === "team"}   onClick={() => setOwnerFilter("team")}>Team</Chip>
          <Chip active={ownerFilter === "client"} onClick={() => setOwnerFilter("client")}>Client</Chip>
          <Chip active={ownerFilter === "all"}    onClick={() => setOwnerFilter("all")}>All</Chip>
        </div>
        <span className="filter-row__sep" />

        <span className="filter-row__label">Status</span>
        <div className="chips">
          {[
            ["open", "Open"],
            ["not_started", "Not started"],
            ["in_progress", "In progress"],
            ["pending_decision", "Pending"],
            ["complete", "Complete"],
            ["all", "All"],
          ].map(([k, label]) => (
            <Chip key={k} active={statusFilter === k} onClick={() => setStatusFilter(k)}>{label}</Chip>
          ))}
        </div>
        <span className="filter-row__sep" />

        <span className="filter-row__label">When</span>
        <div className="chips">
          {[
            ["all", "All"], ["overdue", "Overdue"], ["this_week", "This week"], ["next_30_days", "30 days"], ["next_90_days", "90 days"],
          ].map(([k, label]) => (
            <Chip key={k} active={bucketFilter === k} onClick={() => setBucketFilter(k)}>{label}</Chip>
          ))}
        </div>
        <span className="filter-row__sep" />

        <Chip active={partnerOnly} onClick={() => setPartnerOnly(v => !v)}>
          <LinkIcon size={11} /> Partner-blocked
        </Chip>

        <div className="spacer" />
        <select
          className="chip"
          style={{ paddingRight: 24 }}
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}>
          <option value="all">All clients</option>
          {D.CLIENTS.map(c => (
            <option key={c.id} value={c.id}>{c.household_name}</option>
          ))}
        </select>
      </div>

      {/* Toolbar: search + group + count */}
      <div className="ai-toolbar">
        <div className="ai-toolbar__search">
          <SearchIcon size={12} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search description, client, or id…"
          />
          {search && <button className="ai-toolbar__clear" onClick={() => setSearch("")}>×</button>}
        </div>

        <div className="ai-toolbar__group">
          <span className="dim" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>Group</span>
          <Chip active={groupBy === "none"}   onClick={() => setGroupBy("none")}>None</Chip>
          <Chip active={groupBy === "bucket"} onClick={() => setGroupBy("bucket")}>By due</Chip>
          <Chip active={groupBy === "client"} onClick={() => setGroupBy("client")}>By client</Chip>
        </div>

        <div className="spacer" />
        <span className="dim mono" style={{ fontSize: 11, whiteSpace: "nowrap" }}>
          {sorted.length} of {D.ACTION_ITEMS.length}
        </span>
      </div>

      {/* Bulk action bar (sticky when selected) */}
      {selected.size > 0 && (
        <div className="bulk-bar" data-api="POST /api/action-items/bulk">
          <span className="bulk-bar__count"><strong>{selected.size}</strong> selected</span>
          <div className="bulk-bar__actions">
            <button className="btn btn--sm"><CheckIcon /> Mark complete</button>
            <button className="btn btn--sm">Reassign…</button>
            <button className="btn btn--sm">Move to next week</button>
            <button className="btn btn--sm btn--danger">Archive</button>
          </div>
          <button className="btn btn--sm btn--ghost" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {/* Table */}
      <div className="card">
        <div className="card__body card__body--flush">
          {sorted.length === 0 ? (
            <div className="empty empty--lg">
              <div style={{ marginBottom: 6, fontWeight: 500, color: "var(--text)" }}>No items match these filters.</div>
              <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 12 }}>
                Try widening the saved view, clearing search, or removing chips.
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                <button className="btn btn--sm" onClick={() => applySavedView("my-open")}>Reset to My open</button>
                <button className="btn btn--sm" onClick={() => applySavedView("all")}>Show all</button>
              </div>
            </div>
          ) : (
            <table className="table table--checkable">
              <thead>
                <tr>
                  <th style={{ width: 32 }}>
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" />
                  </th>
                  <th className="sortable" onClick={() => toggleSort("desc")}>Description {arrow("desc")}</th>
                  <th className="sortable" onClick={() => toggleSort("client")} style={{ width: 140 }}>Client {arrow("client")}</th>
                  <th className="sortable" onClick={() => toggleSort("owner")}  style={{ width: 110 }}>Owner {arrow("owner")}</th>
                  <th className="sortable" onClick={() => toggleSort("bucket")} style={{ width: 130 }}>Due {arrow("bucket")}</th>
                  <th className="sortable" onClick={() => toggleSort("status")} style={{ width: 150 }}>Status {arrow("status")}</th>
                  <th style={{ width: 32 }}></th>
                </tr>
              </thead>
              <tbody>
                {groups.map(g => (
                  <React.Fragment key={g.key || "all"}>
                    {g.label && (
                      <tr className="group-header">
                        <td colSpan="7">
                          <div className="group-header__inner">
                            <span className="group-header__label">{g.label}</span>
                            <span className="group-header__count mono">{g.items.length}</span>
                          </div>
                        </td>
                      </tr>
                    )}
                    {g.items.map(a => {
                      const c = getClient(a.client_id);
                      const completed = a.status === "complete";
                      const isSelected = selected.has(a.id);
                      return (
                        <tr key={a.id}
                            className={`${completed ? "row-strike" : ""} ${isSelected ? "is-selected" : ""}`}
                            onClick={() => openActionItem(a.id)}>
                          <td onClick={e => e.stopPropagation()}>
                            <input type="checkbox" checked={isSelected} onChange={() => toggleOne(a.id)} aria-label={`Select ${a.id}`} />
                          </td>
                          <td>
                            <div className="tr" style={{ maxWidth: 540 }}>{a.description}</div>
                            <div className="dim" style={{ fontSize: 11, fontFamily: "var(--font-mono)", marginTop: 2 }}>
                              {a.id} · {a.category.toLowerCase()}{a.duration_class === "long_running" ? " · long-running" : ""}{a.partner_required ? ` · ${a.partner_type?.toLowerCase()}-blocked` : ""}
                            </div>
                          </td>
                          <td className="muted">{c?.household_name.replace(" Family", "")}</td>
                          <td className="muted">{ownerLabel(a.owner)}</td>
                          <td><TimingBadge bucket={a.timing_bucket} /></td>
                          <td className="col-status"><StatusBadge status={a.status} /></td>
                          <td>
                            <button className="iconbtn" onClick={(e) => { e.stopPropagation(); }}><DotsIcon /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="placeholder-block" style={{ marginTop: 16, fontSize: 11 }}>
        GET /api/action-items?owner={ownerFilter}&amp;status={statusFilter}&amp;bucket={bucketFilter}{clientFilter !== "all" && `&client_id=${clientFilter}`}{partnerOnly && "&partner_required=true"}{search && `&q=${encodeURIComponent(search)}`}&amp;sort={sortKey}&amp;dir={sortDir}
      </div>
    </div>
  );
}

// ────────────────── Detail drawer ──────────────────
// Unchanged in this revision — left intact for reuse.
function ActionItemDrawer({ id, onClose, onStatusChange, completedReminder }) {
  const item = id ? window.AXIOM_DATA.ACTION_ITEMS.find(a => a.id === id) : null;
  if (!item) return <Drawer open={false} onClose={onClose} title="Action item" />;
  const c = getClient(item.client_id);

  const cycleStatus = () => {
    const order = ["not_started", "in_progress", "pending_decision", "complete"];
    const next = order[(order.indexOf(item.status) + 1) % order.length];
    onStatusChange(item.id, next);
  };

  const linkedNote = window.AXIOM_DATA.NOTES.find(n => n.promoted_to_action_item_id === item.id);

  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      title={`Action item · ${item.id}`}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose}>Close</button>
          <div className="row">
            <button className="btn">Edit</button>
            {item.status !== "complete"
              ? <button className="btn btn--primary" onClick={() => onStatusChange(item.id, "complete")} data-api={`PATCH /api/action-items/${item.id}`}><CheckIcon /> Mark complete</button>
              : <button className="btn" onClick={() => onStatusChange(item.id, "in_progress")}>Reopen</button>}
          </div>
        </>
      }
    >
      <div style={{ marginBottom: 16 }}>
        <div className="row" style={{ gap: 8, marginBottom: 8 }}>
          <StatusBadge status={item.status} onClick={cycleStatus} />
          <TimingBadge bucket={item.timing_bucket} />
          {item.partner_required && (
            <span className="badge badge--ghost"><LinkIcon size={10} />{item.partner_type} required</span>
          )}
          {item.duration_class === "long_running" && (
            <span className="badge badge--ghost"><ClockIcon size={10} />Long-running</span>
          )}
        </div>
        <div style={{ fontSize: 16, lineHeight: 1.4, marginTop: 8, fontWeight: 500 }}>
          {item.description}
        </div>
      </div>

      <div className="divider" />

      <dl className="kv" style={{ marginBottom: 20 }}>
        <dt>Client</dt>
        <dd>
          <a onClick={() => { onClose(); navigate(`/clients/${c.id}`); }} style={{ cursor: "pointer", textDecoration: "underline", textDecorationColor: "var(--n-200)" }}>
            {c.household_name}
          </a>
        </dd>
        <dt>Category</dt>            <dd className="mono">{item.category}</dd>
        <dt>Owner</dt>                <dd>{ownerLabel(item.owner)}</dd>
        <dt>Created</dt>              <dd>{fmtDate(item.created_at)}</dd>
        <dt>Due</dt>                  <dd>{fmtDate(item.due_at)} <span className="dim">· {fmtRelative(item.due_at)}</span></dd>
        {item.completed_at && (<><dt>Completed</dt><dd>{fmtDate(item.completed_at)}</dd></>)}
        <dt>Duration</dt>             <dd className="muted">{item.duration_class.replace("_", "-")}</dd>
      </dl>

      {linkedNote && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card__head">
            <h2>Origin note</h2>
            <span className="dim mono" style={{ fontSize: 11 }}>{linkedNote.id}</span>
          </div>
          <div className="card__body">
            <div className="dim" style={{ fontSize: 11, fontFamily: "var(--font-mono)", marginBottom: 6 }}>
              {fmtDate(linkedNote.created_at)} · {linkedNote.tag}
            </div>
            <div>{linkedNote.body}</div>
          </div>
        </div>
      )}

      {item.duration_class === "long_running" && (
        <div className="card">
          <div className="card__head">
            <h2>Derivative reminders</h2>
            <span className="badge badge--ghost">Phase 5d</span>
          </div>
          <div className="card__body">
            <div className="placeholder-block" style={{ padding: 14, fontSize: 11 }}>
              Long-running items will spawn weekly check-in reminders<br/>
              once the cron lands in Phase 5d.
            </div>
          </div>
        </div>
      )}

      {completedReminder && (
        <div style={{ marginTop: 16, padding: 12, background: "var(--s-green-bg)", border: "1px solid #d0e1d6", borderRadius: 6, fontSize: 12 }}>
          <CheckIcon /> Marked complete. A derivative reminder would spawn here in Phase 5d.
        </div>
      )}
    </Drawer>
  );
}

// Inline icons local to this view
function SearchIcon({ size = 14 }) {
  return <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
    <circle cx="6" cy="6" r="4" /><path d="M9 9l3 3" strokeLinecap="round" />
  </svg>;
}
function DownloadIcon() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
    <path d="M7 1v8M4 6l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2 11v1.5a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5V11" strokeLinecap="round" />
  </svg>;
}

Object.assign(window, { ActionItems, ActionItemDrawer });
