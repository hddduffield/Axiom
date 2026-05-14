"use client";

// Action items kanban + filterable backlog with drag-and-drop (Phase
// 9.18 layout, 9.19 DnD layer).
//
// Layout:
//   - Page head: "Action items" Cormorant title + "Show completed" toggle
//   - Top: kanban — one column per active advisor, in_progress items
//   - Below: backlog list — not_started items, filterable by Timeline + Client
//   - Sticky bottom: drop-zone bar (only visible during drag)
//
// Status mapping:
//   - 'not_started'        → backlog list (any owner)
//   - 'in_progress'        → advisor column matching item.owner === advisor.email
//   - 'pending_decision'   → routed to the owner's column for visibility
//   - 'complete'           → hidden by default; revealed as a 4th read-only
//                            column when "Show completed" toggle is on
//
// DnD targets (Phase 9.19):
//   - advisor:<email>      → status=in_progress, owner=email
//   - backlog              → status=not_started (owner unchanged)
//   - zone:complete        → status=complete (lifecycle hooks fire)
//   - zone:backlog         → same as backlog target
//
// Optimistic UI: setItems immediately on drop, then PATCH; on error,
// rollback from snapshot + toast.

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive } from "lucide-react";

import { Chip } from "@/components/axiom/Chip";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";

import { ActionItemDrawer } from "@/components/axiom/ActionItemDrawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, isApiError } from "@/lib/api/client";
import type {
  ActionItem,
  ActionItemStatus,
  Advisor,
  Client,
  Note,
} from "@/lib/api/types";
import { ActionCard } from "./_ActionCard";
import {
  DropZoneBar,
  DROP_BACKLOG_ID,
  DROP_COMPLETE_ID,
} from "./_DropZoneBar";

type AdvisorRow = Pick<Advisor, "id" | "email" | "first_name" | "last_name">;
type ClientLookup = Pick<Client, "id" | "household_name">;

