# [REC-ENT-002] — F-Reorganization to Holdco

## METADATA
- **ID:** REC-ENT-002
- **Status:** Active
- **Category:** Entity Structure
- **Subcategory:** Pre-Transaction Restructuring
- **Engagement archetypes:** Pre-Exit, Active-No-Exit (when transaction window emerges), Pre-Liquidity-Founder
- **Plan section placement:** "Recommendations — Business" → "Entity & Real Estate Structure" subsection
- **Last verified:** April 2026
- **Verification frequency:** Annual (statute is stable; Treasury regulations have ongoing minor refinements)

---

## TRIGGERING CONDITIONS

### Structured logic (machine-evaluable)

```
TRIGGER if ALL of:
  - FR.has_business == True
  - FR.is_pass_through_entity == True (LLC, S-Corp, or Partnership)
  - FR.4.has_holdco == False  (no existing holding-company layer)
  - At least ONE of:
      - FR.is_pre_exit == True (transaction window 3-10 years)
      - FR.13.1.has_goal_estate_planning == True (estate transfer planning contemplated)
      - FR.13.1.has_goal_after_tax_sale == True
      - FR.5.4.primary_owner_business_equity_value > 5_000_000
      - FR.3.3.latest_revenue > 10_000_000

DISQUALIFY if:
  - Single owner with no estate planning goals AND no transaction window AND business equity < $3M (insufficient benefit to justify cost)
  - Owner age > 75 with no transaction or transfer plans
  - Existing complex multi-entity structure where introducing holdco would compound rather than simplify
```

### Natural-language explanation

The F-reorganization is appropriate when an established profitable pass-through business is approaching either a transaction event or a meaningful estate-transfer event, and the existing single-tier structure (operating company directly held by individuals) lacks the flexibility a future move will require. The strategy is preventive: it positions for futures that may not yet be certain.

### Hard disqualifiers

- The S-election integrity is fragile (recent ownership changes within 5 years that could be challenged)
- Existing operating agreement contains transfer restrictions that would prevent the share exchange
- The business has known IRS audit issues that should be cleared before any restructuring
- A transaction is closing within the next 6 months (insufficient time for restructuring to season; some buyers discount very recent reorganizations)
- The business is a partnership with multiple unrelated owners who will not all consent to the restructuring

---

## WHAT IT IS

A Section 368(a)(1)(F) reorganization — sometimes called an "F-reorg" — is a tax-free corporate restructuring defined as "a mere change in identity, form, or place of organization of one corporation." When properly structured, it allows the formation of a new holding company ("Holdco") above the existing operating entity, with no recognition of gain by the corporation or its shareholders.

For a typical PSA client (an S-Corp operating business): a new entity (the Holdco) is formed, and the existing operating company becomes its wholly-owned subsidiary. The shareholders of the original operating company receive identical shares of the new Holdco. The S-election is preserved through the reorganization. The operating company can elect QSub status and continue to be disregarded for federal tax purposes.

The structural result is identical economic ownership of the same operating business, but with a holding-company layer that unlocks future moves not available in a single-tier structure.

---

## WHY WE RECOMMEND IT

The F-reorg is a **structural option play**. It does not, by itself, produce any tax savings or transfer of value. What it does is unlock five categories of future moves that would otherwise be substantially harder or impossible:

### 1. Charitable gifting of equity becomes clean

Gifting non-voting Holdco units to a Donor-Advised Fund or Charitable Remainder Trust is procedurally clean — the gift is of holding-company stock that does not carry employment relationships, customer contracts, regulatory licenses, vendor agreements, or warranty obligations. By contrast, gifting operating-company stock typically requires the recipient to acknowledge or assume those obligations, which creates friction (and sometimes outright disqualification) at major DAF sponsors.

### 2. Bridge structure for stock-vs-asset transaction preferences

In an exit transaction, the buyer typically prefers an asset deal (basis step-up, no successor liability) and the seller typically prefers a stock deal (single layer of capital-gains tax). With an F-reorg + QSub structure, the Holdco can sell the operating sub's assets while the seller treats the transaction as a sale of Holdco stock — bridging the structural gap. This alone often justifies the cost of the F-reorg several times over in transaction-pricing negotiations.

### 3. §1202 QSBS evaluation becomes possible

