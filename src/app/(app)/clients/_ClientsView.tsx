"use client";

// Clients list view — Claude Design's view-clients.jsx ClientsList +
// NewClientDialog applied over the existing api.clients.create wiring.
//
// Single Client Component owns:
//   - Status / archetype / lead-advisor filter chips
//   - Sortable columns (Household / Open items / Added)
//   - Result count "{filtered} of {total}" pinned right
//   - Empty filter state with Reset filters action
//   - "+ Generate plan" deeplink to /plans/generate
//   - "+ New client" modal (POST /api/clients via api.clients.create)
//
// Schema gaps vs reference (v1.5 backlog):
//   - No `aum` column → AUM column + form field omitted.
//   - No `last_activity_at` → uses created_at, column renamed "Added".

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ChevronDown, FileText, Plus } from "lucide-react";

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
import { Chip, Count } from "@/components/axiom/Chip";
import { api, isApiError } from "@/lib/api/client";
import type { Client, ClientArchetype, ClientStatus } from "@/lib/api/types";

// Subset of `Client` actually selected by page.tsx — keeps the prop
// shape honest about which columns the view consumes.
interface ClientRow
  extends Pick<
    Client,
    "id" | "household_name" | "lead_advisor_id" | "status" | "archetype" | "created_at"
  > {
  advisors: { first_name: string; last_name: string } | null;
  open_items: number;
}

interface AdvisorOption {
  id: string;
  first_name: string;
  last_name: string;
}

type StatusFilter = "all" | ClientStatus;
type ArchetypeFilter = "all" | ClientArchetype;
type SortKey = "household" | "open" | "activity";

