"use client";

// Action items global view — converts Claude Design's
// view-action-items.jsx `ActionItems` over the existing api.actionItems.*
// + ActionItemDrawer wiring (preserved from Phase 5d/5e).
//
// Architecture shift: the previous version round-tripped to the API on
// every filter change. Claude Design's saved-views + counts pattern
// requires the full universe at once, so this version loads ALL items
// once on mount and runs the filter / sort / group pipeline in memory.
// At v1 scale (3 advisors × ~30 clients × low-tens of items) the entire
// list comfortably fits in a single fetch (~150 KB worst case).
//
// Preserved API contract:
//   - GET  /api/action-items                 (single load)
//   - PATCH /api/action-items/[id]           (status toggle + bulk
//     "Mark complete" loop; lifecycle hooks in api response surface as
//     toasts)
//   - GET /api/clients/[id]/notes            (origin-note lookup for
//     drawer)
//
// Bulk actions in v1: only "Mark complete" and "Clear" are wired (they
// reuse api.actionItems.update). Reassign / Move-to-next-week / Archive
// are surfaced in the bar but disabled with a v1.5 hint — the bulk
// endpoint is unbuilt and doing them one-by-one risks partial failures
// without a clear UX (this is on the v1.5 backlog).

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronUp,
  Download,
  Link as LinkIcon,
  Plus,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ActionItemDrawer } from "@/components/axiom/ActionItemDrawer";
import { api, isApiError } from "@/lib/api/client";
import type {
  ActionItem,
  ActionItemStatus,
  Advisor,
  Client,
  Note,
} from "@/lib/api/types";

// ─────────── Saved views ───────────

type Me = { email: string };
type SavedViewId =
  | "my-open"
  | "my-overdue"
  | "pending"
  | "partner"
  | "long-running"
  | "all";

const SAVED_VIEWS: Array<{
  id: SavedViewId;
  label: string;
  fn: (a: ActionItem, me: Me | null) => boolean;
}> = [
  {
    id: "my-open",
    label: "My open",
    fn: (a, me) => !!me && a.owner === me.email && a.status !== "complete",
  },
  {
    id: "my-overdue",
    label: "My overdue",
    fn: (a, me) =>
      !!me &&
      a.owner === me.email &&
      a.timing_bucket === "overdue" &&
      a.status !== "complete",
  },
  {
    id: "pending",
    label: "Pending decision",
    fn: (a) => a.status === "pending_decision",
  },
  {
    id: "partner",
    label: "Partner-blocked",
    fn: (a) => !!a.partner_required && a.status !== "complete",
  },
  {
    id: "long-running",
    label: "Long-running",
    fn: (a) => a.duration_class === "long_running" && a.status !== "complete",
  },
  { id: "all", label: "All items", fn: () => true },
];

// ─────────── Types + helpers ───────────

type OwnerFilter = "me" | "team" | "client" | "all";
type StatusFilter =
  | "open"
  | "not_started"
  | "in_progress"
  | "pending_decision"
  | "complete"
  | "all";
type BucketFilter = "all" | "overdue" | "this_week" | "next_30_days" | "next_90_days";
type GroupKey = "none" | "bucket" | "client";
type SortKey = "desc" | "client" | "owner" | "bucket" | "status";
type SortDir = "asc" | "desc";

const BUCKET_ORDER: Record<string, number> = {
  overdue: 0,
  this_week: 1,
  next_30_days: 2,
  next_60_days: 3,
  next_90_days: 4,
  this_year: 5,
  ongoing: 6,
};
const BUCKET_LABEL: Record<string, string> = {
  overdue: "Overdue",
  this_week: "This week",
  next_30_days: "Next 30 days",
  next_60_days: "Next 60 days",
  next_90_days: "Next 90 days",
  this_year: "This year",
  ongoing: "Ongoing",
};

function ownerLabel(o: string | null): string {
  if (!o) return "—";
  if (o === "client") return "Client";
  return o.includes("@") ? o.split("@")[0] : o;
}

interface Props {
  advisors: Pick<Advisor, "id" | "email" | "first_name" | "last_name">[];
  clients: Pick<Client, "id" | "household_name">[];
  meEmail: string | null;
}

