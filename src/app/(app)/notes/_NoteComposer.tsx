"use client";

// Always-visible note composer (Phase 9.20).
//
// Lives at the top of /notes. Replaces the dialog/inline-toggle
// "+ New Note" pattern with a persistent surface for mid-day capture.
//
// Inputs:
//   - Client picker (required, dropdown sorted alphabetically; " Family"
//     suffix stripped in the visible label but preserved in DB).
//   - Body textarea (required, min ~80px, auto-grows to ~200px).
//   - Tag chips: call / email / meeting / review. Single-select per
//     schema reality (notes.tag is `string | null`); clicking the
//     active chip clears it. Multi-tag would need a schema migration.
//   - Convert-to-action-item checkbox: when on, after the note saves
//     we immediately POST /api/notes/[id]/promote-to-action with the
//     standard quick-defaults (category=ENGAGEMENT, duration=one_time,
//     timing=this_week, owner=current advisor email).
//
// Save:
//   - Cmd/Ctrl+Enter inside the textarea triggers submit
//   - Shift+Enter inserts a newline (default textarea behaviour, not
//     intercepted)
//   - Save button = explicit fallback; disabled until client + body
//     are both populated
//
// Optimistic UI:
//   - Caller (NotesView) supplies onCreate(temp, real?) hooks and
//     manages the feed state. The composer doesn't own the feed.

import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Chip } from "@/components/axiom/Chip";
import { api, isApiError } from "@/lib/api/client";
import type { Client, Note } from "@/lib/api/types";

const TAG_OPTIONS = [
  { id: "call", label: "Call" },
  { id: "email", label: "Email" },
  { id: "meeting", label: "Meeting" },
  { id: "review", label: "Review" },
];

const composerSchema = z.object({
  client_id: z.string().uuid("Pick a client"),
  body: z.string().min(1, "Required"),
});
type ComposerValues = z.infer<typeof composerSchema>;

type ClientLookup = Pick<Client, "id" | "household_name">;

interface Props {
  clients: ClientLookup[];
  /** Current advisor's email — used as the owner default when the
   *  promote-to-action toggle is on. Null disables the toggle. */
  meEmail: string | null;
  /** Called with the optimistic note immediately on submit (before API).
   *  Caller appends it to the feed and tracks the temp id. */
  onOptimistic: (note: Note) => void;
  /** Called after api.notes.create returns. The caller swaps the temp
   *  note for the server's authoritative row. If the second arg is
   *  null, the create failed and the temp note should be removed. */
  onResolved: (tempId: string, real: Note | null) => void;
  /** Called after a successful promote-to-action so the caller can
   *  reflect the now-promoted state on the feed entry. */
  onPromoted?: (note: Note) => void;
}

// Strips " Family" suffix from the displayed household name (the
// "Holloway Family" → "Holloway" treatment) without mutating the DB
// value.
function withoutFamily(name: string): string {
  return name.replace(/ Family$/, "");
}

