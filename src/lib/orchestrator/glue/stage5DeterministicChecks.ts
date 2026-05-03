// Stage 5 — Deterministic checks (DC.1 – DC.10).
//
// These run before the LLM audit call (cheap, deterministic, no network).
// Each function takes the relevant slices of Stage 4 / Stage 3a / ClientProfile
// state and returns a structured result that the harness merges into the
// final Stage5Result.
//
// Per spec: each check is a pure function with no shared state. The
// orchestrator (runAllDeterministicChecks) calls them sequentially since
// they're all O(plan size) and complete in milliseconds.

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ArchetypeIdentifier,
  QuantifiedRecommendations,
  SequencedRecommendation,
} from "../schemas/pipelineTypes";
import type { ClientProfile } from "../schemas/clientProfile";
import type {
  Stage4Result,
  TopPriorityRow,
} from "../schemas/stage4.types";
import { STAGE4_SECTION_IDS } from "../schemas/stage4.types";
import type {
  AuditFinding,
  DeterministicCheckResults,
  TopFiveMismatch,
  UnresolvedCrossRefFinding,
} from "../schemas/stage5.types";
import {
  buildTopFivePriorities,
  extractAllProseFromLlmOutput,
} from "./stage4Builders";
import type { LandmineAuthorization } from "../stages/stage3a1BatchQuantifier";

// ────────────────────────────────────────────────────────────────────────
// DC.1 — Cross-reference resolution
//
// Every cross_references[].target_section_id in recommendations_business
// and recommendations_personal must resolve to a real section ID. Stage 4's
// own resolveAndStripCrossReferences() already strips unresolved refs at
// the harness layer, so under normal Stage 4 operation DC.1 is a regression
// sanity check. Surfaces refs that survived (shouldn't happen).
// ────────────────────────────────────────────────────────────────────────

const VALID_DETERMINISTIC_SECTION_IDS = new Set<string>([
  "T", "ES", "OP", "CS", "GP", "FO", "IR", "DN", "AT", "MC", "GL", "DS",
]);

export function checkCrossReferenceResolution(
  stage4Result: Stage4Result,
): UnresolvedCrossRefFinding[] {
  const validSectionIds = new Set<string>(VALID_DETERMINISTIC_SECTION_IDS);
  for (const sec of stage4Result.llm_sections.recommendations_business.sections) {
    validSectionIds.add(sec.section_id);
  }
  for (const sec of stage4Result.llm_sections.recommendations_personal.sections) {
    validSectionIds.add(sec.section_id);
  }

  const unresolved: UnresolvedCrossRefFinding[] = [];
  const allSections = [
    ...stage4Result.llm_sections.recommendations_business.sections,
    ...stage4Result.llm_sections.recommendations_personal.sections,
  ];
  for (const sec of allSections) {
    for (const cr of sec.cross_references) {
      if (!validSectionIds.has(cr.target_section_id)) {
        unresolved.push({
          source_section_id: sec.section_id,
          target_section_id: cr.target_section_id,
          display_text: cr.display_text,
        });
      }
    }
  }
  return unresolved;
}

// ────────────────────────────────────────────────────────────────────────
// DC.2 — Implementation Roadmap action coverage
//
// Every roadmap row's source_action_item_id must reference an action_item
// that exists in QR. Orphans indicate Stage 4 builder regression (the
// roadmap is built deterministically from QR's action_items).
// ────────────────────────────────────────────────────────────────────────

export function checkRoadmapActionCoverage(
  stage4Result: Stage4Result,
  quantified: QuantifiedRecommendations,
): { source_action_item_id: string; absent_from: "qr" }[] {
  const aiIdsInQr = new Set<string>();
  for (const rec of quantified.recommendations) {
    for (const ai of rec.action_items) {
      aiIdsInQr.add(ai.action_item_id);
    }
  }

  const orphans: { source_action_item_id: string; absent_from: "qr" }[] = [];
  for (const group of stage4Result.deterministic_sections.implementation_roadmap.groups) {
    for (const row of group.rows) {
      if (!aiIdsInQr.has(row.source_action_item_id)) {
        orphans.push({
          source_action_item_id: row.source_action_item_id,
          absent_from: "qr",
        });
      }
    }
  }
  return orphans;
}

