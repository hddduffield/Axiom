# [REC-TAX-002] — W-2 / K-1 Mix Optimization (Reasonable Compensation)

## METADATA
- **ID:** REC-TAX-002
- **Status:** Active
- **Category:** Tax
- **Subcategory:** Compensation structuring
- **Engagement archetypes:** Pre-Exit, Active-No-Exit, Pre-Liquidity-Founder
- **Plan section placement:** "Recommendations — Business" → "Tax Strategy → 3A. Implement This Year"
- **Last verified:** April 2026
- **Verification frequency:** Per engagement (case-specific) and after material business growth

---

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.is_s_corp == True (or LLC taxed as S-Corp)
  - FR.6.1.primary_owner_w2 > 100_000 (material W-2 in play)
  - At least ONE of:
      - W-2 has not been formally analyzed against industry/role benchmarks in past 2 years
      - Material business growth since last analysis (FR.3.3.three_year_revenue_cagr > 15%)
      - Owner approaching 50+ where retirement-plan capacity becomes more material
      - Anticipating cash-balance plan implementation (W-2 drives DB capacity)

DISQUALIFY if:
  - LLC taxed as partnership (no W-2/K-1 split for owner-partners; different analysis)
  - Sole proprietor (no W-2 for owner)
  - Owner W-2 already at clear reasonable-compensation level for industry/role and other factors stable
