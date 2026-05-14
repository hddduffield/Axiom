"use client";

// Phase 17.4 — "Set as Current" inline button on a lens-run row.
//
// Promotes a draft / reviewed / presented / approved lens to
// status='current'. Server-side, any existing 'current' lens for the
// same (client_id, lens_type) is automatically demoted to 'superseded'.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { api, isApiError } from "@/lib/api/client";
import type { LensRunStatus } from "@/lib/api/types";

const PROMOTABLE_FROM: LensRunStatus[] = [
  "draft",
  "reviewed",
  "presented",
  "approved",
];

export function LensSetCurrentButton({
  lensRunId,
  scenarioName,
  status,
}: {
  lensRunId: string;
  scenarioName: string;
  status: LensRunStatus;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  if (!PROMOTABLE_FROM.includes(status)) return null;

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    setPending(true);
    try {
      await api.lensRuns.setCurrent(lensRunId);
      toast.success(`${scenarioName} is now the current scenario.`);
      router.refresh();
    } catch (e) {
      toast.error(isApiError(e) ? e.message : "Could not set as current.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      disabled={pending}
      title="Promote to current scenario"
      className="h-7 px-2"
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <CheckCircle2 className="h-3.5 w-3.5" />
      )}
      <span className="ml-1 text-[11px]">Set current</span>
    </Button>
  );
}
