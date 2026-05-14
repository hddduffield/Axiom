# Engagement Archetypes — Deep Definitions

The generator uses these archetypes to set sequencing, voice, and emphasis.

## ARCHETYPE 1: PRE-EXIT

### Profile
- Owner-operator
- Business is dominant asset (often 60%+ of net worth)
- Transaction window: 12-36 months
- Banker not yet engaged (or recently engaged)
- Pre-transaction structuring not yet done

### Plan emphasis
- Pre-transaction sequencing (entity structure, charitable, family transfers BEFORE binding LOI)
- Stay-bonus / retention work
- Q-of-E and banker engagement
- Estate transfer engine (non-voting interest)
- §1202 evaluation if applicable
- Pre-LOI charitable gifting

### Voice/Tone
Direct, action-oriented; references the transaction window throughout. The plan is a workplan to a closing event.

### Typical deliverable length
40-60 pages

## ARCHETYPE 2: POST-EXIT

### Profile
- Recently liquid (within 12 months)
- Substantial taxable assets
- Possibly ongoing consulting / earnout / rollover equity
- New questions: deployment, charitable scale, family wealth

### Plan emphasis
- Portfolio construction (asset location, direct indexing, private markets)
- Charitable scale-up (DAF, possibly foundation)
- Roth conversion in gap years
- Concentration unwind (rollover equity, restricted stock)
- Family governance buildout
- Specialty (PPLI, multi-state situs)

### Voice/Tone
Strategic, longer-horizon; deployment-oriented rather than transaction-oriented. References the wealth's purpose.

### Typical deliverable length
35-50 pages

## ARCHETYPE 3: ACTIVE-NO-EXIT

### Profile
- Owner-operator running business
- No transaction planned
- Established income; ongoing wealth-building
- Wants efficient operating structure and family-protecting estate plan

### Plan emphasis
- Tax efficiency in operations (PTET, W-2/K-1, family employment, payroll structure)
- Retirement maximization (401(k) + cash balance + profit sharing)
- Buy/sell + key person + DI
- Foundation estate plan
- Annual gifting cadence
- Modest charitable engagement

### Voice/Tone
Steady-state; ongoing optimization mindset. Not transaction-driven.

### Typical deliverable length
30-45 pages

## ARCHETYPE 4: FAMILY-OFFICE

### Profile
- Multi-generational wealth ($25M+)
- Multiple legacy structures already in place
- Family governance considerations dominant
- Service complexity high

### Plan emphasis
- Trust/structure refresh (decanting, restatement, situs)
- Family governance (mission, meetings, education, prenups)
- Charitable scale and engagement (foundation operations)
- Specialty strategies (PPLI, NING in some cases, multi-state situs)
- Investment sophistication (private markets, alternatives)

### Voice/Tone
Sophisticated, multi-generational; references family beyond just owner-spouse.

### Typical deliverable length
50-80 pages

## ARCHETYPE 5: PRE-LIQUIDITY-FOUNDER

### Profile
- Founder of high-growth company (often venture-backed)
- §1202 QSBS-eligible stock
- Pre-IPO or pre-acquisition; uncertain timing
- Personal cash flow modest relative to paper wealth
- Single-stock concentration extreme

### Plan emphasis
- §1202 evaluation and multiplication (REC-SPC-010)
- §83(b) elections (if early-stage)
- Pre-liquidity gifting with low valuations (REC-EST-008, REC-EST-009)
- Personal cash management (consulting income; spousal income)
- Insurance basics (DI especially; key person if employees)
- Eventual exit prep (REC-SUC sequence)

### Voice/Tone
Forward-looking, options-oriented, acknowledges uncertainty. Avoids over-confident projections.

### Typical deliverable length
25-40 pages

## ARCHETYPE SELECTION LOGIC

```
IF FR.is_post_exit OR (FR.transaction_completed AND days_since < 365) → POST-EXIT
ELIF FR.has_pre_qsbs_stock AND NOT FR.has_business → PRE-LIQUIDITY-FOUNDER
ELIF FR.has_business AND FR.transaction_window_months <= 36 → PRE-EXIT
ELIF FR.has_business AND FR.transaction_window_months > 36 → ACTIVE-NO-EXIT
ELIF FR.net_worth > $25M AND FR.multi_gen_focus → FAMILY-OFFICE
ELSE → fall back based on most recent transaction event or active business state
```

Combinations are possible (e.g., POST-EXIT + FAMILY-OFFICE if recent liquidity and substantial existing legacy structures); the generator weights both archetypes' emphases.
