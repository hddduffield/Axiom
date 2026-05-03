# Stage 4 — Voice & Structure Calibration

**Purpose.** This document captures the voice, structural patterns, and stylistic rules Stage 4 (plan generation) must reproduce. It is the calibration target for Stage 4's system prompt and is grounded entirely in observation of the synthetic Holloway plan, not aspirational invention.

**Source.** `Holloway_Financial_Plan_Delivery.pdf` — 30 pages, prepared by "Will Bearden, PSA Wealth," dated April 29, 2026. Synthetic exemplar; no real client data. Compliance Tracking ID `PSA-2026-0429-HOLLOWAY-001`. All quotations below are verbatim and attributed to the page where they appear.

---

## 1. Voice characteristics summary (LLM-facing 1-2 paragraph distillation)

PSA Wealth speaks to the client as **a confident peer professional, not a neutral analyst**. The voice is **second-person direct** ("your business," "you have not made it") with the firm in the **first-person plural** ("we recommend," "we have reviewed"); third-person is reserved for naming specific people inside the household when their action is being described ("Marcus's K-1 distributions," "Catherine is not currently on payroll"). Sentences are **medium-to-long, often with em-dash parentheticals or trailing qualifiers** that carry the nuance, and the prose **leads with the strategic stakes before specifics** — an opening sentence frames why the recommendation matters, then specifics follow. Numbers appear inline as **ranges or "approximately" estimates with explicit assumptions cited in parentheses**, never as bare point values; large supporting facts are duplicated in tables for scanability. Tone is **measured, occasionally dry, and confident without being aggressive** — comfortable saying "this is the single largest unfunded liability on your balance sheet" but also "the strategy is asymmetric in your favor" or "'Defective' is a term of art — it works exactly as intended."

The plan **does not lecture or hedge defensively**. It states the recommendation, gives the rationale, names the specific dollar exposure or savings, and tells the reader what to do — usually with a partner role attached and a timing window. Technical terms appear plainly (PTET, GRAT, §469, F-reorganization) but the **glossary at the back is the safety net, not the inline expansion crutch**; first reference may include a brief explanation in-clause but rarely a full definition. The plan trusts the reader without dumbing down.

---

## 2. Top-level document structure (with page spans)

| # | Section | Pages | Purpose |
|---|---|---|---|
| 1 | Title page | p1 | Client name, business, owners, date, prepared by, "CONFIDENTIAL" |
| 2 | Executive Summary | p2–3 | 90-second readout: two themes paragraph + Snapshot table + Top Priorities table + "What this means" closer |
| 3 | Our Process & What This Document Is | p4 | Four-stage process (Discovery / Plan delivery / Implementation / Ongoing review) + "How to read this document" sidebar |
| 4 | Client Snapshot | p5–6 | Business identity + ownership + revenue/profit table + valuation paragraph + Existing Coverage & Plans table |
| 5 | Goals & Priorities | p7 | 10-row numbered table (goal name + "what this means in practice") |
| 6 | Findings & Observations | p8–9 | Strengths (✓ checkmarks) + Opportunities by category (• bullets) |
| 7 | Recommendations — Business | p10–16 | Numbered sections 1–7: Entity Structure, Cash Flow, Tax, Estate, Risk, Benefits/Retention, Succession |
| 8 | Recommendations — Personal | p17–21 | Numbered sections 8–12: Personal Cash, Personal Risk, Personal Investment, Family/Education, Personal Estate |
| 9 | Implementation Roadmap | p22–24 | One large action-item table grouped by time bucket (0–30 / 30–60 / 60–120 days, then 4–6 / 6–12 / 12–24 months, Ongoing) |
| 10 | Decisions We Need From You | p25 | 5-row table: decision question, recommended path, deadline |
| 11 | Your Advisory Team | p26 | Partner-role table: role, firm/contact, notes |
| 12 | Meeting Cadence & Next Steps | p27 | Meeting type table + "Immediate next steps" bullets |
| 13 | Glossary | p28–29 | Plain-English definitions of every technical term used |
| 14 | Disclosures | p30 | Compliance text + projection assumptions + tracking ID |

