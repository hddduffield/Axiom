// Shared filter / saved-view chip primitive.
//
// Active-state token correction (Phase 9.13):
// styles.css has TWO conflicting `.chip.is-active` rules — line 138
// (`background: var(--accent)`) and line 511-513 (`background:
// var(--n-900); border-color: var(--n-900); color: #fff;`). Per CSS
// cascade, the later rule wins. The same `--n-900` (near-black
// #1a1a1a) is used by `.saved-view.is-active` (line 921) and
// `.bulk-bar` (line 1013) — design intent is "near-black for active
// emphasis," not navy.
//
// Phase 9.5/9.7/9.8 originally read only the line-138 rule and used
// `--accent` (navy) on every active chip. This primitive consolidates
// the three duplicate per-surface Chip definitions (clients,
// action-items, notes) and corrects the token.
//
// `--n-900` is hard-coded as #1a1a1a here to match design source
// directly; the value is also exposed as `--n-900` in design-tokens.css.

"use client";

import * as React from "react";

export interface ChipProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

export function Chip({ active, onClick, children }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors"
      style={{
        background: active ? "var(--n-900)" : "var(--surface)",
        borderColor: active ? "var(--n-900)" : "var(--border)",
        color: active ? "#ffffff" : "var(--text-2)",
      }}
    >
      {children}
    </button>
  );
}

// Mono count badge used inside chips. On active chips, the badge wraps
// in a white-tinted pill (per styles.css line 525:
// `.chip.is-active .chip__count { background: rgba(255,255,255,0.2);
// color: var(--n-0); }`). Caller signals via `onActive` since the chip
// itself owns the active state — keeps this primitive presentation-
// only.
export function Count({ n, onActive = false }: { n: number; onActive?: boolean }) {
  return (
    <span
      className="text-[10px]"
      style={{
        fontFamily: "var(--font-mono)",
        opacity: onActive ? 1 : 0.7,
        background: onActive ? "rgba(255,255,255,0.2)" : "transparent",
        padding: onActive ? "0 4px" : 0,
        borderRadius: onActive ? 999 : 0,
        color: onActive ? "#ffffff" : "inherit",
      }}
    >
      {n}
    </span>
  );
}
