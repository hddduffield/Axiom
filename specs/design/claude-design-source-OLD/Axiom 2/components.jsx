// Shared primitives — Topbar, Badge, Tabs, etc.
// Exposed on window so other Babel scripts can reach them.

const { useState, useEffect, useMemo, useRef, useCallback } = React;

// ────────────────────── Hash router ──────────────────────
function useRoute() {
  const [hash, setHash] = useState(() => window.location.hash || "#/dashboard");
  useEffect(() => {
    const onHash = () => setHash(window.location.hash || "#/dashboard");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const path = hash.replace(/^#/, "");
  const parts = path.split("/").filter(Boolean);
  return { path, parts, hash };
}
function navigate(path) {window.location.hash = path;}

// ────────────────────── Status helpers ──────────────────────
const STATUS_META = {
  not_started: { label: "Not started", cls: "badge--slate" },
  in_progress: { label: "In progress", cls: "badge--blue" },
  pending_decision: { label: "Pending decision", cls: "badge--amber" },
  complete: { label: "Complete", cls: "badge--green" }
};
const TIMING_META = {
  overdue: { label: "Overdue", cls: "badge--red" },
  this_week: { label: "This week", cls: "badge--amber" },
  next_30_days: { label: "Next 30 days", cls: "badge--ghost" },
  next_90_days: { label: "Next 90 days", cls: "badge--ghost" }
};

function StatusBadge({ status, onClick }) {
  const m = STATUS_META[status] || STATUS_META.not_started;
  return (
    <span className={`badge ${m.cls}`} onClick={onClick} style={onClick ? { cursor: "pointer" } : {}}>
      <span className="dot"></span>{m.label}
    </span>);

}
function TimingBadge({ bucket }) {
  const m = TIMING_META[bucket] || { label: bucket, cls: "badge--ghost" };
  return <span className={`badge ${m.cls}`}>{m.label}</span>;
}

// ────────────────────── Topbar ──────────────────────
function Topbar({ route }) {
  const me = window.AXIOM_DATA.ME;
  const items = [
  { path: "/dashboard", label: "Dashboard" },
  { path: "/clients", label: "Clients" },
  { path: "/action-items", label: "Action items" },
  { path: "/notes", label: "Notes" }];

  const isActive = (p) => route.path === p || route.path.startsWith(p + "/") ||
  p === "/clients" && route.path.startsWith("/clients") ||
  p === "/action-items" && route.path.startsWith("/action-items");
  return (
    <header className="topbar">
      <div className="topbar__brand" onClick={() => navigate("/dashboard")}>
        <img src="assets/psa-mark.webp" alt="" />
        <span> <span style={{ color: "rgb(255, 255, 255)", fontWeight: 400, fontSize: 15, marginLeft: 2 }}>PSA Wealth</span></span>
      </div>
      <nav className="topbar__nav">
        {items.map((i) =>
        <a key={i.path} className={isActive(i.path) ? "is-active" : ""} onClick={() => navigate(i.path)} style={{ fontSize: "20px" }}>{i.label}</a>
        )}
      </nav>
      <div className="spacer"></div>
      <div className="topbar__right">
        <div className="topbar__search">
          <SearchIcon /> <span>Search clients, items…</span> <kbd>⌘K</kbd>
        </div>
        <button className="btn btn--sm" title="New note / item">+ New</button>
        <div className="topbar__avatar" title={`${me.first_name} ${me.last_name}`}>
          {me.first_name[0]}{me.last_name[0]}
        </div>
      </div>
    </header>);

}

// ────────────────────── Tabs ──────────────────────
function TabBar({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) =>
      <div
        key={t.id}
        className={`tab ${value === t.id ? "is-active" : ""}`}
        onClick={() => onChange(t.id)}>
        
          {t.label}
          {typeof t.count === "number" && <span className="count">{t.count}</span>}
        </div>
      )}
    </div>);

}

