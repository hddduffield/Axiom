"use client";

// Action item drawer — converts Claude Design's view-action-items.jsx
// `ActionItemDrawer` (line 356) using shadcn's Sheet primitive (right-
// side slide-over) in place of Claude Design's bespoke `<Drawer>`.
//
// Preserved from Phase 5e wiring:
//   - Status cycle: not_started → in_progress → pending_decision → complete
//   - PATCH /api/action-items/[id] via api.actionItems.update
//   - Lifecycle hook surface: response carries spawned_reminders +
//     auto_closed_reminders, callers toast accordingly. The drawer just
//     forwards the updated item via onChanged.
//
// New from Claude Design's polish:
//   - KV metadata grid (Client / Category / Owner / Created / Duration)
//   - Origin note card when the item was promoted from a note
//   - Derivative-reminders placeholder card for long_running items
//   - "Mark complete" / "Reopen" primary action in the drawer footer
//
// data-api annotations preserved as `data-api` attributes per Phase 9
// convention.

import { Check, Clock, Link as LinkIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { api, isApiError } from "@/lib/api/client";
import type { ActionItem, ActionItemStatus, Note } from "@/lib/api/types";

const STATUS_CYCLE: ActionItemStatus[] = [
  "not_started",
  "in_progress",
  "pending_decision",
  "complete",
];

const STATUS_LABEL: Record<ActionItemStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  pending_decision: "Pending decision",
  complete: "Complete",
};

// Each status maps to a color from design-tokens.css (--s-*).
const STATUS_TONE: Record<
  ActionItemStatus,
  { fg: string; bg: string }
> = {
  not_started:      { fg: "var(--s-slate)", bg: "var(--s-slate-bg)" },
  in_progress:      { fg: "var(--s-blue)",  bg: "var(--s-blue-bg)" },
  pending_decision: { fg: "var(--s-amber)", bg: "var(--s-amber-bg)" },
  complete:         { fg: "var(--s-green)", bg: "var(--s-green-bg)" },
};

function nextStatus(s: ActionItemStatus): ActionItemStatus {
  const i = STATUS_CYCLE.indexOf(s);
  return STATUS_CYCLE[(i + 1) % STATUS_CYCLE.length];
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const day = Math.floor(Math.abs(ms) / 86_400_000);
  if (day === 0) return "today";
  const sign = ms > 0 ? "ago" : "from now";
  if (day < 7) return `${day}d ${sign}`;
  const wk = Math.floor(day / 7);
  if (wk < 4) return `${wk}w ${sign}`;
  const mo = Math.floor(day / 30);
  return `${mo}mo ${sign}`;
}

function ownerLabel(owner: string): string {
  if (owner === "client") return "Client";
  return owner;
}

interface Props {
  item: ActionItem | null;
  /** Linked note when the item was promoted from one. Caller looks
   *  this up server-side or via api.notes; null if not promoted. */
  linkedNote?: Note | null;
  /** Joined client name; caller passes from its own lookup. */
  clientHouseholdName?: string | null;
  /** Called when the drawer should close. */
  onClose: () => void;
  /** Called after a successful status mutation with the updated item.
   *  Lifecycle effects (spawned_reminders / auto_closed_reminders) are
   *  toasted internally; the parent only needs the updated item. */
  onChanged?: (updated: ActionItem) => void;
}

