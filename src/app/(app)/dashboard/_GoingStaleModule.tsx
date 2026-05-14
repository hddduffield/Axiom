"use client";

// Phase 17.8 — Going Stale dashboard module.
//
// Reads clients whose last_meaningful_contact_at is older than
// cadence_target_days (or has never been touched). Ranks by
// most-overdue-first. Click a row to navigate to /clients/[id].
//
// Server-side filtering happens in page.tsx (limits to active +
// prospect, and only those past their cadence threshold). This
// component renders the list and resolves the display copy.

import Link from "next/link";
import { ChevronRight, AlarmClock, CheckCircle2 } from "lucide-react";

import { PanelCard } from "@/components/axiom/PanelCard";
import { cadenceLabel } from "@/lib/cadence/defaults";

export interface StaleClientRow {
  id: string;
  household_name: string;
  cadence_target_days: number | null;
  cadence_custom_label: string | null;
  last_meaningful_contact_at: string | null;
  days_overdue: number; // computed server-side; >= 1 by definition
}

function fmtDays(d: number): string {
  if (d === 1) return "1 day overdue";
  return `${d} days overdue`;
}

function fmtLastContact(iso: string | null): string {
  if (!iso) return "Never contacted";
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days < 1) return "Last touch today";
  if (days === 1) return "Last touch 1 day ago";
  if (days < 7) return `Last touch ${days} days ago`;
  const wk = Math.floor(days / 7);
  if (wk < 4) return `Last touch ${wk} weeks ago`;
  const mo = Math.floor(days / 30);
  if (mo < 12) return `Last touch ${mo} months ago`;
  return `Last touch ${new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" })}`;
}

export function GoingStaleModule({ rows }: { rows: StaleClientRow[] }) {
  return (
    <PanelCard
      title="Going stale"
      count={rows.length > 0 ? rows.length : undefined}
      action={
        <span
          className="text-[11px]"
          style={{ color: "var(--text-3)" }}
        >
          Clients past their contact cadence
        </span>
      }
    >
      {rows.length === 0 ? (
        <div
          className="flex items-center gap-2 px-4 py-6 text-sm"
          style={{ color: "var(--text-2)" }}
        >
          <CheckCircle2 className="h-4 w-4" style={{ color: "var(--s-green)" }} />
          <span>All clients on cadence — nothing overdue.</span>
        </div>
      ) : (
        <ul
          className="divide-y"
          style={{ borderColor: "var(--border)" }}
        >
          {rows.map((r) => {
            // Tone scales with severity. >= 30 days late = amber, >= 60 = red.
            const severe = r.days_overdue >= 60;
            const warn = r.days_overdue >= 30;
            const dotColor = severe
              ? "var(--s-red)"
              : warn
                ? "var(--s-amber)"
                : "var(--s-slate)";
            return (
              <li
                key={r.id}
                className="divide-y"
                style={{ borderColor: "var(--border)" }}
              >
                <Link
                  href={`/clients/${r.id}`}
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--surface-2)]"
                >
                  <AlarmClock
                    className="h-3.5 w-3.5 flex-none"
                    style={{ color: dotColor }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span
                        className="truncate text-[13px] font-medium"
                        style={{ color: "var(--text)" }}
                      >
                        {r.household_name.replace(/ Family$/, "")}
                      </span>
                      <span
                        className="text-[11px] uppercase"
                        style={{
                          color: dotColor,
                          letterSpacing: "0.04em",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {fmtDays(r.days_overdue)}
                      </span>
                    </div>
                    <div
                      className="mt-0.5 flex items-center gap-2 text-[11px]"
                      style={{ color: "var(--text-3)" }}
                    >
                      <span>{fmtLastContact(r.last_meaningful_contact_at)}</span>
                      <span>·</span>
                      <span>
                        {cadenceLabel(
                          r.cadence_target_days,
                          r.cadence_custom_label,
                        )}{" "}
                        cadence
                      </span>
                    </div>
                  </div>
                  <ChevronRight
                    className="h-4 w-4 flex-none"
                    style={{ color: "var(--text-3)" }}
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </PanelCard>
  );
}
