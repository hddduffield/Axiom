"use client";

// Phase 18.2 — Reopen-for-editing dialog for finalized lenses.
//
// Shown on lens views where status ∈ {reviewed, presented, current,
// superseded, approved}. Confirmation modal explains that existing
// action items are preserved (only the lens flips back to draft).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RefreshCcw } from "lucide-react";

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

export function LensReopenDialog({
  lensRunId,
  lensTypeLabel,
}: {
  lensRunId: string;
  /** Display label shown in the dialog body ("Cash Flow Lens", "Estate Lens"). */
  lensTypeLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function onConfirm() {
    setPending(true);
    try {
      await api.lensRuns.reopen(lensRunId);
      toast.success("Lens reopened — back to draft.");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(isApiError(e) ? e.message : "Could not reopen lens.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        title="Reopen for editing"
      >
        <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
        Reopen for Editing
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reopen this {lensTypeLabel} for editing?</DialogTitle>
          <DialogDescription>
            The lens will return to <strong>draft</strong> status. Any action
            items already promoted from it will remain — they are not deleted.
            You&apos;ll be able to edit inputs and re-finalize when ready.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={pending}>
            {pending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : null}
            Reopen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