// ────────────────────────────────────────────────────────────────────────
// DC.3 — Top 5 Priorities consistency
//
// executive_summary.top_priorities must match buildTopFivePriorities(QR)'s
// ranking + impact figures. Descriptors may be reworded by the LLM (Stage 4
// allows this), but the rank order and estimated_impact_text must match
// the deterministic computation.
// ────────────────────────────────────────────────────────────────────────

export function checkTopFivePrioritiesConsistency(
  stage4Result: Stage4Result,
  quantified: QuantifiedRecommendations,
): TopFiveMismatch | null {
  const deterministic = buildTopFivePriorities(quantified);
  const emitted = stage4Result.llm_sections.executive_summary.top_priorities;

  // Compare rank-by-rank. If lengths differ, that's a mismatch on every rank.
  const mismatched: number[] = [];
  const maxRanks = Math.max(deterministic.length, emitted.length);
  for (let i = 0; i < maxRanks; i++) {
    const det = deterministic[i];
    const emi = emitted[i];
    if (!det || !emi) {
      mismatched.push(i + 1);
      continue;
    }
    // Stage 4's harness overrides emitted top_priorities with deterministic
    // values, so this should be a no-op in normal flow. DC.3 catches Stage 4
    // builder regression where the override is bypassed or broken.
    if (det.rank !== emi.rank) {
      mismatched.push(i + 1);
      continue;
    }
    // Impact text mismatch: deterministic is canonical. LLM-rephrased
    // descriptors are allowed; the impact text isn't.
    if (det.estimated_impact_text !== emi.estimated_impact_text) {
      mismatched.push(i + 1);
    }
  }

  if (mismatched.length === 0) return null;
  return {
    mismatched_ranks: mismatched,
    deterministic,
    emitted,
  };
}

// ────────────────────────────────────────────────────────────────────────
// DC.4 — Decisions Needed completeness
//
// Every rec where decisions_needed === true OR pending_reconciliation === true
// must surface in decisions_needed.rows[*].source_recommendation_id. Plus,
// landmine recs awaiting authorization should also surface.
// ────────────────────────────────────────────────────────────────────────

export function checkDecisionsNeededCompleteness(
  stage4Result: Stage4Result,
  quantified: QuantifiedRecommendations,
  landmineAuthorizations: LandmineAuthorization[] = [],
): string[] {
  const expectedRecIds = new Set<string>();
  for (const rec of quantified.recommendations) {
    if (rec.default_excluded) continue;
    if (
      rec.decisions_needed === true ||
      rec.quantified_impact.pending_reconciliation === true
    ) {
      expectedRecIds.add(rec.recommendation_id);
    }
  }
  // Landmine recs awaiting authorization (i.e., landmine: true AND not in
  // authorized list) should also be in DN per spec.
  const authorizedIds = new Set(
    landmineAuthorizations.map((la) => la.recommendation_id),
  );
  for (const rec of quantified.recommendations) {
    if (rec.landmine === true && !authorizedIds.has(rec.recommendation_id)) {
      expectedRecIds.add(rec.recommendation_id);
    }
  }

  const presentRecIds = new Set(
    stage4Result.deterministic_sections.decisions_needed.rows.map(
      (r) => r.source_recommendation_id,
    ),
  );

  const missing: string[] = [];
  for (const id of expectedRecIds) {
    if (!presentRecIds.has(id)) missing.push(id);
  }
  return missing.sort();
}

// ────────────────────────────────────────────────────────────────────────
// DC.5 — Glossary alignment
//
// Every term in glossary.entries[*] must appear at least once in LLM-
// generated prose. Stage 4's auto-extraction guarantees this; DC.5 is a
// regression sanity check (Stage 4 builder must not emit terms unused in
// prose).
// ────────────────────────────────────────────────────────────────────────

