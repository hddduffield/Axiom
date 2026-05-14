// Clients list + client detail (5 tabs: Overview / Plans / Action Items / Notes / Lens Runs / Partners)

function ClientsList() {
  const D = window.AXIOM_DATA;
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [archetypeFilter, setArchetypeFilter] = React.useState("all");
  const [advisorFilter, setAdvisorFilter] = React.useState("all");
  const [sortKey, setSortKey] = React.useState("activity");
  const [newOpen, setNewOpen] = React.useState(false);

  let clients = D.CLIENTS.filter((c) => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (archetypeFilter !== "all" && c.archetype !== archetypeFilter) return false;
    if (advisorFilter !== "all" && c.lead_advisor_id !== advisorFilter) return false;
    return true;
  });

  // Sort
  clients = [...clients].sort((a, b) => {
    if (sortKey === "household") return a.household_name.localeCompare(b.household_name);
    if (sortKey === "aum") return b.aum - a.aum;
    if (sortKey === "activity") return b.last_activity_at.localeCompare(a.last_activity_at);
    if (sortKey === "open") {
      const ao = D.ACTION_ITEMS.filter((x) => x.client_id === a.id && x.status !== "complete").length;
      const bo = D.ACTION_ITEMS.filter((x) => x.client_id === b.id && x.status !== "complete").length;
      return bo - ao;
    }
    return 0;
  });

  const cnt = (s) => D.CLIENTS.filter((c) => c.status === s).length;

  return (
    <div className="page" data-screen-label="04 Clients" style={{ fontFamily: "Geist" }}>
      <PageHead
        title="Clients"
        subtitle={`${D.CLIENTS.length} households`}
        actions={
        <>
            <button className="btn" onClick={() => navigate("/plans/generate")}><FileIcon /> Generate plan</button>
            <button className="btn btn--primary" onClick={() => setNewOpen(true)} data-api="POST /api/clients"><PlusIcon /> New client</button>
          </>
        } />
      

      <div className="filter-row" style={{ fontWeight: "500", fontSize: "15px" }}>
        <span className="filter-row__label">Status</span>
        <div className="chips">
          <Chip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>All <span className="chip__count">{D.CLIENTS.length}</span></Chip>
          <Chip active={statusFilter === "active"} onClick={() => setStatusFilter("active")}>Active <span className="chip__count">{cnt("active")}</span></Chip>
          <Chip active={statusFilter === "prospect"} onClick={() => setStatusFilter("prospect")}>Prospect <span className="chip__count">{cnt("prospect")}</span></Chip>
        </div>

        <span className="filter-row__sep" />
        <span className="filter-row__label">Archetype</span>
        <div className="chips">
          <Chip active={archetypeFilter === "all"} onClick={() => setArchetypeFilter("all")}>All</Chip>
          <Chip active={archetypeFilter === "PRE"} onClick={() => setArchetypeFilter("PRE")}>Pre</Chip>
          <Chip active={archetypeFilter === "MID"} onClick={() => setArchetypeFilter("MID")}>Mid</Chip>
          <Chip active={archetypeFilter === "POST"} onClick={() => setArchetypeFilter("POST")}>Post</Chip>
        </div>

        <span className="filter-row__sep" />
        <span className="filter-row__label">Lead</span>
        <div className="chips">
          <Chip active={advisorFilter === "all"} onClick={() => setAdvisorFilter("all")}>All</Chip>
          {D.ADVISORS.map((a) =>
          <Chip key={a.id} active={advisorFilter === a.id} onClick={() => setAdvisorFilter(a.id)}>
              {a.first_name}
            </Chip>
          )}
        </div>

        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
          {clients.length} of {D.CLIENTS.length}
        </span>
      </div>

      {clients.length === 0 ?
      <div className="card">
          <div className="card__body">
            <div className="empty">
              No households match these filters.
              <button className="btn btn--sm" style={{ marginLeft: 8 }} onClick={() => {setStatusFilter("all");setArchetypeFilter("all");setAdvisorFilter("all");}}>
                Reset filters
              </button>
            </div>
          </div>
        </div> :

      <div className="card">
        <div className="card__body card__body--flush">
          <table className="table">
            <thead>
              <tr>
                <th onClick={() => setSortKey("household")} style={{ cursor: "pointer" }}>
                  Household {sortKey === "household" && <SortArrow />}
                </th>
                <th style={{ width: 110 }}>Status</th>
                <th style={{ width: 130 }}>Lead advisor</th>
                <th style={{ width: 100 }}>Archetype</th>
                <th onClick={() => setSortKey("aum")} style={{ width: 110, textAlign: "right", cursor: "pointer" }}>
                  AUM {sortKey === "aum" && <SortArrow />}
                </th>
                <th onClick={() => setSortKey("open")} style={{ width: 110, cursor: "pointer" }}>
                  Open items {sortKey === "open" && <SortArrow />}
                </th>
                <th onClick={() => setSortKey("activity")} style={{ width: 140, cursor: "pointer" }}>
                  Last activity {sortKey === "activity" && <SortArrow />}
                </th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => {
                const lead = getAdvisor(c.lead_advisor_id);
                const open = D.ACTION_ITEMS.filter((a) => a.client_id === c.id && a.status !== "complete").length;
                return (
                  <tr key={c.id} onClick={() => navigate(`/clients/${c.id}`)}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{c.household_name}</div>
                      <div className="dim" style={{ fontSize: 11, fontFamily: "var(--font-mono)", marginTop: 2 }}>{c.id}</div>
                    </td>
                    <td>
                      {c.status === "active" && <span className="badge badge--green"><span className="dot"></span>Active</span>}
                      {c.status === "prospect" && <span className="badge badge--amber"><span className="dot"></span>Prospect</span>}
                      {c.status === "inactive" && <span className="badge badge--slate"><span className="dot"></span>Inactive</span>}
                    </td>
                    <td className="muted">{lead?.first_name} {lead?.last_name[0]}.</td>
                    <td><span className="tag">{c.archetype}</span></td>
                    <td className="num" style={{ textAlign: "right" }}>{c.aum > 0 ? fmtMoney(c.aum) : <span className="dim">—</span>}</td>
                    <td className="num">{open || <span className="dim">0</span>}</td>
                    <td className="muted" style={{ fontFamily: "\"SF Mono\"" }}>{fmtRelative(c.last_activity_at)}</td>
                  </tr>);

              })}
            </tbody>
          </table>
        </div>
      </div>
      }

      <NewClientDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </div>);

}