```

### Natural-language explanation
S-Corp owners pay both employee and employer FICA on their W-2 wages but no FICA on K-1 distributions. Lower W-2 saves payroll tax. But W-2 also drives retirement-plan contribution capacity (401(k) deferral, profit-sharing, cash-balance) and QBI eligibility math. The right balance is fact-specific and should be revisited every 2 years.

### Hard disqualifiers
- W-2 already below industry/role reasonable-compensation benchmarks (further reduction would be IRS audit bait)
- Owner is not actually performing material services (rare in PSA's lane; common audit risk in family-employee scenarios)

---

## WHAT IT IS

A formal reasonable-compensation analysis of the S-Corp owner's W-2, balancing three competing objectives: (1) FICA exposure (no FICA on K-1 distributions); (2) retirement-plan contribution capacity (driven by W-2); (3) QBI eligibility math (above income thresholds, deduction limited to 50% of W-2 wages or 25% W-2 + 2.5% qualified property).

Outputs a documented reasonable-compensation level and the rationale, supportable in audit.

---

## WHY WE RECOMMEND IT

The "set it once at startup and never revisit" pattern is common and produces suboptimal results in two directions:

1. **Too-high W-2:** owner is paying unnecessary FICA tax (12.4% OASDI on first $184,500, then 2.9% Medicare uncapped, plus 0.9% additional Medicare on high earners). On a $480K W-2 (Marcus's level), that's ~$22,888 of OASDI + ~$13,920 of Medicare + ~$2,070 of additional Medicare = **~$38,878 of payroll tax annually** that disappears if W-2 dropped meaningfully.

2. **Too-low W-2:** sacrifices retirement-plan contribution capacity (profit-sharing capped at 25% of W-2; cash-balance plan benefit calculation depends on W-2 average), and can compromise QBI eligibility above income thresholds.

The right answer depends on:
- Industry / role benchmarks (audit defense)
- Whether a cash-balance plan is or will be in place (W-2-driven)
- Whether the owner is using QBI (W-2 wages × 50% limit or 25% W-2 + 2.5% property limit applies above thresholds)
- Owner's age and retirement horizon (older owners benefit more from DB plan capacity)

A defensible analysis often arrives at a W-2 that's lower than the status quo (saving payroll tax) but high enough to support intended retirement-plan contributions.

---

## VARIATIONS AND STRUCTURAL OPTIONS

### Approach A — Industry-benchmark analysis
Source compensation surveys for owner-CEO of similar-revenue, similar-industry companies. Document the benchmarks. Set W-2 at or slightly above lower-quartile of benchmark.

### Approach B — RCReports or comparable software
Specialized reasonable-compensation software (RCReports, MGIS) produces quantitative analyses with audit-defensible output. Cost: ~$500–$1,500 per analysis. Recommended for Holloway-scale clients where the dollar stakes justify formal documentation.

### Approach C — Cost-approach analysis
Total cost to replace owner's services (CEO + sales lead + relationship manager + technical role) summed and weighted by time allocation. Useful when owner wears multiple hats.

---

## QUANTIFIED IMPACT FRAMEWORK

### Impact components
- **FICA savings** = (W-2 reduction below SS wage base) × 12.4% + (W-2 reduction above SS wage base, up to Medicare-only zone) × 2.9% (3.8% if above additional-Medicare threshold)
- **Retirement-plan capacity reduction** = W-2 reduction × applicable plan-allocation rate (e.g., 25% for profit-sharing; varies for DB)
- **QBI consideration** (above thresholds): W-2 wages affect the deduction cap

### Worked numerical example
**Scenario: Holloway-scale owner.** Marcus current W-2 = $480K. Analysis recommends $360K (matches §401(a)(17) compensation cap, defensible as reasonable for $42M-revenue specialty contractor CEO).

**FICA impact of $120K W-2 reduction:**
- $120K reduction is entirely above SS wage base ($184,500), so no OASDI impact
- Medicare: $120K × 2.9% (employee + employer) = $3,480 saved
- Additional Medicare (above $250K MFJ AGI threshold): $120K × 0.9% (employee only) = $1,080 saved
- **Total FICA savings: ~$4,560 annually**

**Retirement-plan impact:**
- 401(k) deferral capacity unchanged ($24,500 + $8,000 catch-up; both well below $360K W-2)
- Profit-sharing layer at 25%: capped at $72,000 §415(c) limit anyway, so capacity unchanged
- Cash-balance plan: W-2 affects benefit calculation; $360K W-2 (matching §401(a)(17)) maximizes DB capacity for owner
- **No retirement-plan capacity loss; potential CB plan optimization**

**QBI impact:**
- Marcus is well above QBI phase-out thresholds
- QBI deduction limited to lesser of 20% × QBI or 50% × W-2 (or 25% W-2 + 2.5% property)
- At $360K W-2: 50% × $360K = $180K cap; QBI at 20% × ~$3.4M K-1 = $680K; cap binds
- At $480K W-2: 50% × $480K = $240K cap; QBI at 20% × ~$3.3M K-1 (slightly less due to higher W-2) = $660K; cap binds
- Difference: ~$60K of additional QBI deduction at higher W-2 = ~$22K of federal tax (37%) — but offset by FICA cost
- **Net: roughly even, with QBI considerations argueing slightly toward higher W-2 in this case**

**Conclusion:** for Holloway, the analysis may support keeping W-2 around $360K rather than $480K, capturing FICA savings without QBI loss. **Net annual benefit: ~$5K–$15K** depending on cash-balance plan assumptions.

The benefit is modest but real, and the documentation defends the position in audit.

### Range parameters
- `current_w2` = FR.6.1.primary_owner_w2
- `recommended_w2_floor` = industry benchmark lower quartile
- `cash_balance_in_plan` = FR.10.has_cash_balance OR planned via REC-RET-002
- `qbi_active` = FR.8.qbi_status indicates positive
- `ss_wage_base_2026` = $184,500

---

## IMPLEMENTATION STEPS

1. **Engage CPA or compensation specialist** for formal analysis. Document methodology.
2. **Source benchmarks** from industry compensation surveys (BLS data, industry associations, RCReports software).
3. **Adjust payroll forward-only.** Do not retroactively adjust prior periods.
4. **Update withholding** to reflect new W-2 level.
5. **Coordinate with retirement plan** to ensure contributions remain compliant and optimal at the new W-2 level.
6. **Document the file.** Keep the analysis in the entity's tax file for audit defense.

---

## SEQUENCING DEPENDENCIES

- **Coordinated WITH:** REC-RET-002 (Cash-Balance Plan) — W-2 drives DB capacity; analyze together
- **Coordinated WITH:** REC-TAX-001 (Georgia PTET) — PTET applies to K-1 income, so changes in W-2/K-1 mix affect PTET base
- **Coordinated WITH:** REC-TAX-003 (Spouse on Payroll) — household-level analysis includes both spouses

---

## DOCUMENTATION CHECKLIST

- [ ] Formal reasonable-compensation analysis (RCReports, CPA memo, or industry-survey comparison)
- [ ] Documented role allocation if owner wears multiple hats
- [ ] Comparative analysis: current vs. recommended W-2 with FICA, retirement, QBI implications
- [ ] Payroll system updated effective forward
- [ ] Updated W-4 / withholding adjustments
- [ ] Annual review memo confirming compensation remains defensible

---

## COMMON MISTAKES & AUDIT TRIGGERS

- **Aggressively low W-2 (the *Watson* problem):** *Watson v. United States*, 668 F.3d 1008 (8th Cir. 2012), upheld IRS recharacterization of K-1 distributions as wages where owner-CPA's W-2 was clearly below reasonable comp. Audit-bait.
- **Round-number W-2 with no documentation:** $100K, $150K, $200K W-2s for high-revenue businesses look set-it-and-forget-it; auditors prefer rounded numbers as evidence the comp was set without analysis.
- **W-2 below industry-survey lowest quartile:** very high audit risk regardless of business size.
- **Sudden W-2 decrease without business-event explanation:** dropping W-2 from $480K to $200K mid-year without business rationale invites reclassification.
- **Failure to update with growth:** $200K W-2 set when business was $5M revenue is suspect when business is now $40M.

---

## COORDINATION NOTES

### PSA Wealth role
- Identifies opportunity. Frames the analysis. Tracks completion. Coordinates with cash-balance plan modeling.

### CPA role
- Performs or reviews the analysis. Documents in tax file. Updates payroll. Files quarterly estimated payments at new level.

### Compensation specialist role (optional)
- For higher-stakes situations, engage a compensation specialist or use RCReports-class software for defensible documentation.

---

## CLIENT CONVERSATION FRAMING

> "Your current W-2 of $480K is reasonable for your role and revenue level, but worth a formal analysis. The right number balances three things: payroll-tax exposure (which favors lower W-2), retirement-plan capacity (which favors higher W-2 because the 401(k), profit-sharing, and any cash-balance plan are all driven by W-2), and the QBI deduction math (where 50% of W-2 caps your deduction at high income). Mechanical specialty contracting is generally not a 'specified service' business, so QBI is on the table — we'll model the optimal split as part of the cash-balance plan analysis next year."

---

## CAVEATS & DISQUALIFIERS

- **Don't aggressively minimize W-2.** The firm's house position: defensibility over savings. A modestly-low W-2 with strong documentation beats an aggressively-low W-2 in audit.
- **Spouse on payroll changes the picture.** Once spouse is added, household analysis includes both. See REC-TAX-003.
- **Mid-year changes are suspicious.** Set the W-2 forward, on a payroll-cycle boundary, with documented rationale.

---

## REFERENCES

- **IRC §1366(e)** — reasonable compensation requirement for S-Corps
- **IRC §3121** — FICA imposition
- **IRC §199A** — QBI deduction (W-2 cap interaction)
- **Rev. Rul. 74-44** — early IRS guidance on reasonable comp for S-Corps
- **Watson v. United States, 668 F.3d 1008 (8th Cir. 2012)** — leading case
- **JCT report 2008** — congressional analysis of S-Corp comp issues
- **RCReports, MGIS, Salary.com** — common analytical tools

---

## PLAN OUTPUT TEMPLATE

> **Optimize the W-2 / K-1 mix.** Your current W-2 of ${current_w2_rounded}K is reasonable but worth a formal reasonable-compensation analysis. The right answer balances payroll-tax exposure (no employer FICA on K-1) against retirement-plan contribution capacity (driven by W-2) and QBI eligibility considerations. {Industry_descriptor} is generally not a Specified Service Trade or Business, so QBI is available subject to the wage-and-property limits — we will model the optimal split.

**Variables:**
- `{current_w2_rounded}` = FR.6.1.primary_owner_w2 / 1000, rounded
- `{industry_descriptor}` = derived from FR.3.1.naics or operations description
- `{primary_owner_first_name}` = parsed from FR.2.1.full_legal_name
