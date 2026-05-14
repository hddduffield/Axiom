# [REC-SUC-009] — ESOP Evaluation (§1042 Rollover)

## METADATA
- **ID:** REC-SUC-009
- **Status:** Advanced
- **Category:** Succession & Retention / Tax
- **Engagement archetypes:** Pre-Exit (specific eligibility)
- **Plan section placement:** "Pre-Transaction" → "Alternative Structures"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - C-Corporation (S-Corp ESOPs cannot use §1042)
  - Owner held shares 3+ years
  - Owner sells 30%+ of company stock to ESOP
  - Owner age 50+ typically
  - Workforce of size to support ESOP economics
  - Owner willing to reinvest proceeds in qualified replacement property (QRP) — domestic operating company stock or bonds — and hold for life

DISQUALIFY if:
  - S-Corp or LLC (no §1042 — different ESOP path possible but no rollover)
  - Owner lacks 3-year holding
  - Owner unwilling to lock proceeds in QRP
  - Workforce too small or too high-income to support ESOP design
```

### Natural-language explanation
ESOP (Employee Stock Ownership Plan) is a qualified retirement plan that holds employer stock for employees' benefit. §1042 lets a selling owner of a C-Corp roll over proceeds tax-free into qualified replacement property (US operating company stock or bonds) and defer (potentially eliminate) capital gains permanently — gain triggered only when QRP sold (or stepped up at death).

### Hard disqualifiers
- Wrong entity type
- Owner unwilling to live with QRP discipline
- Workforce composition fails ESOP economics

## WHAT IT IS
Owner sells C-Corp stock to a newly-formed ESOP at appraised FMV. ESOP financed by the corporation (corporate debt) and/or seller note. Owner receives proceeds tax-free if reinvested in QRP within 12 months (§1042). QRP must be held for life to avoid recognition; at death, basis steps up — capital gains potentially eliminated permanently.

ESOP holds the stock for the benefit of employees; allocates over time per qualified plan rules.

## WHY WE RECOMMEND IT (when triggered)
For C-Corp owners, §1042 ESOP can defer / permanently avoid capital gains tax (~23.8% federal + state) on transaction proceeds. ESOP itself is tax-favored (S-Corp ESOPs are often fully federally tax-exempt at the entity level — different mechanic). Major decision: alternative to traditional sale.

## VARIATIONS
- **Standalone §1042 ESOP:** C-Corp; owner sells; gets §1042; ESOP becomes owner
- **S-Corp ESOP (no §1042 but operating tax-free):** different value proposition
- **Leveraged ESOP:** corporate debt funds the purchase; cash to seller; debt amortizes from operating cash flow
- **100% ESOP-owned S-Corp:** entire entity owned by ESOP; pays no federal tax on operations (S-Corp passes through to ESOP, ESOP is tax-exempt)

## QUANTIFIED IMPACT FRAMEWORK

### Components
- Capital gains tax deferred or eliminated at sale
- QRP reinvestment requirement (lock proceeds in operating company stock or bonds)
- Step-up at death potentially eliminates gain entirely
- ESOP's contribution to corporate culture and employee retention

### Worked example
$30M C-Corp owner, basis $1M, sells to leveraged ESOP at $30M:
- Without §1042: Gain $29M × 23.8% = $6.9M federal tax + state
- With §1042: $0 tax at sale; reinvest $30M proceeds in QRP
- Hold QRP to death: stepped-up basis; tax permanently eliminated
- Catch: QRP must be 50%+ US operating company stock; bonds also qualify; can NOT be in mutual funds or ETFs

## IMPLEMENTATION STEPS
1. Feasibility analysis — entity type, workforce, valuation
2. Valuation by ESOP-specialist appraiser (different from M&A appraisal)
3. ESOP plan document drafted by ERISA counsel
4. Trustee selected (institutional or director-trustee)
5. Financing arranged (corporate debt + seller note typical)
6. §1042 election filed
7. Reinvest proceeds in QRP within 12 months
8. Annual ESOP administration

## SEQUENCING DEPENDENCIES
- **MUST come BEFORE:** any traditional sale (mutually exclusive transaction paths)
- **COORDINATED WITH:** REC-ENT-005 (C-Corp conversion if currently S-Corp/LLC and considering ESOP route)

## DOCUMENTATION CHECKLIST
- [ ] Feasibility study
- [ ] ESOP-specialist valuation
- [ ] ESOP plan document
- [ ] Trustee engagement
- [ ] Financing agreements
- [ ] §1042 election filed timely
- [ ] QRP investments documented
- [ ] Annual ESOP administration

## COMMON MISTAKES
- Failing §1042 12-month QRP reinvestment window
- QRP that isn't qualifying (mutual funds, REITs don't count)
- ESOP overpayment (ERISA fiduciary issue; trustee must defend value paid)
- Workforce dynamics underestimated (ESOP creates expectations)

## COORDINATION NOTES
- **PSA Wealth:** strategy and ongoing relationship; QRP investment management
- **CPA:** §1042 election; tax modeling; basis tracking
- **Attorney:** ERISA specialist; plan document; transaction docs
- **ESOP appraiser:** specialist
- **ESOP trustee:** typically institutional
- **Banker:** transaction financing

## CLIENT CONVERSATION FRAMING
> "ESOP with §1042 rollover is a different transaction path: you sell to your employees (via the ESOP), defer the capital gain by reinvesting in qualifying US stocks and bonds, and potentially eliminate the gain entirely if held to death. The trade-off: complex, lengthy, and the ESOP must pay a defensible price (no premium for strategic buyer). For C-Corps with sympathetic workforce dynamics and owners willing to live with QRP discipline, it can save $5M-$10M+ in tax on a $30M transaction. Specialist counsel and feasibility analysis required first."

## CAVEATS & DISQUALIFIERS
- Long path; 12-18 months to closing
- Specialist counsel and trustee required
- ERISA fiduciary risk (trustee must defend value paid)
- QRP discipline restricts post-transaction investment freedom
- Smaller workforce reduces ESOP economics

## REFERENCES
- IRC §1042 — Sales of stock to employee stock ownership plans or eligible worker-owned cooperatives
- IRC §401(a) — qualified plan
- IRC §4975 — prohibited transactions (ESOP exception)
- IRC §409 — additional ESOP rules

## PLAN OUTPUT TEMPLATE

> **Evaluate ESOP transaction with §1042 rollover.** As a C-Corp owner with {ownership_history} years of ownership, you are eligible for §1042 — selling 30%+ of stock to an Employee Stock Ownership Plan with capital gains tax deferred (potentially permanently eliminated) by reinvestment in qualified replacement property (US operating company stock or bonds) within 12 months.
>
> **Trade-offs:** ESOP transaction is complex (12-18 months), requires ESOP-specialist valuation (typically lower than strategic-buyer multiples), and locks reinvestment in QRP. For C-Corp owners with sympathetic workforce and willingness to live with QRP discipline, tax savings of $${tax_savings} are achievable on the projected transaction value.
>
> **Decision point:** feasibility study with ERISA specialist before committing to this path. Mutually exclusive with traditional M&A sale.
