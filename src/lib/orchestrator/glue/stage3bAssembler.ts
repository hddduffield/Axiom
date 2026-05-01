import type {
  ActionItem,
  AssemblerFlags,
  ClusterIndexEntry,
  Decision,
  ExcludedStrategy,
  NumericValue,
  OrchestratorConfig,
  PlanSectionName,
  QuantifiedRecommendations,
  RecommendationCategory,
  SelectedRecommendation,
  SelectedRecommendations,
  SequencedPlan,
  SequencedPlanFailed,
  SequencedRecommendation,
  SequencerFailure,
  SequencerMetadata,
  SupervisoryReviewReason,
  SupervisoryReviewReasonCode,
  SupervisoryReviewSignal,
  TimingBucket,
} from "../schemas/pipelineTypes";

const SEQUENCER_A_VERSION = "0.1.0";
const ASSEMBLER_B_VERSION = "0.1.0";

export const CATEGORY_PRIORITY: RecommendationCategory[] = [
  "Entity Structure",
  "Estate",
  "Risk & Insurance",
  "Tax",
  "Retirement",
  "Investment",
  "Succession & Continuity",
  "Family",
  "Charitable",
  "Specialty",
];

const TIMING_BUCKET_ORDER: TimingBucket[] = [
  "0-30 days",
  "30-60 days",
  "60-120 days",
  "4-6 months",
  "6-12 months",
  "12-24 months",
  "Ongoing",
];

const REASON_ROUTING: Record<
  SupervisoryReviewReasonCode,
  "OSJ_principal" | "compliance_general" | "advisor_self_review"
> = {
  landmine_authorized: "OSJ_principal",
  landmine_excluded_default_with_trigger: "compliance_general",
  firm_policy_resolution_applied: "advisor_self_review",
  firm_policy_resolution_pending: "compliance_general",
  mutually_exclusive_tie_resolved_at_advisor_judgment: "OSJ_principal",
  tax_strategy_outside_advisor_scope: "compliance_general",
  specialty_recommendation_present: "OSJ_principal",
  alternative_investment_recommended: "OSJ_principal",
  performance_projection_above_threshold: "OSJ_principal",
  templatization_threshold_warning: "compliance_general",
};

export interface AssemblerOptions {
  now?: Date;
  metadataSeed?: Partial<SequencerMetadata>;
}

// ────────────────────────────────────────────────────────────────────────
// Helper exports — graph + sort
// ────────────────────────────────────────────────────────────────────────

export interface DependencyGraph {
  nodes: string[];
  // adj: predecessor → set of successors (predecessor must come before successors)
  adj: Map<string, Set<string>>;
  inDegree: Map<string, number>;
  outDegree: Map<string, number>;
}

export function buildDependencyGraph(
  recIds: string[],
  selectedMap: Map<string, SelectedRecommendation>,
): DependencyGraph {
  const adj = new Map<string, Set<string>>();
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  for (const id of recIds) {
    adj.set(id, new Set());
    inDegree.set(id, 0);
    outDegree.set(id, 0);
  }
  const addEdge = (from: string, to: string) => {
    if (!adj.has(from) || !adj.has(to)) return;
    if (adj.get(from)!.has(to)) return;
    adj.get(from)!.add(to);
    inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
    outDegree.set(from, (outDegree.get(from) ?? 0) + 1);
  };
  for (const id of recIds) {
    const sel = selectedMap.get(id);
    if (!sel) continue;
    for (const e of sel.must_come_after) addEdge(e.recommendation_id, id);
    for (const e of sel.must_come_before) addEdge(id, e.recommendation_id);
  }
  return { nodes: [...recIds], adj, inDegree, outDegree };
}

