"use client";

// Phase 15.1 — Lens run archive dialog with typo-confirm guard.
//
// Mirrors the ClientArchiveDialog UX (Phase 11.2): destructive intent,
// typed-name confirmation to enable the action button. Calls
// api.lensRuns.archive → POST /api/lens-runs/[id]/archive → flips status
// to 'archived' and stamps archived_at.
//
// The lens row keeps its data intact and remains restorable via the
// archived filter on the same Lens Runs tab.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Archive } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, isApiError } from "@/lib/api/client";

interface Props {
  lensRunId: string;
  scenarioName: string; // display + confirmation target (e.g. "Scenario 1" / "Cash Flow Plan")
  lensTypeLabel: string; // "Cash Flow" | "Estate" — for body copy
  /** Trigger button render — defaults to a small icon button. */
  trigger?: React.ReactNode;
  /** Called after a successful archive so the parent can refresh state. */
  onArchived?: () => void;
}

export function LensRunArchiveDialog({
  lensRunId,
  scenarioName,
  lensTypeLabel,
  trigger,
  onArchived,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const matches = confirmText.trim() === scenarioName.trim();

  function handleOpenChange(next: boolean) {
    if (submitting) return;
    setOpen(next);
    if (!next) setConfirmText("");
  }

  async function onConfirm() {
    if (!matches || submitting) return;
    setSubmitting(true);
    try {
      await api.lensRuns.archive(lensRunId);
      toast.success(`${scenarioName} archived.`);
      setOpen(false);
      setConfirmText("");
      if (onArchived) onArchived();
      router.refresh();
    } catch (e) {
      toast.error(isApiError(e) ? e.message : "Could not archive lens run.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <span
        // Stop the wrapping row's onClick from firing when the trigger is hit.
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        {trigger ?? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleOpenChange(true)}
            aria-label={`Archive ${scenarioName}`}
            data-api="POST /api/lens-runs/[id]/archive"
            style={{ color: "var(--s-red)" }}
          >
            <Archive className="h-3.5 w-3.5" />
          </Button>
        )}
      </span>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full"
              style={{
                background: "var(--s-red-bg)",
                color: "var(--s-red)",
              }}
            >
              <AlertTriangle className="h-4 w-4" strokeWidth={2.5} />
            </div>
            <div className="flex-1">
              <DialogTitle>Archive {scenarioName}?</DialogTitle>
              <DialogDescription className="mt-1.5">
                This {lensTypeLabel} lens will be moved to{" "}
                <span style={{ fontFamily: "var(--font-mono)" }}>archived</span>{" "}
                status. The scenario data, inputs, outputs, and any pushed
                action items are preserved — the row just won&rsquo;t appear in
                the active lens list. You can restore later via the &ldquo;Show
                archived&rdquo; toggle on this tab.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label
            htmlFor="lens-archive-confirm"
            className="text-[11px] uppercase"
            style={{ color: "var(--text-2)", letterSpacing: "0.04em" }}
          >
            Type{" "}
            <span style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}>
              {scenarioName}
            </span>{" "}
            to confirm
          </Label>
          <Input
            id="lens-archive-confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={scenarioName}
            autoComplete="off"
            autoFocus
            style={{ fontFamily: "var(--font-mono)" }}
            disabled={submitting}
          />
          <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
            Typo guard — exact match required.
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={!matches || submitting}
            style={{
              background: matches ? "var(--s-red)" : undefined,
              color: matches ? "#fff" : undefined,
            }}
          >
            <Archive className="mr-1.5 h-3.5 w-3.5" />
            {submitting ? "Archiving…" : "Archive lens"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
