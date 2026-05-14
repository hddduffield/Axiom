# Quantification Conventions

## CORE PRINCIPLE

Every recommendation must include quantified impact. "We recommend X" without "$Y of annual benefit" is incomplete.

## QUANTIFICATION COMPONENTS

For each recommendation, identify:
1. Direct impact (annual or one-time)
2. Compound impact (over horizon)
3. Sources / inputs (which fact review fields drive the math)
4. Range / sensitivity (what can move the number)

## RANGE PARAMETERS

When showing a range:
- Use "approximately $X" for single-point estimates (acceptable when math is straightforward)
- Use "$X-$Y" for genuine ranges (different scenarios)
- Use "$X-$Y depending on [factor]" when ranges have a driver

Examples:
✅ "Annual federal benefit: approximately $44,000 at your AGI level"
✅ "Estimated wealth transfer: $10M-$15M depending on appreciation through the note term"
✅ "Tax savings: $9K-$15K depending on transaction year tax bracket"

❌ "Some savings"
❌ "Significant benefit"
❌ "Could be substantial"

## COMPOUND PROJECTIONS

For compounded values over time:
- Use deterministic single-rate projections, not Monte Carlo, in plan body
- State the assumed rate explicitly: "compounded at 7% per year"
- Distinguish nominal vs. real returns where it matters

Example:
> "$200K annual 401(k) deferral compounded at 7% over 25 years reaches approximately $13M; combined with cash balance plan, annual contribution of $272K reaches approximately $18M over the same horizon."

## PRECISION LEVELS

| Context | Precision |
|---|---|
| Plan executive summary | "approximately $X" or "$X-$Y" |
| Recommendation block | Specific figure with caveats |
| Worked example in detail | Full math with intermediate steps |
| Tax bracket impact | 2 decimals on rate; round dollars to nearest hundred |
| Long-horizon compounding | Round to 100K or 1M for clarity |

Don't over-precision. "$1,234,567 of estimated benefit over 25 years" is false precision; "$1.2M-$1.4M" is more honest.

## QUANTIFICATION SOURCES

Each numerical claim should reference its source:
- Volatile rates from `02_reference/08_volatile_rates_lookup.md`
- Limits from `02_reference/02_federal_income_tax_limits.md`
- Estate exemption from `02_reference/01_federal_estate_gift_gst.md`
- Plan-specific values from fact review fields

If a source isn't available, the number isn't reliable; either find a source or remove the number.

## "WHAT IF" PROJECTIONS

When showing scenarios (e.g., transaction at $40M vs $50M):
- Anchor in central estimate
- Show 2-3 scenarios; not 7+
- Be explicit about what changes between scenarios
- Don't pretend scenario work is precise; it's directional

Example:
> "Transaction at base case ($40M valuation): family receives $24M post-tax; at high case ($50M): $30M; at low case ($30M): $18M. The wealth transfer engine (GRAT, IDGT) operates similarly across scenarios; the absolute amount transferred scales with valuation."

## ROUND VS. PRECISE

- Round when the imprecision dominates: "$25M-$40M of additional family wealth over 50 years"
- Be precise when it matters: "$15,000 annual exclusion x 8 beneficiaries = $152,000 of Crummey-eligible gifts per donor"
- When precision is between, round to nearest meaningful unit: "approximately $44,000" not "$43,827"

## PROJECTING TO RETIREMENT / DEATH

Conservative assumptions:
- 7% nominal compound for diversified portfolio
- 4-5% bond yields
- 2.5-3% inflation
- §7520 / AFR from current month
- Estate / gift / income tax rates based on current law (with note about future legislation)

Don't project optimistic returns. If anything, err conservative — a plan that exceeds its own projections is fine; a plan that disappoints is a problem.

## PROJECTIONS FOOTNOTE LANGUAGE

Add to compounded projections:
"Projected at [X]% nominal annual return; actual returns may vary. Assumes current statutory rates."

For longer horizons (30+ years):
"Projection assumes current law; future legislation may affect results."
