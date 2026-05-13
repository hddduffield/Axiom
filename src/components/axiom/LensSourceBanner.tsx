"use client";

// Phase 16 — Source provenance banner.
//
// Rendered at the top of a lens view when `source` is non-null on the
// lens output. Shows the originating plan + a Refresh button. Refresh
// re-runs the extractor against the latest finalized plan and merges,
// preserving any field the advisor has hand-edited.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCcw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isApiError } from "@/lib/api/client";

interface BaseSource {
  plan_id: string;
  plan_generated_at: string;
  sourced_fields: string[];
  edited_fields: string[];
}

interface Props {
  source: BaseSource | null;
  /** Refresh callback — should call the appropriate lens-type endpoint. */
  onRefresh: () => Promise<unknown>;
  /** Disabled when lens is not in draft (refresh endpoint will 409). */
  refreshDisabled?: boolean;
  /** "Cash Flow Lens" / "Estate Lens" — for body copy. */
  lensTypeLabel: string;
  /** Total field count for the lens — drives the "Some fields unpopulated"
   *  warning when the extractor only filled a fraction. */
  expectedFieldCount?: number;
}

export function LensSourceBanner({
  source,
  onRefresh,
  refreshDisabled,
  lensTypeLabel,
  expectedFieldCount,
}: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  if (!source) {
    return (
      <div
        className="flex items-center gap-2 rounded-md border px-3 py-2 text-[12px]"
        style={{
          background: "var(--surface-2)",
          borderColor: "var(--border)",
          color: "var(--text-3)",
        }}
      >
        <FileText className="h-3.5 w-3.5" />
        Manual entry — no plan available to source from for this client.
      </div>
    );
  }

  const generated = new Date(source.plan_generated_at);
  const dateLabel = generated.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const partial =
    expectedFieldCount !== undefined && source.sourced_fields.length < expectedFieldCount;

  async function doRefresh() {
    setRefreshing(true);
    try {
      await onRefresh();
      toast.success("Refreshed from latest plan");
      setConfirming(false);
      router.refresh();
    } catch (e) {
      toast.error(isApiError(e) ? e.message : "Could not refresh from plan.");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <>
      <div
        className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-[12px]"
        style={{
          background: "rgba(212, 175, 55, 0.06)",
          borderColor: "var(--border)",
          color: "var(--text-2)",
        }}
      >
        <span className="inline-flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" style={{ color: "var(--gold)" }} />
          <span>
            Sourced from Plan{" "}
            <span style={{ fontFamily: "var(--font-mono)" }}>
              {source.plan_id.slice(0, 8)}
            </span>{" "}
            · <span style={{ fontFamily: "var(--font-mono)" }}>{dateLabel}</span>
          </span>
        </span>

        <span style={{ color: "var(--text-3)" }}>
          {source.sourced_fields.length} field
          {source.sourced_fields.length === 1 ? "" : "s"} pre-filled
          {source.edited_fields.length > 0 ? (
            <>
              {" · "}
              <span style={{ color: "var(--text-2)" }}>
                {source.edited_fields.length} edited
              </span>
            </>
          ) : null}
        </span>

        {partial ? (
          <span
            className="inline-flex items-center gap-1"
            style={{ color: "var(--s-amber)" }}
          >
            <AlertTriangle className="h-3 w-3" />
            Some fields blank — Fact Review may not have included this data
          </span>
        ) : null}

        <span className="ml-auto inline-flex items-center gap-2">
          <a
            href={`/plans/${source.plan_id}`}
            className="inline-flex items-center gap-1 hover:underline"
            style={{ color: "var(--text-2)" }}
          >
            View plan
            <ExternalLink className="h-3 w-3" />
          </a>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setConfirming(true)}
            disabled={refreshing || refreshDisabled}
            data-api="POST /api/lens-runs/.../refresh-from-plan"
          >
            {refreshing ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
            )}
            Refresh from plan
          </Button>
        </span>
      </div>

      <Dialog open={confirming} onOpenChange={(v) => !refreshing && setConfirming(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refresh {lensTypeLabel} from latest plan?</DialogTitle>
            <DialogDescription>
              This will re-pull values from the latest finalized plan for this
              client. Fields you have manually edited will be preserved (
              <span style={{ color: "var(--text-2)" }}>
                {source.edited_fields.length} so far
              </span>
              ). All other sourced fields will be overwritten with current
              plan data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirming(false)}
              disabled={refreshing}
            >
              Cancel
            </Button>
            <Button type="button" onClick={doRefresh} disabled={refreshing}>
              {refreshing ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
              )}
              Refresh
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
