// Stage 5 — Audit input projection.
//
// Produces the trimmed `Stage5LlmAuditInput` shape from the full Stage 4
// result + QuantifiedRecommendations + ClientProfile. See the JSDoc on
// `Stage5LlmAuditInput` in stage5.types.ts for the design rationale.
//
// This projection is the SOLE call site for the trim. The deterministic
// checks (DC.1–DC.10) bypass it entirely and consume the full upstream
// envelopes.

import type {
  ClientProfile,
} from "../schemas/clientProfile";
import type {
  QuantifiedRecommendations,
  SequencedRecommendation,
} from "../schemas/pipelineTypes";
import type {
  Stage4Result,
  ImplementationRoadmap,
} from "../schemas/stage4.types";
import type {
  Stage5ClientProfileSlice,
  Stage5ImplementationRoadmapSlim,
  Stage5LlmAuditInput,
  Stage5PlanSlice,
  Stage5QrRecSlim,
  Stage5QrSlice,
} from "../schemas/stage5.types";

// Cap on hard-drift entries surfaced to the LLM. Stage 4's drift detector can
// emit hundreds of entries on a large plan (Holloway: ~900 false positives
// flagged for v1.5 backlog). The auditor reads numbers_drift as a hint, not
// a complete list — capping keeps the prompt size predictable.
const MAX_DRIFT_ENTRIES_FOR_LLM = 20;

function projectImplementationRoadmap(
  ir: ImplementationRoadmap,
): Stage5ImplementationRoadmapSlim {
  return {
    intro_paragraph: ir.intro_paragraph,
    total_action_count: ir.total_action_count,
    groups: ir.groups.map((g) => ({
      timing_bucket: g.timing_bucket,
      bucket_label: g.bucket_label,
      row_count: g.rows.length,
      rows: g.rows.map((r) => ({
        owner: r.owner,
        status: r.status,
        source_action_item_id: r.source_action_item_id,
        source_recommendation_id: r.source_recommendation_id,
        // r.action (full description) intentionally dropped — auditor
        // cross-checks roadmap rows against QR action_items by ID, not by
        // re-reading descriptions.
      })),
    })),
  };
}

function projectQrRec(rec: SequencedRecommendation): Stage5QrRecSlim {
  return {
    recommendation_id: rec.recommendation_id,
    category: rec.category,
    plan_section: rec.plan_section,
    timing_bucket: rec.timing_bucket,
    decisions_needed: rec.decisions_needed,
    landmine: rec.landmine,
    landmine_status: rec.landmine_status,
    default_excluded: rec.default_excluded,
    quantified_impact: {
      estimate: rec.quantified_impact.estimate,
      qualitative_phrasing: rec.quantified_impact.qualitative_phrasing,
      pending_reconciliation: rec.quantified_impact.pending_reconciliation,
    },
    action_item_ids: rec.action_items.map((ai) => ai.action_item_id),
  };
}

function projectQr(qr: QuantifiedRecommendations): Stage5QrSlice {
  return {
    recommendations: qr.recommendations.map(projectQrRec),
  };
}

function projectClientProfile(cp: ClientProfile): Stage5ClientProfileSlice {
  return {
    engagement: cp.engagement,
    client_and_family: cp.client_and_family,
    goals_and_values: cp.goals_and_values,
    advisor_observations: cp.advisor_observations,
  };
}

function projectPlan(stage4: Stage4Result): Stage5PlanSlice {
  const det = stage4.deterministic_sections;
  const driftHard = stage4._flags.numbers_drift.filter(
    (d) => d.severity === "hard",
  );
  const driftSoft = stage4._flags.numbers_drift.filter(
    (d) => d.severity === "soft",
  );
  return {
    llm_sections: stage4.llm_sections,
    deterministic_sections: {
      title_page: det.title_page,
      goals_priorities: det.goals_priorities,
      decisions_needed: det.decisions_needed,
      advisory_team: det.advisory_team,
      glossary: det.glossary,
      disclosures: det.disclosures,
      implementation_roadmap_summary: projectImplementationRoadmap(
        det.implementation_roadmap,
      ),
      // client_snapshot, meeting_cadence_table dropped.
    },
    flags_summary: {
      numbers_drift_hard_count: driftHard.length,
      numbers_drift_soft_count: driftSoft.length,
      numbers_drift_hard_entries: driftHard.slice(0, MAX_DRIFT_ENTRIES_FOR_LLM),
      glossary_terms_used: stage4._flags.glossary_terms_used,
    },
  };
}

export function projectForStage5Audit(
  stage4Result: Stage4Result,
  quantified: QuantifiedRecommendations,
  clientProfile: ClientProfile,
): Stage5LlmAuditInput {
  return {
    plan: projectPlan(stage4Result),
    quantified_recommendations: projectQr(quantified),
    client_profile: projectClientProfile(clientProfile),
    archetype: clientProfile.engagement.archetype,
    include_optional_pre_transaction:
      clientProfile.engagement.archetype === "PRE",
  };
}
