// Shared panel card with the design-correct eyebrow title.
//
// Title styling (Phase 9.16): mirrors the cascade-winning `.card__head h2`
// — line 343 (font-size 12px, font-weight 500, text-transform uppercase,
// letter-spacing 0.06em, color text-2) inheriting `font-family: var(--font-mono)`
// from the earlier line 112 rule.
//
// Container (.card__head) padding: 14px 20px (styles.css line 120, later
// override of line 336's 12px 16px). Body (.card__body) padding: 18px 20px
// (line 119 over line 352's 14px 16px).
//
// API: title (optional), count (optional mono badge), action (right
// cluster — buttons, links, hint text), children (body), flush (skip
// body padding for tables / scroll regions).

import * as React from "react";

export interface PanelCardProps {
  title?: string;
  count?: number | string;
  action?: React.ReactNode;
  children: React.ReactNode;
  flush?: boolean;
  className?: string;
}

export function PanelCard({
  title,
  count,
  action,
  children,
  flush = false,
  className,
}: PanelCardProps) {
  return (
    <div
      className={
        "overflow-hidden rounded-md border" + (className ? " " + className : "")
      }
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      {title || action ? (
        <div
          className="flex items-center justify-between gap-3 border-b"
          style={{
            borderColor: "var(--border)",
            padding: "14px 20px",
          }}
        >
          <div className="flex items-baseline gap-2">
            {title ? (
              <h2
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  fontWeight: 500,
                  letterSpacing: "0.06em",
                  color: "var(--text-2)",
                  textTransform: "uppercase",
                  margin: 0,
                }}
              >
                {title}
              </h2>
            ) : null}
            {count != null ? (
              <span
                className="text-[11px]"
                style={{
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-3)",
                }}
              >
                {count}
              </span>
            ) : null}
          </div>
          {action ? (
            <div className="flex items-center gap-2">{action}</div>
          ) : null}
        </div>
      ) : null}
      <div style={flush ? undefined : { padding: "18px 20px" }}>{children}</div>
    </div>
  );
}