**Section labels.** Each Recommendations section header carries a bracketed label describing its category: `[CORE SECTION]` (must include for every plan), `[OPTIONAL — included because of pre-transaction posture]` (situationally added), `[PERSONAL — for owner(s)]` (personal lens, not business). Stage 4 must emit these labels as section metadata.

**Page header (every page).** `PSA WEALTH │ Financial Plan Delivery │ Holloway` (top), `Confidential — Prepared for Client · Page N` (bottom). Stage 4 doesn't render these directly — they're a layout concern — but the system prompt should know they exist so it doesn't try to embed similar boilerplate inside content.

---

## 3. Per-section spec

Approximate target word counts based on the Holloway exemplar, for an engagement with ~80 selected recommendations.

| Section | Target words | Notes |
|---|---|---|
| Executive Summary | 350–500 | Two-themes paragraph (~120w) + Snapshot table + Top Priorities (5 rows) + "What this means" closer (~120w) |
| Our Process | 250–350 | Mostly fixed-template; light per-engagement personalization (e.g., "we have introductory calls scheduled with the estate attorney and CPA candidates") |
| Client Snapshot | 300–500 | Business facts + revenue table + valuation paragraph (with reasoning on range) + coverage table |
| Goals & Priorities | 350–500 | 10 numbered goals; "what this means in practice" cell ~30–60 words each |
| Findings & Observations | 500–700 | Strengths list ~6 entries; Opportunities by category ~3–4 categories with 2–4 bullets each |
| Each Recommendation section | 300–700 | Strategic intro (1–2 paragraphs) + "Recommendations" bulleted action list + optional "Why this sequence matters" / "Quantified impact" closer |
| Implementation Roadmap | 0 narrative; 1 large table | Action / Timing / Owner / Status columns; ~30 rows for Holloway |
| Decisions Needed | 200–400 narrative + table | Header paragraph + 5-row table |
| Advisory Team | 0 narrative; 1 table | Role / Firm / Notes |
| Meeting Cadence | 200–300 | Header paragraph + 5-row meeting table + "Immediate next steps" bullets |
| Glossary | depends on terms used | Auto-populated from technical terms appearing in earlier sections |
| Disclosures | 200–250 | Standard PSA boilerplate; almost entirely fixed |

---

## 4. Per-recommendation sub-structure (CRITICAL for Stage 4)

Every recommendation in sections 1–12 follows the same micro-structure:

1. **Numbered heading** — `N. Recommendation Name`
2. **Bracketed label** — `[CORE SECTION]` or `[OPTIONAL — ...]` or `[PERSONAL — for owner(s)]`
3. **Strategic intro** (1–2 paragraphs, no bullets) — frames *why this matters* and *what's at stake* before specifics
4. **`Recommendations` subheading** (literal word) followed by bulleted action list. Each bullet: `• **Bolded imperative action.** Explanatory context — typically partner who executes, key parameter, dollar exposure or saving, edge cases.`
5. **Optional closer subhead** with one of these specific labels: `Why this sequence matters` / `Quantified impact` / `Combined estate impact` / `Why the range is wide` / `What this means`. Closer is a 1-paragraph synthesis.
6. **Sub-section labels** when the recommendation splits (e.g., Tax Strategy splits into `3A. Implement This Year`, `3B. Evaluate Within 12 Months`, `3C. Long-Term Considerations`)

---

## 5. Verbatim voice samples

### 5.1 Executive Summary opening (page 2)

