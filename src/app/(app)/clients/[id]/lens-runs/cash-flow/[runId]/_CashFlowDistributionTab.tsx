"use client";

// Phase 13.5 — Distribution Plan placeholder. Sliders + AI recommendations +
// push-to-action-items land in Phase 13.5 commit.

import { PanelCard } from "@/components/axiom/PanelCard";
import type { CashFlowLensOutput } from "@/lib/api/cash_flow_lens";
import type { LensRun } from "@/lib/api/types";

interface Props {
  lensId: string;
  output: CashFlowLensOutput;
  onChange: (next: CashFlowLensOutput) => void;
  onAiUpdated: (updated: LensRun) => void;
  isDraft: boolean;
}

export function CashFlowDistributionTab(_props: Props) {
  return (
    <PanelCard title="Distribution Plan">
      <p className="text-[13px]" style={{ color: "var(--text-2)" }}>
        Sliders + year-by-year breakdown + AI recommendations render in Phase 13.5.
      </p>
    </PanelCard>
  );
}
