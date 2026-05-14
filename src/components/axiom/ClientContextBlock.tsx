"use client";

// Phase 18.4 — Client context paragraph display block.
//
// Renders the advisor-written narrative on the Client Overview. When
// the paragraph is null/empty, surfaces a muted prompt nudging the
// advisor to write one. The "Click to add" link is wired by the
// parent (passes onEditClick) — typically opens the Client Edit
// Dialog with focus on the context field.

import { Pencil } from "lucide-react";

export function ClientContextBlock({
  paragraph,
  updatedAt,
  onEditClick,
}: {
  paragraph: string | null;
  updatedAt: string | null;
  onEditClick?: () => void;
}) {
  if (!paragraph || paragraph.trim().length === 0) {
    return (
      <div
        className="rounded-md border border-dashed px-4 py-3 text-[13px]"
        style={{
          borderColor: "var(--border)",
          background: "var(--surface)",
          color: "var(--text-3)",
        }}
      >
        <p>
          <span style={{ color: "var(--text-2)" }}>
            Add a context paragraph about this client
          </span>
          <span> — it appears here for the team to orient quickly. </span>
          {onEditClick ? (
            <button
              type="button"
              onClick={onEditClick}
              className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
              style={{ color: "var(--psa-navy)" }}
            >
              <Pencil className="h-3 w-3" />
              Click to add
            </button>
          ) : null}
        </p>
      </div>
    );
  }
  return (
    <div
      className="rounded-md border px-5 py-4"
      style={{
        borderColor: "var(--border)",
        background: "var(--n-25)",
      }}
    >
      <p
        className="text-[15px] leading-relaxed"
        style={{
          color: "var(--text)",
          fontFamily: "var(--font-display)",
        }}
      >
        {paragraph}
      </p>
      <div
        className="mt-2 flex items-center justify-between gap-3 text-[11px]"
        style={{ color: "var(--text-3)" }}
      >
        <em>
          {updatedAt
            ? `Updated ${fmtRelativeShort(updatedAt)}`
            : "Just added"}
        </em>
        {onEditClick ? (
          <button
            type="button"
            onClick={onEditClick}
            className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
          >
            <Pencil className="h-2.5 w-2.5" />
            Edit
          </button>
        ) : null}
      </div>
    </div>
  );
}

function fmtRelativeShort(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const day = Math.floor(ms / 86_400_000);
  if (day < 1) return "today";
  if (day === 1) return "1 day ago";
  if (day < 7) return `${day} days ago`;
  const wk = Math.floor(day / 7);
  if (wk < 4) return `${wk}w ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}
