// Auth route group layout — pass-through.
//
// Phase 9.2: sign-in moved to a full-bleed two-pane (PSA navy left,
// Axiom ivory right) per Claude Design's `sp-classic` variant. Wrapping
// the children in a centered card breaks that layout, so this layout
// renders <>{children}</> only. Future auth surfaces (sign-out
// confirmation, password reset if v1.5 ever needs it) self-style.
export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
