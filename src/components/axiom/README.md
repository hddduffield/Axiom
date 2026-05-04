# Axiom-specific components

Compositions and visual primitives that reflect Axiom's brand and product
shape — pieces that don't fit cleanly inside shadcn's generic UI library.

These show up during Phase 9 polish conversion. When a Claude Design HTML
reference introduces a recurring pattern (e.g., a "Plan section header"
with a specific layout, a "Status pill" with custom semantics, an
"Advisor avatar group"), it lives here rather than being inlined in
each page.

## Naming

- File names are PascalCase matching the export: `PlanSectionHeader.tsx`,
  `StatusPill.tsx`, `AdvisorAvatarGroup.tsx`.
- One component per file unless they're tightly coupled (e.g., a Card +
  CardHeader pair).
- Default to Server Components; mark `"use client"` only when the
  component needs hooks or event handlers.

## When to add to `axiom/` vs `ui/`

- **`ui/`** — generic shadcn primitives (Button, Card, Dialog). Driven
  by the shadcn CLI. Don't hand-edit unless replacing a stale primitive.
- **`axiom/`** — Axiom-specific compositions, often built from `ui/`
  primitives + extra structure / styling. Hand-written.

If a `axiom/` component would just re-export a shadcn primitive with no
modification, prefer importing the primitive directly.