function SortArrow() {
  return <span style={{ marginLeft: 2, fontSize: 9, color: "var(--text-3)" }}>▼</span>;
}

// + New Client modal — POST /api/clients
function NewClientDialog({ open, onClose }) {
  const D = window.AXIOM_DATA;
  const [name, setName] = React.useState("");
  const [archetype, setArchetype] = React.useState("MID");
  const [status, setStatus] = React.useState("prospect");
  const [leadId, setLeadId] = React.useState(D.ME.id);
  const [aum, setAum] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName("");setArchetype("MID");setStatus("prospect");
      setLeadId(D.ME.id);setAum("");setSubmitting(false);
    }
  }, [open]);

  const onSubmit = (e) => {
    e.preventDefault();
    setSubmitting(true);
    setTimeout(() => {
      // Mock — append in-memory and navigate. In real app this returns the new client_id.
      const id = `mock-client-${name.toLowerCase().split(/\s+/)[0].replace(/[^a-z]/g, "")}`;
      D.CLIENTS.push({
        id,
        household_name: name + (name.toLowerCase().includes("family") ? "" : " Family"),
        lead_advisor_id: leadId,
        status,
        archetype,
        last_activity_at: new Date().toISOString(),
        aum: aum ? Number(aum) : 0,
        entity_count: 1,
        notes: "Added via + New client dialog."
      });
      setSubmitting(false);
      onClose();
      navigate(`/clients/${id}`);
    }, 400);
  };

  return (
    <Modal open={open} onClose={onClose} title="New client"
    subtitle="Creates a new household record. AUM and entity count can be filled in later."
    footer={
    <>
               <button type="button" className="btn" onClick={onClose}>Cancel</button>
               <button type="submit" form="new-client-form" className="btn btn--primary" disabled={!name || submitting} data-api="POST /api/clients">
                 {submitting ? "Creating…" : "Create client"}
               </button>
             </>
    }>
      <form id="new-client-form" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="nc-name">Household name</label>
          <input id="nc-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Holloway" required autoFocus />
          <div className="dim" style={{ fontSize: 11 }}>"Family" will be appended automatically if not included.</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="field">
            <label htmlFor="nc-arch">Archetype</label>
            <select id="nc-arch" value={archetype} onChange={(e) => setArchetype(e.target.value)}>
              <option value="PRE">PRE — pre-liquidity</option>
              <option value="MID">MID — mid-life</option>
              <option value="POST">POST — post-liquidity</option>
              <option value="NONE">NONE — undetermined</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="nc-status">Status</label>
            <select id="nc-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="prospect">Prospect</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="field">
            <label htmlFor="nc-lead">Lead advisor</label>
            <select id="nc-lead" value={leadId} onChange={(e) => setLeadId(e.target.value)}>
              {D.ADVISORS.map((a) =>
              <option key={a.id} value={a.id}>{a.first_name} {a.last_name}</option>
              )}
            </select>
          </div>
          <div className="field">
            <label htmlFor="nc-aum">AUM (optional)</label>
            <input id="nc-aum" type="number" min="0" value={aum} onChange={(e) => setAum(e.target.value)} placeholder="e.g. 25000000" style={{ fontFamily: "var(--font-mono)" }} />
          </div>
        </div>
        <div className="placeholder-block" style={{ marginTop: 4 }}>
          POST /api/clients · returns &#123; id, household_name, ... &#125;
        </div>
      </form>
    </Modal>);

}

