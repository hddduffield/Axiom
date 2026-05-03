import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

// Phase 5b: render real queued/processing plan counts.
//
// Server-direct DB read (not a self-fetch to /api/plans/queued) — server
// components can hit Supabase straight through, no internal HTTP hop.
// Claude Design's eventual interactive widget should use
// `api.plans.queued()` from the browser via @/lib/api/client.
async function loadQueuedSummary() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plans")
    .select("status")
    .in("status", ["queued", "processing"]);
  if (error) {
    return { queued: 0, processing: 0, error: error.message };
  }
  return {
    queued: (data ?? []).filter((p) => p.status === "queued").length,
    processing: (data ?? []).filter((p) => p.status === "processing").length,
    error: null,
  };
}

export default async function DashboardPage() {
  const summary = await loadQueuedSummary();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Welcome to Axiom
        </h1>
        <p className="text-muted-foreground">
          PSA Wealth advisor platform — Phase 5b plan-generation flow.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Plan generation queue</CardTitle>
          <CardDescription>
            Plans submitted via the new flow are processed by the local CLI
            (<code className="font-mono text-xs">npm run generate-pending</code>).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {summary.error ? (
            <p className="text-sm text-destructive">
              Could not load queue summary: {summary.error}
            </p>
          ) : (
            <ul className="space-y-1 text-sm">
              <li>
                Queued plans: <span className="font-semibold">{summary.queued}</span>
              </li>
              <li>
                Processing now: <span className="font-semibold">{summary.processing}</span>
              </li>
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
