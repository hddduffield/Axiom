# [REC-TAX-011] — Multi-State Tax Planning Module

## METADATA
- **ID:** REC-TAX-011
- **Status:** Advanced
- **Category:** Tax
- **Engagement archetypes:** All when multi-state nexus exists
- **Last verified:** April 2026

---

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ANY:
  - FR.3.1.geographic_markets includes states beyond FR.2.1.state_of_residence
  - FR.5.3 includes real estate in different state than residence
  - Owner contemplating change of residence to lower-tax state
  - Trust planning where situs choice matters (REC-SPC-001 trigger)
  - Income-tax owner with nexus in multiple states
```

### Natural-language explanation
Coordinate tax planning across multiple states where client has nexus, residence, or potential change-of-residence. Address apportionment, state-specific PTET interactions, residency definitions, trust situs.

### Hard disqualifiers
- Single-state operations and residence with no plan to change

---

## WHAT IT IS

A coordinated analysis covering: (1) state nexus rules in each state of business operation; (2) state-specific PTET interactions for multi-state pass-through entities; (3) residency rules for owners contemplating change of state; (4) trust situs decisions for irrevocable trusts; (5) state estate-tax exposure if any state of nexus has it.

---

## WHY WE RECOMMEND IT

Multi-state HNW planning has many interacting moving parts that single-state planning ignores. Common issues: (1) double taxation when multiple states claim residency; (2) PTET that helps in one state and is neutral in another; (3) trust income taxed by grantor's state, beneficiary's state, AND trust situs state; (4) post-residency-change tail issues (some states pursue former residents for years).

For Holloway-style clients with only Georgia residence and Georgia/Southeast operations, this is a low-priority module. For clients with NY/CA/MA residence considering Florida/Texas/Tennessee relocation, it is the entire engagement.

---

## QUANTIFIED IMPACT FRAMEWORK

Highly fact-specific. Examples:
- NY-resident owner relocates to FL: ~10.9% NY income tax saved on go-forward income (state + city), but tail issues for several years
- Trust situs to no-income-tax state: state income tax on trust earnings reduced
- PTET coordination across states: avoids double-counting

---

## IMPLEMENTATION STEPS

1. Inventory all states of nexus.
2. Per-state analysis: PTET, conformity, estate tax, residency rules.
3. Identify optimization opportunities (residency change, trust situs, PTET stacking).
4. Coordinate with state-experienced CPA.
5. Document the planning trail (audit defense).

---

## SEQUENCING DEPENDENCIES
- Coordinated WITH REC-SPC-001 (Multi-State Trust Situs)
- Independent of estate planning (but interacts)

---

## DOCUMENTATION CHECKLIST
- [ ] Per-state nexus analysis
- [ ] PTET analysis per state
- [ ] Residency-change documentation if applicable (intent to relocate, physical presence days, financial ties)
- [ ] State return filings as required

---

## COMMON MISTAKES & AUDIT TRIGGERS
- Claimed change of residency without supporting facts (states aggressively pursue this)
- Failure to file final-year return in old state
- Continuing physical presence triggering nexus in old state

---

## COORDINATION NOTES

### PSA Wealth role
- Coordinates with state-experienced specialty CPA. Tracks compliance across states.

### CPA role
- State filings. Apportionment calculations. Residency analysis.

### Attorney role
- Trust situs documents. Residency-change documentation.

---

## CLIENT CONVERSATION FRAMING

> "We'll model the multi-state implications of your operations and any contemplated residency changes. The planning here can be substantial, but it requires specialist coordination across states."

---

## CAVEATS & DISQUALIFIERS
- State law changes frequently; analysis must be refreshed periodically
- Some states have aggressive nexus pursuit — coordinate carefully

---

## REFERENCES
- State revenue codes (per state)
- Multistate Tax Compact provisions
- State-specific PTET statutes

---

## PLAN OUTPUT TEMPLATE

> **Multi-state tax coordination.** With operations or interests in {state_list}, your tax planning involves apportionment and per-state optimization across {N} jurisdictions. We coordinate with a state-experienced specialty CPA to ensure clean compliance and capture optimization opportunities such as PTET stacking, residency analysis, and trust situs decisions.

**Variables:**
- `{state_list}` = states from FR.3.1.geographic_markets and FR.5.3
- `{N}` = count
