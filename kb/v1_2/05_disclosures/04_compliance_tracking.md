# Compliance Tracking

## COMPLIANCE ID FORMAT

Every plan deliverable receives a unique Compliance ID:

`PSA-YYYY-MMDD-CLIENTNAME-NNN`

- `PSA` — firm prefix
- `YYYY` — year of delivery
- `MMDD` — date of delivery
- `CLIENTNAME` — client last name (uppercase, alphanumeric only)
- `NNN` — sequential plan number for that client (001, 002, ...)

Example: `PSA-2026-0427-HOLLOWAY-001`

## COMPLIANCE ID PLACEMENT

- Cover page
- Footer of every page
- Document properties / metadata
- Internal tracking system

## COMPLIANCE LOG

Maintain internal log of every plan delivered:
- Compliance ID
- Client name
- Plan date
- Plan archetype
- Lead advisor
- Recommendations included
- Recommendations marked landmine (with senior advisor approval ref)
- Volatile rates as-of date used

This log supports:
- FINRA / state regulator records
- Internal audit
- Plan-version tracking
- Recommendation-pattern analysis

## VERSIONING

When plan is updated:
- New Compliance ID with incremented NNN
- "Update" version: brief addendum referencing prior plan
- "Refresh" version: full rewrite (annual)

## RETENTION

Per FINRA / regulatory requirements:
- Plans retained 6+ years (or longer per state)
- Compliance log retained indefinitely
- Backup copies in compliant storage

## SUPERVISORY REVIEW

Plans of certain types require supervisory pre-delivery review:
- First plan for any new client
- Plans involving landmine recommendations (REC-RSK-016, REC-CHR-011)
- Plans involving advanced specialty (REC-RSK-013 PPLI; REC-SPC-002 NING)
- Plans for clients in regulated professions

## OPEN ITEMS FOR FIRM POLICY

- [ ] Define exact NNN sequence rules (per-client annual? cumulative?)
- [ ] Define supervisor review escalation triggers more precisely
- [ ] Define retention period exactly per state and federal requirements
