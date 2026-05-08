"use client";

// Phase 13.2 — Cash Flow Lens Input tab. Sections A through I.
//
// Two-column layout on wide screens. Each Section is its own card so the
// form scans top-to-bottom. AI suggestion button lives in Section H
// (Allocation) per spec.

import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PanelCard } from "@/components/axiom/PanelCard";
import { api, isApiError } from "@/lib/api/client";
import {
  BUCKET_PRESETS,
  BUCKET_PRESETS_BY_ID,
  availableMonthlyAllocationCents,
  cryptoId,
  emergencyFundFunded,
  emergencyFundTargetCents,
  netIncomeAnnualCents,
  netIncomeMonthlyCents,
  type CashFlowBucket,
  type CashFlowLensOutput,
  type TaxTreatment,
  type TimeHorizon,
} from "@/lib/api/cash_flow_lens";
import type { LensRun } from "@/lib/api/types";

interface Props {
  lensId: string;
  output: CashFlowLensOutput;
  onChange: (next: CashFlowLensOutput) => void;
  onSaveDraft: () => void;
  onFinalize: () => void;
  savingDraft: boolean;
  finalizing: boolean;
  onAiUpdated: (updated: LensRun) => void;
}

// ────────────────────────────────────────────────────────────────────────
// Money input (cents-backed). Renders as a $-prefixed dollar field; user
// types whole dollars.
// ────────────────────────────────────────────────────────────────────────

