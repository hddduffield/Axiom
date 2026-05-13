"use client";

// Phase 14.3 — Tab 2 placeholder. Replaced in 14.3 commit.

import type { EstateLensOutput } from "@/lib/estate-lens/types";
import { ComplianceFooter } from "./_atoms";

interface Props {
  output: EstateLensOutput;
  onChange: (next: EstateLensOutput) => void;
  editable: boolean;
}

export function EstateTrustPlanningTab({ output }: Props) {
  return (
    <div>
      <p className="text-sm" style={{ color: "var(--text-2)" }}>
        Trust Planning Calculator — landing in Phase 14.3.
      </p>
      <ComplianceFooter trackingId={output.tracking_id} />
    </div>
  );
}
