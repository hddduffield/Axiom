# [REC-TAX-012] — Roth Conversion in Low-Income Year

## METADATA
- **ID:** REC-TAX-012
- **Status:** Active
- **Category:** Tax / Retirement
- **Engagement archetypes:** Post-Exit, Pre-Exit (transition years)
- **Last verified:** April 2026

---

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.5.2.has_pretax_ira == True OR FR.5.2.total_retirement > 0 with pre-tax balances
  - At least one identifiable low-income year ahead (transition, gap year, post-transaction)
  - Conversion fits within identifiable bracket-fill capacity
```

### Natural-language explanation
Convert a portion of pre-tax IRA/401(k) balance to Roth in a year where marginal rate is unusually low. Pay ordinary income tax now; future qualified distributions and growth are tax-free.

### Hard disqualifiers
- Client has no pre-tax retirement balance
- Client cannot pay conversion tax with non-IRA cash (defeats the strategy)

---

## WHAT IT IS

Strategic conversion of pre-tax IRA or 401(k) balance to Roth in a year where marginal tax rate is unusually low. The conversion is taxable in the year of conversion; the Roth balance and growth become tax-free thereafter.

---

## WHY WE RECOMMEND IT

A bracket-fill conversion in a low-income year locks in tax savings against future higher-rate distributions or estate inclusion. Particularly valuable in:
- The year between leaving employment and transaction close
- The year after a transaction (when ordinary income is temporarily lower than during operations)
- Multi-year retirement transition windows
- Years with large business losses or NOLs

The strategic objective is bracket arbitrage: pay tax at current low rate; avoid tax at future higher rate (or estate inclusion).

---

## QUANTIFIED IMPACT FRAMEWORK

### Worked example
- Pre-tax 401(k) balance: $1.2M
- Low-income year: AGI $200K (vs. typical $3M)
- Available bracket-fill to top of 24% bracket: ~$200K
- Convert $200K at 24% effective rate vs. future expected ~37%
- Future tax savings on $200K: $200K × (37% – 24%) = $26,000
- Plus tax-free compound growth on the $200K Roth balance

### Range parameters
- `pre_tax_balance` = FR.5.2.total_retirement (pre-tax portion)
- `current_year_marginal_rate` = derived
- `expected_future_marginal_rate` = projected
- `bracket_fill_capacity` = top of target bracket - current AGI

---

## IMPLEMENTATION STEPS

1. Identify the low-income year via transition modeling.
2. CPA computes bracket-fill capacity (don't push into higher bracket without intent).
3. Execute conversion before December 31; pay tax with non-IRA cash if possible (preserves Roth balance).
4. Coordinate with state tax (Georgia conforms; some states don't).
5. Watch IRMAA Medicare premium brackets if client is 63+.

---

## SEQUENCING DEPENDENCIES
- Triggered by income context, not other recommendations.

---

## DOCUMENTATION CHECKLIST
- [ ] Tax projection identifying low-income year
- [ ] Conversion election forms with custodian
- [ ] Form 1099-R reflecting conversion
- [ ] Form 8606 reflecting conversion basis
- [ ] Coordinated estimated payment for conversion tax

---

## COMMON MISTAKES & AUDIT TRIGGERS
- **No recharacterization since 2018** — once converted, the conversion stands. Confirm before executing.
- IRMAA spikes — Medicare Part B/D premiums for two years after high-income year
- State tax conformity issues
- Pro-rata rule for back-door Roth (separate issue)

---

## COORDINATION NOTES

### PSA Wealth role
- Identifies opportunity. Models bracket-fill.

### CPA role
- Tax projection. Coordinates payment of conversion tax.

---

## CLIENT CONVERSATION FRAMING

> "Roth strategy. {Most importantly}, Roth conversion of qualified balances during any low-income year, particularly the year of a transaction (when ordinary income may be temporarily lower than usual)."

---

## CAVEATS & DISQUALIFIERS
- Permanent — no recharacterization
- IRMAA tail
- Coordinate with charitable QCD strategy (REC-CHR-013) for older clients

---

## REFERENCES
- **IRC §408A** — Roth IRA
- **TCJA** — repealed recharacterization
- **Form 8606** — basis tracking

---

## PLAN OUTPUT TEMPLATE

> **Roth conversion of qualified balances during any low-income year.** Most importantly: Roth conversion in {target_year}, particularly the year of a transaction (when ordinary income may be temporarily lower than usual). At {projected_marginal_rate}% in the conversion year vs. expected {future_marginal_rate}% at distribution, conversion of {amount}K of pre-tax balance saves approximately ${tax_savings}K of lifetime federal tax plus the value of tax-free Roth compounding on the converted balance.

**Variables:**
- `{target_year}` = identified low-income year
- `{projected_marginal_rate}` / `{future_marginal_rate}`
- `{amount}` = bracket-fill capacity
