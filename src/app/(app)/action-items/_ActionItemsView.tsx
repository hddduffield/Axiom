"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { api, isApiError } from "@/lib/api/client";
import type { ActionItem, ActionItemStatus, Advisor, Client } from "@/lib/api/types";

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
      setItems((prev) =>
        (prev ?? []).map((it) => (it.id === item.id ? res.item : it)),
      );
      if (detail?.id === item.id) setDetail(res.item);
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

      {/* Detail dialog */}
      <Dialog open={detail !== null} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          {detail ? (
            <>
              <DialogHeader>
                <DialogTitle>Action item</DialogTitle>
                <DialogDescription>
                  {clientById.get(detail.client_id)?.household_name ?? "—"} ·{" "}
                  {detail.category}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <p>{detail.description}</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <Field label="Owner" value={detail.owner} />
                  <Field label="Timing" value={detail.timing_bucket} />
                  <Field label="Duration" value={detail.duration_class} />
                  <Field
                    label="Partner"
                    value={
                      detail.partner_required
                        ? detail.partner_type ?? "yes"
                        : "no"
                    }
                  />
                  <Field
                    label="Status"
                    value={detail.status.replace("_", " ")}
                  />
                  <Field
                    label="Derivative?"
                    value={detail.is_derivative_reminder ? "yes" : "no"}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => toggleStatus(detail)}
                >
                  Advance to “{nextStatus(detail.status).replace("_", " ")}”
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
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
