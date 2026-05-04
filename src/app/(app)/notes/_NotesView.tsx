"use client";

// Notes hub view — converts Claude Design's view-notes-signin.jsx
// `NotesHub` + `NoteCard` + `QuickCompose` + `PromoteDialog` over the
// existing api.notes.* wiring (POST /api/notes,
// POST /api/notes/[id]/promote-to-action).
//
// Preserved from Phase 5e:
//   - Note creation via api.notes.create (RHF + zod resolver)
//   - Promote-to-action flow via api.notes.promoteToAction with the
//     existing field set (category / duration_class / timing_bucket /
//     owner / partner_required / partner_type)
//   - router.refresh() after promote so the action-items count cache
//     in surrounding pages re-reads.
//
// New from Claude Design:
//   - Cormorant page heading + subtitle metric ribbon
//   - Scope chips (saved-views): All / Promotable / Promoted with counts
//   - Filter row: Client (select), Tag chips, Author chips with "Me"
//     pinned first
//   - Search input over body / id / household name
//   - Date-grouped feed (Today / This week / This month / Earlier)
//   - NoteCard primitive with self-author rail accent + blockquote body
//   - Promote dialog with source-note preview card
//
// Schema notes:
//   - notes.tag is free-form `string|null` in the DB; the curated
//     NOTE_TAGS list seeds the chip row + compose dropdown but historic
//     tags outside that list still render as plain chips (their `id`).
//   - The promote schema in this file maps 1:1 to the existing
//     /api/notes/[id]/promote-to-action contract — the Claude Design
//     `partnerReq` boolean is normalized into the "yes"/"no" enum.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Check, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Chip, Count } from "@/components/axiom/Chip";
import { api, isApiError } from "@/lib/api/client";
import type { Advisor, Client, Note } from "@/lib/api/types";

// ─────────── Curated tag set ───────────
const NOTE_TAGS = [
  { id: "client_meeting", label: "Client meeting" },
  { id: "internal", label: "Internal" },
  { id: "partner_touchpoint", label: "Partner touchpoint" },
  { id: "phone_call", label: "Phone call" },
  { id: "email_thread", label: "Email thread" },
  { id: "research", label: "Research" },
];
const TAG_LABEL: Record<string, string> = Object.fromEntries(
  NOTE_TAGS.map((t) => [t.id, t.label]),
);

