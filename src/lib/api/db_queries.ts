// Phase 5a — shared query helpers used by every wired route handler.
//
// Three things live here:
//   1. Cursor encoding/decoding (base64url JSON of { id, key }).
//   2. Supabase error → ApiErrorCode mapping for consistent HTTP status.
//   3. A keyset list helper that turns a query into a CursorList<T> envelope.

import type { PostgrestError } from "@supabase/supabase-js";
import type { ApiErrorCode } from "./respond";

// ────────────────────────────────────────────────────────────────────────
// Pagination
// ────────────────────────────────────────────────────────────────────────

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 200;

export interface CursorPayload {
  id: string;
  key: string | number;
}

const CURSOR_VERSION = 1;

export function encodeCursor(payload: CursorPayload): string {
  const blob = JSON.stringify({ v: CURSOR_VERSION, ...payload });
  return Buffer.from(blob, "utf-8").toString("base64url");
}

export function decodeCursor(cursor: string | null | undefined): CursorPayload | null {
  if (!cursor) return null;
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8"));
    if (decoded.v !== CURSOR_VERSION) return null;
    if (typeof decoded.id !== "string") return null;
    if (typeof decoded.key !== "string" && typeof decoded.key !== "number") return null;
    return { id: decoded.id, key: decoded.key };
  } catch {
    return null;
  }
}

export function clampLimit(raw: string | null | undefined): number {
  if (!raw) return DEFAULT_PAGE_LIMIT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_LIMIT;
  return Math.min(n, MAX_PAGE_LIMIT);
}

// ────────────────────────────────────────────────────────────────────────
// Error mapping — Postgres error codes → API error contract codes.
//
// Reference: https://www.postgresql.org/docs/current/errcodes-appendix.html
// We surface only the contract codes that map cleanly; the rest fall to
// `internal_error` (500), which is the right default for anything we
// haven't explicitly handled.
// ────────────────────────────────────────────────────────────────────────

const PG_CODE_TO_API_CODE: Record<string, ApiErrorCode> = {
  PGRST116: "not_found",          // PostgREST: 0 rows from .single()/.maybeSingle() expected 1
  "23502": "validation_failed",   // not_null_violation
  "23503": "validation_failed",   // foreign_key_violation
  "23505": "conflict",             // unique_violation
  "23514": "validation_failed",   // check_violation
  "42501": "not_authorized",      // insufficient_privilege (RLS)
};

export function mapDbError(error: PostgrestError): ApiErrorCode {
  return PG_CODE_TO_API_CODE[error.code] ?? "internal_error";
}

// Friendly fallback message when Supabase's own error is too noisy to
// surface verbatim. Inspect error.code first; for known codes we can
// pass through error.message safely.
export function dbErrorMessage(error: PostgrestError): string {
  return error.message || "Database query failed.";
}