export function detectCycles(graph: DependencyGraph): string[][] {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const n of graph.nodes) color.set(n, WHITE);
  const cycles: string[][] = [];
  const path: string[] = [];

  const dfs = (node: string): void => {
    color.set(node, GRAY);
    path.push(node);
    const neighbors = [...(graph.adj.get(node) ?? new Set())].sort();
    for (const next of neighbors) {
      const c = color.get(next);
      if (c === GRAY) {
        const idx = path.indexOf(next);
        if (idx !== -1) cycles.push(path.slice(idx));
      } else if (c === WHITE) {
        dfs(next);
      }
    }
    color.set(node, BLACK);
    path.pop();
  };

  for (const n of [...graph.nodes].sort()) {
    if (color.get(n) === WHITE) dfs(n);
  }
  return cycles;
}

export function topologicalSort(
  graph: DependencyGraph,
  recsById: Map<string, SequencedRecommendation>,
  selectedMap: Map<string, SelectedRecommendation>,
): string[] {
  const inDeg = new Map<string, number>(graph.inDegree);
  const order: string[] = [];

  const tieBreakKey = (id: string): [number, number, string] => {
    const sel = selectedMap.get(id);
    const mcbCount = sel ? sel.must_come_before.length : 0;
    const cat = recsById.get(id)?.category;
    const catRank = cat ? CATEGORY_PRIORITY.indexOf(cat) : CATEGORY_PRIORITY.length;
    return [-mcbCount, catRank, id];
  };

  const compareTuples = (a: [number, number, string], b: [number, number, string]): number => {
    if (a[0] !== b[0]) return a[0] - b[0];
    if (a[1] !== b[1]) return a[1] - b[1];
    return a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0;
  };

  while (order.length < graph.nodes.length) {
    const frontier = graph.nodes.filter(
      (n) => !order.includes(n) && (inDeg.get(n) ?? 0) === 0,
    );
    if (frontier.length === 0) break; // cycle (caught earlier)
    frontier.sort((a, b) => compareTuples(tieBreakKey(a), tieBreakKey(b)));
    const pick = frontier[0];
    order.push(pick);
    for (const succ of graph.adj.get(pick) ?? new Set()) {
      inDeg.set(succ, (inDeg.get(succ) ?? 0) - 1);
    }
  }
  return order;
}

// ────────────────────────────────────────────────────────────────────────
// SEQUENCED WITH compaction
// ────────────────────────────────────────────────────────────────────────

function buildSequencedWithComponents(
  recIds: string[],
  selectedMap: Map<string, SelectedRecommendation>,
): Map<string, Set<string>> {
  // Union-find via parent map.
  const parent = new Map<string, string>();
  for (const id of recIds) parent.set(id, id);
  const find = (x: string): string => {
    let cur = x;
    while (parent.get(cur) !== cur) cur = parent.get(cur)!;
    parent.set(x, cur);
    return cur;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const id of recIds) {
    const sel = selectedMap.get(id);
    if (!sel) continue;
    for (const sw of sel.sequenced_with) {
      if (parent.has(sw.recommendation_id)) union(id, sw.recommendation_id);
    }
  }
  const components = new Map<string, Set<string>>();
  for (const id of recIds) {
    const root = find(id);
    if (!components.has(root)) components.set(root, new Set());
    components.get(root)!.add(id);
  }
  return components;
}

