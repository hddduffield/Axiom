"use client";

// Phase 14.5 — Recommendations panel for Tab 3.
//
// Renders a panel of action recommendations the advisor can check and
// push to the action_items table with source_lens_run_id linkage.
//
// Default recommendation set is derived from the current lens state
// (planning move type, LI presence). The advisor can re-generate from
// state via "Refresh suggestions" or edit/add custom recs.
//
// All inserts go through POST /api/lens-runs/estate/[id]/push-action-items
// (Phase 14.2 endpoint) which:
//   - inserts each rec into action_items with category='ESTATE'
//   - sets source_lens_run_id for traceability
//   - tracks pushed_action_item_ids on the lens.output JSONB

import { useCallback, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { PanelCard } from "@/components/axiom/PanelCard";
import { api, isApiError } from "@/lib/api/client";
import { formatUsd } from "@/lib/estate-lens/calc";
import {
  cryptoId,
  type EstateLensOutput,
  type EstateRecommendation,
} from "@/lib/estate-lens/types";
import { promoteEstateLensAndSetCurrent } from "@/lib/lens-execution/promoteLensRecsToActionItems";

interface Props {
  lensId: string;
  output: EstateLensOutput;
  onChange: (next: EstateLensOutput) => void;
  editable: boolean;
}

export function EstateRecommendationsPanel({ lensId, output, onChange, editable }: Props) {
  const [pushing, setPushing] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(output.recommendations.map((r) => r.id)),
  );

  const pushedSet = useMemo(
    () => new Set(output.pushed_action_item_ids),
    [output.pushed_action_item_ids],
  );

  const generateDefaults = useCallback(() => {
    setGenerating(true);
    const recs: EstateRecommendation[] = [];

    const moveLabel = output.planning_move.type === "note_sale" ? "Note Sale to IDGT" : "Gift to Grantor Trust";
    recs.push({
      id: cryptoId(),
      category: output.planning_move.type === "note_sale" ? "note_sale" : "gift",
      label: `Execute ${moveLabel}`,
      description: `Engage estate counsel to draft trust + transfer ${output.planning_move.type === "note_sale" ? "via promissory note at " : ""}discounted FMV of ${formatUsd(
        Math.round(output.planning_move.fmv_transferred_cents * (1 - output.planning_move.valuation_discount_pct / 100)),
      )}. Coordinate appraisal of valuation discount.`,
      estimated_tax_savings_cents: 0,
      year_offset: 0,
    });

    if (output.life_insurance.death_benefit_cents > 0) {
      recs.push({
        id: cryptoId(),
        category: "li_purchase",
        label: "Acquire Estate Liquidity Life Insurance",
        description: `Underwrite ${formatUsd(output.life_insurance.death_benefit_cents)} permanent policy held in an ILIT. Annual premium: ${formatUsd(output.life_insurance.annual_premium_cents)} over ${output.life_insurance.years_of_premium} years. Fund via Crummey withdrawals + annual exclusion gifts.`,
        estimated_tax_savings_cents: 0,
        year_offset: 0,
      });
    }

    recs.push({
      id: cryptoId(),
      category: "trust_setup",
      label: "Coordinate ILIT setup",
      description:
        "Set up the Irrevocable Life Insurance Trust (ILIT) with appropriate trustees, Crummey beneficiaries, and trust situs review. Coordinate with estate attorney + insurance carrier on ownership and beneficiary designations.",
      estimated_tax_savings_cents: 0,
      year_offset: 0,
    });

    recs.push({
      id: cryptoId(),
      category: "review",
      label: "Annual Estate Plan Review",
      description:
        "Schedule annual estate plan review with the client to refresh assumptions, verify trust funding, and confirm appraisal currency. Reassess after any material change in family or asset structure.",
      estimated_tax_savings_cents: 0,
      year_offset: 1,
    });

    onChange({ ...output, recommendations: recs });
    setSelected(new Set(recs.map((r) => r.id)));
    setGenerating(false);
    toast.success("Default recommendations generated");
  }, [output, onChange]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const push = useCallback(async () => {
    const ids = Array.from(selected).filter((id) => !pushedSet.has(id));
    if (ids.length === 0) {
      toast.info("No new recommendations to push");
      return;
    }
    setPushing(true);
    try {
      const res = await api.lensRuns.estate.pushActionItems(lensId, {
        recommendation_ids: ids,
      });
      onChange({
        ...output,
        pushed_action_item_ids: [...output.pushed_action_item_ids, ...ids],
      });
      const n = res.created.length;
      toast.success(`Pushed ${n} action item${n === 1 ? "" : "s"}`);
    } catch (e) {
      toast.error(isApiError(e) ? e.message : "Push failed");
    } finally {
      setPushing(false);
    }
  }, [selected, pushedSet, lensId, output, onChange]);

  const finalizeAndPromote = useCallback(async () => {
    const ids = Array.from(selected).filter((id) => !pushedSet.has(id));
    setFinalizing(true);
    try {
      const result = await promoteEstateLensAndSetCurrent(lensId, ids);
      if (result.errors.length > 0) {
        toast.error(result.errors[0]);
        return;
      }
      onChange({
        ...output,
        pushed_action_item_ids: [...output.pushed_action_item_ids, ...ids],
      });
      toast.success(
        result.created_count > 0
          ? `Lens set as current · ${result.created_count} action item${result.created_count === 1 ? "" : "s"} created`
          : "Lens set as current",
      );
    } finally {
      setFinalizing(false);
    }
  }, [selected, pushedSet, lensId, output, onChange]);

  return (
    <PanelCard
      title="Action Item Recommendations"
      action={
        editable && output.recommendations.length === 0 ? (
          <Button variant="outline" size="sm" onClick={generateDefaults} disabled={generating}>
            {generating ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            )}
            Generate defaults
          </Button>
        ) : null
      }
    >
      {output.recommendations.length === 0 ? (
        <p className="text-[12px] italic" style={{ color: "var(--text-3)" }}>
          No recommendations yet. Click &quot;Generate defaults&quot; to seed
          a starter list based on the current planning move + LI plan.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <ul className="space-y-2">
            {output.recommendations.map((r) => {
              const isChecked = selected.has(r.id);
              const isPushed = pushedSet.has(r.id);
              return (
                <li
                  key={r.id}
                  className="rounded border p-3"
                  style={{
                    borderColor: isPushed ? "var(--s-green)" : "var(--border)",
                    background: isPushed ? "var(--s-green-bg)" : "var(--surface)",
                    opacity: isPushed ? 0.85 : 1,
                  }}
                >
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggle(r.id)}
                      disabled={isPushed}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-[13px] font-medium"
                          style={{ color: "var(--text)" }}
                        >
                          {r.label}
                        </span>
                        {isPushed ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] uppercase"
                            style={{
                              background: "var(--s-green)",
                              color: "var(--n-100)",
                              letterSpacing: "0.06em",
                              fontFamily: "var(--font-mono)",
                              fontWeight: 600,
                            }}
                          >
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            Pushed
                          </span>
                        ) : null}
                      </div>
                      <p
                        className="mt-1 text-[12px]"
                        style={{ color: "var(--text-2)" }}
                      >
                        {r.description}
                      </p>
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span
              className="text-[11px]"
              style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)" }}
            >
              {Array.from(selected).filter((id) => !pushedSet.has(id)).length} new selected
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={push}
                disabled={pushing || finalizing}
              >
                {pushing ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Push selected
              </Button>
              <Button
                size="sm"
                onClick={finalizeAndPromote}
                disabled={pushing || finalizing}
                title="Push selected recommendations to action items AND promote this lens to current"
              >
                {finalizing ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Finalize & Promote
              </Button>
            </div>
          </div>
        </div>
      )}
    </PanelCard>
  );
}
