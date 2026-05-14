# Trigger Relation Types — Reference for the Plan Generator

This document defines the three trigger-relation types the Plan Generator must understand when evaluating recommendations against a fact review.

## 1. MUST come AFTER (time-ordered completion)

The predecessor recommendation must be **complete in the real world** before the dependent recommendation can fire. Used for genuine time-gated dependencies.

**Pattern in trigger logic:**
```
TRIGGER if:
  - REC-XXX-NNN is in the FR as completed (per FR.4 / FR.7 / etc.)
```

**Examples:**
- REC-EST-007 (rolling GRAT) MUST come AFTER REC-EST-006 first GRAT — by definition, rolling cycles start when one completes
- REC-INV-011 (private markets) MUST come AFTER REC-INV-006 (post-transaction unwind) — portfolio stage gating
- REC-CHR-007 (private foundation) MUST come AFTER liquidity event — funding capacity gated

If the predecessor is being recommended in the same plan but not yet done, the dependent does NOT fire.

## 2. MUST come BEFORE (this rec must complete before another can start)

The current recommendation must complete before another can begin. Inverse of #1; same semantics.

**Examples:**
- REC-CHR-002 (pre-transaction charitable gifting) MUST come BEFORE binding LOI
- REC-ENT-001 (real estate separation) MUST come BEFORE REC-ENT-002 (F-reorg) in real-world execution timing

## 3. SEQUENCED WITH (part of the same workplan)

The current recommendation is **part of the same plan workflow** as another recommendation. Either both fire together, or neither does. The plan output presents them as a sequenced workplan with explicit ordering, but neither requires the other to be complete first.

**Pattern in trigger logic:**
```
TRIGGER if ALL of:
  - [own conditions]
  - At least ONE of:
      - REC-XXX-NNN already complete (per FR.4.has_holdco == True)
      - REC-XXX-NNN also triggers in this same plan (per its own conditions evaluating True)
```

**Examples:**
- REC-EST-006 (GRAT) SEQUENCED WITH REC-ENT-002 (F-Reorg) and REC-ENT-003 (Recap)
- REC-EST-008 (IDGT sale) SEQUENCED WITH REC-ENT-002 and REC-ENT-003
- REC-CHR-002 (pre-transaction charitable) SEQUENCED WITH REC-ENT-002 and REC-ENT-003
- REC-ENT-003 (Recap) SEQUENCED WITH REC-ENT-002 (F-Reorg)
- REC-TAX-006 (Cost Seg) SEQUENCED WITH REC-ENT-001 (Real Estate Separation)
- REC-TAX-007 (§469 Grouping) SEQUENCED WITH REC-ENT-001
- REC-RSK-004 (Estate Liquidity Life) SEQUENCED WITH REC-EST-004 (ILIT)

This is the new pattern that fixes the calibration-test bug where downstream estate-transfer recs failed to trigger because their predecessors weren't yet complete.

## Generator Implementation

When evaluating a recommendation, the generator:

1. Evaluates the recommendation's own structured logic
2. For each `MUST come AFTER` relation: checks the FR for evidence the predecessor is complete (FR.4.has_holdco, FR.4.has_ilit, FR.7.4.has_buy_sell_life_funding, etc.). If FALSE, the recommendation does NOT fire.
3. For each `SEQUENCED WITH` relation: checks (a) FR for predecessor completion AND (b) whether the predecessor itself triggers in the current evaluation pass. If EITHER is TRUE, the relation is satisfied.
4. For each `MUST come BEFORE` relation: this constrains output ordering, not triggering. The generator orders the output of the plan to respect these.

## Sequencing in Plan Output

Recommendations bound by `SEQUENCED WITH` produce ordered plan output: predecessor sections appear before dependent sections. The dependent sections include language acknowledging the dependency ("After the recap, ..." or "Once the holdco is in place, ...").

The Plan Output Templates contain this language already. The generator does NOT need to add it dynamically — it just needs to order sections correctly.
