# [REC-TAX-008] — §1202 QSBS Evaluation & Structuring

## METADATA
- **ID:** REC-TAX-008
- **Status:** Advanced (substantially expanded by OBBBA — verified April 2026)
- **Category:** Tax / Entity Structure
- **Engagement archetypes:** Pre-Exit, Pre-Liquidity-Founder
- **Plan section placement:** "Tax Strategy → 3C. Long-Term Considerations"
- **Last verified:** April 2026

---

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - At least ONE of (Holdco / F-reorg path satisfied):
      - FR.4.has_holdco == True
      - REC-ENT-002 also triggers in this same plan (SEQUENCED WITH)
  - At least 3 years to anticipated transaction (preferably 5+ for full 100% exclusion)
  - Aggregate gross assets at C-Corp formation < $75M (post-OBBBA threshold)
  - Business is NOT in excluded SSTB categories (health, law, accounting, financial services, etc.)
  - Owner willing to accept C-Corp ongoing tax treatment in exchange for §1202 path

DISQUALIFY if:
  - Transaction window < 3 years (insufficient hold for any §1202 benefit)
  - Business is on SSTB exclusion list (no qualification possible)
  - C-Corp ongoing tax drag exceeds projected §1202 benefit
  - Owner has firm preference against C-Corp structure
