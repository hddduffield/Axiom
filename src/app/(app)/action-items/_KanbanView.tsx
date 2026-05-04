"use client";

// Action items kanban + filterable backlog (Phase 9.18).
//
// Layout:
//   - Page head: "Action items" Cormorant title + "Show completed" toggle
//   - Top: kanban — one column per active advisor, in_progress items
//   - Below: backlog list — not_started items, filterable by Timeline + Client
//
// Status mapping (the only state machine that matters here):
//   - 'not_started'   → backlog list (any owner)
//   - 'in_progress'   → advisor column matching item.owner === advisor.email
//   - 'pending_decision' → also routed to the owner's column for visibility
//   - 'complete'      → hidden by default; revealed as a 4th read-only column
//                       when "Show completed" toggle is on
//
// Drag-and-drop is added by Phase 9.19. This file ships the static
// rendering plus the click-to-open-drawer interaction.

import { useEffect, useMemo, useState } from "react";

import { ActionItemDrawer } from "@/components/axiom/ActionItemDrawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api/client";
import type { ActionItem, Advisor, Client, Note } from "@/lib/api/types";
import { ActionCard } from "./_ActionCard";

type AdvisorRow = Pick<Advisor, "id" | "email" | "first_name" | "last_name">;
type ClientLookup = Pick<Client, "id" | "household_name">;

interface Props {
  advisors: AdvisorRow[];
  clients: ClientLookup[];
  initialItems: ActionItem[];
}

const BUCKET_ORDER: Record<string, number> = {
  overdue: 0,
  this_week: 1,
  next_30_days: 2,
  next_60_days: 3,
  next_90_days: 4,
  this_year: 5,
  ongoing: 6,
};

type TimelineFilter =
  | "all"
  | "overdue"
  | "this_week"
  | "next_30_days"
  | "next_60_days"
  | "next_90_days"
  | "long_term";

const TIMELINE_OPTIONS: Array<{ value: TimelineFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "overdue", label: "Overdue" },
  { value: "this_week", label: "This week" },
  { value: "next_30_days", label: "Next 30 days" },
  { value: "next_60_days", label: "Next 60 days" },
  { value: "next_90_days", label: "Next 90 days" },
  { value: "long_term", label: "Long term" },
];

function matchesTimeline(item: ActionItem, f: TimelineFilter): boolean {
  if (f === "all") return true;
  if (f === "long_term") {
    return item.timing_bucket === "this_year" || item.timing_bucket === "ongoing";
  }
  return item.timing_bucket === f;
}

function bucketSort(a: ActionItem, b: ActionItem): number {
  return (
    (BUCKET_ORDER[a.timing_bucket ?? ""] ?? 99) -
    (BUCKET_ORDER[b.timing_bucket ?? ""] ?? 99)
  );
}

