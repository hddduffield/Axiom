import type { RenderingState, SequencedRecommendation } from "../schemas/pipelineTypes";

// Returns the rendering state of a recommendation per the three-tier discipline,
// or null if the rec doesn't fit any of A/B/C/D (and is therefore ineligible
// for any aggregate or top-priorities surface).
//
// Preference order when multiple states would otherwise match: A > C > B > D.
export function detectRenderingState(rec: SequencedRecommendation): RenderingState | null {
  const qi = rec.quantified_impact;
  if (
    qi.estimate !== null &&
    qi.alternative_values.length === 0 &&
    qi.blocked_inputs.length === 0
  ) {
    return "A";
  }
  if (qi.alternative_values.length > 0) return "C";
  if (qi.blocked_inputs.length > 0) return "B";
  if (qi.qualitative_phrasing !== null && qi.formula_id === null) return "D";
  return null;
}
