// Notes hub — global feed + promote-to-action dialog
//
// API contract surface (v1):
//   GET    /api/notes                         → list, filterable
//                                                 ?client_id=&tag=&author=&q=&from=&to=
//   POST   /api/notes                         → body: NoteCreate; returns NoteEntity
//   PATCH  /api/notes/[id]                    → body: NotePatch (body, tag)
//   DELETE /api/notes/[id]                    → soft-delete (archived_at)
//   POST   /api/notes/[id]/promote            → body: AICreate fragment;
//                                                returns AIEntity, sets note.promoted_to_action_item_id

const NOTE_TAGS = [
{ id: "client_meeting", label: "Client meeting" },
{ id: "internal", label: "Internal" },
{ id: "partner_touchpoint", label: "Partner touchpoint" },
{ id: "phone_call", label: "Phone call" },
{ id: "email_thread", label: "Email thread" },
{ id: "research", label: "Research" }];


function NotesHub() {
  const D = window.AXIOM_DATA;
  const [clientFilter, setClientFilter] = React.useState("all");
  const [tagFilter, setTagFilter] = React.useState("all");
  const [authorFilter, setAuthorFilter] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [scope, setScope] = React.useState("all"); // all | promotable | promoted
  const [promoteFor, setPromoteFor] = React.useState(null);
  const [composing, setComposing] = React.useState(false);

  const filtered = D.NOTES.
  filter((n) => clientFilter === "all" || n.client_id === clientFilter).
  filter((n) => tagFilter === "all" || n.tag === tagFilter).
  filter((n) => authorFilter === "all" || n.author_advisor_id === authorFilter).
  filter((n) => {
    if (scope === "promotable") return !n.promoted_to_action_item_id;
    if (scope === "promoted") return !!n.promoted_to_action_item_id;
    return true;
  }).
  filter((n) => {
    if (!search) return true;
    const s = search.toLowerCase();
    const c = getClient(n.client_id);
    return n.body.toLowerCase().includes(s) ||
    n.id.toLowerCase().includes(s) ||
    c && c.household_name.toLowerCase().includes(s);
  }).
  sort((a, b) => b.created_at.localeCompare(a.created_at));

  // Group by relative period
  const groups = React.useMemo(() => {
    const today = "2026-05-03";
    const wk = "2026-04-26";
    const mo = "2026-04-03";
    const buckets = { today: [], week: [], month: [], earlier: [] };
    filtered.forEach((n) => {
      const d = (n.created_at || "").slice(0, 10);
      if (d >= today) buckets.today.push(n);else
      if (d >= wk) buckets.week.push(n);else
      if (d >= mo) buckets.month.push(n);else
      buckets.earlier.push(n);
    });
    return [
    { key: "today", label: "Today", items: buckets.today },
    { key: "week", label: "This week", items: buckets.week },
    { key: "month", label: "This month", items: buckets.month },
    { key: "earlier", label: "Earlier", items: buckets.earlier }].
    filter((g) => g.items.length > 0);
  }, [filtered.map((n) => n.id).join(",")]);

  const cnt = (pred) => D.NOTES.filter(pred).length;
  const promotable = cnt((n) => !n.promoted_to_action_item_id);
  const promoted = cnt((n) => n.promoted_to_action_item_id);

  // Author chip — top 4 by recency, then "more"
  const authorIds = [...new Set(D.NOTES.map((n) => n.author_advisor_id))];

  const resetAll = () => {
    setClientFilter("all");setTagFilter("all");setAuthorFilter("all");setSearch("");setScope("all");
  };
  const anyFilter = clientFilter !== "all" || tagFilter !== "all" || authorFilter !== "all" || search || scope !== "all";

  return (
    <div className="page" data-screen-label="06 Notes hub">
      <PageHead
        title="Notes"
        subtitle={
        <>
            {D.NOTES.length} notes across {new Set(D.NOTES.map((n) => n.client_id)).size} clients ·
            {" "}<span className="mono">{promotable}</span> promotable ·
            {" "}<span className="mono">{promoted}</span> promoted
          </>
        }
        actions={
        <button className="btn btn--primary" onClick={() => setComposing((v) => !v)} data-api="POST /api/notes">
            <PlusIcon /> {composing ? "Close composer" : "New note"}
          </button>
        } />
      

      {/* Inline composer */}
      {composing && <QuickCompose onSave={() => setComposing(false)} onCancel={() => setComposing(false)} />}

      {/* Scope */}
      <div className="saved-views">
        <span className="saved-views__label">Scope</span>
        <div className="saved-views__list">
          <button className={`saved-view ${scope === "all" ? "is-active" : ""}`} onClick={() => setScope("all")}>
            All notes <span className="saved-view__count">{D.NOTES.length}</span>
          </button>
          <button className={`saved-view ${scope === "promotable" ? "is-active" : ""}`} onClick={() => setScope("promotable")}>
            Not yet promoted <span className="saved-view__count">{promotable}</span>
          </button>
          <button className={`saved-view ${scope === "promoted" ? "is-active" : ""}`} onClick={() => setScope("promoted")}>
            Already promoted <span className="saved-view__count">{promoted}</span>
          </button>
        </div>
      </div>

      {/* Filter row */}
      <div className="filter-row">
        <span className="filter-row__label">Client</span>
        <select className="chip" style={{ paddingRight: 24 }} value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
          <option value="all">All clients</option>
          {D.CLIENTS.map((c) => <option key={c.id} value={c.id}>{c.household_name}</option>)}
        </select>
        <span className="filter-row__sep" />

        <span className="filter-row__label">Tag</span>
        <div className="chips">
          <Chip active={tagFilter === "all"} onClick={() => setTagFilter("all")}>All</Chip>
          {NOTE_TAGS.filter((t) => D.NOTES.some((n) => n.tag === t.id)).map((t) =>
          <Chip key={t.id} active={tagFilter === t.id} onClick={() => setTagFilter(t.id)}>{t.label}</Chip>
          )}
        </div>
        <span className="filter-row__sep" />

        <span className="filter-row__label">Author</span>
        <div className="chips">
          <Chip active={authorFilter === "all"} onClick={() => setAuthorFilter("all")}>All</Chip>
          <Chip active={authorFilter === D.ME.id} onClick={() => setAuthorFilter(D.ME.id)}>Me</Chip>
          {D.ADVISORS.filter((a) => a.id !== D.ME.id && authorIds.includes(a.id)).map((a) =>
          <Chip key={a.id} active={authorFilter === a.id} onClick={() => setAuthorFilter(a.id)}>{a.first_name}</Chip>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="ai-toolbar">
        <div className="ai-toolbar__search" style={{ width: 320 }}>
          <SearchIcon size={12} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search note bodies, ids, or clients…" />
          
          {search && <button className="ai-toolbar__clear" onClick={() => setSearch("")}>×</button>}
        </div>
        <div className="spacer" />
        {anyFilter && <button className="btn btn--sm btn--ghost" onClick={resetAll}>Reset filters</button>}
        <span className="dim mono" style={{ fontSize: 11, whiteSpace: "nowrap" }}>
          {filtered.length} of {D.NOTES.length}
        </span>
      </div>

      {/* Notes feed */}
      {filtered.length === 0 ?
      <div className="card"><div className="card__body">
          <div className="empty empty--lg">
            <div style={{ marginBottom: 6, fontWeight: 500, color: "var(--text)" }}>No notes match these filters.</div>
            <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 12 }}>
              Try clearing search, widening scope, or removing chips.
            </div>
            <button className="btn btn--sm" onClick={resetAll}>Reset filters</button>
          </div>
        </div></div> :

      <div className="notes-feed">
          {groups.map((g) =>
        <div key={g.key} className="notes-feed__group">
              <div className="notes-feed__heading">
                <span className="notes-feed__heading-label">{g.label}</span>
                <span className="notes-feed__heading-count mono">{g.items.length}</span>
                <span className="notes-feed__heading-line" />
              </div>
              {g.items.map((n) =>
          <NoteCard key={n.id} note={n} onPromote={() => setPromoteFor(n)} />
          )}
            </div>
        )}
        </div>
      }

      <div className="placeholder-block" style={{ marginTop: 16, fontSize: 11 }}>
        GET /api/notes{clientFilter !== "all" && `?client_id=${clientFilter}`}{tagFilter !== "all" && `&tag=${tagFilter}`}{authorFilter !== "all" && `&author=${authorFilter}`}{search && `&q=${encodeURIComponent(search)}`}
      </div>

      <PromoteDialog note={promoteFor} onClose={() => setPromoteFor(null)} />
    </div>);

}

