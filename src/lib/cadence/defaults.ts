// Phase 17.1 — Cadence defaults by archetype + display labels.
//
// Each PSA Wealth client has an expected contact cadence in days. The
// default is derived from the client's lifecycle archetype:
//   PRE  — Pre-Liquidity:  Monthly  (active transition prep)
//   MID  — Mid-Transition: Every 3 weeks (live transaction)
//   POST — Post-Liquidity: Bi-Monthly (stabilized, less hands-on)
//   NONE — No active transition: Quarterly default
//
// The Going Stale dashboard module (Phase 17.8) and per-client cadence
// editor (Phase 17.2) both read from this table. Custom integer cadences
// are allowed via the Custom option in the cadence picker.

import type { ClientArchetype } from "@/lib/supabase/database.types";

export const CADENCE_DEFAULTS_BY_ARCHETYPE: Record<
  ClientArchetype,
  number
> = {
  PRE: 30, // Monthly during transition prep
  MID: 21, // Every 3 weeks during active transaction
  POST: 60, // Every 2 months once stabilized
  NONE: 90, // Quarterly default
};

// Default for clients with no archetype set (newly created prospects, etc.)
export const CADENCE_DEFAULT_FALLBACK = 90;

// Preset day-counts surfaced in the UI dropdown.
export const CADENCE_PRESETS: ReadonlyArray<{
  days: number;
  label: string;
}> = [
  { days: 30, label: "Monthly" },
  { days: 60, label: "Bi-Monthly" },
  { days: 90, label: "Quarterly" },
  { days: 180, label: "Semi-Annually" },
  { days: 365, label: "Annually" },
];

// Quick reverse lookup for label display.
export const CADENCE_LABELS: Record<number, string> = Object.fromEntries(
  CADENCE_PRESETS.map((p) => [p.days, p.label]),
);

export function defaultCadenceForArchetype(
  archetype: ClientArchetype | null | undefined,
): number {
  if (!archetype) return CADENCE_DEFAULT_FALLBACK;
  return CADENCE_DEFAULTS_BY_ARCHETYPE[archetype] ?? CADENCE_DEFAULT_FALLBACK;
}

export function cadenceLabel(
  days: number | null | undefined,
  customLabel?: string | null,
): string {
  if (days == null) return "Not set";
  if (customLabel) return customLabel;
  const preset = CADENCE_LABELS[days];
  if (preset) return preset;
  return `Every ${days} days`;
}