// ─────────── Date helpers ───────────
function fmtRelative(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const day = Math.floor(ms / 86_400_000);
  if (day < 1) return "today";
  if (day === 1) return "1d ago";
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 4) return `${wk}w ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─────────── Schemas ───────────
const noteSchema = z.object({
  client_id: z.string().uuid("Pick a client"),
  body: z.string().min(1, "Required"),
  tag: z.string().min(1, "Pick a tag"),
});
type NoteValues = z.infer<typeof noteSchema>;

const promoteSchema = z.object({
  description: z.string().min(1, "Required"),
  category: z.string().min(1, "Required"),
  duration_class: z.enum(["one_time", "long_running"]),
  timing_bucket: z.string().min(1, "Required"),
  owner: z.string().min(1, "Required"),
  partner_required: z.enum(["yes", "no"]),
  partner_type: z.string().optional(),
});
type PromoteValues = z.infer<typeof promoteSchema>;

interface Props {
  advisors: Pick<Advisor, "id" | "email" | "first_name" | "last_name">[];
  clients: Pick<Client, "id" | "household_name">[];
  initialNotes: Note[];
  meId: string | null;
}

type Scope = "all" | "promotable" | "promoted";

export function NotesView({ advisors, clients, initialNotes, meId }: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [scope, setScope] = useState<Scope>("all");
  const [filterClient, setFilterClient] = useState<string>("all");
  const [filterAuthor, setFilterAuthor] = useState<string>("all");
  const [filterTag, setFilterTag] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [composing, setComposing] = useState(false);
  const [promoting, setPromoting] = useState<Note | null>(null);

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const advisorById = useMemo(() => new Map(advisors.map((a) => [a.id, a])), [advisors]);
  const authorIds = useMemo(
    () => new Set(notes.map((n) => n.author_advisor_id)),
    [notes],
  );
  const usedTags = useMemo(() => {
    const s = new Set<string>();
    notes.forEach((n) => n.tag && s.add(n.tag));
    return s;
  }, [notes]);

  const promotable = notes.filter((n) => !n.promoted_to_action_item_id).length;
  const promoted = notes.length - promotable;

  // ─────────── Filter pipeline ───────────
  const filtered = useMemo(() => {
    return notes.filter((n) => {
      if (scope === "promotable" && n.promoted_to_action_item_id) return false;
      if (scope === "promoted" && !n.promoted_to_action_item_id) return false;
      if (filterClient !== "all" && n.client_id !== filterClient) return false;
      if (filterAuthor !== "all" && n.author_advisor_id !== filterAuthor) return false;
      if (filterTag !== "all" && n.tag !== filterTag) return false;
      if (search) {
        const s = search.toLowerCase();
        const hh = clientById.get(n.client_id)?.household_name.toLowerCase() ?? "";
        if (
          !n.body.toLowerCase().includes(s) &&
          !n.id.toLowerCase().includes(s) &&
          !hh.includes(s)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [notes, scope, filterClient, filterAuthor, filterTag, search, clientById]);

  // ─────────── Date grouping ───────────
  const groups = useMemo(() => {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startWeek = startToday - 6 * 86_400_000;
    const startMonth = startToday - 30 * 86_400_000;
    const buckets: Record<string, Note[]> = {
      today: [],
      week: [],
      month: [],
      earlier: [],
    };
    for (const n of filtered) {
      const t = new Date(n.created_at).getTime();
      if (t >= startToday) buckets.today.push(n);
      else if (t >= startWeek) buckets.week.push(n);
      else if (t >= startMonth) buckets.month.push(n);
      else buckets.earlier.push(n);
    }
    return [
      { key: "today", label: "Today", items: buckets.today },
      { key: "week", label: "This week", items: buckets.week },
      { key: "month", label: "This month", items: buckets.month },
      { key: "earlier", label: "Earlier", items: buckets.earlier },
    ].filter((g) => g.items.length > 0);
  }, [filtered]);

  function resetFilters() {
    setScope("all");
    setFilterClient("all");
    setFilterAuthor("all");
    setFilterTag("all");
    setSearch("");
  }
  const anyFilter =
    scope !== "all" ||
    filterClient !== "all" ||
    filterAuthor !== "all" ||
    filterTag !== "all" ||
    search !== "";

  // ─────────── Compose form ───────────
  const composeForm = useForm<NoteValues>({
    resolver: zodResolver(noteSchema),
    defaultValues: { client_id: "", body: "", tag: "client_meeting" },
  });
  async function saveNote(values: NoteValues) {
    try {
      const created = await api.notes.create({
        client_id: values.client_id,
        body: values.body,
        tag: values.tag,
      });
      setNotes([created, ...notes]);
      toast.success("Note saved");
      composeForm.reset({ client_id: "", body: "", tag: "client_meeting" });
      setComposing(false);
    } catch (e) {
      toast.error(isApiError(e) ? e.message : "Could not save note");
    }
  }

  // ─────────── Promote form ───────────
  const promoteForm = useForm<PromoteValues>({
    resolver: zodResolver(promoteSchema),
    defaultValues: {
      description: "",
      category: "ENGAGEMENT",
      duration_class: "one_time",
      timing_bucket: "this_week",
      owner: "",
      partner_required: "no",
      partner_type: "",
    },
  });
  function startPromote(n: Note) {
    promoteForm.reset({
      description: n.body,
      category: "ENGAGEMENT",
      duration_class: "one_time",
      timing_bucket: "this_week",
      owner: meId
        ? (advisors.find((a) => a.id === meId)?.email ?? "")
        : "",
      partner_required: "no",
      partner_type: "",
    });
    setPromoting(n);
  }
  async function promote(values: PromoteValues) {
    if (!promoting) return;
    try {
      const res = await api.notes.promoteToAction(promoting.id, {
        category: values.category,
        duration_class: values.duration_class,
        timing_bucket: values.timing_bucket,
        owner: values.owner,
        partner_required: values.partner_required === "yes",
        partner_type: values.partner_type || null,
      });
      setNotes((cur) => cur.map((n) => (n.id === promoting.id ? res.note : n)));
      toast.success("Promoted to action item");
      promoteForm.reset();
      setPromoting(null);
      router.refresh();
    } catch (e) {
      toast.error(isApiError(e) ? e.message : "Could not promote note");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ── PageHead ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1
            className="text-3xl font-medium"
            style={{
              fontFamily: "var(--font-display)",
              letterSpacing: "-0.01em",
              color: "var(--text)",
            }}
          >
            Notes
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-2)" }}>
            {notes.length} notes across{" "}
            {new Set(notes.map((n) => n.client_id)).size} clients ·{" "}
            <span style={{ fontFamily: "var(--font-mono)" }}>{promotable}</span>{" "}
            promotable ·{" "}
            <span style={{ fontFamily: "var(--font-mono)" }}>{promoted}</span>{" "}
            promoted
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setComposing((v) => !v)}
          data-api="POST /api/notes"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {composing ? "Close composer" : "New note"}
        </Button>
      </div>

      {/* ── Inline composer ── */}
      {composing ? (
        <ComposerCard
          form={composeForm}
          clients={clients}
          onSave={saveNote}
          onCancel={() => setComposing(false)}
        />
      ) : null}

      {/* ── Scope chips ── */}
      <div className="flex items-center gap-2 text-xs">
        <span
          className="text-[11px] uppercase"
          style={{ color: "var(--text-3)", letterSpacing: "0.04em" }}
        >
          Scope
        </span>
        <div className="flex flex-wrap gap-1.5">
          <Chip active={scope === "all"} onClick={() => setScope("all")}>
            All notes <Count n={notes.length} />
          </Chip>
          <Chip
            active={scope === "promotable"}
            onClick={() => setScope("promotable")}
          >
            Not yet promoted <Count n={promotable} />
          </Chip>
          <Chip
            active={scope === "promoted"}
            onClick={() => setScope("promoted")}
          >
            Already promoted <Count n={promoted} />
          </Chip>
        </div>
      </div>

      {/* ── Filter row ── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
        <FilterGroup label="Client">
          <Select
            value={filterClient}
            onValueChange={(v) => setFilterClient(v ?? "all")}
          >
            <SelectTrigger className="h-7 w-44 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clients</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.household_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterGroup>

        <FilterSep />

        <FilterGroup label="Tag">
          <Chip active={filterTag === "all"} onClick={() => setFilterTag("all")}>
            All
          </Chip>
          {NOTE_TAGS.filter((t) => usedTags.has(t.id)).map((t) => (
            <Chip
              key={t.id}
              active={filterTag === t.id}
              onClick={() => setFilterTag(t.id)}
            >
              {t.label}
            </Chip>
          ))}
        </FilterGroup>

        <FilterSep />

        <FilterGroup label="Author">
          <Chip
            active={filterAuthor === "all"}
            onClick={() => setFilterAuthor("all")}
          >
            All
          </Chip>
          {meId ? (
            <Chip
              active={filterAuthor === meId}
              onClick={() => setFilterAuthor(meId)}
            >
              Me
            </Chip>
          ) : null}
          {advisors
            .filter((a) => a.id !== meId && authorIds.has(a.id))
            .map((a) => (
              <Chip
                key={a.id}
                active={filterAuthor === a.id}
                onClick={() => setFilterAuthor(a.id)}
              >
                {a.first_name}
              </Chip>
            ))}
        </FilterGroup>
      </div>

      {/* ── Search + reset + count ── */}
      <div className="flex items-center gap-3">
        <div
          className="flex h-8 flex-1 max-w-sm items-center gap-1.5 rounded-md border px-2.5"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <Search className="h-3.5 w-3.5" style={{ color: "var(--text-3)" }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search bodies, ids, or clients…"
            className="flex-1 bg-transparent text-xs outline-none"
            style={{ color: "var(--text)" }}
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="text-xs"
              style={{ color: "var(--text-3)" }}
            >
              ×
            </button>
          ) : null}
        </div>
        {anyFilter ? (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            Reset filters
          </Button>
        ) : null}
        <span
          className="ml-auto text-[11px]"
          style={{ fontFamily: "var(--font-mono)", color: "var(--text-3)" }}
        >
          {filtered.length} of {notes.length}
        </span>
      </div>

      {/* ── Notes feed ── */}
      {filtered.length === 0 ? (
        <div
          className="rounded-md border p-8 text-center"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
            No notes match these filters.
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>
            Try clearing search, widening scope, or removing chips.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={resetFilters}
          >
            Reset filters
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((g) => (
            <div key={g.key} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span
                  className="text-[11px] uppercase"
                  style={{ color: "var(--text-3)", letterSpacing: "0.04em" }}
                >
                  {g.label}
                </span>
                <span
                  className="text-[11px]"
                  style={{ fontFamily: "var(--font-mono)", color: "var(--text-3)" }}
                >
                  {g.items.length}
                </span>
                <span
                  className="ml-1 h-px flex-1"
                  style={{ background: "var(--border)" }}
                />
              </div>
              <div className="flex flex-col gap-2.5">
                {g.items.map((n) => (
                  <NoteCard
                    key={n.id}
                    note={n}
                    client={clientById.get(n.client_id) ?? null}
                    author={advisorById.get(n.author_advisor_id) ?? null}
                    isMe={meId === n.author_advisor_id}
                    onPromote={() => startPromote(n)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Promote dialog ── */}
      <PromoteDialog
        note={promoting}
        client={promoting ? clientById.get(promoting.client_id) ?? null : null}
        advisors={advisors}
        form={promoteForm}
        onSubmit={promote}
        onClose={() => setPromoting(null)}
      />
    </div>
  );
}

// ─────────── Note card ───────────

function NoteCard({
  note,
  client,
  author,
  isMe,
  onPromote,
}: {
  note: Note;
  client: Pick<Client, "id" | "household_name"> | null;
  author: Pick<Advisor, "first_name" | "last_name"> | null;
  isMe: boolean;
  onPromote: () => void;
}) {
  const router = useRouter();
  const tagLabel = note.tag ? TAG_LABEL[note.tag] ?? note.tag : null;
  const isPromoted = !!note.promoted_to_action_item_id;
  return (
    <div
      className="relative overflow-hidden rounded-md border pl-3"
      style={{
        background: "var(--surface)",
        borderColor: isPromoted ? "var(--s-green-bg)" : "var(--border)",
      }}
    >
      <div
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{
          background: isPromoted
            ? "var(--s-green)"
            : isMe
              ? "var(--accent)"
              : "transparent",
        }}
      />
      <div className="px-3 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span style={{ color: "var(--text)", fontWeight: 500 }}>
              {author ? `${author.first_name} ${author.last_name[0]}.` : "Unknown"}
            </span>
            <span style={{ color: "var(--text-3)" }}>·</span>
            {client ? (
              <button
                type="button"
                onClick={() => router.push(`/clients/${client.id}`)}
                className="hover:underline"
                style={{ color: "var(--accent)" }}
              >
                {client.household_name}
              </button>
            ) : (
              <span style={{ color: "var(--text-3)" }}>—</span>
            )}
            {tagLabel ? (
              <>
                <span style={{ color: "var(--text-3)" }}>·</span>
                <Tag>{tagLabel}</Tag>
              </>
            ) : null}
          </div>
          <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
            {fmtRelative(note.created_at)}
          </span>
        </div>
        <blockquote
          className="mt-2 text-[13px]"
          style={{ color: "var(--text)", lineHeight: 1.55 }}
        >
          {note.body}
        </blockquote>
        <div className="mt-2.5 flex items-center gap-2">
          {isPromoted ? (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase"
              style={{
                background: "var(--s-green-bg)",
                color: "var(--s-green)",
                letterSpacing: "0.06em",
              }}
            >
              <Check className="h-3 w-3" />
              Promoted
            </span>
          ) : (
            <Button variant="outline" size="sm" onClick={onPromote}>
              Promote to action item
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────── Composer ───────────

interface ComposerProps {
  form: ReturnType<typeof useForm<NoteValues>>;
  clients: Pick<Client, "id" | "household_name">[];
  onSave: (v: NoteValues) => void;
  onCancel: () => void;
}
function ComposerCard({ form, clients, onSave, onCancel }: ComposerProps) {
  return (
    <div
      className="rounded-md border"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      data-api="POST /api/notes"
    >
      <div
        className="flex items-baseline justify-between border-b px-4 py-2.5"
        style={{ borderColor: "var(--border)" }}
      >
        <h2
          className="text-[12px] font-medium uppercase"
          style={{
            color: "var(--text-2)",
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.06em",
            margin: 0,
          }}
        >
          New note
        </h2>
        <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
          Captures fast — promote later if it should become an action.
        </span>
      </div>
      <div className="p-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSave)} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="client_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel
                      className="text-[11px] uppercase"
                      style={{ color: "var(--text-2)", letterSpacing: "0.04em" }}
                    >
                      Client
                    </FormLabel>
                    <FormControl>
                      <Select
                        value={field.value || undefined}
                        onValueChange={(v) => field.onChange(v ?? "")}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Pick a client" />
                        </SelectTrigger>
                        <SelectContent>
                          {clients.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.household_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tag"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel
                      className="text-[11px] uppercase"
                      style={{ color: "var(--text-2)", letterSpacing: "0.04em" }}
                    >
                      Tag
                    </FormLabel>
                    <FormControl>
                      <Select
                        value={field.value}
                        onValueChange={(v) => field.onChange(v ?? "")}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {NOTE_TAGS.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="body"
              render={({ field }) => (
                <FormItem>
                  <FormLabel
                    className="text-[11px] uppercase"
                    style={{ color: "var(--text-2)", letterSpacing: "0.04em" }}
                  >
                    Body
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      rows={4}
                      autoFocus
                      placeholder="What happened? Decisions, asks, partner needs… capture the substance, not the formatting."
                      {...field}
                    />
                  </FormControl>
                  <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
                    Tip: notes can stay private to you, or you can promote them
                    into action items that show on your dashboard.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={form.formState.isSubmitting}
              >
                <Check className="mr-1.5 h-3.5 w-3.5" />
                {form.formState.isSubmitting ? "Saving…" : "Save note"}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}

// ─────────── Promote dialog ───────────

const PROMOTE_CATEGORIES = [
  "ENGAGEMENT",
  "BUSINESS",
  "TAX",
  "ESTATE",
  "CASH_FLOW",
  "INSURANCE",
  "RETIREMENT",
  "PHILANTHROPY",
  "MEETING",
  "OPERATIONS",
  "COMPLIANCE",
  "PARTNERS",
];

interface PromoteDialogProps {
  note: Note | null;
  client: Pick<Client, "id" | "household_name"> | null;
  advisors: Pick<Advisor, "id" | "email" | "first_name" | "last_name">[];
  form: ReturnType<typeof useForm<PromoteValues>>;
  onSubmit: (v: PromoteValues) => void;
  onClose: () => void;
}

function PromoteDialog({
  note,
  client,
  advisors,
  form,
  onSubmit,
  onClose,
}: PromoteDialogProps) {
  const partnerRequired = form.watch("partner_required");
  return (
    <Dialog open={note !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Promote note to action item</DialogTitle>
          {note && client ? (
            <p className="text-xs" style={{ color: "var(--text-3)" }}>
              From a note on {client.household_name}
            </p>
          ) : null}
        </DialogHeader>

        {note ? (
          <div
            className="rounded-md border p-3"
            style={{
              borderColor: "var(--border)",
              background: "var(--surface-2)",
            }}
          >
            <div
              className="text-[10px] uppercase"
              style={{ color: "var(--text-3)", letterSpacing: "0.06em" }}
            >
              Source note
            </div>
            <blockquote
              className="mt-1.5 text-[13px]"
              style={{ color: "var(--text)" }}
            >
              {note.body}
            </blockquote>
          </div>
        ) : null}

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-3"
            data-api={
              note ? `POST /api/notes/${note.id}/promote-to-action` : undefined
            }
          >
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel
                    className="text-[11px] uppercase"
                    style={{ color: "var(--text-2)", letterSpacing: "0.04em" }}
                  >
                    Action description
                  </FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} />
                  </FormControl>
                  <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
                    Imperative verb, target outcome, next concrete step.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel
                      className="text-[11px] uppercase"
                      style={{ color: "var(--text-2)", letterSpacing: "0.04em" }}
                    >
                      Category
                    </FormLabel>
                    <FormControl>
                      <Select
                        value={field.value}
                        onValueChange={(v) => field.onChange(v ?? "")}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PROMOTE_CATEGORIES.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="timing_bucket"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel
                      className="text-[11px] uppercase"
                      style={{ color: "var(--text-2)", letterSpacing: "0.04em" }}
                    >
                      Timing
                    </FormLabel>
                    <FormControl>
                      <Select
                        value={field.value}
                        onValueChange={(v) => field.onChange(v ?? "")}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="this_week">This week</SelectItem>
                          <SelectItem value="next_30_days">Next 30 days</SelectItem>
                          <SelectItem value="next_60_days">Next 60 days</SelectItem>
                          <SelectItem value="next_90_days">Next 90 days</SelectItem>
                          <SelectItem value="this_year">This year</SelectItem>
                          <SelectItem value="ongoing">Ongoing</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="owner"
              render={({ field }) => (
                <FormItem>
                  <FormLabel
                    className="text-[11px] uppercase"
                    style={{ color: "var(--text-2)", letterSpacing: "0.04em" }}
                  >
                    Owner
                  </FormLabel>
                  <FormControl>
                    <Select
                      value={field.value || undefined}
                      onValueChange={(v) => field.onChange(v ?? "")}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pick an advisor or 'client'" />
                      </SelectTrigger>
                      <SelectContent>
                        {advisors.map((a) => (
                          <SelectItem key={a.id} value={a.email}>
                            {a.first_name} {a.last_name}
                          </SelectItem>
                        ))}
                        <SelectItem value="client">
                          Client (sits with the household)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="duration_class"
              render={({ field }) => (
                <FormItem>
                  <label
                    className="flex items-start gap-2 text-[13px]"
                    style={{ color: "var(--text)" }}
                  >
                    <input
                      type="checkbox"
                      checked={field.value === "long_running"}
                      onChange={(e) =>
                        field.onChange(e.target.checked ? "long_running" : "one_time")
                      }
                      className="mt-0.5"
                    />
                    <span>
                      <strong className="font-medium">Long-running</strong>
                      <span
                        className="mt-0.5 block text-[11px]"
                        style={{ color: "var(--text-3)" }}
                      >
                        Spawns derivative weekly check-ins until completion.
                      </span>
                    </span>
                  </label>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="partner_required"
              render={({ field }) => (
                <FormItem>
                  <label
                    className="flex items-start gap-2 text-[13px]"
                    style={{ color: "var(--text)" }}
                  >
                    <input
                      type="checkbox"
                      checked={field.value === "yes"}
                      onChange={(e) =>
                        field.onChange(e.target.checked ? "yes" : "no")
                      }
                      className="mt-0.5"
                    />
                    <span>
                      <strong className="font-medium">Partner required</strong>
                      <span
                        className="mt-0.5 block text-[11px]"
                        style={{ color: "var(--text-3)" }}
                      >
                        Will surface on the partner-blocked filter and link to
                        the partner record.
                      </span>
                    </span>
                  </label>
                </FormItem>
              )}
            />
            {partnerRequired === "yes" ? (
              <FormField
                control={form.control}
                name="partner_type"
                render={({ field }) => (
                  <FormItem className="ml-6">
                    <FormLabel
                      className="text-[11px] uppercase"
                      style={{ color: "var(--text-2)", letterSpacing: "0.04em" }}
                    >
                      Partner type
                    </FormLabel>
                    <FormControl>
                      <Select
                        value={field.value || undefined}
                        onValueChange={(v) => field.onChange(v ?? "")}
                      >
                        <SelectTrigger className="max-w-[220px]">
                          <SelectValue placeholder="Pick a type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CPA">CPA / Tax</SelectItem>
                          <SelectItem value="ATTORNEY">Attorney</SelectItem>
                          <SelectItem value="INSURANCE">Insurance broker</SelectItem>
                          <SelectItem value="BANKER">Banker</SelectItem>
                          <SelectItem value="OTHER">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={form.formState.isSubmitting}
              >
                <Check className="mr-1.5 h-3.5 w-3.5" />
                {form.formState.isSubmitting ? "Promoting…" : "Create action item"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ─────────── Filter primitives ───────────

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="text-[11px] uppercase"
        style={{ color: "var(--text-3)", letterSpacing: "0.04em" }}
      >
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}
function FilterSep() {
  return (
    <span
      className="hidden h-4 w-px md:block"
      style={{ background: "var(--border)" }}
    />
  );
}
// Chip / Count moved to src/components/axiom/Chip.tsx (Phase 9.13)
function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium"
      style={{
        background: "var(--surface-2)",
        color: "var(--text-2)",
      }}
    >
      {children}
    </span>
  );
}