interface Props {
  clients: ClientRow[];
  advisors: AdvisorOption[];
  loadError: string | null;
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const day = Math.floor(ms / 86_400_000);
  if (day < 1) return "today";
  if (day === 1) return "1d ago";
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 4) return `${wk}w ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function statusBadge(s: ClientStatus) {
  // Phase 11.3 — surface "inactive" as "Archived" everywhere user-facing.
  // Same DB value; clearer label for the soft-delete semantic.
  const tone =
    s === "active"
      ? { fg: "var(--s-green)", bg: "var(--s-green-bg)", label: "Active" }
      : s === "prospect"
        ? { fg: "var(--s-amber)", bg: "var(--s-amber-bg)", label: "Prospect" }
        : { fg: "var(--s-slate)", bg: "var(--s-slate-bg)", label: "Archived" };
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: tone.bg, color: tone.fg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.fg }} />
      {tone.label}
    </span>
  );
}

export function ClientsView({ clients, advisors, loadError }: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [archetypeFilter, setArchetypeFilter] = useState<ArchetypeFilter>("all");
  const [advisorFilter, setAdvisorFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("activity");
  const [newOpen, setNewOpen] = useState(false);

  const filtered = useMemo(() => {
    let rows = clients.filter((c) => {
      // Phase 11.3 — Archived clients (status='inactive') are hidden by
      // default. The "All" filter shows active + prospect only;
      // Archived only appears when its filter chip is explicitly
      // selected. This matches CRM convention — archived is reachable
      // but doesn't clutter the working view.
      if (statusFilter === "all" && c.status === "inactive") return false;
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (archetypeFilter !== "all" && c.archetype !== archetypeFilter) return false;
      if (advisorFilter !== "all" && c.lead_advisor_id !== advisorFilter) return false;
      return true;
    });
    rows = [...rows].sort((a, b) => {
      if (sortKey === "household") return a.household_name.localeCompare(b.household_name);
      if (sortKey === "open") return b.open_items - a.open_items;
      // "activity" → use created_at (schema gap; see file header)
      return b.created_at.localeCompare(a.created_at);
    });
    return rows;
  }, [clients, statusFilter, archetypeFilter, advisorFilter, sortKey]);

  const cnt = (s: ClientStatus) => clients.filter((c) => c.status === s).length;
  // Non-archived count for the "All" chip — reflects the default-hide rule.
  const cntAllNonArchived = clients.filter((c) => c.status !== "inactive").length;

  function resetFilters() {
    setStatusFilter("all");
    setArchetypeFilter("all");
    setAdvisorFilter("all");
  }

  return (
    <div className="flex flex-col gap-6">
      {/* PageHead */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1
            className="text-3xl font-medium"
            style={{
              fontFamily: "var(--font-display)",
              letterSpacing: "-0.01em",
              color: "var(--text)",
            }}
          >
            Clients
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-2)" }}>
            {clients.length} households
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/plans/generate"
            className={buttonVariants({ variant: "outline" })}
          >
            <FileText className="mr-1.5 h-3.5 w-3.5" />
            Generate plan
          </Link>
          <NewClientButton
            advisors={advisors}
            open={newOpen}
            onOpenChange={setNewOpen}
          />
        </div>
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
        <FilterGroup label="Status">
          <Chip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
            All <Count n={cntAllNonArchived} />
          </Chip>
          <Chip active={statusFilter === "active"} onClick={() => setStatusFilter("active")}>
            Active <Count n={cnt("active")} />
          </Chip>
          <Chip active={statusFilter === "prospect"} onClick={() => setStatusFilter("prospect")}>
            Prospect <Count n={cnt("prospect")} />
          </Chip>
          <Chip active={statusFilter === "inactive"} onClick={() => setStatusFilter("inactive")}>
            Archived <Count n={cnt("inactive")} />
          </Chip>
        </FilterGroup>

        <FilterSep />

        <FilterGroup label="Archetype">
          <Chip active={archetypeFilter === "all"} onClick={() => setArchetypeFilter("all")}>All</Chip>
          <Chip active={archetypeFilter === "PRE"} onClick={() => setArchetypeFilter("PRE")}>Pre</Chip>
          <Chip active={archetypeFilter === "MID"} onClick={() => setArchetypeFilter("MID")}>Mid</Chip>
          <Chip active={archetypeFilter === "POST"} onClick={() => setArchetypeFilter("POST")}>Post</Chip>
        </FilterGroup>

        <FilterSep />

        <FilterGroup label="Lead">
          <Chip active={advisorFilter === "all"} onClick={() => setAdvisorFilter("all")}>All</Chip>
          {advisors.map((a) => (
            <Chip
              key={a.id}
              active={advisorFilter === a.id}
              onClick={() => setAdvisorFilter(a.id)}
            >
              {a.first_name}
            </Chip>
          ))}
        </FilterGroup>

        <span
          className="ml-auto text-[11px]"
          style={{ fontFamily: "var(--font-mono)", color: "var(--text-3)" }}
        >
          {filtered.length} of {clients.length}
        </span>
      </div>

      {loadError ? (
        <p className="text-sm" style={{ color: "var(--s-red)" }}>
          Could not load clients: {loadError}
        </p>
      ) : filtered.length === 0 ? (
        <div
          className="rounded-md border p-6 text-center text-sm"
          style={{
            borderColor: "var(--border)",
            background: "var(--surface)",
            color: "var(--text-2)",
          }}
        >
          No households match these filters.
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-2"
            onClick={resetFilters}
          >
            Reset filters
          </Button>
        </div>
      ) : (
        <div
          className="overflow-hidden rounded-md border"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <table className="w-full text-[13px]">
            <thead
              className="border-b"
              style={{ borderColor: "var(--border)", color: "var(--text-3)" }}
            >
              <tr>
                <SortableTh active={sortKey === "household"} onClick={() => setSortKey("household")}>
                  Household
                </SortableTh>
                <th className="w-28 px-3 py-2 text-left text-[11px] font-medium uppercase" style={{ letterSpacing: "0.04em" }}>
                  Status
                </th>
                <th className="w-32 px-3 py-2 text-left text-[11px] font-medium uppercase" style={{ letterSpacing: "0.04em" }}>
                  Lead advisor
                </th>
                <th className="w-24 px-3 py-2 text-left text-[11px] font-medium uppercase" style={{ letterSpacing: "0.04em" }}>
                  Archetype
                </th>
                <SortableTh
                  className="w-28"
                  active={sortKey === "open"}
                  onClick={() => setSortKey("open")}
                >
                  Open items
                </SortableTh>
                <SortableTh
                  className="w-32"
                  active={sortKey === "activity"}
                  onClick={() => setSortKey("activity")}
                >
                  Added
                </SortableTh>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <ClientRowEl key={c.id} c={c} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ClientRowEl({ c }: { c: ClientRow }) {
  const router = useRouter();
  // Phase 11.3 — archived rows render muted so they read as deprioritized
  // when the Archived filter is active.
  const isArchived = c.status === "inactive";
  return (
    <tr
      className="cursor-pointer border-b transition-colors hover:bg-[var(--surface-2)]"
      style={{
        borderColor: "var(--border)",
        opacity: isArchived ? 0.65 : 1,
      }}
      onClick={() => router.push(`/clients/${c.id}`)}
    >
      <td className="px-3 py-2.5">
        <div className="font-medium" style={{ color: "var(--text)" }}>
          {c.household_name}
        </div>
      </td>
      <td className="px-3 py-2.5">{statusBadge(c.status)}</td>
      <td className="px-3 py-2.5" style={{ color: "var(--text-2)" }}>
        {c.advisors
          ? `${c.advisors.first_name} ${c.advisors.last_name[0]}.`
          : "—"}
      </td>
      <td className="px-3 py-2.5">
        {c.archetype ? (
          <span
            className="inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium"
            style={{
              background: "var(--surface-2)",
              color: "var(--text-2)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {c.archetype}
          </span>
        ) : (
          <span style={{ color: "var(--text-3)" }}>—</span>
        )}
      </td>
      <td
        className="px-3 py-2.5"
        style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}
      >
        {c.open_items > 0 ? (
          c.open_items
        ) : (
          <span style={{ color: "var(--text-3)" }}>0</span>
        )}
      </td>
      <td
        className="px-3 py-2.5"
        style={{ fontFamily: "var(--font-mono)", color: "var(--text-2)" }}
      >
        {fmtRelative(c.created_at)}
      </td>
    </tr>
  );
}

// ─────────── Filter primitives ───────────

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="text-[11px] uppercase"
        style={{ color: "var(--text-3)", letterSpacing: "0.04em" }}
      >
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function FilterSep() {
  return (
    <span
      className="hidden h-4 w-px md:block"
      style={{ background: "var(--border)" }}
    />
  );
}

// Chip / Count moved to src/components/axiom/Chip.tsx (Phase 9.13)

function SortableTh({
  children,
  active,
  onClick,
  className,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <th
      onClick={onClick}
      className={`cursor-pointer px-3 py-2 text-left text-[11px] font-medium uppercase ${className ?? ""}`}
      style={{ letterSpacing: "0.04em" }}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {active ? <ChevronDown className="h-3 w-3" /> : null}
      </span>
    </th>
  );
}

// ─────────── New Client dialog ───────────

const newClientSchema = z.object({
  name: z.string().min(1, "Required"),
  archetype: z.enum(["PRE", "MID", "POST", "NONE"]),
  status: z.enum(["prospect", "active", "inactive"]),
  lead_advisor_id: z.string().uuid("Pick a lead advisor"),
});
type NewClientValues = z.infer<typeof newClientSchema>;

function NewClientButton({
  advisors,
  open,
  onOpenChange,
}: {
  advisors: AdvisorOption[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const form = useForm<NewClientValues>({
    resolver: zodResolver(newClientSchema),
    defaultValues: {
      name: "",
      archetype: "MID",
      status: "prospect",
      lead_advisor_id: advisors[0]?.id ?? "",
    },
  });

  async function onSubmit(values: NewClientValues) {
    // "Family" appended automatically if not present (per Claude Design)
    const household_name = values.name.toLowerCase().includes("family")
      ? values.name
      : `${values.name} Family`;
    try {
      const created = await api.clients.create({
        household_name,
        lead_advisor_id: values.lead_advisor_id,
        status: values.status,
        archetype: values.archetype,
      });
      onOpenChange(false);
      form.reset();
      router.push(`/clients/${created.id}`);
    } catch (e) {
      toast.error(isApiError(e) ? e.message : "Could not create client");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger className={buttonVariants()}>
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        New client
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New client</DialogTitle>
          <DialogDescription>
            Creates a new household record. Notes can be filled in later.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
            data-api="POST /api/clients"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel
                    className="text-[11px] uppercase"
                    style={{ color: "var(--text-2)", letterSpacing: "0.04em" }}
                  >
                    Household name
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Holloway"
                      autoFocus
                      {...field}
                    />
                  </FormControl>
                  <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
                    &ldquo;Family&rdquo; will be appended automatically if not included.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="archetype"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel
                      className="text-[11px] uppercase"
                      style={{ color: "var(--text-2)", letterSpacing: "0.04em" }}
                    >
                      Archetype
                    </FormLabel>
                    <FormControl>
                      <Select onValueChange={(v) => field.onChange(v ?? "")} value={field.value}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PRE">PRE — pre-liquidity</SelectItem>
                          <SelectItem value="MID">MID — mid-life</SelectItem>
                          <SelectItem value="POST">POST — post-liquidity</SelectItem>
                          <SelectItem value="NONE">NONE — undetermined</SelectItem>
                        </SelectContent>
                      </Select>
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
                    <FormLabel
                      className="text-[11px] uppercase"
                      style={{ color: "var(--text-2)", letterSpacing: "0.04em" }}
                    >
                      Status
                    </FormLabel>
                    <FormControl>
                      <Select onValueChange={(v) => field.onChange(v ?? "")} value={field.value}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
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
            </div>
            <FormField
              control={form.control}
              name="lead_advisor_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel
                    className="text-[11px] uppercase"
                    style={{ color: "var(--text-2)", letterSpacing: "0.04em" }}
                  >
                    Lead advisor
                  </FormLabel>
                  <FormControl>
                    <Select onValueChange={(v) => field.onChange(v ?? "")} value={field.value}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {advisors.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.first_name} {a.last_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Creating…" : "Create client"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
