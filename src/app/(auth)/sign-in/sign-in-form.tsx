"use client";

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
import { createClient } from "@/lib/supabase/client";

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

    setLinkSent(true);
    toast.success("Check your email for a sign-in link");
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
      >
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder="you@psawealth.com"
                  autoComplete="email"
                  disabled={linkSent || form.formState.isSubmitting}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          disabled={linkSent || form.formState.isSubmitting}
        >
          {linkSent
            ? "Link sent — check your email"
            : form.formState.isSubmitting
              ? "Sending…"
              : "Send sign-in link"}
        </Button>
      </form>
    </Form>
  );
}
