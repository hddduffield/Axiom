import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { ClientsToolbar } from "./_ClientsToolbar";

interface SearchParamsInput {
  status?: string;
}

function statusVariant(s: string): "default" | "secondary" | "outline" {
  if (s === "inactive") return "secondary";
  if (s === "prospect") return "outline";
  return "default";
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsInput>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  let q = supabase
    .from("clients")
    .select("id, household_name, lead_advisor_id, status, archetype, created_at, advisors:lead_advisor_id(first_name, last_name)")
    .order("created_at", { ascending: false });
  if (params.status && ["active", "inactive", "prospect"].includes(params.status)) {
    q = q.eq("status", params.status as "active" | "inactive" | "prospect");
  }
  const { data, error } = await q;

  return (
    <div className="flex flex-col gap-6">
      <ClientsToolbar activeStatus={params.status ?? null} />

      {error ? (
        <p className="text-sm text-destructive">
          Could not load clients: {error.message}
        </p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{(data ?? []).length} clients</CardTitle>
          </CardHeader>
          <CardContent>
            {(data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No clients yet — Add your first client above.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Household</TableHead>
                    <TableHead>Lead Advisor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Archetype</TableHead>
                    <TableHead>Added</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data ?? []).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Link
                          href={`/clients/${c.id}`}
                          className="font-medium hover:underline"
                        >
                          {c.household_name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {c.advisors
                          ? `${c.advisors.first_name} ${c.advisors.last_name}`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(c.status)}>
                          {c.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{c.archetype ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(c.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