> This document is the output of our discovery process. Over the past 60 days we have gathered financial, legal, tax, and operational data on you and your business, met with you both, reviewed three years of returns and statements, and analyzed the operating agreement, ownership structure, and current insurance program. What follows is our recommended path forward — both immediate priorities and the longer-term strategy that protects what you have built and accelerates what you are building.
>
> Two themes shape this plan. First, your business is approaching a value range where the cost of inaction on estate, entity, and tax planning compounds rapidly. Second, you have unsolicited inbound interest from both strategic and financial buyers — which means a transaction window of three to five years is realistic, and the planning we do now determines how much of the value you keep.

### 5.2 Executive Summary closer ("What this means", page 3)

> Acted on together, the five priorities above produce roughly $4.5M – $5M in estate-tax savings, $250K – $330K in annual income-tax and yield benefit, and the elimination of the two largest structural exposures on your balance sheet (the unfunded buy/sell and the real-estate-inside-operating-LLC). The combined impact funds professional fees many times over, and — more importantly — it positions you for a transaction in 3–5 years from a far stronger structural starting point.

### 5.3 Representative recommendation — intro + body + impact (Recommendation 1, page 10)

**Strategic intro:**

> How your businesses, real estate, and personal interests are titled matters for liability protection, taxation, and the eventual sale or transfer of the enterprise. Three structural changes need to happen in sequence, and the sequence matters.

**Recommendations (bulleted action list, abbreviated to two of five entries):**

> • **Separate the real estate.** Form Holloway Properties, LLC (Georgia). Transfer the Kennesaw facility from HIS to Holloway Properties, LLC via a properly documented contribution-and-distribution structure that preserves basis. Put a written, market-rate triple-net lease in place between HIS (tenant) and Holloway Properties (landlord). Engage a third-party broker to opine on market rent before execution; the IRS will look at this in any audit.
>
> • **Recapitalize into voting and non-voting interests.** Inside the holdco, recapitalize Marcus's 88% into voting (~10%) and non-voting (~78%) units. The non-voting interest is what gets used in the GRAT and IDGT planning below — it allows you to transfer economic value without giving up control. Properly structured, this also produces a defensible valuation discount on the gifted interest.

**Closer ("Why this sequence matters"):**

> If you do the GRAT or IDGT sale before the recapitalization, you give up the valuation discount and lose meaningful estate-tax savings. If you transfer the real estate after the F-reorg rather than before, the contribution-and-distribution mechanics get more complex. The order is: real estate separation first, F-reorg and holdco second, recap third, then the estate work. Done in the right order over 90–120 days, the tax cost of the restructuring is essentially zero.

### 5.4 Cash Flow section opening + detail (Recommendation 2, page 11)

**Opening:**

> HIS is sitting on approximately $2.6M of operating and idle cash earning 0.1%. At a 4.5% reserve yield that is roughly $110,000 per year of foregone return — money you could use to fund insurance premiums, retention bonuses, or distributions, with no operational risk.

**Detail bullet:**

> • **Open a tiered business cash structure:** (1) Operating account — 30 days of payables, full liquidity. (2) Working reserve — 90 days of operating expenses, money market or 1-year laddered T-bills, currently yielding ~4.5%. (3) Strategic reserve — funds earmarked for tax payments, profit sharing, and key initiatives, in a higher-yield treasury or municipal sweep. We will model the right balance across the three based on your billing cycle and seasonality.

**`Quantified impact` closer:**

> On the current $2.6M cash position, the difference between the existing operating account at 0.1% and a 4.5% reserve is approximately $114,400 per year of pre-tax yield, or about $67,500 after tax at your current rate. That is roughly the entire annual cost of the buy/sell life insurance program we recommend in Section 4 — before factoring in the federal benefit of PTET below.

### 5.5 Personal Investment lens opening + strategy paragraph (Recommendation 10, page 18)

**Opening:**

> The business is the first place we invest. Personal portfolios are the second — they are what give you flexibility, independence, and a soft landing if anything happens to the business. With a 95%+ concentration ratio today, the priority is deliberate diversification through the transaction window.

**Strategy bullet (direct indexing, page 19):**

