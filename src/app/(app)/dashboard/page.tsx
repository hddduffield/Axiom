import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Welcome to Axiom
        </h1>
        <p className="text-muted-foreground">
          PSA Wealth advisor platform — Phase 4 Step 1 skeleton.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Pipeline status</CardTitle>
          <CardDescription>
            Phase 3 (AI engine) shipped at commit 3ee3393. Phase 4 builds the
            advisor UI on top of it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Step 1 (this commit): app shell scaffolding. Step 2: Supabase
            schema + auth. Step 3: API routes wrapping the orchestrator.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