function termAppearsInProse(term: string, acronym: string | null, prose: string): boolean {
  const candidates: string[] = [];
  if (acronym) {
    candidates.push(acronym);
    if (acronym.includes(" / ")) {
      for (const p of acronym.split(" / ").map((s) => s.trim())) {
        candidates.push(p);
      }
    }
  }
  candidates.push(term);
  for (const c of candidates) {
    if (c.length === 0) continue;
    const escaped = c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const useWordBoundary = /^[A-Za-z0-9_]+$/.test(c);
    const pattern = useWordBoundary
      ? new RegExp(`\\b${escaped}\\b`)
      : new RegExp(`(^|[^A-Za-z0-9])${escaped}([^A-Za-z0-9]|$)`);
    if (pattern.test(prose)) return true;
  }
  return false;
}

export function checkGlossaryAlignment(stage4Result: Stage4Result): string[] {
  const proseText = extractAllProseFromLlmOutput(stage4Result.llm_sections);
  const unused: string[] = [];
  for (const entry of stage4Result.deterministic_sections.glossary.entries) {
    if (!termAppearsInProse(entry.term, entry.acronym, proseText)) {
      unused.push(entry.acronym ? `${entry.acronym} (${entry.term})` : entry.term);
    }
  }
  return unused;
}

// ────────────────────────────────────────────────────────────────────────
// DC.6 — Section presence
//
// All 14 expected section IDs (T, ES, OP, CS, GP, FO, RB.1-7, RP.8-12, IR,
// DN, AT, MC, GL, DS) must be present in the assembled output. RB.* and
// RP.* sections must use unique section IDs within their lens.
// ────────────────────────────────────────────────────────────────────────

export function checkSectionPresence(stage4Result: Stage4Result): string[] {
  const missing: string[] = [];
  const det = stage4Result.deterministic_sections;
  const llm = stage4Result.llm_sections;

  // Deterministic sections.
  if (!det.title_page) missing.push("T");
  if (!llm.executive_summary) missing.push("ES");
  if (!llm.our_process) missing.push("OP");
  if (!det.client_snapshot) missing.push("CS");
  if (!det.goals_priorities) missing.push("GP");
  if (!llm.findings_observations) missing.push("FO");
  if (!det.implementation_roadmap) missing.push("IR");
  if (!det.decisions_needed) missing.push("DN");
  if (!det.advisory_team) missing.push("AT");
  if (!llm.meeting_cadence_intro || !det.meeting_cadence_table) missing.push("MC");
  if (!det.glossary) missing.push("GL");
  if (!det.disclosures) missing.push("DS");

  // Recommendations — Business: at least one section in RB.1-RB.7.
  const businessSections = llm.recommendations_business?.sections ?? [];
  if (businessSections.length === 0) {
    missing.push("RB.*");
  } else {
    // Check uniqueness within lens.
    const businessIds = new Set<string>();
    const dupes: string[] = [];
    for (const sec of businessSections) {
      if (businessIds.has(sec.section_id)) dupes.push(sec.section_id);
      businessIds.add(sec.section_id);
      if (!sec.section_id.startsWith("RB.")) {
        missing.push(`${sec.section_id} (Business section with non-RB.* ID)`);
      }
    }
    for (const d of dupes) missing.push(`${d} (duplicate within Business lens)`);
  }

  // Recommendations — Personal: at least one section in RP.8-RP.12.
  const personalSections = llm.recommendations_personal?.sections ?? [];
  if (personalSections.length === 0) {
    missing.push("RP.*");
  } else {
    const personalIds = new Set<string>();
    const dupes: string[] = [];
    for (const sec of personalSections) {
      if (personalIds.has(sec.section_id)) dupes.push(sec.section_id);
      personalIds.add(sec.section_id);
      if (!sec.section_id.startsWith("RP.")) {
        missing.push(`${sec.section_id} (Personal section with non-RP.* ID)`);
      }
    }
    for (const d of dupes) missing.push(`${d} (duplicate within Personal lens)`);
  }

  return missing;
}

