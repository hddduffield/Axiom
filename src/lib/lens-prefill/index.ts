// Phase 16 — Lens prefill barrel.
//
// Exports the two extractor functions + the source-plan lookup helper.
// Consumers:
//   - /api/lens-runs/cash-flow POST  → extractCashFlowFromClientProfile
//   - /api/lens-runs/estate POST     → extractEstateFromClientProfile
//   - /api/clients/[id]/latest-plan-snapshot GET → all three
//
// Naming uses dotted field paths for sourced_fields[] / edited_fields[]
// (e.g. "assumptions.estate_today_cents", "buckets[0].current_balance_cents").

export {
  extractCashFlowFromClientProfile,
  extractEstateFromClientProfile,
  type CashFlowExtractResult,
  type EstateExtractResult,
} from "./extractors";

export {
  getLatestFinalizedPlanForClient,
  type LatestFinalizedPlan,
} from "./sourceLookup";

export {
  diffSourcedFields,
  applyEditedFields,
  isSourced,
  isEdited,
} from "./diff";
