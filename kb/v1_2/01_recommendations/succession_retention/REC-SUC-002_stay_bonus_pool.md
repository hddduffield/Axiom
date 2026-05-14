# [REC-SUC-002] — Stay Bonus Pool Pre-Transaction

## METADATA
- **ID:** REC-SUC-002
- **Status:** Active
- **Category:** Succession & Retention
- **Engagement archetypes:** Pre-Exit
- **Plan section placement:** "Pre-Transaction Sequence" → "Retention"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.is_pre_exit == True
  - Transaction within 6-24 months
  - Key employees critical to closing transaction at favorable price
  - No formal stay bonus or retention package in place

DISQUALIFY if:
  - No transaction window
  - Already has retention package
```

### Natural-language explanation
Pre-transaction, key employees discover the deal via diligence; they see uncertainty and may interview elsewhere. Stay bonuses (paid only on closing + remaining for some defined post-close period) align their interests with the seller's, preventing pre-close departures that destroy transaction value.

### Hard disqualifiers
- No transaction
- Distrust within team

## WHAT IT IS
Cash bonus pool funded by seller (or charged against transaction proceeds), paid to key employees at closing and/or post-close anniversary in exchange for staying through the transition. Typical: half at close, half at 12 months post-close. Often 25-100% of annual base, scaled by role.

## WHY WE RECOMMEND IT
Key employee departure pre-close can crater transaction value or kill the deal. $200K-$500K of stay bonus often preserves $5M+ of transaction value.

## QUANTIFIED IMPACT FRAMEWORK

### Components
- Stay bonus pool size (typical 1-3% of transaction value)
- Allocation across key employees
- Closing-tied vs. post-close vesting
- Tax treatment (W-2 income to recipients; deductible to seller in transaction year)

### Worked example
$50M transaction, 5 key employees:
- Stay bonus pool: $1.5M (3% of value)
- Allocations: COO $400K, CFO $300K, sales lead $300K, ops lead $250K, top engineer $250K
- Half at close ($750K), half at 12-month anniversary ($750K)
- Seller absorbs cost (or netted against proceeds in some structures)

## IMPLEMENTATION STEPS
1. Identify key employees critical to transaction
2. Define pool size (1-3% of expected transaction value common)
3. Draft stay bonus agreements for each (clear closing trigger, clear vesting, separation provisions)
4. Communicate to selected key employees (timing and confidentiality)
5. Post-close, administer payouts on schedule
6. W-2 reporting

## SEQUENCING DEPENDENCIES
- **COORDINATED WITH:** REC-SUC-011 (banker engagement), REC-SUC-013 (management bench buildout)
- **TIMING:** typically 12+ months pre-transaction; some clients prefer immediately upon LOI signed

## DOCUMENTATION CHECKLIST
- [ ] Pool size approved
- [ ] Individual stay bonus agreements signed
- [ ] Closing payout calculation
- [ ] Post-close anniversary payout administered
- [ ] W-2 reporting

## COMMON MISTAKES
- Disclosing too late (employees already interviewing)
- Disclosing too early (employees expect higher)
- Vague trigger language (defines who's "still here" ambiguously)
- Forgetting non-compete coordination

## COORDINATION NOTES
- **PSA Wealth:** strategy and design support
- **CPA:** tax modeling for seller and recipients
- **Attorney:** drafting stay bonus agreements
- **M&A counsel:** coordination with transaction documents

## CLIENT CONVERSATION FRAMING
> "When the deal becomes real to your team — through diligence, banker conversations, or even rumor — your key people start fielding calls from competitors and recruiters. A stay bonus signals 'you're valued; stay; benefit at close.' Pool of about ${pool_size} (1-3% of transaction value), allocated to your top {num} people, paid half at close, half a year later. Buyer often expects a stay bonus exists; absence is sometimes worse than presence."

## CAVEATS & DISQUALIFIERS
- Buyer may want to participate in design (rolls into deal)
- Closing-only bonuses encourage staying to close, not staying after
- Post-close vesting requires post-close employer to administer (coordinate with buyer)

## REFERENCES
- Standard M&A retention practices
- IRC §83 — restricted property (rare in pure cash bonus context)

## PLAN OUTPUT TEMPLATE

> **Stay bonus pool for the {team_descriptor}.** ${per_recipient_amount} each, payable on a transaction event with a 12-month post-close service requirement. Total pool: ${pool_total} across {recipient_count} individuals. Buyers love seeing this; it materially de-risks the deal narrative. Communicated confidentially to selected employees once LOI signed (or per banker recommendation). Stay bonus agreements drafted by counsel; coordinated with buyer in transaction documents.

**Variables:**
- `{team_descriptor}` = the role grouping (Holloway: "project-management team (4 individuals)")
- `{per_recipient_amount}` = sized to retain critical individuals; Holloway uses $50K each
- `{pool_total}` = per_recipient_amount × recipient_count
- `{recipient_count}` = parsed from FR.10 or discovery notes

### Holloway-section reference for depth target

Holloway plan, Section 6, "Stay bonus pool" bullet — specifies:
1. Target group: "project-management team (4 individuals)"
2. Per-person amount: "$50K each"
3. Trigger: "payable on a transaction event"
4. Post-close service requirement: "12-month post-close service requirement"
5. Buyer-perception framing: "Buyers love seeing this; it materially de-risks the deal narrative"

Original template had the mechanics but missed the buyer-narrative framing and the specific 50%-at-close / 50%-at-12-months structure.