// ────────────────── Note card ──────────────────
function NoteCard({ note, onPromote }) {
  const c = getClient(note.client_id);
  const a = getAdvisor(note.author_advisor_id);
  const D = window.AXIOM_DATA;
  const isMe = note.author_advisor_id === D.ME.id;
  const tagMeta = NOTE_TAGS.find((t) => t.id === note.tag);

  return (
    <div className={`note-card ${isMe ? "note-card--mine" : ""} ${note.promoted_to_action_item_id ? "note-card--promoted" : ""}`}>
      <div className="note-card__rail" />
      <div className="note-card__body">
        <div className="note-card__head">
          <div className="note-card__head-left">
            <span className="note-card__author">{a?.first_name} {a?.last_name[0]}.</span>
            <span className="note-card__sep">·</span>
            <a className="note-card__client" onClick={() => navigate(`/clients/${c?.id}`)}>{c?.household_name}</a>
            <span className="note-card__sep">·</span>
            <span className="tag" style={{ display: "inline-flex" }}>{tagMeta?.label || note.tag}</span>
          </div>
          <div className="note-card__head-right">
            <span className="dim mono" style={{ fontSize: 10 }}>{note.id}</span>
            <span className="dim" style={{ fontSize: 11 }}>{fmtRelative(note.created_at)}</span>
          </div>
        </div>
        <blockquote className="note-card__quote">{note.body}</blockquote>
        <div className="note-card__foot">
          {note.promoted_to_action_item_id ?
          <span className="note-card__promoted">
              <CheckIcon /> Promoted to <span className="mono">{note.promoted_to_action_item_id}</span>
            </span> :

          <button className="btn btn--sm" onClick={onPromote}>
              Promote to action item
            </button>
          }
          <button className="btn btn--sm btn--ghost">Edit</button>
          <button className="btn btn--sm btn--ghost">Reply</button>
        </div>
      </div>
    </div>);

}