function MoneyInput({
  cents,
  onChange,
  placeholder,
  ariaLabel,
}: {
  cents: number;
  onChange: (c: number) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [raw, setRaw] = useState(cents === 0 ? "" : (cents / 100).toString());
  return (
    <div className="relative">
      <span
        className="absolute left-2 top-1/2 -translate-y-1/2 text-sm"
        style={{ color: "var(--text-3)" }}
      >
        $
      </span>
      <Input
        aria-label={ariaLabel}
        value={raw}
        placeholder={placeholder}
        inputMode="decimal"
        onChange={(e) => {
          const v = e.target.value.replace(/[^0-9.]/g, "");
          setRaw(v);
        }}
        onBlur={() => {
          const n = Number.parseFloat(raw);
          const next = Number.isFinite(n) ? Math.round(n * 100) : 0;
          onChange(next);
          // Re-format to a clean string.
          setRaw(next === 0 ? "" : (next / 100).toString());
        }}
        className="pl-6"
        style={{ fontFamily: "var(--font-mono)" }}
      />
    </div>
  );
}

function PercentInput({
  pct,
  onChange,
  ariaLabel,
  max = 100,
}: {
  pct: number;
  onChange: (p: number) => void;
  ariaLabel?: string;
  max?: number;
}) {
  const [raw, setRaw] = useState(pct.toString());
  return (
    <div className="relative">
      <Input
        aria-label={ariaLabel}
        value={raw}
        inputMode="decimal"
        onChange={(e) => setRaw(e.target.value.replace(/[^0-9.]/g, ""))}
        onBlur={() => {
          const n = Number.parseFloat(raw);
          const next = Number.isFinite(n) ? Math.min(Math.max(n, 0), max) : 0;
          onChange(next);
          setRaw(next.toString());
        }}
        className="pr-7"
        style={{ fontFamily: "var(--font-mono)" }}
      />
      <span
        className="absolute right-2 top-1/2 -translate-y-1/2 text-sm"
        style={{ color: "var(--text-3)" }}
      >
        %
      </span>
    </div>
  );
}

function fmtCents(c: number): string {
  if (c === 0) return "$0";
  return `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

// ────────────────────────────────────────────────────────────────────────

export function CashFlowInputTab({
  lensId,
  output,
  onChange,
  onSaveDraft,
  onFinalize,
  savingDraft,
  finalizing,
  onAiUpdated,
}: Props) {
  // ── Section toggle states ───────────────────────────────────────────
  const [clientInfoOpen, setClientInfoOpen] = useState(false);
  const [aiAllocLoading, setAiAllocLoading] = useState(false);
  const [addBucketOpen, setAddBucketOpen] = useState(false);

  // Computed values (always derived from `output`)
  const netAnnual = netIncomeAnnualCents(output);
  const netMonthly = netIncomeMonthlyCents(output);
  const efTargetCents = emergencyFundTargetCents(output);
  const efFunded = emergencyFundFunded(output);
  const efMonthsRemaining =
    efTargetCents <= output.emergency_fund.current_balance_cents
      ? 0
      : Math.ceil(
          (efTargetCents - output.emergency_fund.current_balance_cents) /
            Math.max(output.emergency_fund.monthly_contribution_cents, 1),
        );
  const availableMo = availableMonthlyAllocationCents(output);
  const allocationTotalPct = Object.values(output.allocation_pct).reduce(
    (a, b) => a + b,
    0,
  );

  // ── Mutators ────────────────────────────────────────────────────────
  const set = useCallback(
    (patch: Partial<CashFlowLensOutput>) => {
      onChange({ ...output, ...patch });
    },
    [onChange, output],
  );

  const setEf = useCallback(
    (patch: Partial<CashFlowLensOutput["emergency_fund"]>) => {
      onChange({
        ...output,
        emergency_fund: { ...output.emergency_fund, ...patch },
      });
    },
    [onChange, output],
  );

  const setAssumption = useCallback(
    <K extends keyof CashFlowLensOutput["assumptions"]>(
      key: K,
      value: CashFlowLensOutput["assumptions"][K],
    ) => {
      onChange({
        ...output,
        assumptions: { ...output.assumptions, [key]: value },
      });
    },
    [onChange, output],
  );

  const updateBucket = useCallback(
    (bucketId: string, patch: Partial<CashFlowBucket>) => {
      onChange({
        ...output,
        buckets: output.buckets.map((b) =>
          b.id === bucketId ? { ...b, ...patch } : b,
        ),
      });
    },
    [onChange, output],
  );

  const removeBucket = useCallback(
    (bucketId: string) => {
      const nextAlloc = { ...output.allocation_pct };
      delete nextAlloc[bucketId];
      onChange({
        ...output,
        buckets: output.buckets.filter((b) => b.id !== bucketId),
        allocation_pct: nextAlloc,
      });
    },
    [onChange, output],
  );

  const addBucket = useCallback(
    (preset: typeof BUCKET_PRESETS[number] | null, customName?: string) => {
      const order = output.buckets.length;
      const newBucket: CashFlowBucket = preset
        ? {
            id: cryptoId(),
            name: preset.name,
            preset_id: preset.id,
            tax_treatment: preset.tax_treatment,
            current_balance_cents: 0,
            monthly_contribution_target_cents: 0,
            description: preset.description,
            sort_order: order,
          }
        : {
            id: cryptoId(),
            name: customName ?? "Custom Bucket",
            preset_id: null,
            tax_treatment: "taxable",
            current_balance_cents: 0,
            monthly_contribution_target_cents: 0,
            description: "Custom bucket — advisor-defined.",
            sort_order: order,
          };
      onChange({ ...output, buckets: [...output.buckets, newBucket] });
      setAddBucketOpen(false);
    },
    [onChange, output],
  );

  const setAllocation = useCallback(
    (bucketId: string, pct: number) => {
      onChange({
        ...output,
        allocation_pct: { ...output.allocation_pct, [bucketId]: pct },
      });
    },
    [onChange, output],
  );

  const updateHorizon = useCallback(
    (horizonId: string, patch: Partial<TimeHorizon>) => {
      onChange({
        ...output,
        time_horizons: output.time_horizons.map((h) =>
          h.id === horizonId ? { ...h, ...patch } : h,
        ),
      });
    },
    [onChange, output],
  );

  const removeHorizon = useCallback(
    (horizonId: string) => {
      onChange({
        ...output,
        time_horizons: output.time_horizons.filter((h) => h.id !== horizonId),
      });
    },
    [onChange, output],
  );

  const addHorizon = useCallback(() => {
    if (output.time_horizons.length >= 5) return;
    const currentYear = new Date().getFullYear();
    onChange({
      ...output,
      time_horizons: [
        ...output.time_horizons,
        {
          id: cryptoId(),
          type: "year",
          year: currentYear + 1,
          label: "1 year",
        },
      ],
    });
  }, [onChange, output]);

  // ── AI suggest allocation ──────────────────────────────────────────
  const requestAiAllocation = useCallback(async () => {
    setAiAllocLoading(true);
    try {
      // Save current state first so the server has the latest buckets.
      await api.lensRuns.cashFlow.update(lensId, { output });
      const updated = await api.lensRuns.cashFlow.suggestAllocation(lensId);
      onAiUpdated(updated);
      toast.success("AI allocation generated");
    } catch (e) {
      const msg = isApiError(e) ? e.message : "AI suggestion failed";
      toast.error(msg);
    } finally {
      setAiAllocLoading(false);
    }
  }, [lensId, output, onAiUpdated]);

  const aiAllocation = output.ai_suggestions.allocation;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* ── Section A: Client info ────────────────────────────────── */}
      <PanelCard
        title="Client info"
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setClientInfoOpen((o) => !o)}
          >
            {clientInfoOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            {clientInfoOpen ? "Collapse" : "Expand"}
          </Button>
        }
      >
        {clientInfoOpen ? (
          <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-[13px]">
            <dt style={{ color: "var(--text-3)" }}>Household</dt>
            <dd style={{ color: "var(--text)" }}>
              {output.client_snapshot.household_name}
            </dd>
            <dt style={{ color: "var(--text-3)" }}>Archetype</dt>
            <dd style={{ color: "var(--text)" }}>
              {output.client_snapshot.archetype ?? "—"}
            </dd>
            <dt style={{ color: "var(--text-3)" }}>Age</dt>
            <dd>
              <Input
                type="number"
                value={output.client_snapshot.age ?? ""}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value, 10);
                  set({
                    client_snapshot: {
                      ...output.client_snapshot,
                      age: Number.isFinite(n) ? n : null,
                    },
                  });
                }}
                className="w-24"
                style={{ fontFamily: "var(--font-mono)" }}
              />
            </dd>
          </dl>
        ) : (
          <p className="text-[13px]" style={{ color: "var(--text-2)" }}>
            {output.client_snapshot.household_name}
            {output.client_snapshot.archetype
              ? ` · ${output.client_snapshot.archetype}`
              : ""}
            {output.client_snapshot.age
              ? ` · age ${output.client_snapshot.age}`
              : ""}
          </p>
        )}
      </PanelCard>

      {/* ── Section B: Income & expenses ──────────────────────────── */}
      <PanelCard title="Income &amp; expenses">
        <div className="flex flex-col gap-3">
          <div>
            <Label className="text-[12px]">Gross income (annual)</Label>
            <MoneyInput
              cents={output.gross_income_annual_cents}
              onChange={(v) => set({ gross_income_annual_cents: v })}
              ariaLabel="Gross income annual"
            />
            <p className="mt-1 text-[11px]" style={{ color: "var(--text-3)" }}>
              {fmtCents(Math.round(output.gross_income_annual_cents / 12))} / mo
            </p>
          </div>
          <div>
            <Label className="text-[12px]">Total expenses (annual)</Label>
            <MoneyInput
              cents={output.expenses_annual_cents}
              onChange={(v) => set({ expenses_annual_cents: v })}
              ariaLabel="Expenses annual"
            />
            <p className="mt-1 text-[11px]" style={{ color: "var(--text-3)" }}>
              {fmtCents(Math.round(output.expenses_annual_cents / 12))} / mo
            </p>
          </div>
          <div
            className="rounded-md border p-3"
            style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
          >
            <div className="text-[11px] uppercase" style={{ color: "var(--text-3)", letterSpacing: "0.06em" }}>
              Net income
            </div>
            <div
              className="mt-0.5 text-2xl font-medium"
              style={{ fontFamily: "var(--font-display)", color: netAnnual >= 0 ? "var(--text)" : "var(--s-red)" }}
            >
              {fmtCents(netAnnual)}
            </div>
            <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
              {fmtCents(netMonthly)} / mo
            </p>
          </div>
        </div>
      </PanelCard>

      {/* ── Section C: Goals ──────────────────────────────────────── */}
      <PanelCard title="Goals">
        <Textarea
          value={output.goals_narrative}
          onChange={(e) => set({ goals_narrative: e.target.value })}
          className="min-h-[80px]"
          aria-label="Goals narrative"
        />
        <p className="mt-2 text-[11px]" style={{ color: "var(--text-3)" }}>
          Default narrative loaded; edit freely. Used by AI prompts and PDF export.
        </p>
      </PanelCard>

      {/* ── Section D: Emergency fund ─────────────────────────────── */}
      <PanelCard title="Emergency fund">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-[12px]">Target months</Label>
            <Input
              type="number"
              min={0}
              max={36}
              value={output.emergency_fund.target_months}
              onChange={(e) => {
                const n = Number.parseInt(e.target.value, 10);
                setEf({ target_months: Number.isFinite(n) ? n : 0 });
              }}
              style={{ fontFamily: "var(--font-mono)" }}
            />
          </div>
          <div>
            <Label className="text-[12px]">Current balance</Label>
            <MoneyInput
              cents={output.emergency_fund.current_balance_cents}
              onChange={(v) => setEf({ current_balance_cents: v })}
              ariaLabel="Emergency fund balance"
            />
          </div>
          <div>
            <Label className="text-[12px]">Monthly contribution</Label>
            <MoneyInput
              cents={output.emergency_fund.monthly_contribution_cents}
              onChange={(v) => setEf({ monthly_contribution_cents: v })}
              ariaLabel="Emergency fund monthly contribution"
            />
          </div>
          <div className="flex flex-col justify-center">
            <span
              className="inline-flex items-center justify-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium uppercase"
              style={{
                background: efFunded
                  ? "var(--s-green-bg)"
                  : efMonthsRemaining > 0
                    ? "var(--s-blue-bg)"
                    : "var(--s-slate-bg)",
                color: efFunded
                  ? "var(--s-green)"
                  : efMonthsRemaining > 0
                    ? "var(--s-blue)"
                    : "var(--s-slate)",
                letterSpacing: "0.06em",
              }}
            >
              {efFunded ? "Funded" : efMonthsRemaining > 0 ? "In progress" : "Not started"}
            </span>
            <p className="mt-1 text-center text-[11px]" style={{ color: "var(--text-3)" }}>
              {efMonthsRemaining > 0 ? `${efMonthsRemaining} mo to fund` : `target ${fmtCents(efTargetCents)}`}
            </p>
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
          <div
            className="h-full transition-all"
            style={{
              width: `${Math.min(
                Math.round(
                  (output.emergency_fund.current_balance_cents / Math.max(efTargetCents, 1)) * 100,
                ),
                100,
              )}%`,
              background: efFunded ? "var(--s-green)" : "var(--s-blue)",
            }}
          />
        </div>
      </PanelCard>

      {/* ── Section E: Time horizons ──────────────────────────────── */}
      <PanelCard
        title="Time horizons"
        count={output.time_horizons.length}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={addHorizon}
            disabled={output.time_horizons.length >= 5}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add
          </Button>
        }
      >
        <div className="flex flex-col gap-2">
          {output.time_horizons.map((h) => (
            <HorizonRow
              key={h.id}
              horizon={h}
              onUpdate={(patch) => updateHorizon(h.id, patch)}
              onRemove={() => removeHorizon(h.id)}
            />
          ))}
          {output.time_horizons.length === 0 ? (
            <p className="text-[12px]" style={{ color: "var(--text-3)" }}>
              No horizons yet. Add up to 5.
            </p>
          ) : null}
        </div>
      </PanelCard>

      {/* ── Section F: Assumptions ────────────────────────────────── */}
      <PanelCard title="Assumptions" className="lg:col-span-2">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-3">
          <RateRow
            label="Taxable growth"
            rate={output.assumptions.growth_rate_taxable}
            onChange={(v) => setAssumption("growth_rate_taxable", v)}
          />
          <RateRow
            label="Tax-deferred growth"
            rate={output.assumptions.growth_rate_tax_deferred}
            onChange={(v) => setAssumption("growth_rate_tax_deferred", v)}
          />
          <RateRow
            label="Tax-free growth"
            rate={output.assumptions.growth_rate_tax_free}
            onChange={(v) => setAssumption("growth_rate_tax_free", v)}
          />
          <RateRow
            label="Emergency fund growth"
            rate={output.assumptions.growth_rate_emergency}
            onChange={(v) => setAssumption("growth_rate_emergency", v)}
          />
          <RateRow
            label="Inflation"
            rate={output.assumptions.inflation_rate}
            onChange={(v) => setAssumption("inflation_rate", v)}
          />
          <RateRow
            label="Effective tax rate (now)"
            rate={output.assumptions.effective_tax_rate_now}
            onChange={(v) => setAssumption("effective_tax_rate_now", v)}
          />
          <RateRow
            label="Effective tax rate (retirement)"
            rate={output.assumptions.effective_tax_rate_retirement}
            onChange={(v) => setAssumption("effective_tax_rate_retirement", v)}
          />
          <RateRow
            label="Capital gains rate"
            rate={output.assumptions.capital_gains_rate}
            onChange={(v) => setAssumption("capital_gains_rate", v)}
          />
          <div>
            <Label className="text-[12px]">Retirement age</Label>
            <Input
              type="number"
              value={output.assumptions.retirement_age}
              onChange={(e) => {
                const n = Number.parseInt(e.target.value, 10);
                setAssumption("retirement_age", Number.isFinite(n) ? n : 65);
              }}
              style={{ fontFamily: "var(--font-mono)" }}
            />
          </div>
          <div className="md:col-span-2">
            <Label className="text-[12px]">Retirement income target (annual)</Label>
            <MoneyInput
              cents={output.assumptions.retirement_income_target_annual_cents}
              onChange={(v) =>
                setAssumption("retirement_income_target_annual_cents", v)
              }
              ariaLabel="Retirement income target"
            />
          </div>
        </div>
      </PanelCard>

      {/* ── Section G: Buckets ────────────────────────────────────── */}
      <PanelCard
        title="Buckets"
        count={output.buckets.length}
        className="lg:col-span-2"
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAddBucketOpen(true)}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add bucket
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          {output.buckets
            .slice()
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((b) => (
              <BucketCard
                key={b.id}
                bucket={b}
                onUpdate={(patch) => updateBucket(b.id, patch)}
                onRemove={() => removeBucket(b.id)}
              />
            ))}
        </div>

        {addBucketOpen ? (
          <AddBucketDialog
            existingPresetIds={new Set(output.buckets.map((b) => b.preset_id).filter((p): p is string => !!p))}
            onClose={() => setAddBucketOpen(false)}
            onAdd={addBucket}
          />
        ) : null}
      </PanelCard>

      {/* ── Section H: Allocation ─────────────────────────────────── */}
      <PanelCard
        title="Allocation"
        className="lg:col-span-2"
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={requestAiAllocation}
            disabled={aiAllocLoading || output.buckets.length === 0}
          >
            {aiAllocLoading ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            )}
            AI suggest allocation
          </Button>
        }
      >
        <div className="mb-3 flex items-center justify-between gap-4 rounded-md border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
          <div>
            <div className="text-[11px] uppercase" style={{ color: "var(--text-3)", letterSpacing: "0.06em" }}>
              Available to allocate
            </div>
            <div className="text-2xl font-medium" style={{ fontFamily: "var(--font-display)" }}>
              {fmtCents(availableMo)} <span className="text-[12px]" style={{ color: "var(--text-3)" }}>/ mo</span>
            </div>
            <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
              Net monthly minus EF contribution while funding.
            </p>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase" style={{ color: "var(--text-3)", letterSpacing: "0.06em" }}>
              Total %
            </div>
            <div
              className="text-2xl font-medium"
              style={{
                fontFamily: "var(--font-display)",
                color:
                  allocationTotalPct === 100
                    ? "var(--s-green)"
                    : "var(--s-amber)",
              }}
            >
              {allocationTotalPct}%
            </div>
            {allocationTotalPct !== 100 ? (
              <p className="text-[11px]" style={{ color: "var(--s-amber)" }}>
                Must equal 100%
              </p>
            ) : null}
          </div>
        </div>

        <table className="w-full text-[13px]">
          <thead style={{ color: "var(--text-3)" }}>
            <tr className="border-b" style={{ borderColor: "var(--border)" }}>
              <th className="px-2 py-1.5 text-left text-[11px] font-medium uppercase" style={{ letterSpacing: "0.04em" }}>
                Bucket
              </th>
              <th className="px-2 py-1.5 text-right text-[11px] font-medium uppercase" style={{ letterSpacing: "0.04em" }}>
                %
              </th>
              <th className="px-2 py-1.5 text-right text-[11px] font-medium uppercase" style={{ letterSpacing: "0.04em" }}>
                $/mo
              </th>
              {aiAllocation ? (
                <th className="px-2 py-1.5 text-left text-[11px] font-medium uppercase" style={{ letterSpacing: "0.04em" }}>
                  AI rec.
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {output.buckets
              .slice()
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((b) => {
                const pct = output.allocation_pct[b.id] ?? 0;
                const dollarsMo = Math.round((availableMo * pct) / 100);
                const aiRec = aiAllocation?.buckets.find((r) => r.bucket_id === b.id);
                return (
                  <tr
                    key={b.id}
                    className="border-b"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <td className="px-2 py-2">
                      <div style={{ color: "var(--text)" }}>{b.name}</div>
                      <div className="text-[11px]" style={{ color: "var(--text-3)" }}>
                        {b.tax_treatment.replace("_", "-")}
                      </div>
                    </td>
                    <td className="px-2 py-2" style={{ width: 100 }}>
                      <PercentInput
                        pct={pct}
                        onChange={(v) => setAllocation(b.id, v)}
                        ariaLabel={`Allocation for ${b.name}`}
                      />
                    </td>
                    <td
                      className="px-2 py-2 text-right"
                      style={{ fontFamily: "var(--font-mono)", color: "var(--text-2)" }}
                    >
                      {fmtCents(dollarsMo)}
                    </td>
                    {aiAllocation ? (
                      <td className="px-2 py-2">
                        {aiRec ? (
                          <div>
                            <span
                              className="rounded px-1.5 py-0.5 text-[11px] font-medium"
                              style={{
                                background: "var(--s-blue-bg)",
                                color: "var(--s-blue)",
                              }}
                            >
                              {aiRec.recommended_pct}%
                            </span>
                            <p
                              className="mt-1 text-[11px]"
                              style={{ color: "var(--text-3)" }}
                            >
                              {aiRec.reasoning}
                            </p>
                          </div>
                        ) : (
                          <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
                            —
                          </span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
          </tbody>
        </table>

        {aiAllocation ? (
          <p className="mt-3 text-[11px]" style={{ color: "var(--text-3)" }}>
            AI recommendation generated{" "}
            {new Date(aiAllocation.generated_at).toLocaleString()} · cost ${(
              aiAllocation.cost_cents / 100
            ).toFixed(2)}. Manual entry is authoritative.
          </p>
        ) : null}
      </PanelCard>

      {/* ── Section I: Save / Generate ────────────────────────────── */}
      <div className="lg:col-span-2 flex justify-end gap-3">
        <Button
          variant="outline"
          onClick={onSaveDraft}
          disabled={savingDraft || finalizing}
        >
          {savingDraft ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          Save draft
        </Button>
        <Button onClick={onFinalize} disabled={savingDraft || finalizing}>
          {finalizing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          Generate plan
        </Button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────

function HorizonRow({
  horizon,
  onUpdate,
  onRemove,
}: {
  horizon: TimeHorizon;
  onUpdate: (patch: Partial<TimeHorizon>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid grid-cols-[100px_120px_1fr_auto] items-end gap-2">
      <div>
        <Label className="text-[11px]">Type</Label>
        <Select
          value={horizon.type}
          onValueChange={(v) => onUpdate({ type: (v ?? "year") as TimeHorizon["type"] })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="year">Year</SelectItem>
            <SelectItem value="event">Event</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-[11px]">Year</Label>
        <Input
          type="number"
          value={horizon.year}
          onChange={(e) => {
            const n = Number.parseInt(e.target.value, 10);
            onUpdate({ year: Number.isFinite(n) ? n : horizon.year });
          }}
          style={{ fontFamily: "var(--font-mono)" }}
        />
      </div>
      <div>
        <Label className="text-[11px]">Label</Label>
        <Input
          value={horizon.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder={horizon.type === "event" ? "At Retirement" : "10 years"}
        />
      </div>
      <Button variant="ghost" size="icon" onClick={onRemove}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

function RateRow({
  label,
  rate,
  onChange,
}: {
  label: string;
  rate: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <Label className="text-[12px]">
        {label}{" "}
        <span style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
          {(rate * 100).toFixed(1)}%
        </span>
      </Label>
      <input
        type="range"
        min={0}
        max={label.toLowerCase().includes("tax rate") ? 60 : 15}
        step={0.1}
        value={rate * 100}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="w-full"
      />
    </div>
  );
}

function BucketCard({
  bucket,
  onUpdate,
  onRemove,
}: {
  bucket: CashFlowBucket;
  onUpdate: (patch: Partial<CashFlowBucket>) => void;
  onRemove: () => void;
}) {
  const isPreset = !!bucket.preset_id;
  return (
    <div
      className="rounded-md border p-3"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <Input
            value={bucket.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            className="text-base font-medium"
          />
          <p className="mt-1 text-[11px]" style={{ color: "var(--text-3)" }}>
            {bucket.description}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <div>
          <Label className="text-[11px]">Tax treatment</Label>
          <Select
            value={bucket.tax_treatment}
            onValueChange={(v) =>
              onUpdate({ tax_treatment: (v ?? "taxable") as TaxTreatment })
            }
            disabled={isPreset}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tax_free">Tax-free</SelectItem>
              <SelectItem value="tax_deferred">Tax-deferred</SelectItem>
              <SelectItem value="taxable">Taxable</SelectItem>
              <SelectItem value="mixed">Mixed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[11px]">Current balance</Label>
          <MoneyInput
            cents={bucket.current_balance_cents}
            onChange={(v) => onUpdate({ current_balance_cents: v })}
            ariaLabel={`${bucket.name} balance`}
          />
        </div>
        <div>
          <Label className="text-[11px]">Monthly target</Label>
          <MoneyInput
            cents={bucket.monthly_contribution_target_cents}
            onChange={(v) => onUpdate({ monthly_contribution_target_cents: v })}
            ariaLabel={`${bucket.name} monthly`}
          />
        </div>
      </div>
    </div>
  );
}

function AddBucketDialog({
  existingPresetIds,
  onClose,
  onAdd,
}: {
  existingPresetIds: Set<string>;
  onClose: () => void;
  onAdd: (preset: typeof BUCKET_PRESETS[number] | null, customName?: string) => void;
}) {
  const [customName, setCustomName] = useState("");
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg p-5"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3
            className="text-lg font-medium"
            style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}
          >
            Add bucket
          </h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-1 text-[12px]" style={{ color: "var(--text-3)" }}>
          Pick a preset or define a custom bucket. Presets pre-fill tax treatment.
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {BUCKET_PRESETS.map((preset) => {
            const used = existingPresetIds.has(preset.id);
            return (
              <button
                key={preset.id}
                type="button"
                disabled={used}
                onClick={() => onAdd(preset)}
                className="rounded-md border px-3 py-2 text-left transition-colors hover:bg-[var(--surface-2)] disabled:opacity-40"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="flex items-center justify-between">
                  <span style={{ color: "var(--text)" }}>{preset.name}</span>
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase"
                    style={{
                      background: "var(--surface-2)",
                      color: "var(--text-2)",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {preset.tax_treatment.replace("_", "-")}
                  </span>
                </div>
                <p className="mt-1 text-[11px]" style={{ color: "var(--text-3)" }}>
                  {used ? "Already added" : preset.description.slice(0, 100) + "…"}
                </p>
              </button>
            );
          })}

          <div
            className="rounded-md border p-3"
            style={{ borderColor: "var(--border)" }}
          >
            <Label className="text-[11px]">Custom bucket name</Label>
            <div className="mt-1 flex gap-2">
              <Input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. Crypto, Real Estate Fund"
              />
              <Button
                onClick={() => onAdd(null, customName || "Custom Bucket")}
                size="sm"
              >
                Add custom
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
