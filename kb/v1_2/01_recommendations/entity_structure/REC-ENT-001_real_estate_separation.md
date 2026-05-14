# [REC-ENT-001] — Real Estate Separation from Operating LLC

## METADATA
- **ID:** REC-ENT-001
- **Status:** Active
- **Category:** Entity Structure
- **Engagement archetypes:** Pre-Exit, Active-No-Exit
- **Plan section placement:** "Recommendations — Business" → "Entity & Real Estate Structure → Foundational Move"
- **Last verified:** April 2026

---

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.has_business == True
  - FR.3.6.has_real_estate_inside_operating_entity == True
  - FR.3.6.business_real_estate[].held_in matches operating entity legal name
  - Real estate has material value (>$500K)
```

### Natural-language explanation
Move real estate out of the operating entity into a separate LLC (typically owned in same proportions as operating entity, then potentially evolved). Critical pre-transaction move; also enables cost segregation, §469 grouping, and asset protection.

### Hard disqualifiers
- Real estate already separated (verify via FR.3.6 vs. FR.4)
- Mortgage covenants prohibit transfer (resolvable but slows process)

---

## WHAT IT IS

Form a new LLC ("Properties LLC" or similar) and transfer the real estate from the operating entity to the new LLC. Operating entity then leases the real estate from the property LLC at fair-market rent. The real estate exits the asset perimeter of any future buyer of the operating business.

---

## WHY WE RECOMMEND IT

Six concurrent benefits:
1. **Pre-transaction structure** — buyers of the operating business don't want the real estate (different financial-buyer math); separating now removes a transaction-time complication
2. **Cost segregation availability** — separated property entity can elect cost-seg with material year-one depreciation under OBBBA's permanent 100% bonus
3. **§469 grouping** — depreciation can offset operating-business income via grouping election (REC-TAX-007)
4. **Asset protection** — operating-business liabilities don't reach the real estate
5. **Estate-planning structure** — separated property is easier to gift, transfer, decant
6. **Buyer flexibility** — operating business can sell on stock or asset basis without disturbing real estate

For Holloway-style: $4.2M Kennesaw HQ currently inside HIS operating entity → move to new "Holloway Properties LLC."

---

## QUANTIFIED IMPACT FRAMEWORK

### Direct cost: ~$15K-$30K
- Attorney fees for new LLC formation, transfer documents
- Title transfer recording fees
- Lender consent if mortgage exists

### Year-one tax benefit (paired with cost seg + §469 grouping):
- See REC-TAX-006 worked example: ~$500K of year-one federal+state tax savings on $4.2M building

### Transaction premium:
- Properly separated real estate often increases transaction value by reducing buyer friction

---

## IMPLEMENTATION STEPS

1. **Form new LLC** (Holloway Properties LLC or equivalent). Same state as real estate located.
2. **Operating agreement** drafted; typically owned in same proportions as operating entity.
3. **Lender consent** if mortgage exists — most loans permit transfer to common-ownership entity.
4. **Title transfer** via deed; record with county.
5. **Lease agreement** between property LLC and operating entity at FMV rent (defensible market rate).
6. **Update operating agreement** of operating entity to reflect lease arrangement.
7. **Tax structuring** — typically tax-deferred under §721 (contribution to partnership) or §351 (contribution to corporation), depending on entity types involved.
8. **Coordinate with cost-seg study (REC-TAX-006) and §469 grouping (REC-TAX-007)** as next steps.

---

## SEQUENCING DEPENDENCIES

- **Independent of F-Reorg** (REC-ENT-002), but typically done first — real estate separation precedes Holdco formation
- **MUST come BEFORE:** REC-TAX-006 (Cost Segregation Study) and REC-TAX-007 (§469 Grouping)
- **Coordinated WITH:** REC-ENT-006 (Multi-Entity Asset Protection)

---

## DOCUMENTATION CHECKLIST

- [ ] New LLC formation documents
- [ ] Operating agreement
- [ ] Lender consent (if applicable)
- [ ] Deed transfer recorded
- [ ] FMV rent analysis (market comparables)
- [ ] Lease agreement between entities
- [ ] §721 / §351 tax memo
- [ ] Updated insurance reflecting new ownership

---

## COMMON MISTAKES & AUDIT TRIGGERS

- **Below-market rent** — IRS recharacterizes; or operating entity over-deducts
- **Above-market rent** — disguised distribution (S-Corp); attractive to IRS
- **Title transfer without lender consent** — loan acceleration trigger
- **Lapse of insurance during transition**
- **Unclear ownership structure post-transfer** — operating agreement of property LLC must be drafted carefully

---

## COORDINATION NOTES

### PSA Wealth role
Coordinates timing. Tracks completion. Sequences cost-seg and grouping after.

### CPA role
Tax memo (§721/§351). FMV rent analysis. Bookkeeping for lease.

### Attorney role
LLC formation. Deed transfer. Lease drafting. Specialist real estate counsel.

### Lender
Consent if mortgage exists.

### Insurance broker
Update property and liability coverage to reflect new ownership.

---

## CLIENT CONVERSATION FRAMING

> "Step 1 — Real Estate Separation. Move {entity_name}'s ownership of the {property_descriptor} ({square_footage}) into a new entity, "{Client_lastname} Properties, LLC." {Entity_name} will lease the property back at fair-market rent (estimated ${rent_low}–${rent_high}/sf annually based on Cobb County industrial comps). The transfer is structured as a tax-free contribution under §721 (LLC-to-LLC) or §351. This separates the most valuable asset from operating-business liability exposure and enables cost segregation and §469 grouping."

---

## CAVEATS & DISQUALIFIERS

- **Lender approval may be required** — most permit common-ownership transfers
- **State transfer-tax exposure** — Georgia is generally exempt for common-ownership transfers but verify
- **Pre-existing easements / leases** transfer with property
- **Recording delays** can affect 1031 timing if part of broader real estate strategy

---

## REFERENCES

- **IRC §721** — contribution to partnership (tax-deferred)
- **IRC §351** — contribution to corporation (tax-deferred)
- **IRC §1031** — like-kind exchange (if real estate strategy involves)
- **State recording statutes** — state-specific
- **Treas. Reg. §1.469-2(f)(6)** — self-rental rule

---

## PLAN OUTPUT TEMPLATE

> **Separate the real estate.** Form {client_lastname} Properties, LLC ({entity_state}). Transfer the {property_descriptor} from {entity_name} to {client_lastname} Properties, LLC via a properly documented contribution-and-distribution structure that preserves basis. Put a written, market-rate triple-net lease in place between {entity_name} (tenant) and {client_lastname} Properties (landlord). Engage a third-party broker to opine on market rent before execution; the IRS will look at this in any audit.
>
> Estimated professional fees and recording costs: ${cost_low}K–${cost_high}K. Once the property sits in the new entity, two downstream moves become available: cost segregation on the building (REC-TAX-006) and a §469 grouping election (REC-TAX-007) that lets the amplified depreciation offset operating income.

**Variables:**
- `{entity_name}` = first reference: legal name with trade name in parens; subsequent references: trade name (per `04_voice/08_entity_name_resolution.md`)
- `{client_lastname}` = parsed from FR.2.1.full_legal_name
- `{entity_state}` = FR.3.1.state_of_formation
- `{property_descriptor}` = parsed from FR.3.6 (e.g., "Kennesaw HQ / fabrication facility (38,000 sf)")
- `{cost_low}/{cost_high}` = $15-$30 typical for entity formation, transfer documentation, and recording

### Holloway-section reference for depth target

Holloway plan, Section 1, "Separate the real estate" bullet — three sentences specifying:
1. Form the new entity (with state)
2. Transfer mechanism: contribution-and-distribution preserving basis
3. Lease type: triple-net, market-rate, with third-party broker opinion before execution
4. Audit-defense rationale: "the IRS will look at this in any audit"

The expanded template above hits all four. The original template was missing the entity state, the contribution-and-distribution language, the lease type, the broker-opinion process step, and the audit-defense rationale.