// ────────────────────── Drawer ──────────────────────
function Drawer({ open, onClose, title, children, footer }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {if (e.key === "Escape") onClose();};
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <>
      <div className={`scrim ${open ? "is-open" : ""}`} onClick={onClose}></div>
      <aside className={`drawer ${open ? "is-open" : ""}`} role="dialog" aria-hidden={!open}>
        <div className="drawer__head">
          <span className="drawer__title">{title}</span>
          <button className="iconbtn" onClick={onClose} aria-label="Close"><CloseIcon /></button>
        </div>
        <div className="drawer__body">{children}</div>
        {footer && <div className="drawer__foot">{footer}</div>}
      </aside>
    </>);

}

// ────────────────────── Modal ──────────────────────
function Modal({ open, onClose, title, subtitle, children, footer }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {if (e.key === "Escape") onClose();};
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <>
      <div className={`scrim ${open ? "is-open" : ""}`} onClick={onClose}></div>
      <div className={`modal ${open ? "is-open" : ""}`}>
        <div className="modal__head">
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__foot">{footer}</div>}
      </div>
    </>);

}

// ────────────────────── Date helpers ──────────────────────
function fmtRelative(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date("2026-05-03T12:00:00Z");
  const diff = Math.round((d - now) / 86400000);
  if (diff < -1) return `${Math.abs(diff)}d ago`;
  if (diff === -1) return "yesterday";
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff < 7) return `in ${diff}d`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
function fmtMoney(n) {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1000)}K`;
  return `$${n.toLocaleString()}`;
}

// ────────────────────── Icons (inline SVG, no emoji) ──────────────────────
function I({ children, size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor"
    strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>);

}
const SearchIcon = (p) => <I {...p}><circle cx="7" cy="7" r="4.5" /><path d="M11 11l3 3" /></I>;
const CloseIcon = (p) => <I {...p}><path d="M3 3l10 10M13 3L3 13" /></I>;
const PlusIcon = (p) => <I {...p}><path d="M8 3v10M3 8h10" /></I>;
const CheckIcon = (p) => <I {...p}><path d="M3 8.5l3.5 3.5L13 5" /></I>;
const ChevronIcon = (p) => <I {...p}><path d="M6 4l4 4-4 4" /></I>;
const ArrowDown = (p) => <I {...p}><path d="M8 3v10M4 9l4 4 4-4" /></I>;
const FilterIcon = (p) => <I {...p}><path d="M2 4h12M4 8h8M6 12h4" /></I>;
const DotsIcon = (p) => <I {...p}><circle cx="3" cy="8" r="0.8" /><circle cx="8" cy="8" r="0.8" /><circle cx="13" cy="8" r="0.8" /></I>;
const FlagIcon = (p) => <I {...p}><path d="M3 13V3l5 1.5L13 3v6l-5 1.5L3 9" /></I>;
const ClockIcon = (p) => <I {...p}><circle cx="8" cy="8" r="6" /><path d="M8 4.5V8l2.5 1.5" /></I>;
const UserIcon = (p) => <I {...p}><circle cx="8" cy="6" r="2.5" /><path d="M3 13c0-2.5 2.2-4 5-4s5 1.5 5 4" /></I>;
const FileIcon = (p) => <I {...p}><path d="M4 2h5l3 3v9H4z" /><path d="M9 2v3h3" /></I>;
const LinkIcon = (p) => <I {...p}><path d="M7 9a2.5 2.5 0 003.5 0L13 6.5A2.5 2.5 0 109.5 3L8 4.5" /><path d="M9 7a2.5 2.5 0 00-3.5 0L3 9.5A2.5 2.5 0 106.5 13L8 11.5" /></I>;
const RefreshIcon = (p) => <I {...p}><path d="M3 8a5 5 0 018.5-3.5L13 6" /><path d="M13 3v3h-3" /><path d="M13 8a5 5 0 01-8.5 3.5L3 10" /><path d="M3 13v-3h3" /></I>;
const DownloadIcon = (p) => <I {...p}><path d="M8 3v8M4.5 7.5L8 11l3.5-3.5" /><path d="M3 13h10" /></I>;
const AlertIcon = (p) => <I {...p}><path d="M8 2l6 11H2z" /><path d="M8 6v3" /><circle cx="8" cy="11" r="0.6" /></I>;

// ────────────────────── Filter chip ──────────────────────
function Chip({ active, onClick, children, count }) {
  return (
    <button className={`chip ${active ? "is-active" : ""}`} onClick={onClick}>
      {children}
      {typeof count === "number" && <span className="chip__count">{count}</span>}
    </button>);

}

// ────────────────────── Page header ──────────────────────
function PageHead({ title, subtitle, crumbs, actions }) {
  return (
    <div>
      {crumbs &&
      <div className="crumbs">
          {crumbs.map((c, i) =>
        <React.Fragment key={i}>
              {i > 0 && <span className="sep">/</span>}
              {c.to ? <a onClick={() => navigate(c.to)}>{c.label}</a> : <span>{c.label}</span>}
            </React.Fragment>
        )}
        </div>
      }
      <div className="page-head">
        <div>
          <h1 style={{ fontWeight: "900", fontSize: "40px" }}>{title}</h1>
          {subtitle && <div className="subtitle" style={{ fontSize: "15px" }}>{subtitle}</div>}
        </div>
        {actions && <div className="page-head__actions">{actions}</div>}
      </div>
    </div>);

}

// ────────────────────── Lookups ──────────────────────
function getClient(id) {return window.AXIOM_DATA.CLIENTS.find((c) => c.id === id);}
function getAdvisor(id) {return window.AXIOM_DATA.ADVISORS.find((a) => a.id === id);}
function getAdvisorByEmail(email) {return window.AXIOM_DATA.ADVISORS.find((a) => a.email === email);}
function ownerLabel(owner) {
  if (owner === "client") return "Client";
  const a = getAdvisorByEmail(owner);
  return a ? `${a.first_name} ${a.last_name[0]}.` : owner;
}

// ────────────────────── Avatar ──────────────────────
// Deterministic monogram chip. `tone` defaults to navy; pass "gold" or "ivory"
// for variants. `size` in px (default 24).
function initialsOf(name) {
  if (!name) return "??";
  const cleaned = String(name).replace(/\s+Family\s*$/i, "").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function Avatar({ name, size = 24, tone = "navy", title }) {
  const tones = {
    navy: { bg: "var(--accent)", color: "#fff" },
    deep: { bg: "var(--accent-deep)", color: "#fff" },
    gold: { bg: "var(--gold)", color: "var(--accent-deep)" },
    ivory: { bg: "var(--surface-2)", color: "var(--accent)" }
  };
  const t = tones[tone] || tones.navy;
  return (
    <span
      className="avatar"
      title={title || name}
      style={{
        width: size, height: size,
        fontSize: Math.max(9, Math.round(size * 0.42)),
        background: t.bg, color: t.color
      }}>
      
      {initialsOf(name)}
    </span>);

}

// Export
Object.assign(window, {
  useRoute, navigate,
  STATUS_META, TIMING_META,
  StatusBadge, TimingBadge,
  Topbar, TabBar, Drawer, Modal, Chip, PageHead,
  fmtRelative, fmtDate, fmtMoney,
  SearchIcon, CloseIcon, PlusIcon, CheckIcon, ChevronIcon, ArrowDown,
  FilterIcon, DotsIcon, FlagIcon, ClockIcon, UserIcon, FileIcon, LinkIcon,
  RefreshIcon, DownloadIcon, AlertIcon,
  getClient, getAdvisor, getAdvisorByEmail, ownerLabel,
  Avatar, initialsOf
});