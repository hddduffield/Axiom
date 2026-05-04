import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopNavRight } from "./_layout/TopNavRight";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/clients", label: "Clients" },
  { href: "/action-items", label: "Action Items" },
  { href: "/notes", label: "Notes" },
];

// Authenticated app shell. Loads the current advisor server-side so the
// top-nav right cluster (avatar + sign-out) can render without a flash.
// proxy.ts already gates this route group on session + active-advisor;
// the redirect below is a defensive belt-and-suspenders.
export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: advisor } = await supabase
    .from("advisors")
    .select("id, email, first_name, last_name")
    .eq("id", user.id)
    .maybeSingle();
  if (!advisor) redirect("/sign-in?error=not_authorized");

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
          <div className="ml-auto">
            <TopNavRight
              advisor={{
                first_name: advisor.first_name,
                last_name: advisor.last_name,
                email: advisor.email,
              }}
            />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        {children}
      </main>
    </div>
  );
}
