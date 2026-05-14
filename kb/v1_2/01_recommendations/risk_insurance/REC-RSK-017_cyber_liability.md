# [REC-RSK-017] — Cyber Liability Coverage

## METADATA
- **ID:** REC-RSK-017
- **Status:** Active
- **Category:** Risk & Insurance
- **Engagement archetypes:** Pre-Exit, Active-No-Exit
- **Plan section placement:** "Recommendations — Business" → "Risk & Continuity"
- **Last verified:** April 2026

## TRIGGERING CONDITIONS

### Structured logic
```
TRIGGER if ALL of:
  - FR.has_business == True
  - Business handles customer data, financial records, or PII at any scale
  - FR.7.4.cyber == None OR existing coverage materially below typical breach cost (~$200K-$500K minimum baseline)

DISQUALIFY if:
  - Truly minimal data handling (cash-only, no customer information)
  - Existing coverage adequate
```

### Natural-language explanation
Cyber liability protects against breach response costs (notification, credit monitoring, regulatory response, legal defense) and third-party liability (lawsuits from data subjects). Standard GL policies generally exclude cyber. Even small businesses face six-figure breach response costs.

### Hard disqualifiers
- Already adequately covered

## WHAT IT IS
Specialty insurance covering:
- **First-party costs:** breach response, notification, credit monitoring, forensics, public relations, business interruption
- **Third-party liability:** lawsuits from breach victims, regulatory fines (where insurable), defense costs
- **Cyber extortion / ransomware:** payment and response
- **Social engineering:** wire fraud and similar

## WHY WE RECOMMEND IT
A breach affecting even a few hundred customer records typically costs $200K-$500K in response activities — even before any litigation. Without cyber coverage, this comes out of operating capital. Coverage is generally inexpensive ($2K-$10K/year for $1M-$2M of coverage at small business scale).

## QUANTIFIED IMPACT FRAMEWORK

### Components
- Breach response cost coverage
- Third-party liability coverage  
- Business interruption from cyber events
- Ransomware response/payment

### Worked example
Construction business handling 200 customer records, payroll for 50 employees:
- Breach scenario: $300K-$500K typical response cost (notification, credit monitoring 2 years, forensics, legal)
- Annual premium for $1M-$2M cyber coverage: $3K-$6K
- ROI obvious

## IMPLEMENTATION STEPS
1. Inventory data exposure (customer PII, employee PII, financial records, IP)
2. Quote cyber coverage at appropriate limits ($1M-$5M typical for SMB)
3. Verify coverage triggers (some policies have specific exclusions)
4. Coordinate with IT for incident response coordination
5. Annual review

## SEQUENCING DEPENDENCIES
- **COORDINATED WITH:** REC-RSK-018 (D&O), REC-RSK-008 (umbrella)

## DOCUMENTATION CHECKLIST
- [ ] Cyber policy in force
- [ ] Coverage limits documented
- [ ] Incident response plan documented
- [ ] Annual renewal review

## COMMON MISTAKES
- Assuming GL covers cyber — it doesn't
- Choosing limits too low for actual exposure
- Failing to coordinate with IT incident response
- Missing required application disclosures (carriers may deny if inaccurate)

## COORDINATION NOTES
- **PSA Wealth:** flags need; refers to broker
- **Broker:** specialty placement
- **IT:** incident response coordination

## CLIENT CONVERSATION FRAMING
> "Even a small breach affecting your customer or employee data costs $300K-$500K to respond to — notification, credit monitoring, forensics, legal. Your GL doesn't cover this. ${cyber_premium}/year for ${cyber_limit} of cyber coverage closes the gap."

## CAVEATS & DISQUALIFIERS
- Cyber market evolving rapidly; renewal pricing and terms can change
- Some policies exclude ransomware payments — verify
- Application accuracy matters; misrepresentation can void coverage

## REFERENCES
- Carrier underwriting standards
- State data breach notification statutes (varies by state)

## PLAN OUTPUT TEMPLATE

> **Add cyber liability coverage.** {Business_name} handles {data_description}. A breach response — even for a small incident — typically costs $300K-$500K. Standard general liability does not cover this. We recommend $${cyber_limit} of cyber liability at approximately ${cyber_premium}/year. Coordinate with your P&C broker for placement and with your IT provider for incident response protocols.
