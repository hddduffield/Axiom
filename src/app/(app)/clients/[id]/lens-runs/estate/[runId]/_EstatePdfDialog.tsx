"use client";

// Phase 14.5 — PDF export dialog placeholder. Replaced in 14.5 commit.

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, isApiError } from "@/lib/api/client";
import type { EstateLensOutput } from "@/lib/estate-lens/types";

interface Props {
  lensId: string;
  output: EstateLensOutput;
  clientName: string;
  onClose: () => void;
}

export function EstatePdfDialog({ lensId, output, clientName, onClose }: Props) {
  const [busy, setBusy] = useState(false);

  async function exportPdf() {
    setBusy(true);
    try {
      const blob = await api.lensRuns.exportPdf(lensId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Estate-Plan-${clientName.replace(/\s+/g, "-")}-${output.scenario_name.replace(/\s+/g, "-")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      onClose();
    } catch (e) {
      toast.error(isApiError(e) ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export Estate Plan PDF</DialogTitle>
        </DialogHeader>
        <p className="text-sm" style={{ color: "var(--text-2)" }}>
          PDF will include all three tabs plus compliance disclosure.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={exportPdf} disabled={busy}>
            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Generate PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