// ────────────────── Quick compose ──────────────────
function QuickCompose({ onSave, onCancel }) {
  const D = window.AXIOM_DATA;
  const [body, setBody] = React.useState("");
  const [client, setClient] = React.useState(D.CLIENTS[0]?.id || "");
  const [tag, setTag] = React.useState("client_meeting");

  return (
    <div className="card quick-compose" data-api="POST /api/notes">
      <div className="card__head">
        <h2>New note</h2>
        <span className="dim" style={{ fontSize: 11 }}>Captures fast — promote later if it should become an action.</span>
      </div>
      <div className="card__body">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div className="field">
            <label>Client</label>
            <select value={client} onChange={(e) => setClient(e.target.value)}>
              {D.CLIENTS.map((c) => <option key={c.id} value={c.id}>{c.household_name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Tag</label>
            <select value={tag} onChange={(e) => setTag(e.target.value)}>
              {NOTE_TAGS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label>Body</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder="What happened? Decisions, asks, partner needs… capture the substance, not the formatting."
            autoFocus />
          
          <div className="dim" style={{ fontSize: 11, marginTop: 4 }}>
            Tip: notes can stay private to you, or you can promote them into action items that show on your dashboard.
          </div>
        </div>
        <div className="row" style={{ justifyContent: "flex-end", gap: 6, marginTop: 8 }}>
          <button className="btn btn--ghost" onClick={onCancel}>Cancel</button>
          <button className="btn">Save and promote…</button>
          <button className="btn btn--primary" onClick={onSave} disabled={!body.trim()}>
            <CheckIcon /> Save note
          </button>
        </div>
      </div>
    </div>);

}

// ────────────────── Promote dialog ──────────────────
function PromoteDialog({ note, onClose }) {
  const [desc, setDesc] = React.useState("");
  const [category, setCategory] = React.useState("ENGAGEMENT");
  const [bucket, setBucket] = React.useState("this_week");
  const [partnerReq, setPartnerReq] = React.useState(false);
  const [partnerType, setPartnerType] = React.useState("CPA");
  const [longRunning, setLongRunning] = React.useState(false);
  const [owner, setOwner] = React.useState("hayden@psawealth.com");

  React.useEffect(() => {
    if (note) {
      setDesc(note.body);
      setCategory("ENGAGEMENT");
      setBucket("this_week");
      setPartnerReq(false);
      setLongRunning(false);
    }
  }, [note]);

  const c = note ? getClient(note.client_id) : null;

  return (
    <Modal
      open={!!note}
      onClose={onClose}
      title="Promote note to action item"
      subtitle={note ? `From note ${note.id} · ${c?.household_name}` : ""}
      footer={
      <>
          <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" onClick={onClose} data-api={note ? `POST /api/notes/${note.id}/promote` : ""}>
            <CheckIcon /> Create action item
          </button>
        </>
      }>
      
      {/* Source preview */}
      {note &&
      <div className="promote-source">
          <div className="promote-source__head">
            <span className="dim" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>Source note</span>
            <span className="dim mono" style={{ fontSize: 10 }}>{note.id}</span>
          </div>
          <blockquote className="promote-source__body">{note.body}</blockquote>
        </div>
      }

      <div className="field">
        <label>Action description</label>
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={3}
          placeholder="Crisp, action-oriented sentence. The note body is a starting point — tighten it." />
        
        <div className="dim" style={{ fontSize: 11, marginTop: 4 }}>
          Recommendations: imperative verb, target outcome, and the next concrete step.
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="field">
          <label>Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {["ENGAGEMENT", "BUSINESS", "TAX", "ESTATE", "CASH_FLOW", "INSURANCE", "RETIREMENT", "PHILANTHROPY", "MEETING", "OPERATIONS", "COMPLIANCE", "PARTNERS"].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Timing</label>
          <select value={bucket} onChange={(e) => setBucket(e.target.value)}>
            <option value="this_week">This week</option>
            <option value="next_30_days">Next 30 days</option>
            <option value="next_90_days">Next 90 days</option>
          </select>
        </div>
      </div>

      <div className="field">
        <label>Owner</label>
        <select value={owner} onChange={(e) => setOwner(e.target.value)}>
          {window.AXIOM_DATA.ADVISORS.map((a) => <option key={a.id} value={a.email}>{a.first_name} {a.last_name}</option>)}
          <option value="client">Client (action sits with the household)</option>
        </select>
      </div>

      {/* Flags */}
      <div className="promote-flags">
        <label className="promote-flag">
          <input type="checkbox" checked={partnerReq} onChange={(e) => setPartnerReq(e.target.checked)} />
          <span>
            <strong>Partner required</strong>
            <span className="dim" style={{ fontSize: 11, display: "block", marginTop: 2 }}>
              Will surface on the partner-blocked filter and link to the partner record.
            </span>
          </span>
        </label>
        {partnerReq &&
        <div className="field" style={{ marginLeft: 24, marginTop: 8 }}>
            <label>Partner type</label>
            <select value={partnerType} onChange={(e) => setPartnerType(e.target.value)} style={{ maxWidth: 200 }}>
              <option value="CPA">CPA / Tax</option>
              <option value="ATTORNEY">Attorney</option>
              <option value="INSURANCE">Insurance broker</option>
              <option value="BANKER">Banker</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
        }
        <label className="promote-flag">
          <input type="checkbox" checked={longRunning} onChange={(e) => setLongRunning(e.target.checked)} />
          <span>
            <strong>Long-running</strong>
            <span className="dim" style={{ fontSize: 11, display: "block", marginTop: 2 }}>
              Spawns derivative weekly check-ins until completion (Phase 5d).
            </span>
          </span>
        </label>
      </div>

      <div className="placeholder-block" style={{ marginTop: 12, fontSize: 11 }}>
        POST /api/notes/{note?.id || "[id]"}/promote → 201 ai-XXX, sets note.promoted_to_action_item_id
      </div>
    </Modal>);

}

// ────────────────── Sign-in ──────────────────
//
// Six variants, switchable from the Tweaks panel:
//   split       — current navy split (kept for reference)
//   centered    — minimal: small wordmark + form, neutral ground
//   editorial   — full-bleed huge serif "Axiom" wordmark, form floats
//   letterhead  — printed-letter feel, rules + mono details
//   dark        — entire page near-black, restrained accent
//   ambient     — quiet status board behind the form
//
// All variants share the same form (SigninForm component), so the underlying
// auth flow is identical — RHF/zod conversion only needs to restyle the shell.

function useSigninState() {
  const [email, setEmail] = React.useState("hayden@psawealth.com");
  const [sent, setSent] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const valid = /@psawealth\.com$/.test(email);
  const submit = (e) => {
    e?.preventDefault?.();
    if (!valid) return;
    setSubmitting(true);
    setTimeout(() => {setSubmitting(false);setSent(true);}, 600);
  };
  return { email, setEmail, sent, setSent, submitting, valid, submit };
}

// Compact reusable form — used inside every variant
function SigninForm({ tone = "light", state, fullWidth }) {
  const { email, setEmail, sent, setSent, submitting, valid, submit } = state;
  const dark = tone === "dark";
  return !sent ?
  <form onSubmit={submit} className={`sf-form ${dark ? "sf-form--dark" : ""}`} style={{ width: fullWidth ? "100%" : undefined }}>
      <div className="field">
        <label>Email</label>
        <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@psawealth.com"
        autoFocus />
      
        {email && !valid &&
      <div className="sf-form__err">Must be a @psawealth.com address.</div>
      }
      </div>
      <button
      type="submit"
      className="btn btn--primary"
      style={{ width: "100%", justifyContent: "center", height: 36 }}
      disabled={!valid || submitting}
      data-api="POST /api/auth/magic-link">
      
        {submitting ? "Sending…" : "Request one-time code"}
      </button>
    </form> :

  <div className={`sf-sent ${dark ? "sf-sent--dark" : ""}`}>
      <div className="sf-sent__head">
        <div className="sf-sent__icon"><CheckIcon /></div>
        <div>
          <div className="sf-sent__title">Magic link sent</div>
          <div className="sf-sent__sub">to <span className="mono">{email}</span></div>
        </div>
      </div>
      <button
      className="btn"
      style={{ width: "100%", justifyContent: "center" }}
      onClick={() => setSent(false)}>
        Use a different email
      </button>
      <button
      className="btn btn--ghost"
      style={{ width: "100%", justifyContent: "center", marginTop: 6 }}
      onClick={() => navigate("/dashboard")}>
        Continue to demo dashboard →
      </button>
    </div>;

}

function SignIn({ variant = "split" }) {
  const state = useSigninState();
  return (
    <div className={`signin-stage signin-stage--${variant}`} data-screen-label="00 Sign in">
      {variant === "split" && <SigninSplit state={state} />}
      {variant === "modern-glass" && <SigninModernGlass state={state} />}
      {variant === "modern-glass-v2" && <SigninModernGlassV2 state={state} />}
      {variant === "modern-mesh" && <SigninModernMesh state={state} />}
      {variant === "modern-asym" && <SigninModernAsym state={state} />}
      {variant === "split-bold" && <SigninSplitBold state={state} />}
      {variant === "split-inverted" && <SigninSplitInverted state={state} />}
      {variant === "centered" && <SigninCentered state={state} />}
      {variant === "editorial" && <SigninEditorial state={state} />}
      {variant === "letterhead" && <SigninLetterhead state={state} />}
      {variant === "dark" && <SigninDark state={state} />}
      {variant === "ambient" && <SigninAmbient state={state} />}
    </div>);

}

// ── Split variant A: classic — PSA-dominant left, Axiom right ───────────
function SigninSplit({ state }) {
  return (
    <div className="signin-split sp-classic">
      <aside className="signin-brand sp-classic__brand">
        <div className="sp-classic__brand-stack">
          <img src="assets/psa-logo-full-white.png" alt="PSA Wealth" className="sp-classic__big-logo" />
        </div>
      </aside>
      <main className="signin-form sp-classic__main">
        <div className="sp-classic__axiom">Axiom</div>
        <div className="signin-form__inner">
          <div className="signin-form__head">
            <div className="signin-form__title">{state.sent ? "Check your inbox" : "Sign in"}</div>
          </div>
          <SigninForm state={state} fullWidth />
        </div>
        <footer className="signin-form__legal">
          <span className="dim" style={{ fontSize: 11 }}>© 2026 PSA Wealth</span>
        </footer>
      </main>
    </div>);

}

// ── Modern A v2: pushed further — floating labels, arrow CTA, layered glass
function SigninModernGlassV2({ state }) {
  const { email, setEmail, sent, setSent, submitting, valid, submit } = state;
  return (
    <div className="signin-split sp-mglass2">
      <aside className="sp-mglass2__panel" style={{ opacity: "2", backgroundColor: "rgb(20, 40, 68)" }}>
        <div className="sp-mglass2__mesh" />
        <div className="sp-mglass2__grid" />
        <div className="sp-mglass2__logo-wrap">
          <img src="assets/psa-logo-full-white.png" alt="PSA Wealth" className="sp-mglass2__logo" />
        </div>
        <div className="sp-mglass2__panel-foot mono">PSA · ADVISOR OS · 2026</div>
      </aside>
      <main className="sp-mglass2__main">
        <div className="sp-mglass2__top">
          <span className="sp-mglass2__axiom">Axiom</span>
        </div>
        <div className="sp-mglass2__card-wrap">
          <div className="sp-mglass2__card" style={{ fontFamily: "\"SF Mono\"" }}>
            <span className="sp-mglass2__chip mono"></span>
            <h1 className="sp-mglass2__title" style={{ color: "rgb(20, 40, 68)", fontFamily: "\"SF Mono\"" }}>
              {sent ? "Check your inbox." : "Welcome back."}
            </h1>
            {!sent ?
            <form onSubmit={submit} className="sp-mglass2__form">
                <div className={`sp-mglass2__field ${email ? "is-filled" : ""} ${email && !valid ? "is-err" : ""}`}>
                  <input
                  id="mg2-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder=" "
                  autoFocus />
                
                  <label htmlFor="mg2-email">Email</label>
                </div>
                {email && !valid &&
              <div className="sp-mglass2__err">Must be a @psawealth.com address.</div>
              }
                <button
                type="submit"
                className="sp-mglass2__cta"
                disabled={!valid || submitting}
                data-api="POST /api/auth/magic-link">
                
                  <span>{submitting ? "Sending…" : "Request one-time code"}</span>
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M3 9 H15 M10 4 L15 9 L10 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </form> :

            <div className="sp-mglass2__sent">
                <div className="sp-mglass2__sent-row">
                  <div className="sp-mglass2__sent-icon"><CheckIcon /></div>
                  <div>
                    <div className="sp-mglass2__sent-title">One-time code sent</div>
                    <div className="sp-mglass2__sent-sub">to <span className="mono">{email}</span></div>
                  </div>
                </div>
                <button className="sp-mglass2__ghost" onClick={() => setSent(false)}>Use a different email</button>
                <button className="sp-mglass2__cta" onClick={() => navigate("/dashboard")}>
                  <span>Continue to dashboard</span>
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M3 9 H15 M10 4 L15 9 L10 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            }
          </div>
          <div className="sp-mglass2__legal">© 2026 PSA Wealth</div>
        </div>
      </main>
    </div>);

}

// ── Modern A: glass card on subtle gradient navy ────────────────────────
function SigninModernGlass({ state }) {
  return (
    <div className="signin-split sp-mglass">
      <aside className="sp-mglass__panel">
        <div className="sp-mglass__mesh" />
        <div className="sp-mglass__logo-wrap">
          <img src="assets/psa-logo-full-white.png" alt="PSA Wealth" className="sp-mglass__logo" />
        </div>
      </aside>
      <main className="sp-mglass__main">
        <div className="sp-mglass__axiom">Axiom</div>
        <div className="sp-mglass__card">
          <div className="sp-mglass__head">
            <div className="sp-mglass__title">{state.sent ? "Check your inbox" : "Welcome back"}</div>
          </div>
          <SigninForm state={state} fullWidth />
        </div>
        <footer className="sp-mglass__legal">© 2026 PSA Wealth</footer>
      </main>
    </div>);

}

// ── Modern B: rich gradient mesh + rounded pill controls ────────────────
function SigninModernMesh({ state }) {
  return (
    <div className="signin-split sp-mmesh">
      <aside className="sp-mmesh__panel">
        <div className="sp-mmesh__blob sp-mmesh__blob--a" />
        <div className="sp-mmesh__blob sp-mmesh__blob--b" />
        <div className="sp-mmesh__blob sp-mmesh__blob--c" />
        <div className="sp-mmesh__grain" />
        <div className="sp-mmesh__logo-wrap">
          <img src="assets/psa-logo-full-white.png" alt="PSA Wealth" className="sp-mmesh__logo" />
        </div>
      </aside>
      <main className="sp-mmesh__main">
        <div className="sp-mmesh__axiom">Axiom</div>
        <div className="sp-mmesh__inner">
          <div className="sp-mmesh__head">
            <div className="sp-mmesh__title">{state.sent ? "Check your inbox" : "Welcome back"}</div>
          </div>
          <SigninForm state={state} fullWidth />
        </div>
        <footer className="sp-mmesh__legal">© 2026 PSA Wealth</footer>
      </main>
    </div>);

}

// ── Modern C: asymmetric curved navy panel ──────────────────────────────
function SigninModernAsym({ state }) {
  return (
    <div className="sp-masym">
      <div className="sp-masym__shape">
        <div className="sp-masym__shape-inner">
          <img src="assets/psa-logo-full-white.png" alt="PSA Wealth" className="sp-masym__logo" />
        </div>
      </div>
      <main className="sp-masym__main">
        <div className="sp-masym__top">
          <span className="sp-masym__axiom">Axiom</span>
          <span className="sp-masym__corner mono">© 2026 PSA WEALTH</span>
        </div>
        <div className="sp-masym__inner">
          <div className="sp-masym__eyebrow mono">SIGN&nbsp;IN</div>
          <h1 className="sp-masym__title">Welcome back.</h1>
          <SigninForm state={state} fullWidth />
        </div>
        <div />
      </main>
    </div>);

}

// ── Split variant B: bold — oversized wordmark, charcoal panel ─────────
function SigninSplitBold({ state }) {
  return (
    <div className="signin-split sp-bold">
      <aside className="sp-bold__panel">
        <div className="sp-bold__top">
          <img src="assets/psa-mark.webp" alt="PSA Wealth" className="sp-bold__mark" />
          <span className="sp-bold__co">PSA Wealth</span>
        </div>
        <div className="sp-bold__wordmark-wrap">
          <h1 className="sp-bold__wordmark">Axiom</h1>
        </div>
        <div className="sp-bold__foot">
          <span className="mono">v0.4 · phase 5</span>
          <span className="mono">© 2026</span>
        </div>
      </aside>
      <main className="sp-bold__main">
        <div className="sp-bold__form">
          <div className="sp-bold__title">{state.sent ? "Check your inbox" : "Sign in"}</div>
          <SigninForm state={state} fullWidth />
        </div>
      </main>
    </div>);

}

// ── Split variant C: inverted — narrow navy stripe on right ────────────
function SigninSplitInverted({ state }) {
  return (
    <div className="signin-split sp-inv">
      <main className="sp-inv__main">
        <div className="sp-inv__form">
          <div className="sp-inv__head">
            <span className="mono dim" style={{ fontSize: 10, letterSpacing: "0.14em" }}>SIGN&nbsp;IN</span>
          </div>
          <h2 className="sp-inv__title">Welcome back.</h2>
          <SigninForm state={state} fullWidth />
        </div>
      </main>
      <aside className="sp-inv__panel">
        <div className="sp-inv__panel-top">
          <img src="assets/psa-mark.webp" alt="PSA Wealth" className="sp-inv__mark" />
          <span className="sp-inv__co">PSA Wealth</span>
        </div>
        <div className="sp-inv__panel-mid">
          <div className="sp-inv__wordmark">Axiom</div>
          <div className="sp-inv__rule" />
          <div className="sp-inv__meta mono">
            <div><span>BUILD</span><span>v0.4</span></div>
            <div><span>PHASE</span><span>05</span></div>
            <div><span>ENV</span><span>internal</span></div>
          </div>
        </div>
        <div className="sp-inv__panel-foot mono">© 2026 PSA WEALTH</div>
      </aside>
    </div>);

}

// ── Variant: centered minimal ──────────────────────────────────────────
function SigninCentered({ state }) {
  return (
    <div className="sv-centered">
      <div className="sv-centered__inner">
        <div className="sv-centered__mark">
          <span className="sv-centered__wordmark">Axiom</span>
        </div>
        <div className="sv-centered__rule" />
        <SigninForm state={state} fullWidth />
        <div className="sv-centered__foot">
          <span className="mono" style={{ fontSize: 10, color: "var(--text-3)", letterSpacing: "0.06em" }}>PSA · v0.4 · phase 5</span>
        </div>
      </div>
    </div>);

}

// ── Variant: editorial wordmark ────────────────────────────────────────
function SigninEditorial({ state }) {
  return (
    <div className="sv-editorial">
      <div className="sv-editorial__bg">
        <span className="sv-editorial__wordmark">Axiom</span>
      </div>
      <div className="sv-editorial__top">
        <span className="mono" style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--text-3)" }}>PSA WEALTH MANAGEMENT</span>
        <span className="mono" style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--text-3)" }}>v0.4 · PHASE 5</span>
      </div>
      <div className="sv-editorial__panel">
        <div className="sv-editorial__title">{state.sent ? "Sent" : "Sign in"}</div>
        <SigninForm state={state} fullWidth />
      </div>
    </div>);

}

// ── Variant: document letterhead ───────────────────────────────────────
function SigninLetterhead({ state }) {
  return (
    <div className="sv-letterhead">
      <div className="sv-letterhead__sheet">
        <div className="sv-letterhead__head">
          <div className="sv-letterhead__head-l">
            <img src="assets/psa-mark.webp" alt="PSA Wealth" className="sv-letterhead__mark" />
            <div>
              <div className="sv-letterhead__co">PSA Wealth Management</div>
              <div className="mono dim" style={{ fontSize: 10, letterSpacing: "0.06em" }}>INTERNAL · ADVISOR OS</div>
            </div>
          </div>
          <div className="mono dim" style={{ fontSize: 10, letterSpacing: "0.08em", textAlign: "right" }}>
            v0.4<br />phase 5
          </div>
        </div>
        <div className="sv-letterhead__rule" />
        <div className="sv-letterhead__title">Axiom</div>
        <div className="sv-letterhead__rule sv-letterhead__rule--thick" />
        <div className="sv-letterhead__body">
          <div className="sv-letterhead__row">
            <span className="sv-letterhead__row-label">RE</span>
            <span className="sv-letterhead__row-val">{state.sent ? "Magic link dispatched" : "Authentication request"}</span>
          </div>
          <div className="sv-letterhead__row">
            <span className="sv-letterhead__row-label">DATE</span>
            <span className="sv-letterhead__row-val mono">2026-05-03</span>
          </div>
          <div className="sv-letterhead__row">
            <span className="sv-letterhead__row-label">METHOD</span>
            <span className="sv-letterhead__row-val">Magic link · 15 min expiry</span>
          </div>
          <div className="sv-letterhead__rule" style={{ margin: "20px 0" }} />
          <SigninForm state={state} fullWidth />
        </div>
        <div className="sv-letterhead__foot">
          <span className="mono dim" style={{ fontSize: 10, letterSpacing: "0.06em" }}>© 2026 PSA WEALTH MANAGEMENT · ADVISOR ACCESS ONLY</span>
        </div>
      </div>
    </div>);

}

// ── Variant: dark mode ─────────────────────────────────────────────────
function SigninDark({ state }) {
  return (
    <div className="sv-dark">
      <div className="sv-dark__corner sv-dark__corner--tl mono">PSA · AXIOM</div>
      <div className="sv-dark__corner sv-dark__corner--tr mono">v0.4 · PHASE 5</div>
      <div className="sv-dark__inner">
        <div className="sv-dark__mark">Axiom</div>
        <div className="sv-dark__rule" />
        <SigninForm state={state} tone="dark" fullWidth />
      </div>
      <div className="sv-dark__corner sv-dark__corner--bl mono">© 2026</div>
      <div className="sv-dark__corner sv-dark__corner--br mono">PSA WEALTH MANAGEMENT</div>
    </div>);

}

// ── Variant: ambient status board ──────────────────────────────────────
function SigninAmbient({ state }) {
  // Use real mock data — but quiet, redacted, ambient
  const D = window.AXIOM_DATA;
  const ticks = [
  { id: "ai-001", label: "ACTION", status: "open" },
  { id: "ai-002", label: "ACTION", status: "open" },
  { id: "pl-Q2", label: "PLAN  ", status: "review" },
  { id: "ai-008", label: "ACTION", status: "complete" },
  { id: "no-013", label: "NOTE  ", status: "promoted" },
  { id: "ai-014", label: "ACTION", status: "open" },
  { id: "ln-r02", label: "LENS  ", status: "draft" },
  { id: "ai-022", label: "ACTION", status: "open" },
  { id: "ai-026", label: "ACTION", status: "complete" },
  { id: "no-024", label: "NOTE  ", status: "open" },
  { id: "pl-Q1", label: "PLAN  ", status: "approved" },
  { id: "ai-031", label: "ACTION", status: "pending" }];

  return (
    <div className="sv-ambient">
      <div className="sv-ambient__bg">
        {ticks.map((t, i) =>
        <div key={i} className="sv-ambient__tick" style={{ animationDelay: `${i * 0.4}s` }}>
            <span className="mono" style={{ color: "rgba(15,15,15,0.18)" }}>{t.label}</span>
            <span className="mono" style={{ color: "rgba(15,15,15,0.28)" }}>{t.id}</span>
            <span className={`sv-ambient__dot sv-ambient__dot--${t.status}`} />
            <span className="mono" style={{ color: "rgba(15,15,15,0.18)", textTransform: "uppercase" }}>{t.status}</span>
          </div>
        )}
      </div>
      <div className="sv-ambient__card">
        <div className="sv-ambient__top">
          <span className="sv-ambient__mark">Axiom</span>
          <span className="mono dim" style={{ fontSize: 10, letterSpacing: "0.08em" }}>v0.4 · phase 5</span>
        </div>
        <div className="sv-ambient__rule" />
        <SigninForm state={state} fullWidth />
      </div>
    </div>);

}

// Local icon
function SearchIcon({ size = 14 }) {
  return <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
    <circle cx="6" cy="6" r="4" /><path d="M9 9l3 3" strokeLinecap="round" />
  </svg>;
}

Object.assign(window, { NotesHub, SignIn });