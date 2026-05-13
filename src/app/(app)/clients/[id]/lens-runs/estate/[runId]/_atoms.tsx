"use client";

// Phase 14 — Shared atoms for the Estate Lens UI.
//
// MoneyInput / PctInput / NumberInput — cents-backed dollar input + percent
// + integer inputs styled to match PSA navy / cream.
//
// ComplianceFooter — renders the persistent compliance disclaimer on every
// tab and at the bottom of every PDF page.
//
// FormulaTooltip — surfaces the formula derivation for any calculated
// field. Renders as a small "?" icon that toggles a popover on click.
//
// OutputRow — labeled read-only output value with optional formula
// tooltip.

import { useState } from "react";
import { HelpCircle, X } from "lucide-react";

import { Input } from "@/components/ui/input";

// ────────────────────────────────────────────────────────────────────────
// Money input — cents-backed; user types whole dollars (with commas OK).
// ────────────────────────────────────────────────────────────────────────

export function MoneyInput({
  cents,
  onChange,
  placeholder,
  ariaLabel,
  className,
}: {
  cents: number;
  onChange: (cents: number) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const [raw, setRaw] = useState(cents === 0 ? "" : Math.round(cents / 100).toLocaleString("en-US"));
  return (
    <div className={`relative ${className ?? ""}`}>
      <span
        className="absolute left-2 top-1/2 -translate-y-1/2 text-sm"
        style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)" }}
      >
        $
      </span>
      <Input
        aria-label={ariaLabel}
        value={raw}
        placeholder={placeholder}
        inputMode="decimal"
        className="pl-6 font-mono text-[13px]"
        style={{ fontFamily: "var(--font-mono)" }}
        onChange={(e) => {
          const v = e.target.value.replace(/[^0-9.]/g, "");
          setRaw(v);
        }}
        onBlur={() => {
          const n = Number.parseFloat(raw.replace(/,/g, ""));
          const next = Number.isFinite(n) ? Math.round(n * 100) : 0;
          onChange(next);
          setRaw(next === 0 ? "" : Math.round(next / 100).toLocaleString("en-US"));
        }}
        onFocus={() => setRaw(raw.replace(/,/g, ""))}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Percent input — value is a number (e.g., 7 means 7%).
// ────────────────────────────────────────────────────────────────────────

export function PctInput({
  value,
  onChange,
  ariaLabel,
  step = 0.1,
  min = 0,
  max = 100,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  ariaLabel?: string;
  step?: number;
  min?: number;
  max?: number;
  className?: string;
}) {
  const [raw, setRaw] = useState(String(value));
  return (
    <div className={`relative ${className ?? ""}`}>
      <Input
        aria-label={ariaLabel}
        value={raw}
        inputMode="decimal"
        className="pr-7 font-mono text-[13px]"
        style={{ fontFamily: "var(--font-mono)" }}
        onChange={(e) => setRaw(e.target.value.replace(/[^0-9.]/g, ""))}
        onBlur={() => {
          const n = Number.parseFloat(raw);
          const safe = Number.isFinite(n) ? Math.min(Math.max(n, min), max) : 0;
          onChange(safe);
          setRaw(String(safe));
        }}
      />
      <span
        className="absolute right-2 top-1/2 -translate-y-1/2 text-sm"
        style={{ color: "var(--text-3)" }}
      >
        %
      </span>
      <input type="hidden" data-step={step} />
    </div>
  );
}

export function NumberInput({
  value,
  onChange,
  ariaLabel,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const [raw, setRaw] = useState(String(value));
  return (
    <Input
      aria-label={ariaLabel}
      value={raw}
      inputMode="numeric"
      className={`font-mono text-[13px] ${className ?? ""}`}
      style={{ fontFamily: "var(--font-mono)" }}
      onChange={(e) => setRaw(e.target.value.replace(/[^0-9]/g, ""))}
      onBlur={() => {
        const n = Number.parseInt(raw, 10);
        const safe = Number.isFinite(n) && n > 0 ? n : 0;
        onChange(safe);
        setRaw(String(safe));
      }}
    />
  );
}

// ────────────────────────────────────────────────────────────────────────
// Tiny stacked label — uppercase eyebrow above an input.
// ────────────────────────────────────────────────────────────────────────

export function FieldLabel({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="mb-1 text-[10px] uppercase"
      style={{
        color: "var(--text-3)",
        letterSpacing: "0.06em",
        fontFamily: "var(--font-mono)",
      }}
    >
      {children}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// FormulaTooltip — "?" icon that toggles a popover showing the formula.
// ────────────────────────────────────────────────────────────────────────

export function FormulaTooltip({
  title,
  formula,
  note,
}: {
  title: string;
  formula: string;
  note?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={`Show formula: ${title}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-[var(--surface-2)]"
        style={{ color: "var(--text-3)" }}
      >
        <HelpCircle className="h-3 w-3" />
      </button>
      {open ? (
        <>
          {/* click-away to close */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            className="absolute right-0 top-5 z-50 w-72 rounded-lg border p-3 shadow-lg"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border)",
            }}
          >
            <div className="mb-1.5 flex items-start justify-between gap-2">
              <h4
                className="text-[11px] font-semibold uppercase"
                style={{
                  color: "var(--text-2)",
                  letterSpacing: "0.06em",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {title}
              </h4>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded p-0.5 hover:bg-[var(--surface-2)]"
                style={{ color: "var(--text-3)" }}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <pre
              className="overflow-x-auto whitespace-pre-wrap text-[11px] leading-relaxed"
              style={{
                fontFamily: "var(--font-mono)",
                color: "var(--text)",
              }}
            >
              {formula}
            </pre>
            {note ? (
              <p
                className="mt-2 text-[11px] italic"
                style={{ color: "var(--text-3)" }}
              >
                {note}
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </span>
  );
}

// ────────────────────────────────────────────────────────────────────────
// OutputRow — labeled read-only output, optional formula tooltip.
// ────────────────────────────────────────────────────────────────────────

export function OutputRow({
  label,
  value,
  formula,
  highlight = false,
}: {
  label: string;
  value: string;
  formula?: { title: string; formula: string; note?: string };
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <span
          className="text-[10px] uppercase"
          style={{
            color: "var(--text-3)",
            letterSpacing: "0.06em",
            fontFamily: "var(--font-mono)",
          }}
        >
          {label}
        </span>
        {formula ? (
          <FormulaTooltip
            title={formula.title}
            formula={formula.formula}
            note={formula.note}
          />
        ) : null}
      </div>
      <span
        className="text-[13px]"
        style={{
          fontFamily: "var(--font-mono)",
          color: highlight ? "var(--gold)" : "var(--text)",
          fontWeight: highlight ? 600 : 500,
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// ComplianceFooter — persistent disclaimer at the bottom of every tab.
// ────────────────────────────────────────────────────────────────────────

const COMPLIANCE_BODY =
  "The information provided is not written or intended as specific tax or legal advice. " +
  "Neither PSA Wealth nor MassMutual, its subsidiaries, employees and representatives are " +
  "authorized to give tax or legal advice. Individuals are encouraged to seek advice from " +
  "their own tax or legal counsel. Calculations are planning estimates only. Verify all " +
  "figures with qualified tax counsel before client decisions.";

export function ComplianceFooter({ trackingId }: { trackingId: string }) {
  return (
    <div
      className="mt-8 border-t pt-4 text-[10px] leading-relaxed"
      style={{
        borderColor: "var(--border)",
        color: "var(--text-3)",
      }}
    >
      <p className="max-w-4xl">{COMPLIANCE_BODY}</p>
      <div
        className="mt-2 flex justify-end text-[9px]"
        style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.06em" }}
      >
        {trackingId}
      </div>
    </div>
  );
}

export const COMPLIANCE_DISCLAIMER_TEXT = COMPLIANCE_BODY;
