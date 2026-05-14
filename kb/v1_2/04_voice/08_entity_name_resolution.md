# Entity Name Resolution

## Convention

When a Plan Output Template references the client's primary business entity via the `{entity_name}` variable, the generator resolves the variable using the following rule:

### First reference in plan
Use the **legal name** with the **trade name in parentheses**:
> "Holloway Industrial Solutions, LLC ('HIS')"

This establishes the formal identity and the shorthand used thereafter.

### Subsequent references in plan
Use the **trade name** alone:
> "HIS"

If no trade name exists in the fact review (`FR.3.1.common_trade_name` is empty), use the legal name throughout.

## Variable resolution at generator time

```
{entity_name} resolves as follows:
  - If first occurrence in the plan AND FR.3.1.common_trade_name exists:
      → "{FR.3.1.legal_name} ('{FR.3.1.common_trade_name}')"
  - If subsequent occurrence AND FR.3.1.common_trade_name exists:
      → "{FR.3.1.common_trade_name}"
  - If FR.3.1.common_trade_name is empty:
      → "{FR.3.1.legal_name}" (always)
```

The generator tracks first-vs-subsequent occurrence at the plan level (one expansion per generated plan), not per recommendation.

## Holloway example

- Legal name: Holloway Industrial Solutions, LLC
- Trade name: HIS
- First reference in plan: "Holloway Industrial Solutions, LLC ('HIS')"
- All subsequent references: "HIS"

This matches the Holloway plan exemplar's voice exactly.

## Property entities and other derived names

When a plan references a derived entity name (e.g., the new property entity `{client_lastname} Properties, LLC`):

- First reference: the full constructed name ("Holloway Properties, LLC")
- Subsequent: shortened ("Holloway Properties")

Apply the same first-vs-subsequent treatment.

## Edge cases

- **Multiple operating entities:** if the client has more than one operating entity, treat each independently. Each gets its own first-mention legal+trade introduction the first time it appears.
- **Trust entities:** trust names (e.g., "Holloway Family ILIT", "Marcus James Holloway 2026 GRAT") are typically used as constructed; no shorthand convention.
- **Holdco names:** for entities created in the plan (Holdco, Properties LLC, etc.), use the constructed name pattern: "{client_lastname} Holdings" / "{client_lastname} Properties, LLC".

## Why this matters

The Holloway plan uses "HIS" throughout — not "Holloway Industrial Solutions, LLC" repeatedly. This is professional voice convention. The KB's pre-fix templates hardcoded `FR.3.1.legal_name`, which would produce repetitive, formal-feeling output. The trade-name-after-first-reference rule fixes this and matches the firm's actual writing pattern.
