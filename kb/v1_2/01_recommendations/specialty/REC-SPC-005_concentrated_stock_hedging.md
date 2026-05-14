# [REC-SPC-005] — Concentrated Stock Position Hedging

## METADATA
- **ID:** REC-SPC-005
- **Status:** Advanced
- **Category:** Specialty
- **Engagement archetypes:** Public company concentration
- **Plan section placement:** "Specialty Investment"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - Concentrated public stock > 25% of net worth
  - Restrictions or tax cost prevent immediate sale
  - Risk reduction desired

DISQUALIFY if:
  - Free to sell without material tax cost
  - Position too small
```

### Natural-language explanation
For HNW clients with concentrated public stock — often from acquired company stock or executive equity — hedging via collar (long put + short call) or Variable Prepaid Forward (VPF) reduces price risk without sale and with delayed tax realization.

### Hard disqualifiers
- Position too small
- Free-to-sell available

## WHAT IT IS
**Collar:** Buy put (downside floor) and sell call (gives up upside above strike). Cost-neutral if structured. Reduces price risk without sale.

**Variable Prepaid Forward (VPF):** Stock pledged for cash now in exchange for variable share delivery in 1-3 years. Effectively cash conversion without immediate sale.

Both: tax deferral; risk reduction; must avoid §1259 constructive sale.

## WHY WE RECOMMEND IT (rare)
Specialty tool for specific concentration situations. Sophisticated counterparty access required.

## QUANTIFIED IMPACT FRAMEWORK
- Risk reduction (lock floor / convert to cash)
- Tax deferral on otherwise-immediate gain
- Hedge cost
- §1259 constructive sale must be avoided

## IMPLEMENTATION STEPS
1. Position analysis
2. Counterparty (major investment bank)
3. Structure design (collar vs VPF)
4. Execute
5. Monitor and unwind

## SEQUENCING DEPENDENCIES
- COORDINATED WITH: REC-INV-006, REC-INV-007

## DOCUMENTATION CHECKLIST
- [ ] Position analysis
- [ ] Counterparty agreement
- [ ] §1259 constructive sale analysis
- [ ] Tax reporting

## COMMON MISTAKES
- §1259 constructive sale violation (collar too tight)
- Counterparty risk
- High structure cost

## COORDINATION NOTES
- PSA: strategy
- Investment bank: counterparty
- CPA: §1259 analysis

## CLIENT CONVERSATION FRAMING
> "For concentrated public stock, hedging structures (collars, VPFs) reduce risk and defer tax without immediate sale. Specialist work; counterparty matters; §1259 rules narrow acceptable structures."

## CAVEATS & DISQUALIFIERS
- §1259 narrow corridor
- Counterparty risk
- High cost
- Specialist only

## REFERENCES
- IRC §1259
- Treas. Reg. §1.1259-1

## PLAN OUTPUT TEMPLATE

> **Hedge concentrated public stock.** {Position_description}. Engage major investment bank for {collar | VPF} structure; specialist counsel for §1259 analysis. Reduces concentration risk without immediate tax realization.
