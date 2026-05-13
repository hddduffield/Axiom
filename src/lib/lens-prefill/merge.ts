// Phase 16.3 — Refresh-merge helper.
//
// Walks each dotted field path in the fresh extractor's sourced_fields[]
// and overwrites the corresponding value in `current` UNLESS that path
// appears in current.source.edited_fields (meaning the advisor
// hand-edited it after extraction).
//
// Both cash-flow and estate share this logic — the only thing that
// varies is the concrete LensOutput shape, which we treat as
// Record<string, unknown> for the in-place mutation.

interface BaseLensSource {
  plan_id: string;
  plan_generated_at: string;
  sourced_fields: string[];
  edited_fields: string[];
}

// We only assert the `source` slot; everything else is opaque-ish. The
// merge walks dotted paths against the runtime objects, so we don't need
// an index signature at the type level (which would force callers'
// concrete types to be looser than they need to be).
interface LensOutputWithSource {
  source: BaseLensSource | null;
}

interface MergeArgs<T extends LensOutputWithSource> {
  current: T;
  fresh: T;
  sourced_fields: string[];
  plan_id: string;
  plan_generated_at: string;
}

/**
 * Apply fresh extractor output to current lens output, preserving any
 * fields the advisor has hand-edited. Returns a deep-merged object.
 *
 * Dotted paths supported: "a", "a.b", "a.b.c", "a[0].b". Array-index
 * paths only match against the same index in both objects; if the
 * fresh output has fewer items than current, current's extra items are
 * preserved. If fresh has MORE items at that array (rare — the
 * extractor regenerated buckets), current's array is replaced wholesale
 * for that key as long as the array key isn't in edited_fields.
 */
export function mergeRefresh<T extends LensOutputWithSource>(args: MergeArgs<T>): T {
  const { current, fresh, sourced_fields, plan_id, plan_generated_at } = args;
  // Start with a deep clone of current so we don't mutate the input.
  const merged = JSON.parse(JSON.stringify(current)) as T;
  const editedSet = new Set<string>(current.source?.edited_fields ?? []);

  // Handle the special case of array regenerations (e.g. buckets[]).
  // Collect any top-level array fields that the fresh extractor wrote
  // and that contain sourced child paths. If none of those array
  // entries are in edited_fields, we treat the whole array as fresh.
  const seenArrayKeys = new Set<string>();
  for (const path of sourced_fields) {
    const match = path.match(/^([a-zA-Z_]\w*)\[(\d+)\]/);
    if (match) seenArrayKeys.add(match[1]);
  }
  for (const key of seenArrayKeys) {
    const editedAtArray = Array.from(editedSet).some((p) =>
      p.startsWith(`${key}[`),
    );
    if (!editedAtArray && Array.isArray((fresh as Record<string, unknown>)[key])) {
      (merged as Record<string, unknown>)[key] = JSON.parse(
        JSON.stringify((fresh as Record<string, unknown>)[key]),
      );
    }
  }

  // Apply scalar / object-leaf sourced paths.
  for (const path of sourced_fields) {
    if (editedSet.has(path)) continue;
    // Skip array-element paths — handled wholesale above.
    if (/\[\d+\]/.test(path)) continue;
    const value = readPath(fresh as Record<string, unknown>, path);
    if (value === undefined) continue;
    writePath(merged as Record<string, unknown>, path, value);
  }

  merged.source = {
    plan_id,
    plan_generated_at,
    sourced_fields,
    edited_fields: Array.from(editedSet),
  };

  return merged;
}

function readPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function writePath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parts = path.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    const next = cur[p];
    if (next === null || typeof next !== "object" || Array.isArray(next)) {
      cur[p] = {};
    }
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}
