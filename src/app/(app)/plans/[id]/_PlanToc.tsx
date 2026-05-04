"use client";

// Sticky TOC rail with active-section tracking via IntersectionObserver.
// Client Component only because document scrolling and IO callbacks have
// to run in the browser; the section IDs themselves are baked into the
// server-rendered article above.

import { useEffect, useState } from "react";

interface Section {
  id: string;
  num: number;
  label: string;
}

interface Props {
  sections: Section[];
}

export function PlanToc({ sections }: Props) {
  const [active, setActive] = useState<string>(sections[0]?.id ?? "");

  useEffect(() => {
    const targets = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return;

    // Observe each section; pick the topmost intersecting one as active.
    // Using a tight rootMargin so a section becomes "active" as it
    // crosses the upper third of the viewport.
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) setActive(visible[0].target.id);
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: 0 },
    );
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, [sections]);

  return (
    <nav className="flex flex-col" aria-label="Plan sections">
      {sections.map((s) => {
        const isActive = active === s.id;
        return (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="flex gap-2.5 py-1 pl-3 pr-2 text-xs transition-colors"
            style={{
              color: isActive ? "var(--text)" : "var(--text-2)",
              borderLeft: `2px solid ${isActive ? "var(--accent)" : "transparent"}`,
              marginLeft: -2,
              fontWeight: isActive ? 500 : 400,
              lineHeight: 1.35,
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                paddingTop: 2,
                color: "var(--text-3)",
              }}
            >
              {String(s.num).padStart(2, "0")}
            </span>
            <span>{s.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