export function KanbanView({ advisors, clients, initialItems }: Props) {
  const [items, setItems] = useState<ActionItem[]>(initialItems);
  const [showCompleted, setShowCompleted] = useState(false);
  const [filterTimeline, setFilterTimeline] = useState<TimelineFilter>("all");
  const [filterClient, setFilterClient] = useState<string>("all");

  // Drawer state — clicking any card opens detail.
  const [activeItem, setActiveItem] = useState<ActionItem | null>(null);
  const [linkedNote, setLinkedNote] = useState<Note | null>(null);

  const clientById = useMemo(
    () => new Map(clients.map((c) => [c.id, c])),
    [clients],
  );
  const clientNameOf = (id: string): string | null =>
    clientById.get(id)?.household_name ?? null;

  // ─── Origin-note lookup on drawer open ───
  useEffect(() => {
    if (!activeItem) {
      setLinkedNote(null);
      return;
    }
    let cancelled = false;
    api.notes
      .listByClient(activeItem.client_id)
      .then(({ items: notes }) => {
        if (cancelled) return;
        setLinkedNote(
          notes.find((n) => n.promoted_to_action_item_id === activeItem.id) ?? null,
        );
      })
      .catch(() => {
        if (!cancelled) setLinkedNote(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeItem]);

  // ─── Bucket items by status ───
  const inProgressByOwner = useMemo(() => {
    const m = new Map<string, ActionItem[]>();
    for (const it of items) {
      if (it.status !== "in_progress" && it.status !== "pending_decision") continue;
      const arr = m.get(it.owner) ?? [];
      arr.push(it);
      m.set(it.owner, arr);
    }
    for (const arr of m.values()) arr.sort(bucketSort);
    return m;
  }, [items]);

  const completedItems = useMemo(
    () =>
      items
        .filter((it) => it.status === "complete")
        .sort((a, b) =>
          (b.completed_at ?? "").localeCompare(a.completed_at ?? ""),
        ),
    [items],
  );

  const backlog = useMemo(() => {
    return items
      .filter((it) => it.status === "not_started")
      .filter((it) => matchesTimeline(it, filterTimeline))
      .filter(
        (it) => filterClient === "all" || it.client_id === filterClient,
      )
      .sort(bucketSort);
  }, [items, filterTimeline, filterClient]);

  // ─── Drawer change handler ───
  function handleChanged(updated: ActionItem) {
    setItems((cur) => cur.map((i) => (i.id === updated.id ? updated : i)));
    if (activeItem?.id === updated.id) setActiveItem(updated);
  }

  // ─── Render ───
  return (
    <div className="flex flex-col gap-6">
      {/* Page head */}
      <div className="flex items-end justify-between gap-4">
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
        <label
          className="inline-flex cursor-pointer items-center gap-2 text-xs"
          style={{ color: "var(--text-2)" }}
        >
          <input
            type="checkbox"
            checked={showCompleted}
            onChange={(e) => setShowCompleted(e.target.checked)}
          />
          Show completed
        </label>
      </div>

      {/* Kanban */}
      <KanbanRow
        advisors={advisors}
        inProgressByOwner={inProgressByOwner}
        completedItems={showCompleted ? completedItems : null}
        clientNameOf={clientNameOf}
        onCardClick={setActiveItem}
      />

      {/* Backlog */}
      <BacklogSection
        items={backlog}
        clientNameOf={clientNameOf}
        clients={clients}
        filterTimeline={filterTimeline}
        setFilterTimeline={setFilterTimeline}
        filterClient={filterClient}
        setFilterClient={setFilterClient}
        onCardClick={setActiveItem}
      />

      <ActionItemDrawer
        item={activeItem}
        clientHouseholdName={
          activeItem ? clientNameOf(activeItem.client_id) : null
        }
        linkedNote={linkedNote}
        onClose={() => setActiveItem(null)}
        onChanged={handleChanged}
      />
    </div>
  );
}

// ─────────── Kanban row ───────────

function KanbanRow({
  advisors,
  inProgressByOwner,
  completedItems,
  clientNameOf,
  onCardClick,
}: {
  advisors: AdvisorRow[];
  inProgressByOwner: Map<string, ActionItem[]>;
  completedItems: ActionItem[] | null;
  clientNameOf: (id: string) => string | null;
  onCardClick: (item: ActionItem) => void;
}) {
  return (
    <div
      className="grid gap-4"
      style={{
        gridTemplateColumns: `repeat(${advisors.length + (completedItems ? 1 : 0)}, minmax(260px, 1fr))`,
      }}
    >
      {advisors.map((a) => {
        const colItems = inProgressByOwner.get(a.email) ?? [];
        return (
          <AdvisorColumn
            key={a.id}
            title={a.first_name}
            count={colItems.length}
            items={colItems}
            clientNameOf={clientNameOf}
            onCardClick={onCardClick}
          />
        );
      })}
      {completedItems ? (
        <AdvisorColumn
          title="Completed"
          count={completedItems.length}
          items={completedItems}
          clientNameOf={clientNameOf}
          onCardClick={onCardClick}
          completedColumn
        />
      ) : null}
    </div>
  );
}

function AdvisorColumn({
  title,
  count,
  items,
  clientNameOf,
  onCardClick,
  completedColumn,
}: {
  title: string;
  count: number;
  items: ActionItem[];
  clientNameOf: (id: string) => string | null;
  onCardClick: (item: ActionItem) => void;
  completedColumn?: boolean;
}) {
  return (
    <div
      className="flex flex-col rounded-md border"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        minHeight: 320,
      }}
    >
      <div
        className="flex items-baseline justify-between border-b"
        style={{
          borderColor: "var(--border)",
          padding: "12px 14px",
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: "0.06em",
            color: "var(--text-2)",
            textTransform: "uppercase",
            margin: 0,
          }}
        >
          {title}
        </h2>
        <span
          className="text-[11px]"
          style={{
            fontFamily: "var(--font-mono)",
            color: "var(--text-3)",
          }}
        >
          {count}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        {items.length === 0 ? (
          <p
            className="my-auto text-center text-xs"
            style={{ color: "var(--text-3)" }}
          >
            {completedColumn ? "No completed items." : "No active items"}
          </p>
        ) : (
          items.map((it) => (
            <ActionCard
              key={it.id}
              item={it}
              clientName={clientNameOf(it.client_id)}
              onClick={() => onCardClick(it)}
              completed={completedColumn}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─────────── Backlog ───────────

function BacklogSection({
  items,
  clientNameOf,
  clients,
  filterTimeline,
  setFilterTimeline,
  filterClient,
  setFilterClient,
  onCardClick,
}: {
  items: ActionItem[];
  clientNameOf: (id: string) => string | null;
  clients: ClientLookup[];
  filterTimeline: TimelineFilter;
  setFilterTimeline: (v: TimelineFilter) => void;
  filterClient: string;
  setFilterClient: (v: string) => void;
  onCardClick: (item: ActionItem) => void;
}) {
  return (
    <div
      className="rounded-md border"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <div
        className="flex flex-wrap items-center justify-between gap-3 border-b"
        style={{
          borderColor: "var(--border)",
          padding: "12px 16px",
        }}
      >
        <div className="flex items-center gap-3">
          <h2
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: "0.06em",
              color: "var(--text-2)",
              textTransform: "uppercase",
              margin: 0,
            }}
          >
            Backlog
          </h2>
          <span
            className="text-[11px]"
            style={{ fontFamily: "var(--font-mono)", color: "var(--text-3)" }}
          >
            {items.length}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterRow
            label="Timeline"
            value={filterTimeline}
            onChange={(v) => setFilterTimeline(v as TimelineFilter)}
            options={TIMELINE_OPTIONS}
          />
          <FilterRow
            label="Client"
            value={filterClient}
            onChange={setFilterClient}
            options={[
              { value: "all", label: "All clients" },
              ...clients.map((c) => ({
                value: c.id,
                label: c.household_name,
              })),
            ]}
          />
        </div>
      </div>
      {items.length === 0 ? (
        <p
          className="px-4 py-10 text-center text-xs"
          style={{ color: "var(--text-3)" }}
        >
          No backlog items match these filters.
        </p>
      ) : (
        <div
          className="grid gap-2 p-3"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          }}
        >
          {items.map((it) => (
            <ActionCard
              key={it.id}
              item={it}
              clientName={clientNameOf(it.client_id)}
              onClick={() => onCardClick(it)}
              compact
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterRow<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span
        className="text-[10px] uppercase"
        style={{ color: "var(--text-3)", letterSpacing: "0.04em" }}
      >
        {label}
      </span>
      <Select
        value={value}
        onValueChange={(v) => onChange((v ?? options[0].value) as T)}
      >
        <SelectTrigger className="h-7 text-xs" style={{ minWidth: 140 }}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