// ────────────────── Client detail ──────────────────
function ClientDetail({ clientId, openActionItem }) {
  const D = window.AXIOM_DATA;
  const c = getClient(clientId);
  const [tab, setTab] = React.useState("overview");

  if (!c) return <div className="page"><PageHead title="Not found" /></div>;

  const lead = getAdvisor(c.lead_advisor_id);
  const aiAll = D.ACTION_ITEMS.filter((a) => a.client_id === c.id);
  const aiOpen = aiAll.filter((a) => a.status !== "complete");
  const notes = D.NOTES.filter((n) => n.client_id === c.id);
  const plans = D.PLANS.filter((p) => p.client_id === c.id);
  const lenses = D.LENS_RUNS.filter((l) => l.client_id === c.id);
  const partners = D.PARTNERS.filter((p) => p.client_id === c.id);

  const tabs = [
  { id: "overview", label: "Overview" },
  { id: "plan", label: "Plan", count: plans.length },
  { id: "items", label: "Action items", count: aiOpen.length },
  { id: "notes", label: "Notes", count: notes.length },
  { id: "lenses", label: "Lens runs", count: lenses.length },
  { id: "partners", label: "Partners", count: partners.length }];


  return (
    <div className="page" data-screen-label={`05 Client · ${c.household_name}`}>
      <PageHead
        crumbs={[{ label: "Clients", to: "/clients" }, { label: c.household_name }]}
        title={c.household_name}
        subtitle={
        <span>
            <span className="mono">{c.id}</span> · Lead: {lead?.first_name} {lead?.last_name[0]}. ·
            {" "}<span className="tag" style={{ display: "inline-flex", margin: "0 4px" }}>{c.archetype}</span>
            {" "}AUM {fmtMoney(c.aum)} · {c.entity_count} entities
          </span>
        }
        actions={
        <>
            <button className="btn"><PlusIcon /> Note</button>
            <button className="btn"><PlusIcon /> Item</button>
            <button className="btn btn--primary" onClick={() => navigate("/plans/generate")} data-api="POST /plans/generate"><FileIcon /> Generate plan</button>
          </>
        } />
      

      <TabBar tabs={tabs} value={tab} onChange={setTab} />

      {tab === "overview" && <ClientOverview client={c} aiOpen={aiOpen} notes={notes} plans={plans} openActionItem={openActionItem} />}
      {tab === "plan" && <ClientPlanTab client={c} plans={plans} />}
      {tab === "items" && <ClientItemsTab items={aiAll} openActionItem={openActionItem} />}
      {tab === "notes" && <ClientNotesTab notes={notes} />}
      {tab === "lenses" && <ClientLensesTab lenses={lenses} />}
      {tab === "partners" && <ClientPartnersTab partners={partners} />}
    </div>);

}