The Holdco can be converted to (or formed as) a C-Corporation, opening the §1202 QSBS path for value created post-conversion. Under OBBBA's expanded §1202 rules (post-7/4/25 issuance, $15M or 10× basis exclusion, 3/4/5-year tiered holding period, $75M gross-asset cap), this is a substantial benefit when the transaction window is 3+ years out.

### 4. Internal restructuring without tax cost

Multiple operating businesses can be consolidated under one Holdco. New ventures can be launched as separate sub-LLCs. Geographic expansions can be entitied. Joint ventures can be carved out. All of these moves are easier with a Holdco than with a single-tier structure where the operating company itself must accommodate every adjustment.

### 5. Recapitalization into voting / non-voting becomes available

Voting/non-voting recap is typically done at the Holdco level after F-reorg, not at the operating-company level. This is the foundation for GRAT and IDGT planning. The non-voting interest is the asset transferred; the voting interest is retained for control.

**The cost of the F-reorg, done in the right order, is essentially zero.** The structural premium it captures is real and scales with business value.

---

## VARIATIONS AND STRUCTURAL OPTIONS

### Variation A — S-Corp Holdco / S-Corp Subsidiary (QSub)

**Structure:** New S-Corp Holdco; existing operating S-Corp becomes wholly-owned subsidiary; QSub election filed (Form 8869) so operating sub is disregarded for federal tax purposes (treated as a division of Holdco).

**Pros:** Simplest. Single S-Corp tax filing. Preserves S-election. No double tax.

**Cons:** Limits §1202 evaluation (S-Corp stock is not QSBS). Foreign or corporate shareholders still excluded.

**When to use:** Default for PSA's lane. ~80% of cases.

### Variation B — S-Corp Holdco / Operating LLC (Disregarded)

**Structure:** New S-Corp Holdco; new LLC formed as wholly-owned subsidiary; operating business assets contributed to LLC; operating LLC is disregarded for federal tax (single member, taxed as part of Holdco).

**Pros:** Clean liability separation. Operating business in LLC for state-law purposes; tax remains S-Corp.

**Cons:** Asset contribution mechanics; basis tracking.

**When to use:** When the operating business is currently directly in S-Corp and PSA wants liability segregation post-reorg. Less common.

### Variation C — C-Corp Holdco for §1202 Path

**Structure:** Holdco is a C-Corp from inception (or converted after F-reorg). Operating sub remains S-Corp QSub or is converted to LLC.

**Pros:** Opens §1202 QSBS for new shares issued by the C-Corp.

**Cons:** C-Corp ongoing tax drag (~21% federal entity-level on profits). Double taxation on dividends. Loss of pass-through treatment for owner.

**When to use:** Only when transaction window is 3+ years AND business will substantially appreciate during that window AND value at exit is large enough that §1202 exclusion saves more than C-Corp drag costs. Typically: businesses currently $20M+ valued, expected to grow to $50M+, with at least 3 years to a transaction.

### Variation D — Multi-Tier (Holdco above Holdco above Op Co)

**Structure:** For very large or multi-jurisdiction operations, a top-tier Holdco above intermediate Holdcos for each business line.

**When to use:** Rare in PSA's lane. Used when client has multiple distinct operating businesses requiring separate treatment (e.g., one US-based, one with foreign operations).

### Variation E — Hot vs. Cold Asset Carve-Out

**Structure:** Before F-reorg, "cold" assets (real estate, IP, passive investments) are spun out to a sibling LLC; "hot" assets (operating business) go through the F-reorg into the Holdco/Sub structure. This is typically done as part of broader pre-transaction cleanup.

**When to use:** When the operating business carries non-core assets (typically real estate — see REC-ENT-001 Real Estate Separation, which is sequenced before F-reorg).

---

## QUANTIFIED IMPACT FRAMEWORK

### Impact components

The F-reorg itself produces no direct dollar value. It creates **option value** for downstream moves. Quantifying the value requires identifying which downstream moves the client will make and pricing those.

| Downstream Move | Value Mechanism | Typical Range |
|---|---|---|
| Stock-vs-asset deal bridge | Negotiation premium captured in transaction pricing | 3%–10% of transaction value |
| Charitable DAF gifting of non-voting units | FMV deduction × marginal rate; capital gains avoided | 35%–40% of gifted FMV (combined) |
| §1202 QSBS path (post-OBBBA) | Up to $15M (or 10× basis) gain exclusion per shareholder | $3.5M–$15M+ in tax savings |
| GRAT / IDGT enablement (via subsequent recap) | Estate value transferred at 30%+ discount, freezing appreciation | 25%–40% of transferred value |
| Internal reorganization flexibility | Avoided cost of taxable restructurings | $50K–$500K depending on complexity |

