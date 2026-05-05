"use client";

// Phase 11.3 — Client restore dialog.
//
// Reactivates an archived (status='inactive') client. Less destructive
// than archive — just a confirmation prompt, no typo-guard. PATCH
// /api/clients/[id] with { status: 'active' }; UI refreshes server data
// in place via router.refresh() so the page renders without the
// archived treatment.

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
import type { Client } from "@/lib/api/types";

export function ClientRestoreDialog({ client }: { client: Client }) {
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
      await api.clients.update(client.id, { status: "active" });
      toast.success(`${client.household_name} restored to active.`);
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(isApiError(e) ? e.message : "Could not restore client.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button
        type="button"
        size="sm"
        onClick={() => handleOpenChange(true)}
        data-api="PATCH /api/clients/[id]"
      >
        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
        Restore
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Restore {client.household_name}?</DialogTitle>
          <DialogDescription>
            This client will be moved back to{" "}
            <span style={{ fontFamily: "var(--font-mono)" }}>active</span>{" "}
            status and will reappear in active client lists. All preserved
            data (action items, notes, plans, partners) becomes visible
            again immediately.
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
