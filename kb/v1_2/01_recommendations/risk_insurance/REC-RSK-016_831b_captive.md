# [REC-RSK-016] — Captive Insurance Company (831(b) Election) — LANDMINE

## METADATA
- **ID:** REC-RSK-016
- **Status:** **LANDMINE — DEFAULT OFF**
- **Category:** Risk & Insurance / Tax
- **Engagement archetypes:** Pre-Exit, Family-Office (very limited)
- **Plan section placement:** "Strategies Considered But Not Included" UNLESS senior advisor explicitly opts in
- **Last verified:** April 2026

## ⚠️ LANDMINE WARNING

**This recommendation is OFF by default. Do not include in plan output unless senior advisor (Will) has explicitly authorized for the specific engagement.**

The 831(b) micro-captive has been on the IRS's "Dirty Dozen" list of tax avoidance schemes for over a decade. **Notice 2016-66** designated 831(b) micro-captives as transactions of interest with mandatory reporting. The IRS has won the major Tax Court cases challenging these structures (Avrahami, Reserve Mechanical, Syzygy, Caylor Land). Subsequent settlement initiatives have offered taxpayers reduced penalties to exit; many practitioners refuse to recommend or implement.

The structure has legitimate uses for genuine risk management at scale, but the historic abuse pattern and IRS enforcement posture make this strategy inappropriate for most clients, including most of PSA's lane.

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of (rare):
  - FR.has_business == True
  - Business has GENUINE risk that is uninsurable or uneconomic in commercial market (real risk transfer needed)
  - Premium for genuine risk would be $1M+/year (justifies captive setup cost)
  - Senior advisor explicit opt-in
  - Specialist captive counsel and actuarial team engaged
  - Risk is documented with third-party actuarial validation

DISQUALIFY if (almost all cases):
  - Primary motive is tax savings rather than risk management
  - Premium would be set to fill the §831(b) $2.85M annual cap
  - Risk pool participation rather than genuine risk
  - Investment of captive reserves into related-party investments
  - Inadequate actuarial documentation
  - Generic tax-strategy promotion vs. legitimate risk transfer