function ClientOverview({ client, aiOpen, notes, plans, openActionItem }) {
  const D = window.AXIOM_DATA;
  const overdue = aiOpen.filter((a) => a.timing_bucket === "overdue").length;
  const week = aiOpen.filter((a) => a.timing_bucket === "this_week").length;
  const pending = aiOpen.filter((a) => a.status === "pending_decision").length;
  const recentNotes = [...notes].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 3);

  return (
    <div className="grid grid--client">
      {/* Left rail */}
      <div className="col-stack">
        <div className="card">
          <div className="card__head"><h2>Profile</h2></div>
          <div className="card__body">
            <dl className="kv">
              <dt>Status</dt>
              <dd>{client.status === "active" ? <span className="badge badge--green"><span className="dot"></span>Active</span> : <span className="badge badge--amber"><span className="dot"></span>Prospect</span>}</dd>
              <dt>Archetype</dt>      <dd><span className="tag">{client.archetype}</span> {archetypeLabel(client.archetype)}</dd>
              <dt>Lead advisor</dt>   <dd>{getAdvisor(client.lead_advisor_id)?.first_name} {getAdvisor(client.lead_advisor_id)?.last_name}</dd>
              <dt>AUM</dt>            <dd className="mono">{fmtMoney(client.aum)}</dd>
              <dt>Entities</dt>       <dd>{client.entity_count}</dd>
              <dt>Last activity</dt>  <dd>{fmtRelative(client.last_activity_at)}</dd>
            </dl>
            <div className="divider" />
            <div className="dim" style={{ fontSize: 11, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Notes</div>
            <div style={{ fontSize: 12, color: "var(--text-2)" }}>{client.notes}</div>
          </div>
        </div>

        <div className="card">
          <div className="card__head"><h2>Activity</h2></div>
          <div className="card__body">
            <div className="stat" style={{ marginBottom: 12 }}>
              <div className="stat__label">Open items</div>
              <div className="stat__value">{aiOpen.length}</div>
              <div className="stat__delta">{overdue} overdue · {week} this week · {pending} pending</div>
            </div>
            <div className="divider" />
            <div className="stat">
              <div className="stat__label">Notes (90d)</div>
              <div className="stat__value">{notes.length}</div>
              <div className="stat__delta">{notes.filter((n) => n.promoted_to_action_item_id).length} promoted to items</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="col-stack">
        <div className="card">
          <div className="card__head">
            <h2>Open action items</h2>
            <span className="dim mono" style={{ fontSize: 11 }}>{aiOpen.length}</span>
          </div>
          <div className="card__body card__body--flush">
            <table className="table table--compact">
              <thead>
                <tr>
                  <th>Item</th>
                  <th style={{ width: 110 }}>Owner</th>
                  <th style={{ width: 110 }}>Due</th>
                  <th style={{ width: 140 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {aiOpen.slice(0, 10).map((a) =>
                <tr key={a.id} onClick={() => openActionItem(a.id)}>
                    <td>
                      <div className="tr" style={{ maxWidth: 460 }}>{a.description}</div>
                      <div className="dim" style={{ fontSize: 11, fontFamily: "var(--font-mono)", marginTop: 2 }}>{a.id} · {a.category.toLowerCase()}</div>
                    </td>
                    <td className="muted">{ownerLabel(a.owner)}</td>
                    <td><TimingBadge bucket={a.timing_bucket} /></td>
                    <td><StatusBadge status={a.status} /></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card__head">
            <h2>Recent notes</h2>
          </div>
          <div className="card__body">
            <div className="timeline">
              {recentNotes.map((n) => {
                const a = getAdvisor(n.author_advisor_id);
                return (
                  <div key={n.id} className="timeline__item is-self">
                    <div className="timeline__meta">{fmtRelative(n.created_at)} · {a?.first_name} · <span className="tag" style={{ display: "inline-flex" }}>{n.tag}</span></div>
                    <div className="timeline__body">{n.body}</div>
                  </div>);

              })}
            </div>
          </div>
        </div>
      </div>
    </div>);

}

function archetypeLabel(a) {
  return { PRE: "pre-liquidity", MID: "mid-life", POST: "post-liquidity", NONE: "—" }[a] || a;
}

function ClientPlanTab({ client, plans }) {
  if (plans.length === 0) {
    return <div className="card"><div className="card__body"><div className="empty">No plans generated yet. <button className="btn btn--sm" style={{ marginLeft: 8 }} onClick={() => navigate("/plans/generate")}>Generate plan</button></div></div></div>;
  }
  return (
    <div className="col-stack">
      <div className="card">
        <div className="card__head">
          <h2>Plans</h2>
          <button className="btn btn--sm"><PlusIcon /> Generate</button>
        </div>
        <div className="card__body card__body--flush">
          <table className="table">
            <thead>
              <tr><th>Title</th><th style={{ width: 100 }}>Status</th><th style={{ width: 130 }}>Created</th><th style={{ width: 130 }}>Approved</th><th style={{ width: 60 }}></th></tr>
            </thead>
            <tbody>
              {plans.map((p) =>
              <tr key={p.id} onClick={() => navigate(`/plans/${p.id}`)}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{p.title}</div>
                    <div className="dim mono" style={{ fontSize: 11, marginTop: 2 }}>{p.id}</div>
                  </td>
                  <td>
                    {p.status === "approved" && <span className="badge badge--green"><span className="dot"></span>Approved</span>}
                    {p.status === "draft" && <span className="badge badge--amber"><span className="dot"></span>Draft</span>}
                    {p.status === "archived" && <span className="badge badge--slate"><span className="dot"></span>Archived</span>}
                  </td>
                  <td className="muted">{fmtDate(p.created_at)}</td>
                  <td className="muted">{p.approved_at ? fmtDate(p.approved_at) : "—"}</td>
                  <td><ChevronIcon /></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>);

}

function ClientItemsTab({ items, openActionItem }) {
  return (
    <div className="card">
      <div className="card__body card__body--flush">
        <table className="table">
          <thead>
            <tr>
              <th>Item</th>
              <th style={{ width: 110 }}>Owner</th>
              <th style={{ width: 110 }}>Due</th>
              <th style={{ width: 140 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) =>
            <tr key={a.id} className={a.status === "complete" ? "row-strike" : ""} onClick={() => openActionItem(a.id)}>
                <td>
                  <div className="tr" style={{ maxWidth: 540 }}>{a.description}</div>
                  <div className="dim" style={{ fontSize: 11, fontFamily: "var(--font-mono)", marginTop: 2 }}>{a.id} · {a.category.toLowerCase()}</div>
                </td>
                <td className="muted">{ownerLabel(a.owner)}</td>
                <td><TimingBadge bucket={a.timing_bucket} /></td>
                <td className="col-status"><StatusBadge status={a.status} /></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>);

}

function ClientNotesTab({ notes }) {
  return (
    <div className="card">
      <div className="card__head">
        <h2>Notes</h2>
        <button className="btn btn--sm"><PlusIcon /> New note</button>
      </div>
      <div className="card__body">
        {notes.length === 0 && <div className="empty">No notes yet.</div>}
        <div className="timeline">
          {notes.map((n) => {
            const a = getAdvisor(n.author_advisor_id);
            return (
              <div key={n.id} className="timeline__item is-self">
                <div className="timeline__meta">{fmtDate(n.created_at)} · {a?.first_name} {a?.last_name[0]}. · <span className="tag" style={{ display: "inline-flex" }}>{n.tag}</span> · <span className="mono">{n.id}</span></div>
                <div className="timeline__body">{n.body}</div>
                {n.promoted_to_action_item_id ?
                <div className="dim" style={{ fontSize: 11, marginTop: 4, fontFamily: "var(--font-mono)" }}>→ {n.promoted_to_action_item_id}</div> :

                <div style={{ marginTop: 6 }}><button className="btn btn--sm">Promote to action item</button></div>
                }
              </div>);

          })}
        </div>
      </div>
    </div>);

}

function ClientLensesTab({ lenses }) {
  return (
    <div className="card">
      <div className="card__head">
        <h2>Lens runs</h2>
        <button className="btn btn--sm"><PlusIcon /> Run lens</button>
      </div>
      <div className="card__body card__body--flush">
        <table className="table">
          <thead><tr><th>Run</th><th style={{ width: 130 }}>Type</th><th style={{ width: 110 }}>Status</th><th style={{ width: 130 }}>Created</th></tr></thead>
          <tbody>
            {lenses.map((l) =>
            <tr key={l.id}>
                <td>
                  <div className="tr" style={{ maxWidth: 480 }}>{l.context_input}</div>
                  <div className="dim mono" style={{ fontSize: 11, marginTop: 2 }}>{l.id}</div>
                </td>
                <td><span className="tag">{l.lens_type}</span></td>
                <td>{l.status === "complete" ? <span className="badge badge--green"><span className="dot"></span>Complete</span> : <span className="badge badge--amber"><span className="dot"></span>Draft</span>}</td>
                <td className="muted">{fmtDate(l.created_at)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>);

}

function ClientPartnersTab({ partners }) {
  return (
    <div className="card">
      <div className="card__head">
        <h2>Partners</h2>
        <button className="btn btn--sm"><PlusIcon /> Add partner</button>
      </div>
      <div className="card__body card__body--flush">
        <table className="table">
          <thead>
            <tr><th>Name</th><th style={{ width: 100 }}>Type</th><th>Firm</th><th style={{ width: 200 }}>Email</th><th style={{ width: 130 }}>Phone</th></tr>
          </thead>
          <tbody>
            {partners.map((p) =>
            <tr key={p.id}>
                <td>
                  <div style={{ fontWeight: 500 }}>{p.first_name} {p.last_name}</div>
                  <div className="dim" style={{ fontSize: 11, marginTop: 2 }}>{p.notes}</div>
                </td>
                <td><span className="tag">{p.partner_type}</span></td>
                <td className="muted">{p.firm_name}</td>
                <td className="mono" style={{ fontSize: 12 }}>{p.email}</td>
                <td className="mono muted" style={{ fontSize: 12 }}>{p.phone}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>);

}

Object.assign(window, { ClientsList, ClientDetail });