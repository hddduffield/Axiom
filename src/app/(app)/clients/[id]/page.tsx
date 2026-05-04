import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  active: "default",
  prospect: "outline",
  inactive: "secondary",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function ClientDetailPage({ params }: RouteContext) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    clientRes,
    plansRes,
    actionItemsRes,
    notesRes,
    partnersRes,
    lensRunsRes,
  ] = await Promise.all([
    supabase
      .from("clients")
      .select("*, advisors:lead_advisor_id(first_name, last_name, email)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("plans")
      .select("id, status, generated_at, approved_at, fact_review_filename, cost_cents")
      .eq("client_id", id)
      .order("generated_at", { ascending: false }),
    supabase
      .from("action_items")
      .select("id, description, category, timing_bucket, owner, status, partner_required, partner_type")
      .eq("client_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("notes")
      .select("id, body, tag, created_at, author_advisor_id, promoted_to_action_item_id, advisors:author_advisor_id(first_name, last_name)")
      .eq("client_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("partners")
      .select("*")
      .eq("client_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("lens_runs")
      .select("id, lens_type, status, generated_at, cost_cents")
      .eq("client_id", id)
      .order("generated_at", { ascending: false }),
  ]);

  if (clientRes.error || !clientRes.data) {
    notFound();
  }
  const client = clientRes.data;
  const plans = plansRes.data ?? [];
  const actionItems = actionItemsRes.data ?? [];
  const notes = notesRes.data ?? [];
  const partners = partnersRes.data ?? [];
  const lensRuns = lensRunsRes.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/clients"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← All clients
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {client.household_name}
            </h1>
            <p className="text-sm text-muted-foreground">
              Lead advisor:{" "}
              {client.advisors
                ? `${client.advisors.first_name} ${client.advisors.last_name}`
                : "—"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={STATUS_VARIANT[client.status] ?? "default"}>
              {client.status}
            </Badge>
            {client.archetype ? (
              <Badge variant="outline">{client.archetype}</Badge>
            ) : null}
          </div>
        </div>
      </div>

      <Tabs defaultValue="plan">
        <TabsList>
          <TabsTrigger value="plan">Plan</TabsTrigger>
          <TabsTrigger value="action-items">
            Action Items ({actionItems.length})
          </TabsTrigger>
          <TabsTrigger value="notes">Notes ({notes.length})</TabsTrigger>
          <TabsTrigger value="partners">Partners ({partners.length})</TabsTrigger>
          <TabsTrigger value="lens-runs">Lens Runs ({lensRuns.length})</TabsTrigger>
        </TabsList>

        {/* Plan tab */}
        <TabsContent value="plan" className="mt-6">
          {plans.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-start gap-3 py-12">
                <p className="text-muted-foreground">No plan yet.</p>
                <Link href="/plans/generate" className={buttonVariants()}>
                  Generate plan
                </Link>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Plans ({plans.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Generated</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Source File</TableHead>
                      <TableHead>Cost</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plans.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{fmtDate(p.generated_at)}</TableCell>
                        <TableCell>
                          <Badge>{p.status}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {p.fact_review_filename ?? "—"}
                        </TableCell>
                        <TableCell>
                          {p.cost_cents != null
                            ? `$${(p.cost_cents / 100).toFixed(2)}`
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/plans/${p.id}`}
                            className="text-sm hover:underline"
                          >
                            Open →
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Action Items tab */}
        <TabsContent value="action-items" className="mt-6">
          {actionItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No action items for this client.
            </p>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Timing</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {actionItems.map((ai) => (
                      <TableRow key={ai.id}>
                        <TableCell className="max-w-md">
                          {ai.description}
                        </TableCell>
                        <TableCell>{ai.category}</TableCell>
                        <TableCell>{ai.timing_bucket}</TableCell>
                        <TableCell>{ai.owner}</TableCell>
                        <TableCell>
                          <Badge variant={ai.status === "complete" ? "secondary" : "default"}>
                            {ai.status.replace("_", " ")}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Notes tab */}
        <TabsContent value="notes" className="mt-6">
          {notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notes for this client.</p>
          ) : (
            <ul className="space-y-3">
              {notes.map((n) => (
                <li key={n.id}>
                  <Card>
                    <CardContent className="space-y-2 pt-6">
                      <p className="text-sm">{n.body}</p>
                      <p className="text-xs text-muted-foreground">
                        {n.advisors
                          ? `${n.advisors.first_name} ${n.advisors.last_name}`
                          : "Unknown"}{" "}
                        · {fmtDate(n.created_at)}
                        {n.tag ? ` · ${n.tag}` : ""}
                        {n.promoted_to_action_item_id ? " · → promoted" : ""}
                      </p>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        {/* Partners tab */}
        <TabsContent value="partners" className="mt-6">
          {partners.length === 0 ? (
            <p className="text-sm text-muted-foreground">No partners for this client.</p>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Firm</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {partners.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{p.partner_type}</TableCell>
                        <TableCell>
                          {[p.first_name, p.last_name].filter(Boolean).join(" ") || "—"}
                        </TableCell>
                        <TableCell>{p.firm_name ?? "—"}</TableCell>
                        <TableCell>{p.email ?? "—"}</TableCell>
                        <TableCell>{p.phone ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Lens Runs tab */}
        <TabsContent value="lens-runs" className="mt-6">
          {lensRuns.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No lens runs yet (Phase 5c will wire generation).
            </p>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Generated</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lensRuns.map((lr) => (
                      <TableRow key={lr.id}>
                        <TableCell>{lr.lens_type.replace("_", " ")}</TableCell>
                        <TableCell>{fmtDate(lr.generated_at)}</TableCell>
                        <TableCell>
                          <Badge>{lr.status}</Badge>
                        </TableCell>
                        <TableCell>
                          {lr.cost_cents != null
                            ? `$${(lr.cost_cents / 100).toFixed(2)}`
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