```

### Natural-language explanation
A captive insurance company is a wholly-owned (or partially-owned) insurance subsidiary that insures the risks of its parent business. Under §831(b), a small captive (annual premiums under $2.85M for 2026, indexed) can elect to be taxed only on investment income, with underwriting profits effectively tax-deferred. The structure can be legitimate for businesses with genuine uninsurable or expensive-to-insure risks. The structure has been heavily abused as a tax-shelter pretext, leading to extensive IRS enforcement.

### Hard disqualifiers (ALL of these block — note inversion from typical recommendations)
- Tax savings is the primary motive
- Premium set at the §831(b) cap regardless of actual risk
- Risk is normal commercial-insurable risk being recharacterized
- Captive's reserves invested in related-party transactions
- Reserved-but-not-paid claims pattern that doesn't match real risk patterns
- Insufficient actuarial documentation
- "Risk pool" participation arrangements (multi-business captive pools, the most-attacked structure)

## WHAT IT IS
A captive is an insurance company owned by the same business or family that owns the businesses being insured. The captive:
1. Issues insurance policies to the parent businesses
2. Receives premiums (deductible to the parent)
3. Holds reserves for claims
4. Invests the reserves
5. Under §831(b), elects taxation only on investment income (vs. §831(a) full taxation)
6. Pays claims when they occur

For tax purposes, premiums paid to the captive must reflect arm's-length pricing for genuine risk, with proper risk distribution and risk shifting (the foundational principles of insurance). The IRS attacks captives that fail these principles.

## WHY THIS IS LANDMINE (vs. legitimate use)

**Legitimate use:** A construction company with genuine professional liability exposure on specific contract types not covered well by commercial insurance, operating at scale ($50M+ revenue) with $1M+ of genuine annual premium need, can establish a captive to formally manage that risk. The captive is real insurance, with real claims, real reserves, real actuarial work.

**Abuse pattern (which the IRS challenges):** Promoter sells "captive" structure to small businesses; premium is set at $2.4M (just under §831(b) cap) regardless of actual risk; coverages are esoteric (cyber, terrorism, weather) and rarely claim; reserves are loaned back to owner via investment in family entities; structure is essentially a tax-deferred savings account dressed up as insurance.

The Tax Court has ruled against virtually every IRS-challenged captive in this abuse pattern. Penalty exposure for failed structures includes 40% accuracy penalties plus potential fraud findings.

## WHEN (RARELY) THIS COULD BE APPROPRIATE
- Construction/contracting business with real and substantial uninsured exposures
- Professional services firm with sophisticated risk management needs at scale
- Family with multiple operating businesses where genuine risk pooling makes sense
- Always: with specialist captive actuarial and legal team
- Always: with explicit understanding that audit defense will be required

## QUANTIFIED IMPACT FRAMEWORK (DO NOT INCLUDE BENEFIT CALCULATIONS IN PLAN OUTPUT)

The plan output should NEVER quantify "expected tax savings" from a captive — doing so reinforces the IRS's tax-shelter narrative. If the structure is appropriate, frame it as risk management with tax-favored treatment, not tax savings with insurance attached.

## IMPLEMENTATION STEPS (IF AUTHORIZED)
1. **Document genuine risk** — third-party actuarial study identifying specific uninsurable or uneconomic exposures
2. **Engage specialist captive counsel and actuary** — generalist work is malpractice in this area
3. **Choose domicile** (state of formation) — Vermont, Tennessee, Delaware, others; carefully
4. **Form captive entity** with proper capitalization
5. **Underwrite and price policies** at arm's-length rates for the documented risks
6. **Establish claim handling protocols** — captive must look like real insurance, with claims paid as they occur
7. **Establish proper investment policy** — diversified, NOT loans to related parties
8. **Annual actuarial certification** — premium adequacy, reserves adequacy
9. **§831(b) election filing** — if premium is below the cap and election is appropriate
10. **Annual return filing** (Form 1120-PC for property/casualty captive)

## SEQUENCING DEPENDENCIES
- This recommendation has no normal sequencing because it's only used in rare authorized cases

## DOCUMENTATION CHECKLIST (IF AUTHORIZED)
- [ ] Third-party actuarial study identifying specific uninsurable risks
- [ ] Specialist captive counsel engagement
- [ ] Captive formation documents
- [ ] Insurance policies with arm's-length pricing
- [ ] Claim handling protocols
- [ ] Investment policy statement (NO related-party investments)
- [ ] Annual actuarial certification
- [ ] §831(b) election filed timely
- [ ] Form 1120-PC filed annually
- [ ] Disclosure under Notice 2016-66 if required (Form 8886)

## COMMON ABUSE PATTERNS (THESE ARE ALL DISQUALIFIERS)
- Premium set at §831(b) cap ($2.85M for 2026) regardless of risk
- Coverages chosen to avoid claims (terrorism, cyber, weather)
- Captive reserves invested in family LLC, family business, family real estate
- "Risk pool" participation among unrelated businesses (most-attacked structure)
- Promoter-driven structure with templated documentation
- Captive not actually paying claims when they occur

## COORDINATION NOTES
- **PSA Wealth:** strict gating; explicit senior advisor opt-in required before any further work
- **CPA:** specialist tax counsel for captives; not generalist
- **Attorney:** specialist captive counsel; not generalist
- **Actuary:** independent, third-party — not promoter's actuary

## CLIENT CONVERSATION FRAMING (IF DISCUSSED — RARE)
> "Captives are a legitimate risk management tool used by many large companies and some sophisticated mid-market businesses. They've also been heavily promoted as tax-saving structures, and the IRS has won most of the cases challenging the tax-driven versions. We're not in the captive promotion business, and the firm's default posture is that the structure is inappropriate for our typical client. If your specific risk profile genuinely justifies one, we would engage specialist captive counsel and actuarial team for diligence — and we'd plan from the outset for an audit-defense posture. Otherwise, we recommend against."

## CAVEATS & DISQUALIFIERS
**ALL of the following must be FALSE for the recommendation to be considered:**
- Tax savings is a primary motive (rather than incidental to genuine risk management)
- Premium set near §831(b) cap regardless of risk
- Coverages chosen to minimize claims
- Reserves intended for related-party investment
- Risk pool participation contemplated

If ANY are true, the recommendation is NOT made.

## REFERENCES
- IRC §831(b) — small insurance company election
- IRC §831(c) — captive definitions
- **IRS Notice 2016-66** — designation as transaction of interest; mandatory reporting
- **Avrahami v. Commissioner**, 149 T.C. 144 (2017) — IRS won
- **Reserve Mechanical Corp v. Commissioner**, T.C. Memo 2018-86 — IRS won
- **Syzygy Insurance Co. v. Commissioner**, T.C. Memo 2019-34 — IRS won
- **Caylor Land & Development v. Commissioner**, T.C. Memo 2021-30 — IRS won
- IRS captive insurance settlement initiative (March 2020)
- Form 8886 — reportable transaction disclosure
- Form 1120-PC — captive annual return

## PLAN OUTPUT TEMPLATE

**DEFAULT OUTPUT (when not authorized — most cases):**

> **Captive insurance company (§831(b)).** You have previously inquired about / received marketing on captive structures. Our position: the structure is legitimate for businesses with genuine uninsurable risks at scale, but has been heavily abused as a tax shelter and is on the IRS Dirty Dozen list. We do not recommend pursuing absent specific risk-management need that cannot be addressed through commercial insurance, and even then only with specialist counsel and audit-defense-ready documentation. For your profile, we do NOT recommend captive structures and instead address risk through {alternative — typically commercial insurance, retention, plus REC-RSK-007 key person where applicable}.

**AUTHORIZED OUTPUT (when senior advisor opts in for a genuine case):**

> **Captive insurance evaluation (§831(b)).** {Specific_risk_documentation} indicates an uninsured exposure of approximately ${exposure} that is not adequately covered by commercial markets. We recommend a captive insurance evaluation with [specialist_counsel_name] and [specialist_actuary_name]. The captive would underwrite [specific risk]; premium pricing and reserves would be actuarially supported. Decision point after diligence: form captive or retain risk through commercial alternatives. If pursued, the engagement assumes audit defense readiness from inception.
