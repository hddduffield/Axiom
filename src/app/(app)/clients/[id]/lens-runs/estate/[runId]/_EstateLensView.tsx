"use client";

// Phase 14 — Estate Lens top-level view. Tab navigation with the 3
// distinct screens matching the screenshots:
//   01 ESTATE TAX PROJECTION
//   02 TRUST PLANNING CALCULATOR
//   03 TAX PAYMENT STRATEGY
//
// Owns the EstateLensOutput state + debounced auto-save. Each tab
// receives output + onChange and mutates locally; auto-save fires after
// 1500ms of idle. Manual "Save draft" button forces flush.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Archive,
  CheckCircle2,
  ExternalLink,
  FileDown,
  Loader2,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { api, isApiError } from "@/lib/api/client";
import type { LensRun } from "@/lib/api/types";
import {
  isEstateLensOutput,
  type EstateLensOutput,
} from "@/lib/estate-lens/types";
import { LensSourceBanner } from "@/components/axiom/LensSourceBanner";
import { LensReopenDialog } from "@/components/axiom/LensReopenDialog";
import { LensSummaryBanner } from "@/components/axiom/LensSummaryBanner";
import { applyEditedFields, diffSourcedFields } from "@/lib/lens-prefill";

import { EstateProjectionTab } from "./_EstateProjectionTab";
import { EstateTrustPlanningTab } from "./_EstateTrustPlanningTab";
import { EstateTaxPaymentTab } from "./_EstateTaxPaymentTab";
import { EstatePdfDialog } from "./_EstatePdfDialog";

interface Client {
  id: string;
  household_name: string;
  archetype: string | null;
  status: string;
  created_at: string;
}

interface Props {
  lensRun: LensRun;
  client: Client;
  initialOutput: EstateLensOutput;
}

