"use client";

// Phase 18.1 — Promote Recommendations confirmation dialog.
//
// Shown only on plans where status === 'approved'. Triggers the
// retroactive promotion endpoint. The endpoint is idempotent — clicks
// on a fully-promoted plan return { new_count: 0, existing_count: N }
// and the toast says "Already promoted; nothing new added".

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ListPlus, Loader2 } from "lucide-react";

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

export function PromoteRecommendationsDialog({ planId }: { planId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function onConfirm() {
    setPending(true);
    try {
      const res = await api.plans.promoteRecommendations(planId);
      if (res.promotion_errors.length > 0) {
        toast.error(res.promotion_errors[0]);
        return;
      }
      if (res.new_count === 0 && res.existing_count > 0) {
        toast.info(
          `Already promoted · ${res.existing_count} of ${res.total_recs} recommendations are in action items`,
        );
      } else if (res.new_count > 0) {
        toast.success(
          `Promoted ${res.new_count} new action item${res.new_count === 1 ? "" : "s"}` +
            (res.existing_count > 0
              ? ` (${res.existing_count} previously promoted)`
              : ""),
        );
      } else {
        toast.warning("Plan has no recommendations to promote.");
      }
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(isApiError(e) ? e.message : "Promotion failed.");
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
        title="Re-run promotion of REC- recommendations into action items"
      >
        <ListPlus className="mr-1.5 h-3.5 w-3.5" />
        Promote Recommendations
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Promote recommendations to action items?</DialogTitle>
          <DialogDescription>
            This creates action items for any REC- recommendations in this plan
            that haven&apos;t been promoted yet. Plans previously approved will
            safely add only new items — existing action items are preserved
            untouched.
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
            Promote
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
