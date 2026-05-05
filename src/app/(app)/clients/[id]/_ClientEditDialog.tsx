"use client";

// Phase 11.1 — Client edit dialog.
//
// Pre-fills from the existing client record. Submitting fires
// api.clients.update(id, body) with ONLY the fields that actually
// changed (no-op short-circuits the API call). On success, refreshes
// the page's server-data via router.refresh().
//
// Schema scope: household_name + lead_advisor_id + archetype + status +
// notes. The clients table has no `aum`, `entity_count`, or
// `last_activity_at` columns — those v1.5 backlog gaps remain. The
// Status dropdown excludes "inactive" because the dedicated Archive
// flow owns that transition (typo-confirm guard).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, isApiError } from "@/lib/api/client";
import type { Client, ClientsApi } from "@/lib/api/types";

interface AdvisorOption {
  id: string;
  first_name: string;
  last_name: string;
}

const editClientSchema = z.object({
  household_name: z.string().min(1, "Required"),
  archetype: z.enum(["PRE", "MID", "POST", "NONE"]),
  status: z.enum(["active", "prospect"]),
  lead_advisor_id: z.string().uuid("Pick a lead advisor"),
  notes: z.string(),
});
type EditClientValues = z.infer<typeof editClientSchema>;

function buildPatch(
  values: EditClientValues,
  client: Client,
): ClientsApi.UpdateRequest | null {
  const patch: ClientsApi.UpdateRequest = {};
  if (values.household_name !== client.household_name) patch.household_name = values.household_name;
  if (values.archetype !== (client.archetype ?? "NONE")) patch.archetype = values.archetype;
  if (values.status !== client.status) patch.status = values.status;
  if (values.lead_advisor_id !== client.lead_advisor_id) patch.lead_advisor_id = values.lead_advisor_id;
  const cleanNotes = values.notes.trim().length > 0 ? values.notes : null;
  if (cleanNotes !== (client.notes ?? null)) patch.notes = cleanNotes;
  return Object.keys(patch).length === 0 ? null : patch;
}

export function ClientEditDialog({
  client,
  advisors,
}: {
  client: Client;
  advisors: AdvisorOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Status guard — if a client is currently inactive ("archived"), the
  // form's status dropdown only offers active / prospect. The Restore
  // flow handles inactive→active transitions explicitly.
  const initialStatus: "active" | "prospect" =
    client.status === "active" ? "active" : "prospect";

  const form = useForm<EditClientValues>({
    resolver: zodResolver(editClientSchema),
    defaultValues: {
      household_name: client.household_name,
      archetype: client.archetype ?? "NONE",
      status: initialStatus,
      lead_advisor_id: client.lead_advisor_id,
      notes: client.notes ?? "",
    },
  });

  async function onSubmit(values: EditClientValues) {
    const patch = buildPatch(values, client);
    if (patch === null) {
      toast.info("No changes to save.");
      setOpen(false);
      return;
    }
    try {
      await api.clients.update(client.id, patch);
      toast.success(`${values.household_name} updated.`);
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(isApiError(e) ? e.message : "Could not update client.");
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      // Reset to current client values whenever dialog opens — picks up
      // any router.refresh() data the parent re-rendered with.
      form.reset({
        household_name: client.household_name,
        archetype: client.archetype ?? "NONE",
        status: initialStatus,
        lead_advisor_id: client.lead_advisor_id,
        notes: client.notes ?? "",
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => handleOpenChange(true)}
        data-api="PATCH /api/clients/[id]"
      >
        <Pencil className="mr-1.5 h-3.5 w-3.5" />
        Edit
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {client.household_name}</DialogTitle>
          <DialogDescription>
            Update household profile details. Saving with no changes is a no-op.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
          >
            <FormField
              control={form.control}
              name="household_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel
                    className="text-[11px] uppercase"
                    style={{ color: "var(--text-2)", letterSpacing: "0.04em" }}
                  >
                    Household name
                  </FormLabel>
                  <FormControl>
                    <Input autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="archetype"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel
                      className="text-[11px] uppercase"
                      style={{ color: "var(--text-2)", letterSpacing: "0.04em" }}
                    >
                      Archetype
                    </FormLabel>
                    <FormControl>
                      <Select onValueChange={(v) => field.onChange(v ?? "")} value={field.value}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PRE">PRE — pre-liquidity</SelectItem>
                          <SelectItem value="MID">MID — mid-life</SelectItem>
                          <SelectItem value="POST">POST — post-liquidity</SelectItem>
                          <SelectItem value="NONE">NONE — undetermined</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel
                      className="text-[11px] uppercase"
                      style={{ color: "var(--text-2)", letterSpacing: "0.04em" }}
                    >
                      Status
                    </FormLabel>
                    <FormControl>
                      <Select onValueChange={(v) => field.onChange(v ?? "")} value={field.value}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="prospect">Prospect</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <p
                      className="text-[11px]"
                      style={{ color: "var(--text-3)" }}
                    >
                      To archive, use the Archive button on the page header.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="lead_advisor_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel
                    className="text-[11px] uppercase"
                    style={{ color: "var(--text-2)", letterSpacing: "0.04em" }}
                  >
                    Lead advisor
                  </FormLabel>
                  <FormControl>
                    <Select onValueChange={(v) => field.onChange(v ?? "")} value={field.value}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {advisors.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.first_name} {a.last_name}
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
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel
                    className="text-[11px] uppercase"
                    style={{ color: "var(--text-2)", letterSpacing: "0.04em" }}
                  >
                    Notes
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="Internal household notes (optional)…"
                      {...field}
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
                onClick={() => setOpen(false)}
                disabled={form.formState.isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
