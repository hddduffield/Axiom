# [REC-RSK-001] — Cross-Purchase Buy/Sell with Insurance Funding

## METADATA
- **ID:** REC-RSK-001
- **Status:** Active
- **Category:** Risk & Insurance / Succession
- **Engagement archetypes:** Pre-Exit, Active-No-Exit (multi-owner)
- **Plan section placement:** "Recommendations — Business" → "Risk & Liability"
- **Last verified:** April 2026

---

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.has_business == True
  - FR.3.2.owner_count >= 2
  - FR.7.4.has_buy_sell_life_funding == False OR existing arrangement underfunded
  - At least ONE owner is insurable

DISQUALIFY if:
  - 5+ owners (number of policies escalates; insurance LLC becomes preferable — see REC-RSK-003)
  - All owners uninsurable
  - Hostile owner relationship (buy/sell may not survive negotiation)
```

### Natural-language explanation
Each owner buys life insurance on the other(s). At death of an owner, surviving owners use proceeds to buy deceased's interest from estate at agreed price/formula. Common in 2-3 owner businesses; provides clean transfer mechanism, basis step-up to surviving owners.

### Hard disqualifiers
- Both owners uninsurable
- 5+ owners (administrative complexity)
- Pre-existing buy/sell already in place and adequately funded

---

## WHAT IT IS

A buy/sell agreement between owners (or with the entity) triggered by death, disability, retirement, or other defined events. Cross-purchase variant: each owner buys policies on the other owner(s); at death of one owner, surviving owners use proceeds to buy the deceased's interest from the estate.

Mechanics:
- 2-owner business: 2 policies (each owns one on the other)
- 3-owner business: 6 policies (each owns one on each other owner)
- 4+ owners: combinatorial complexity → typically use insurance LLC variant (REC-RSK-003)

---

## WHY WE RECOMMEND IT

Cross-purchase advantages over redemption (REC-RSK-002):
- **Basis step-up to survivors** (purchased interest gives them new basis equal to purchase price)
- **Proceeds avoid AET (accumulated earnings tax) issue** at entity level
- **Purchase qualifies for installment treatment** if structured properly
- **Greater flexibility for unequal ownership**

Cross-purchase disadvantages:
- More policies for >2 owners
- Premium cost for healthy owners on younger/healthier owners
- Each owner pays from own funds (no entity funding)

---

## QUANTIFIED IMPACT FRAMEWORK

### Quantified impact framework (Holloway facts)
- 2 owners: Marcus 88%, Derek 12%
- Business value: $42M (midpoint)
- Buy-out for Marcus's interest: $42M × 88% = $36.96M
- Buy-out for Derek's interest: $42M × 12% = $5.04M
- **Asymmetric sizing per Holloway plan:** Marcus owns a $4.2M policy on Derek; Derek owns a $5M policy on Marcus as a starting layer; the residual exposure for Marcus's full stake is addressed via the separate ILIT-owned estate-liquidity layer (REC-RSK-004 / REC-EST-004)

### Premium estimate (varies by health, age, term/permanent)
- 20-year term, convertible: $5M face on age 50-52 preferred = ~$8K-$15K/year
- Permanent (whole life or universal) for portion: 5-10× term cost
- Holloway plan reference: aggregate premium funded via bonus-and-loan to Derek at the entity level

### Ownership note (do NOT confuse with ILIT)
Cross-purchase policies are **owner-owned, not ILIT-owned.** Each owner is the policyowner, premium-payer, and beneficiary of the policy on the other owner. Owner-on-owner ownership is what delivers the basis step-up at buy-out — putting these policies in an ILIT would break the cross-purchase mechanic. The ILIT exists separately to hold estate-liquidity coverage on the primary owner (REC-EST-004); it does not own the buy/sell policies.

---

## VARIATIONS AND STRUCTURAL OPTIONS

### Variation A — Cross-purchase (Holloway default for 2-owner)
Each owner is the policyowner on the other. Owner-on-owner ownership is required for the basis-step-up mechanic; these policies are NOT held in an ILIT.

### Variation B — Redemption (REC-RSK-002)
Entity buys policies; at death, entity redeems deceased's interest. Different tax mechanics.

### Variation C — Insurance LLC (REC-RSK-003)
Multi-owner businesses (3+) form an insurance LLC that owns all policies; LLC distributes proceeds at trigger.

### Variation D — Hybrid
Some elements cross-purchase, some redemption. Common in family businesses with mixed dynamics.

---

## IMPLEMENTATION STEPS

1. Attorney drafts buy/sell agreement (or amends existing). Specifies trigger events (death, disability, retirement, voluntary departure, divorce, bankruptcy), valuation methodology, payment terms.
2. Each owner underwriting: medical exam, financial questionnaire.
3. Each owner applies for policy on other owner(s). If ILIT-owned, ILIT applies.
4. Policies issued; premium funding established.
5. Coordinate with operating agreement / shareholder agreement to mirror buy/sell terms.
6. Annual review of valuation and coverage adequacy.

---

## SEQUENCING DEPENDENCIES

- **Coordinated WITH:** REC-EST-004 (ILIT) when ILIT ownership preferred
- **Coordinated WITH:** REC-ENT-004 (Operating Agreement Replacement) — buy/sell terms in operating agreement
- **Coordinated WITH:** REC-RSK-007 (Key Person Life) — different purpose but same insured

---

## DOCUMENTATION CHECKLIST

- [ ] Buy/sell agreement
- [ ] Underwriting medical/financial documentation
- [ ] Insurance applications and binders (each owner as policyowner on the other)
- [ ] Premium funding source documented (incl. bonus-and-loan structure if applicable)
- [ ] Coordinated with operating agreement
- [ ] Annual valuation review

---

## COMMON MISTAKES & AUDIT TRIGGERS

- **Stale valuation formula** — formula in 5-year-old buy/sell may not reflect current value
- **Unfunded or underfunded** — promises buy-out without insurance to fund it
- **Symmetric sizing default for asymmetric ownership** — sizing must reflect each owner's share of the other's interest, not a flat per-owner number
- **Confusing cross-purchase with ILIT-owned coverage** — cross-purchase policies must be owner-owned to deliver basis step-up at buy-out; ILIT ownership is for the *separate* estate-liquidity layer, not the buy/sell mechanism
- **§101(j) employer-owned life insurance issues** — applies to entity-owned policies (redemption variant); requires consent and notice
- **§7872 below-AFR loans for premium** — if premium financed via business loan (bonus-and-loan structure), AFR matters

---

## COORDINATION NOTES

### PSA Wealth role
Coordinates underwriting. Tracks coverage adequacy. Annual review.

### Attorney role
Drafts buy/sell agreement. Specialist M&A or business counsel.

### CPA role
Tax analysis of structure. Coordinates with §101(j), AFR if relevant.

### Insurance carrier
Underwriting, policy issuance.

---

## CLIENT CONVERSATION FRAMING

> "Buy/sell with life insurance funding. Currently {entity_name} has {existing_status}. With Derek as 12% owner and you at 88%, a cross-purchase structure makes sense — each of you is the policyowner on the other. The policies are owner-owned, not ILIT-owned: cross-purchase requires owner-on-owner ownership to deliver the basis step-up at buy-out. The ILIT holds a separate estate-liquidity layer on you, distinct from the buy/sell mechanism. Sizing is asymmetric to match your respective ownership stakes; because Derek's policy on you would carry a larger face amount than he can fund personally, premiums are typically funded at the entity level via a bonus-and-loan structure to him."

---

## CAVEATS & DISQUALIFIERS

- **Coverage adequacy:** $5M may not cover full Marcus stake of $36M — typically funds Derek's stake fully and provides partial liquidity for Marcus's stake
- **Health-driven cost:** unhealthy or older owners face high premiums
- **§101(j) compliance:** entity-owned variants require consent/notice procedures
- **3-year lookback (§2035) on existing personal policies transferred to ILIT** — coordinate carefully

---

## REFERENCES

- **IRC §101(a)** — death benefit income-tax exclusion
- **IRC §101(j)** — employer-owned life insurance contracts (notice/consent)
- **IRC §2042** — incidents of ownership in life insurance
- **IRC §2035** — 3-year lookback
- **IRC §7872** — below-AFR loans (premium financing)

---

## PLAN OUTPUT TEMPLATE

> **Replace the buy/sell paragraph entirely.** Drafted as a cross-purchase between you and {co_owner_first_name} (not a redemption — cross-purchase preserves basis step-up for the surviving owner). Triggering events: death, disability, retirement, voluntary departure, involuntary departure, divorce, bankruptcy. Valuation formula: trailing 3-year EBITDA × negotiated multiple, with a floor and ceiling and an annual update mechanism.
>
> **Buy/sell life insurance — cross-purchase structure (each owner is the policyowner on the other):**
> - You own a ${primary_policy_face}M policy on {co_owner_first_name} (funds your purchase of {co_owner_first_name}'s {co_owner_pct}% if {co_owner_first_name} dies first);
> - {co_owner_first_name} owns a ${co_owner_policy_face}M policy on you (funds {co_owner_first_name}'s purchase of your {primary_owner_pct}% interest);
> - {if asymmetric_premium_burden: "Premiums on the policy {co_owner_first_name} owns are funded at the entity level via a bonus-and-loan structure to {co_owner_first_name} — the larger face amount on you would otherwise exceed what {co_owner_first_name} can fund personally;"}
> - 20-year term, convertible — matches the planning horizon and protects against insurability changes.
>
> **These cross-purchase policies are owner-owned, not ILIT-owned.** Cross-purchase requires owner-on-owner ownership for the structure to deliver the basis step-up at buy-out. The ILIT (REC-EST-004) holds a separate estate-liquidity layer on you, distinct from the buy/sell mechanism.
>
> Estimated annual aggregate premium: ${premium_estimate}/year, structured as described above.

**Variables:**
- `{entity_name}` = first reference: legal_name with trade in parens; subsequent references: trade name (see `04_voice/08_entity_name_resolution.md`)
- `{primary_owner_first_name}` = derived from FR.2.1.full_legal_name (first name)
- `{co_owner_first_name}` = derived from FR.3.2.owners (the non-primary owner)
- `{primary_owner_pct}` = primary owner's % from FR.3.2
- `{co_owner_pct}` = co-owner's % from FR.3.2
- `{primary_policy_face}` = co_owner_pct × FR.3.5.value_midpoint (the policy primary owner holds covers co-owner's share)
- `{co_owner_policy_face}` = primary_owner_pct × FR.3.5.value_midpoint (the policy co-owner holds covers primary's share — this is the asymmetrically larger one when primary owns the majority)
- `{asymmetric_premium_burden}` = TRUE if primary_owner_pct > 60% (co-owner cannot personally fund the larger policy on the majority owner; bonus-and-loan structure required)
- `{premium_estimate}` = quote-driven; aggregate of both policies

### Sizing computation (worked example with Holloway facts)

For Marcus (88%) and Derek (12%) at $42M business value midpoint:
- {primary_policy_face} = 12% × $42M = **$5.0M** (Marcus owns this policy on Derek; rounds to ~$4.2M-$5M depending on whether sizing pegs to midpoint or buy-out floor; Holloway plan uses $4.2M)
- {co_owner_policy_face} = 88% × $42M = **$36.96M** in theory; in practice the firm typically sizes Derek's policy on Marcus at a starting layer ($5M in the Holloway plan), supplemented by ILIT-owned estate liquidity for the residual exposure
- {asymmetric_premium_burden} = TRUE (88% > 60% threshold)

The Holloway plan resolves the asymmetric-funding problem with: "Premiums funded at the entity level via bonus-and-loan structure to Derek." That language belongs in the plan output when the asymmetric-premium-burden flag fires.
