"use client";

// Phase 17.2 — Cadence picker.
//
// Shared between the New Client dialog and the Client Edit dialog. The
// preset dropdown surfaces Monthly / Bi-Monthly / Quarterly /
// Semi-Annually / Annually plus "Custom", and Custom reveals a numeric
// input for an arbitrary day count.
//
// State shape: a single integer in days (or null when unset). The
// "Custom" preset is selected automatically when the integer doesn't
// match any preset.

import { useEffect, useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { CADENCE_PRESETS } from "@/lib/cadence/defaults";

const CUSTOM_SENTINEL = "custom";

function isPreset(days: number | null | undefined): boolean {
  if (days == null) return false;
  return CADENCE_PRESETS.some((p) => p.days === days);
}

export function CadencePicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  const initialMode: "preset" | "custom" =
    value == null || isPreset(value) ? "preset" : "custom";
  const [mode, setMode] = useState<"preset" | "custom">(initialMode);
  const [customInput, setCustomInput] = useState<string>(
    initialMode === "custom" && value != null ? String(value) : "",
  );

  // Re-sync when the upstream value changes (e.g. dialog re-opens with a
  // different client's existing cadence).
  useEffect(() => {
    if (value == null || isPreset(value)) {
      setMode("preset");
    } else {
      setMode("custom");
      setCustomInput(String(value));
    }
  }, [value]);

  function onSelectChange(next: string | null) {
    if (next === CUSTOM_SENTINEL) {
      setMode("custom");
      // Carry forward the current value (or default to 45 days) into the
      // custom input so users see something sensible immediately.
      const seed = value && !isPreset(value) ? value : value ?? 45;
      setCustomInput(String(seed));
      onChange(seed);
      return;
    }
    const days = next ? Number(next) : NaN;
    if (Number.isFinite(days) && days > 0) {
      setMode("preset");
      onChange(days);
    }
  }

  function onCustomChange(raw: string) {
    setCustomInput(raw);
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0 && Number.isInteger(n)) {
      onChange(n);
    }
  }

  const selectValue =
    mode === "custom" ? CUSTOM_SENTINEL : value != null ? String(value) : "";

  return (
    <div className="flex flex-col gap-2">
      <Select value={selectValue} onValueChange={onSelectChange}>
        <SelectTrigger>
          <SelectValue placeholder="Pick a cadence" />
        </SelectTrigger>
        <SelectContent>
          {CADENCE_PRESETS.map((p) => (
            <SelectItem key={p.days} value={String(p.days)}>
              {p.label}{" "}
              <span style={{ color: "var(--text-3)" }}>· every {p.days} days</span>
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM_SENTINEL}>Custom</SelectItem>
        </SelectContent>
      </Select>
      {mode === "custom" ? (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            max={3650}
            value={customInput}
            onChange={(e) => onCustomChange(e.target.value)}
            placeholder="Days"
            className="w-28"
          />
          <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
            days between expected contacts
          </span>
        </div>
      ) : null}
    </div>
  );
}
