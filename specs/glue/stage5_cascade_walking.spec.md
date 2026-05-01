# Cascade Walking Algorithm

**Type:** Deterministic. NO LLM call. Pure graph traversal.

**Purpose:** Given a set of "starter" rec_ids and a SequencedPlan containing co_triggered_with[] relationships, compute the closure — every rec_id that is co-triggered (transitively) by the starter set. Used by Stage 5 mechanical pre-check 4 (cascade integrity) to verify that prose mentions of cascade chains are complete.

**Input:**
- starter_rec_ids: string[] — initial rec_ids to expand
- sequenced_plan: SequencedPlan — provides co_triggered_with[] relationships

**Output:** Set<string> — closure of all rec_ids reachable via co_triggered_with[] from starters (inclusive of starters themselves).

---

## Algorithm

Standard BFS:

1. Initialize visited Set with starter_rec_ids.
2. Initialize queue with starter_rec_ids.
3. While queue is non-empty:
   - Dequeue rec_id.
   - Find the SequencedRecommendation with this id in sequenced_plan.sequenced_recommendations.
   - If not found, skip (defensive — referenced rec doesn't exist).
   - For each peer_id in this rec's co_triggered_with[]:
     - If peer_id not in visited:
       - Add to visited.
       - Enqueue peer_id.
4. Return visited.

---

## Determinism Requirements

The function must produce identical output given identical input. This is enforced by:

1. **Sorted iteration over co_triggered_with[]:** when processing peers, sort the peer list alphabetically before iteration. This eliminates dependency on input array order.

2. **Sorted output:** before returning, sort the visited set into a deterministic order. Convert Set → sorted Array → new Set. This ensures the output's iteration order is byte-identical across runs.

3. **No reliance on Map/Set iteration order for logic:** never use the iteration order of intermediate collections for correctness. Sort explicitly.

---

## Output Schema

Simple — Set<string> of rec_ids.

For testability, also expose:

```typescript
export interface CascadeWalkResult {
  cascade_set: Set<string>;
  cascade_set_sorted: string[];      // for deterministic JSON serialization
  starter_count: number;
  expanded_count: number;            // |cascade_set| - starter_count
  iterations: number;                // BFS levels traversed
  unresolved_starters: string[];     // starters not found in sequenced_plan
}
```

The richer return shape is for diagnostics (how many levels deep the cascade went, which starters were unresolvable). The basic Set<string> is what mechanical pre-check 4 actually consumes.

---

## Implementation Requirements

1. **Module location:** `src/lib/orchestrator/glue/cascadeWalking.ts`

2. **Two exported functions:**
```typescript
   // Simple: returns just the closure
   export function walkCascadeSet(
     starterRecIds: string[],
     sequencedPlan: SequencedPlan
   ): Set<string>
   
   // Diagnostic: returns full traversal data
   export function walkCascadeSetWithDiagnostics(
     starterRecIds: string[],
     sequencedPlan: SequencedPlan
   ): CascadeWalkResult
```

3. **Pure function. No throws.**

4. **Deterministic.** Same inputs → byte-identical outputs.

5. **Schema:** add CascadeWalkResult to pipelineTypes.ts.

6. **After implementation, refactor:** Remove the local stub `walkCascadeSet` from `src/lib/orchestrator/glue/mechanicalPreChecks.ts` and import from cascadeWalking.ts. Verify mechanical pre-check tests still pass after the refactor.

---

## Test Requirements

Create `src/lib/orchestrator/glue/__tests__/cascadeWalking.test.ts`:

### Test cases

1. **Empty starters** → empty cascade_set, no iterations, no unresolved_starters.

2. **Single starter, no co_triggered_with** → cascade_set has just the starter, expanded_count = 0, iterations = 1.

3. **Two-level chain (REC-A triggers REC-B; REC-B triggers REC-C)** → cascade_set = {REC-A, REC-B, REC-C}, expanded_count = 2, iterations = 2.

4. **Holloway entity-restructuring chain** — fixture:
   - REC-ENT-001 has co_triggered_with: [REC-ENT-002]
   - REC-ENT-002 has co_triggered_with: [REC-ENT-003, REC-EST-006]
   - REC-ENT-003 has co_triggered_with: [REC-EST-008]
   - REC-EST-006 has co_triggered_with: []
   - REC-EST-008 has co_triggered_with: []
   
   Walk from [REC-ENT-001]. Expect cascade_set = {REC-ENT-001, REC-ENT-002, REC-ENT-003, REC-EST-006, REC-EST-008}.

5. **Convergence (cycle protection)** — fixture with REC-A → REC-B → REC-A. Walk from [REC-A]. Expect termination, cascade_set = {REC-A, REC-B}, no infinite loop.

6. **Multi-starter input** — start from [REC-A, REC-X] where each has separate cascades. Verify both expansions happen and cascade_set contains all reached recs.

7. **Unresolvable starter** — start from [REC-NOEXIST] (id not in sequenced_plan). cascade_set = {} (or {REC-NOEXIST}? — pick one and document; recommend cascade_set = {} and unresolved_starters = ["REC-NOEXIST"]).

8. **DETERMINISM CI TEST (REQUIRED PER STAGE 5 PATCH):** Use the Holloway entity-restructuring chain fixture from test 4. Run walkCascadeSet 100 times. Assert every output (sorted as JSON) is byte-identical. Also assert walkCascadeSetWithDiagnostics produces byte-identical results. This test is per the Stage 5 v1.0.0 manifest's smaller-item (c) — determinism CI test required.

Use Node's node:test runner.

---

## What This Does NOT Do

- Does not call LLM
- Does not generate prose
- Does not modify the sequenced_plan
- Does not validate the cascade chain semantically (e.g., "does this cascade make business sense?")
- Does not walk must_come_after / must_come_before / coordinated_with relationships — only co_triggered_with