interface Props {
  advisors: AdvisorRow[];
  clients: ClientLookup[];
  initialItems: ActionItem[];
  // Phase 11.5.1 — archived-clients toggle state. Server-side filter
  // already pruned items belonging to archived clients UNLESS
  // includeArchived=true; this set lets cards render with a muted tone
  // when the toggle is on so the advisor can see at a glance which
  // items belong to archived households.
  includeArchived: boolean;
  archivedClientIds: string[];
  archivedCount: number;
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

const ADVISOR_PREFIX = "advisor:";
const BACKLOG_DROP_ID = "backlog";

export function KanbanView({
  advisors,
  clients,
  initialItems,
  includeArchived,
  archivedClientIds,
  archivedCount,
}: Props) {
  const [items, setItems] = useState<ActionItem[]>(initialItems);
  const [showCompleted, setShowCompleted] = useState(false);
  const [filterTimeline, setFilterTimeline] = useState<TimelineFilter>("all");
  const [filterClient, setFilterClient] = useState<string>("all");

  const archivedClientSet = useMemo(
    () => new Set(archivedClientIds),
    [archivedClientIds],
  );
  const isArchivedClient = (clientId: string): boolean =>
    archivedClientSet.has(clientId);

  const router = useRouter();
  const pathname = usePathname();
  function toggleIncludeArchived() {
    const next = !includeArchived;
    const url = next ? `${pathname}?archived=1` : pathname;
    router.replace(url);
  }

  // Drawer state — clicking any card opens detail.
  const [activeItem, setActiveItem] = useState<ActionItem | null>(null);
  const [linkedNote, setLinkedNote] = useState<Note | null>(null);

  // DnD state
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Pointer sensor with a small distance threshold so onClick still fires
  // when the user clicks without intent to drag (touch + mouse).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

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
  function handleDrawerChanged(updated: ActionItem) {
    setItems((cur) => cur.map((i) => (i.id === updated.id ? updated : i)));
    if (activeItem?.id === updated.id) setActiveItem(updated);
  }

  // ─── DnD handlers ───
  function handleDragStart(e: DragStartEvent) {
    setDraggingId(String(e.active.id));
  }

  async function handleDragEnd(e: DragEndEvent) {
    setDraggingId(null);
    const { active, over } = e;
    if (!over) return;
    const itemId = String(active.id);
    const target = String(over.id);
    const before = items.find((i) => i.id === itemId);
    if (!before) return;

    // Resolve drop target → patch.
    const patch = resolveDropTarget(target);
    if (!patch) return;

    // No-op detection: dropping onto the same advisor column it's already in.
    if (
      patch.status === before.status &&
      (patch.owner === undefined || patch.owner === before.owner)
    ) {
      return;
    }

    // Optimistic update + snapshot.
    const snapshot = items;
    const optimistic: ActionItem = {
      ...before,
      status: patch.status,
      ...(patch.owner !== undefined ? { owner: patch.owner } : {}),
      // Stamp completed_at locally so the completed column shows it
      // immediately; server will re-stamp definitively on PATCH.
      ...(patch.status === "complete" && !before.completed_at
        ? { completed_at: new Date().toISOString() }
        : {}),
    };
    setItems((cur) => cur.map((i) => (i.id === itemId ? optimistic : i)));

    try {
      const res = await api.actionItems.update(itemId, {
        status: patch.status,
        ...(patch.owner !== undefined ? { owner: patch.owner } : {}),
      });
      // Replace with the server's authoritative row (covers completed_at,
      // updated_at, etc).
      setItems((cur) => cur.map((i) => (i.id === itemId ? res.item : i)));
      if (res.spawned_reminders && res.spawned_reminders.length > 0) {
        toast.success(`${res.spawned_reminders.length} reminder spawned`);
        // Server-side spawn isn't reflected in our `items` state until next
        // page load — append the spawned rows so the kanban shows them
        // right away.
        setItems((cur) => [...cur, ...(res.spawned_reminders ?? [])]);
      }
      if (res.auto_closed_reminders > 0) {
        toast.success(`${res.auto_closed_reminders} reminder(s) auto-closed`);
      }
    } catch (e) {
      setItems(snapshot);
      toast.error(isApiError(e) ? e.message : "Could not move item");
    }
  }

  function handleDragCancel() {
    setDraggingId(null);
  }

  /** Translate a drop-target id into a PATCH delta. Returns null if the
   *  target isn't recognised. */
  function resolveDropTarget(
    id: string,
  ): { status: ActionItemStatus; owner?: string } | null {
    if (id === DROP_COMPLETE_ID) return { status: "complete" };
    if (id === DROP_BACKLOG_ID) return { status: "not_started" };
    if (id === BACKLOG_DROP_ID) return { status: "not_started" };
    if (id.startsWith(ADVISOR_PREFIX)) {
      const email = id.slice(ADVISOR_PREFIX.length);
      return { status: "in_progress", owner: email };
    }
    return null;
  }

  const draggingItem = draggingId
    ? items.find((i) => i.id === draggingId) ?? null
    : null;

  // ─── Render ───
  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex flex-col gap-6 pb-24">
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
          <div className="flex items-center gap-3">
            {archivedCount > 0 ? (
              <Chip active={includeArchived} onClick={toggleIncludeArchived}>
                <Archive className="h-3 w-3" />
                <span className="ml-1">Include archived</span>
              </Chip>
            ) : null}
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
        </div>

        {/* Kanban */}
        <KanbanRow
          advisors={advisors}
          inProgressByOwner={inProgressByOwner}
          completedItems={showCompleted ? completedItems : null}
          clientNameOf={clientNameOf}
          isArchivedClient={isArchivedClient}
          onCardClick={setActiveItem}
        />

        {/* Backlog */}
        <BacklogSection
          items={backlog}
          clientNameOf={clientNameOf}
          isArchivedClient={isArchivedClient}
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
          onChanged={handleDrawerChanged}
        />
      </div>

      <DropZoneBar visible={draggingId !== null} />

      <DragOverlay
        dropAnimation={{
          duration: 180,
          easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
        }}
      >
        {draggingItem ? (
          <div style={{ width: 280, transform: "rotate(-1.5deg)" }}>
            <ActionCard
              item={draggingItem}
              clientName={clientNameOf(draggingItem.client_id)}
              clientId={draggingItem.client_id}
              archived={isArchivedClient(draggingItem.client_id)}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// ─────────── Draggable card wrapper ───────────

function DraggableCard({
  item,
  clientName,
  clientId,
  onClick,
  completed,
  compact,
  archived,
}: {
  item: ActionItem;
  clientName: string | null;
  clientId?: string | null;
  onClick: () => void;
  completed?: boolean;
  compact?: boolean;
  archived?: boolean;
}) {
  // Completed items are read-only — render the bare card without
  // useDraggable so the cursor stays default and clicks pass through.
  const draggable = useDraggable({
    id: item.id,
    disabled: completed,
  });
  const { setNodeRef, attributes, listeners, isDragging } = draggable;

  return (
    <div
      ref={setNodeRef}
      style={{
        opacity: isDragging ? 0.4 : 1,
        cursor: completed ? "default" : "grab",
      }}
      {...attributes}
      {...listeners}
    >
      <ActionCard
        item={item}
        clientName={clientName}
        clientId={clientId}
        onClick={onClick}
        completed={completed}
        compact={compact}
        archived={archived}
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
  isArchivedClient,
  onCardClick,
}: {
  advisors: AdvisorRow[];
  inProgressByOwner: Map<string, ActionItem[]>;
  completedItems: ActionItem[] | null;
  clientNameOf: (id: string) => string | null;
  isArchivedClient: (id: string) => boolean;
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
            droppableId={`${ADVISOR_PREFIX}${a.email}`}
            title={a.first_name}
            count={colItems.length}
            items={colItems}
            clientNameOf={clientNameOf}
            isArchivedClient={isArchivedClient}
            onCardClick={onCardClick}
          />
        );
      })}
      {completedItems ? (
        <CompletedColumn
          items={completedItems}
          clientNameOf={clientNameOf}
          isArchivedClient={isArchivedClient}
          onCardClick={onCardClick}
        />
      ) : null}
    </div>
  );
}

