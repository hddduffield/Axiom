"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { api, isApiError } from "@/lib/api/client";
import type { Advisor, Client, Note } from "@/lib/api/types";

const noteSchema = z.object({
  client_id: z.string().uuid("Pick a client"),
  body: z.string().min(1, "Required"),
  tag: z.string().optional(),
});
type NoteValues = z.infer<typeof noteSchema>;

const promoteSchema = z.object({
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
}

export function NotesView({ advisors, clients, initialNotes }: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [filterClient, setFilterClient] = useState<string>("all");
  const [filterAuthor, setFilterAuthor] = useState<string>("all");
  const [filterTag, setFilterTag] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [promoting, setPromoting] = useState<Note | null>(null);

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const advisorById = useMemo(() => new Map(advisors.map((a) => [a.id, a])), [advisors]);
  const tags = useMemo(() => {
    const s = new Set<string>();
    notes.forEach((n) => n.tag && s.add(n.tag));
    return [...s].sort();
  }, [notes]);

  const filtered = notes.filter((n) => {
    if (filterClient !== "all" && n.client_id !== filterClient) return false;
    if (filterAuthor !== "all" && n.author_advisor_id !== filterAuthor) return false;
    if (filterTag !== "all" && n.tag !== filterTag) return false;
    return true;
  });

  const createForm = useForm<NoteValues>({
    resolver: zodResolver(noteSchema),
    defaultValues: { client_id: "", body: "", tag: "" },
  });

  async function createNote(values: NoteValues) {
    try {
      const created = await api.notes.create({
        client_id: values.client_id,
        body: values.body,
        tag: values.tag ? values.tag : null,
      });
      setNotes([created, ...notes]);
      toast.success("Note saved");
      createForm.reset();
      setCreateOpen(false);
    } catch (e) {
      toast.error(isApiError(e) ? e.message : "Could not save note");
    }
  }

  const promoteForm = useForm<PromoteValues>({
    resolver: zodResolver(promoteSchema),
    defaultValues: {
      category: "",
      duration_class: "one_time",
      timing_bucket: "next_30_days",
      owner: "",
      partner_required: "no",
      partner_type: "",
    },
  });

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
      setNotes(notes.map((n) => (n.id === promoting.id ? res.note : n)));
      toast.success("Promoted to action item");
      promoteForm.reset();
      setPromoting(null);
      router.refresh();
    } catch (e) {
      toast.error(isApiError(e) ? e.message : "Could not promote note");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Notes</h1>
          <p className="text-muted-foreground">
            Free-form notes attached to clients. Promote to action items when
            ready.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger className={buttonVariants()}>+ New Note</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New note</DialogTitle>
            </DialogHeader>
            <Form {...createForm}>
              <form
                onSubmit={createForm.handleSubmit(createNote)}
                className="flex flex-col gap-4"
              >
                <FormField
                  control={createForm.control}
                  name="client_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Client</FormLabel>
                      <FormControl>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a client" />
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
                  control={createForm.control}
                  name="body"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Note</FormLabel>
                      <FormControl>
                        <Textarea rows={5} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="tag"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tag (optional)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. call, email, meeting"
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setCreateOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createForm.formState.isSubmitting}>
                    Save
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <FilterSelect
          label="Client"
          value={filterClient}
          onChange={setFilterClient}
          options={[
            { value: "all", label: "All clients" },
            ...clients.map((c) => ({ value: c.id, label: c.household_name })),
          ]}
        />
        <FilterSelect
          label="Author"
          value={filterAuthor}
          onChange={setFilterAuthor}
          options={[
            { value: "all", label: "All authors" },
            ...advisors.map((a) => ({
              value: a.id,
              label: `${a.first_name} ${a.last_name}`,
            })),
          ]}
        />
        <FilterSelect
          label="Tag"
          value={filterTag}
          onChange={setFilterTag}
          options={[
            { value: "all", label: "Any tag" },
            ...tags.map((t) => ({ value: t, label: t })),
          ]}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notes match these filters.</p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((n) => (
            <li key={n.id}>
              <Card>
                <CardContent className="space-y-3 pt-6">
                  <p className="text-sm">
                    {n.body.length > 200 ? `${n.body.slice(0, 200)}…` : n.body}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      {clientById.get(n.client_id)?.household_name ?? "—"}
                    </span>
                    <span>·</span>
                    <span>
                      {(() => {
                        const a = advisorById.get(n.author_advisor_id);
                        return a ? `${a.first_name} ${a.last_name}` : "?";
                      })()}
                    </span>
                    <span>·</span>
                    <span>
                      {new Date(n.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                    {n.tag ? <Badge variant="outline">{n.tag}</Badge> : null}
                    {n.promoted_to_action_item_id ? (
                      <Badge variant="secondary">→ promoted</Badge>
                    ) : null}
                  </div>
                  {!n.promoted_to_action_item_id ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPromoting(n)}
                    >
                      Promote to action item
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {/* Promote dialog */}
      <Dialog open={promoting !== null} onOpenChange={(o) => !o && setPromoting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Promote note to action item</DialogTitle>
            <DialogDescription>
              The note's body becomes the action item's description by default.
            </DialogDescription>
          </DialogHeader>
          <Form {...promoteForm}>
            <form
              onSubmit={promoteForm.handleSubmit(promote)}
              className="flex flex-col gap-4"
            >
              <FormField
                control={promoteForm.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. ENGAGEMENT, TAX, ESTATE" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={promoteForm.control}
                name="owner"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Owner</FormLabel>
                    <FormControl>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                          <SelectValue placeholder="Pick an advisor or 'client'" />
                        </SelectTrigger>
                        <SelectContent>
                          {advisors.map((a) => (
                            <SelectItem key={a.id} value={a.email}>
                              {a.first_name} {a.last_name}
                            </SelectItem>
                          ))}
                          <SelectItem value="client">client</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={promoteForm.control}
                name="duration_class"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration</FormLabel>
                    <FormControl>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="one_time">One time</SelectItem>
                          <SelectItem value="long_running">Long running</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={promoteForm.control}
                name="timing_bucket"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Timing</FormLabel>
                    <FormControl>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
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
              <FormField
                control={promoteForm.control}
                name="partner_required"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Partner required?</FormLabel>
                    <FormControl>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="no">No</SelectItem>
                          <SelectItem value="yes">Yes</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={promoteForm.control}
                name="partner_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Partner type (if required)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. CPA, Estate Attorney"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setPromoting(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={promoteForm.formState.isSubmitting}>
                  Promote
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface FilterSelectProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}

function FilterSelect({ label, value, onChange, options }: FilterSelectProps) {
  return (
    <div className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={(v) => onChange(v ?? "")}>
        <SelectTrigger className="h-8 w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
