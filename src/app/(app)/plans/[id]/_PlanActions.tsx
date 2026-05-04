"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, isApiError } from "@/lib/api/client";
import type { PlanStatus } from "@/lib/api/types";

interface Props {
  planId: string;
  status: PlanStatus;
}

export function PlanActions({ planId, status }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function approve() {
    setBusy(true);
    try {
      await api.plans.approve(planId);
      toast.success("Plan approved");
      router.refresh();
    } catch (e) {
      toast.error(isApiError(e) ? e.message : "Could not approve");
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    setBusy(true);
    try {
      await api.plans.archive(planId);
      toast.success("Plan archived");
      router.refresh();
    } catch (e) {
      toast.error(isApiError(e) ? e.message : "Could not archive");
    } finally {
      setBusy(false);
    }
  }

  async function exportPdf() {
    setBusy(true);
    try {
      const blob = await api.plans.exportPdf(planId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `plan-${planId.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(isApiError(e) ? e.message : "Could not export PDF");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-2">
      {status === "ready_for_review" ? (
        <Button onClick={approve} disabled={busy} size="sm">
          Approve
        </Button>
      ) : null}
      {status !== "archived" ? (
        <Button onClick={archive} disabled={busy} variant="outline" size="sm">
          Archive
        </Button>
      ) : null}
      {(status === "ready_for_review" || status === "approved" || status === "archived") ? (
        <Button onClick={exportPdf} disabled={busy} variant="outline" size="sm">
          Export PDF
        </Button>
      ) : null}
    </div>
  );
}
