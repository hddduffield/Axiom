# Stage 5 Mechanical Pre-Checks

**Type:** Deterministic. NO LLM call. Pure rules engine. Runs BEFORE the Stage 5 LLM coherence auditor.

**Purpose:** Catch the class of errors that don't require semantic judgment. Why pay LLM tokens to detect a number that doesn't match its source? Why ask the auditor to detect that REC-EST-099 (which doesn't exist) was referenced? These are mechanical checks. Run them first; the LLM only audits what survives.

**Critical:** Pre-Check 1 (number coherence) has explicit State C alternative_value protection per Critical Fix 1. Auto-fix is permitted only for pure rounding within tolerance to a single unambiguous whitelist value, never for substitution.

---

## The Six Pre-Checks

### Pre-Check 1 — Number Coherence

**Purpose:** Every dollar figure in the assembled plan body must trace to a value in the whitelist (sequenced_plan + aggregate_metrics).

**Algorithm:**

1. Build whitelist of "valid" values:
   - All quantified_impact.estimate values from sequenced_plan.sequenced_recommendations (State A only)
   - All aggregate metric values from aggregate_metrics
   - All cited rates from volatile_rates_snapshot

   Note: State C alternative_values are NOT in the whitelist. Citing one of them
   alone in prose is a discipline violation (the firm-policy question is unresolved,
   so the prose should hedge). They are handled separately via State C protection
   in can_auto_fix.

2. Extract all dollar figures from the assembled plan markdown:
   - Match patterns like `$[\d,]+(\.\d+)?[KMB]?` (e.g., "$73K", "$148K", "$4.5M", "$3,000,000")
   - Normalize each match to numeric value (parse "$73K" → 73000, etc.)

3. For each extracted figure, check whitelist membership:
   - Direct match (within 5% tolerance for rounding)
   - Match against any value in any rec's alternative_values list
   - Match against any aggregate metric value

4. Auto-fix discipline (Critical Fix 1):
def can_auto_fix(issue, sequenced_plan, aggregate_metrics):
"""
Auto-fix permitted ONLY for rounding within tolerance to a single
unambiguous whitelist value.
   Forbidden:
   - Substitution to a different rec's value
   - Any matched value falling in any rec's alternative_values range
     (State C protection)
   - Multiple whitelist values within tolerance (ambiguous)
   """
   # State C protection — never auto-fix values that match any rec's
   # alternative_values within rounding tolerance
   for rec in sequenced_plan.sequenced_recommendations:
       if not rec.quantified_impact.alternative_values:
           continue
       for alt in rec.quantified_impact.alternative_values:
           if value_in_tolerance_range(issue.matched_value, alt.value, 0.05):
               return False  # alternative_value range; never auto-fix
   
   # Single-source unambiguity — exactly one whitelist value within tolerance
   nearby = whitelist_values_within_5pct(
       issue.matched_value, sequenced_plan, aggregate_metrics
   )
   if len(nearby) != 1:
       return False  # ambiguous → regen
   
   # Pure rounding match — same number rounded differently
   return is_pure_rounding_match(issue.matched_value, nearby[0])

5. Outcome:
if len(issues) == 0:
return "passed"
elif all(can_auto_fix(i, sequenced_plan, aggregate_metrics) for i in issues):
auto_fix_in_assembled_plan(issues, mode="rounding_only")
return "failed_auto_fixed"
else:
return "failed_blocked", issues

### Pre-Check 2 — Statute Consistency

**Purpose:** Tax statute references in plan prose must be internally consistent and current.

**Algorithm:**

1. Load statute reference data:
   - From sequenced_plan: any volatile_rates_snapshot fields that include statute identifiers
   - Hardcoded for v1: known statute references (TCJA expiration date 2025-12-31, OBBBA enactment 2025-07-04, §7520 rate updates monthly, IRS estate exemption 2026 = $13.99M, 2026 PTET cap thresholds, etc.)

2. Extract all statute references from assembled plan markdown:
   - Patterns: `§\d+`, `IRC §\d+`, `Section \d+`, `TCJA`, `OBBBA`, year-references like "2026 estate exemption"

3. For each reference, verify against the reference data:
   - Section number is valid
   - Date references are current (e.g., references to 2024 or 2025 estate exemption are stale)
   - Statute applies to the topic discussed (heuristic: statute name should appear in same paragraph as topic keywords)

4. Outcome:
   - All references valid → "passed"
   - Any stale dates or invalid section numbers → "failed_blocked" with issue descriptors
   - No auto-fix (statute corrections require regeneration with correct context)

### Pre-Check 3 — Entity Name Consistency

**Purpose:** Entity name first-mention pattern is followed; subsequent mentions match the canonical short form.

**Algorithm:**

1. From sequenced_plan or client_profile context: extract entity_legal_name and entity_short_name (or "Sample Industries, LLC" → short "SI" / "Sample Industries").

2. Extract all entity name mentions from assembled plan markdown.

3. Verify first-mention pattern: `[Legal Name] ('[Short Name]')` appears in early sections (Executive Summary, Goals, or Section 3 / Entities).

4. Verify subsequent mentions use only the short name (or full legal name if no short was established).

5. Verify NO third-party entity names are confused with client entities (e.g., "MassMutual" should not appear as if it were a client entity).

6. Outcome:
   - Pattern correct → "passed"
   - First-mention pattern violated → "failed_blocked"
   - Subsequent mention drift (e.g., uses short form before legal form first establishes it) → "failed_blocked"
   - Third-party entity confusion → "failed_blocked"
   - No auto-fix; regenerate with explicit guidance

### Pre-Check 4 — Cascade Integrity

**Purpose:** When the prose mentions a cascade triggered by a recommendation, verify all cascade chain members appear in the assembled plan.

**Algorithm:**

1. For each rec in sequenced_plan.sequenced_recommendations with non-empty co_triggered_with[]:
   - Walk the cascade graph using the deterministic cascade walking algorithm (separate spec; assume implemented and importable).
   - Build cascade_set for this rec = closure of co_triggered_with relations.

2. For each rec mentioned in the prose with cascade-triggering language ("triggers", "cascades to", "leads to"):
   - Extract the rec_id (from prose like "REC-ENT-001 triggers REC-ENT-002, REC-EST-006")
   - Verify all members of the cascade_set are present in the prose somewhere (any section)
   - Missing cascade members → flag

3. Outcome:
   - All cascades complete in prose → "passed"
   - Missing cascade members → "failed_blocked" with descriptor of which rec_ids are missing
   - No auto-fix (cascade completeness requires regeneration)

### Pre-Check 5 — Recommendation Reference Resolution

**Purpose:** Every rec_id mentioned in the assembled plan must resolve to a rec in sequenced_plan.

**Algorithm:**

1. Extract all rec_id patterns from assembled plan markdown:
   - Pattern: `REC-[A-Z]{3}-\d{3}` (e.g., "REC-EST-006", "REC-TAX-001")

2. Build the valid set: `{r.recommendation_id for r in sequenced_plan.sequenced_recommendations}`

3. For each extracted rec_id:
   - In valid set → OK
   - Not in valid set → flag as "rec_id_not_in_plan"

4. Outcome:
   - All rec_ids resolve → "passed"
   - Any unresolvable → "failed_blocked"
   - No auto-fix (a fabricated rec_id requires regeneration; cannot guess what it should have been)

### Pre-Check 6 — Provenance Map Completeness

**Purpose:** Every assembled-plan span (paragraph or section) must be labeled in the provenance map as one of: "llm_stage4" | "deterministic_glue" | "kb_template".

**Algorithm:**

1. Build provenance map from harness inputs:
   - Stage 4 LLM-generated prose → "llm_stage4"
   - Top Priorities table, Aggregate Metrics rendering, Methodology Appendix → "deterministic_glue"
   - Disclosures footer, KB-templated headings → "kb_template"

2. Walk the assembled plan, segment by paragraph or section.

3. For each segment, verify it's labeled in the provenance map:
   - Labeled → OK
   - Unlabeled → flag as "missing_provenance_label"

4. Outcome:
   - All segments labeled → "passed"
   - Any unlabeled → "warning" (not failure — provenance gaps don't break the plan, but should be tracked)
   - No auto-fix; surface as flag for harness to address

---

## Output Schema

```typescript
export interface MechanicalCheckResults {
  overall_status: "passed" | "failed_auto_fixed" | "failed_blocked";
  
  checks: {
    number_coherence: PreCheckResult;
    statute_consistency: PreCheckResult;
    entity_name_consistency: PreCheckResult;
    cascade_integrity: PreCheckResult;
    recommendation_reference_resolution: PreCheckResult;
    provenance_map_completeness: PreCheckResult;
  };
  
  issues: PreCheckIssue[];                       // all issues across checks
  auto_fixed_issues: PreCheckIssue[];            // subset that were rounding-fixed
  blocked_issues: PreCheckIssue[];               // subset that block, requiring regen
  
  _orchestrator_flags: {
    state_c_alternative_value_protection_fired: boolean;  // Critical Fix 1 hit
    auto_fix_count: number;
    blocked_count: number;
    warning_count: number;
  };
}

export interface PreCheckResult {
  status: "passed" | "warning" | "failed_auto_fixed" | "failed_blocked";
  issue_count: number;
  details: string;
}

export interface PreCheckIssue {
  check_name: string;                            // "number_coherence" etc.
  severity: "blocking" | "auto_fixable" | "warning";
  description: string;
  prose_span_excerpt: string;                    // ~50 char context
  expected_value: string | null;                 // for auto-fix cases
  matched_value: string | null;                  // what was found in prose
  whitelist_candidates: string[];                // for ambiguous cases
  remediation: string;                           // human-readable fix
}

export interface MechanicalCheckResultsFailed {
  _builder_status: "FAILED";
  _failure_reason: string;
}
```

---

## Implementation Requirements

1. **Module location:** `src/lib/orchestrator/glue/mechanicalPreChecks.ts`

2. **Function signature:**
```typescript
   export function runMechanicalPreChecks(
     assembledPlanMarkdown: string,
     sequencedPlan: SequencedPlan,
     aggregateMetrics: AggregateMetrics | null,
     options?: {
       provenanceMap?: Map<string, "llm_stage4" | "deterministic_glue" | "kb_template">;
       statuteReferenceData?: StatuteReferenceData;
       entityShortNames?: Map<string, string>;
     }
   ): MechanicalCheckResults | MechanicalCheckResultsFailed
```

3. **Pure function. No throws. Deterministic.**

4. **Schema:** add types to pipelineTypes.ts.

5. **Each check is a separate function** for testability:
   - checkNumberCoherence()
   - checkStatuteConsistency()
   - checkEntityNameConsistency()
   - checkCascadeIntegrity()
   - checkRecommendationReferenceResolution()
   - checkProvenanceMapCompleteness()

6. **Auto-fix discipline (Pre-Check 1):**
   - Build whitelist eagerly (no lazy evaluation)
   - State C protection check runs first (cheapest reject)
   - Single-source unambiguity check second
   - Pure rounding match check third
   - Auto-fix string replacement happens in a copy of the assembled plan, not original

7. **For Pre-Check 4 (cascade integrity):** import the cascade walking algorithm from `src/lib/orchestrator/glue/cascadeWalking.ts`. If not yet implemented, stub it temporarily; we'll wire after building cascade walking.

---

## Test Requirements

Create `src/lib/orchestrator/glue/__tests__/mechanicalPreChecks.test.ts`:

### Test cases

1. **Pre-Check 1: Clean plan, all numbers in whitelist** → passed.

2. **Pre-Check 1: Number off by rounding (e.g., "$73K" in prose, $73,112 in source)** → failed_auto_fixed with auto-fix applied.

3. **Pre-Check 1 — STATE C PROTECTION CANARY:** Fixture has REC-TAX-001 in State C with alternative_values [$73K, $148K]. Prose has "$73K" (one of the alternatives). Verify auto_fix does NOT fire — issue is treated as failed_blocked, NOT failed_auto_fixed. Verify state_c_alternative_value_protection_fired flag is true.

4. **Pre-Check 1: Fabricated number (not in whitelist)** → failed_blocked, can_auto_fix returns false because no nearby match.

5. **Pre-Check 2: Statute references all current** → passed.

6. **Pre-Check 2: Reference to "2024 estate exemption"** → failed_blocked (stale).

7. **Pre-Check 3: Entity first-mention pattern correct** → passed.

8. **Pre-Check 3: Short form used before legal name** → failed_blocked.

9. **Pre-Check 4: Cascade complete in prose** → passed (assuming cascade walking is wired).

10. **Pre-Check 4: Missing cascade member** → failed_blocked.

11. **Pre-Check 5: All rec_ids resolve** → passed.

12. **Pre-Check 5: Fabricated rec_id (REC-EST-099 not in plan)** → failed_blocked.

13. **Pre-Check 6: All segments labeled** → passed.

14. **Pre-Check 6: Unlabeled segment** → warning.

15. **Determinism** — 100 calls, byte-identical output.

16. **Multi-check failure** — fixture with multiple issues across checks → all flagged correctly, auto-fix only applied to qualifying issues.

For each test, build a minimal assembled-plan markdown string + minimal SequencedPlan fixture. Use Node's node:test runner.

---

## What This Does NOT Do

- Does not call LLM
- Does not generate prose
- Does not modify the original assembled plan (auto-fix produces a copy)
- Does not validate semantic coherence (that's Stage 5 LLM's job)
- Does not detect voice drift, theme contradictions, sequencing issues (LLM)
