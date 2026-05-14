"use client";

// Client detail — converts Claude Design's view-clients.jsx
// `ClientDetail` (line 250) + 5 tab subcomponents (Overview, Plan,
// Items, Notes, Lenses, Partners) into a single Client Component owning
// the active-tab + drawer state.
//
// Server data ships in via props from page.tsx; row clicks on Action
// Items open the existing <ActionItemDrawer/> so lifecycle hooks
// (spawned_reminders / auto_closed_reminders toasts) are preserved.
//
// Schema gaps vs Claude Design (deferred to v1.5):
//   - clients table has no `aum`, `entity_count`, `last_activity_at`,
//     or freeform `notes` field → Profile KV omits those rows.
//   - "Promote to action item" button on Notes tab is left as a stub
//     until the dedicated Notes hub (9.7) wires the dialog flow.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Archive, ChevronRight, FileText, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/axiom/Tabs";
import { ActionItemDrawer } from "@/components/axiom/ActionItemDrawer";
import { PanelCard } from "@/components/axiom/PanelCard";
import { Chip, Count } from "@/components/axiom/Chip";
import { ClientContextBlock } from "@/components/axiom/ClientContextBlock";
import { ClientEditDialog } from "./_ClientEditDialog";
import { ClientArchiveDialog } from "./_ClientArchiveDialog";
import { ClientRestoreDialog } from "./_ClientRestoreDialog";
import { LensRunArchiveDialog } from "./_LensRunArchiveDialog";
import { LensRunRestoreDialog } from "./_LensRunRestoreDialog";
import { LensSetCurrentButton } from "./_LensSetCurrentButton";
import { api, isApiError } from "@/lib/api/client";
import type {
  ActionItem,
  Client,
  LensRun,
  Note,
  Partner,
  Plan,
} from "@/lib/api/types";

// ─────────────── Prop types ───────────────

type ClientWithAdvisor = Client & {
  advisors: { first_name: string; last_name: string; email: string } | null;
};
type NoteWithAuthor = Note & {
  advisors: { first_name: string; last_name: string } | null;
};
type PlanRow = Pick<
  Plan,
  | "id"
  | "status"
  | "generated_at"
  | "approved_at"
  | "fact_review_filename"
  | "cost_cents"
>;
type LensRunRow = Pick<
  LensRun,
  "id" | "lens_type" | "status" | "generated_at" | "cost_cents" | "context_input"
>;

interface AdvisorOption {
  id: string;
  first_name: string;
  last_name: string;
}

interface Props {
  client: ClientWithAdvisor;
  plans: PlanRow[];
  actionItems: ActionItem[];
  notes: NoteWithAuthor[];
  partners: Partner[];
  lensRuns: LensRunRow[];
  advisors: AdvisorOption[];
  // Phase 15.3 — true when ?archived=1 in the URL. Lenses include archived rows.
  includeArchivedLensRuns: boolean;
}