```

### Natural-language explanation
Convert (or contribute) operating business into a C-Corp structure post-F-reorg; hold the resulting QSBS for 3+ years (50% exclusion), 4+ years (75%), or 5+ years (100%); on sale, exclude up to $15M (or 10× basis, whichever greater) of gain per shareholder per issuer under the OBBBA-expanded §1202 rules.

### Hard disqualifiers
- SSTB business: health, law, accounting, actuarial, performing arts, consulting, athletics, financial services, brokerage, investing/investment management, trading, dealing in securities/commodities, businesses where the principal asset is reputation or skill of employees/owners
- Aggregate gross assets at issuance > $75M (OBBBA threshold for post-7/4/25 stock)
- Transaction would be asset deal — only stock sales generally qualify

---

## WHAT IT IS

§1202 of the Internal Revenue Code provides a federal income tax exclusion on the sale of "Qualified Small Business Stock." Under OBBBA (P.L. 119-21, signed July 4, 2025), the rules were dramatically expanded for stock issued after July 4, 2025:

**Tiered holding period:**
- 3+ years: 50% exclusion
- 4+ years: 75% exclusion
- 5+ years: 100% exclusion

**Per-issuer exclusion cap:** greater of $15 million or 10× adjusted basis (was $10M pre-OBBBA)

**Aggregate gross asset cap:** $75M at issuance (was $50M pre-OBBBA)

For QSBS issued on or before July 4, 2025: original rules apply (5-year hold for 100%, $10M / 10× basis cap, $50M asset cap).

**Note:** unexcluded gain (50% remaining at 3-year hold, 25% at 4-year) is taxed at 28% LTCG rate plus 3.8% NIIT — not the standard 15%/20% rates.

---

## WHY WE RECOMMEND IT

When the math works and timing aligns, §1202 is among the most powerful tax provisions in the code. Post-OBBBA, $15M+ of fully tax-excluded gain per shareholder per qualified issuer is achievable. With multiple qualifying shareholders (spouse, trusts), the exclusion can be multiplied. With the 10× basis alternative, businesses with material early investment can exclude far more.

For a typical PSA pre-exit business owner: if the business is currently $20M valued and expected to grow to $50M+ by exit, a C-Corp restructuring at this stage that establishes QSBS for the post-conversion appreciation can exclude up to $15M per shareholder of that growth from federal capital gains. **At 23.8% top federal LTCG + NIIT, that's ~$3.6M of tax saved per shareholder.** Multiplied across spouse and trusts, far more.

---

## VARIATIONS AND STRUCTURAL OPTIONS

### Variation A — C-Corp Holdco from F-Reorg Inception
Holdco formed as C-Corp from start; operating sub becomes QSub or LLC subsidiary. Stock issued at Holdco formation is QSBS (assuming gross-asset test passes).

**Pros:** Cleanest §1202 path; full appreciation post-conversion qualifies.
**Cons:** Loss of pass-through treatment for Holdco from start; current dividends taxed twice.
**When:** When the §1202 benefit clearly exceeds C-Corp drag for the entire pre-exit period.

### Variation B — Convert Existing S-Corp to C-Corp Mid-Stream
Existing S-Corp Holdco converts to C-Corp via revocation of S-election. Newly issued shares from the conversion qualify as QSBS for value at conversion; embedded gain (built-in gain on appreciated assets) is preserved and taxable on disposition under built-in-gains (BIG) tax rules for 5 years post-conversion.

**Pros:** Preserves S-Corp treatment until the right moment.
**Cons:** Embedded gain doesn't qualify for §1202; BIG tax exposure for 5 years post-conversion.
**When:** When transaction window is 5+ years and pre-conversion value is small relative to expected post-conversion appreciation.

### Variation C — §1202 Multiplication via Gifting
Transfer QSBS to children's trusts, spouse, or other family members. Each transferee gets their own per-shareholder exclusion cap. With careful structuring, a single $30M sale can yield $30M+ of combined exclusions across family members.

**Cons:** Requires planned gifting timing and structure; appraisal-driven; coordination with estate planning.
**When:** Critical for HNW families pursuing §1202 — the multiplication is where the largest benefits accrue.

### Variation D — §1045 Rollover (When Hold Falls Short)
If QSBS held > 6 months but < 3 years (or whatever tier client wants to hit), proceeds can be rolled into new QSBS within 60 days, with original holding period tacking. Useful when an opportunistic exit comes early.

---

## QUANTIFIED IMPACT FRAMEWORK

### Worked numerical example
**Holloway-style:** $20M business at C-Corp conversion (post-F-reorg), expected to grow to $50M by exit. 5-year hold from conversion to sale.

- Per-shareholder exclusion cap (OBBBA, post-7/4/25 issuance): **$15M or 10× basis**
- Marcus's basis in newly-issued QSBS at C-Corp conversion: $20M × 88% = $17.6M
- 10× basis: $176M (large because basis equal to FMV at issuance is high)
- $15M cap binds (since $15M < $176M)
- Sale at $50M × 88% = $44M Marcus's share
- Gain: $44M – $17.6M basis = $26.4M
- 100% exclusion at 5-year hold: up to $15M excluded
- Excluded: $15M; remaining gain $11.4M taxed at standard LTCG 23.8% = $2.71M
- **Federal tax saved by §1202: $15M × 23.8% = $3.57M**

**With §1202 multiplication via SLAT to spouse:**
- Pre-conversion gift of half to SLAT, each spouse claims their own $15M cap
- Combined exclusion: up to $30M (subject to 10× basis math at trust level)
- **Additional federal tax saved: ~$3.6M**

**With further multiplication via children's trusts:**
- Three additional $15M caps possible (one per qualifying trust)
- Total combined exclusion: potentially $30M – $75M+ depending on structure
- Tax savings scale linearly

### Range parameters
- `transaction_value_estimate` = future expected exit value
- `c_corp_conversion_basis` = value at conversion (sets 10× basis comparison)
- `years_to_exit` = drives 50% / 75% / 100% tier selection
- `qualifying_shareholders` = primary owner + spouse + N qualifying trusts → multiplier

---

## IMPLEMENTATION STEPS

1. **Eligibility analysis:** business size, SSTB status, asset composition, ownership pattern.
2. **Structural choice:** Variation A (C-Corp from start) vs B (convert mid-stream) vs C (multiplication strategy).
3. **C-Corp formation or conversion:** legal structure documented; QSBS attributes captured at issuance.
4. **Document QSBS qualification at issuance:** Active business test, 80% of assets in qualified trade or business, not SSTB, gross asset cap not breached.
5. **Maintain QSBS attributes through hold period:** continuous active business, no redemptions that would taint, ownership tracked per shareholder.
6. **Monitor 10×-basis alternative:** if gross assets grow significantly post-issuance, the 10× basis cap may exceed $15M cap; gain modeling reflects which binds.
7. **Structure transaction as stock sale:** asset sales generally don't qualify; if buyer prefers asset, §338(h)(10)-like considerations may apply.
8. **Coordinate with multiplication strategy:** transfers to family trusts must occur with careful timing and appraisal.

---

## SEQUENCING DEPENDENCIES

- **SEQUENCED WITH:** REC-ENT-002 (F-Reorganization to Holdco)
- **SEQUENCED WITH:** REC-ENT-005 (C-Corp Conversion for §1202)
- **COORDINATED WITH:** REC-EST-006/008 (GRAT / IDGT) for multiplication strategy
- **MUTUALLY EXCLUSIVE WITH:** Maintaining S-Corp pass-through treatment as the goal (different optimization)

---

## DOCUMENTATION CHECKLIST

- [ ] §1202 qualification analysis at issuance: active business test, gross asset test, SSTB analysis
- [ ] Stock issuance documentation (stock certificates, board resolutions)
- [ ] Annual confirmation of continued QSBS status (active business; no taint events)
- [ ] Per-shareholder basis tracking
- [ ] Holding period tracking
- [ ] Pre-disposition tax memo confirming QSBS treatment at sale

---

## COMMON MISTAKES & AUDIT TRIGGERS

- **SSTB blind spot** — many businesses have substantial service components; analyze rigorously
- **Asset composition drift** — passive investments creeping above 20% of assets disqualifies
- **Redemption events that taint** — corporate buybacks within 4 years before or 2 years after issuance can disqualify all stock issued in that window
- **Failure to obtain QSBS qualification at issuance** — relies on documentation; weak documentation leads to challenge at sale
- **Asset deal structuring** — buyer demands asset deal; QSBS benefit lost without §338(h)(10)-like structure that preserves stock-deal treatment

---

## COORDINATION NOTES

### PSA Wealth role
- Long-horizon strategy framing. Coordinates with attorney and CPA on structural decisions. Models trade-offs.

### CPA role
- Structural tax memo. Annual QSBS qualification confirmation. Pre-sale tax modeling.

### Attorney role
- C-Corp formation or conversion documents. Stock issuance documentation. Transaction-structure negotiation in M&A context.

---

## CLIENT CONVERSATION FRAMING

> "F-reorganization and §1202 evaluation. Once the holdco structure is in place, an F-reorganization to a C-Corp under the holdco can — in some circumstances — open §1202 Qualified Small Business Stock treatment for newly issued shares. Under the One Big Beautiful Bill Act, the 5-year holding period for full 100% exclusion is preserved, but new tiered exclusions are available at 3 years (50%) and 4 years (75%). The exclusion cap was raised from $10M to $15M per shareholder, with the 10× basis alternative still available. The holding period applies only to value created after the conversion, not embedded gain. This is highly fact-specific and depends on the timing of any future transaction; worth a focused analysis in year two if the transaction window stretches."

---

## CAVEATS & DISQUALIFIERS

- **Highly fact-specific.** Do not include in plan output as a recommendation without case-specific analysis.
- **SSTB exclusion** disqualifies many service businesses
- **C-Corp ongoing tax drag** (~21% federal entity-level on profits) often offsets §1202 benefit unless transaction is large
- **State conformity heavily varies:** Alabama, California, Mississippi, New Jersey, Pennsylvania do NOT conform; **Georgia conformity [VERIFY 2026]**
- **OBBBA only applies to stock issued after July 4, 2025** — pre-existing QSBS still subject to original rules

---

## REFERENCES

- **IRC §1202** — QSBS gain exclusion (as amended by OBBBA P.L. 119-21)
- **IRC §1045** — rollover into new QSBS
- **IRC §1244** — small business stock losses (different provision; sometimes confused)
- **OBBBA P.L. 119-21** (July 4, 2025) — expanded §1202
- **IRS Notice 2026-XX** — anticipated guidance on OBBBA §1202 changes

---

## PLAN OUTPUT TEMPLATE

> **F-reorganization and §1202 evaluation.** Once the holdco structure is in place, an F-reorganization to a C-Corp under the holdco can — in some circumstances — open §1202 Qualified Small Business Stock treatment for newly issued shares. Under OBBBA's expanded rules, the holding period for partial exclusion has been reduced (3 yrs / 50%, 4 yrs / 75%, 5 yrs / 100%), and the per-shareholder exclusion cap raised to $15M (or 10× basis). The exclusion would apply only to value created after the conversion, not embedded gain. This is highly fact-specific and depends on the timing of any future transaction; worth a focused analysis in {evaluation_year} if the transaction window stretches.

**Variables:**
- `{evaluation_year}` = year 2 of engagement, or earlier if transaction window unusually long
