"use client";

// Shared action item card — used by the kanban advisor columns, the
// backlog list below, and the completed column when the toggle is on.
//
// Phase 9.18 ships the static visual (description + client + timing +
// category + partner-blocked + long-running tags). Phase 9.19 adds
// the draggable wrapper via @dnd-kit/core's useDraggable hook.

import { Link as LinkIcon } from "lucide-react";
import * as React from "react";
import type { ActionItem } from "@/lib/api/types";

export interface ActionCardProps {
  item: ActionItem;
  clientName: string | null;
  onClick?: () => void;
  /** When true the card paints in muted/strike-through tone (used by the
   *  read-only Completed column). */
  completed?: boolean;
  /** Compact variant for the backlog list — drops the trailing tag row
   *  to keep rows scannable in tabular density. */
  compact?: boolean;
  /** Phase 11.5.1 — when true the card belongs to an archived client and
   *  renders muted (opacity 0.65) so the advisor can see at a glance
   *  which items are from archived households when the "Include
   *  archived" toggle is on. */
  archived?: boolean;
}

function withoutFamily(name: string | null): string {
  if (!name) return "—";
  return name.replace(/ Family$/, "");
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function TimingBadge({ bucket }: { bucket: string | null }) {
  if (!bucket) return null;
  const tone =
    bucket === "overdue"
      ? { fg: "var(--s-red)", bg: "var(--s-red-bg)" }
      : bucket === "this_week"
        ? { fg: "var(--s-amber)", bg: "var(--s-amber-bg)" }
        : { fg: "var(--s-slate)", bg: "var(--s-slate-bg)" };
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px]"
      style={{ background: tone.bg, color: tone.fg }}
    >
      {bucket.replace(/_/g, " ")}
    </span>
  );
}

export const ActionCard = React.forwardRef<HTMLDivElement, ActionCardProps>(
  function ActionCard(
    { item, clientName, onClick, completed, compact, archived },
    ref,
  ) {
    const partnerBlocked = item.partner_required && item.partner_type;
    const longRunning = item.duration_class === "long_running";
    // completed wins over archived for opacity (more visually distinctive
    // and is the existing pattern). Otherwise apply the archived mute.
    const opacity = completed ? 0.55 : archived ? 0.65 : undefined;
    return (
      <div
        ref={ref}
        onClick={onClick}
        className="group cursor-pointer rounded-md border bg-[var(--surface)] p-3 transition-colors hover:border-[var(--text-3)]"
        style={{
          borderColor: "var(--border)",
          opacity,
        }}
      >
        <p
          className="text-[13px] leading-snug"
          style={{
            color: "var(--text)",
            fontWeight: 500,
            textDecoration: completed ? "line-through" : undefined,
          }}
        >
          {truncate(item.description, 80)}
        </p>
        <div
          className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]"
          style={{ color: "var(--text-3)" }}
        >
          <span style={{ color: "var(--text-2)" }}>
            {withoutFamily(clientName)}
          </span>
          <span>·</span>
          <span
            className="uppercase"
            style={{ letterSpacing: "0.04em" }}
          >
            {item.category.toLowerCase()}
          </span>
        </div>
        {compact ? null : (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <TimingBadge bucket={item.timing_bucket} />
            {longRunning ? (
              <span
                className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px]"
                style={{
                  background: "var(--surface-2)",
                  color: "var(--text-3)",
                }}
              >
                long-running
              </span>
            ) : null}
            {partnerBlocked ? (
              <span
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]"
                style={{
                  background: "var(--surface-2)",
                  color: "var(--text-3)",
                }}
              >
                <LinkIcon className="h-2.5 w-2.5" />
                {item.partner_type?.toLowerCase()}-blocked
              </span>
            ) : null}
          </div>
        )}
      </div>
    );
  },
);
