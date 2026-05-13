"use client";

// Phase 13 — Cash Flow Lens top-level view. Owns the lens output state +
// tab routing. Each tab is a separate file. Auto-saves draft state via
// PATCH on field-blur; manual "Save draft" / "Finalize" buttons inside
// the Input tab.

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, CheckCircle2, ExternalLink, FileDown, Loader2 } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/axiom/Tabs";
import { api, isApiError } from "@/lib/api/client";
import type { LensRun } from "@/lib/api/types";
import {
  isCashFlowLensOutput,
  type CashFlowLensOutput,
} from "@/lib/api/cash_flow_lens";
import { LensSourceBanner } from "@/components/axiom/LensSourceBanner";

import { CashFlowInputTab } from "./_CashFlowInputTab";
import { CashFlowHubTab } from "./_CashFlowHubTab";
import { CashFlowTaxTriangleTab } from "./_CashFlowTaxTriangleTab";
import { CashFlowDistributionTab } from "./_CashFlowDistributionTab";
import { PdfExportDialog } from "./_PdfExportDialog";

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
  initialOutput: CashFlowLensOutput;
}

export function CashFlowLensView({ lensRun: initialLens, client, initialOutput }: Props) {
  const router = useRouter();
  const [lensRun, setLensRun] = useState(initialLens);
  const [output, setOutput] = useState<CashFlowLensOutput>(initialOutput);
  const [savingDraft, setSavingDraft] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [activeTab, setActiveTab] = useState(
    initialLens.status === "approved" ? "hub" : "input",
  );
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  const isDraft = lensRun.status === "draft";
  const isApproved = lensRun.status === "approved";
  const isArchived = lensRun.status === "archived";

  const saveDraft = useCallback(
    async (next: CashFlowLensOutput, opts?: { silent?: boolean }) => {
      setSavingDraft(true);
      try {
        const updated = await api.lensRuns.cashFlow.update(lensRun.id, { output: next });
        setLensRun(updated);
        if (isCashFlowLensOutput(updated.output)) {
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
    [lensRun.id],
  );

  const finalize = useCallback(async () => {
    setFinalizing(true);
    try {
      // Save current draft first to be safe.
      await api.lensRuns.cashFlow.update(lensRun.id, { output });
      const updated = await api.lensRuns.cashFlow.finalize(lensRun.id);
      setLensRun(updated);
      if (isCashFlowLensOutput(updated.output)) {
        setOutput(updated.output);
      }
      setActiveTab("hub");
      toast.success("Plan finalized");
    } catch (e) {
      const msg = isApiError(e) ? e.message : "Finalize failed";
      toast.error(msg);
    } finally {
      setFinalizing(false);
    }
  }, [lensRun.id, output]);

  const archive = useCallback(async () => {
    if (
      !window.confirm(
        "Archive this Cash Flow Lens? It will be hidden from the default Lens Runs view.",
      )
    ) {
      return;
    }
    setArchiving(true);
    try {
      await api.lensRuns.archive(lensRun.id);
      toast.success("Lens archived");
      router.push(`/clients/${client.id}`);
    } catch (e) {
      const msg = isApiError(e) ? e.message : "Archive failed";
      toast.error(msg);
    } finally {
      setArchiving(false);
    }
  }, [lensRun.id, router, client.id]);

  const exportPdf = useCallback(() => {
    setExportDialogOpen(true);
  }, []);

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
              Cash Flow Lens
            </h1>
            {headerStatusPill}
          </div>
          <p className="mt-1 text-sm" style={{ color: "var(--text-2)" }}>
            {client.household_name}
            {lensRun.cost_cents != null && lensRun.cost_cents > 0 ? (
              <>
                {" · AI cost: "}
                <span style={{ fontFamily: "var(--font-mono)" }}>
                  ${(lensRun.cost_cents / 100).toFixed(2)}
                </span>
              </>
            ) : null}
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
          <Button variant="outline" size="sm" onClick={exportPdf}>
            <FileDown className="mr-1.5 h-3.5 w-3.5" />
            Export PDF
          </Button>
          {!isArchived ? (
            <Button
              variant="outline"
              size="sm"
              onClick={archive}
              disabled={archiving}
            >
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

      {/* Phase 16 — source provenance banner. Hidden when source is null
          AND the lens is finalized/archived (no point in showing a
          "no plan available" hint on a read-only view). */}
      {output.source !== null || isDraft ? (
        <LensSourceBanner
          source={output.source}
          onRefresh={async () => {
            const updated = await api.lensRuns.cashFlow.refreshFromPlan(lensRun.id);
            setLensRun(updated);
            if (isCashFlowLensOutput(updated.output)) {
              setOutput(updated.output);
            }
          }}
          refreshDisabled={!isDraft}
          lensTypeLabel="Cash Flow Lens"
        />
      ) : null}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v ?? "input")}>
        <TabsList className="mb-5">
          {isDraft ? <TabsTrigger value="input">Input</TabsTrigger> : null}
          <TabsTrigger value="hub">Hub</TabsTrigger>
          <TabsTrigger value="triangle">Tax Triangle</TabsTrigger>
          <TabsTrigger value="distribution">Distribution Plan</TabsTrigger>
        </TabsList>

        {isDraft ? (
          <TabsContent value="input" className="mt-4">
            <CashFlowInputTab
              lensId={lensRun.id}
              output={output}
              onChange={setOutput}
              onSaveDraft={() => saveDraft(output)}
              onFinalize={finalize}
              savingDraft={savingDraft}
              finalizing={finalizing}
              onAiUpdated={(updated) => {
                setLensRun(updated);
                if (isCashFlowLensOutput(updated.output)) {
                  setOutput(updated.output);
                }
              }}
            />
          </TabsContent>
        ) : null}

        <TabsContent value="hub" className="mt-4">
          <CashFlowHubTab output={output} client={client} />
        </TabsContent>

        <TabsContent value="triangle" className="mt-4">
          <CashFlowTaxTriangleTab output={output} />
        </TabsContent>

        <TabsContent value="distribution" className="mt-4">
          <CashFlowDistributionTab
            lensId={lensRun.id}
            output={output}
            onChange={(next) => {
              setOutput(next);
              if (isDraft) saveDraft(next, { silent: true });
            }}
            onAiUpdated={(updated) => {
              setLensRun(updated);
              if (isCashFlowLensOutput(updated.output)) {
                setOutput(updated.output);
              }
            }}
            isDraft={isDraft}
          />
        </TabsContent>
      </Tabs>

      {exportDialogOpen ? (
        <PdfExportDialog
          lensId={lensRun.id}
          output={output}
          onClose={() => setExportDialogOpen(false)}
        />
      ) : null}
    </div>
  );
}
