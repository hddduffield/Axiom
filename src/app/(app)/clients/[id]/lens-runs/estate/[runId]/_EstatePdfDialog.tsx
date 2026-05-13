"use client";

// Phase 14.5 — Pre-export PDF modal.
//
// Lets the advisor pick which tabs to include + which recommendations to
// include. Builds query params and downloads via api.lensRuns.exportPdf.

import { useState } from "react";
import { Loader2, FileDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isApiError } from "@/lib/api/client";
import type { EstateLensOutput } from "@/lib/estate-lens/types";

interface Props {
  lensId: string;
  output: EstateLensOutput;
  clientName: string;
  onClose: () => void;
}

export function EstatePdfDialog({ lensId, output, clientName, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const [includeProjection, setIncludeProjection] = useState(true);
  const [includeTrustPlanning, setIncludeTrustPlanning] = useState(true);
  const [includeTaxPayment, setIncludeTaxPayment] = useState(true);
  const [selectedRecs, setSelectedRecs] = useState<Set<string>>(
    new Set(output.recommendations.map((r) => r.id)),
  );

  const today = new Date().toISOString().slice(0, 10);
  const defaultName = `Estate-Plan-${clientName.replace(/\s+/g, "-")}-${today}`;
  const [filename, setFilename] = useState(defaultName);

  function toggleRec(id: string) {
    setSelectedRecs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function exportPdf() {
    setBusy(true);
    try {
      const params = new URLSearchParams();
      params.set("include_projection", includeProjection ? "1" : "0");
      params.set("include_trust_planning", includeTrustPlanning ? "1" : "0");
      params.set("include_tax_payment", includeTaxPayment ? "1" : "0");
      if (output.recommendations.length > 0) {
        params.set("recommendation_ids", Array.from(selectedRecs).join(","));
      }
      const res = await fetch(`/api/lens-runs/${lensId}/pdf?${params.toString()}`, {
        credentials: "same-origin",
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF downloaded");
      onClose();
    } catch (e) {
      toast.error(isApiError(e) ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Export Estate Plan PDF</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label
              className="mb-1 block text-[10px] uppercase"
              style={{
                color: "var(--text-3)",
                letterSpacing: "0.06em",
                fontFamily: "var(--font-mono)",
              }}
            >
              Filename
            </label>
            <input
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              className="w-full rounded border px-2 py-1.5 text-[13px]"
              style={{
                borderColor: "var(--border)",
                fontFamily: "var(--font-mono)",
              }}
            />
          </div>

          <div>
            <label
              className="mb-2 block text-[10px] uppercase"
              style={{
                color: "var(--text-3)",
                letterSpacing: "0.06em",
                fontFamily: "var(--font-mono)",
              }}
            >
              Include sections
            </label>
            <div className="space-y-2">
              <Toggle
                label="01. Estate Tax Projection"
                checked={includeProjection}
                onChange={setIncludeProjection}
              />
              <Toggle
                label="02. Trust Planning Calculator"
                checked={includeTrustPlanning}
                onChange={setIncludeTrustPlanning}
              />
              <Toggle
                label="03. Tax Payment Strategy"
                checked={includeTaxPayment}
                onChange={setIncludeTaxPayment}
              />
            </div>
          </div>

          {output.recommendations.length > 0 ? (
            <div>
              <label
                className="mb-2 block text-[10px] uppercase"
                style={{
                  color: "var(--text-3)",
                  letterSpacing: "0.06em",
                  fontFamily: "var(--font-mono)",
                }}
              >
                Recommendations to include ({selectedRecs.size}/{output.recommendations.length})
              </label>
              <div className="max-h-40 space-y-1 overflow-auto rounded border p-2" style={{ borderColor: "var(--border)" }}>
                {output.recommendations.map((r) => (
                  <Toggle
                    key={r.id}
                    label={r.label}
                    checked={selectedRecs.has(r.id)}
                    onChange={() => toggleRec(r.id)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <p className="text-[11px] italic" style={{ color: "var(--text-3)" }}>
            Compliance disclaimer + tracking ID {output.tracking_id} are
            automatically included on every page.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={exportPdf} disabled={busy}>
            {busy ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileDown className="mr-1.5 h-3.5 w-3.5" />
            )}
            Generate PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[13px]" style={{ color: "var(--text)" }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
