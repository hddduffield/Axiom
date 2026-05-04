// Authenticated app shell — converts Claude Design's `Topbar` from
// components.jsx (lines 60-80) + styles.css §Topbar (lines 184-260).
//
// Layout split:
//   - Navy topbar (sticky, full-bleed): brand mark + wordmark text on
//     the left (separator), nav link strip in the middle (Client island
//     for active-route detection), search placeholder + avatar
//     dropdown on the right.
//   - Main content stays inside a max-w-6xl container so the existing
//     pages don't need re-flowing.
//
// Brand: `public/psa-mark.webp` filtered to white + "PSA Wealth"
// wordmark in display font. The full lockup at `public/psa-wealth-logo.webp`
// is reserved for full-width contexts (e.g. signin variant).
//
// proxy.ts already gates this route group on session + active-advisor;
// the redirect below is defense in depth.

import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { TopNavLinks } from "./_layout/TopNavLinks";
import { TopNavRight } from "./_layout/TopNavRight";

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
      <header
        className="sticky top-0 z-50 flex h-14 items-stretch gap-6 border-b px-4"
        style={{
          background: "var(--psa-navy-deep)",
          borderBottomColor: "var(--psa-navy-deep)",
        }}
      >
        {/* Brand */}
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 pr-5"
          style={{
            borderRight: "1px solid rgba(255,255,255,0.12)",
            color: "#fff",
          }}
        >
          <Image
            src="/psa-mark.webp"
            alt=""
            width={26}
            height={26}
            priority
            style={{
              objectFit: "contain",
              filter: "brightness(0) invert(1)",
            }}
          />
          <span
            className="text-[15px]"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 500,
              letterSpacing: "-0.01em",
              color: "#fff",
            }}
          >
            PSA Wealth
          </span>
        </Link>

        {/* Primary nav (Client island for active-route highlight) */}
        <TopNavLinks />

        {/* Right cluster */}
        <div className="ml-auto flex items-center gap-2">
          <div
            className="hidden h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs md:flex"
            style={{
              background: "rgba(255,255,255,0.07)",
              borderColor: "rgba(255,255,255,0.10)",
              color: "rgba(255,255,255,0.6)",
              minWidth: 220,
            }}
          >
            <Search className="h-3 w-3" />
            <span className="truncate">Search clients, items…</span>
            <kbd
              className="ml-auto rounded px-1 text-[10px]"
              style={{
                background: "rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.6)",
                fontFamily: "var(--font-mono)",
              }}
            >
              ⌘K
            </kbd>
          </div>
          <TopNavRight
            advisor={{
              first_name: advisor.first_name,
              last_name: advisor.last_name,
              email: advisor.email,
            }}
          />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        {children}
      </main>
    </div>
  );
}
