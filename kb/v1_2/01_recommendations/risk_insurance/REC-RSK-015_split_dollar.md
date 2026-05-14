# [REC-RSK-015] — Split-Dollar Life Insurance (Loan Regime)

## METADATA
- **ID:** REC-RSK-015
- **Status:** Advanced
- **Category:** Risk & Insurance / Executive Benefits
- **Engagement archetypes:** Pre-Exit, Family-Office
- **Plan section placement:** "Recommendations — Business" → "Executive Benefits / Wealth Transfer"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.has_business == True
  - Owner or executive needs permanent life insurance
  - Business has cash flow to lend (or capital to allocate)
  - Long-term planning horizon (10+ years for split-dollar economics)
  - Use case: family wealth transfer (owner) OR executive retention (key exec)

DISQUALIFY if:
  - Below "loan regime" thresholds (other split-dollar regimes have IRS scrutiny)
  - Short planning horizon
  - Insured uninsurable
```

### Natural-language explanation
Split-dollar is an arrangement where two parties (typically employer and employee, or business and owner) split premium payments and policy proceeds. Under the "loan regime" (post-2003 regulations), business "loans" premium to insured at AFR; insured repays from policy or other source at agreed event. The policy provides life insurance protection, and the lender's loan plus interest is repaid from death proceeds or loan repayment.

### Hard disqualifiers
- Cash-flow inability to fund loans
- Failure to charge AFR on the loan (deemed gift)

## WHAT IT IS
Loan-regime split-dollar:
- **Step 1:** Business lends premium to insured (or insured's ILIT) at AFR
- **Step 2:** Insured (or ILIT) uses loan proceeds to pay policy premium
- **Step 3:** Loan accrues interest at AFR (interest paid annually or accrued)
- **Step 4:** At triggering event (death of insured), business is repaid (loan + accrued interest) from death proceeds; remainder to ILIT/family
- **Step 5:** During life, loan can be repaid via policy cash value access if structured for it

Effect: family gets permanent insurance funded by business cash flow, with the business eventually reimbursed; estate/gift tax minimized because the structure is debt, not gift.

## WHY WE RECOMMEND IT (when triggered)
For owner-clients with significant insurance need (estate liquidity, family wealth transfer), split-dollar can fund coverage with business dollars without gift-tax cost. Loan repaid at death; family receives net death benefit.

## VARIATIONS
- **Loan Regime (post-2003):** the modern standard
- **Endorsement Method:** business owns policy; endorses death benefit portion to insured; less common now
- **Economic Benefit Regime:** business pays premium; insured taxed on "economic benefit" of coverage; mostly displaced by loan regime
- **Private Split-Dollar:** family-to-family loan regime (between trusts or family members) — non-business context

## QUANTIFIED IMPACT FRAMEWORK

### Components
- Permanent life insurance funded with business dollars
- AFR loan rate (lower than commercial debt) preserves family value transfer
- Eventual death benefit to family minus loan repayment
- Avoided gift tax on premium payments

### Worked example
Owner age 55, $5M permanent life insurance, $50K annual premium for 10 years ($500K cumulative):
- Business loans $50K/year for 10 years to ILIT at AFR
- ILIT pays premium with loan proceeds
- AFR (illustrative): 4.5% mid-term
- After 10 years, business has loaned $500K; accrued interest at AFR ~$135K
- Total business receivable: ~$635K
- At owner's death (assume year 30): policy pays $5M; business receives $635K + ongoing-accrued interest; family receives ~$3.5M-$4M+ depending on timing
- Compare: outright premium gifts of $500K consume lifetime exemption; split-dollar avoids exemption use

## IMPLEMENTATION STEPS
1. Engage specialist counsel — split-dollar is technical
2. Establish ILIT to own policy (typical structure)
3. Document loan agreements with business as lender, ILIT as borrower
4. Use AFR appropriate to loan term (mid-term for term loans, demand-loan rates for demand loans)
5. Annual interest documentation (paid or accrued)
6. Annual policy review
7. Pre-funded exit strategy (loan repayment at termination of arrangement, retirement, sale)

## SEQUENCING DEPENDENCIES
- **COORDINATED WITH:** REC-EST-004 (ILIT)
- **COORDINATED WITH:** REC-RSK-014 (alternative §79 carve-out)

## DOCUMENTATION CHECKLIST
- [ ] Split-dollar agreement (loan regime documentation)
- [ ] AFR documented for each loan; updated as new premiums lent
- [ ] Annual interest accrual or payment recorded
- [ ] ILIT (if used) properly funded and operating
- [ ] Annual policy statement review

## COMMON MISTAKES
- Below-market loan: any rate below AFR creates imputed gift; entire structure compromised
- Failing to document loan as debt (no demand note, no maturity, no interest = doesn't look like real debt; IRS recharacterizes)
- Ignoring exit strategy: loan must eventually be repaid; without plan, "loan" looks like sham
- Confusing loan regime with economic benefit regime (different tax mechanics)

## COORDINATION NOTES
- **PSA Wealth:** structuring with specialist counsel; ongoing administration
- **CPA:** annual interest documentation; debt-vs-gift treatment
- **Attorney:** specialist split-dollar counsel — generalist work creates audit risk
- **Other:** ILIT trustee

## CLIENT CONVERSATION FRAMING
> "Split-dollar lets the business fund a permanent life insurance policy on you for your family's benefit, treating each year's premium as a loan from the business to your ILIT at the IRS interest rate (AFR). At your death, the loan is repaid from the death benefit; your family gets the rest. The advantage: no gift-tax cost on the premium dollars; the business's capital is preserved (it gets repaid); your family gets meaningful death benefit. The complexity is real and requires specialist drafting."

## CAVEATS & DISQUALIFIERS
- Specialist counsel mandatory — generalist execution invites IRS recharacterization
- Loans must be real debt with documented intent and ability to repay
- AFR fluctuates monthly; new lending uses then-current rate
- Exit strategy must be pre-planned

## REFERENCES
- Treas. Reg. §1.7872-15 (split-dollar regulations, 2003)
- Treas. Reg. §1.61-22 (split-dollar arrangements)
- IRC §7872 — below-market loan rules
- IRC §1274 — AFR

## PLAN OUTPUT TEMPLATE

> **Use loan-regime split-dollar to fund {face_amount} of permanent life insurance.** The business lends premium to {owner's} ILIT at the applicable federal rate (AFR); the ILIT pays policy premiums; the loan + accrued interest is eventually repaid from the policy at the owner's death. Family receives net death benefit; business is reimbursed; no gift-tax cost on premium dollars.
>
> **Mechanics:** business lends approximately ${annual_premium}/year for {funding_years} years; AFR currently {current_AFR}%; specialist counsel drafts the split-dollar agreement and loan documents. Exit strategy: loan repayment at owner death; alternative: termination at retirement with refinancing.
