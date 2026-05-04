"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { api, isApiError } from "@/lib/api/client";

const schema = z.object({
  client_id: z.string().uuid("Pick a client"),
  fact_review_filename: z.string().min(1, "Required (used for record-keeping)"),
});
type Values = z.infer<typeof schema>;

interface ClientOption {
  id: string;
  household_name: string;
}

export function GenerateForm({ clients }: { clients: ClientOption[] }) {
  const router = useRouter();
  const [cpFile, setCpFile] = useState<File | null>(null);
  const [recsFile, setRecsFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { client_id: "", fact_review_filename: "" },
  });

  async function onSubmit(values: Values) {
    if (!cpFile) {
      toast.error("ClientProfile JSON file is required");
      return;
    }
    if (!recsFile) {
      toast.error("SelectedRecommendations JSON file is required");
      return;
    }
    setSubmitting(true);
    try {
      const accepted = await api.plans.generate({
        clientId: values.client_id,
        factReviewFilename: values.fact_review_filename,
        clientprofile: cpFile,
        selectedRecommendations: recsFile,
      });
      toast.success(
        "Plan queued for generation. Run `npm run generate-pending` to process.",
      );
      router.push(`/clients/${values.client_id}`);
      router.refresh();
      void accepted;
    } catch (e) {
      toast.error(isApiError(e) ? e.message : "Could not queue plan");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormField
          control={form.control}
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
          control={form.control}
          name="fact_review_filename"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Fact Review filename</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g. Holloway_FactReview_2026-Q3.docx"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormItem>
          <FormLabel>ClientProfile JSON</FormLabel>
          <FormControl>
            <Input
              type="file"
              accept="application/json,.json"
              onChange={(e) => setCpFile(e.target.files?.[0] ?? null)}
            />
          </FormControl>
          {cpFile ? (
            <p className="text-xs text-muted-foreground">
              {cpFile.name} · {(cpFile.size / 1024).toFixed(1)} KB
            </p>
          ) : null}
        </FormItem>

        <FormItem>
          <FormLabel>SelectedRecommendations JSON</FormLabel>
          <FormControl>
            <Input
              type="file"
              accept="application/json,.json"
              onChange={(e) => setRecsFile(e.target.files?.[0] ?? null)}
            />
          </FormControl>
          {recsFile ? (
            <p className="text-xs text-muted-foreground">
              {recsFile.name} · {(recsFile.size / 1024).toFixed(1)} KB
            </p>
          ) : null}
        </FormItem>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Queueing…" : "Queue plan generation"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
