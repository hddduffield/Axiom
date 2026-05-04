"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Check } from "lucide-react";

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
import { createClient } from "@/lib/supabase/client";

// Web auth — magic link via supabase.auth.signInWithOtp + emailRedirectTo
// pointing at /auth/callback (which exchanges the code via
// exchangeCodeForSession). Mobile takes a different path (OTP code, see
// mobile/app/(auth)/sign-in.tsx); the web path stays click-the-link.

const signInSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
});

type SignInValues = z.infer<typeof signInSchema>;

interface SignInFormProps {
  redirectTo: string;
}

export function SignInForm({ redirectTo }: SignInFormProps) {
  const [linkSent, setLinkSent] = useState(false);
  const [sentEmail, setSentEmail] = useState("");

  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: SignInValues) {
    const supabase = createClient();
    const callbackUrl = new URL("/auth/callback", window.location.origin);
    callbackUrl.searchParams.set("next", redirectTo);

    const { error } = await supabase.auth.signInWithOtp({
      email: values.email,
      options: { emailRedirectTo: callbackUrl.toString() },
    });

    if (error) {
      toast.error("Couldn't send sign-in link", { description: error.message });
      return;
    }

    setSentEmail(values.email);
    setLinkSent(true);
    toast.success("Check your email for a sign-in link");
  }

  // Sent-state: green check confirmation + "use a different email"
  // (per Claude Design's `sf-sent` block). The prototype's
  // "Continue to demo dashboard →" button is dropped — that was a
  // demo-only shortcut; production users click the email link.
  if (linkSent) {
    return (
      <div className="flex flex-col gap-1.5">
        <div
          className="flex items-start gap-3 rounded-md border p-3.5"
          style={{
            background: "var(--surface-2)",
            borderColor: "var(--border)",
          }}
        >
          <div
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full"
            style={{
              background: "var(--s-green-bg)",
              color: "var(--s-green)",
            }}
          >
            <Check className="h-4 w-4" strokeWidth={2.5} />
          </div>
          <div>
            <div
              className="text-[13px] font-medium leading-snug"
              style={{ color: "var(--text)" }}
            >
              Magic link sent
            </div>
            <div
              className="text-xs"
              style={{ color: "var(--text-2)" }}
            >
              to{" "}
              <span style={{ fontFamily: "var(--font-mono)" }}>{sentEmail}</span>
            </div>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-center"
          onClick={() => {
            setLinkSent(false);
            setSentEmail("");
            form.reset();
          }}
        >
          Use a different email
        </Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3.5">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel
                className="text-[11px] font-medium uppercase"
                style={{ color: "var(--text-2)", letterSpacing: "0.04em" }}
              >
                Email
              </FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder="you@psawealth.com"
                  autoComplete="email"
                  autoFocus
                  disabled={form.formState.isSubmitting}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          disabled={form.formState.isSubmitting}
          className="h-9 w-full justify-center"
          // data-api annotation per Claude Design convention
          data-api="POST /api/auth/magic-link"
        >
          {form.formState.isSubmitting ? "Sending…" : "Request one-time code"}
        </Button>
      </form>
    </Form>
  );
}