> • **Direct indexing for the taxable account.** Replace the current S&P-500-equivalent fund with a direct indexing strategy (separately managed account replicating the index using the underlying stocks). The strategy systematically harvests tax losses on individual positions while maintaining index-like return — typical loss harvesting yields 1.0%–1.5% of after-tax alpha annually, which on a $1.8M-and-growing balance is meaningful. Particularly valuable in years with significant business income.

### 5.6 Risk Management opening + coverage-gap framing (Recommendation 5, page 15)

**Opening:**

> Insurance is one of the few financial decisions where the right answer is shaped by exposure, not opinion. Our approach is to size protection to specific dollar exposures, not generic rules of thumb.

**Coverage-gap discussion (Personal Risk Management, page 18 — needs analysis closer):**

> Recommended structure: $8M new permanent coverage on Marcus owned by the ILIT (covers personal need + estate liquidity), plus a $3M 20-year term layer to bridge the highest-cost years. $3M new term on Catherine (she becomes more difficult to insure with age and any health change). Buy/sell coverage is separate (handled by Derek's policy on Marcus, see Section 5).

---

## 6. State A/B/C/D communication patterns (mapping Stage 3a output to plan prose)

Stage 3a emits per-rec `quantified_impact` in one of four states; Stage 4 must translate each into reader-facing prose using these conventions observed in Holloway:

- **State A (computed estimate present)** → Lead with dollar figure as an `approximately` or "roughly" range with explicit assumption parenthetical. Example pattern: *"Estimated annual federal tax savings: $148,000 based on Marcus's projected 2026 K-1 income."* Multi-value examples use en-dash range: *"Estimated first-year benefit: $700,000–$1,050,000 of additional depreciation deductions."* When a range exists, also translate to per-year and after-tax framing if relevant: *"approximately $114,400 per year of pre-tax yield, or about $67,500 after tax at your current rate."*

- **State B (blocked inputs)** → Frame as conditional with the specific blocked input named. Example pattern: *"$700,000–$1,050,000... typical net benefit of $180,000–$280,000 of federal tax savings in year one"* — but Stage 4 should add the unblock language when applicable: *"...once the building is moved to Holloway Properties, LLC, a cost segregation study should reclassify..."*. The unblock dependency is part of the prose, not a footnote.

- **State C (alternative_values pending firm policy)** → Present as a `Strategy comparison` table (column heads: Path / Pros / Cons), then a `Recommended path` subheading with the chosen approach explained. The Estate Planning section page 13–14 is the canonical pattern: 4-row Path × Pros × Cons table, then "Recommended path: a layered approach" + 6 numbered Steps.

- **State D (qualitative-only)** → Pure prose without dollar figures, but always anchored to a *concrete behavioral rule* the client can act on. Example: *"Resist the pre-IPO pattern of moving the personal portfolio aggressively into private markets or single-stock concentration before a sale. Your concentration risk is already very high through the business itself — the personal portfolio should be the diversification, not another concentration."* (page 19) — qualitative, but the behavioral guidance is unambiguous.

**Pending decisions surface twice.** Anything Stage 3a marks `decisions_needed: true` should be surfaced in (a) the relevant recommendation section as part of the rationale, AND (b) the dedicated `Decisions We Need From You` section as a standalone row with a recommended path and a deadline.

---

## 7. Cross-references between sections

Cross-refs are explicit and frequent. Patterns observed:

- Forward: *"see Section 4"*, *"in Section 6"*, *"see the Decisions Needed page"*, *"(see Section 3A)"*
- Backward: *"the SERP we recommend in Section 6"*, *"after the recap (Section 1)"*
- Layered impact: *"That is roughly the entire annual cost of the buy/sell life insurance program we recommend in Section 4"* (the cash-flow saving funds the insurance ask in another section)

Stage 4 should generate these refs — they're a quality signal. The reader walks through the document with continuity, not 12 disconnected silos.

---

## 8. Style rules extracted from observation

**Pronoun discipline.** "We" = PSA Wealth team. "You" = the client (couple). Specific person names in third-person when they're the subject of an action ("Marcus's K-1," "Catherine is not currently on payroll," "Derek would owe..."). NEVER refer to the client as "the client" or by surname alone in narrative; use first names or "you/your." NEVER "the firm" — always "we" or "PSA Wealth."

**Strategic-frame-first paragraph openings.** Every recommendation section opens with WHY before WHAT. The first sentence of a section is never "We recommend X." It's a statement of stakes ("Insurance is one of the few financial decisions where the right answer is shaped by exposure, not opinion."), a reframing ("The business is the first place we invest. Personal portfolios are the second."), or a numerical anchor ("HIS is sitting on approximately $2.6M of operating and idle cash earning 0.1%.").

**Bulleted actions are bold-imperative + explanation.** Format: `• **Imperative verb phrase.** Detail sentence(s) carrying parameters, partner roles, dollar exposure, and edge cases.` The bolded fragment is the headline; everything after is the briefing.

**Numbers always come with assumption.** No bare values. Always: "approximately $148,000 of federal tax savings on the table annually at current K-1 levels." Or with parenthetical: "$32,000,000 – $48,000,000 (Source: PSA Wealth preliminary range — 5.0x – 7.5x trailing adjusted EBITDA against comparable specialty mechanical transactions)."

**Em-dashes carry the qualifier.** *"...effective combined federal + state tax rate is approximately 41% — well above what is achievable with PTET, optimized W-2/K-1 mix, and a cash-balance retirement layer."* Em-dashes signal "and here's the implication" or "and here's the nuance."

**Partner-coordination language.** "Engage [Partner]" or "we will coordinate with the [Partner]" or "[Partner] + PSA" in the Implementation Roadmap Owner column. NOT "have your CPA do X" or "you should ask your attorney." The plan signals that PSA quarterbacks the partners.

**Specificity over generality.** Every recommendation names the specific instrument, dollar range, partner, and timing. A weak version would say "consider some estate planning"; the plan says "3-Year Zeroed-Out GRAT, funded with $8.2M of non-voting holdco units... Any growth above the §7520 hurdle rate (~5.0% currently) passes to the remainder beneficiaries."

**Tables for what scans; prose for what reasons.** Reference data (snapshot, partners, cadence, document checklists) lives in tables. Strategic reasoning lives in prose. Action items appear in BOTH — narrative bullets within each recommendation section, AND consolidated in the Implementation Roadmap table.

**Comfortable with naming a problem starkly.** *"This is the single largest unfunded liability on your balance sheet."* *"Material exposure."* *"Critical gap."* The plan is willing to label severity directly when the underlying analysis supports it. It is not aggressive ("URGENT") but not euphemistic ("worth considering") either.

---

## 9. Specific do / don't rules for Stage 4

1. **DO** open every recommendation section with strategic stakes (one sentence framing why this matters), THEN list specifics. **DON'T** lead with "We recommend that you..." — the rationale comes first, the recommendation emerges from it.

2. **DO** use "we" for the firm and "you" for the client throughout. **DON'T** drop into third-person ("the client should consider") or impersonal voice ("it is recommended"). Both flatten the relationship signal that's central to the voice.

3. **DO** write bulleted action items as `• **Bold imperative.** Explanatory context with partner + parameter + dollar + edge case.` **DON'T** write multi-line action items without the bold lead — the reader scans the bold first.

4. **DO** state numbers as ranges or "approximately X" with the underlying assumption named in-clause. **DON'T** emit bare point values — they read as false precision and lose the analyst's voice.

5. **DO** name partner roles explicitly when an action requires them ("engage Estate Attorney with M&A experience"; "we will coordinate with the CPA"). **DON'T** generalize ("consult a professional") — the plan demonstrates that PSA knows which partner role is needed.

6. **DO** include cross-references between related sections ("the savings here approximately fund the buy/sell premium in Section 4"). **DON'T** treat each recommendation as a silo — cross-refs are how the plan signals coherence.

7. **DO** surface State C (firm-policy pending) decisions in the dedicated `Decisions We Need From You` section with a recommended path AND in the relevant recommendation's rationale. **DON'T** bury a pending decision inside a single section's prose where the reader misses it.

8. **DO** map Stage 3a's `quantified_impact.qualitative_phrasing` (when populated for State B/C/D recs) to the strategic-frame opening of the recommendation section, not into the bulleted action list. **DON'T** transcribe it verbatim into a bullet — bullets are imperatives, not narrative.

9. **DO** preserve the bracketed section label (`[CORE SECTION]`, `[OPTIONAL — ...]`, `[PERSONAL — for owner(s)]`) as a separate field in the section output. **DON'T** drop it — the label drives downstream Tracker behavior (which sections always render vs. conditionally render).

10. **DO** auto-populate the Glossary at the back from technical terms used inline. **DON'T** define terms in-line redundantly — first-reference can carry a brief in-clause hint, but the glossary is the canonical safety net.

---

## 10. Structural elements to inventory for Stage 4

- **Three section-label categories** (`[CORE SECTION]`, `[OPTIONAL — explanation]`, `[PERSONAL — for owner(s)]`) — exposed as a field on each generated section
- **Top Priorities table** in Executive Summary — derived from Stage 3a's first 5 highest-impact recs, with `# / Priority / Estimated Impact / Timing` columns
- **Snapshot table** — derived from ClientProfile entity facts + valuation
- **Goals & Priorities table** — derived from ClientProfile goals_and_values + extracted strategic themes
- **Findings & Observations** — Strengths from positive ClientProfile signals; Opportunities organized by category mirroring Stage 3a category groupings
- **Implementation Roadmap table** — derived from Stage 3a ActionItems grouped by `timing_bucket`; columns: `Action / Timing / Owner / Status` (Status defaults `Not Started`)
- **Decisions Needed table** — derived from recs where `decisions_needed: true` OR `quantified_impact.pending_reconciliation: true`; columns: `# / Decision / Our Recommendation / Decision Needed By`
- **Advisory Team table** — derived from ClientProfile partner roster + identified TBD slots from ActionItem partner_required entries
- **Meeting Cadence table** — fixed-template (Implementation Check-in, Quarterly Tax, Investment Review, Annual Plan Review, Triggered Review)
- **Glossary** — auto-populated from technical terms used; entries: `Term / Stands For / Plain English`

---

## 11. Open questions for Stage 4 design

These are observations from the synthetic plan that don't yet have a clear architectural home and merit Hayden's call before Stage 4 implementation:

1. **Section-label-driven conditional rendering.** Should `[OPTIONAL — included because of pre-transaction posture]` sections only emit when an engagement matches that posture? If so, what's the trigger? Engagement archetype? Client profile field?

2. **Per-state prose templates vs. free generation.** State A/B/C/D each have a recognizable prose pattern. Does Stage 4 use templates parameterized by Stage 3a fields, or free LLM generation guided by examples? The synthetic plan reads like free generation with a strong style anchor — leaning that direction.

3. **Cross-reference resolution.** "see Section 4" requires Stage 4 to know its own section numbering. Do we generate sections in dependency order with stable numbering, or post-process refs after all sections are drafted?

4. **Glossary auto-extraction.** Building the glossary from inline term usage requires a pass over all generated content. Is this a Stage 4 sub-step or a Stage 5 (assembly) responsibility?

5. **Numbers consistency.** Stage 3a emits `estimate.value` and `scenario_range`. Stage 4 prose layer must consistently use the same numbers across the Executive Summary, the recommendation section, and the Implementation Roadmap. Single source of truth needed.

These are not blockers for the calibration document — they're flagged here so Stage 4's spec can address them deliberately.
