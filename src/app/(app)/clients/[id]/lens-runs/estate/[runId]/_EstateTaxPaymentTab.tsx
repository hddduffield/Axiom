"use client";

// Phase 14.4 — Tab 3 placeholder. Replaced in 14.4 commit.

import type { EstateLensOutput } from "@/lib/estate-lens/types";
import { ComplianceFooter } from "./_atoms";

interface Props {
  output: EstateLensOutput;
  onChange: (next: EstateLensOutput) => void;
  editable: boolean;
}

export function EstateTaxPaymentTab({ output }: Props) {
  return (
    <div>
      <p className="text-sm" style={{ color: "var(--text-2)" }}>
        Tax Payment Strategy — landing in Phase 14.4.
      </p>
      <ComplianceFooter trackingId={output.tracking_id} />
    </div>
  );
}
