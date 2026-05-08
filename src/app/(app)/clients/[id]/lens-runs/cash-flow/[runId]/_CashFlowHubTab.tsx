"use client";

// Phase 13.3 — Hub view placeholder. Full layout lands in Phase 13.3 commit.

import { PanelCard } from "@/components/axiom/PanelCard";
import type { CashFlowLensOutput } from "@/lib/api/cash_flow_lens";

interface Props {
  output: CashFlowLensOutput;
  client: { household_name: string };
}

export function CashFlowHubTab(_props: Props) {
  return (
    <PanelCard title="Hub view">
      <p className="text-[13px]" style={{ color: "var(--text-2)" }}>
        Hub layout renders in Phase 13.3.
      </p>
    </PanelCard>
  );
}
