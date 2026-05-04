import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { NewNoteButton } from "./_NewNoteButton";

// Server Component. Reads via Supabase directly (same pattern as the
// queued-plans widget) — the api client at @/lib/api/client is browser-
// only because it constructs URLs from window.location. Client islands
// (NewNoteButton dialog) use api.* from the browser.

function greetingForHour(date: Date): string {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function statusBadgeVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "complete") return "secondary";
  if (status === "pending_decision") return "outline";
  return "default";
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  const { data: advisor } = await supabase
    .from("advisors")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (!advisor) redirect("/sign-in?error=not_authorized");

  // Parallel queries for the 4 stat cards + triage + decisions + recent notes.
  const [
    overdueRes,
    inProgressRes,
    pendingDecisionRes,
    openClientsRes,
    triageRes,
    needsDecisionRes,
    recentNotesRes,
    clientsLookupRes,
  ] = await Promise.all([
    supabase
      .from("action_items")
      .select("id", { count: "exact", head: true })
      .eq("owner", advisor.email)
      .eq("timing_bucket", "next_30_days")
      .neq("status", "complete"),
    supabase
      .from("action_items")
      .select("id", { count: "exact", head: true })
      .eq("owner", advisor.email)
      .eq("status", "in_progress"),
    supabase
      .from("action_items")
      .select("id", { count: "exact", head: true })
      .eq("owner", advisor.email)
      .eq("status", "pending_decision"),
    supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("action_items")
      .select("id, description, client_id, timing_bucket, status, clients(household_name)")
      .eq("owner", advisor.email)
      .neq("status", "complete")
      .order("created_at", { ascending: true })
      .limit(8),
    supabase
      .from("action_items")
      .select("id, description, client_id, timing_bucket, clients(household_name)")
      .eq("owner", advisor.email)
      .eq("status", "pending_decision")
      .limit(5),
    supabase
      .from("notes")
      .select("id, body, tag, created_at, client_id, clients(household_name)")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.from("clients").select("id, household_name").order("household_name"),
  ]);

  const counts = {
    overdue: overdueRes.count ?? 0,
    inProgress: inProgressRes.count ?? 0,
    pendingDecision: pendingDecisionRes.count ?? 0,
    openClients: openClientsRes.count ?? 0,
  };
  const triage = triageRes.data ?? [];
  const decisions = needsDecisionRes.data ?? [];
  const recentNotes = recentNotesRes.data ?? [];
  const allClients = clientsLookupRes.data ?? [];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {greetingForHour(new Date())}, {advisor.first_name}
          </h1>
          <p className="text-muted-foreground">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
        <div className="flex gap-2">
          <NewNoteButton clients={allClients} />
          <Link href="/plans/generate" className={buttonVariants()}>
            Generate plan
          </Link>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Overdue (30-day items)" value={counts.overdue} />
        <StatCard label="In Progress" value={counts.inProgress} />
        <StatCard label="Pending Decision" value={counts.pendingDecision} />
        <StatCard label="Active Clients" value={counts.openClients} />
      </div>

      {/* Triage queue */}
      <Card>
        <CardHeader>
          <CardTitle>Your Triage Queue</CardTitle>
          <CardDescription>
            Open action items assigned to you, oldest first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {triage.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing in your queue right now.
            </p>
          ) : (
            <ul className="divide-y">
              {triage.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start justify-between gap-4 py-3"
                >
                  <div className="flex-1 space-y-1">
                    <Link
                      href={`/clients/${item.client_id}`}
                      className="block text-sm font-medium hover:underline"
                    >
                      {item.description}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {item.clients?.household_name ?? "—"} ·{" "}
                      {item.timing_bucket}
                    </p>
                  </div>
                  <Badge variant={statusBadgeVariant(item.status)}>
                    {item.status.replace("_", " ")}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Two-column: Needs Your Decision + Recent Notes */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Needs Your Decision</CardTitle>
          </CardHeader>
          <CardContent>
            {decisions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending decisions.</p>
            ) : (
              <ul className="space-y-3">
                {decisions.map((item) => (
                  <li key={item.id} className="text-sm">
                    <Link
                      href={`/clients/${item.client_id}`}
                      className="font-medium hover:underline"
                    >
                      {item.description}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {item.clients?.household_name} · {item.timing_bucket}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Notes</CardTitle>
          </CardHeader>
          <CardContent>
            {recentNotes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No notes yet.</p>
            ) : (
              <ul className="space-y-3">
                {recentNotes.map((n) => (
                  <li key={n.id} className="text-sm">
                    <p className="line-clamp-2">{n.body}</p>
                    <p className="text-xs text-muted-foreground">
                      {n.clients?.household_name ?? "—"} · {fmtDate(n.created_at)}
                      {n.tag ? ` · ${n.tag}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