const TABS = [
  { id: "projection", num: "01", label: "Estate Tax Projection" },
  { id: "trust", num: "02", label: "Trust Planning Calculator" },
  { id: "payment", num: "03", label: "Tax Payment Strategy" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function EstateLensView({ lensRun: initialLens, client, initialOutput }: Props) {
  const router = useRouter();
  const [lensRun, setLensRun] = useState(initialLens);
  const [output, setOutput] = useState<EstateLensOutput>(initialOutput);
  const [savingDraft, setSavingDraft] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("projection");
  const [pdfOpen, setPdfOpen] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDraft = lensRun.status === "draft";
  const isApproved = lensRun.status === "approved";
  const isArchived = lensRun.status === "archived";

  const saveDraft = useCallback(
    async (next: EstateLensOutput, opts?: { silent?: boolean; scenarioName?: string }) => {
      if (!isDraft) return;
      setSavingDraft(true);
      try {
        const updated = await api.lensRuns.estate.update(lensRun.id, {
          output: next,
          scenario_name: opts?.scenarioName ?? next.scenario_name,
        });
        setLensRun(updated);
        if (isEstateLensOutput(updated.output)) {
          setOutput(updated.output);
        }
        if (!opts?.silent) toast.success("Draft saved");
      } catch (e) {
        const msg = isApiError(e) ? e.message : "Save failed";
        toast.error(msg);
      } finally {
        setSavingDraft(false);
      }
    },
    [lensRun.id, isDraft],
  );

  const handleChange = useCallback(
    (next: EstateLensOutput) => {
      // Phase 16.3 — track which sourced fields were just edited so
      // refresh-from-plan preserves the advisor's overrides.
      setOutput((prev) => {
        const newlyEdited = diffSourcedFields(prev, next);
        return applyEditedFields(next, newlyEdited);
      });
      if (!isDraft) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const newlyEdited = diffSourcedFields(output, next);
        saveDraft(applyEditedFields(next, newlyEdited), { silent: true });
      }, 1500);
    },
    [isDraft, saveDraft, output],
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const finalize = useCallback(async () => {
    setFinalizing(true);
    try {
      await api.lensRuns.estate.update(lensRun.id, { output });
      const updated = await api.lensRuns.estate.finalize(lensRun.id);
      setLensRun(updated);
      if (isEstateLensOutput(updated.output)) setOutput(updated.output);
      toast.success("Scenario finalized");
    } catch (e) {
      const msg = isApiError(e) ? e.message : "Finalize failed";
      toast.error(msg);
    } finally {
      setFinalizing(false);
    }
  }, [lensRun.id, output]);

  const archive = useCallback(async () => {
    if (!window.confirm("Archive this scenario? It will be hidden from the default view.")) return;
    setArchiving(true);
    try {
      await api.lensRuns.archive(lensRun.id);
      toast.success("Scenario archived");
      router.push(`/clients/${client.id}`);
    } catch (e) {
      const msg = isApiError(e) ? e.message : "Archive failed";
      toast.error(msg);
    } finally {
      setArchiving(false);
    }
  }, [lensRun.id, router, client.id]);

  const headerStatusPill = useMemo(() => {
    const tone = isApproved
      ? { fg: "var(--s-green)", bg: "var(--s-green-bg)", label: "Finalized" }
      : isArchived
        ? { fg: "var(--s-slate)", bg: "var(--s-slate-bg)", label: "Archived" }
        : { fg: "var(--s-amber)", bg: "var(--s-amber-bg)", label: "Draft" };
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase"
        style={{ background: tone.bg, color: tone.fg, letterSpacing: "0.06em" }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.fg }} />
        {tone.label}
      </span>
    );
  }, [isApproved, isArchived]);

  return (
    <div className="flex flex-col gap-5" style={{ opacity: isArchived ? 0.85 : 1 }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1
              className="text-3xl font-medium"
              style={{
                fontFamily: "var(--font-display)",
                letterSpacing: "-0.01em",
                color: "var(--text)",
              }}
            >
              Estate Lens
            </h1>
            {headerStatusPill}
          </div>
          <p className="mt-1 text-sm" style={{ color: "var(--text-2)" }}>
            {client.household_name}
            {" · "}
            <span style={{ fontFamily: "var(--font-mono)" }}>{output.scenario_name}</span>
            {savingDraft ? (
              <>
                {" · "}
                <span style={{ color: "var(--text-3)" }}>saving…</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isDraft ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => saveDraft(output)}
                disabled={savingDraft}
              >
                {savingDraft ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Save draft
              </Button>
              <Button size="sm" onClick={finalize} disabled={finalizing}>
                {finalizing ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                )}
                Finalize
              </Button>
            </>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => setPdfOpen(true)}>
            <FileDown className="mr-1.5 h-3.5 w-3.5" />
            Export PDF
          </Button>
          {/* Phase 18.2 — Reopen finalized scenario for editing. */}
          {!isDraft && !isArchived ? (
            <LensReopenDialog
              lensRunId={lensRun.id}
              lensTypeLabel="Estate scenario"
            />
          ) : null}
          {!isArchived ? (
            <Button variant="outline" size="sm" onClick={archive} disabled={archiving}>
              <Archive className="mr-1.5 h-3.5 w-3.5" />
              Archive
            </Button>
          ) : (
            <a
              href={`/clients/${client.id}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Back to client
            </a>
          )}
        </div>
      </div>

      {/* Phase 18.5 — executive summary banner on non-draft lenses. */}
      {!isDraft ? (
        <LensSummaryBanner
          lensRunId={lensRun.id}
          summary={output.executive_summary ?? null}
          canEdit={!isArchived}
        />
      ) : null}

      {/* Tab nav — pixel-perfect with screenshot:
          01 ESTATE TAX PROJECTION (numbered, navy underline on active) */}
      {output.source !== null || isDraft ? (
        <LensSourceBanner
          source={output.source}
          onRefresh={async () => {
            const updated = await api.lensRuns.estate.refreshFromPlan(lensRun.id);
            setLensRun(updated);
            if (isEstateLensOutput(updated.output)) {
              setOutput(updated.output);
            }
          }}
          refreshDisabled={!isDraft}
          lensTypeLabel="Estate Lens"
          // Full extraction fills: state, state_estate_tax_pct, estate_today,
          // annual_spend, age, years_out, combined_exemption, federal_ltcg
          // (×2 surfaces). Threshold of 6 captures most-fields-present.
          expectedFieldCount={6}
        />
      ) : null}

      <div
        className="flex items-stretch gap-0 border-b"
        style={{ borderColor: "var(--border)" }}
        role="tablist"
      >
        {TABS.map((t) => {
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(t.id)}
              className="group flex items-baseline gap-2 px-5 py-3 transition-colors hover:bg-[var(--surface-2)]"
              style={{
                borderBottom: isActive
                  ? "3px solid var(--psa-navy)"
                  : "3px solid transparent",
                marginBottom: "-1px",
              }}
            >
              <span
                className="text-[12px]"
                style={{
                  fontFamily: "var(--font-mono)",
                  color: isActive ? "var(--psa-navy)" : "var(--text-3)",
                  letterSpacing: "0.06em",
                  fontWeight: 500,
                }}
              >
                {t.num}
              </span>
              <span
                className="text-[11px] uppercase"
                style={{
                  color: isActive ? "var(--psa-navy)" : "var(--text-2)",
                  letterSpacing: "0.08em",
                  fontWeight: isActive ? 600 : 500,
                  fontFamily: "var(--font-mono)",
                }}
              >
                {t.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "projection" ? (
        <EstateProjectionTab output={output} onChange={handleChange} editable={isDraft} />
      ) : null}
      {activeTab === "trust" ? (
        <EstateTrustPlanningTab output={output} onChange={handleChange} editable={isDraft} />
      ) : null}
      {activeTab === "payment" ? (
        <EstateTaxPaymentTab output={output} onChange={handleChange} editable={isDraft} />
      ) : null}

      {pdfOpen ? (
        <EstatePdfDialog
          lensId={lensRun.id}
          output={output}
          clientName={client.household_name}
          onClose={() => setPdfOpen(false)}
        />
      ) : null}
    </div>
  );
}
