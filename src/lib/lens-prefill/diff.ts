// Phase 16.3 — Detect edited sourced fields by diffing previous-vs-next
// lens output along every dotted path in sourced_fields[].
//
// The lens views drive their state through a single `onChange(next)`
// callback. We use this helper to convert that change into provenance
// bookkeeping: any sourced field whose value differs between prev and
// next gets appended to source.edited_fields (deduped, set semantics).
//
// We can't detect "advisor typed the same value back" — fine, because
// refresh-from-plan would produce the same value anyway.

interface BaseLensSource {
  plan_id: string;
  plan_generated_at: string;
  sourced_fields: string[];
  edited_fields: string[];
}

interface LensOutputLike {
  source: BaseLensSource | null;
}

/**
 * Walk source.sourced_fields. For each path where prev[path] !== next[path],
 * return that path as "edited". Array-element paths (`buckets[3].x`) compare
 * by exact index; if the array's length changed, the array itself is
 * considered edited and the path "buckets" returns.
 */
export function diffSourcedFields(prev: LensOutputLike, next: LensOutputLike): string[] {
  if (!prev.source || !next.source) return [];
  const out: string[] = [];
  for (const path of prev.source.sourced_fields) {
    const before = readPath(prev as unknown as Record<string, unknown>, path);
    const after = readPath(next as unknown as Record<string, unknown>, path);
    if (!shallowEqual(before, after)) out.push(path);
  }
  return out;
}

/**
 * Merge a fresh set of edits into source.edited_fields and return a new
 * output. Idempotent — re-marking an already-edited path is a no-op.
 */
export function applyEditedFields<T extends LensOutputLike>(
  next: T,
  newlyEdited: string[],
): T {
  if (!next.source || newlyEdited.length === 0) return next;
  const set = new Set([...next.source.edited_fields, ...newlyEdited]);
  return {
    ...next,
    source: { ...next.source, edited_fields: Array.from(set) },
  };
}

/** True when an output's source has the given path marked sourced. */
export function isSourced(output: LensOutputLike | null, path: string): boolean {
  return !!output?.source?.sourced_fields.includes(path);
}

/** True when an output's source has the given path marked edited. */
export function isEdited(output: LensOutputLike | null, path: string): boolean {
  return !!output?.source?.edited_fields.includes(path);
}

// ────────────────────────────────────────────────────────────────────────

function readPath(obj: Record<string, unknown>, path: string): unknown {
  // Support dotted + indexed: "buckets[2].name"
  const parts = path.split(/\.|\[|\]/).filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur)) {
      const idx = Number(p);
      if (!Number.isFinite(idx)) return undefined;
      cur = cur[idx];
    } else if (typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  // Numbers / strings / booleans — strict equality handled above.
  // Objects: stringify-compare for our use (lens outputs are simple JSON).
  if (typeof a === "object") {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}