### Worked numerical example

**Holloway-style client:** $42M operating S-Corp, transaction window 3–5 years, owner intends to combine the F-reorg path with both GRAT/IDGT estate planning and pre-transaction charitable gifting.

**Cost of the F-reorg itself:**
- Attorney fees: ~$15K–$25K (specialist M&A counsel)
- CPA fees: ~$5K–$10K (tax memo, Form 8869, basis tracking)
- Total cost: **~$20K–$35K**

**Value unlocked:**
| Move | Value |
|---|---|
| Recap → 30% discount on $25M of non-voting units transferred via GRAT/IDGT | $7.5M of estate value frozen + appreciation outside estate |
| Estate tax saved on that $7.5M at 40% | $3.0M |
| Pre-transaction DAF gift of $5M of non-voting Holdco units | $5M deduction × 37% = $1.85M federal tax savings + ~$1.2M capital gains avoided = **~$3.0M combined** |
| Stock-vs-asset deal bridge premium on $40M transaction | 5% premium = **$2.0M** |
| **Total estimated value unlocked** | **~$8M+** |

**ROI on F-reorg cost:** ~$8M of value / ~$30K of cost = **>250×**.

This is the firm's standard framing: the F-reorg looks expensive in isolation but produces multiples of its cost in option value. The plan output should NEVER quote the F-reorg as a standalone benefit — it must always be paired with the downstream moves it enables.

### Range parameters (for generator scaling)

| Variable | Source |
|---|---|
| Business value | FR.5.4.primary_owner_business_equity_value or FR.3.5.value_midpoint |
| Transaction window | FR.11.transaction_window_years (drives §1202 vs. non-§1202 modeling) |
| Estate exposure | FR.9.2.estate_tax_exposure |
| Charitable intent | FR.13.1.has_goal_charitable |
| Owner age | FR.2.1.age (drives mortality risk on subsequent GRAT) |

---

## IMPLEMENTATION STEPS

### Phase 1 — Pre-Reorg Diligence (Days 0–14)

1. **Confirm S-election integrity.** Pull from CPA: most recent IRS Form 2553 acceptance, history of S-Corp tax filings, any ownership changes within the past 5 years that might have inadvertently terminated S-status.
2. **Confirm shareholder eligibility.** All shareholders must be eligible S-Corp shareholders (US individuals, certain estates, certain trusts, qualifying tax-exempts). Foreign or corporate shareholders kill the S-election.
3. **Inventory contracts and licenses** that may require consents on entity change. While a properly structured F-reorg is generally a non-event for contracts and licenses (the operating sub continues to exist with the same EIN), some loan documents, customer contracts, and licenses have anti-assignment or change-of-control language that should be reviewed.
4. **Confirm no pending IRS or state audits** that would be complicated by restructuring.
5. **Engage M&A counsel** with documented F-reorg experience. The firm's house position: this is not a generalist business attorney engagement.

### Phase 2 — Document Drafting (Days 14–45)

1. **Form new Holdco entity.** Same state as operating entity (Georgia for typical PSA clients). File Articles of Incorporation/Organization. Obtain EIN.
2. **Draft Holdco S-election (Form 2553).** Must be filed with IRS. Effective date is critical — typically the date of the share exchange.
3. **Draft Plan of Reorganization** documenting the F-reorg steps in proper §368(a)(1)(F) form. This is the master document.
4. **Draft Share Exchange Agreement.** Each shareholder of operating company exchanges shares for identical shares of Holdco. Operating company becomes wholly-owned subsidiary.
5. **Draft Holdco Operating Agreement / Bylaws.** Initially mirrors operating company; subsequent voting/non-voting recap is a separate later step (see REC-ENT-003).
6. **Draft QSub election (Form 8869)** to be filed for operating company subsidiary, effective as of the share-exchange date.
7. **Tax memo from CPA** documenting §368(a)(1)(F) treatment, basis carryover, and the absence of recognized gain.

### Phase 3 — Execution (Days 45–60)

