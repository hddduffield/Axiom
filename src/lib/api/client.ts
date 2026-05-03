// Browser-side API client. Used by Claude Design's React components.
//
//   import { api, isApiError } from "@/lib/api/client";
//   const { items } = await api.actionItems.list({ owner: "me", status: "in_progress" });
//
// Auth: all requests are same-origin and rely on the Supabase session
// cookie set by /auth/callback. No bearer header handling; the server
// reads the cookie via @supabase/ssr.
//
// Errors: any non-2xx response throws ApiError, which carries the parsed
// body. 401 responses additionally redirect to /sign-in (with a `next`
// query param) so a stale-session navigation lands the user back where
// they were after re-auth.

import type {
  ActionItemsApi,
  AdvisorsApi,
  ApiError,
  ClientsApi,
  LensRunsApi,
  NotesApi,
  PartnersApi,
  PlansApi,
} from "./types";

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export function isApiError(value: unknown): value is ApiClientError {
  return value instanceof ApiClientError;
}

type QueryValue = string | number | boolean | undefined | null;

interface FetchOpts {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  // `object` accepts the typed *Api.ListQuery interfaces (which lack an
  // index signature). Values are coerced to strings inside `request`.
  query?: object;
  // For multipart/form-data uploads (e.g., POST /api/plans/generate).
  formData?: FormData;
}

async function request<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const url = new URL(path, typeof window !== "undefined" ? window.location.origin : "http://localhost");
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query as Record<string, QueryValue>)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }

  const init: RequestInit = {
    method: opts.method ?? "GET",
    credentials: "same-origin",
  };
  if (opts.formData) {
    init.body = opts.formData;
  } else if (opts.body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(opts.body);
  }

  const res = await fetch(url.toString(), init);

  if (res.status === 204) {
    return undefined as T;
  }

  const contentType = res.headers.get("content-type") ?? "";
  const parsed = contentType.includes("application/json") ? await res.json() : null;

  if (!res.ok) {
    const apiErr = parsed as ApiError | null;
    const code = apiErr?.error?.code ?? "internal_error";
    const message = apiErr?.error?.message ?? `HTTP ${res.status}`;

    // Stale-session: bounce to sign-in preserving where we were.
    if (res.status === 401 && typeof window !== "undefined") {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/sign-in?redirect=${next}`;
    }

    throw new ApiClientError(res.status, code, message, apiErr?.error?.details);
  }

  return parsed as T;
}

// ────────────────────────────────────────────────────────────────────────
// Resource clients — group endpoints by resource for ergonomic call sites.
// ────────────────────────────────────────────────────────────────────────

export const api = {
  clients: {
    list: (q: ClientsApi.ListQuery = {}) =>
      request<ClientsApi.ListResponse>("/api/clients", { query: q }),
    get: (id: string) =>
      request<ClientsApi.GetResponse>(`/api/clients/${id}`),
    create: (body: ClientsApi.CreateRequest) =>
      request<ClientsApi.CreateResponse>("/api/clients", { method: "POST", body }),
    update: (id: string, body: ClientsApi.UpdateRequest) =>
      request<ClientsApi.UpdateResponse>(`/api/clients/${id}`, { method: "PATCH", body }),
    softDelete: (id: string) =>
      request<void>(`/api/clients/${id}`, { method: "DELETE" }),
  },
  plans: {
    listByClient: (clientId: string, q: PlansApi.ListByClientQuery = {}) =>
      request<PlansApi.ListByClientResponse>(`/api/clients/${clientId}/plans`, { query: q }),
    get: (id: string) =>
      request<PlansApi.GetResponse>(`/api/plans/${id}`),
    generate: (clientId: string, factReview: File) => {
      const fd = new FormData();
      fd.set("client_id", clientId);
      fd.set("fact_review", factReview);
      return request<PlansApi.GenerateAcceptedResponse>("/api/plans/generate", {
        method: "POST",
        formData: fd,
      });
    },
    approve: (id: string) =>
      request<PlansApi.ApproveResponse>(`/api/plans/${id}/approve`, { method: "POST" }),
    archive: (id: string) =>
      request<PlansApi.ArchiveResponse>(`/api/plans/${id}/archive`, { method: "POST" }),
  },
  actionItems: {
    list: (q: ActionItemsApi.ListQuery = {}) =>
      request<ActionItemsApi.ListResponse>("/api/action-items", { query: q }),
    get: (id: string) =>
      request<ActionItemsApi.GetResponse>(`/api/action-items/${id}`),
    create: (body: ActionItemsApi.CreateRequest) =>
      request<ActionItemsApi.CreateResponse>("/api/action-items", { method: "POST", body }),
    update: (id: string, body: ActionItemsApi.UpdateRequest) =>
      request<ActionItemsApi.UpdateResponse>(`/api/action-items/${id}`, { method: "PATCH", body }),
    delete: (id: string) =>
      request<void>(`/api/action-items/${id}`, { method: "DELETE" }),
  },
  notes: {
    listByClient: (clientId: string, q: NotesApi.ListByClientQuery = {}) =>
      request<NotesApi.ListByClientResponse>(`/api/clients/${clientId}/notes`, { query: q }),
    create: (body: NotesApi.CreateRequest) =>
      request<NotesApi.CreateResponse>("/api/notes", { method: "POST", body }),
    update: (id: string, body: NotesApi.UpdateRequest) =>
      request<NotesApi.UpdateResponse>(`/api/notes/${id}`, { method: "PATCH", body }),
    delete: (id: string) =>
      request<void>(`/api/notes/${id}`, { method: "DELETE" }),
    promoteToAction: (id: string, body: NotesApi.PromoteToActionRequest) =>
      request<NotesApi.PromoteToActionResponse>(`/api/notes/${id}/promote-to-action`, {
        method: "POST",
        body,
      }),
  },
  lensRuns: {
    listByClient: (clientId: string, q: LensRunsApi.ListByClientQuery = {}) =>
      request<LensRunsApi.ListByClientResponse>(`/api/clients/${clientId}/lens-runs`, { query: q }),
    get: (id: string) =>
      request<LensRunsApi.GetResponse>(`/api/lens-runs/${id}`),
    generate: (body: LensRunsApi.GenerateRequest) =>
      request<LensRunsApi.GenerateAcceptedResponse>("/api/lens-runs/generate", {
        method: "POST",
        body,
      }),
  },
  partners: {
    listByClient: (clientId: string, q: PartnersApi.ListByClientQuery = {}) =>
      request<PartnersApi.ListByClientResponse>(`/api/clients/${clientId}/partners`, { query: q }),
    create: (body: PartnersApi.CreateRequest) =>
      request<PartnersApi.CreateResponse>("/api/partners", { method: "POST", body }),
    update: (id: string, body: PartnersApi.UpdateRequest) =>
      request<PartnersApi.UpdateResponse>(`/api/partners/${id}`, { method: "PATCH", body }),
    delete: (id: string) =>
      request<void>(`/api/partners/${id}`, { method: "DELETE" }),
  },
  advisors: {
    me: () => request<AdvisorsApi.MeResponse>("/api/advisors/me"),
    list: (q: AdvisorsApi.ListQuery = {}) =>
      request<AdvisorsApi.ListResponse>("/api/advisors", { query: q }),
  },
};
