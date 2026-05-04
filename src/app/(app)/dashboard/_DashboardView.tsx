"use client";

// Dashboard view — converts Claude Design's view-dashboard.jsx
// `Dashboard` over the existing api.notes.create + api.actionItems.update
// wiring (preserved from Phase 5e).
//
// Architecture:
//   - page.tsx (Server Component) does all reads via the Supabase server
//     client and ships the universe in via props.
//   - This Client Component owns interaction state (composer toggle,
//     priority-card Mark complete) so the dashboard can mutate without
//     a follow-up router.refresh round-trip.
//
// What is preserved:
//   - api.notes.create for the inline quick-note compose
//   - api.actionItems.update for Mark complete on priority cards (which
//     will fire the same lifecycle hooks — spawned_reminders /
//     auto_closed_reminders — surfaced via toast)
//
// What is new from Claude Design:
//   - Hero greeting with metric subtitle and inline slide-out composer
//   - Editorial stat layout: hero "Overdue" tile + 3 satellites
//   - Plan pipeline rail (Queued → Ready for review → Approved)
//   - Triage queue with priority cards (top 2 overdue) + compact table
//   - Side rail: Needs your decision / Recent notes / Recent activity

import Link from "next/link";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  FileText,
  Link as LinkIcon,
  Plus,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
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
  Advisor,
  Client,
  LensRun,
  Note,
  Plan,
} from "@/lib/api/types";

// ─────────── Types ───────────

type ClientLookup = Pick<Client, "id" | "household_name">;
type NoteWithAuthor = Note & {
  advisors: { first_name: string; last_name: string } | null;
};
type PlanLite = Pick<Plan, "id" | "status" | "client_id">;
type LensRunLite = Pick<LensRun, "id" | "lens_type" | "client_id" | "generated_at" | "context_input">;
type CompleteEvent = Pick<ActionItem, "id" | "description" | "client_id" | "completed_at">;

interface Props {
  advisor: Pick<Advisor, "id" | "email" | "first_name" | "last_name">;
  myItems: ActionItem[];
  clients: ClientLookup[];
  plans: PlanLite[];
  recentNotes: NoteWithAuthor[];
  recentLensRuns: LensRunLite[];
  recentCompletes: CompleteEvent[];
}

const NOTE_TAGS = [
  { id: "client_meeting", label: "Client meeting" },
  { id: "internal", label: "Internal" },
  { id: "phone_call", label: "Phone call" },
  { id: "partner_touchpoint", label: "Partner touchpoint" },
];

// ─────────── Helpers ───────────

