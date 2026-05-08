"use client";

// Phase 13.5 — Distribution Plan tab.
//
// Three sliders (Tax-Free / Tax-Deferred / Taxable) auto-balance to total
// 100%. Year-by-year stacked bar chart over 30-year retirement horizon
// with tax-bill overlay line. AI recommendations generated on explicit
// button click (cost-conscious; not slider-debounced). Each rec is a row
// with a default-checked checkbox; "Push selected to action items"
// inserts into action_items.

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CheckSquare,
  ChevronRight,
  Loader2,
  Sparkles,
  Square,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { PanelCard } from "@/components/axiom/PanelCard";
import { api, isApiError } from "@/lib/api/client";
import {
  buildYearlyDistribution,
  cumulativeTaxSavingsCents,
  currentTaxMix,
  type CashFlowLensOutput,
} from "@/lib/api/cash_flow_lens";
import type { LensRun } from "@/lib/api/types";

interface Props {
  lensId: string;
  output: CashFlowLensOutput;
  onChange: (next: CashFlowLensOutput) => void;
  onAiUpdated: (updated: LensRun) => void;
  isDraft: boolean;
}

function fmtCentsShort(c: number): string {
  const v = c / 100;
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `$${Math.round(v / 1_000).toLocaleString()}K`;
  return `$${Math.round(v).toLocaleString()}`;
}

