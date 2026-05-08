"use client";

// Phase 13.6 — Pre-export modal. Advisor picks which sections + which
// recommendations to include. "Generate PDF" opens the PDF endpoint with
// the selection encoded as query parameters.

import { useState } from "react";
import { CheckSquare, FileDown, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CashFlowLensOutput } from "@/lib/api/cash_flow_lens";

interface Props {
  lensId: string;
  output: CashFlowLensOutput;
  onClose: () => void;
}

export function PdfExportDialog({ lensId, output, onClose }: Props) {
  const [includeHub, setIncludeHub] = useState(true);
  const [includeTriangle, setIncludeTriangle] = useState(true);
  const [includeDistribution, setIncludeDistribution] = useState(true);
  const [includeRecommendations, setIncludeRecommendations] = useState(true);

  const recs = output.ai_suggestions.distribution_recommendations?.recommendations ?? [];
  const [selectedRecIds, setSelectedRecIds] = useState<Set<string>>(
    new Set(recs.map((r) => r.id)),
  );

  const toggleRec = (id: string) => {
    setSelectedRecIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const buildUrl = () => {
    const params = new URLSearchParams();
    params.set("include_hub", includeHub ? "1" : "0");
    params.set("include_triangle", includeTriangle ? "1" : "0");
    params.set("include_distribution", includeDistribution ? "1" : "0");
    params.set("include_recommendations", includeRecommendations ? "1" : "0");
    if (includeRecommendations && recs.length > 0) {
      params.set("recommendation_ids", Array.from(selectedRecIds).join(","));
    }
    return `/api/lens-runs/${lensId}/pdf?${params.toString()}`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-lg p-6"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3
            className="text-xl font-medium"
            style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}
          >
            Export Cash Flow Plan
          </h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <p className="mt-1 text-[12px]" style={{ color: "var(--text-3)" }}>
          Choose which layouts and recommendations to include. Cover and
          Disclosures pages always render.
        </p>

        {/* ── Layouts ─────────────────────────────────────── */}
        <div className="mt-4">
          <h4
            className="text-[10px] uppercase"
            style={{
              color: "var(--text-3)",
              letterSpacing: "0.06em",
              fontFamily: "var(--font-mono)",
            }}
          >
            Layouts
          </h4>
          <div className="mt-2 flex flex-col gap-1.5">
            <Toggle
              label="Hub view"
              description="Household → Financial Foundation → bucket cards"
              checked={includeHub}
              onChange={setIncludeHub}
            />
            <Toggle
              label="Tax Triangle (current + recommended)"
              description="Two pages: side-by-side tax-treatment mix + tax bill projection"
              checked={includeTriangle}
              onChange={setIncludeTriangle}
            />
            <Toggle
              label="Distribution Plan"
              description="Year-by-year retirement income bar chart"
              checked={includeDistribution}
              onChange={setIncludeDistribution}
            />
            <Toggle
              label="Recommendations"
              description="Sequenced action items with timing + tax impact"
              checked={includeRecommendations}
              onChange={setIncludeRecommendations}
            />
          </div>
        </div>

        {/* ── Recommendations ─────────────────────────────── */}
        {includeRecommendations && recs.length > 0 ? (
          <div className="mt-5">
            <h4
              className="text-[10px] uppercase"
              style={{
                color: "var(--text-3)",
                letterSpacing: "0.06em",
                fontFamily: "var(--font-mono)",
              }}
            >
              Recommendations to include
            </h4>
            <ul className="mt-2 max-h-64 overflow-y-auto rounded-md border" style={{ borderColor: "var(--border)" }}>
              {recs.map((r) => {
                const checked = selectedRecIds.has(r.id);
                return (
                  <li
                    key={r.id}
                    className="flex items-start gap-2 border-b px-3 py-2 last:border-b-0 cursor-pointer"
                    style={{ borderColor: "var(--border)" }}
                    onClick={() => toggleRec(r.id)}
                  >
                    {checked ? (
                      <CheckSquare
                        className="mt-0.5 h-4 w-4"
                        style={{ color: "var(--psa-navy)" }}
                      />
                    ) : (
                      <Square
                        className="mt-0.5 h-4 w-4"
                        style={{ color: "var(--text-3)" }}
                      />
                    )}
                    <div className="flex-1">
                      <div
                        className="flex items-baseline gap-2 text-[11px]"
                        style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)" }}
                      >
                        {r.timeframe_label.toUpperCase()}
                      </div>
                      <p className="text-[12px]" style={{ color: "var(--text)" }}>
                        {r.action}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-1 text-[11px]" style={{ color: "var(--text-3)" }}>
              {selectedRecIds.size} of {recs.length} selected
            </p>
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <a
            href={buildUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center rounded-md bg-[var(--psa-navy)] px-3 text-sm font-medium text-white transition-colors hover:opacity-90"
            onClick={onClose}
          >
            <FileDown className="mr-1.5 h-3.5 w-3.5" />
            Generate PDF
          </a>
        </div>
      </div>
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-start gap-2 rounded-md border px-3 py-2 text-left transition-colors hover:bg-[var(--surface-2)]"
      style={{ borderColor: "var(--border)" }}
    >
      {checked ? (
        <CheckSquare
          className="mt-0.5 h-4 w-4"
          style={{ color: "var(--psa-navy)" }}
        />
      ) : (
        <Square
          className="mt-0.5 h-4 w-4"
          style={{ color: "var(--text-3)" }}
        />
      )}
      <div>
        <div className="text-[13px] font-medium" style={{ color: "var(--text)" }}>
          {label}
        </div>
        <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
          {description}
        </p>
      </div>
    </button>
  );
}
