# [REC-RSK-004] — Estate Liquidity Life Insurance

## METADATA
- **ID:** REC-RSK-004
- **Status:** Active
- **Category:** Risk & Insurance
- **Engagement archetypes:** All HNW with estate-tax exposure
- **Plan section placement:** "Estate Planning" → "Liquidity Planning"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.has_high_net_worth == True (FR.5.total_net_worth > $5M)
  - FR.9.2.has_estate_tax_exposure == True OR projected exposure given growth
  - Insured(s) insurable
  - REC-EST-004 (ILIT) in place or planned (life insurance should generally be ILIT-owned for HNW)
```

### Natural-language explanation
For families whose estate exceeds the $15M/$30M federal exemption (or future exemption levels), federal estate tax of 40% becomes due 9 months after death. Without liquidity, heirs may face forced sales of illiquid assets — operating businesses, real estate, art collections — at distressed prices. Life insurance owned by an ILIT provides on-demand liquidity to pay estate tax without dragging assets out of the estate at fire-sale prices.

### Hard disqualifiers
- Insured uninsurable
- Estate clearly under exemption (no exposure to plan for)
- Existing coverage materially exceeds projected exposure

## WHAT IT IS
Life insurance, generally permanent (whole life or guaranteed UL), owned by an ILIT (NOT the insured personally — see REC-EST-004). On death, the ILIT receives the death benefit free of estate tax (because policy not in insured's estate per §2042) and free of income tax (per §101). Trustee uses the proceeds to lend to or buy assets from the estate at FMV — providing liquidity without bringing the proceeds into the estate.

## WHY WE RECOMMEND IT
Estate tax is due in cash 9 months after death. For Holloway-type clients (illiquid business plus real estate, projected $15M+ tax exposure), the alternatives without insurance are:
1. Distress sale of operating business (often at 30-50% discount)
2. §6166 deferral (limited; complicates buyer search if business is sold)
3. Sale of personal residence or other assets
None of these are good. Insurance funded properly avoids the choice entirely.

## VARIATIONS
- **Single-life:** policy on one insured (usually primary owner); proceeds at first death
- **Survivorship (second-to-die / SUL):** policy on both spouses; proceeds at SECOND death (when estate tax is actually due, given marital deduction); cheaper than two single-life policies; the standard for couples
- **Joint-life first-to-die:** rare; pays at first death of either insured
- **Term insurance:** generally inappropriate for permanent estate-liquidity need; only used for short-term transition coverage

## QUANTIFIED IMPACT FRAMEWORK

### Components
- Death benefit (tax-free under §101)
- Outside estate (under §2042 if ILIT-owned with proper structure)
- Provides "instant liquidity" at exactly the moment estate tax is due

### Worked example (Holloway-style)
Estate projected at $50M at second death (Marcus 88 / Catherine 85). Federal exemption: $15M each = $30M used (assuming portability). Taxable: $20M × 40% = $8M federal estate tax due 9 months after second death. State: GA has no estate tax.

Survivorship UL with $10M face, owned by existing ILIT, at current rates (Marcus age 52, Catherine age 50, both healthy):
- Annual premium: ~$80K-$120K
- Funded for life via Crummey gifts to ILIT
- On 2nd death: ILIT receives $10M tax-free; lends to estate to pay $8M tax; remaining $2M+ stays in ILIT for grandchildren
- Net to family: avoided $8M of forced asset sales at 30%+ discount = ~$2.4M of preserved family wealth, plus $2M+ retained in ILIT

## IMPLEMENTATION STEPS
1. **Project estate-tax exposure** at first and second death given current/expected growth
2. **Establish or confirm ILIT** (see REC-EST-004) — life insurance held in ILIT, not personally
3. **Underwriting** — health questionnaires, paramed exam, financial documentation; survivorship policies require both spouses qualifiable
4. **Product selection** — survivorship UL standard; whole life for higher cash-value premium tolerance; consider participating dividends for flexibility
5. **Premium funding via ILIT Crummey notices** — annual exclusion gifts ($19K × multiple beneficiaries) cover most premiums tax-free
6. **Annual review** — estate projection update, coverage adequacy, premium status

## SEQUENCING DEPENDENCIES
- **SEQUENCED WITH:** REC-EST-004 (ILIT formation) — ILIT and the estate-liquidity life insurance live in the same workplan; ILIT is established as the policyowner from inception
- **COORDINATED WITH:** REC-EST-003 (annual exclusion gifting) — Crummey gifts fund premiums
- **MUTUALLY EXCLUSIVE WITH:** none

## DOCUMENTATION CHECKLIST
- [ ] Estate-tax projection memo
- [ ] ILIT funded and operating with Crummey notice protocol
- [ ] Policy issued, ILIT as owner and beneficiary
- [ ] First-year Crummey notices documented
- [ ] Premium payment from ILIT (not insured personally)

## COMMON MISTAKES
- **3-year lookback (§2035):** if existing personally-owned policy is transferred to ILIT and insured dies within 3 years, proceeds INCLUDED in estate. New policies issued directly to ILIT avoid this; transfers do not.
- **Premium payment from wrong account:** if insured pays premium directly, possible §2042 incidents-of-ownership argument
- **Inadequate Crummey administration:** notices missed → contributions don't qualify for annual exclusion → use of lifetime exemption
- **Stale projection:** estate growth outpaces coverage; gap reopens

## COORDINATION NOTES
- **PSA Wealth:** projection modeling, product selection, ILIT/Crummey workflow
- **CPA:** assist with projection; review ILIT income returns (grantor or non-grantor)
- **Attorney:** ILIT drafting/maintenance; Crummey notice template; trustee guidance

## CLIENT CONVERSATION FRAMING
> "When you and {spouse} are gone, the IRS sends a bill for {projected_tax}M, and it's due 9 months later. The question is whether your heirs pay it from cash they have or from selling pieces of what you built — at the worst possible time. {projected_face}M of survivorship insurance, owned by your ILIT, costs about ${annual_premium}/year, funded with annual gifts to the trust that don't use any of your lifetime exemption. The proceeds arrive tax-free, the trust lends to the estate, and the operating business or real estate doesn't need to be sold under pressure."

## CAVEATS & DISQUALIFIERS
- Both insureds must be insurable for survivorship; if one isn't, falls back to single-life on the qualifying spouse
- Premium commitment is real and long-term — modeling cash flow burden over 30-40 years
- Estate-tax law could change again (it has changed in roughly every administration); coverage may become unnecessary if exemption rises further or family wealth migrates outside estate

## REFERENCES
- IRC §101(a) — death benefit tax-free
- IRC §2042 — incidents of ownership; basis for ILIT structure
- IRC §2035 — 3-year inclusion for transferred policies
- IRC §2503(b) — annual exclusion (used to fund premiums via Crummey)
- See `02_reference/01_federal_estate_gift_gst.md` for full mechanics

## PLAN OUTPUT TEMPLATE

> **Fund estate-tax liquidity via the ILIT.** Your projected estate at second death is approximately ${projected_estate}M; after federal exemption (currently $30M for the two of you), the taxable amount is approximately ${taxable}M, generating federal estate tax of approximately ${tax_due}M due 9 months after the second death. Without liquidity, your heirs face forced sales — typically at 30%+ discount — of {operating_business OR real_estate OR concentrated_assets}.
>
> **Structure:** Survivorship universal life policy, ${face}M face amount, owned by {ILIT_name}. Premium approximately ${annual_premium}/year, funded through annual Crummey gifts to the trust (using your annual exclusion, not lifetime exemption). On second death, the ILIT receives the proceeds tax-free, lends to the estate to pay tax, and retains the remainder for grandchildren.
