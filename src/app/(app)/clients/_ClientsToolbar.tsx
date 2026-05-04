"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, isApiError } from "@/lib/api/client";

const FILTERS: Array<{ value: string | null; label: string }> = [
  { value: null, label: "All" },
  { value: "active", label: "Active" },
  { value: "prospect", label: "Prospect" },
  { value: "inactive", label: "Inactive" },
];

const clientSchema = z.object({
  household_name: z.string().min(1, "Household name is required"),
  status: z.enum(["active", "inactive", "prospect"]),
  archetype: z.enum(["PRE", "MID", "POST", "NONE"]).optional(),
  notes: z.string().optional(),
});
type ClientValues = z.infer<typeof clientSchema>;

export function ClientsToolbar({ activeStatus }: { activeStatus: string | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);

  const form = useForm<ClientValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: { household_name: "", status: "prospect", notes: "" },
  });

  async function onSubmit(values: ClientValues) {
    try {
      const created = await api.clients.create({
        household_name: values.household_name,
        status: values.status,
        archetype: values.archetype ?? null,
        notes: values.notes || null,
      });
      toast.success("Client created");
      setOpen(false);
      form.reset();
      router.push(`/clients/${created.id}`);
    } catch (e) {
      toast.error(isApiError(e) ? e.message : "Could not create client");
    }
  }

  function chipHref(value: string | null): string {
    const sp = new URLSearchParams(params);
    if (value === null) sp.delete("status");
    else sp.set("status", value);
    const q = sp.toString();
    return q ? `/clients?${q}` : "/clients";
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Clients</h1>
        <div className="mt-2 flex gap-2">
          {FILTERS.map((f) => (
            <Link
              key={f.label}
              href={chipHref(f.value)}
              className={
                activeStatus === f.value || (activeStatus == null && f.value == null)
                  ? "rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background"
                  : "rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
              }
            >
              {f.label}
            </Link>
          ))}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger className={buttonVariants()}>+ New Client</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New client</DialogTitle>
            <DialogDescription>
              Create a household record. Status defaults to prospect.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="household_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Household name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Holloway Family" {...field} />
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
                    <FormLabel>Status</FormLabel>
                    <FormControl>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="prospect">Prospect</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="archetype"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Archetype (optional)</FormLabel>
                    <FormControl>
                      <Select onValueChange={field.onChange} value={field.value ?? ""}>
                        <SelectTrigger><SelectValue placeholder="Pick after Stage 1" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PRE">PRE</SelectItem>
                          <SelectItem value="MID">MID</SelectItem>
                          <SelectItem value="POST">POST</SelectItem>
                          <SelectItem value="NONE">NONE</SelectItem>
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
                    <FormLabel>Notes (optional)</FormLabel>
                    <FormControl>
                      <Textarea rows={3} {...field} value={field.value ?? ""} />
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
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? "Saving…" : "Create client"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

