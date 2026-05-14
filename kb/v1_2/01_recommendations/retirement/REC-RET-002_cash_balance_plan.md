# [REC-RET-002] — Cash-Balance Plan Layered on 401(k)

## METADATA
- **ID:** REC-RET-002
- **Status:** Active
- **Category:** Retirement
- **Engagement archetypes:** Pre-Exit, Active-No-Exit
- **Plan section placement:** "Recommendations — Retirement & Benefits"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.has_business == True
  - At least one owner age 45+
  - Stable / predictable business cash flow ($300K+ owner taxable income consistently)
  - 401(k) deferral already maxed (REC-RET-001)
  - FR.10.has_cash_balance == False
  - Owner intends to maintain plan for at least 3-5 years (cash balance plans need durability)

DISQUALIFY if:
  - Volatile cash flow (cash balance has annual minimum funding)
  - Owner age < 40 (deduction power scales with age — younger owners get less)
  - Imminent transaction (cash balance plan termination is messy near a sale)
  - Many non-owner employees with no profit-sharing margin (cash balance + employee carry-along may be uneconomic)
```

### Natural-language explanation
A cash balance plan is a defined-benefit plan that defines benefits as a hypothetical account balance for each participant. For owner-clients age 45+ with consistent cash flow, cash balance can support $150K-$300K+/year of additional tax-deductible retirement contribution beyond the 401(k) — driven by §415(b) actuarial mechanics. Particularly powerful for older owners (the deduction "compresses" higher contributions into fewer years).

### Hard disqualifiers
- Cash flow cannot sustain annual minimum funding obligation
- Imminent business sale (3-year window or less)
- Workforce composition makes employee allocation uneconomic

## WHAT IT IS
A defined-benefit pension plan styled to look like a defined-contribution plan. Each participant has a hypothetical account that grows annually by:
- "Pay credit" (employer contribution percentage of compensation)
- "Interest credit" (typically 4-5%)
- Final benefit at termination = accumulated balance, paid as lump sum or annuity

Owners can be allocated very high pay credits (driven by §415(b) maximum benefit math), generating deductions of $150K-$300K+/year on top of 401(k). Non-owner employees receive a smaller allocation that satisfies non-discrimination testing.

## WHY WE RECOMMEND IT
For owner-clients with consistent profit and tax burden:
- Defers $150K-$300K of taxable income annually
- ~$60K-$110K of current-year tax savings at 37% marginal rate
- Compounds tax-deferred for decades
- Can be terminated and rolled over at retirement / sale
- Total tax-favored retirement contribution potential of $250K-$400K+/year combined with 401(k)

## VARIATIONS
- **Standalone cash balance:** alone, without 401(k) — simpler but loses deferral layer
- **Combo plan (401(k) + cash balance):** standard structure; 401(k) for younger and lower-paid; cash balance for owners; passes nondiscrimination via cross-testing
- **Frozen cash balance:** plan stops accruing benefits but continues to invest assets; used when cash flow becomes constrained

## QUANTIFIED IMPACT FRAMEWORK

### Components
- Pay credit × compensation = annual deduction for owner
- Pay credit allocation for non-owner employees (cost of structure)
- Tax savings at marginal rate
- Tax-deferred growth on plan assets

### Worked example (owner age 52, $360K compensation cap)
- Cash balance plan with owner pay credit at $200K/year
- Combined deductions:
  - 401(k) deferral: $24,500 + $8,000 catch-up = $32,500
  - Profit sharing layer (cross-tested): ~$30,000
  - Cash balance pay credit: ~$200,000
  - Combined: ~$262,500 in deductible retirement contributions
- Tax savings: ~$97,000 at 37%
- Non-owner employee cost: typically 5-7.5% of payroll for cross-tested eligibility (e.g., $30K-$40K/year for a $500K payroll)
- Net economic benefit to owner: ~$50K-$70K/year

## IMPLEMENTATION STEPS
1. **Engage actuarial firm** to design plan; not all TPAs handle cash balance — need DB specialist
2. **Workforce analysis** — identify non-owner employees, project cost of compliance allocations
3. **Design parameters** — pay credit %, interest credit basis, vesting schedule, normal retirement age
4. **Plan document drafting** with ERISA counsel
5. **IRS determination letter (optional but recommended)** for first plan year
6. **Annual actuarial valuation** — required; sets minimum funding
7. **Annual administration** — Form 5500, PBGC premium (if applicable), participant notices
8. **Annual contribution funding** by entity tax filing deadline

## SEQUENCING DEPENDENCIES
- **SEQUENCED WITH:** REC-RET-001 (max 401(k) first — cheaper deduction layer; both part of same retirement-stack workplan)
- **COORDINATED WITH:** REC-RET-003 (profit-sharing layer — included as cross-tested with cash balance)
- **MUTUALLY EXCLUSIVE WITH:** REC-RET-009 (DB termination) — cash balance is a form of DB

## DOCUMENTATION CHECKLIST
- [ ] Plan document executed
- [ ] IRS determination letter (if pursued)
- [ ] Actuarial valuation report annually
- [ ] Form 5500 filed annually
- [ ] PBGC Comprehensive Premium filed (if PBGC-covered)
- [ ] Participant SPD distributed
- [ ] Annual funding notice
- [ ] Investment Policy Statement

## COMMON MISTAKES
- Volatile cash flow → missed minimum funding → IRS penalties
- Plan design not coordinated with workforce — forced to over-fund employees to pass nondiscrimination
- TPA not actuary — cash balance requires actuarial support
- Forgetting PBGC premium (small plans often exempt; verify)
- Plan termination not properly executed (excess assets revert at 50% reversion tax)

## COORDINATION NOTES
- **PSA Wealth:** plan design coordination with TPA, participant communication, investment management
- **CPA:** confirm deduction; coordinate with corporate tax filing
- **TPA / Actuary:** annual valuation, Form 5500, participant notices
- **Attorney:** plan document, ERISA compliance, termination if needed
- **Plan investment manager:** could be PSA via separate engagement

## CLIENT CONVERSATION FRAMING
> "Beyond the 401(k), a cash-balance plan lets you put another ${cb_amount}/year into tax-deferred retirement at your age and income level. Total combined retirement deductions reach ~$${combined_total}. Tax savings: about $${tax_savings}/year. The trade-off: minimum annual funding required (so cash flow needs to be reliable), and you have to provide some allocation to your employees (~${employee_cost}/year). Plan needs to run at least 3-5 years to be worth setting up. Done correctly, this is the largest single tax-deferral move available to you outside of business sale."

## CAVEATS & DISQUALIFIERS
- Annual minimum funding is mandatory; missing it has penalty consequences
- Plan termination at retirement or sale must be carefully executed
- Investment returns affect funding requirements (deviation from interest credit basis can trigger over- or under-funding)
- Employee allocations are unavoidable for legitimate plan

## REFERENCES
- IRC §415(b) — DB benefit limit ($290K for 2026)
- IRC §401(a)(17) — comp limit ($360K for 2026)
- IRC §401(a)(4) — nondiscrimination
- ERISA §302 — minimum funding
- Treas. Reg. §1.401(a)(4)-8 — cross-testing
- IRS guidance on cash balance plan design

## PLAN OUTPUT TEMPLATE

> **Layer a cash-balance plan on top of the 401(k).** At age {owner_age} and your current compensation/profit profile, a cash-balance plan supports approximately $${cb_pay_credit}/year of additional tax-deductible retirement contribution. Combined with maxed 401(k) deferrals and profit-sharing layer, total annual tax-deferred retirement saving is approximately $${combined_total}. Annual tax savings at your marginal rate: approximately $${tax_savings}.
>
> **Mechanics:** Defined-benefit plan with hypothetical account balances per participant; owner gets large pay credit; employees get smaller allocation that satisfies nondiscrimination testing. Annual employee cost for compliance is approximately $${employee_cost}.
>
> **Structural commitments:** annual minimum funding mandatory; plan must run at least 3-5 years to justify setup cost; termination process required at retirement or business sale. Engage [TPA/actuary] for design; PSA coordinates investment management.
