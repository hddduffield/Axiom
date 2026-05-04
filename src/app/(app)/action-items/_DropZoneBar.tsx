"use client";

// Sticky drop-zone bar that animates in during drag (Phase 9.19).
//
// Two droppable targets stretch across the viewport bottom:
//   - LEFT  "Mark complete"   (green tint when hover)
//   - RIGHT "Move to backlog" (amber tint when hover)
//
// The bar is purely presentational + a useDroppable host; the parent
// DndContext owns drag state and PATCH dispatch.

import * as React from "react";
import { useDroppable } from "@dnd-kit/core";
import { Check, Undo2 } from "lucide-react";

export const DROP_COMPLETE_ID = "zone:complete";
export const DROP_BACKLOG_ID = "zone:backlog";

interface Props {
  /** When true the bar is mounted + visible; when false it slides out. */
  visible: boolean;
}

export function DropZoneBar({ visible }: Props) {
  const completeDrop = useDroppable({ id: DROP_COMPLETE_ID });
  const backlogDrop = useDroppable({ id: DROP_BACKLOG_ID });

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 transition-transform duration-200"
      style={{
        transform: visible ? "translateY(0)" : "translateY(110%)",
      }}
      aria-hidden={!visible}
    >
      <div
        className="pointer-events-auto grid w-full max-w-5xl grid-cols-2 gap-3 rounded-t-lg border-x border-t bg-[var(--surface)] p-3 shadow-lg"
        style={{ borderColor: "var(--border)" }}
      >
        <DropZone
          ref={completeDrop.setNodeRef}
          isOver={completeDrop.isOver}
          tone="complete"
          icon={<Check className="h-5 w-5" />}
          label="Mark complete"
          hint="Drop here to mark done"
        />
        <DropZone
          ref={backlogDrop.setNodeRef}
          isOver={backlogDrop.isOver}
          tone="backlog"
          icon={<Undo2 className="h-5 w-5" />}
          label="Move to backlog"
          hint="Drop here to send back to not-started"
        />
      </div>
    </div>
  );
}

const DropZone = React.forwardRef<
  HTMLDivElement,
  {
    isOver: boolean;
    tone: "complete" | "backlog";
    icon: React.ReactNode;
    label: string;
    hint: string;
  }
>(function DropZone({ isOver, tone, icon, label, hint }, ref) {
  const palette =
    tone === "complete"
      ? {
          bgIdle: "var(--surface-2)",
          bgHover: "var(--s-green-bg)",
          border: "var(--s-green)",
          fg: "var(--s-green)",
        }
      : {
          bgIdle: "var(--surface-2)",
          bgHover: "var(--s-amber-bg)",
          border: "var(--s-amber)",
          fg: "var(--s-amber)",
        };
  return (
    <div
      ref={ref}
      className="flex h-16 items-center justify-center gap-3 rounded-md border-2 border-dashed transition-colors"
      style={{
        background: isOver ? palette.bgHover : palette.bgIdle,
        borderColor: isOver ? palette.border : "var(--border)",
        color: isOver ? palette.fg : "var(--text-2)",
      }}
    >
      {icon}
      <div className="flex flex-col text-left">
        <span className="text-sm font-medium" style={{ color: "inherit" }}>
          {label}
        </span>
        <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
          {hint}
        </span>
      </div>
    </div>
  );
});
