# [REC-INV-003] — Direct Indexing in Taxable Account

## METADATA
- **ID:** REC-INV-003
- **Status:** Active
- **Category:** Investment
- **Engagement archetypes:** All HNW with taxable balances
- **Plan section placement:** "Recommendations — Personal Investment"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - Taxable brokerage balance > $1M
  - Owner in 32% or higher federal bracket
  - Holding period > 5 years (need time for harvesting compounding)
  - Existing positions: index funds or single-stock concentration that could benefit from optimization

DISQUALIFY if:
  - Taxable balance < $250K (uneconomic at small scale; standard ETFs preferable)
  - Highly concentrated single-stock position requiring different strategy (REC-SPC-005 hedging)
```

### Natural-language explanation
Direct indexing replicates an index by holding the individual constituent stocks rather than an index fund. Loss-harvesting at the individual-security level generates ~50-100bps/year of tax alpha (after-tax return enhancement) for clients in high brackets. Available through SMA platforms (Aperio, Parametric, BlackRock SMA, Wealthfront, etc.).

### Hard disqualifiers
- Account too small for cost-effective implementation
- Strategy holding period too short

## WHAT IT IS
SMA managed to track an index (S&P 500, Russell 1000, MSCI ACWI, etc.) through ownership of individual stocks. Manager systematically harvests losses by selling positions in the red and replacing with similar-but-not-identical positions (avoiding wash sale rule). Realized losses offset other gains; over time, generates "tax alpha" of 50-100bps annually for HNW investors.

## WHY WE RECOMMEND IT
For Holloway-style: $5M-$10M of post-exit taxable assets, 35-40% combined federal+NIIT+state on gains. Direct indexing's tax alpha at 75bps on $5M = $37,500/year of tax savings, compounding over decades. Also enables ESG screening, single-stock-restriction (don't buy your previous employer), and multi-factor tilts.

## VARIATIONS
- **Pure index replication:** straight S&P 500 or similar
- **ESG / values-screened:** exclude specific companies/industries
- **Factor-tilted:** value, momentum, quality, low-vol overlays
- **Concentrated-position complement:** designed to complement existing concentration (don't double-up on tech if already holding company stock)

## QUANTIFIED IMPACT FRAMEWORK

### Components
- Tax alpha (50-100 bps/year typical)
- Compounded over horizon
- Loss banking (carryforward of unused losses)

### Worked example
$5M direct-indexed S&P 500 portfolio, 7% return, 75bps tax alpha:
- Pre-tax return: $350K/year
- Tax alpha: $37,500/year
- Over 20 years: $750K of cumulative tax savings (undiscounted)

## IMPLEMENTATION STEPS
1. Confirm taxable balance and tax-bracket fit
2. Choose SMA platform (PSA's preferred provider via MML SMA or specialty manager)
3. Define index, screening, and tilt preferences
4. Migrate from index funds (gradually if material gains) or fund with cash
5. Quarterly review of harvested losses and overall positioning
6. Annual rebalance and tax-loss summary

## SEQUENCING DEPENDENCIES
- **COORDINATED WITH:** REC-INV-007 (tax-loss harvesting), REC-INV-004 (asset location)

## DOCUMENTATION CHECKLIST
- [ ] Platform selected
- [ ] Investment Policy Statement
- [ ] Funding approach (cash vs. transition from existing)
- [ ] Tax-loss reporting integration with CPA

## COMMON MISTAKES
- Wash-sale violations across accounts (same security in retirement account harvesting in taxable triggers)
- Migration from existing positions creating large gain
- Forgetting to integrate losses with overall tax planning

## COORDINATION NOTES
- **PSA Wealth:** strategy and platform; ongoing oversight
- **CPA:** tax reporting integration; multi-account wash-sale awareness
- **SMA manager:** execution

## CLIENT CONVERSATION FRAMING
> "Direct indexing replicates the S&P 500 (or whichever index) by holding the actual stocks rather than an index fund. The manager systematically realizes losses on positions in the red, replacing with similar holdings to maintain index exposure. Realized losses offset other gains. Net benefit: about 50-100 basis points of additional after-tax return per year — for you that's roughly ${annual_benefit}/year on the $${taxable_balance} balance. Compounds over time."

## CAVEATS & DISQUALIFIERS
- Wash sale rules: 30-day window across all accounts
- Tax alpha is correlated with market volatility (more harvesting opportunities in volatile years)
- Some platforms have minimum account sizes ($250K-$1M typical)

## REFERENCES
- IRC §1091 — wash sale rule
- IRC §1211 — capital loss limit ($3K against ordinary; carry forward)
- SMA platform documentation

## PLAN OUTPUT TEMPLATE

> **Move taxable equity exposure to a direct-indexed structure.** Current taxable balance approximately $${taxable_balance}; in {current_holdings — typically index ETFs or mutual funds}. Direct indexing through {platform_name} replaces with individual stocks tracking the same index, enabling systematic loss harvesting. Expected tax alpha: 50-100 basis points annually = approximately ${annual_benefit}/year of additional after-tax return. Compounds meaningfully over your investment horizon.