function makeTempId(): string {
  return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function NoteComposer({
  clients,
  meEmail,
  onOptimistic,
  onResolved,
  onPromoted,
}: Props) {
  const form = useForm<ComposerValues>({
    resolver: zodResolver(composerSchema),
    defaultValues: { client_id: "", body: "" },
  });
  const [tag, setTag] = useState<string | null>(null);
  const [convert, setConvert] = useState(false);
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // RHF doesn't bind a ref by default for textarea — we wire it
  // through register's ref so we can also keep our own pointer for
  // focus/auto-grow.
  const bodyRegister = form.register("body");

  const clientId = form.watch("client_id");
  const body = form.watch("body");
  const canSave = !!clientId && body.trim().length > 0 && !busy;

  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  async function onSubmit(values: ComposerValues) {
    if (!canSave) return;
    setBusy(true);
    const tempId = makeTempId();
    const nowIso = new Date().toISOString();
    // Optimistic note — author/created_at filled best-effort; the
    // server's authoritative row replaces this on resolve.
    const optimistic: Note = {
      id: tempId,
      client_id: values.client_id,
      body: values.body,
      tag: tag,
      author_advisor_id: "", // filled server-side from session
      created_at: nowIso,
      promoted_to_action_item_id: null,
    };
    onOptimistic(optimistic);

    // Reset form immediately so the composer is ready for the next
    // capture while the request is in flight.
    form.reset({ client_id: "", body: "" });
    setTag(null);
    const wasConvert = convert;
    setConvert(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    let createdNote: Note;
    try {
      createdNote = await api.notes.create({
        client_id: values.client_id,
        body: values.body,
        tag,
      });
      onResolved(tempId, createdNote);
      toast.success("Note saved");
    } catch (e) {
      onResolved(tempId, null);
      toast.error(isApiError(e) ? e.message : "Could not save note");
      setBusy(false);
      return;
    }

    // Convert-to-action-item second leg.
    if (wasConvert && meEmail) {
      try {
        const promoteRes = await api.notes.promoteToAction(createdNote.id, {
          description: createdNote.body,
          category: "ENGAGEMENT",
          duration_class: "one_time",
          timing_bucket: "this_week",
          owner: meEmail,
          partner_required: false,
          partner_type: null,
        });
        onPromoted?.(promoteRes.note);
        toast.success("Promoted to action item");
      } catch (e) {
        toast.error(
          isApiError(e)
            ? `Saved, but could not promote: ${e.message}`
            : "Saved, but could not promote",
        );
      }
    }
    setBusy(false);
  }

  // Cmd/Ctrl+Enter triggers submit. Shift+Enter falls through to the
  // textarea's default newline behaviour.
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
      e.preventDefault();
      void form.handleSubmit(onSubmit)();
    }
  }

  function handleClear() {
    form.reset({ client_id: "", body: "" });
    setTag(null);
    setConvert(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  return (
    <div
      className="rounded-md border shadow-sm"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
      }}
      data-api="POST /api/notes"
    >
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-3 p-6"
      >
        {/* Client picker */}
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="text-[10px] uppercase"
            style={{ color: "var(--text-3)", letterSpacing: "0.06em" }}
          >
            Client
          </span>
          <Select
            value={clientId || undefined}
            onValueChange={(v) => form.setValue("client_id", v ?? "")}
          >
            <SelectTrigger
              className="h-8 text-xs"
              style={{ minWidth: 220 }}
            >
              <SelectValue placeholder="Select client" />
            </SelectTrigger>
            <SelectContent>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {withoutFamily(c.household_name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Body */}
        <textarea
          {...bodyRegister}
          ref={(el) => {
            bodyRegister.ref(el);
            textareaRef.current = el;
          }}
          onInput={(e) => autoGrow(e.currentTarget)}
          onKeyDown={handleKeyDown}
          rows={3}
          placeholder="Type a note…"
          className="w-full resize-none rounded-md border px-3 py-2.5 text-[13px] outline-none transition-colors placeholder:text-[var(--text-3)] focus:border-[var(--accent)]"
          style={{
            background: "var(--bg)",
            borderColor: "var(--border)",
            color: "var(--text)",
            minHeight: 80,
            lineHeight: 1.55,
          }}
        />

        {/* Tag chips + Convert toggle */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {TAG_OPTIONS.map((t) => (
              <Chip
                key={t.id}
                active={tag === t.id}
                onClick={() => setTag((cur) => (cur === t.id ? null : t.id))}
              >
                {t.label}
              </Chip>
            ))}
          </div>
          <label
            className="inline-flex cursor-pointer items-center gap-2 text-xs select-none"
            style={{ color: "var(--text-2)" }}
          >
            <input
              type="checkbox"
              checked={convert}
              onChange={(e) => setConvert(e.target.checked)}
              disabled={!meEmail}
            />
            Convert to action item
          </label>
        </div>

        {/* Save row */}
        <div
          className="flex items-center justify-between gap-3 border-t pt-3"
          style={{ borderColor: "var(--border)" }}
        >
          <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
            <kbd
              className="rounded px-1.5 py-0.5 text-[10px]"
              style={{
                background: "var(--surface-2)",
                fontFamily: "var(--font-mono)",
                color: "var(--text-2)",
              }}
            >
              ⌘ Enter
            </kbd>{" "}
            to save · Shift+Enter for newline
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              disabled={busy}
            >
              Clear
            </Button>
            <Button type="submit" size="sm" disabled={!canSave}>
              <Check className="mr-1.5 h-3.5 w-3.5" />
              {busy
                ? "Saving…"
                : convert
                  ? "Save & promote"
                  : "Save note"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
