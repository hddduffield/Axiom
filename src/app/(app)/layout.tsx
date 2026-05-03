import Link from "next/link";

// Authenticated app shell. Skeleton nav so all five protected routes are
// reachable for verification. Real session-aware nav (advisor avatar, sign
// out, active-route highlight) lands in Step 2.
const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/clients", label: "Clients" },
  { href: "/action-items", label: "Action Items" },
  { href: "/notes", label: "Notes" },
];

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-6">
          <Link href="/dashboard" className="font-semibold tracking-tight">
            Axiom
          </Link>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        {children}
      </main>
    </div>
  );
}
