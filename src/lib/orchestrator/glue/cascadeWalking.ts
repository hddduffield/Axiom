import type { CascadeWalkResult, SequencedPlan } from "../schemas/pipelineTypes";

// ────────────────────────────────────────────────────────────────────────
// BFS over co_triggered_with[] relationships.
//
// Determinism is enforced by:
//   1. Sorting the peer list (co_triggered_with[]) alphabetically before
//      iteration on each dequeue.
//   2. Sorting starter_rec_ids alphabetically before seeding the queue.
//   3. Returning the visited Set re-built from a sorted array, so the
//      iteration order of the resulting Set is byte-identical run-to-run.
//
// Cycle protection: a peer is enqueued only when first added to `visited`.
// ────────────────────────────────────────────────────────────────────────

interface InternalResult {
  visited: Set<string>;
  unresolvedStarters: string[];
  iterations: number;
}

function bfs(starterRecIds: string[], plan: SequencedPlan): InternalResult {
  const recById = new Map(
    plan.sequenced_recommendations.map((r) => [r.recommendation_id, r]),
  );
  const visited = new Set<string>();
  const unresolved: string[] = [];

  if (starterRecIds.length === 0) {
    return { visited, unresolvedStarters: unresolved, iterations: 0 };
  }

  // Sort starters for deterministic seeding.
  const sortedStarters = [...starterRecIds].sort();

  // Seed: only resolvable starters enter `visited`. Unresolved starters are
  // tracked separately and never appear in cascade_set (per spec test 7).
  let frontier: string[] = [];
  for (const id of sortedStarters) {
    if (recById.has(id)) {
      if (!visited.has(id)) {
        visited.add(id);
        frontier.push(id);
      }
    } else {
      if (!unresolved.includes(id)) unresolved.push(id);
    }
  }

  // iterations counts BFS depth reached. Floor of 1 when any starter resolved.
  // Test expectations: empty → 0; single-no-children → 1; A→B→C chain → 2.
  let depth = 0;
  let maxDepth = 0;
  while (frontier.length > 0) {
    const nextFrontier: string[] = [];
    for (const id of [...frontier].sort()) {
      const rec = recById.get(id);
      if (!rec) continue;
      const peers = [...rec.co_triggered_with].sort();
      for (const peer of peers) {
        if (visited.has(peer)) continue;
        // v2: track dangling_co_triggered_references in CascadeWalkResult;
        // mechanical pre-check 4 surfaces as warnings to detect prose-vs-data
        // inconsistencies. v1 silently skips dangling peers.
        if (!recById.has(peer)) continue;
        visited.add(peer);
        nextFrontier.push(peer);
      }
    }
    if (nextFrontier.length > 0) {
      depth += 1;
      maxDepth = depth;
    }
    frontier = nextFrontier;
  }

  const iterations = visited.size > 0 ? Math.max(maxDepth, 1) : 0;
  return { visited, unresolvedStarters: unresolved, iterations };
}

function freezeAsSortedSet(visited: Set<string>): { set: Set<string>; sorted: string[] } {
  const sorted = [...visited].sort();
  // Build a fresh Set from the sorted array so iteration order is canonical.
  return { set: new Set(sorted), sorted };
}

export function walkCascadeSet(
  starterRecIds: string[],
  sequencedPlan: SequencedPlan,
): Set<string> {
  try {
    if (!sequencedPlan || !Array.isArray(sequencedPlan.sequenced_recommendations)) {
      return new Set();
    }
    const { visited } = bfs(starterRecIds ?? [], sequencedPlan);
    return freezeAsSortedSet(visited).set;
  } catch {
    return new Set();
  }
}

export function walkCascadeSetWithDiagnostics(
  starterRecIds: string[],
  sequencedPlan: SequencedPlan,
): CascadeWalkResult {
  try {
    if (!sequencedPlan || !Array.isArray(sequencedPlan.sequenced_recommendations)) {
      return {
        cascade_set: new Set(),
        cascade_set_sorted: [],
        starter_count: starterRecIds?.length ?? 0,
        expanded_count: 0,
        iterations: 0,
        unresolved_starters: [],
      };
    }
    const starters = starterRecIds ?? [];
    const { visited, unresolvedStarters, iterations } = bfs(starters, sequencedPlan);
    const { set, sorted } = freezeAsSortedSet(visited);
    // expanded_count = total reached minus the resolvable starters in cascade_set.
    const resolvableStartersInSet = starters.filter((s) => set.has(s)).length;
    return {
      cascade_set: set,
      cascade_set_sorted: sorted,
      starter_count: starters.length,
      expanded_count: set.size - resolvableStartersInSet,
      iterations,
      unresolved_starters: [...unresolvedStarters].sort(),
    };
  } catch {
    return {
      cascade_set: new Set(),
      cascade_set_sorted: [],
      starter_count: starterRecIds?.length ?? 0,
      expanded_count: 0,
      iterations: 0,
      unresolved_starters: [],
    };
  }
}