export function compactSequencedWithClusters(
  topoOrder: string[],
  selectedMap: Map<string, SelectedRecommendation>,
): { order: string[]; violations: Array<{ rec_ids_involved: string[]; reason: string }> } {
  const components = buildSequencedWithComponents(topoOrder, selectedMap);
  const memberSet = new Map<string, Set<string>>();
  for (const set of components.values()) {
    if (set.size <= 1) continue;
    for (const m of set) memberSet.set(m, set);
  }
  if (memberSet.size === 0) return { order: [...topoOrder], violations: [] };

  const positionInTopo = new Map<string, number>();
  topoOrder.forEach((id, i) => positionInTopo.set(id, i));

  // Latest topo position per component (= when it's safe to emit all members).
  const latestForSet = new Map<Set<string>, string>();
  for (const set of memberSet.values()) {
    if (latestForSet.has(set)) continue;
    let best = "";
    let bestIdx = -1;
    for (const m of set) {
      const idx = positionInTopo.get(m) ?? -1;
      if (idx > bestIdx) {
        bestIdx = idx;
        best = m;
      }
    }
    latestForSet.set(set, best);
  }

  const result: string[] = [];
  const placed = new Set<string>();
  for (const rec of topoOrder) {
    if (placed.has(rec)) continue;
    const set = memberSet.get(rec);
    if (!set) {
      result.push(rec);
      placed.add(rec);
      continue;
    }
    if (rec === latestForSet.get(set)) {
      // Emit every member in topo order.
      for (const m of topoOrder) {
        if (set.has(m) && !placed.has(m)) {
          result.push(m);
          placed.add(m);
        }
      }
    }
    // else: defer (skip this iteration; will emit when latest appears)
  }
  // Anything not placed (defensive) → append.
  for (const rec of topoOrder) {
    if (!placed.has(rec)) {
      result.push(rec);
      placed.add(rec);
    }
  }

  return { order: result, violations: [] };
}

// ────────────────────────────────────────────────────────────────────────
// COORDINATED WITH proximity (passive: log violations, no reorder)
// ────────────────────────────────────────────────────────────────────────

function checkCoordinatedProximity(
  order: string[],
  selectedMap: Map<string, SelectedRecommendation>,
  recsById: Map<string, SequencedRecommendation>,
): Array<{ rec_ids_involved: string[]; reason: string }> {
  const violations: Array<{ rec_ids_involved: string[]; reason: string }> = [];
  const positionByRec = new Map<string, number>();
  order.forEach((id, i) => positionByRec.set(id, i));
  const seenPairs = new Set<string>();

  for (const id of order) {
    const sel = selectedMap.get(id);
    if (!sel) continue;
    for (const cw of sel.coordinated_with) {
      const peer = cw.recommendation_id;
      const pairKey = [id, peer].sort().join("|");
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);
      const i = positionByRec.get(id);
      const j = positionByRec.get(peer);
      if (i === undefined || j === undefined) continue;
      const distance = Math.abs(i - j);
      const sectionA = recsById.get(id)?.plan_section ?? null;
      const sectionB = recsById.get(peer)?.plan_section ?? null;
      if (distance > 1 || sectionA !== sectionB) {
        violations.push({
          rec_ids_involved: [id, peer],
          reason:
            distance > 1 && sectionA !== sectionB
              ? `Coordinated peers ${id}/${peer} are ${distance} positions apart and in different plan sections (${sectionA} vs ${sectionB})`
              : distance > 1
              ? `Coordinated peers ${id}/${peer} are ${distance} positions apart`
              : `Coordinated peers ${id}/${peer} are in different plan sections (${sectionA} vs ${sectionB})`,
        });
      }
    }
  }
  return violations;
}

// ────────────────────────────────────────────────────────────────────────
// Cluster index
// ────────────────────────────────────────────────────────────────────────