1. **Execute share exchange** per Plan of Reorganization. Documented with stock certificates, board resolutions, member consents.
2. **File Form 2553** (Holdco S-election) and **Form 8869** (QSub election) with IRS.
3. **Update banking** — bank may require new operating-account documentation reflecting the holding structure (operating sub typically remains the primary operating account).
4. **Update state filings** — secretary of state may require notice of the new ownership structure for the operating sub.
5. **Update key vendor/customer contacts** with new ownership info to the extent operationally necessary (typically minimal; the operating sub is the same legal entity).
6. **Update insurance** — confirm GL, property, key-person, and other policies remain valid; some carriers want notice of holding structure.

### Phase 4 — Post-Reorg Integration (Days 60–120)

1. **Confirm IRS acceptance** of S-election (Form 2553) and QSub election (Form 8869). Both typically take 60–90 days for written acceptance.
2. **Update K-1 issuance** — first K-1 cycle after reorg should reflect Holdco issuing K-1s to shareholders, with operating sub flowing through.
3. **Coordinate with Operating Agreement Replacement (REC-ENT-004).** The new Holdco operating agreement should be prepared concurrently.
4. **Coordinate with Voting/Non-Voting Recap (REC-ENT-003).** Recap follows F-reorg, typically 30-60 days later, paired with a qualified appraisal.

---

## SEQUENCING DEPENDENCIES

- **SEQUENCED WITH:** REC-ENT-001 (Real Estate Separation from Operating LLC) — real estate separation precedes the F-reorg in plan output but both belong in the same workplan; ordering carries the dependency
- **MUST come AFTER:** any necessary S-election cleanup or amendment of inadvertent terminations (real-world cleanup must be done before F-reorg is filed)
- **MUST come BEFORE:** REC-ENT-003 (Voting/Non-Voting Recap) — recap happens at Holdco level after F-reorg
- **MUST come BEFORE:** REC-EST-006 (3-Year Zeroed-Out GRAT), REC-EST-008 (Sale to IDGT), and REC-CHR-002 (Pre-Transaction Charitable Gifting of Business Interest)
- **COORDINATED WITH:** REC-ENT-004 (Operating Agreement Replacement) — new operating agreement reflects the holdco structure
- **MUTUALLY EXCLUSIVE WITH:** Conversion of operating entity to C-Corp without holdco layer (a different structural choice; F-reorg is preferred when goal is to preserve S-Corp current treatment with optionality for future C-Corp at Holdco level)

---

## DOCUMENTATION CHECKLIST

The following documents must exist at the close of the engagement and be retained permanently:

- [ ] Plan of Reorganization (master document describing the §368(a)(1)(F) treatment)
- [ ] Tax memo from CPA documenting §368(a)(1)(F) treatment
- [ ] New Holdco formation documents (Articles, Operating Agreement)
- [ ] New Holdco IRS Form 2553 (S-election) — filed copy + IRS acceptance letter
- [ ] Form 8869 (QSub election for operating sub) — filed copy + IRS acceptance letter
- [ ] Share Exchange Agreement signed by all shareholders
- [ ] Stock certificates / membership unit certificates documenting old → new ownership
- [ ] Board / member resolutions authorizing the reorganization
- [ ] State-level filings (state-of-formation amendments, foreign qualifications)
- [ ] Cap table, before and after, with basis tracking
- [ ] Banking documentation reflecting new structure
- [ ] First post-reorg tax return (Form 1120-S for Holdco) showing Schedule M-1 and Schedule M-2 reflecting the reorganization
- [ ] First post-reorg K-1s reflecting Holdco issuance

The firm's house position: under-documented F-reorgs that are later challenged by the IRS are catastrophic. The IRS can recharacterize an "F-reorg" as a taxable distribution-and-recontribution if the documentation is weak. Defensibility is documentation.

---

## COMMON MISTAKES & AUDIT TRIGGERS

### Mistake 1: Treating the F-reorg as a single-step transaction

The F-reorg is usually a multi-step plan (form Holdco, exchange shares, file elections, update operating agreements). Each step needs to be documented as part of an integrated plan. Skipping documentation of any step weakens the §368(a)(1)(F) qualification.

### Mistake 2: Late S-election (Form 2553) for Holdco

If the Holdco is not effectively elected as an S-Corp from the date of the share exchange, the IRS may treat Holdco as a C-Corp for that period — creating a deemed dividend distribution from the operating sub. Filing the Form 2553 immediately, with effective date matching the exchange, is non-negotiable.

