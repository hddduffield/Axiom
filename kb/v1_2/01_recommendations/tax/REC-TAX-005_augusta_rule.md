# [REC-TAX-005] — Augusta Rule (§280A(g))

## METADATA
- **ID:** REC-TAX-005
- **Status:** Active-Cautioned (audit-prone if poorly documented)
- **Category:** Tax
- **Engagement archetypes:** Pre-Exit, Post-Exit, Active-No-Exit
- **Plan section placement:** "Tax Strategy → 3A. Implement This Year"
- **Last verified:** April 2026

---

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.has_business == True
  - FR.5.3.personal_real_estate has at least one residence (primary or secondary)
  - Business has legitimate need for off-site meeting space
  - FR.is_high_income == True

DISQUALIFY if:
  - Personal-services SSTB business where strategy is more aggressively scrutinized
  - Family unwilling to maintain 14-day discipline and documentation
  - No defensible market rate exists in local area
```

### Natural-language explanation
Under IRC §280A(g), rent your personal residence to your business for up to 14 days per year. Business deducts the rent; homeowner receives it tax-free.

### Hard disqualifiers
- 15th day breaks the entire-year exclusion — strict 14-day cap
- Documentation cannot survive audit (no agendas, no attendees, no minutes)
- Rate is materially above defensible market for comparable space

---

## WHAT IT IS

IRC §280A(g) ("the Augusta Rule" — named for the Masters tournament context where Augusta homeowners rent residences during tournament week tax-free) allows the rental of a personal residence for fewer than 15 days per year with rent received tax-free to homeowner. Business pays the rent and deducts it as a business expense.

---

## WHY WE RECOMMEND IT

Defensible $1,500/day for 14 days = $21,000 of business deduction and $21,000 of tax-free personal income. Net federal benefit at 37% bracket: ~$7,800 annually. Small but real, easy to implement once documentation is in place.

The rule has a hard 14-day limit — day 15 makes the entire year's rent taxable to the homeowner. This is the single biggest pitfall. The firm's house position: never recommend going to 14 days — recommend 12, leaving margin against accidental over-use.

---

## VARIATIONS AND STRUCTURAL OPTIONS

### Variation A — Quarterly board meetings
Four quarterly all-day board meetings at the home. Most defensible pattern: clearly-purposed business meetings with real attendees and minutes.

### Variation B — Strategic offsites
Two-day strategic planning offsites, twice a year. 4 days total. Higher per-day rate justifiable for full-day commercial-equivalent.

### Variation C — Customer entertainment events
Customer dinners and events at the home, treated as off-site corporate events. Documented attendees and business purpose.

### Variation D — Combination
Mix of the above. Total ≤14 days. Different per-day rates justified by event type (full-day strategic offsite at $2,500/day; dinner event at $1,000/event).

---

## QUANTIFIED IMPACT FRAMEWORK

### Worked numerical example
- 12 days at $1,500/day = $18,000 rental income (homeowner) / business deduction (business)
- Business federal deduction at 37% (federal) + 5.19% (GA) = ~$7,584 of tax savings
- Homeowner: $0 tax (under §280A(g) exclusion)
- **Net benefit: ~$7,584/year**

### Range parameters
- `defensible_daily_rate` = comparable corporate event-space rates in client's market
- `days_used` = recommend 10–12, never 14
- `federal_marginal_rate` × `state_rate` = combined deduction value

---

## IMPLEMENTATION STEPS

1. **Obtain 2–3 written quotes** from local event venues for comparable space (defensibility — establishes market rate).
2. **Set the rate** based on quote median; document methodology in writing.
3. **Calendar the meetings.** Real meetings, real agendas, real attendees.
4. **For each rental day, document:** agenda, attendees, business purpose, meeting minutes, photos if applicable.
5. **Issue rental invoice** from homeowner to business; business pays from operating account.
6. **CPA reports business deduction** as rent on appropriate schedule. Homeowner does NOT report rental income (§280A(g) exclusion).
7. **Track day count rigorously** — no exceptions, no fuzzy counting.

---

## SEQUENCING DEPENDENCIES

- Independent.

---

## DOCUMENTATION CHECKLIST

- [ ] Market-rate analysis (2–3 written quotes from comparable venues)
- [ ] Written rental agreement between homeowner and business
- [ ] Per-day documentation: agenda, attendees, business purpose, meeting minutes
- [ ] Rental invoices and corresponding business payments
- [ ] Day-count log
- [ ] Business deduction recorded; homeowner NOT reporting income

---

## COMMON MISTAKES & AUDIT TRIGGERS

- **Day 15** — voids §280A(g) for the entire year. Strict.
- **Aggressive rates** — $5,000/day for a single-family home in a non-resort market is audit-bait
- **Documentation that arrives only on audit** — forensic recreation of meeting minutes is not credible
- **Family-only "meetings"** — must have business purpose; "family business strategy session" with no third parties is weak
- **Same date used for non-business event** — "rented for a customer dinner" while personal records show family birthday party — fatal
- **Issuing 1099 to homeowner** — debated; some practitioners do, some don't. The IRS has not taken a clear position. The firm's house position: do NOT issue a 1099 for §280A(g) rentals; the income is excluded by statute.

---

## COORDINATION NOTES

### PSA Wealth role
- Frames the strategy with appropriate caution. Provides documentation template.

### CPA role
- Confirms business deduction on entity return. Confirms homeowner is NOT reporting income.

---

## CLIENT CONVERSATION FRAMING

> "Augusta Rule — Section 280A(g) of the tax code. Rent your East Cobb residence to {entity_name} for legitimate business meetings (board meetings, partner offsites, customer entertainment) for up to 14 days per year. At a defensible rate of $1,500/day, that's $21,000 of business deduction and $21,000 of tax-free personal income. We recommend 10–12 days, not 14, to leave margin against accidental over-use. Documentation matters — meeting minutes, agendas, attendees. We provide the framework."

---

## CAVEATS & DISQUALIFIERS

- **The 14-day limit is absolute.** Day 15 voids §280A(g) for the entire year.
- **Documentation is the entire defense.** Without minutes/agenda/attendees, the deduction is fragile.
- **Audit-target signal** — overuse or aggressive rates draw scrutiny.
- **Coordinate with home office deduction** — if homeowner also takes home office deduction, allocations become complex; coordinate with CPA.

---

## REFERENCES

- **IRC §280A(g)** — residence rental exception
- **IRC §280A(a)** — general disallowance of residence-related deductions
- **Sinopoli v. Commissioner, T.C. Memo 2023-105** — Tax Court case where §280A(g) was challenged; IRS lost on documentation grounds when taxpayer had real meetings, but court emphasized documentation requirements

---

## PLAN OUTPUT TEMPLATE

> **Augusta Rule (§280A(g)).** Rent your {primary_residence_descriptor} to {entity_name} for legitimate business meetings (board meetings, partner offsites, customer entertainment) for up to 14 days per year. At a defensible rate of ${suggested_rate}/day, that is ${total_amount} of business deduction and ${total_amount} of tax-free personal income. Documentation matters — meeting minutes, agendas, attendees.

**Variables:**
- `{primary_residence_descriptor}` = parsed from FR.5.3 (e.g., "East Cobb residence")
- `{entity_name}` = FR.3.1.legal_name or trade name
- `{suggested_rate}` = defensible daily rate based on market quotes
- `{total_amount}` = rate × days (recommend 10–12 days, not 14)