export function buildClusterIndex(
  recs: SequencedRecommendation[],
): Record<string, ClusterIndexEntry> {
  const byCluster = new Map<string, SequencedRecommendation[]>();
  for (const r of recs) {
    if (!r.cluster_id) continue;
    if (!byCluster.has(r.cluster_id)) byCluster.set(r.cluster_id, []);
    byCluster.get(r.cluster_id)!.push(r);
  }
  const out: Record<string, ClusterIndexEntry> = {};
  for (const [cluster_id, members] of byCluster) {
    const memberIds = members.map((m) => m.recommendation_id).sort();
    const closer = members.find((m) => m.cluster_sequence_closer !== null);
    const sectionCounts = new Map<PlanSectionName, number>();
    for (const m of members) {
      if (!m.plan_section) continue;
      sectionCounts.set(m.plan_section, (sectionCounts.get(m.plan_section) ?? 0) + 1);
    }
    let primary: PlanSectionName | null = null;
    if (sectionCounts.size > 0) {
      const sorted = [...sectionCounts.entries()].sort((a, b) => {
        if (a[1] !== b[1]) return b[1] - a[1];
        return a[0] < b[0] ? -1 : 1;
      });
      primary = sorted[0][0];
    }
    const spans = [...sectionCounts.keys()].sort();
    out[cluster_id] = {
      cluster_id,
      members: memberIds,
      closer_carrier: closer ? closer.recommendation_id : null,
      primary_section: primary,
      spans_sections: spans,
    };
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────
// Decisions Needed page
// ────────────────────────────────────────────────────────────────────────

function classifyDecision(
  rec: SequencedRecommendation,
  sel: SelectedRecommendation | undefined,
):
  | "firm_policy_resolution"
  | "mutually_exclusive_tie"
  | "landmine_opt_in"
  | "advisor_judgment" {
  if (
    rec.quantified_impact.pending_reconciliation &&
    rec.quantified_impact.alternative_values.length > 0
  ) {
    return "firm_policy_resolution";
  }
  if (sel?.preliminary_preference === "tie") return "mutually_exclusive_tie";
  if (rec.landmine && !rec.landmine_status.startsWith("landmine_authorized_by_")) {
    return "landmine_opt_in";
  }
  return "advisor_judgment";
}

function buildDecisionOptions(
  rec: SequencedRecommendation,
  sel: SelectedRecommendation | undefined,
  decisionType:
    | "firm_policy_resolution"
    | "mutually_exclusive_tie"
    | "landmine_opt_in"
    | "advisor_judgment",
): { options: Decision["options"]; recommended: string | null; summary: string } {
  if (decisionType === "firm_policy_resolution") {
    const opts = rec.quantified_impact.alternative_values.map((av) => ({
      label: av.formula_variant,
      value: av.value,
      rationale: av.context,
    }));
    return {
      options: opts,
      recommended: null,
      summary: `Awaiting firm-policy resolution for ${rec.recommendation_id}; ${opts.length} alternatives precomputed.`,
    };
  }
  if (decisionType === "mutually_exclusive_tie") {
    const peers = sel?.mutually_exclusive_with.map((p) => p.recommendation_id) ?? [];
    const opts = [rec.recommendation_id, ...peers].map((id) => ({
      label: id,
      value: id,
      rationale: id === rec.recommendation_id ? "This recommendation" : "Mutually exclusive peer",
    }));
    return {
      options: opts,
      recommended: null,
      summary: `Tie among mutually-exclusive recommendations: ${opts.map((o) => o.label).join(" / ")}.`,
    };
  }
  if (decisionType === "landmine_opt_in") {
    return {
      options: [
        { label: "Authorize", value: "authorize", rationale: "Include the landmine recommendation in the plan." },
        { label: "Decline", value: "decline", rationale: "Keep the landmine in the excluded-strategies appendix." },
      ],
      recommended: null,
      summary: `Landmine recommendation ${rec.recommendation_id} (status: ${rec.landmine_status}) requires advisor authorization.`,
    };
  }
  return {
    options: [],
    recommended: null,
    summary: `Advisor judgment required for ${rec.recommendation_id}.`,
  };
}

function buildDecisionsPage(
  recs: SequencedRecommendation[],
  selectedMap: Map<string, SelectedRecommendation>,
): Decision[] {
  const decisions: Decision[] = [];
  let counter = 1;
  for (const rec of recs) {
    if (!rec.decisions_needed) continue;
    const sel = selectedMap.get(rec.recommendation_id);
    const decisionType = classifyDecision(rec, sel);
    const { options, recommended, summary } = buildDecisionOptions(rec, sel, decisionType);
    decisions.push({
      decision_id: `DEC-${rec.recommendation_id}-${String(counter).padStart(2, "0")}`,
      decision_type: decisionType,
      source_recommendation_id: rec.recommendation_id,
      decision_summary: summary,
      options,
      recommended_option: recommended,
      deadline: rec.timing_bucket,
    });
    counter += 1;
  }
  decisions.sort((a, b) => {
    const aIdx = TIMING_BUCKET_ORDER.indexOf(a.deadline as TimingBucket);
    const bIdx = TIMING_BUCKET_ORDER.indexOf(b.deadline as TimingBucket);
    const aRank = aIdx === -1 ? Number.MAX_SAFE_INTEGER : aIdx;
    const bRank = bIdx === -1 ? Number.MAX_SAFE_INTEGER : bIdx;
    if (aRank !== bRank) return aRank - bRank;
    return a.source_recommendation_id < b.source_recommendation_id
      ? -1
      : a.source_recommendation_id > b.source_recommendation_id
      ? 1
      : 0;
  });
  return decisions;
}

// ────────────────────────────────────────────────────────────────────────
// Strategies excluded
// ────────────────────────────────────────────────────────────────────────

function buildExcludedStrategies(
  recs: SequencedRecommendation[],
  selectedMap: Map<string, SelectedRecommendation>,
): ExcludedStrategy[] {
  const out: ExcludedStrategy[] = [];
  const seenPairs = new Set<string>();

  // (1) Landmines excluded by default.
  for (const rec of recs) {
    if (rec.landmine && rec.landmine_status === "landmine_excluded_default") {
      out.push({
        recommendation_id: rec.recommendation_id,
        category: rec.category,
        exclusion_reason: "landmine_default_excluded",
        rationale: `Landmine triggered without advisor authorization (status: ${rec.landmine_status}).`,
        could_revisit_when: "Advisor authorization is recorded in orchestrator config.",
      });
    }
  }

  // (2) Mutually-exclusive "alternative" choices, deduped by pair.
  for (const rec of recs) {
    const sel = selectedMap.get(rec.recommendation_id);
    if (!sel || sel.preliminary_preference !== "alternative") continue;
    const pairKey = [rec.recommendation_id, ...sel.mutually_exclusive_with.map((p) => p.recommendation_id)]
      .sort()
      .join("|");
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);
    out.push({
      recommendation_id: rec.recommendation_id,
      category: rec.category,
      exclusion_reason: "mutually_exclusive_alternative",
      rationale: sel.preliminary_preference_rationale ?? "Selected as alternative within a mutually-exclusive pair.",
      could_revisit_when: "Client circumstances or advisor preference shift.",
    });
  }

  return out;
}

// ────────────────────────────────────────────────────────────────────────
// Supervisory review signal
// ────────────────────────────────────────────────────────────────────────

function valueExceeds(value: NumericValue | null, threshold: number): boolean {
  if (!value) return false;
  if (Array.isArray(value.value)) {
    const [low, high] = value.value;
    return (low + high) / 2 > threshold;
  }
  return value.value > threshold;
}

function buildSupervisoryReviewSignal(
  recs: SequencedRecommendation[],
  selectedMap: Map<string, SelectedRecommendation>,
  appliedRecIds: Set<string>,
): SupervisoryReviewSignal {
  const reasons: SupervisoryReviewReason[] = [];
  const triggered = new Set<string>();
  const push = (reason: SupervisoryReviewReason) => {
    reasons.push(reason);
    if (reason.source_recommendation_id) triggered.add(reason.source_recommendation_id);
  };

  for (const rec of recs) {
    if (rec.landmine && rec.landmine_status.startsWith("landmine_authorized_by_")) {
      push({
        reason_code: "landmine_authorized",
        description: `Landmine recommendation ${rec.recommendation_id} authorized by advisor.`,
        source_recommendation_id: rec.recommendation_id,
        routing_implication: REASON_ROUTING.landmine_authorized,
      });
    }
    if (rec.landmine && rec.landmine_status === "landmine_excluded_default") {
      push({
        reason_code: "landmine_excluded_default_with_trigger",
        description: `Landmine ${rec.recommendation_id} triggered but excluded by default; advisor declined to authorize.`,
        source_recommendation_id: rec.recommendation_id,
        routing_implication: REASON_ROUTING.landmine_excluded_default_with_trigger,
      });
    }
    if (
      !rec.quantified_impact.pending_reconciliation &&
      appliedRecIds.has(rec.recommendation_id)
    ) {
      push({
        reason_code: "firm_policy_resolution_applied",
        description: `Firm policy resolution applied to ${rec.recommendation_id}.`,
        source_recommendation_id: rec.recommendation_id,
        routing_implication: REASON_ROUTING.firm_policy_resolution_applied,
      });
    }
    if (rec.quantified_impact.pending_reconciliation) {
      push({
        reason_code: "firm_policy_resolution_pending",
        description: `Firm policy resolution pending for ${rec.recommendation_id}; ${rec.quantified_impact.alternative_values.length} alternatives precomputed.`,
        source_recommendation_id: rec.recommendation_id,
        routing_implication: REASON_ROUTING.firm_policy_resolution_pending,
      });
    }
    const sel = selectedMap.get(rec.recommendation_id);
    if (sel?.preliminary_preference === "tie" && !rec.decisions_needed) {
      push({
        reason_code: "mutually_exclusive_tie_resolved_at_advisor_judgment",
        description: `Mutually-exclusive tie at ${rec.recommendation_id} resolved by advisor judgment.`,
        source_recommendation_id: rec.recommendation_id,
        routing_implication: REASON_ROUTING.mutually_exclusive_tie_resolved_at_advisor_judgment,
      });
    }
    if (rec.category === "Specialty") {
      push({
        reason_code: "specialty_recommendation_present",
        description: `Specialty-category recommendation ${rec.recommendation_id} requires elevated review.`,
        source_recommendation_id: rec.recommendation_id,
        routing_implication: REASON_ROUTING.specialty_recommendation_present,
      });
    }
    if (rec.category === "Tax") {
      const exceedsEstimate = valueExceeds(rec.quantified_impact.estimate, 100_000);
      const exceedsAlt = rec.quantified_impact.alternative_values.some((av) =>
        valueExceeds(av.value, 100_000),
      );
      if (exceedsEstimate || exceedsAlt) {
        push({
          reason_code: "tax_strategy_outside_advisor_scope",
          description: `Tax strategy ${rec.recommendation_id} exceeds $100K/yr threshold; refer to CPA partner.`,
          source_recommendation_id: rec.recommendation_id,
          routing_implication: REASON_ROUTING.tax_strategy_outside_advisor_scope,
        });
      }
    }
  }

  const hasOSJ = reasons.some((r) => r.routing_implication === "OSJ_principal");
  const hasGen = reasons.some((r) => r.routing_implication === "compliance_general");
  const routing: "OSJ_principal" | "compliance_general" | "advisor_self_review" = hasOSJ
    ? "OSJ_principal"
    : hasGen
    ? "compliance_general"
    : "advisor_self_review";

  return {
    required: reasons.length > 0,
    reasons,
    triggered_by_recommendations: [...triggered].sort(),
    routing_recommendation: routing,
    templatization_threshold_warning: false,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Validation helper
// ────────────────────────────────────────────────────────────────────────

function looksLikeQuantifiedRecs(input: unknown): input is QuantifiedRecommendations {
  if (!input || typeof input !== "object") return false;
  const obj = input as Record<string, unknown>;
  if (!Array.isArray(obj.recommendations)) return false;
  if (typeof obj._sequencer_flags !== "object" || obj._sequencer_flags === null) return false;
  return true;
}

function buildFailed(
  failures: SequencerFailure[],
  status: SequencedPlanFailed["_sequencer_status"] = "STAGE_3B_FAILED",
): SequencedPlanFailed {
  return { _sequencer_status: status, _failures: failures };
}

// ────────────────────────────────────────────────────────────────────────
// Main: assembleSequencedPlan
// ────────────────────────────────────────────────────────────────────────

export function assembleSequencedPlan(
  quantifiedRecs: QuantifiedRecommendations,
  selectedRecs: SelectedRecommendations,
  config: OrchestratorConfig,
  options: AssemblerOptions = {},
): SequencedPlan | SequencedPlanFailed {
  try {
    // Step 1: validate Stage 3a output.
    if (!looksLikeQuantifiedRecs(quantifiedRecs)) {
      return buildFailed([
        {
          stage: "3b",
          rec_id: null,
          reason: "Stage 3a output failed schema-shape validation",
          context: "quantifiedRecs is not a valid QuantifiedRecommendations object",
        },
      ]);
    }
    if (quantifiedRecs._sequencer_status === "FAILED") {
      return buildFailed(quantifiedRecs._sequencer_failures ?? [], "FAILED");
    }
    if (!selectedRecs || !Array.isArray(selectedRecs.selected)) {
      return buildFailed([
        {
          stage: "3b",
          rec_id: null,
          reason: "Stage 2 output failed schema-shape validation",
          context: "selectedRecs.selected missing or not an array",
        },
      ]);
    }

    const recs = quantifiedRecs.recommendations;
    const recIds = recs.map((r) => r.recommendation_id);
    const recsById = new Map(recs.map((r) => [r.recommendation_id, r]));
    const selectedMap = new Map(selectedRecs.selected.map((s) => [s.recommendation_id, s]));

    // Step 2: build dependency graph.
    const graph = buildDependencyGraph(recIds, selectedMap);

    // Step 3: cycle detection.
    const cycles = detectCycles(graph);
    if (cycles.length > 0) {
      return buildFailed([
        {
          stage: "3b",
          rec_id: null,
          reason: `Dependency cycle detected: ${cycles.map((c) => c.join(" → ")).join("; ")}`,
          context: JSON.stringify({ cycles }),
        },
      ]);
    }

    // Step 4: topological sort with deterministic tie-breakers.
    const topoOrder = topologicalSort(graph, recsById, selectedMap);

    // Step 5: compact SEQUENCED WITH clusters.
    const swResult = compactSequencedWithClusters(topoOrder, selectedMap);
    const orderAfterSW = swResult.order;

    // Step 6: COORDINATED WITH proximity (passive — log violations only).
    const coordViolations = checkCoordinatedProximity(orderAfterSW, selectedMap, recsById);

    // Step 7: assign position_in_sequence.
    const sequencedRecs: SequencedRecommendation[] = orderAfterSW.map((id, i) => {
      const original = recsById.get(id)!;
      return { ...original, position_in_sequence: i + 1 };
    });
    // Update map for downstream consumers.
    const sequencedById = new Map(sequencedRecs.map((r) => [r.recommendation_id, r]));

    // Step 8: group by plan_section.
    const planSections: Partial<Record<PlanSectionName, SequencedRecommendation[]>> = {};
    let sectionSkipped = 0;
    for (const rec of sequencedRecs) {
      if (!rec.plan_section) {
        sectionSkipped += 1;
        continue;
      }
      const arr = planSections[rec.plan_section] ?? [];
      arr.push(rec);
      planSections[rec.plan_section] = arr;
    }

    // Step 9: decisions needed page.
    const decisions = buildDecisionsPage(sequencedRecs, selectedMap);

    // Step 10: strategies considered but excluded.
    const excluded = buildExcludedStrategies(sequencedRecs, selectedMap);

    // Step 11: consolidate flags.
    const assemblerFlags: AssemblerFlags = {
      from_stage_3a: quantifiedRecs._sequencer_flags,
      from_stage_3b: {
        cycles_detected: [],
        soft_constraint_violations: [
          ...coordViolations.map((v) => ({
            type: "coordinated_with_proximity" as const,
            rec_ids_involved: v.rec_ids_involved,
            reason: v.reason,
          })),
          ...swResult.violations.map((v) => ({
            type: "sequenced_with_clustering" as const,
            rec_ids_involved: v.rec_ids_involved,
            reason: v.reason,
          })),
        ],
        section_assignment_skipped_count: sectionSkipped,
        decisions_page_size: decisions.length,
        strategies_excluded_count: excluded.length,
      },
    };

    // Step 11.5: supervisory review signal.
    // Determine which recs were affected by firm-policy resolutions.
    const appliedRecIds = new Set<string>();
    const firmPolicyApplied: SequencerMetadata["firm_policy_resolutions_applied"] = [];
    for (const resolution of config.firm_policy_resolutions) {
      const affected = sequencedRecs
        .filter((r) =>
          r.quantified_impact.alternative_values.some(
            (av) => av.awaiting === resolution.question_id,
          ),
        )
        .map((r) => r.recommendation_id);
      for (const id of affected) appliedRecIds.add(id);
      firmPolicyApplied.push({
        question_id: resolution.question_id,
        resolved_value: resolution.resolved_value,
        resolved_by: resolution.resolved_by,
        applied_to_recs: affected.sort(),
      });
    }
    const supervisorySignal = buildSupervisoryReviewSignal(
      sequencedRecs,
      selectedMap,
      appliedRecIds,
    );

    // Step 12: cluster index.
    const clusterIndex = buildClusterIndex(sequencedRecs);

    // Step 13: assemble metadata + final output.
    const seed = options.metadataSeed ?? {};
    const sequencedAt = (options.now ?? new Date()).toISOString();
    const metadata: SequencerMetadata = {
      sequencer_a_version: seed.sequencer_a_version ?? SEQUENCER_A_VERSION,
      assembler_b_version: seed.assembler_b_version ?? ASSEMBLER_B_VERSION,
      sequenced_at: seed.sequenced_at ?? sequencedAt,
      source_fr_content_hash: seed.source_fr_content_hash ?? "",
      source_client_profile_version: seed.source_client_profile_version ?? "",
      source_selected_recommendations_version:
        seed.source_selected_recommendations_version ?? "",
      archetype: seed.archetype ?? "PRE",
      archetype_secondary: seed.archetype_secondary ?? null,
      volatile_rates_snapshot: seed.volatile_rates_snapshot ?? {
        s7520_rate: 0,
        s7520_month: "",
        afr_short_annual: null,
        afr_mid_annual: null,
        afr_long_annual: null,
        last_refreshed: "",
        days_since_refresh: 0,
      },
      firm_policy_resolutions_applied:
        seed.firm_policy_resolutions_applied ?? firmPolicyApplied,
      landmine_authorizations_applied:
        seed.landmine_authorizations_applied ??
        config.landmine_authorizations.map((la) => la.recommendation_id).sort(),
      recommendation_count_total: sequencedRecs.length,
      recommendation_count_pending_reconciliation: sequencedRecs.filter(
        (r) => r.quantified_impact.pending_reconciliation,
      ).length,
      recommendation_count_qualitative_only: sequencedRecs.filter(
        (r) =>
          r.quantified_impact.estimate === null &&
          r.quantified_impact.qualitative_phrasing !== null,
      ).length,
      compliance_id: seed.compliance_id ?? null,
      compliance_id_format_version: seed.compliance_id_format_version ?? null,
    };

    const actionItemsFlat: ActionItem[] = sequencedRecs.flatMap((r) => r.action_items);
    const globalOrder = sequencedRecs.map((r) => r.recommendation_id);

    const plan: SequencedPlan = {
      _metadata: metadata,
      _assembler_flags: assemblerFlags,
      sequenced_recommendations: sequencedRecs,
      plan_sections: planSections,
      global_order: globalOrder,
      cluster_index: clusterIndex,
      decisions_needed_page: decisions,
      strategies_considered_but_excluded: excluded,
      action_items_flat: actionItemsFlat,
      supervisory_review_signal: supervisorySignal,
    };
    return plan;
  } catch (err) {
    return buildFailed([
      {
        stage: "3b",
        rec_id: null,
        reason: `Unexpected error in assembler: ${(err as Error).message}`,
        context: (err as Error).stack ?? "no stack",
      },
    ]);
  }
}
