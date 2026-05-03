import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SignInForm } from "./sign-in-form";

interface SignInPageProps {
  searchParams: Promise<{ error?: string; redirect?: string }>;
}

const ERROR_MESSAGES: Record<string, string> = {
  not_authorized:
    "That email isn't on the PSA Wealth advisor list. Ask Hayden if you should have access.",
  auth: "Sign-in link couldn't be exchanged. Try requesting a new one.",
};

// Server Component shell. The form itself is a Client Component because it
// calls supabase.auth.signInWithOtp() and renders toasts on response.
export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const errorMessage = params.error ? ERROR_MESSAGES[params.error] ?? null : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in to Axiom</CardTitle>
        <CardDescription>
          Enter your PSA Wealth email. We&rsquo;ll send a magic link.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {errorMessage ? (
          <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {errorMessage}
          </p>
        ) : null}
        <SignInForm redirectTo={params.redirect ?? "/dashboard"} />
      </CardContent>
    </Card>
  );
}
