"use client";

// Phase 18.5 — "What this concludes" executive summary banner.
//
// Renders at the top of a lens view when the lens has a non-draft
// status. Cream tone (matches the client context block). Inline edit
// via pencil icon → modal; regenerate via small link (only shown for
// ai-generated content). Auto-generated text carries a compliance
// stub ("Auto-generated · Edit before client delivery").

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil, RotateCcw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { api, isApiError } from "@/lib/api/client";

export interface LensExecutiveSummaryShape {
  text: string;
  generated_at: string;
  generated_by: "ai" | "manual";
}

export function LensSummaryBanner({
  lensRunId,
  summary,
  canEdit,
}: {
  lensRunId: string;
  summary: LensExecutiveSummaryShape | null | undefined;
  /** When false (e.g., archived), edit + regenerate are hidden. */
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [editText, setEditText] = useState(summary?.text ?? "");
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  async function regenerate() {
    setRegenerating(true);
    try {
      await api.lensRuns.generateSummary(lensRunId);
      toast.success("Summary regenerated.");
      router.refresh();
    } catch (e) {
      toast.error(isApiError(e) ? e.message : "Could not regenerate summary.");
    } finally {
      setRegenerating(false);
    }
  }

  async function generateInitial() {
    setRegenerating(true);
    try {
      await api.lensRuns.generateSummary(lensRunId);
      toast.success("Summary generated.");
      router.refresh();
    } catch (e) {
      toast.error(isApiError(e) ? e.message : "Could not generate summary.");
    } finally {
      setRegenerating(false);
    }
  }

  async function saveEdit() {
    setSaving(true);
    try {
      await api.lensRuns.updateSummary(lensRunId, { text: editText });
      toast.success("Summary updated.");
      setEditOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(isApiError(e) ? e.message : "Could not save summary.");
    } finally {
      setSaving(false);
    }
  }

  function openEditor() {
    setEditText(summary?.text ?? "");
    setEditOpen(true);
  }

  if (!summary) {
    if (!canEdit) return null;
    return (
      <div
        className="rounded-md border border-dashed px-4 py-3 text-[13px]"
        style={{
          borderColor: "var(--border)",
          background: "var(--surface)",
          color: "var(--text-3)",
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <p>
            <span style={{ color: "var(--text-2)" }}>
              No executive summary yet
            </span>
            <span> — generate a 2-3 sentence plain-English summary for the team.</span>
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={generateInitial}
            disabled={regenerating}
          >
            {regenerating ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            )}
            Generate summary
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className="rounded-md border px-5 py-4"
        style={{
          borderColor: "var(--border)",
          background: "var(--n-25)",
        }}
      >
        <div
          className="mb-2 flex items-center justify-between text-[11px] uppercase"
          style={{
            color: "var(--text-3)",
            letterSpacing: "0.06em",
            fontFamily: "var(--font-mono)",
          }}
        >
          <span>What this concludes</span>
          {summary.generated_by === "ai" ? (
            <span style={{ color: "var(--gold)" }}>
              Auto-generated · Edit before client delivery
            </span>
          ) : (
            <span>Edited by advisor</span>
          )}
        </div>
        <p
          className="text-[15px] leading-relaxed"
          style={{
            color: "var(--text)",
            fontFamily: "var(--font-display)",
          }}
        >
          {summary.text}
        </p>
        {canEdit ? (
          <div
            className="mt-3 flex items-center gap-3 text-[11px]"
            style={{ color: "var(--text-3)" }}
          >
            <button
              type="button"
              onClick={openEditor}
              className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
              style={{ color: "var(--psa-navy)" }}
            >
              <Pencil className="h-3 w-3" />
              Edit
            </button>
            {summary.generated_by === "ai" ? (
              <button
                type="button"
                onClick={regenerate}
                disabled={regenerating}
                className="inline-flex items-center gap-1 underline-offset-2 hover:underline disabled:opacity-50"
              >
                {regenerating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RotateCcw className="h-3 w-3" />
                )}
                Regenerate
              </button>
            ) : null}
            <span className="ml-auto" style={{ color: "var(--text-3)" }}>
              {new Date(summary.generated_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>
        ) : null}
      </div>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit executive summary</DialogTitle>
            <DialogDescription>
              The summary appears on the lens view and on the client&apos;s Overview. Keep it 2-3 sentences.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={5}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            placeholder="2-3 sentence plain-English summary…"
          />
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEditOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={saveEdit}
              disabled={saving || editText.trim().length === 0}
            >
              {saving ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
