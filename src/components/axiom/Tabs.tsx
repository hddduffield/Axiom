"use client";

// Axiom Tabs — design-correct underline tabs.
//
// Why a wrapper instead of shadcn ui/tabs.tsx with variant="line":
//
// shadcn TabsTrigger places its active underline via `after:bottom-[-5px]
// h-0.5 bg-foreground` — a pseudo-element 5px BELOW the trigger's
// baseline, colored with --foreground. styles.css §tab (line 559-574)
// places the underline AS the trigger's `border-bottom`, aligned with
// the bottom of the text and tinted `var(--n-900)` (cascade-winner
// over the earlier --accent rule at line 137). Different anchor,
// different color.
//
// Rather than overriding shadcn's deeply-nested `data-[variant=line]`
// rules from outside (fragile against shadcn updates), this wrapper
// uses @base-ui/react/tabs directly with our own classNames. Same
// keyboard / ARIA behaviour, different paint.
//
// API surface mirrors shadcn — Tabs / TabsList / TabsTrigger /
// TabsContent — so existing callers can swap the import path with no
// other edits.

import * as React from "react";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";

import { cn } from "@/lib/utils";

function Tabs({
  className,
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-0", className)}
      {...props}
    />
  );
}

// `.tabs` per styles.css line 553: flex row, no gap, 1px hairline along
// the bottom edge. The 20px margin-bottom from the source is left to
// callers (each surface picks its own breathing room).
function TabsList({
  className,
  ...props
}: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn("flex border-b", className)}
      style={{ borderColor: "var(--border)" }}
      {...props}
    />
  );
}

// `.tab` per styles.css line 559-574:
//   padding 10px 16px, font-size 13px, color text-2,
//   border-bottom: 2px solid transparent, margin-bottom: -1px,
//   gap 8px between text + count badge.
//   Active: color text, border-bottom-color --n-900, font-weight 500.
//
// `.tab .count` (line 576-584):
//   mono 10px, padding 1px 6px, radius 8px,
//   bg --n-75 / color text-2 (inactive) → bg --n-100 / color text (active)
function TabsTrigger({
  className,
  ...props
}: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex cursor-pointer items-center gap-2 px-4 py-2.5 text-[13px] font-normal whitespace-nowrap transition-colors outline-none",
        "text-[var(--text-2)] hover:text-[var(--text)]",
        "data-active:font-medium data-active:text-[var(--text)]",
        "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-0",
        // Underline is the trigger's own border-bottom. Negative
        // margin-bottom pulls it onto the TabsList's hairline so the
        // active 2px overlays the 1px list border.
        "border-b-2 border-transparent -mb-px",
        "data-active:border-[var(--n-900)]",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
