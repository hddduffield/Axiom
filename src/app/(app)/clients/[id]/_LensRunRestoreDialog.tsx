"use client";

// Phase 15.2 — Lens run restore dialog.
//
// Surfaces on archived lens rows when the "Show archived" toggle is on.
// Less destructive than Archive — just a confirmation prompt, no typo
// guard. Calls api.lensRuns.restore → POST /api/lens-runs/[id]/restore
// → flips status archived → draft and clears archived_at.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, isApiError } from "@/lib/api/client";

interface Props {
  lensRunId: string;
  scenarioName: string;
  lensTypeLabel: string;
  trigger?: React.ReactNode;
  onRestored?: () => void;
}

export function LensRunRestoreDialog({
  lensRunId,
  scenarioName,
  lensTypeLabel,
  trigger,
  onRestored,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function handleOpenChange(next: boolean) {
    if (submitting) return;
    setOpen(next);
  }

  async function onConfirm() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await api.lensRuns.restore(lensRunId);
      toast.success(`${scenarioName} restored to draft.`);
      setOpen(false);
      if (onRestored) onRestored();
      router.refresh();
    } catch (e) {
      toast.error(isApiError(e) ? e.message : "Could not restore lens run.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <span
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
            aria-label={`Restore ${scenarioName}`}
            data-api="POST /api/lens-runs/[id]/restore"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        )}
      </span>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Restore {scenarioName}?</DialogTitle>
          <DialogDescription>
            This {lensTypeLabel} lens will be moved back to{" "}
            <span style={{ fontFamily: "var(--font-mono)" }}>draft</span>{" "}
            status and reappear in the active lens list. All preserved
            data (inputs, outputs, recommendations) becomes editable again.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={submitting}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            {submitting ? "Restoring…" : "Restore"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
