"use client";

// Phase 13.4 — Tax Triangle placeholder. Full triangles + tax bill table
// land in Phase 13.4 commit.

import { PanelCard } from "@/components/axiom/PanelCard";
import type { CashFlowLensOutput } from "@/lib/api/cash_flow_lens";

interface Props {
  output: CashFlowLensOutput;
}

export function CashFlowTaxTriangleTab(_props: Props) {
  return (
    <PanelCard title="Tax Triangle">
      <p className="text-[13px]" style={{ color: "var(--text-2)" }}>
        Side-by-side current vs after triangles render in Phase 13.4.
      </p>
    </PanelCard>
  );
}
