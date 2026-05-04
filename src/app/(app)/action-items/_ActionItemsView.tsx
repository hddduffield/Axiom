"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ActionItemDrawer } from "@/components/axiom/ActionItemDrawer";
import { api, isApiError } from "@/lib/api/client";
import type { ActionItem, ActionItemStatus, Advisor, Client, Note } from "@/lib/api/types";

const STATUS_CYCLE: ActionItemStatus[] = [
  "not_started",
  "in_progress",
  "pending_decision",
  "complete",
];

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "pending_decision", label: "Pending decision" },
  { value: "complete", label: "Complete" },
];

function statusVariant(s: string): "default" | "secondary" | "outline" {
  if (s === "complete") return "secondary";
  if (s === "pending_decision") return "outline";
  return "default";
}

function nextStatus(s: ActionItemStatus): ActionItemStatus {
  const i = STATUS_CYCLE.indexOf(s);
  return STATUS_CYCLE[(i + 1) % STATUS_CYCLE.length];
}

interface Props {
  advisors: Pick<Advisor, "id" | "email" | "first_name" | "last_name">[];
  clients: Pick<Client, "id" | "household_name">[];
}

export function ActionItemsView({ advisors, clients }: Props) {
  const [items, setItems] = useState<ActionItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    owner: "all",
    status: "all",
    client_id: "all",
    partner_required: "any",
  });
  const [detail, setDetail] = useState<ActionItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const query = {
      owner: filters.owner !== "all" ? filters.owner : undefined,
      status: filters.status !== "all" ? (filters.status as ActionItemStatus) : undefined,
      client_id: filters.client_id !== "all" ? filters.client_id : undefined,
      partner_required:
        filters.partner_required === "yes"
          ? true
          : filters.partner_required === "no"
            ? false
            : undefined,
    };
    api.actionItems.list(query)
      .then((res) => { if (!cancelled) setItems(res.items); })
      .catch((e) => {
        if (!cancelled) {
          toast.error(isApiError(e) ? e.message : "Could not load action items");
          setItems([]);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filters.owner, filters.status, filters.client_id, filters.partner_required]);

  const advisorById = new Map(advisors.map((a) => [a.id, a]));
  const clientById = new Map(clients.map((c) => [c.id, c]));

  async function toggleStatus(item: ActionItem) {
    const target = nextStatus(item.status);
    try {
      const res = await api.actionItems.update(item.id, { status: target });
      handleChanged(res.item);
      if (res.spawned_reminders && res.spawned_reminders.length > 0) {
        toast.success(`${res.spawned_reminders.length} reminder spawned`);
      }
      if (res.auto_closed_reminders > 0) {
        toast.success(`${res.auto_closed_reminders} reminder(s) auto-closed`);
      }
    } catch (e) {
      toast.error(isApiError(e) ? e.message : "Could not update item");
    }
  }

  // Drawer's onChanged hand-back: drawer toasts lifecycle effects itself,
  // we just merge the updated item into local state and the drawer view.
  function handleChanged(updated: ActionItem) {
    setItems((prev) =>
      (prev ?? []).map((it) => (it.id === updated.id ? updated : it)),
    );
    if (detail?.id === updated.id) setDetail(updated);
  }

  // Origin-note lookup for the drawer. We don't preload notes because the
  // global action-items list can be large; on drawer open, fetch the one
  // note (if any) that has promoted_to_action_item_id === detail.id.
  const [linkedNote, setLinkedNote] = useState<Note | null>(null);
  useEffect(() => {
    if (!detail) {
      setLinkedNote(null);
      return;
    }
    let cancelled = false;
    // Reverse lookup via the per-client notes endpoint. Cheap because
    // a single client's notes list is small.
    api.notes
      .listByClient(detail.client_id)
      .then(({ items }) => {
        if (cancelled) return;
        const match = items.find((n) => n.promoted_to_action_item_id === detail.id);
        setLinkedNote(match ?? null);
      })
      .catch(() => {
        if (!cancelled) setLinkedNote(null);
      });
    return () => {
      cancelled = true;
    };
  }, [detail]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Action Items</h1>
        <p className="text-muted-foreground">
          Click a row to see detail. Click the status badge to advance the lifecycle.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <FilterSelect
          label="Owner"
          value={filters.owner}
          onChange={(v) => setFilters({ ...filters, owner: v })}
          options={[
            { value: "all", label: "All advisors" },
            ...advisors.map((a) => ({
              value: a.email,
              label: `${a.first_name} ${a.last_name}`,
            })),
            { value: "client", label: "Client-owned" },
          ]}
        />
        <FilterSelect
          label="Status"
          value={filters.status}
          onChange={(v) => setFilters({ ...filters, status: v })}
          options={STATUS_OPTIONS}
        />
        <FilterSelect
          label="Client"
          value={filters.client_id}
          onChange={(v) => setFilters({ ...filters, client_id: v })}
          options={[
            { value: "all", label: "All clients" },
            ...clients.map((c) => ({ value: c.id, label: c.household_name })),
          ]}
        />
        <FilterSelect
          label="Partner Required"
          value={filters.partner_required}
          onChange={(v) => setFilters({ ...filters, partner_required: v })}
          options={[
            { value: "any", label: "Any" },
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ]}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {loading ? "Loading…" : `${items?.length ?? 0} items`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (items?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">
              No action items match these filters.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Timing</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Partner</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(items ?? []).map((it) => {
                  const owner =
                    advisorById.get(it.owner)?.first_name ?? it.owner;
                  return (
                    <TableRow
                      key={it.id}
                      className="cursor-pointer"
                      onClick={() => setDetail(it)}
                    >
                      <TableCell className="max-w-md">
                        {it.description.length > 80
                          ? `${it.description.slice(0, 80)}…`
                          : it.description}
                      </TableCell>
                      <TableCell>
                        {clientById.get(it.client_id)?.household_name ?? "—"}
                      </TableCell>
                      <TableCell>{owner}</TableCell>
                      <TableCell>{it.timing_bucket}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => toggleStatus(it)}
                          className="cursor-pointer"
                        >
                          <Badge variant={statusVariant(it.status)}>
                            {it.status.replace("_", " ")}
                          </Badge>
                        </button>
                      </TableCell>
                      <TableCell>
                        {it.partner_required
                          ? it.partner_type ?? "yes"
                          : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ActionItemDrawer
        item={detail}
        linkedNote={linkedNote}
        clientHouseholdName={detail ? clientById.get(detail.client_id)?.household_name ?? null : null}
        onClose={() => setDetail(null)}
        onChanged={handleChanged}
      />
    </div>
  );
}

interface FilterSelectProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}

function FilterSelect({ label, value, onChange, options }: FilterSelectProps) {
  return (
    <div className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={(v) => onChange(v ?? "")}>
        <SelectTrigger className="h-8 w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