// ────────────────────────────────────────────────────────────────────────
// DC.7 — Archetype-gating consistency
//
// [OPTIONAL — included because of pre-transaction posture] sections only
// present when archetype === "PRE". [PERSONAL — for owner(s)] only on
// RP.* sections.
// ────────────────────────────────────────────────────────────────────────

const PRE_TRANSACTION_LABEL =
  "[OPTIONAL — included because of pre-transaction posture]";
const PERSONAL_LABEL = "[PERSONAL — for owner(s)]";

export function checkArchetypeGatingConsistency(
  stage4Result: Stage4Result,
  archetype: ArchetypeIdentifier,
): { section_id: string; label: string; reason: string }[] {
  const violations: { section_id: string; label: string; reason: string }[] = [];

  // Pre-transaction OPTIONAL only allowed for archetype === "PRE".
  const allRecSections = [
    ...stage4Result.llm_sections.recommendations_business.sections,
    ...stage4Result.llm_sections.recommendations_personal.sections,
  ];
  for (const sec of allRecSections) {
    if (sec.label === PRE_TRANSACTION_LABEL && archetype !== "PRE") {
      violations.push({
        section_id: sec.section_id,
        label: sec.label,
        reason: `Section carries label '${PRE_TRANSACTION_LABEL}' but archetype is '${archetype}' (only valid for PRE).`,
      });
    }
  }

  // Personal label only on RP.* sections.
  for (const sec of stage4Result.llm_sections.recommendations_business.sections) {
    if (sec.label === PERSONAL_LABEL) {
      violations.push({
        section_id: sec.section_id,
        label: sec.label,
        reason: `Section ${sec.section_id} (Business lens) carries '[PERSONAL — for owner(s)]' label; this label is reserved for RP.* sections.`,
      });
    }
  }

  return violations;
}

// ────────────────────────────────────────────────────────────────────────
// DC.8 — Number presence
//
// Every State A rec's quantified_impact.estimate.value must appear at
// least once in plan prose, within 5% range tolerance for rounded matches.
// Single-value estimates and tuple ranges both supported.
// ────────────────────────────────────────────────────────────────────────

const NUMBER_PRESENCE_TOLERANCE = 0.05;

function valueToCandidates(value: number | [number, number]): number[] {
  if (Array.isArray(value)) return [Math.min(value[0], value[1]), Math.max(value[0], value[1])];
  return [value];
}

function extractDollarFigures(prose: string): number[] {
  const out: number[] = [];
  // $148,000 / $148K / $4.2M / $5,000,000 / $7.4M etc. Plus en-dash range halves.
  //
  // Alternation discipline: two cases must coexist without competing.
  //   (a) Comma-grouped integer: $148,000 / $5,000,000 — at least one comma.
  //   (b) Decimal-suffix or bare integer: $148K / $4.2M / $7.4M / $7,500.
  //
  // The comma-grouped pattern uses `(?:,[0-9]{3})+` (PLUS, not STAR) so it
  // refuses to match a bare "7" or "148"; that prevents the prior bug where
  // "[0-9]{1,3}(?:,[0-9]{3})*" matched "7" in "$7.4M" and stopped, causing
  // the suffix capture to fail on "." and yield $7 instead of $7,400,000.
  // With + the comma-grouped pattern only fires when there's actually a
  // comma; otherwise the decimal/integer pattern handles it cleanly.
  const re =
    /\$\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+(?:\.[0-9]+)?)\s*([KMBkmb])?/g;
  for (const m of prose.matchAll(re)) {
    const numStr = m[1].replace(/,/g, "");
    const n = parseFloat(numStr);
    if (Number.isNaN(n)) continue;
    const suffix = m[2]?.toLowerCase();
    const multiplier =
      suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : suffix === "b" ? 1_000_000_000 : 1;
    out.push(n * multiplier);
  }
  return out;
}

