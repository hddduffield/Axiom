"use client";

// Phase 11.2 — Client archive dialog with typo-confirm guard.
//
// Soft-delete: api.clients.softDelete(id) → DELETE /api/clients/[id]
// → UPDATE clients SET status='inactive'. All cascading data
// (action_items, notes, plans, partners) is preserved by the schema's
// non-cascading FK chain. Restorable via the Restore dialog landing in
// Phase 11.3.
//
// Typo-confirm: the destructive button stays disabled until the user
// types the household name verbatim into the confirmation input.
// Prevents accidental archives from a misclicked button.

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
import type { Client } from "@/lib/api/types";

export function ClientArchiveDialog({ client }: { client: Client }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const matches = confirmText.trim() === client.household_name.trim();

  function handleOpenChange(next: boolean) {
    if (submitting) return;
    setOpen(next);
    if (!next) setConfirmText("");
  }

  async function onConfirm() {
    if (!matches || submitting) return;
    setSubmitting(true);
    try {
      await api.clients.softDelete(client.id);
      toast.success(`${client.household_name} archived.`);
      // Navigate away from the now-archived detail page so the advisor
      // lands in a coherent state (the list, with the Archived filter
      // available if they want to find it again).
      router.push("/clients");
    } catch (e) {
      toast.error(isApiError(e) ? e.message : "Could not archive client.");
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => handleOpenChange(true)}
        data-api="DELETE /api/clients/[id]"
        style={{
          color: "var(--s-red)",
          borderColor: "var(--border-strong)",
        }}
      >
        <Archive className="mr-1.5 h-3.5 w-3.5" />
        Archive
      </Button>
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
              <DialogTitle>Archive {client.household_name}?</DialogTitle>
              <DialogDescription className="mt-1.5">
                This client will be moved to{" "}
                <span style={{ fontFamily: "var(--font-mono)" }}>archived</span>{" "}
                status. All related data (action items, notes, plans, partners)
                is preserved — they just won&rsquo;t appear in active client
                lists. You can restore them later from the archived filter on
                the clients list page.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label
            htmlFor="archive-confirm"
            className="text-[11px] uppercase"
            style={{ color: "var(--text-2)", letterSpacing: "0.04em" }}
          >
            Type{" "}
            <span style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}>
              {client.household_name}
            </span>{" "}
            to confirm
          </Label>
          <Input
            id="archive-confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={client.household_name}
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
            {submitting ? "Archiving…" : "Archive client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