function greetForHour(d: Date): string {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
function fmtRelative(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const day = Math.floor(ms / 86_400_000);
  if (day < 0) return "just now";
  if (day < 1) return "today";
  if (day === 1) return "1d ago";
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 4) return `${wk}w ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function withoutFamily(name: string): string {
  return name.replace(/ Family$/, "");
}

// ─────────── Component ───────────

export function DashboardView({
  advisor,
  myItems,
  clients,
  plans,
  recentNotes,
  recentLensRuns,
  recentCompletes,
}: Props) {
  const me = { id: advisor.id, email: advisor.email };
  const [items, setItems] = useState<ActionItem[]>(myItems);
  const [composing, setComposing] = useState(false);

  const clientById = useMemo(
    () => new Map(clients.map((c) => [c.id, c])),
    [clients],
  );

  // ─────────── Derived counts ───────────
  const myOpen = items.filter((a) => a.status !== "complete");
  const overdue = myOpen.filter((a) => a.timing_bucket === "overdue");
  const thisWeek = myOpen.filter((a) => a.timing_bucket === "this_week");
  const next30 = myOpen.filter((a) => a.timing_bucket === "next_30_days");
  const pending = myOpen.filter((a) => a.status === "pending_decision");
  const partnerBlocked = myOpen.filter((a) => a.partner_required);

  const startWeek = Date.now() - 7 * 86_400_000;
  const completedThisWeek = items.filter(
    (a) =>
      a.status === "complete" &&
      a.completed_at &&
      new Date(a.completed_at).getTime() >= startWeek,
  ).length;

  const openClients = new Set(myOpen.map((a) => a.client_id)).size;

  const bucketOrder: Record<string, number> = {
    overdue: 0,
    this_week: 1,
    next_30_days: 2,
    next_60_days: 3,
    next_90_days: 4,
    this_year: 5,
    ongoing: 6,
  };
  const triage = [...myOpen].sort(
    (a, b) =>
      (bucketOrder[a.timing_bucket ?? ""] ?? 99) -
      (bucketOrder[b.timing_bucket ?? ""] ?? 99),
  );

  const queuedPlans = plans.filter(
    (p) => p.status === "queued" || p.status === "processing",
  ).length;
  const reviewPlans = plans.filter((p) => p.status === "ready_for_review").length;
  const approvedPlans = plans.filter((p) => p.status === "approved").length;

  // ─────────── Activity stream ───────────
  type Activity = {
    kind: "complete" | "promote" | "lens";
    ts: string;
    label: React.ReactNode;
    sub?: string | null;
  };
  const activity: Activity[] = useMemo(() => {
    const events: Activity[] = [];
    for (const a of recentCompletes) {
      if (!a.completed_at) continue;
      events.push({
        kind: "complete",
        ts: a.completed_at,
        label: (
          <>
            Marked{" "}
            <span style={{ fontFamily: "var(--font-mono)" }}>
              {a.id.slice(0, 12)}…
            </span>{" "}
            complete · {withoutFamily(clientById.get(a.client_id)?.household_name ?? "—")}
          </>
        ),
        sub: a.description,
      });
    }
    for (const n of recentNotes) {
      if (!n.promoted_to_action_item_id) continue;
      events.push({
        kind: "promote",
        ts: n.created_at,
        label: (
          <>
            Promoted note{" "}
            <span style={{ fontFamily: "var(--font-mono)" }}>
              {n.id.slice(0, 12)}…
            </span>{" "}
            →{" "}
            <span style={{ fontFamily: "var(--font-mono)" }}>
              {n.promoted_to_action_item_id.slice(0, 12)}…
            </span>
          </>
        ),
        sub: clientById.get(n.client_id)?.household_name ?? null,
      });
    }
    for (const r of recentLensRuns) {
      events.push({
        kind: "lens",
        ts: r.generated_at ?? "",
        label: (
          <>
            Lens run{" "}
            <span style={{ fontFamily: "var(--font-mono)" }}>
              {r.id.slice(0, 12)}…
            </span>{" "}
            ({r.lens_type.replace(/_/g, " ")}) ·{" "}
            {withoutFamily(clientById.get(r.client_id)?.household_name ?? "—")}
          </>
        ),
        sub: r.context_input ?? null,
      });
    }
    return events
      .sort((a, b) => (b.ts || "").localeCompare(a.ts || ""))
      .slice(0, 6);
  }, [recentCompletes, recentNotes, recentLensRuns, clientById]);

  // ─────────── Mutations ───────────
  async function markComplete(id: string) {
    try {
      const res = await api.actionItems.update(id, { status: "complete" });
      setItems((cur) => cur.map((i) => (i.id === id ? res.item : i)));
      if (res.auto_closed_reminders > 0) {
        toast.success(`${res.auto_closed_reminders} reminder(s) auto-closed`);
      }
      toast.success("Marked complete");
    } catch (e) {
      toast.error(isApiError(e) ? e.message : "Could not update item");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Hero ── */}
      <Hero
        advisor={advisor}
        openCount={myOpen.length}
        clientCount={openClients}
        completedThisWeek={completedThisWeek}
        composing={composing}
        onToggleCompose={() => setComposing((v) => !v)}
        clients={clients}
        onSavedNote={() => setComposing(false)}
      />

      {/* ── Stat tiles ── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr]">
        <StatTile
          hero
          alert={overdue.length > 0}
          label="Overdue"
          value={overdue.length}
          delta={overdue.length ? "Needs attention now" : "All clear"}
          href="/action-items"
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatTile
            label="Due this week"
            value={thisWeek.length}
            delta={`${next30.length} more in 30 days`}
            href="/action-items"
          />
          <StatTile
            label="Pending decision"
            value={pending.length}
            delta={`${partnerBlocked.length} partner-blocked`}
            href="/action-items"
          />
          <StatTile
            label="Open clients"
            value={openClients}
            delta={`of ${clients.length} total`}
            href="/clients"
          />
        </div>
      </div>

      {/* ── Plan pipeline rail ── */}
      <PlanPipeline
        queued={queuedPlans}
        review={reviewPlans}
        approved={approvedPlans}
        total={plans.length}
      />

      {/* ── Two-up: triage + side rail ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        {/* Triage */}
        <PanelCard
          title="Your triage queue"
          right={
            <div className="flex items-center gap-3">
              <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
                Sorted by due date
              </span>
              <Link
                href="/action-items"
                className="inline-flex items-center gap-1 text-xs hover:underline"
                style={{ color: "var(--accent)" }}
              >
                View all <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          }
        >
          {triage.length === 0 ? (
            <div
              className="px-4 py-8 text-center"
              style={{ color: "var(--text-2)" }}
            >
              <p className="font-medium" style={{ color: "var(--text)" }}>
                Nothing in your queue.
              </p>
              <p className="mt-1 text-xs">
                Generate a plan to seed actions, or take the rest of the day.
              </p>
            </div>
          ) : (
            <>
              {/* Priority cards: top 2 overdue */}
              {overdue.length > 0 ? (
                <div className="flex flex-col gap-2 px-4 pb-3 pt-3">
                  {overdue.slice(0, 2).map((a) => (
                    <PriorityCard
                      key={a.id}
                      item={a}
                      client={clientById.get(a.client_id) ?? null}
                      onMarkComplete={() => markComplete(a.id)}
                    />
                  ))}
                </div>
              ) : null}

              <table className="w-full text-[13px]">
                <thead
                  className="border-y"
                  style={{
                    borderColor: "var(--border)",
                    background: "var(--surface-2)",
                    color: "var(--text-3)",
                  }}
                >
                  <tr>
                    <ColHead>Item</ColHead>
                    <ColHead width={160}>Client</ColHead>
                    <ColHead width={110}>Due</ColHead>
                    <ColHead width={130}>Status</ColHead>
                  </tr>
                </thead>
                <tbody>
                  {triage
                    .slice(overdue.slice(0, 2).length)
                    .slice(0, 8)
                    .map((a) => {
                      const c = clientById.get(a.client_id);
                      return (
                        <tr
                          key={a.id}
                          className="border-b transition-colors hover:bg-[var(--surface-2)]"
                          style={{ borderColor: "var(--border)" }}
                        >
                          <td className="px-3 py-2.5">
                            <Link
                              href={`/clients/${a.client_id}`}
                              className="block max-w-[460px] truncate hover:underline"
                              style={{ color: "var(--text)" }}
                            >
                              {a.description}
                            </Link>
                            <div
                              className="mt-0.5 text-[11px]"
                              style={{
                                fontFamily: "var(--font-mono)",
                                color: "var(--text-3)",
                              }}
                            >
                              {a.id.slice(0, 12)}… · {a.category.toLowerCase()}
                              {a.partner_required
                                ? ` · ${a.partner_type?.toLowerCase()}-blocked`
                                : ""}
                            </div>
                          </td>
                          <td
                            className="px-3 py-2.5"
                            style={{ color: "var(--text-2)" }}
                          >
                            {c ? withoutFamily(c.household_name) : "—"}
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
                </tbody>
              </table>
              {triage.length > 8 + overdue.slice(0, 2).length ? (
                <div
                  className="border-t px-4 py-2.5 text-center"
                  style={{ borderColor: "var(--border)" }}
                >
                  <Link
                    href="/action-items"
                    className="text-xs hover:underline"
                    style={{ color: "var(--accent)" }}
                  >
                    {triage.length - 8 - overdue.slice(0, 2).length} more in
                    queue → Open action items
                  </Link>
                </div>
              ) : null}
            </>
          )}
        </PanelCard>

        {/* Side rail */}
        <div className="flex flex-col gap-4">
          <PanelCard
            title="Needs your decision"
            right={
              <span
                className="text-[11px]"
                style={{ fontFamily: "var(--font-mono)", color: "var(--text-3)" }}
              >
                {pending.length}
              </span>
            }
            flush
          >
            {pending.length === 0 ? (
              <div
                className="px-4 py-5 text-center text-sm"
                style={{ color: "var(--text-3)" }}
              >
                No pending decisions.
              </div>
            ) : (
              <ul>
                {pending.map((p) => {
                  const c = clientById.get(p.client_id);
                  return (
                    <li
                      key={p.id}
                      className="border-b px-4 py-3 last:border-b-0"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <Link
                        href={`/clients/${p.client_id}`}
                        className="flex items-center justify-between text-xs hover:underline"
                      >
                        <span style={{ color: "var(--text-2)" }}>
                          {c ? withoutFamily(c.household_name) : "—"}
                        </span>
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            color: "var(--text-3)",
                          }}
                        >
                          {p.id.slice(0, 8)}…
                        </span>
                      </Link>
                      <p
                        className="mt-1 text-[13px]"
                        style={{ color: "var(--text)" }}
                      >
                        {p.description}
                      </p>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <TimingBadge bucket={p.timing_bucket} />
                        {p.partner_required ? (
                          <span
                            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]"
                            style={{
                              background: "var(--surface-2)",
                              color: "var(--text-3)",
                            }}
                          >
                            <LinkIcon className="h-3 w-3" />
                            {p.partner_type}
                          </span>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </PanelCard>

          <PanelCard
            title="Recent notes"
            right={
              <Link
                href="/notes"
                className="inline-flex items-center gap-1 text-xs hover:underline"
                style={{ color: "var(--accent)" }}
              >
                Notes hub <ChevronRight className="h-3 w-3" />
              </Link>
            }
          >
            {recentNotes.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-3)" }}>
                No notes yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {recentNotes.map((n) => {
                  const c = clientById.get(n.client_id);
                  const isMe = n.author_advisor_id === me.id;
                  return (
                    <li
                      key={n.id}
                      className="border-l-2 pl-3"
                      style={{
                        borderColor: isMe ? "var(--accent)" : "var(--border)",
                      }}
                    >
                      <div
                        className="text-[11px]"
                        style={{ color: "var(--text-3)" }}
                      >
                        {fmtRelative(n.created_at)}
                        {n.advisors
                          ? ` · ${n.advisors.first_name} ${n.advisors.last_name[0]}.`
                          : ""}
                        {c ? ` · ${withoutFamily(c.household_name)}` : ""}
                        {n.tag ? (
                          <>
                            {" · "}
                            <Tag>{n.tag}</Tag>
                          </>
                        ) : null}
                      </div>
                      <p
                        className="mt-1 line-clamp-3 text-[13px]"
                        style={{ color: "var(--text)" }}
                      >
                        {n.body}
                      </p>
                      {n.promoted_to_action_item_id ? (
                        <div
                          className="mt-1 text-[11px]"
                          style={{
                            fontFamily: "var(--font-mono)",
                            color: "var(--text-3)",
                          }}
                        >
                          → promoted
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </PanelCard>

          {activity.length > 0 ? (
            <PanelCard
              title="Recent activity"
              right={
                <span
                  className="text-[11px]"
                  style={{ color: "var(--text-3)" }}
                >
                  across all clients
                </span>
              }
            >
              <ul className="flex flex-col gap-2.5">
                {activity.map((e, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{
                        background:
                          e.kind === "complete"
                            ? "var(--s-green)"
                            : e.kind === "promote"
                              ? "var(--accent)"
                              : "var(--s-amber)",
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div
                        className="text-[12px]"
                        style={{ color: "var(--text)" }}
                      >
                        {e.label}
                      </div>
                      {e.sub ? (
                        <div
                          className="mt-0.5 truncate text-[11px]"
                          style={{ color: "var(--text-3)" }}
                        >
                          {e.sub}
                        </div>
                      ) : null}
                    </div>
                    <span
                      className="shrink-0 text-[10px]"
                      style={{
                        fontFamily: "var(--font-mono)",
                        color: "var(--text-3)",
                      }}
                    >
                      {fmtRelative(e.ts)}
                    </span>
                  </li>
                ))}
              </ul>
            </PanelCard>
          ) : null}
        </div>
      </div>
    </div>
  );

  // greeting helpers consume `me` indirectly via `advisor` prop
  void greetForHour;
}

// ─────────── Hero ───────────

function Hero({
  advisor,
  openCount,
  clientCount,
  completedThisWeek,
  composing,
  onToggleCompose,
  clients,
  onSavedNote,
}: {
  advisor: Pick<Advisor, "first_name" | "email">;
  openCount: number;
  clientCount: number;
  completedThisWeek: number;
  composing: boolean;
  onToggleCompose: () => void;
  clients: ClientLookup[];
  onSavedNote: () => void;
}) {
  const now = new Date();
  const dateLine = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return (
    <div
      className="rounded-md border p-5"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
      }}
    >
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div
            className="text-[11px] uppercase"
            style={{ color: "var(--text-3)", letterSpacing: "0.04em" }}
          >
            {dateLine}
          </div>
          <h1
            className="mt-1 text-3xl font-medium"
            style={{
              fontFamily: "var(--font-display)",
              letterSpacing: "-0.01em",
              color: "var(--text)",
            }}
          >
            {greetForHour(now)}, {advisor.first_name}.
          </h1>
          <p className="mt-1.5 text-sm" style={{ color: "var(--text-2)" }}>
            {openCount === 0 ? (
              <>You&rsquo;re caught up. Take a breath.</>
            ) : (
              <>
                <span style={{ fontFamily: "var(--font-mono)" }}>{openCount}</span>{" "}
                open across{" "}
                <span style={{ fontFamily: "var(--font-mono)" }}>
                  {clientCount}
                </span>{" "}
                clients ·{" "}
                <span style={{ fontFamily: "var(--font-mono)" }}>
                  {completedThisWeek}
                </span>{" "}
                completed this week
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onToggleCompose}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {composing ? "Close" : "Quick note"}
          </Button>
          <Link
            href="/plans/generate"
            className={buttonVariants({ size: "sm" })}
          >
            <FileText className="mr-1.5 h-3.5 w-3.5" />
            Generate plan
          </Link>
        </div>
      </div>
      {composing ? (
        <QuickCompose clients={clients} onSaved={onSavedNote} />
      ) : null}
    </div>
  );
}

// ─────────── Quick compose (inline, replaces the dialog) ───────────

const noteSchema = z.object({
  client_id: z.string().uuid("Pick a client"),
  body: z.string().min(1, "Required"),
  tag: z.string().min(1, "Pick a tag"),
});
type NoteValues = z.infer<typeof noteSchema>;

function QuickCompose({
  clients,
  onSaved,
}: {
  clients: ClientLookup[];
  onSaved: () => void;
}) {
  const form = useForm<NoteValues>({
    resolver: zodResolver(noteSchema),
    defaultValues: {
      client_id: clients[0]?.id ?? "",
      body: "",
      tag: "client_meeting",
    },
  });
  async function onSubmit(values: NoteValues) {
    try {
      await api.notes.create({
        client_id: values.client_id,
        body: values.body,
        tag: values.tag,
      });
      toast.success("Note saved");
      onSaved();
      form.reset({
        client_id: clients[0]?.id ?? "",
        body: "",
        tag: "client_meeting",
      });
    } catch (e) {
      toast.error(isApiError(e) ? e.message : "Could not save note");
    }
  }
  return (
    <div
      className="mt-4 rounded-md border p-3"
      style={{
        background: "var(--surface-2)",
        borderColor: "var(--border)",
      }}
      data-api="POST /api/notes"
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <FormField
              control={form.control}
              name="client_id"
              render={({ field }) => (
                <FormItem className="flex-1 min-w-[180px]">
                  <FormLabel
                    className="text-[10px] uppercase"
                    style={{ color: "var(--text-3)", letterSpacing: "0.04em" }}
                  >
                    Client
                  </FormLabel>
                  <FormControl>
                    <Select
                      value={field.value || undefined}
                      onValueChange={(v) => field.onChange(v ?? "")}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Pick a client" />
                      </SelectTrigger>
                      <SelectContent>
                        {clients.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.household_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="tag"
              render={({ field }) => (
                <FormItem className="w-[180px]">
                  <FormLabel
                    className="text-[10px] uppercase"
                    style={{ color: "var(--text-3)", letterSpacing: "0.04em" }}
                  >
                    Tag
                  </FormLabel>
                  <FormControl>
                    <Select
                      value={field.value}
                      onValueChange={(v) => field.onChange(v ?? "")}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {NOTE_TAGS.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="body"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Textarea
                    rows={3}
                    autoFocus
                    placeholder="What just happened? Decisions, asks, partner needs…"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex justify-end gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={form.formState.isSubmitting}
            >
              <Check className="mr-1.5 h-3.5 w-3.5" />
              {form.formState.isSubmitting ? "Saving…" : "Save note"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

// ─────────── Stat tile ───────────

function StatTile({
  label,
  value,
  delta,
  alert,
  hero,
  href,
}: {
  label: string;
  value: number;
  delta: string;
  alert?: boolean;
  hero?: boolean;
  href?: string;
}) {
  const inner = (
    <div
      className="rounded-md border p-4 transition-colors hover:bg-[var(--surface-2)]"
      style={{
        background: "var(--surface)",
        borderColor: alert ? "var(--s-red-bg)" : "var(--border)",
        height: "100%",
      }}
    >
      <div
        className="text-[11px] uppercase"
        style={{
          color: alert ? "var(--s-red)" : "var(--text-3)",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </div>
      <div
        className={hero ? "mt-2 text-5xl" : "mt-1 text-3xl"}
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 500,
          color: alert ? "var(--s-red)" : "var(--text)",
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </div>
      <div
        className="mt-1 text-[11px]"
        style={{ color: alert ? "var(--s-red)" : "var(--text-3)" }}
      >
        {delta}
      </div>
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="block h-full">
        {inner}
      </Link>
    );
  }
  return inner;
}

// ─────────── Plan pipeline rail ───────────

function PlanPipeline({
  queued,
  review,
  approved,
  total,
}: {
  queued: number;
  review: number;
  approved: number;
  total: number;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-4 rounded-md border px-4 py-3"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center gap-2">
        <span
          className="text-[11px] uppercase"
          style={{ color: "var(--text-3)", letterSpacing: "0.04em" }}
        >
          Plan pipeline
        </span>
        <span
          className="text-[11px]"
          style={{ fontFamily: "var(--font-mono)", color: "var(--text-3)" }}
        >
          {total} {total === 1 ? "plan" : "plans"}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <PipelineNode label="Queued" value={queued} />
        <span style={{ color: "var(--text-3)" }}>→</span>
        <PipelineNode label="Ready for review" value={review} accent />
        <span style={{ color: "var(--text-3)" }}>→</span>
        <PipelineNode label="Approved" value={approved} />
      </div>
      <Link
        href="/plans/generate"
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Queue new plan
      </Link>
    </div>
  );
}
function PipelineNode({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 18,
          fontWeight: 500,
          color: accent ? "var(--accent)" : "var(--text)",
        }}
      >
        {value}
      </span>
      <span className="text-xs" style={{ color: "var(--text-2)" }}>
        {label}
      </span>
    </div>
  );
}

// ─────────── Priority card ───────────

function PriorityCard({
  item,
  client,
  onMarkComplete,
}: {
  item: ActionItem;
  client: ClientLookup | null;
  onMarkComplete: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div
      className="overflow-hidden rounded-md border-l-4"
      style={{
        borderLeftColor: "var(--s-red)",
        background: "var(--s-red-bg)",
        border: "1px solid var(--s-red-bg)",
      }}
    >
      <div className="px-3 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <Link
            href={`/clients/${item.client_id}`}
            className="text-xs hover:underline"
            style={{ color: "var(--accent)", fontWeight: 500 }}
          >
            {client ? withoutFamily(client.household_name) : "—"}
          </Link>
          <span
            className="inline-flex items-center gap-1 text-[11px] font-medium"
            style={{ color: "var(--s-red)" }}
          >
            <AlertTriangle className="h-3 w-3" />
            Overdue
          </span>
        </div>
        <p
          className="mt-1 text-[13px]"
          style={{ color: "var(--text)", fontWeight: 500 }}
        >
          {item.description}
        </p>
        <div
          className="mt-0.5 text-[11px]"
          style={{ fontFamily: "var(--font-mono)", color: "var(--text-3)" }}
        >
          {item.id.slice(0, 12)}… · {item.category.toLowerCase()}
        </div>
        <div className="mt-2 flex items-center gap-2">
          {item.partner_required ? (
            <span
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]"
              style={{
                background: "var(--surface)",
                color: "var(--text-3)",
              }}
            >
              <LinkIcon className="h-3 w-3" />
              {item.partner_type}
            </span>
          ) : null}
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onMarkComplete();
              setBusy(false);
            }}
            className="ml-auto"
          >
            <Check className="mr-1.5 h-3.5 w-3.5" />
            {busy ? "Saving…" : "Mark complete"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─────────── Shared primitives ───────────

function PanelCard({
  title,
  right,
  children,
  flush = false,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  flush?: boolean;
}) {
  return (
    <div
      className="overflow-hidden rounded-md border"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <div
        className="flex items-center justify-between border-b px-4 py-2.5"
        style={{ borderColor: "var(--border)" }}
      >
        <h2
          className="text-[13px] font-medium"
          style={{ color: "var(--text)" }}
        >
          {title}
        </h2>
        {right}
      </div>
      <div className={flush ? "" : "p-4"}>{children}</div>
    </div>
  );
}

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
      {bucket.replace(/_/g, " ")}
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
      }}
    >
      {children}
    </span>
  );
}
