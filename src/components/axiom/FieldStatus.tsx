"use client";

// Phase 16.3 — small inline badge rendered next to lens-input field labels
// to surface source provenance:
//   - "From plan"  — pre-filled by the extractor, still unchanged
//   - "Edited"     — pre-filled but the advisor has changed it
//   - (no badge)   — unsourced (manual entry only)
//
// Subtle by design — a 9pt mono dot + label. Doesn't draw the eye away
// from the field value itself.

import { FileText, Pencil } from "lucide-react";

interface Props {
  sourced: boolean;
  edited: boolean;
}

export function FieldStatus({ sourced, edited }: Props) {
  if (!sourced && !edited) return null;
  if (edited) {
    return (
      <span
        className="inline-flex items-center gap-1 text-[9px] uppercase"
        style={{
          color: "var(--text-3)",
          letterSpacing: "0.06em",
          fontFamily: "var(--font-mono)",
        }}
        title="Edited — refresh from plan won't overwrite this field"
      >
        <Pencil className="h-2.5 w-2.5" />
        edited
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-[9px] uppercase"
      style={{
        color: "var(--gold)",
        letterSpacing: "0.06em",
        fontFamily: "var(--font-mono)",
        opacity: 0.8,
      }}
      title="Pre-filled from the latest finalized plan"
    >
      <FileText className="h-2.5 w-2.5" />
      from plan
    </span>
  );
}
