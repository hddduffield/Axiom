"use client";

// Top-nav link strip — Client Component so we can detect the active
// route via usePathname() and underline the matching tab. The full nav
// bar (brand + right cluster) is otherwise rendered server-side in the
// app layout; this island only owns the link row in the middle.

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS: Array<{ href: string; label: string; matches: (p: string) => boolean }> = [
  {
    href: "/dashboard",
    label: "Dashboard",
    matches: (p) => p === "/dashboard",
  },
  {
    href: "/clients",
    label: "Clients",
    matches: (p) => p === "/clients" || p.startsWith("/clients/"),
  },
  {
    href: "/action-items",
    label: "Action items",
    matches: (p) => p.startsWith("/action-items"),
  },
  {
    href: "/notes",
    label: "Notes",
    matches: (p) => p === "/notes" || p.startsWith("/notes/"),
  },
  {
    href: "/plans/generate",
    label: "Plans",
    // Active for any /plans/* route except client-attached subpaths.
    matches: (p) => p.startsWith("/plans"),
  },
];

export function TopNavLinks() {
  const pathname = usePathname() ?? "";
  return (
    <nav
      className="flex items-stretch"
      aria-label="Primary"
    >
      {ITEMS.map((i) => {
        const active = i.matches(pathname);
        return (
          <Link
            key={i.href}
            href={i.href}
            className="flex items-center px-3.5 text-[13px] transition-colors"
            style={{
              color: active ? "#ffffff" : "rgba(255,255,255,0.78)",
              borderBottom: `2px solid ${active ? "var(--gold)" : "transparent"}`,
              marginBottom: -1,
              fontWeight: active ? 500 : 400,
              letterSpacing: "-0.005em",
              whiteSpace: "nowrap",
            }}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