function valueWithinTolerance(target: number, candidates: number[]): boolean {
  for (const c of candidates) {
    if (target === 0 && c === 0) return true;
    if (target === 0 || c === 0) continue;
    const ratio = c / target;
    if (ratio >= 1 - NUMBER_PRESENCE_TOLERANCE && ratio <= 1 + NUMBER_PRESENCE_TOLERANCE) {
      return true;
    }
  }
  return false;
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

export function checkNumberPresence(
  stage4Result: Stage4Result,
  quantified: QuantifiedRecommendations,
): { rec_id: string; expected_value: string }[] {
  const proseText = extractAllProseFromLlmOutput(stage4Result.llm_sections);
  const figuresInProse = extractDollarFigures(proseText);

  const unused: { rec_id: string; expected_value: string }[] = [];
  for (const rec of quantified.recommendations) {
    if (rec.default_excluded) continue;
    const estimate = rec.quantified_impact.estimate;
    if (!estimate || estimate.value === undefined || estimate.value === null) continue;
    // Only check State A recs (estimate populated). State B/C/D recs use
    // qualitative_phrasing as primary narrative.
    const expectedValues = valueToCandidates(estimate.value);

    // Each expected value (single or pair) must have at least one match in prose.
    const allFound = expectedValues.every((target) =>
      valueWithinTolerance(target, figuresInProse),
    );
    if (!allFound) {
      const expectedDisplay = Array.isArray(estimate.value)
        ? `${fmtUsd(estimate.value[0])} – ${fmtUsd(estimate.value[1])}`
        : fmtUsd(estimate.value);
      unused.push({
        rec_id: rec.recommendation_id,
        expected_value: expectedDisplay,
      });
    }
  }
  return unused;
}

// ────────────────────────────────────────────────────────────────────────
// DC.9 — Compliance hygiene
//
// title_page.prepared_by_name + title_page.compliance_tracking_id +
// disclosures.body_paragraphs[] must all be populated. Compliance ID must
// match PSA-YYYY-MMDD-<NAME>-NNN format.
// ────────────────────────────────────────────────────────────────────────

const COMPLIANCE_TRACKING_ID_RE = /^PSA-\d{4}-\d{4}-[A-Z0-9]+-\d{3}$/;

export function checkComplianceHygiene(stage4Result: Stage4Result): string[] {
  const issues: string[] = [];
  const det = stage4Result.deterministic_sections;

  if (!det.title_page.prepared_by_name || det.title_page.prepared_by_name.trim().length === 0) {
    issues.push("title_page.prepared_by_name is empty");
  }
  if (!det.title_page.prepared_by_firm || det.title_page.prepared_by_firm.trim().length === 0) {
    issues.push("title_page.prepared_by_firm is empty");
  }
  if (!det.title_page.compliance_tracking_id) {
    issues.push("title_page.compliance_tracking_id is missing");
  } else if (!COMPLIANCE_TRACKING_ID_RE.test(det.title_page.compliance_tracking_id)) {
    issues.push(
      `title_page.compliance_tracking_id format invalid (expected PSA-YYYY-MMDD-<NAME>-NNN; got '${det.title_page.compliance_tracking_id}')`,
    );
  }
  if (!det.disclosures.body_paragraphs || det.disclosures.body_paragraphs.length === 0) {
    issues.push("disclosures.body_paragraphs is empty");
  }
  if (!det.disclosures.compliance_tracking_id) {
    issues.push("disclosures.compliance_tracking_id is missing");
  } else if (
    det.title_page.compliance_tracking_id &&
    det.disclosures.compliance_tracking_id !== det.title_page.compliance_tracking_id
  ) {
    issues.push(
      "disclosures.compliance_tracking_id does not match title_page.compliance_tracking_id",
    );
  }

  return issues;
}

// ────────────────────────────────────────────────────────────────────────
// DC.10 — Action item lifecycle integrity
//
// For every action_item in QR: duration_class === "long_running" iff
// check_in_cadence !== null iff auto_generated_reminder_template !== null.
// Stage 3a invariant; DC.10 is a regression sanity check.
// ────────────────────────────────────────────────────────────────────────

export function checkActionItemLifecycleIntegrity(
  quantified: QuantifiedRecommendations,
): { action_item_id: string; rule: string }[] {
  const violations: { action_item_id: string; rule: string }[] = [];
  for (const rec of quantified.recommendations) {
    for (const ai of rec.action_items) {
      const isLongRunning = ai.duration_class === "long_running";
      const hasCadence = ai.check_in_cadence !== null;
      const hasTemplate = ai.auto_generated_reminder_template !== null;

      if (isLongRunning !== hasCadence) {
        violations.push({
          action_item_id: ai.action_item_id,
          rule: `duration_class === "long_running" (${isLongRunning}) must agree with check_in_cadence !== null (${hasCadence})`,
        });
      }
      if (isLongRunning !== hasTemplate) {
        violations.push({
          action_item_id: ai.action_item_id,
          rule: `duration_class === "long_running" (${isLongRunning}) must agree with auto_generated_reminder_template !== null (${hasTemplate})`,
        });
      }

      // partner_required ⇔ partner_type !== null.
      const requiresPartner = ai.partner_required === true;
      const hasPartnerType = ai.partner_type !== null;
      if (requiresPartner !== hasPartnerType) {
        violations.push({
          action_item_id: ai.action_item_id,
          rule: `partner_required (${requiresPartner}) must agree with partner_type !== null (${hasPartnerType})`,
        });
      }
    }
  }
  return violations;
}

// ────────────────────────────────────────────────────────────────────────
// Orchestrator: run all 10 deterministic checks
// ────────────────────────────────────────────────────────────────────────

export function runAllDeterministicChecks(
  stage4Result: Stage4Result,
  quantified: QuantifiedRecommendations,
  clientProfile: ClientProfile,
  landmineAuthorizations: LandmineAuthorization[] = [],
): DeterministicCheckResults {
  return {
    DC1_unresolved_cross_refs: checkCrossReferenceResolution(stage4Result),
    DC2_roadmap_orphans: checkRoadmapActionCoverage(stage4Result, quantified),
    DC3_top5_mismatch: checkTopFivePrioritiesConsistency(stage4Result, quantified),
    DC4_missing_decisions: checkDecisionsNeededCompleteness(
      stage4Result,
      quantified,
      landmineAuthorizations,
    ),
    DC5_unused_glossary: checkGlossaryAlignment(stage4Result),
    DC6_missing_sections: checkSectionPresence(stage4Result),
    DC7_archetype_violations: checkArchetypeGatingConsistency(
      stage4Result,
      clientProfile.engagement.archetype,
    ),
    DC8_unused_numbers: checkNumberPresence(stage4Result, quantified),
    DC9_compliance_issues: checkComplianceHygiene(stage4Result),
    DC10_lifecycle_violations: checkActionItemLifecycleIntegrity(quantified),
  };
}

// ────────────────────────────────────────────────────────────────────────
// Convert deterministic check results into AuditFinding entries.
//
// Each DC.* result class produces 0..N AuditFinding entries with fixed
// severity + suggested_action mappings per the spec.
// ────────────────────────────────────────────────────────────────────────

let findingIdCounter = 0;
function nextFindingId(): string {
  findingIdCounter += 1;
  return `F-${String(findingIdCounter).padStart(3, "0")}`;
}

export function _resetFindingIdCounterForTesting(): void {
  findingIdCounter = 0;
}

export function deterministicResultsToFindings(
  results: DeterministicCheckResults,
): AuditFinding[] {
  const findings: AuditFinding[] = [];

  // DC.1 — critical (unresolved cross-refs break reader navigation)
  for (const u of results.DC1_unresolved_cross_refs) {
    findings.push({
      finding_id: nextFindingId(),
      severity: "critical",
      category: "DC1_unresolved_cross_refs",
      section_ids: [u.source_section_id],
      description: `Cross-reference target '${u.target_section_id}' does not resolve to any section in the assembled plan.`,
      evidence: `${u.source_section_id} → ${u.target_section_id}: "${u.display_text}"`.slice(
        0,
        500,
      ),
      suggested_action: "regenerate_section",
    });
  }

  // DC.2 — critical (roadmap orphan = action item not in QR)
  for (const o of results.DC2_roadmap_orphans) {
    findings.push({
      finding_id: nextFindingId(),
      severity: "critical",
      category: "DC2_roadmap_orphans",
      section_ids: ["IR"],
      description: `Implementation Roadmap references action_item_id '${o.source_action_item_id}' that is absent from QuantifiedRecommendations.`,
      evidence: `IR → action_item_id=${o.source_action_item_id} (absent from ${o.absent_from})`,
      suggested_action: "regenerate_section",
    });
  }

  // DC.3 — warning (rank/impact mismatch is recoverable; LLM rephrased OK)
  if (results.DC3_top5_mismatch !== null) {
    const mm = results.DC3_top5_mismatch;
    findings.push({
      finding_id: nextFindingId(),
      severity: "warning",
      category: "DC3_top5_mismatch",
      section_ids: ["ES"],
      description: `Top 5 Priorities ranking or impact figures differ from deterministic computation. Mismatched ranks: ${mm.mismatched_ranks.join(", ")}.`,
      evidence: `deterministic[0]: ${mm.deterministic[0]?.descriptor ?? "n/a"}; emitted[0]: ${mm.emitted[0]?.descriptor ?? "n/a"}`.slice(
        0,
        500,
      ),
      suggested_action: "regenerate_section",
    });
  }

  // DC.4 — critical (missing pending decision = advisor misses a checkbox)
  for (const id of results.DC4_missing_decisions) {
    findings.push({
      finding_id: nextFindingId(),
      severity: "critical",
      category: "DC4_missing_decisions",
      section_ids: ["DN"],
      description: `Recommendation ${id} requires a pending decision but is not surfaced in the Decisions Needed section.`,
      evidence: `${id} (decisions_needed === true OR pending_reconciliation === true) absent from DN`,
      suggested_action: "regenerate_section",
    });
  }

  // DC.5 — info (Stage 4 builder regression indicator; rarely actionable)
  for (const term of results.DC5_unused_glossary) {
    findings.push({
      finding_id: nextFindingId(),
      severity: "info",
      category: "DC5_unused_glossary",
      section_ids: ["GL"],
      description: `Glossary term '${term}' appears in the glossary but not in plan prose. Stage 4 builder may have a regression in glossary auto-extraction.`,
      evidence: `Glossary entry '${term}' has no matching usage in plan prose`,
      suggested_action: "informational_only",
    });
  }

  // DC.6 — critical (incomplete plan)
  for (const sid of results.DC6_missing_sections) {
    findings.push({
      finding_id: nextFindingId(),
      severity: "critical",
      category: "DC6_missing_sections",
      section_ids: [sid],
      description: `Plan is missing section '${sid}' or has an invalid section ID.`,
      evidence: `Section '${sid}' absent or invalid`,
      suggested_action: "regenerate_plan",
    });
  }

  // DC.7 — critical (gating violation = wrong content for engagement type)
  for (const v of results.DC7_archetype_violations) {
    findings.push({
      finding_id: nextFindingId(),
      severity: "critical",
      category: "DC7_archetype_violations",
      section_ids: [v.section_id],
      description: v.reason,
      evidence: `${v.section_id} carries label '${v.label}' inconsistently with archetype gating`,
      suggested_action: "regenerate_section",
    });
  }

  // DC.8 — warning (Stage 4 dropped a Stage 3a-computed figure)
  for (const u of results.DC8_unused_numbers) {
    findings.push({
      finding_id: nextFindingId(),
      severity: "warning",
      category: "DC8_unused_numbers",
      section_ids: [],
      description: `Stage 3a quantified_impact.estimate for ${u.rec_id} (${u.expected_value}) does not appear in plan prose within tolerance.`,
      evidence: `${u.rec_id}: expected ${u.expected_value} not found in prose (5% tolerance)`,
      suggested_action: "verify_with_advisor",
    });
  }

  // DC.9 — critical (compliance prerequisite for advisor delivery)
  for (const issue of results.DC9_compliance_issues) {
    findings.push({
      finding_id: nextFindingId(),
      severity: "critical",
      category: "DC9_compliance_issues",
      section_ids: ["T", "DS"],
      description: `Compliance hygiene issue: ${issue}`,
      evidence: issue.slice(0, 500),
      suggested_action: "hand_edit",
    });
  }

  // DC.10 — warning (Stage 3a or builder regression)
  for (const v of results.DC10_lifecycle_violations) {
    findings.push({
      finding_id: nextFindingId(),
      severity: "warning",
      category: "DC10_lifecycle_violations",
      section_ids: ["IR"],
      description: `ActionItem ${v.action_item_id} violates lifecycle invariant: ${v.rule}`,
      evidence: `${v.action_item_id}: ${v.rule}`.slice(0, 500),
      suggested_action: "verify_with_advisor",
    });
  }

  return findings;
}

// ────────────────────────────────────────────────────────────────────────
// Voice calibration summary loader
//
// Reads specs/stages/stage4_voice_calibration.md and extracts sections
// §6 (State A/B/C/D communication patterns), §8 (style rules), §9 (do/don't
// rules) — the parts the LLM auditor needs to score against. Returns
// ~1.5K-token summary for Stage 5's user turn.
//
// Cached at module scope.
// ────────────────────────────────────────────────────────────────────────

const VOICE_CALIBRATION_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../specs/stages/stage4_voice_calibration.md",
);

