// Stage 3a.2 — Cross-Rec Validator types.
//
// Stage 3a.2 is deterministic; it has no LLM output to validate. This file
// declares only the wrapper input type and a couple of helpers. Output is
// the existing QuantifiedRecommendations container from pipelineTypes.ts
// (with the optional `_sequencer_status: "FAILED"` and `_sequencer_failures`
// fields populated when any batch failed).

import type { Stage3a1Result, Stage3a1ResultFailed } from "./stage3a1.types";
import type { SelectedRecommendations } from "./selectedRecommendations";

// Input to validateAndMerge. `batchResults` may contain a mix of successful
// Stage3a1Result and failed Stage3a1ResultFailed entries. `selectedRecommendations`
// is the full Stage 2 output, used for coverage-gap detection.
export interface Stage3a2Input {
  batchResults: Array<Stage3a1Result | Stage3a1ResultFailed>;
  selectedRecommendations: SelectedRecommendations;
}