function AdvisorColumn({
  droppableId,
  title,
  count,
  items,
  clientNameOf,
  isArchivedClient,
  onCardClick,
}: {
  droppableId: string;
  title: string;
  count: number;
  items: ActionItem[];
  clientNameOf: (id: string) => string | null;
  isArchivedClient: (id: string) => boolean;
  onCardClick: (item: ActionItem) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: droppableId });
  return (
    <div
      className="flex flex-col rounded-md border transition-colors"
      style={{
        background: isOver ? "var(--psa-navy-bg)" : "var(--surface)",
        borderColor: isOver ? "var(--accent)" : "var(--border)",
        minHeight: 320,
      }}
    >
      <div
        className="flex items-baseline justify-between border-b"
        style={{ borderColor: "var(--border)", padding: "12px 14px" }}
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
          style={{ fontFamily: "var(--font-mono)", color: "var(--text-3)" }}
        >
          {count}
        </span>
      </div>
      <div ref={setNodeRef} className="flex flex-1 flex-col gap-2 p-3">
        {items.length === 0 ? (
          <p
            className="my-auto text-center text-xs"
            style={{ color: "var(--text-3)" }}
          >
            No active items
          </p>
        ) : (
          items.map((it) => (
            <DraggableCard
              key={it.id}
              item={it}
              clientName={clientNameOf(it.client_id)}
              clientId={it.client_id}
              archived={isArchivedClient(it.client_id)}
              onClick={() => onCardClick(it)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function CompletedColumn({
  items,
  clientNameOf,
  isArchivedClient,
  onCardClick,
}: {
  items: ActionItem[];
  clientNameOf: (id: string) => string | null;
  isArchivedClient: (id: string) => boolean;
  onCardClick: (item: ActionItem) => void;
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
        style={{ borderColor: "var(--border)", padding: "12px 14px" }}
      >
        <h2
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: "0.06em",
            color: "var(--text-3)",
            textTransform: "uppercase",
            margin: 0,
          }}
        >
          Completed
        </h2>
        <span
          className="text-[11px]"
          style={{ fontFamily: "var(--font-mono)", color: "var(--text-3)" }}
        >
          {items.length}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        {items.length === 0 ? (
          <p
            className="my-auto text-center text-xs"
            style={{ color: "var(--text-3)" }}
          >
            No completed items.
          </p>
        ) : (
          items.map((it) => (
            <ActionCard
              key={it.id}
              item={it}
              clientName={clientNameOf(it.client_id)}
              clientId={it.client_id}
              archived={isArchivedClient(it.client_id)}
              onClick={() => onCardClick(it)}
              completed
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
  isArchivedClient,
  clients,
  filterTimeline,
  setFilterTimeline,
  filterClient,
  setFilterClient,
  onCardClick,
}: {
  items: ActionItem[];
  clientNameOf: (id: string) => string | null;
  isArchivedClient: (id: string) => boolean;
  clients: ClientLookup[];
  filterTimeline: TimelineFilter;
  setFilterTimeline: (v: TimelineFilter) => void;
  filterClient: string;
  setFilterClient: (v: string) => void;
  onCardClick: (item: ActionItem) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: BACKLOG_DROP_ID });
  return (
    <div
      ref={setNodeRef}
      className="rounded-md border transition-colors"
      style={{
        background: isOver ? "var(--s-amber-bg)" : "var(--surface)",
        borderColor: isOver ? "var(--s-amber)" : "var(--border)",
      }}
    >
      <div
        className="flex flex-wrap items-center justify-between gap-3 border-b"
        style={{ borderColor: "var(--border)", padding: "12px 16px" }}
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
            <DraggableCard
              key={it.id}
              item={it}
              clientName={clientNameOf(it.client_id)}
              clientId={it.client_id}
              archived={isArchivedClient(it.client_id)}
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