let cachedVoiceCalibrationSummary: string | null = null;

export function _resetVoiceCalibrationCacheForTesting(): void {
  cachedVoiceCalibrationSummary = null;
}

function extractSectionsBetween(
  fullDoc: string,
  startHeader: RegExp,
  endHeader: RegExp,
): string {
  const startMatch = fullDoc.match(startHeader);
  if (!startMatch) return "";
  const startIdx = startMatch.index ?? 0;
  const remainder = fullDoc.slice(startIdx);
  const endMatch = remainder.slice(startMatch[0].length).match(endHeader);
  if (!endMatch) return remainder.trim();
  const endIdx = startMatch[0].length + (endMatch.index ?? 0);
  return remainder.slice(0, endIdx).trim();
}

export async function loadVoiceCalibrationSummary(): Promise<string> {
  if (cachedVoiceCalibrationSummary !== null) {
    return cachedVoiceCalibrationSummary;
  }
  const fullDoc = await readFile(VOICE_CALIBRATION_PATH, "utf8");

  // §6 State A/B/C/D communication patterns
  const section6 = extractSectionsBetween(
    fullDoc,
    /^## 6\./m,
    /^## 7\./m,
  );
  // §8 Style rules
  const section8 = extractSectionsBetween(
    fullDoc,
    /^## 8\./m,
    /^## 9\./m,
  );
  // §9 Do/Don't rules
  const section9 = extractSectionsBetween(
    fullDoc,
    /^## 9\./m,
    /^## 10\./m,
  );

  const summary = [
    "# Voice Calibration Summary (excerpt for Stage 5 audit reference)",
    "",
    "Below are the canonical voice rules from the synthetic Holloway plan exemplar that Stage 4's prose should honor. Use these as the rubric for LC.6 voice quality scoring and LC.1 voice consistency comparison.",
    "",
    section6,
    "",
    "---",
    "",
    section8,
    "",
    "---",
    "",
    section9,
  ].join("\n");

  cachedVoiceCalibrationSummary = summary;
  return summary;
}

// ────────────────────────────────────────────────────────────────────────
// Re-exports
// ────────────────────────────────────────────────────────────────────────

export type { LandmineAuthorization };
export { STAGE4_SECTION_IDS };