// ─────────────── Formatting helpers ───────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
function fmtRelative(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const day = Math.floor(ms / 86_400_000);
  if (day < 1) return "today";
  if (day === 1) return "1d ago";
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 4) return `${wk}w ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}
function archetypeLabel(a: string | null): string {
  return (
    { PRE: "pre-liquidity", MID: "mid-life", POST: "post-liquidity", NONE: "—" }[
      a ?? ""
    ] ?? "—"
  );
}
function ownerLabel(o: string | null): string {
  if (!o) return "—";
  if (o === "advisor") return "Advisor";
  if (o === "client") return "Client";
  if (o === "partner") return "Partner";
  return o;
}

// ─────────────── Status / timing badges ───────────────

function StatusBadge({ status }: { status: string }) {
  // Phase 17.4 — also recognizes the expanded lens taxonomy
  // (reviewed / presented / current / superseded) plus the legacy
  // 'approved' value. Falls through to slate for unknown values.
  const tone =
    status === "complete" || status === "current" || status === "approved"
      ? { fg: "var(--s-green)", bg: "var(--s-green-bg)" }
      : status === "in_progress" || status === "presented"
        ? { fg: "var(--s-blue)", bg: "var(--s-blue-bg)" }
        : status === "pending_decision" || status === "reviewed"
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
      {bucket.replace(/_/g, " ")}
    </span>
  );
}
function ClientStatusBadge({ s }: { s: string }) {
  // Phase 18.3 — dormant tone surfaces maintenance-mode.
  const tone =
    s === "active"
      ? { fg: "var(--s-green)", bg: "var(--s-green-bg)", label: "Active" }
      : s === "prospect"
        ? { fg: "var(--s-amber)", bg: "var(--s-amber-bg)", label: "Prospect" }
        : s === "dormant"
          ? { fg: "var(--gold)", bg: "var(--s-amber-bg)", label: "Dormant" }
          : { fg: "var(--s-slate)", bg: "var(--s-slate-bg)", label: "Inactive" };
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: tone.bg, color: tone.fg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.fg }} />
      {tone.label}
    </span>
  );
}
function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium"
      style={{
        background: "var(--surface-2)",
        color: "var(--text-2)",
        fontFamily: "var(--font-mono)",
      }}
    >
      {children}
    </span>
  );
}

// PanelCard primitive moved to src/components/axiom/PanelCard.tsx (Phase 9.16).

// ─────────────── Main component ───────────────

export function ClientDetailView({
  client,
  plans,
  actionItems,
  notes,
  partners,
  lensRuns,
  advisors,
  includeArchivedLensRuns,
}: Props) {
  const [activeItem, setActiveItem] = useState<ActionItem | null>(null);
  const [items, setItems] = useState(actionItems); // local mutable copy for drawer
  const aiOpen = items.filter((a) => a.status !== "complete");
  const linkedNoteForActive =
    activeItem && notes.find((n) => n.promoted_to_action_item_id === activeItem.id)
      ? (notes.find(
          (n) => n.promoted_to_action_item_id === activeItem!.id,
        ) as Note)
      : null;

  function handleItemChanged(updated: ActionItem) {
    setItems((cur) => cur.map((i) => (i.id === updated.id ? updated : i)));
    setActiveItem(updated);
  }

  // Phase 11.2 — archived client visual treatment. status='inactive' is
  // the soft-delete state; we mute the page (opacity) and prominently
  // surface the ARCHIVED badge in the header. Edit + Archive are hidden;
  // Restore takes their place (lands in Phase 11.3).
  const isArchived = client.status === "inactive";

  return (
    <div
      className="flex flex-col gap-5"
      style={{ opacity: isArchived ? 0.85 : 1 }}
    >
      {/* PageHead */}
      <div>
        <Link
          href="/clients"
          className="text-xs hover:underline"
          style={{ color: "var(--text-3)" }}
        >
          Clients
        </Link>
        <span className="mx-1.5 text-xs" style={{ color: "var(--text-3)" }}>
          ›
        </span>
        <span className="text-xs" style={{ color: "var(--text-2)" }}>
          {client.household_name}
        </span>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1
                className="text-3xl font-medium"
                style={{
                  fontFamily: "var(--font-display)",
                  letterSpacing: "-0.01em",
                  color: "var(--text)",
                }}
              >
                {client.household_name}
              </h1>
              {isArchived ? (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase"
                  style={{
                    background: "var(--s-slate-bg)",
                    color: "var(--s-slate)",
                    letterSpacing: "0.06em",
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: "var(--s-slate)" }}
                  />
                  Archived
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm" style={{ color: "var(--text-2)" }}>
              Lead:{" "}
              {client.advisors
                ? `${client.advisors.first_name} ${client.advisors.last_name[0]}.`
                : "—"}
              {client.archetype ? (
                <>
                  {" · "}
                  <Tag>{client.archetype}</Tag>
                </>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isArchived ? (
              <ClientRestoreDialog client={client} />
            ) : (
              <>
                <ClientEditDialog client={client} advisors={advisors} />
                <ClientArchiveDialog client={client} />
                <Button variant="outline" size="sm" disabled>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Note
                </Button>
                <Button variant="outline" size="sm" disabled>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Item
                </Button>
                <Link
                  href="/plans/generate"
                  className={buttonVariants({ size: "sm" })}
                >
                  <FileText className="mr-1.5 h-3.5 w-3.5" />
                  Generate plan
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="mb-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="plan">
            Plan
            {plans.length > 0 ? (
              <span className="ml-1 text-[11px]" style={{ color: "var(--text-3)" }}>
                {plans.length}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="items">
            Action items
            <span className="ml-1 text-[11px]" style={{ color: "var(--text-3)" }}>
              {aiOpen.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="notes">
            Notes
            <span className="ml-1 text-[11px]" style={{ color: "var(--text-3)" }}>
              {notes.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="lenses">
            Lens runs
            <span className="ml-1 text-[11px]" style={{ color: "var(--text-3)" }}>
              {lensRuns.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="partners">
            Partners
            <span className="ml-1 text-[11px]" style={{ color: "var(--text-3)" }}>
              {partners.length}
            </span>
          </TabsTrigger>
        </TabsList>

        {/* ── Overview ── */}
        <TabsContent value="overview" className="mt-4">
          <OverviewTab
            client={client}
            items={items}
            notes={notes}
            onOpenItem={setActiveItem}
          />
        </TabsContent>

        {/* ── Plan ── */}
        <TabsContent value="plan" className="mt-4">
          <PlanTab plans={plans} />
        </TabsContent>

        {/* ── Action items ── */}
        <TabsContent value="items" className="mt-4">
          <ItemsTab items={items} onOpenItem={setActiveItem} />
        </TabsContent>

        {/* ── Notes ── */}
        <TabsContent value="notes" className="mt-4">
          <NotesTab notes={notes} />
        </TabsContent>

        {/* ── Lens runs ── */}
        <TabsContent value="lenses" className="mt-4">
          <LensesTab
            lenses={lensRuns}
            clientId={client.id}
            includeArchived={includeArchivedLensRuns}
          />
        </TabsContent>

        {/* ── Partners ── */}
        <TabsContent value="partners" className="mt-4">
          <PartnersTab partners={partners} />
        </TabsContent>
      </Tabs>

      <ActionItemDrawer
        item={activeItem}
        clientHouseholdName={client.household_name}
        linkedNote={linkedNoteForActive}
        onClose={() => setActiveItem(null)}
        onChanged={handleItemChanged}
      />
    </div>
  );
}

// ─────────────── Tab subcomponents ───────────────

function OverviewTab({
  client,
  items,
  notes,
  onOpenItem,
  onOpenEdit,
}: {
  client: ClientWithAdvisor;
  items: ActionItem[];
  notes: NoteWithAuthor[];
  onOpenItem: (i: ActionItem) => void;
  onOpenEdit?: () => void;
}) {
  const aiOpen = items.filter((a) => a.status !== "complete");
  const overdue = aiOpen.filter((a) => a.timing_bucket === "overdue").length;
  const week = aiOpen.filter((a) => a.timing_bucket === "this_week").length;
  const pending = aiOpen.filter((a) => a.status === "pending_decision").length;
  const recent = [...notes].slice(0, 3);

  return (
    <div className="flex flex-col gap-4">
      {/* Phase 18.4 — Context paragraph block at the top. */}
      <ClientContextBlock
        paragraph={client.context_paragraph}
        updatedAt={client.context_updated_at}
        onEditClick={onOpenEdit}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
      {/* Left rail */}
      <div className="flex flex-col gap-4">
        <PanelCard title="Profile">
          <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-[13px]">
            <dt style={{ color: "var(--text-3)" }}>Status</dt>
            <dd>
              <ClientStatusBadge s={client.status} />
            </dd>
            <dt style={{ color: "var(--text-3)" }}>Archetype</dt>
            <dd>
              {client.archetype ? (
                <span className="inline-flex items-center gap-2">
                  <Tag>{client.archetype}</Tag>
                  <span className="text-[12px]" style={{ color: "var(--text-3)" }}>
                    {archetypeLabel(client.archetype)}
                  </span>
                </span>
              ) : (
                "—"
              )}
            </dd>
            <dt style={{ color: "var(--text-3)" }}>Lead advisor</dt>
            <dd>
              {client.advisors
                ? `${client.advisors.first_name} ${client.advisors.last_name}`
                : "—"}
            </dd>
            <dt style={{ color: "var(--text-3)" }}>Created</dt>
            <dd style={{ fontFamily: "var(--font-mono)" }}>
              {fmtDate(client.created_at)}
            </dd>
          </dl>
        </PanelCard>

        <PanelCard title="Activity">
          <Stat
            label="Open items"
            value={aiOpen.length}
            delta={`${overdue} overdue · ${week} this week · ${pending} pending`}
          />
          <div
            className="my-3 h-px"
            style={{ background: "var(--border)" }}
          />
          <Stat
            label="Notes"
            value={notes.length}
            delta={`${notes.filter((n) => n.promoted_to_action_item_id).length} promoted to items`}
          />
        </PanelCard>
      </div>

      {/* Main column */}
      <div className="flex flex-col gap-4">
        <PanelCard title="Open action items" count={aiOpen.length} flush>
          {aiOpen.length === 0 ? (
            <div
              className="px-4 py-6 text-center text-sm"
              style={{ color: "var(--text-3)" }}
            >
              All clear — no open items.
            </div>
          ) : (
            <table className="w-full text-[13px]">
              <thead
                className="border-b"
                style={{ borderColor: "var(--border)", color: "var(--text-3)" }}
              >
                <tr>
                  <ColHead>Item</ColHead>
                  <ColHead width={110}>Owner</ColHead>
                  <ColHead width={110}>Due</ColHead>
                  <ColHead width={140}>Status</ColHead>
                </tr>
              </thead>
              <tbody>
                {aiOpen.slice(0, 10).map((a) => (
                  <ItemRow key={a.id} a={a} onClick={() => onOpenItem(a)} />
                ))}
              </tbody>
            </table>
          )}
        </PanelCard>

        <PanelCard title="Recent notes">
          {recent.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-3)" }}>
              No notes yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {recent.map((n) => (
                <li
                  key={n.id}
                  className="border-l-2 pl-3"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="text-[11px]" style={{ color: "var(--text-3)" }}>
                    {fmtRelative(n.created_at)}
                    {n.advisors ? ` · ${n.advisors.first_name}` : ""}
                    {n.tag ? (
                      <>
                        {" · "}
                        <Tag>{n.tag}</Tag>
                      </>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[13px]" style={{ color: "var(--text)" }}>
                    {n.body}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </PanelCard>
      </div>
    </div>
    </div>
  );
}

function PlanTab({ plans }: { plans: PlanRow[] }) {
  if (plans.length === 0) {
    return (
      <PanelCard>
        <div
          className="flex flex-col items-start gap-3 py-6 text-sm"
          style={{ color: "var(--text-2)" }}
        >
          <span>No plans generated yet.</span>
          <Link
            href="/plans/generate"
            className={buttonVariants({ size: "sm" })}
          >
            Generate plan
          </Link>
        </div>
      </PanelCard>
    );
  }
  return (
    <PanelCard
      title="Plans"
      count={plans.length}
      flush
      action={
        <Link
          href="/plans/generate"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Generate
        </Link>
      }
    >
      <table className="w-full text-[13px]">
        <thead
          className="border-b"
          style={{ borderColor: "var(--border)", color: "var(--text-3)" }}
        >
          <tr>
            <ColHead>Plan</ColHead>
            <ColHead width={100}>Status</ColHead>
            <ColHead width={130}>Generated</ColHead>
            <ColHead width={130}>Approved</ColHead>
            <ColHead width={60}> </ColHead>
          </tr>
        </thead>
        <tbody>
          {plans.map((p) => (
            <PlanRowEl key={p.id} p={p} />
          ))}
        </tbody>
      </table>
    </PanelCard>
  );
}

function PlanRowEl({ p }: { p: PlanRow }) {
  const router = useRouter();
  return (
    <tr
      className="cursor-pointer border-b transition-colors hover:bg-[var(--surface-2)]"
      style={{ borderColor: "var(--border)" }}
      onClick={() => router.push(`/plans/${p.id}`)}
    >
      <td className="px-3 py-2.5">
        <div className="font-medium" style={{ color: "var(--text)" }}>
          {p.fact_review_filename ?? "Plan"}
        </div>
      </td>
      <td className="px-3 py-2.5">
        <PlanStatusBadge status={p.status} />
      </td>
      <td
        className="px-3 py-2.5"
        style={{ fontFamily: "var(--font-mono)", color: "var(--text-2)" }}
      >
        {fmtDate(p.generated_at)}
      </td>
      <td
        className="px-3 py-2.5"
        style={{ fontFamily: "var(--font-mono)", color: "var(--text-2)" }}
      >
        {p.approved_at ? fmtDate(p.approved_at) : "—"}
      </td>
      <td className="px-3 py-2.5" style={{ color: "var(--text-3)" }}>
        <ChevronRight className="h-4 w-4" />
      </td>
    </tr>
  );
}

function PlanStatusBadge({ status }: { status: string }) {
  // Phase 17.9 — surface the manual-orchestrator dependency on queued
  // / processing plans via title-tooltip so advisors aren't surprised
  // when nothing happens until Hayden runs the CLI.
  const tone =
    status === "approved"
      ? { fg: "var(--s-green)", bg: "var(--s-green-bg)", label: "Approved" }
      : status === "draft"
        ? { fg: "var(--s-amber)", bg: "var(--s-amber-bg)", label: "Draft" }
        : status === "queued"
          ? { fg: "var(--s-amber)", bg: "var(--s-amber-bg)", label: "Queued · awaiting orchestrator" }
          : status === "processing"
            ? { fg: "var(--s-blue)", bg: "var(--s-blue-bg)", label: "Processing" }
            : status === "ready_for_review"
              ? { fg: "var(--s-blue)", bg: "var(--s-blue-bg)", label: "Ready for review" }
              : status === "failed"
                ? { fg: "var(--s-red)", bg: "var(--s-red-bg)", label: "Failed" }
                : { fg: "var(--s-slate)", bg: "var(--s-slate-bg)", label: status };
  const title =
    status === "queued"
      ? "Plan is queued in the database. Generation begins when Hayden runs `npm run generate-pending` on his laptop. Expected wall-clock: ~25–40 min once started."
      : status === "processing"
        ? "Orchestrator has claimed this plan and is currently generating. Wall-clock: ~25–40 min."
        : undefined;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: tone.bg, color: tone.fg }}
      title={title}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.fg }} />
      {tone.label}
    </span>
  );
}

function ItemsTab({
  items,
  onOpenItem,
}: {
  items: ActionItem[];
  onOpenItem: (i: ActionItem) => void;
}) {
  if (items.length === 0) {
    return (
      <PanelCard>
        <p className="text-sm" style={{ color: "var(--text-2)" }}>
          No action items for this client.
        </p>
      </PanelCard>
    );
  }
  return (
    <PanelCard flush>
      <table className="w-full text-[13px]">
        <thead
          className="border-b"
          style={{ borderColor: "var(--border)", color: "var(--text-3)" }}
        >
          <tr>
            <ColHead>Item</ColHead>
            <ColHead width={110}>Owner</ColHead>
            <ColHead width={110}>Due</ColHead>
            <ColHead width={140}>Status</ColHead>
          </tr>
        </thead>
        <tbody>
          {items.map((a) => (
            <ItemRow
              key={a.id}
              a={a}
              onClick={() => onOpenItem(a)}
              strike={a.status === "complete"}
            />
          ))}
        </tbody>
      </table>
    </PanelCard>
  );
}

function NotesTab({ notes }: { notes: NoteWithAuthor[] }) {
  if (notes.length === 0) {
    return (
      <PanelCard>
        <p className="text-sm" style={{ color: "var(--text-2)" }}>
          No notes yet.
        </p>
      </PanelCard>
    );
  }
  return (
    <PanelCard
      title="Notes"
      count={notes.length}
      action={
        <Link
          href="/notes"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New note
        </Link>
      }
    >
      <ul className="flex flex-col gap-4">
        {notes.map((n) => (
          <li
            key={n.id}
            className="border-l-2 pl-3"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="text-[11px]" style={{ color: "var(--text-3)" }}>
              {fmtDate(n.created_at)}
              {n.advisors
                ? ` · ${n.advisors.first_name} ${n.advisors.last_name[0]}.`
                : ""}
              {n.tag ? (
                <>
                  {" · "}
                  <Tag>{n.tag}</Tag>
                </>
              ) : null}
            </div>
            <p className="mt-1 text-[13px]" style={{ color: "var(--text)" }}>
              {n.body}
            </p>
            {n.promoted_to_action_item_id ? (
              <span
                className="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase"
                style={{
                  background: "var(--s-green-bg)",
                  color: "var(--s-green)",
                  letterSpacing: "0.06em",
                }}
              >
                Promoted
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </PanelCard>
  );
}

function LensesTab({
  lenses,
  clientId,
  includeArchived,
}: {
  lenses: LensRunRow[];
  clientId: string;
  includeArchived: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [creatingCf, setCreatingCf] = useState(false);
  const [creatingEst, setCreatingEst] = useState(false);

  function toggleIncludeArchived() {
    const next = !includeArchived;
    // We're at /clients/[id]; both toggle states are URL-shareable.
    const url = next ? `${pathname}?archived=1` : pathname;
    router.replace(url);
  }

  const archivedCount = lenses.filter((l) => l.status === "archived").length;

  async function handleNewCashFlow() {
    setCreatingCf(true);
    try {
      const created = await api.lensRuns.cashFlow.create({ client_id: clientId });
      router.push(`/clients/${clientId}/lens-runs/cash-flow/${created.id}`);
    } catch (e) {
      const msg = isApiError(e) ? e.message : "Failed to create lens";
      toast.error(msg);
      setCreatingCf(false);
    }
  }

  async function handleNewEstate() {
    setCreatingEst(true);
    try {
      const created = await api.lensRuns.estate.create({ client_id: clientId });
      router.push(`/clients/${clientId}/lens-runs/estate/${created.id}`);
    } catch (e) {
      const msg = isApiError(e) ? e.message : "Failed to create lens";
      toast.error(msg);
      setCreatingEst(false);
    }
  }

  function handleRowClick(lens: LensRunRow) {
    if (lens.lens_type === "cash_flow") {
      router.push(`/clients/${clientId}/lens-runs/cash-flow/${lens.id}`);
    } else if (lens.lens_type === "estate") {
      router.push(`/clients/${clientId}/lens-runs/estate/${lens.id}`);
    }
    // Other lens types have no detail page yet (Phase 5c). No-op for now.
  }

  // Show the toggle whenever the client has any archived lens (when off,
  // the data isn't fetched, so we surface it whenever it COULD be on:
  // that is, always — the advisor can opt in to discover archived rows
  // they didn't know about. Cheap server query, no harm if empty.).
  const showArchivedChip = (
    <Chip active={includeArchived} onClick={toggleIncludeArchived}>
      <Archive className="h-3 w-3" />
      <span className="ml-1">Show archived</span>
      {includeArchived && archivedCount > 0 ? (
        <span className="ml-1">
          <Count n={archivedCount} onActive />
        </span>
      ) : null}
    </Chip>
  );

  const newCashFlowButton = (
    <div className="flex items-center gap-2">
      {showArchivedChip}
      <Button
        variant="outline"
        size="sm"
        onClick={handleNewCashFlow}
        disabled={creatingCf}
      >
        {creatingCf ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Plus className="mr-1.5 h-3.5 w-3.5" />
        )}
        New Cash Flow Lens
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={handleNewEstate}
        disabled={creatingEst}
      >
        {creatingEst ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Plus className="mr-1.5 h-3.5 w-3.5" />
        )}
        New Estate Lens
      </Button>
    </div>
  );

  if (lenses.length === 0) {
    return (
      <PanelCard action={newCashFlowButton}>
        <p className="text-sm" style={{ color: "var(--text-2)" }}>
          No lens runs yet.
        </p>
      </PanelCard>
    );
  }
  return (
    <PanelCard title="Lens runs" count={lenses.length} flush action={newCashFlowButton}>
      <table className="w-full text-[13px]">
        <thead
          className="border-b"
          style={{ borderColor: "var(--border)", color: "var(--text-3)" }}
        >
          <tr>
            <ColHead>Run</ColHead>
            <ColHead width={130}>Type</ColHead>
            <ColHead width={110}>Status</ColHead>
            <ColHead width={130}>Generated</ColHead>
            <ColHead width={130}> </ColHead>
            <ColHead width={60}> </ColHead>
            <ColHead width={50}> </ColHead>
          </tr>
        </thead>
        <tbody>
          {lenses.map((l) => {
            const clickable = l.lens_type === "cash_flow" || l.lens_type === "estate";
            const lensTypeLabel =
              l.lens_type === "cash_flow"
                ? "Cash Flow"
                : l.lens_type === "estate"
                  ? "Estate"
                  : l.lens_type.replace(/_/g, " ");
            const fallbackTitle =
              l.lens_type === "cash_flow"
                ? "Cash Flow Plan"
                : l.lens_type === "estate"
                  ? "Estate Plan"
                  : "—";
            const scenarioName = l.context_input ?? fallbackTitle;
            const isArchived = l.status === "archived";
            return (
              <tr
                key={l.id}
                className={
                  clickable
                    ? "cursor-pointer border-b transition-colors hover:bg-[var(--surface-2)]"
                    : "border-b"
                }
                style={{
                  borderColor: "var(--border)",
                  opacity: isArchived ? 0.65 : 1,
                }}
                onClick={clickable ? () => handleRowClick(l) : undefined}
              >
                <td className="px-3 py-2.5">
                  <div style={{ color: "var(--text)" }}>{scenarioName}</div>
                </td>
                <td className="px-3 py-2.5">
                  <Tag>{l.lens_type.replace(/_/g, " ")}</Tag>
                </td>
                <td className="px-3 py-2.5">
                  <StatusBadge status={l.status} />
                </td>
                <td
                  className="px-3 py-2.5"
                  style={{ fontFamily: "var(--font-mono)", color: "var(--text-2)" }}
                >
                  {fmtDate(l.generated_at)}
                </td>
                <td
                  className="px-3 py-2.5 text-right"
                  onClick={(e) => e.stopPropagation()}
                >
                  {!isArchived ? (
                    <LensSetCurrentButton
                      lensRunId={l.id}
                      scenarioName={scenarioName}
                      status={l.status}
                    />
                  ) : null}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {isArchived ? (
                    <LensRunRestoreDialog
                      lensRunId={l.id}
                      scenarioName={scenarioName}
                      lensTypeLabel={lensTypeLabel}
                    />
                  ) : (
                    <LensRunArchiveDialog
                      lensRunId={l.id}
                      scenarioName={scenarioName}
                      lensTypeLabel={lensTypeLabel}
                    />
                  )}
                </td>
                <td className="px-3 py-2.5" style={{ color: "var(--text-3)" }}>
                  {clickable ? <ChevronRight className="h-4 w-4" /> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </PanelCard>
  );
}

function PartnersTab({ partners }: { partners: Partner[] }) {
  if (partners.length === 0) {
    return (
      <PanelCard>
        <p className="text-sm" style={{ color: "var(--text-2)" }}>
          No partners on file.
        </p>
      </PanelCard>
    );
  }
  return (
    <PanelCard title="Partners" count={partners.length} flush>
      <table className="w-full text-[13px]">
        <thead
          className="border-b"
          style={{ borderColor: "var(--border)", color: "var(--text-3)" }}
        >
          <tr>
            <ColHead>Name</ColHead>
            <ColHead width={100}>Type</ColHead>
            <ColHead>Firm</ColHead>
            <ColHead width={200}>Email</ColHead>
            <ColHead width={130}>Phone</ColHead>
          </tr>
        </thead>
        <tbody>
          {partners.map((p) => (
            <tr
              key={p.id}
              className="border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <td className="px-3 py-2.5">
                <div className="font-medium" style={{ color: "var(--text)" }}>
                  {[p.first_name, p.last_name].filter(Boolean).join(" ") || "—"}
                </div>
                {p.notes ? (
                  <div
                    className="mt-0.5 text-[11px]"
                    style={{ color: "var(--text-3)" }}
                  >
                    {p.notes}
                  </div>
                ) : null}
              </td>
              <td className="px-3 py-2.5">
                <Tag>{p.partner_type}</Tag>
              </td>
              <td className="px-3 py-2.5" style={{ color: "var(--text-2)" }}>
                {p.firm_name ?? "—"}
              </td>
              <td
                className="px-3 py-2.5"
                style={{ fontFamily: "var(--font-mono)", color: "var(--text-2)" }}
              >
                {p.email ?? "—"}
              </td>
              <td
                className="px-3 py-2.5"
                style={{ fontFamily: "var(--font-mono)", color: "var(--text-3)" }}
              >
                {p.phone ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </PanelCard>
  );
}

// ─────────────── Shared row / column primitives ───────────────

function ColHead({
  children,
  width,
}: {
  children: React.ReactNode;
  width?: number;
}) {
  return (
    <th
      className="px-3 py-2 text-left text-[11px] font-medium uppercase"
      style={{ letterSpacing: "0.04em", width }}
    >
      {children}
    </th>
  );
}

function ItemRow({
  a,
  onClick,
  strike = false,
}: {
  a: ActionItem;
  onClick: () => void;
  strike?: boolean;
}) {
  return (
    <tr
      className="cursor-pointer border-b transition-colors hover:bg-[var(--surface-2)]"
      style={{
        borderColor: "var(--border)",
        opacity: strike ? 0.6 : undefined,
        textDecoration: strike ? "line-through" : undefined,
      }}
      onClick={onClick}
    >
      <td className="px-3 py-2.5">
        <div className="max-w-[460px] truncate" style={{ color: "var(--text)" }}>
          {a.description}
        </div>
        <div
          className="mt-0.5 text-[11px] uppercase"
          style={{ color: "var(--text-3)", letterSpacing: "0.04em" }}
        >
          {a.category.toLowerCase()}
        </div>
      </td>
      <td className="px-3 py-2.5" style={{ color: "var(--text-2)" }}>
        {ownerLabel(a.owner)}
      </td>
      <td className="px-3 py-2.5">
        <TimingBadge bucket={a.timing_bucket} />
      </td>
      <td className="px-3 py-2.5">
        <StatusBadge status={a.status} />
      </td>
    </tr>
  );
}

function Stat({
  label,
  value,
  delta,
}: {
  label: string;
  value: number | string;
  delta?: string;
}) {
  return (
    <div>
      <div
        className="text-[11px] uppercase"
        style={{ color: "var(--text-3)", letterSpacing: "0.04em" }}
      >
        {label}
      </div>
      <div
        className="mt-0.5 text-2xl font-medium"
        style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}
      >
        {value}
      </div>
      {delta ? (
        <div className="mt-0.5 text-[11px]" style={{ color: "var(--text-3)" }}>
          {delta}
        </div>
      ) : null}
    </div>
  );
}