export function ActionItemsView({ advisors, clients, meEmail }: Props) {
  const me = meEmail ? { email: meEmail } : null;

  const [items, setItems] = useState<ActionItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters / view state
  const [savedView, setSavedView] = useState<SavedViewId>(
    me ? "my-open" : "all",
  );
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>(me ? "me" : "all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [bucketFilter, setBucketFilter] = useState<BucketFilter>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [partnerOnly, setPartnerOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState<GroupKey>("none");
  const [sortKey, setSortKey] = useState<SortKey>("bucket");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Drawer + linked-note lookup
  const [detail, setDetail] = useState<ActionItem | null>(null);
  const [linkedNote, setLinkedNote] = useState<Note | null>(null);

  // ─────────── Initial load ───────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.actionItems
      .list({})
      .then((res) => {
        if (!cancelled) setItems(res.items);
      })
      .catch((e) => {
        if (cancelled) return;
        toast.error(isApiError(e) ? e.message : "Could not load items");
        setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ─────────── Origin-note lookup on drawer open ───────────
  useEffect(() => {
    if (!detail) {
      setLinkedNote(null);
      return;
    }
    let cancelled = false;
    api.notes
      .listByClient(detail.client_id)
      .then(({ items }) => {
        if (cancelled) return;
        setLinkedNote(
          items.find((n) => n.promoted_to_action_item_id === detail.id) ?? null,
        );
      })
      .catch(() => {
        if (!cancelled) setLinkedNote(null);
      });
    return () => {
      cancelled = true;
    };
  }, [detail]);

  // ─────────── Lookups ───────────
  const clientById = useMemo(
    () => new Map(clients.map((c) => [c.id, c])),
    [clients],
  );
  const advisorByEmail = useMemo(
    () => new Map(advisors.map((a) => [a.email, a])),
    [advisors],
  );

  // ─────────── Filter pipeline ───────────
  const filtered = useMemo(() => {
    if (!items) return [];
    const base = SAVED_VIEWS.find((v) => v.id === savedView)!;
    return items.filter((a) => {
      if (!base.fn(a, me)) return false;
      if (ownerFilter === "me" && (!me || a.owner !== me.email)) return false;
      if (ownerFilter === "client" && a.owner !== "client") return false;
      if (ownerFilter === "team" && a.owner === "client") return false;
      if (statusFilter === "open" && a.status === "complete") return false;
      if (
        statusFilter !== "open" &&
        statusFilter !== "all" &&
        a.status !== statusFilter
      )
        return false;
      if (bucketFilter !== "all" && a.timing_bucket !== bucketFilter) return false;
      if (clientFilter !== "all" && a.client_id !== clientFilter) return false;
      if (partnerOnly && !a.partner_required) return false;
      if (search) {
        const s = search.toLowerCase();
        const c = clientById.get(a.client_id);
        if (
          !a.description.toLowerCase().includes(s) &&
          !a.id.toLowerCase().includes(s) &&
          !(c?.household_name.toLowerCase().includes(s) ?? false)
        )
          return false;
      }
      return true;
    });
  }, [
    items,
    savedView,
    me,
    ownerFilter,
    statusFilter,
    bucketFilter,
    clientFilter,
    partnerOnly,
    search,
    clientById,
  ]);

  // ─────────── Sort ───────────
  const sorted = useMemo(() => {
    const cmp = (a: ActionItem, b: ActionItem): number => {
      let av: string | number;
      let bv: string | number;
      switch (sortKey) {
        case "client":
          av = clientById.get(a.client_id)?.household_name ?? "";
          bv = clientById.get(b.client_id)?.household_name ?? "";
          break;
        case "owner":
          av = a.owner ?? "";
          bv = b.owner ?? "";
          break;
        case "bucket":
          av = BUCKET_ORDER[a.timing_bucket ?? ""] ?? 99;
          bv = BUCKET_ORDER[b.timing_bucket ?? ""] ?? 99;
          break;
        case "status":
          av = a.status;
          bv = b.status;
          break;
        default:
          av = a.description.toLowerCase();
          bv = b.description.toLowerCase();
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    };
    return [...filtered].sort(cmp);
  }, [filtered, sortKey, sortDir, clientById]);

  // ─────────── Group ───────────
  const groups = useMemo(() => {
    if (groupBy === "none") return [{ key: "all", label: null, items: sorted }];
    if (groupBy === "bucket") {
      const order = ["overdue", "this_week", "next_30_days", "next_90_days"];
      return order
        .map((k) => ({
          key: k,
          label: BUCKET_LABEL[k] ?? k,
          items: sorted.filter((a) => a.timing_bucket === k),
        }))
        .filter((g) => g.items.length > 0);
    }
    // by client
    const byClient: Record<string, ActionItem[]> = {};
    for (const a of sorted) {
      (byClient[a.client_id] = byClient[a.client_id] || []).push(a);
    }
    return Object.entries(byClient)
      .map(([cid, list]) => ({
        key: cid,
        label: clientById.get(cid)?.household_name ?? cid,
        items: list,
      }))
      .sort((x, y) => x.label.localeCompare(y.label));
  }, [sorted, groupBy, clientById]);

  // ─────────── Selection ───────────
  const flatVisible = sorted.map((a) => a.id);
  const allSelected =
    flatVisible.length > 0 && flatVisible.every((id) => selected.has(id));
  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(flatVisible));
  }
  function toggleOne(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function clearSelection() {
    setSelected(new Set());
  }

  // ─────────── Mutations ───────────
  function handleChanged(updated: ActionItem) {
    setItems((cur) => (cur ?? []).map((i) => (i.id === updated.id ? updated : i)));
    if (detail?.id === updated.id) setDetail(updated);
  }

  async function bulkMarkComplete() {
    if (selected.size === 0) return;
    const ids = [...selected];
    const results = await Promise.allSettled(
      ids.map((id) =>
        api.actionItems.update(id, { status: "complete" as ActionItemStatus }),
      ),
    );
    const ok: ActionItem[] = [];
    let fail = 0;
    for (const r of results) {
      if (r.status === "fulfilled") ok.push(r.value.item);
      else fail++;
    }
    if (ok.length > 0) {
      setItems((cur) =>
        (cur ?? []).map((i) => ok.find((u) => u.id === i.id) ?? i),
      );
      toast.success(`${ok.length} item${ok.length === 1 ? "" : "s"} completed`);
    }
    if (fail > 0) toast.error(`${fail} update${fail === 1 ? "" : "s"} failed`);
    clearSelection();
  }

  // ─────────── Saved-view application ───────────
  function applySavedView(id: SavedViewId) {
    setSavedView(id);
    clearSelection();
    if (id === "my-open") {
      setOwnerFilter("me");
      setStatusFilter("open");
      setBucketFilter("all");
      setPartnerOnly(false);
    } else if (id === "my-overdue") {
      setOwnerFilter("me");
      setStatusFilter("open");
      setBucketFilter("overdue");
      setPartnerOnly(false);
    } else if (id === "pending") {
      setOwnerFilter("all");
      setStatusFilter("pending_decision");
      setBucketFilter("all");
      setPartnerOnly(false);
    } else if (id === "partner") {
      setOwnerFilter("all");
      setStatusFilter("open");
      setBucketFilter("all");
      setPartnerOnly(true);
    } else if (id === "long-running") {
      setOwnerFilter("all");
      setStatusFilter("open");
      setBucketFilter("all");
      setPartnerOnly(false);
    } else {
      setOwnerFilter("all");
      setStatusFilter("all");
      setBucketFilter("all");
      setPartnerOnly(false);
    }
  }

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(k);
      setSortDir("asc");
    }
  }

  // ─────────── Header counts ───────────
  const all = items ?? [];
  const myOpenCount = me
    ? all.filter((a) => a.owner === me.email && a.status !== "complete").length
    : 0;
  // "Completed this week" = completed_at within last 7d
  const startWeek = Date.now() - 7 * 86_400_000;
  const completedThisWeek = all.filter(
    (a) =>
      a.status === "complete" &&
      a.completed_at &&
      new Date(a.completed_at).getTime() >= startWeek,
  ).length;

  // ─────────── Render ───────────
  return (
    <div className="flex flex-col gap-5">
      {/* PageHead */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1
            className="text-3xl font-medium"
            style={{
              fontFamily: "var(--font-display)",
              letterSpacing: "-0.01em",
              color: "var(--text)",
            }}
          >
            Action items
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-2)" }}>
            <span style={{ fontFamily: "var(--font-mono)" }}>{myOpenCount}</span>{" "}
            open ·{" "}
            <span style={{ fontFamily: "var(--font-mono)" }}>
              {completedThisWeek}
            </span>{" "}
            completed this week
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export
          </Button>
          <Button size="sm" disabled>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New item
          </Button>
        </div>
      </div>

      {/* Saved views */}
      <div className="flex items-center gap-2 text-xs">
        <span
          className="text-[11px] uppercase"
          style={{ color: "var(--text-3)", letterSpacing: "0.04em" }}
        >
          View
        </span>
        <div className="flex flex-wrap gap-1.5">
          {SAVED_VIEWS.filter((v) => me || (v.id !== "my-open" && v.id !== "my-overdue")).map(
            (v) => (
              <Chip
                key={v.id}
                active={savedView === v.id}
                onClick={() => applySavedView(v.id)}
              >
                {v.label} <Count n={all.filter((a) => v.fn(a, me)).length} />
              </Chip>
            ),
          )}
        </div>
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
        <FilterGroup label="Owner">
          {(["me", "team", "client", "all"] as OwnerFilter[]).map((k) =>
            !me && k === "me" ? null : (
              <Chip
                key={k}
                active={ownerFilter === k}
                onClick={() => setOwnerFilter(k)}
              >
                {k === "me" ? "Me" : k === "team" ? "Team" : k === "client" ? "Client" : "All"}
              </Chip>
            ),
          )}
        </FilterGroup>
        <FilterSep />
        <FilterGroup label="Status">
          {(
            [
              ["open", "Open"],
              ["not_started", "Not started"],
              ["in_progress", "In progress"],
              ["pending_decision", "Pending"],
              ["complete", "Complete"],
              ["all", "All"],
            ] as Array<[StatusFilter, string]>
          ).map(([k, label]) => (
            <Chip
              key={k}
              active={statusFilter === k}
              onClick={() => setStatusFilter(k)}
            >
              {label}
            </Chip>
          ))}
        </FilterGroup>
        <FilterSep />
        <FilterGroup label="When">
          {(
            [
              ["all", "All"],
              ["overdue", "Overdue"],
              ["this_week", "This week"],
              ["next_30_days", "30 days"],
              ["next_90_days", "90 days"],
            ] as Array<[BucketFilter, string]>
          ).map(([k, label]) => (
            <Chip
              key={k}
              active={bucketFilter === k}
              onClick={() => setBucketFilter(k)}
            >
              {label}
            </Chip>
          ))}
        </FilterGroup>
        <FilterSep />
        <Chip active={partnerOnly} onClick={() => setPartnerOnly((v) => !v)}>
          <LinkIcon className="h-3 w-3" /> Partner-blocked
        </Chip>
        <div className="ml-auto">
          <Select
            value={clientFilter}
            onValueChange={(v) => setClientFilter(v ?? "all")}
          >
            <SelectTrigger className="h-7 w-44 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clients</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.household_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Toolbar: search + group + count */}
      <div className="flex items-center gap-3">
        <div
          className="flex h-8 max-w-sm flex-1 items-center gap-1.5 rounded-md border px-2.5"
          style={{
            borderColor: "var(--border)",
            background: "var(--surface)",
          }}
        >
          <Search className="h-3.5 w-3.5" style={{ color: "var(--text-3)" }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search description, client, or id…"
            className="flex-1 bg-transparent text-xs outline-none"
            style={{ color: "var(--text)" }}
          />
          {search ? (
            <button
              type="button"
              className="text-xs"
              style={{ color: "var(--text-3)" }}
              onClick={() => setSearch("")}
            >
              ×
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span
            className="text-[11px] uppercase"
            style={{ color: "var(--text-3)", letterSpacing: "0.04em" }}
          >
            Group
          </span>
          <Chip active={groupBy === "none"} onClick={() => setGroupBy("none")}>
            None
          </Chip>
          <Chip
            active={groupBy === "bucket"}
            onClick={() => setGroupBy("bucket")}
          >
            By due
          </Chip>
          <Chip
            active={groupBy === "client"}
            onClick={() => setGroupBy("client")}
          >
            By client
          </Chip>
        </div>
        <span
          className="ml-auto text-[11px]"
          style={{ fontFamily: "var(--font-mono)", color: "var(--text-3)" }}
        >
          {sorted.length} of {all.length}
        </span>
      </div>

      {/* Bulk-bar */}
      {selected.size > 0 ? (
        <div
          className="sticky top-2 z-10 flex items-center gap-3 rounded-md border px-3 py-2 shadow-sm"
          style={{
            background: "var(--psa-navy)",
            borderColor: "var(--psa-navy-deep)",
            color: "#ffffff",
          }}
          data-api="POST /api/action-items/bulk"
        >
          <span className="text-[13px]">
            <strong>{selected.size}</strong> selected
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={bulkMarkComplete}
              className="rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium hover:bg-white/20"
            >
              Mark complete
            </button>
            <button
              type="button"
              disabled
              title="Bulk reassign coming in v1.5"
              className="cursor-not-allowed rounded-md bg-white/5 px-2.5 py-1 text-xs font-medium opacity-50"
            >
              Reassign…
            </button>
            <button
              type="button"
              disabled
              title="Bulk archive coming in v1.5"
              className="cursor-not-allowed rounded-md bg-white/5 px-2.5 py-1 text-xs font-medium opacity-50"
            >
              Archive
            </button>
          </div>
          <button
            type="button"
            onClick={clearSelection}
            className="ml-auto text-xs underline-offset-2 hover:underline"
          >
            Clear
          </button>
        </div>
      ) : null}

      {/* Table */}
      <div
        className="overflow-hidden rounded-md border"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        {loading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : sorted.length === 0 ? (
          <div
            className="p-8 text-center"
            style={{ color: "var(--text-2)" }}
          >
            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
              No items match these filters.
            </p>
            <p className="mt-1 text-xs">
              Try widening the saved view, clearing search, or removing chips.
            </p>
            <div className="mt-3 flex justify-center gap-2">
              {me ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => applySavedView("my-open")}
                >
                  Reset to My open
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                onClick={() => applySavedView("all")}
              >
                Show all
              </Button>
            </div>
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead
              className="border-b"
              style={{
                borderColor: "var(--border)",
                color: "var(--text-3)",
              }}
            >
              <tr>
                <th className="w-10 px-3 py-2 text-left">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Select all"
                  />
                </th>
                <SortHead
                  active={sortKey === "desc"}
                  dir={sortDir}
                  onClick={() => toggleSort("desc")}
                >
                  Description
                </SortHead>
                <SortHead
                  width={140}
                  active={sortKey === "client"}
                  dir={sortDir}
                  onClick={() => toggleSort("client")}
                >
                  Client
                </SortHead>
                <SortHead
                  width={110}
                  active={sortKey === "owner"}
                  dir={sortDir}
                  onClick={() => toggleSort("owner")}
                >
                  Owner
                </SortHead>
                <SortHead
                  width={130}
                  active={sortKey === "bucket"}
                  dir={sortDir}
                  onClick={() => toggleSort("bucket")}
                >
                  Due
                </SortHead>
                <SortHead
                  width={150}
                  active={sortKey === "status"}
                  dir={sortDir}
                  onClick={() => toggleSort("status")}
                >
                  Status
                </SortHead>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <GroupBlock
                  key={g.key}
                  label={g.label}
                  items={g.items}
                  selected={selected}
                  onToggleOne={toggleOne}
                  onOpen={(a) => setDetail(a)}
                  clientById={clientById}
                  advisorByEmail={advisorByEmail}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ActionItemDrawer
        item={detail}
        linkedNote={linkedNote}
        clientHouseholdName={
          detail ? clientById.get(detail.client_id)?.household_name ?? null : null
        }
        onClose={() => setDetail(null)}
        onChanged={handleChanged}
      />
    </div>
  );
}

// ─────────── Subcomponents ───────────

function GroupBlock({
  label,
  items,
  selected,
  onToggleOne,
  onOpen,
  clientById,
  advisorByEmail,
}: {
  label: string | null;
  items: ActionItem[];
  selected: Set<string>;
  onToggleOne: (id: string) => void;
  onOpen: (a: ActionItem) => void;
  clientById: Map<string, Pick<Client, "id" | "household_name">>;
  advisorByEmail: Map<
    string,
    Pick<Advisor, "id" | "email" | "first_name" | "last_name">
  >;
}) {
  return (
    <>
      {label ? (
        <tr>
          <td
            colSpan={6}
            className="border-b px-3 py-1.5"
            style={{
              borderColor: "var(--border)",
              background: "var(--surface-2)",
            }}
          >
            <span
              className="text-[11px] uppercase"
              style={{ color: "var(--text-3)", letterSpacing: "0.04em" }}
            >
              {label}
            </span>
            <span
              className="ml-2 text-[11px]"
              style={{ fontFamily: "var(--font-mono)", color: "var(--text-3)" }}
            >
              {items.length}
            </span>
          </td>
        </tr>
      ) : null}
      {items.map((a) => {
        const completed = a.status === "complete";
        const isSelected = selected.has(a.id);
        const c = clientById.get(a.client_id);
        const owner = a.owner
          ? a.owner === "client"
            ? "Client"
            : (advisorByEmail.get(a.owner)?.first_name ?? ownerLabel(a.owner))
          : "—";
        return (
          <tr
            key={a.id}
            onClick={() => onOpen(a)}
            className="cursor-pointer border-b transition-colors hover:bg-[var(--surface-2)]"
            style={{
              borderColor: "var(--border)",
              background: isSelected ? "var(--psa-navy-bg)" : undefined,
              opacity: completed ? 0.6 : undefined,
              textDecoration: completed ? "line-through" : undefined,
            }}
          >
            <td
              className="w-10 px-3 py-2.5"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleOne(a.id)}
                aria-label={`Select ${a.id}`}
              />
            </td>
            <td className="px-3 py-2.5">
              <div className="max-w-[540px] truncate" style={{ color: "var(--text)" }}>
                {a.description}
              </div>
              <div
                className="mt-0.5 text-[11px]"
                style={{ fontFamily: "var(--font-mono)", color: "var(--text-3)" }}
              >
                {a.id.slice(0, 12)}… · {a.category.toLowerCase()}
                {a.duration_class === "long_running" ? " · long-running" : ""}
                {a.partner_required
                  ? ` · ${a.partner_type?.toLowerCase()}-blocked`
                  : ""}
              </div>
            </td>
            <td className="px-3 py-2.5" style={{ color: "var(--text-2)" }}>
              {c?.household_name.replace(/ Family$/, "") ?? "—"}
            </td>
            <td className="px-3 py-2.5" style={{ color: "var(--text-2)" }}>
              {owner}
            </td>
            <td className="px-3 py-2.5">
              <TimingBadge bucket={a.timing_bucket} />
            </td>
            <td className="px-3 py-2.5">
              <StatusBadge status={a.status} />
            </td>
          </tr>
        );
      })}
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "complete"
      ? { fg: "var(--s-green)", bg: "var(--s-green-bg)" }
      : status === "in_progress"
        ? { fg: "var(--s-blue)", bg: "var(--s-blue-bg)" }
        : status === "pending_decision"
          ? { fg: "var(--s-amber)", bg: "var(--s-amber-bg)" }
          : { fg: "var(--s-slate)", bg: "var(--s-slate-bg)" };
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: tone.bg, color: tone.fg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.fg }} />
      {status.replace(/_/g, " ")}
    </span>
  );
}
function TimingBadge({ bucket }: { bucket: string | null }) {
  if (!bucket) return <span style={{ color: "var(--text-3)" }}>—</span>;
  const tone =
    bucket === "overdue"
      ? { fg: "var(--s-red)", bg: "var(--s-red-bg)" }
      : bucket === "this_week"
        ? { fg: "var(--s-amber)", bg: "var(--s-amber-bg)" }
        : { fg: "var(--s-slate)", bg: "var(--s-slate-bg)" };
  return (
    <span
      className="inline-flex rounded px-1.5 py-0.5 text-[11px]"
      style={{ background: tone.bg, color: tone.fg }}
    >
      {BUCKET_LABEL[bucket] ?? bucket.replace(/_/g, " ")}
    </span>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="text-[11px] uppercase"
        style={{ color: "var(--text-3)", letterSpacing: "0.04em" }}
      >
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}
function FilterSep() {
  return (
    <span
      className="hidden h-4 w-px md:block"
      style={{ background: "var(--border)" }}
    />
  );
}
function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors"
      style={{
        background: active ? "var(--accent)" : "var(--surface)",
        borderColor: active ? "var(--accent)" : "var(--border)",
        color: active ? "#ffffff" : "var(--text-2)",
      }}
    >
      {children}
    </button>
  );
}
function Count({ n }: { n: number }) {
  return (
    <span
      className="text-[10px]"
      style={{ fontFamily: "var(--font-mono)", opacity: 0.7 }}
    >
      {n}
    </span>
  );
}
function SortHead({
  children,
  active,
  dir,
  onClick,
  width,
}: {
  children: React.ReactNode;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  width?: number;
}) {
  return (
    <th
      onClick={onClick}
      className="cursor-pointer px-3 py-2 text-left text-[11px] font-medium uppercase"
      style={{ letterSpacing: "0.04em", width }}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {active ? (
          dir === "asc" ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )
        ) : null}
      </span>
    </th>
  );
}