### Mistake 3: Skipping the QSub election

Without a timely Form 8869 QSub election, the operating sub is treated as a separate C-Corp — creating two-tier taxation on its earnings. The QSub election keeps the operating sub disregarded for federal tax purposes.

### Mistake 4: S-Corp shareholder eligibility violations

Common scenarios that disqualify the S-election:
- Foreign shareholder somehow ended up on cap table (e.g., spousal acquisition by foreign citizen)
- Corporate or partnership shareholder
- Non-qualifying trust as shareholder
- More than 100 shareholders (rare in PSA's lane)

These should be identified and cured *before* the F-reorg, not as part of it.

### Mistake 5: Operating agreement not updated

If the operating sub's operating agreement still references the original ownership pattern after the F-reorg, the disconnect creates ambiguity about authority, distributions, and transfers. The operating agreement must be updated to reflect Holdco as sole member.

### Mistake 6: Loan covenant violations

Some commercial loans contain change-of-control or anti-assignment provisions that may be triggered by the F-reorg. Lender consent should be obtained before execution, even though the operating business is structurally unchanged.

### Audit triggers

- IRS scrutiny of F-reorgs is moderate; the body of law is well-established and most IRS examiners understand the structure
- Major audit risk areas: (1) timing of elections, (2) basis tracking through the reorg, (3) any recent shareholder changes that might have terminated S-election before the reorg
- The IRS has issued Rev. Rul. 2008-18 confirming continued vitality of F-reorgs — this is favorable precedent
- The 2008 regulations under Treas. Reg. §1.368-2(m) clarify the requirements; well-documented F-reorgs that follow the regulation steps are very rarely successfully challenged

---

## COORDINATION NOTES (Quarterback Roles)

### PSA Wealth role
- Primary coordinator. Schedules the engagement, frames the rationale to the client, sequences the F-reorg with downstream estate / charitable / transaction planning. Tracks the documentation checklist to completion.

### CPA role
- Drafts the §368(a)(1)(F) tax memo
- Files Form 2553 (S-election for Holdco) and Form 8869 (QSub election)
- Documents basis carryover
- Prepares first post-reorg tax return correctly reflecting the structure
- **The firm's house position:** generalist CPAs without M&A or restructuring experience should NOT lead this work. PSA introduces a specialist CPA if the existing one lacks depth.

### Attorney role
- M&A counsel drafts Plan of Reorganization, Share Exchange Agreement, new operating agreements
- Files state-level documents
- Coordinates lender consent if needed
- **The firm's house position:** generalist business attorney is NOT adequate. Specialist M&A counsel with documented F-reorg experience required.

### Other professionals
- **Banker:** may need updated KYC documentation; rarely is the reorg substantively material to the banking relationship
- **Insurance broker:** confirms continuity of GL, property, key-person, buy-sell coverages through the restructuring

---

## CLIENT CONVERSATION FRAMING

The firm's house framing for clients:

> "We're going to put a holding-company layer above your operating business. Done in the right order, the tax cost is zero. What it does is open three or four future moves that aren't possible without it: cleaner charitable gifting of equity, the bridge between your preferred stock-deal tax treatment and a buyer's preferred asset-deal mechanics, the ability to do additional internal restructuring as the business evolves, and — most importantly — the foundation for moving non-voting interests outside your taxable estate while you keep operating control. The cost is around $25K of professional fees. The value depends on which of those moves you actually use, but for a business at your scale, the typical return is well over 100×."

The firm avoids:
- Overselling the reorg itself (it's an enabler, not a value-creator on its own)
- Promising specific dollar amounts for future moves that depend on facts not yet known
- Treating the client like the F-reorg is so technical that they shouldn't engage with the why

The client conversation should always pair the F-reorg with at least one specific downstream move that the client cares about — typically estate transfer, the transaction itself, or charitable gifting.

---

## CAVEATS & DISQUALIFIERS

### When NOT to recommend

- **Transaction within 6 months.** Restructuring needs time to season; very-recent reorgs may be discounted by buyers or attract challenge.
- **Single-shareholder business with no transaction window AND no estate planning needs.** The F-reorg's value is in what it enables; if the client will not use any enabled moves, it's just cost.
- **Owner who is unwilling to engage specialist counsel.** Generalist execution of an F-reorg is the worst of both worlds — cost without defensibility.
- **Operating business with severe pending tax issues.** Resolve those first.

### Edge cases

- **Multi-state operations:** holdco's state of formation matters for state tax conformity and franchise tax exposure; coordinate with CPA
- **ESOP-considered businesses:** F-reorg before ESOP is fine; complications if ESOP is already in place — separate analysis needed
- **Carried interest / profits interest holders:** their interests must be addressed in the share exchange — typically converted to equivalent Holdco profits interests with appropriate vesting

### Risk factors

- **Cost-benefit failure:** if downstream moves don't happen, the F-reorg is wasted spend
- **Documentation failure:** under-documented reorgs can be recharacterized as taxable
- **State conformity:** Georgia and most states conform to federal §368 treatment, but verify. **[VERIFY 2026 — confirm Georgia conformity status]**

---

## REFERENCES

### Primary statute
- **IRC §368(a)(1)(F)** — defines the F-reorganization

### Treasury regulations
- **Treas. Reg. §1.368-2(m)** — clarifies F-reorg requirements (2008 final regulations)

### IRS revenue rulings and procedures
- **Rev. Rul. 2008-18** — confirms F-reorg with simultaneous S-election preserves S-status
- **Rev. Rul. 64-250** — early ruling on F-reorg mechanics
- **Rev. Rul. 96-29** — F-reorg followed by other reorganization steps
- **Rev. Rul. 2003-48** — treatment of liabilities in F-reorg
- **Rev. Proc. 2013-30** — late S-election relief (relevant if Form 2553 timing is late)

### Related provisions
- IRC §1361 — S-Corp eligibility and election
- IRC §1362 — S-Corp election mechanics
- IRC §1361(b)(3)(B) — QSub election
- IRC §381 — carryover of corporate attributes (basis, holding period, etc.) in tax-free reorganizations

### Forms
- **Form 2553** — Election by a Small Business Corporation (S-Corp election)
- **Form 8869** — Qualified Subchapter S Subsidiary (QSub) Election
- **Form 1120-S** — first post-reorg tax return must reflect the structure correctly

### Key cases
- **Estate of Mixon v. United States, 464 F.2d 394 (5th Cir. 1972)** — early F-reorg recognition
- **Aetna Casualty & Surety Co. v. United States, 568 F.2d 811 (Ct. Cl. 1977)** — structural-change requirement

---

## PLAN OUTPUT TEMPLATE

This is the prose pattern the generator produces in the client-facing plan. Variables in `{braces}` are filled from FR data and downstream-rec activations.

---

> **Build the holding-company layer.** Above {operating_entity_name}, place a new {state} {entity_type} — "{client_lastname} Holdings" — taxed as an S-Corp. Use an F-reorganization (Section 368(a)(1)(F)) to create the new structure tax-free. This positions you for several future moves: {list_of_downstream_moves_activated}.
>
> {if has_charitable_intent: "charitable gifting of holdco stock (cleaner than gifting operating-company shares),"}
> {if has_estate_planning_goal: "the foundation for the voting/non-voting recapitalization that supports the GRAT and IDGT planning below,"}
> {if has_estate_planning_goal_or_transaction: "basis-step-up planning,"}
> {if has_transaction_window: "and — critically — the ability to do a tax-free internal restructuring if a future buyer wants an asset deal but you want stock-deal treatment."}

> *[If the recommendation is part of a sequenced restructuring set, conclude the section with the firm's "Why this sequence matters" closer:]*
>
> **Why this sequence matters.** {Sequencing rationale specific to this client's mix of activated recommendations}. Done in the right order over 90–120 days, the tax cost of the restructuring is essentially zero.

---

### Tone and voice notes for the generator

- Match Holloway tone: matter-of-fact, structural, never breathless
- Quantify only the F-reorg's cost (~$20K–$35K typical professional fees) — do NOT quote dollar value of the F-reorg standalone
- Always pair with at least one specific downstream move from the activated set
- Use the phrase "tax-free" only where the structural treatment is properly documented; the firm prefers "essentially zero tax cost" as the more defensible phrasing
- Reference the §368(a)(1)(F) section number once for credibility; do not over-cite

### Disclosure overlay

When this recommendation appears in plan output, the standard estimate-and-projection disclosure language applies (see `05_disclosures/03_estimates_projections.md`). The generator does NOT need to add reorg-specific disclosure language beyond the standard set.