export function ActionItemDrawer({
  item,
  linkedNote,
  clientHouseholdName,
  onClose,
  onChanged,
}: Props) {
  const [busy, setBusy] = useState(false);

  if (!item) {
    return (
      <Sheet open={false} onOpenChange={(o) => !o && onClose()}>
        <SheetContent side="right" />
      </Sheet>
    );
  }

  async function mutate(targetStatus: ActionItemStatus) {
    if (!item) return;
    setBusy(true);
    try {
      const res = await api.actionItems.update(item.id, { status: targetStatus });
      onChanged?.(res.item);
      if (res.spawned_reminders && res.spawned_reminders.length > 0) {
        toast.success(`${res.spawned_reminders.length} reminder spawned`);
      }
      if (res.auto_closed_reminders > 0) {
        toast.success(`${res.auto_closed_reminders} reminder(s) auto-closed`);
      }
    } catch (e) {
      toast.error(isApiError(e) ? e.message : "Could not update item");
    } finally {
      setBusy(false);
    }
  }

  const statusTone = STATUS_TONE[item.status];

  return (
    <Sheet open={item !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-lg"
        style={{ background: "var(--surface)" }}
      >
        <SheetHeader
          className="border-b px-5 py-3"
          style={{ borderColor: "var(--border)" }}
        >
          <SheetTitle
            className="text-sm font-medium uppercase"
            style={{
              color: "var(--text-2)",
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.06em",
              fontSize: 12,
            }}
          >
            Action item
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {/* Status badge cluster — click status badge to cycle */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => mutate(nextStatus(item.status))}
                disabled={busy}
                className="cursor-pointer transition-opacity hover:opacity-85 disabled:cursor-not-allowed"
                title={`Click to advance to "${STATUS_LABEL[nextStatus(item.status)]}"`}
                data-api={`PATCH /api/action-items/${item.id}`}
              >
                <span
                  className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                  style={{
                    color: statusTone.fg,
                    background: statusTone.bg,
                  }}
                >
                  {STATUS_LABEL[item.status]}
                </span>
              </button>
              <Badge variant="outline" className="font-normal">
                {item.timing_bucket.replace(/_/g, " ")}
              </Badge>
              {item.partner_required ? (
                <Badge variant="outline" className="gap-1 font-normal">
                  <LinkIcon className="h-3 w-3" />
                  {item.partner_type ?? "Partner"} required
                </Badge>
              ) : null}
              {item.duration_class === "long_running" ? (
                <Badge variant="outline" className="gap-1 font-normal">
                  <Clock className="h-3 w-3" />
                  Long-running
                </Badge>
              ) : null}
            </div>
            <p
              className="text-base font-medium leading-snug"
              style={{ color: "var(--text)" }}
            >
              {item.description}
            </p>
          </div>

          <Separator />

          {/* KV metadata grid */}
          <dl
            className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-xs"
            style={{ color: "var(--text-2)" }}
          >
            <dt className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-3)" }}>
              Client
            </dt>
            <dd>
              <Link
                href={`/clients/${item.client_id}`}
                className="hover:underline"
                style={{ color: "var(--text)" }}
              >
                {clientHouseholdName ?? "—"}
              </Link>
            </dd>

            <dt className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-3)" }}>
              Category
            </dt>
            <dd style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}>
              {item.category}
            </dd>

            <dt className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-3)" }}>
              Owner
            </dt>
            <dd style={{ color: "var(--text)" }}>{ownerLabel(item.owner)}</dd>

            <dt className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-3)" }}>
              Created
            </dt>
            <dd style={{ color: "var(--text)" }}>{fmtDate(item.created_at)}</dd>

            {item.completed_at ? (
              <>
                <dt className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-3)" }}>
                  Completed
                </dt>
                <dd style={{ color: "var(--text)" }}>
                  {fmtDate(item.completed_at)}{" "}
                  <span style={{ color: "var(--text-3)" }}>
                    · {fmtRelative(item.completed_at)}
                  </span>
                </dd>
              </>
            ) : null}

            <dt className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-3)" }}>
              Duration
            </dt>
            <dd style={{ color: "var(--text-2)" }}>
              {item.duration_class.replace(/_/g, "-")}
            </dd>

            {item.is_derivative_reminder ? (
              <>
                <dt className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-3)" }}>
                  Origin
                </dt>
                <dd style={{ color: "var(--text-2)" }}>
                  Derivative reminder
                  {item.parent_action_item_id ? (
                    <>
                      {" "}from{" "}
                      <span style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}>
                        {item.parent_action_item_id.slice(0, 12)}…
                      </span>
                    </>
                  ) : null}
                </dd>
              </>
            ) : null}
          </dl>

          {/* Origin note card */}
          {linkedNote ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle
                  className="text-[11px] font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)" }}
                >
                  Origin note
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                <div
                  className="text-[11px]"
                  style={{ fontFamily: "var(--font-mono)", color: "var(--text-3)" }}
                >
                  {fmtDate(linkedNote.created_at)}
                  {linkedNote.tag ? ` · ${linkedNote.tag}` : ""}
                </div>
                <div className="text-sm" style={{ color: "var(--text)" }}>
                  {linkedNote.body}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {/* Derivative reminders placeholder for long-running items.
           * Phase 5d wired the spawn/auto-close on the API layer; this
           * panel surfaces the relationship in the drawer. The actual
           * derivative item, if spawned, appears in /action-items
           * filtered to parent_action_item_id. */}
          {item.duration_class === "long_running" && !item.is_derivative_reminder ? (
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle
                  className="text-[11px] font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)" }}
                >
                  Derivative reminders
                </CardTitle>
                <Badge variant="outline" className="font-normal">
                  Phase 5d
                </Badge>
              </CardHeader>
              <CardContent className="pt-0">
                <div
                  className="rounded p-3 text-[11px]"
                  style={{
                    background: "var(--surface-2)",
                    color: "var(--text-3)",
                    fontFamily: "var(--font-mono)",
                    border: "1px dashed var(--border-strong)",
                  }}
                >
                  When this item flips to <strong>in_progress</strong>, the
                  API spawns one weekly check-in reminder. Closing this
                  parent auto-closes the reminder.
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <SheetFooter
          className="flex-row items-center justify-between border-t px-5 py-3"
          style={{ borderColor: "var(--border)" }}
        >
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={busy}
            size="sm"
          >
            Close
          </Button>
          <div className="flex gap-2">
            {item.status !== "complete" ? (
              <Button
                type="button"
                size="sm"
                onClick={() => mutate("complete")}
                disabled={busy}
                data-api={`PATCH /api/action-items/${item.id}`}
              >
                <Check className="mr-1.5 h-3.5 w-3.5" />
                Mark complete
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => mutate("in_progress")}
                disabled={busy}
                data-api={`PATCH /api/action-items/${item.id}`}
              >
                Reopen
              </Button>
            )}
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
