// Standardized JSON response shapes for /api/* route handlers.
//
// Success: ok(data) → 200 { ...data }
// Cursor list: list(items, nextCursor) → 200 { items, next_cursor }
// Error: err(status, code, message, details?) → matching HTTP status with
//        body { error: { code, message, details? } }
//
// Codes are short snake_case identifiers Claude Design can switch on.

import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "unauthenticated"
  | "not_authorized"
  | "not_found"
  | "validation_failed"
  | "conflict"
  | "rate_limited"
  | "internal_error";

const CODE_TO_STATUS: Record<ApiErrorCode, number> = {
  unauthenticated: 401,
  not_authorized: 403,
  not_found: 404,
  validation_failed: 422,
  conflict: 409,
  rate_limited: 429,
  internal_error: 500,
};

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, { status: 200, ...init });
}

export function created<T>(data: T): NextResponse {
  return NextResponse.json(data, { status: 201 });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export interface ListResponse<T> {
  items: T[];
  next_cursor: string | null;
}

export function list<T>(
  items: T[],
  next_cursor: string | null = null,
): NextResponse {
  const body: ListResponse<T> = { items, next_cursor };
  return NextResponse.json(body, { status: 200 });
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function err(
  code: ApiErrorCode,
  message: string,
  details?: unknown,
): NextResponse {
  const body: ApiErrorBody = {
    error: { code, message, ...(details === undefined ? {} : { details }) },
  };
  return NextResponse.json(body, { status: CODE_TO_STATUS[code] });
}