function fmtCents(c: number): string {
  if (c === 0) return "$0";
  return `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

const RETIREMENT_YEARS = 30;

export function CashFlowDistributionTab({
  lensId,
  output,
  onChange,
  onAiUpdated,
  isDraft,
}: Props) {
  const slider = output.distribution_plan.slider_state;
  const [generatingRecs, setGeneratingRecs] = useState(false);
  const [pushing, setPushing] = useState(false);

  const aiDistRecs = output.ai_suggestions.distribution_recommendations;
  const pushedSet = useMemo(
    () => new Set(output.pushed_action_item_ids),
    [output.pushed_action_item_ids],
  );

  // Initialize selection: all visible recs checked by default, except
  // already-pushed ones.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    if (!aiDistRecs) return new Set();
    return new Set(
      aiDistRecs.recommendations.filter((r) => !pushedSet.has(r.id)).map((r) => r.id),
    );
  });

  // Re-seed selection if recommendations regenerated.
  const recsKey = aiDistRecs?.generated_at ?? "none";
  const [lastKey, setLastKey] = useState(recsKey);
  if (lastKey !== recsKey) {
    setLastKey(recsKey);
    setSelectedIds(
      new Set(
        (aiDistRecs?.recommendations ?? [])
          .filter((r) => !pushedSet.has(r.id))
          .map((r) => r.id),
      ),
    );
  }

  // ── Slider behavior ────────────────────────────────────────────────
  // When one slider moves, distribute the delta proportionally across
  // the other two so the total stays at 100. Edge case: if the other
  // two are both 0, split the remainder evenly.
  const handleSlide = useCallback(
    (key: keyof typeof slider, value: number) => {
      const clamped = Math.min(Math.max(Math.round(value), 0), 100);
      const others: (keyof typeof slider)[] = (
        Object.keys(slider) as (keyof typeof slider)[]
      ).filter((k) => k !== key);
      const otherSum = others.reduce((a, k) => a + slider[k], 0);
      const remaining = 100 - clamped;

      let next = { ...slider, [key]: clamped };
      if (otherSum === 0) {
        next[others[0]] = Math.round(remaining / 2);
        next[others[1]] = remaining - next[others[0]];
      } else {
        next[others[0]] = Math.round((slider[others[0]] / otherSum) * remaining);
        next[others[1]] = remaining - next[others[0]];
      }
      // Guard against rounding pushing a leg negative.
      next = {
        tax_free_pct: Math.max(next.tax_free_pct, 0),
        tax_deferred_pct: Math.max(next.tax_deferred_pct, 0),
        taxable_pct: Math.max(next.taxable_pct, 0),
      };
      // Re-normalize if rounding broke 100 sum.
      const total = next.tax_free_pct + next.tax_deferred_pct + next.taxable_pct;
      if (total !== 100) {
        const diff = 100 - total;
        // Add diff to the slider that was just moved.
        next = { ...next, [key]: next[key] + diff };
      }

      onChange({
        ...output,
        distribution_plan: { slider_state: next },
      });
    },
    [onChange, output, slider],
  );

  // ── Calculations ───────────────────────────────────────────────────
  const targetIncomeCents = output.assumptions.retirement_income_target_annual_cents;
  const startYear = new Date().getFullYear();

  const yearly = useMemo(
    () =>
      buildYearlyDistribution({
        start_year: startYear,
        years: RETIREMENT_YEARS,
        target_income_cents: targetIncomeCents,
        mix: slider,
        assumptions: output.assumptions,
      }),
    [slider, output.assumptions, targetIncomeCents, startYear],
  );

  const naiveMix = currentTaxMix(output);
  const annualTaxSavings1 = useMemo(() => {
    const naive = buildYearlyDistribution({
      start_year: startYear,
      years: 1,
      target_income_cents: targetIncomeCents,
      mix: naiveMix,
      assumptions: output.assumptions,
    });
    return naive[0].tax_bill_cents - yearly[0].tax_bill_cents;
  }, [naiveMix, yearly, output.assumptions, targetIncomeCents, startYear]);

  const cumulativeSavings30 = useMemo(
    () =>
      cumulativeTaxSavingsCents({
        years: RETIREMENT_YEARS,
        target_income_cents: targetIncomeCents,
        current_mix: naiveMix,
        recommended_mix: slider,
        assumptions: output.assumptions,
      }),
    [naiveMix, slider, targetIncomeCents, output.assumptions],
  );

  // Bar chart scales — find the max stacked value across all years.
  const maxStackedCents = useMemo(() => {
    return Math.max(
      ...yearly.map((y) => y.tax_free_cents + y.tax_deferred_cents + y.taxable_cents),
    );
  }, [yearly]);
  const maxTaxCents = useMemo(
    () => Math.max(...yearly.map((y) => y.tax_bill_cents), 1),
    [yearly],
  );

  // ── Actions ────────────────────────────────────────────────────────
  const generateRecs = useCallback(async () => {
    setGeneratingRecs(true);
    try {
      // Persist current slider state first.
      await api.lensRuns.cashFlow.update(lensId, { output });
      const updated = await api.lensRuns.cashFlow.generateRecommendations(lensId);
      onAiUpdated(updated);
      toast.success("Recommendations generated");
    } catch (e) {
      const msg = isApiError(e) ? e.message : "Generation failed";
      toast.error(msg);
    } finally {
      setGeneratingRecs(false);
    }
  }, [lensId, output, onAiUpdated]);

  const pushSelected = useCallback(async () => {
    if (selectedIds.size === 0) {
      toast.info("Select at least one recommendation.");
      return;
    }
    setPushing(true);
    try {
      const res = await api.lensRuns.cashFlow.pushActionItems(lensId, {
        recommendation_ids: Array.from(selectedIds),
      });
      toast.success(
        `${res.created.length} pushed to action items${res.skipped > 0 ? `, ${res.skipped} skipped (already pushed)` : ""}`,
      );
      // Update output's pushed list locally so checkboxes reflect new state.
      onChange({
        ...output,
        pushed_action_item_ids: [
          ...output.pushed_action_item_ids,
          ...Array.from(selectedIds),
        ],
      });
      setSelectedIds(new Set());
    } catch (e) {
      const msg = isApiError(e) ? e.message : "Push failed";
      toast.error(msg);
    } finally {
      setPushing(false);
    }
  }, [selectedIds, lensId, output, onChange]);

  const toggleSelected = (id: string) => {
    setSelectedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ── Sliders + savings KPIs ──────────────────────────────── */}
      <PanelCard title="Recommended retirement distribution mix">
        <p className="mb-3 text-[12px]" style={{ color: "var(--text-2)" }}>
          Three sliders are locked to total 100%. Move one — the others
          auto-balance proportionally. State persists{" "}
          {isDraft ? "as you adjust" : "(read-only on finalized lenses)"}.
        </p>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <SliderRow
            label="Tax-Free"
            color="#0d6f3a"
            value={slider.tax_free_pct}
            onChange={(v) => handleSlide("tax_free_pct", v)}
            disabled={!isDraft}
          />
          <SliderRow
            label="Tax-Deferred"
            color="#a25a00"
            value={slider.tax_deferred_pct}
            onChange={(v) => handleSlide("tax_deferred_pct", v)}
            disabled={!isDraft}
          />
          <SliderRow
            label="Taxable"
            color="#1a52a8"
            value={slider.taxable_pct}
            onChange={(v) => handleSlide("taxable_pct", v)}
            disabled={!isDraft}
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi
            label="Annual tax savings (Yr 1)"
            value={fmtCents(annualTaxSavings1)}
            tone={annualTaxSavings1 >= 0 ? "good" : "bad"}
          />
          <Kpi
            label="Cumulative savings — 30y"
            value={fmtCentsShort(cumulativeSavings30)}
            tone={cumulativeSavings30 >= 0 ? "good" : "bad"}
          />
          <Kpi
            label="Year-1 tax bill"
            value={fmtCents(yearly[0].tax_bill_cents)}
          />
          <Kpi
            label="Effective rate Year 1"
            value={`${
              targetIncomeCents > 0
                ? Math.round((yearly[0].tax_bill_cents / targetIncomeCents) * 100)
                : 0
            }%`}
          />
        </div>
      </PanelCard>

      {/* ── Year-by-year bar chart ──────────────────────────────── */}
      <PanelCard title="Year-by-year retirement income — stacked by tax treatment">
        <YearlyChart
          yearly={yearly}
          maxStackedCents={maxStackedCents}
          maxTaxCents={maxTaxCents}
        />
        <div
          className="mt-3 flex flex-wrap gap-4 text-[11px]"
          style={{ color: "var(--text-3)" }}
        >
          <Legend color="#0d6f3a" label="Tax-Free" />
          <Legend color="#a25a00" label="Tax-Deferred" />
          <Legend color="#1a52a8" label="Taxable" />
          <Legend color="#dc2626" dashed label="Tax bill" />
        </div>
      </PanelCard>

      {/* ── AI recommendations ───────────────────────────────────── */}
      <PanelCard
        title="Action recommendations"
        action={
          isDraft ? (
            <Button
              variant="outline"
              size="sm"
              onClick={generateRecs}
              disabled={generatingRecs || targetIncomeCents === 0}
              title={
                targetIncomeCents === 0
                  ? "Set a retirement income target in the Input tab first."
                  : undefined
              }
            >
              {generatingRecs ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              )}
              {aiDistRecs ? "Regenerate" : "Generate Recommendations"}
            </Button>
          ) : null
        }
      >
        {!aiDistRecs ? (
          <p className="text-[13px]" style={{ color: "var(--text-3)" }}>
            No recommendations yet. Click &ldquo;Generate Recommendations&rdquo; to ask
            Claude Haiku 4.5 for year-by-year actions to move from the
            current mix to your target.
          </p>
        ) : (
          <>
            <div
              className="mb-3 flex items-center justify-between gap-2 rounded p-2 text-[11px]"
              style={{ background: "var(--surface-2)", color: "var(--text-3)" }}
            >
              <span>
                Generated {new Date(aiDistRecs.generated_at).toLocaleString()} ·{" "}
                {aiDistRecs.recommendations.length} recommendations · cost $
                {(aiDistRecs.cost_cents / 100).toFixed(2)}
              </span>
              <span style={{ fontFamily: "var(--font-mono)" }}>
                Slider: TF {aiDistRecs.slider_state.tax_free_pct}% / TD{" "}
                {aiDistRecs.slider_state.tax_deferred_pct}% / TX{" "}
                {aiDistRecs.slider_state.taxable_pct}%
              </span>
            </div>
            <ul className="flex flex-col gap-2">
              {aiDistRecs.recommendations
                .slice()
                .sort((a, b) => a.year - b.year)
                .map((r) => {
                  const pushed = pushedSet.has(r.id);
                  const selected = selectedIds.has(r.id);
                  return (
                    <li
                      key={r.id}
                      className="flex items-start gap-3 rounded-md border p-3"
                      style={{
                        borderColor: pushed
                          ? "var(--s-green)"
                          : "var(--border)",
                        background: pushed ? "var(--s-green-bg)" : "var(--surface)",
                        opacity: pushed ? 0.85 : 1,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => !pushed && toggleSelected(r.id)}
                        disabled={pushed}
                        className="mt-0.5 disabled:cursor-not-allowed"
                      >
                        {pushed ? (
                          <CheckSquare
                            className="h-4 w-4"
                            style={{ color: "var(--s-green)" }}
                          />
                        ) : selected ? (
                          <CheckSquare
                            className="h-4 w-4"
                            style={{ color: "var(--psa-navy)" }}
                          />
                        ) : (
                          <Square className="h-4 w-4" style={{ color: "var(--text-3)" }} />
                        )}
                      </button>
                      <div className="flex-1">
                        <div className="flex items-baseline gap-2">
                          <span
                            className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase"
                            style={{
                              background: "var(--surface-2)",
                              color: "var(--text-2)",
                              fontFamily: "var(--font-mono)",
                              letterSpacing: "0.06em",
                            }}
                          >
                            {r.timeframe_label}
                          </span>
                          {pushed ? (
                            <span
                              className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase"
                              style={{
                                background: "var(--s-green)",
                                color: "#ffffff",
                                letterSpacing: "0.06em",
                              }}
                            >
                              Pushed
                            </span>
                          ) : null}
                        </div>
                        <p
                          className="mt-1 text-[14px] font-medium"
                          style={{ color: "var(--text)" }}
                        >
                          {r.action}
                        </p>
                        <p className="mt-1 text-[12px]" style={{ color: "var(--text-2)" }}>
                          {r.reason}
                        </p>
                        <p className="mt-1 text-[11px]" style={{ color: "var(--text-3)" }}>
                          Estimated tax impact:{" "}
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              color:
                                r.estimated_tax_impact_cents <= 0
                                  ? "var(--s-green)"
                                  : "var(--s-amber)",
                            }}
                          >
                            {r.estimated_tax_impact_cents <= 0 ? "−" : "+"}
                            {fmtCentsShort(Math.abs(r.estimated_tax_impact_cents))}
                          </span>
                        </p>
                      </div>
                    </li>
                  );
                })}
            </ul>

            <div className="mt-3 flex items-center justify-end gap-2">
              <span className="text-[12px]" style={{ color: "var(--text-3)" }}>
                {selectedIds.size} selected
              </span>
              <Button
                size="sm"
                onClick={pushSelected}
                disabled={pushing || selectedIds.size === 0}
              >
                {pushing ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ChevronRight className="mr-1.5 h-3.5 w-3.5" />
                )}
                Push selected to action items
              </Button>
            </div>
          </>
        )}
      </PanelCard>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────

function SliderRow({
  label,
  color,
  value,
  onChange,
  disabled,
}: {
  label: string;
  color: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span
          className="text-[11px] uppercase"
          style={{
            color: "var(--text-3)",
            letterSpacing: "0.06em",
            fontFamily: "var(--font-mono)",
          }}
        >
          {label}
        </span>
        <span
          className="text-2xl font-medium"
          style={{ fontFamily: "var(--font-display)", color }}
        >
          {value}%
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="mt-2 w-full"
        style={{ accentColor: color }}
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "good" | "bad" | "neutral";
}) {
  const color =
    tone === "good" ? "var(--s-green)" : tone === "bad" ? "var(--s-amber)" : "var(--text)";
  return (
    <div
      className="rounded-md border p-3"
      style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
    >
      <div
        className="text-[10px] uppercase"
        style={{
          color: "var(--text-3)",
          letterSpacing: "0.06em",
          fontFamily: "var(--font-mono)",
        }}
      >
        {label}
      </div>
      <div
        className="mt-1 text-xl font-medium"
        style={{ fontFamily: "var(--font-display)", color }}
      >
        {value}
      </div>
    </div>
  );
}

function YearlyChart({
  yearly,
  maxStackedCents,
  maxTaxCents,
}: {
  yearly: ReturnType<typeof buildYearlyDistribution>;
  maxStackedCents: number;
  maxTaxCents: number;
}) {
  const W = 800;
  const H = 240;
  const padL = 50;
  const padR = 50;
  const padT = 20;
  const padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const barW = Math.max(innerW / yearly.length - 2, 6);
  const x = (i: number) => padL + i * (innerW / yearly.length);

  const stackY = (cents: number) =>
    maxStackedCents > 0 ? (cents / maxStackedCents) * innerH : 0;
  const taxY = (cents: number) =>
    maxTaxCents > 0 ? (cents / maxTaxCents) * innerH : 0;

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="xMidYMid meet"
        style={{ minWidth: 600 }}
      >
        {/* Y-axis labels (income side) */}
        {[0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line
              x1={padL}
              y1={padT + innerH - innerH * t}
              x2={W - padR}
              y2={padT + innerH - innerH * t}
              stroke="var(--border)"
              strokeWidth="0.5"
              strokeDasharray="2 2"
            />
            <text
              x={padL - 6}
              y={padT + innerH - innerH * t + 4}
              textAnchor="end"
              fontSize="9"
              fontFamily="var(--font-mono)"
              fill="var(--text-3)"
            >
              {fmtCentsShort(maxStackedCents * t)}
            </text>
          </g>
        ))}

        {/* Stacked bars */}
        {yearly.map((y, i) => {
          const xPos = x(i) + 1;
          const tfH = stackY(y.tax_free_cents);
          const tdH = stackY(y.tax_deferred_cents);
          const txH = stackY(y.taxable_cents);
          const baseY = padT + innerH;
          return (
            <g key={i}>
              <rect
                x={xPos}
                y={baseY - txH}
                width={barW}
                height={txH}
                fill="#1a52a8"
              />
              <rect
                x={xPos}
                y={baseY - txH - tdH}
                width={barW}
                height={tdH}
                fill="#a25a00"
              />
              <rect
                x={xPos}
                y={baseY - txH - tdH - tfH}
                width={barW}
                height={tfH}
                fill="#0d6f3a"
              />
            </g>
          );
        })}

        {/* Tax-bill line (separate scale) */}
        <polyline
          points={yearly
            .map((y, i) => {
              const xPos = x(i) + barW / 2 + 1;
              const yPos = padT + innerH - taxY(y.tax_bill_cents);
              return `${xPos},${yPos}`;
            })
            .join(" ")}
          fill="none"
          stroke="#dc2626"
          strokeWidth="2"
          strokeDasharray="4 3"
        />

        {/* X-axis labels — every 5 years */}
        {yearly
          .filter((_, i) => i % 5 === 0)
          .map((y, ii) => {
            const i = ii * 5;
            return (
              <text
                key={y.year}
                x={x(i) + barW / 2 + 1}
                y={H - padB + 12}
                textAnchor="middle"
                fontSize="9"
                fontFamily="var(--font-mono)"
                fill="var(--text-3)"
              >
                {y.year}
              </text>
            );
          })}
      </svg>
    </div>
  );
}

function Legend({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {dashed ? (
        <span
          className="inline-block h-px w-4"
          style={{
            borderTop: `2px dashed ${color}`,
          }}
        />
      ) : (
        <span
          className="inline-block h-3 w-3 rounded-sm"
          style={{ background: color }}
        />
      )}
      {label}
    </span>
  );
}
