"use client";

// Phase 18.7 — Inline-editable lens scenario title.
//
// Click the title to edit; Enter saves, Esc cancels. "Auto-name"
// button regenerates from current inputs (advisor's typed text is
// replaced; they can still hit cancel before save). Disabled when
// the lens is archived.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, Pencil, Sparkles, X } from "lucide-react";

import { api, isApiError } from "@/lib/api/client";

export function LensScenarioTitle({
  lensRunId,
  currentName,
  computeAutoName,
  canEdit,
}: {
  lensRunId: string;
  currentName: string;
  /** Synchronous fn that returns the auto-name from the lens's current
   *  output state. Called when the advisor clicks "Auto-name". */
  computeAutoName: () => string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(currentName);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // Re-sync the draft buffer if the canonical name changes upstream
  // (e.g., after a router.refresh()).
  useEffect(() => {
    if (!editing) setDraft(currentName);
  }, [currentName, editing]);

  async function save() {
    const next = draft.trim();
    if (next.length === 0 || next === currentName) {
      setEditing(false);
      setDraft(currentName);
      return;
    }
    setSaving(true);
    try {
      await api.lensRuns.rename(lensRunId, { name: next });
      toast.success("Scenario renamed.");
      setEditing(false);
      router.refresh();
    } catch (e) {
      toast.error(isApiError(e) ? e.message : "Could not rename scenario.");
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setDraft(currentName);
    setEditing(false);
  }

  function onAutoName() {
    setDraft(computeAutoName());
  }

  if (!canEdit) {
    return (
      <span
        className="text-[20px] font-medium"
        style={{
          fontFamily: "var(--font-display)",
          color: "var(--text)",
          letterSpacing: "-0.01em",
        }}
      >
        {currentName}
      </span>
    );
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Click to rename"
        className="group inline-flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-[var(--surface-2)]"
        style={{ color: "var(--text)" }}
      >
        <span
          className="text-[20px] font-medium"
          style={{
            fontFamily: "var(--font-display)",
            color: "var(--text)",
            letterSpacing: "-0.01em",
          }}
        >
          {currentName}
        </span>
        <Pencil
          className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100"
          style={{ color: "var(--text-3)" }}
        />
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-2">
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void save();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        disabled={saving}
        maxLength={120}
        className="rounded border bg-transparent px-2 py-1 text-[18px] focus:outline-none focus:ring-1"
        style={{
          fontFamily: "var(--font-display)",
          color: "var(--text)",
          borderColor: "var(--border)",
          minWidth: 320,
        }}
      />
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving || draft.trim().length === 0}
        title="Save"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-[var(--surface-2)] disabled:opacity-40"
        style={{ color: "var(--s-green)" }}
      >
        {saving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Check className="h-3.5 w-3.5" />
        )}
      </button>
      <button
        type="button"
        onClick={cancel}
        disabled={saving}
        title="Cancel"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-[var(--surface-2)] disabled:opacity-40"
        style={{ color: "var(--text-3)" }}
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onAutoName}
        disabled={saving}
        title="Auto-name from current inputs"
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] hover:bg-[var(--surface-2)] disabled:opacity-40"
        style={{ color: "var(--text-2)" }}
      >
        <Sparkles className="h-3 w-3" />
        Auto-name
      </button>
    </div>
  );
}
