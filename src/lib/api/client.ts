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

// Blob fetcher for binary downloads (Phase 6 PDF exports). Same auth +
// 401-redirect semantics as `request`, but the success path returns a
// Blob instead of parsed JSON. The error path still expects JSON, since
// the API contract guarantees JSON error envelopes even for endpoints
// whose 200 body is binary.
async function requestBlob(path: string): Promise<Blob> {
  const url = new URL(path, typeof window !== "undefined" ? window.location.origin : "http://localhost");
  const res = await fetch(url.toString(), {
    method: "GET",
    credentials: "same-origin",
  });

  if (!res.ok) {
    const contentType = res.headers.get("content-type") ?? "";
    const apiErr = contentType.includes("application/json")
      ? ((await res.json()) as ApiError | null)
      : null;
    const code = apiErr?.error?.code ?? "internal_error";
    const message = apiErr?.error?.message ?? `HTTP ${res.status}`;

    if (res.status === 401 && typeof window !== "undefined") {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/sign-in?redirect=${next}`;
    }
    throw new ApiClientError(res.status, code, message, apiErr?.error?.details);
  }

  return res.blob();
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
    // Phase 10B: dual-mode generation submission.
    //   - FR mode (default): upload a .docx or .pdf Fact Review; the CLI
    //     runs Stages 0 → 1 → 2 → 3a → 4 → 5.
    //   - JSON fallback mode (power-user): upload pre-built ClientProfile
    //     + SelectedRecommendations JSONs; the CLI skips Stages 1+2 and
    //     runs 3a → 4 → 5.
    // The route handler discriminates by which fields are present.
    generate: (args: {
      clientId: string;
      factReviewFilename: string;
      factReview?: File | Blob;
      clientprofile?: File | Blob;
      selectedRecommendations?: File | Blob;
    }) => {
      const fd = new FormData();
      fd.set("client_id", args.clientId);
      fd.set("fact_review_filename", args.factReviewFilename);
      if (args.factReview) fd.set("fact_review", args.factReview);
      if (args.clientprofile) fd.set("clientprofile", args.clientprofile);
      if (args.selectedRecommendations)
        fd.set("selected_recommendations", args.selectedRecommendations);
      return request<PlansApi.GenerateAcceptedResponse>("/api/plans/generate", {
        method: "POST",
        formData: fd,
      });
    },
    queued: () => request<PlansApi.QueuedListResponse>("/api/plans/queued"),
    approve: (id: string) =>
      request<PlansApi.ApproveResponse>(`/api/plans/${id}/approve`, { method: "POST" }),
    archive: (id: string) =>
      request<PlansApi.ArchiveResponse>(`/api/plans/${id}/archive`, { method: "POST" }),
    // Phase 18.1 — retroactively promote REC- recommendations into
    // action items on an already-approved plan. Idempotent.
    promoteRecommendations: (id: string) =>
      request<PlansApi.PromoteRecommendationsResponse>(
        `/api/plans/${id}/promote-recommendations`,
        { method: "POST" },
      ),
    // Phase 6: returns a PDF Blob. Caller can pipe to a download with
    // URL.createObjectURL + an <a download> element, or trigger
    // window.open against the URL directly.
    exportPdf: (id: string) => requestBlob(`/api/plans/${id}/pdf`),
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
    archive: (id: string) =>
      request<LensRunsApi.ArchiveResponse>(`/api/lens-runs/${id}/archive`, { method: "POST" }),
    restore: (id: string) =>
      request<LensRunsApi.RestoreResponse>(`/api/lens-runs/${id}/restore`, { method: "POST" }),
    setCurrent: (id: string) =>
      request<LensRunsApi.SetCurrentResponse>(`/api/lens-runs/${id}/set-current`, { method: "POST" }),
    exportPdf: (id: string) => requestBlob(`/api/lens-runs/${id}/pdf`),
    cashFlow: {
      create: (body: LensRunsApi.CashFlowCreateRequest) =>
        request<LensRunsApi.CashFlowCreateResponse>("/api/lens-runs/cash-flow", {
          method: "POST",
          body,
        }),
      update: (id: string, body: LensRunsApi.CashFlowUpdateRequest) =>
        request<LensRunsApi.CashFlowUpdateResponse>(`/api/lens-runs/cash-flow/${id}`, {
          method: "PATCH",
          body,
        }),
      finalize: (id: string) =>
        request<LensRunsApi.CashFlowFinalizeResponse>(
          `/api/lens-runs/cash-flow/${id}/finalize`,
          { method: "POST" },
        ),
      suggestAllocation: (id: string) =>
        request<LensRunsApi.CashFlowSuggestAllocationResponse>(
          `/api/lens-runs/cash-flow/${id}/suggest-allocation`,
          { method: "POST" },
        ),
      generateRecommendations: (id: string) =>
        request<LensRunsApi.CashFlowGenerateRecommendationsResponse>(
          `/api/lens-runs/cash-flow/${id}/generate-recommendations`,
          { method: "POST" },
        ),
      pushActionItems: (id: string, body: LensRunsApi.CashFlowPushActionItemsRequest) =>
        request<LensRunsApi.CashFlowPushActionItemsResponse>(
          `/api/lens-runs/cash-flow/${id}/push-action-items`,
          { method: "POST", body },
        ),
      refreshFromPlan: (id: string) =>
        request<LensRunsApi.CashFlowRefreshResponse>(
          `/api/lens-runs/cash-flow/${id}/refresh-from-plan`,
          { method: "POST" },
        ),
    },
    estate: {
      create: (body: LensRunsApi.EstateCreateRequest) =>
        request<LensRunsApi.EstateCreateResponse>("/api/lens-runs/estate", {
          method: "POST",
          body,
        }),
      update: (id: string, body: LensRunsApi.EstateUpdateRequest) =>
        request<LensRunsApi.EstateUpdateResponse>(`/api/lens-runs/estate/${id}`, {
          method: "PATCH",
          body,
        }),
      finalize: (id: string) =>
        request<LensRunsApi.EstateFinalizeResponse>(
          `/api/lens-runs/estate/${id}/finalize`,
          { method: "POST" },
        ),
      pushActionItems: (id: string, body: LensRunsApi.EstatePushActionItemsRequest) =>
        request<LensRunsApi.EstatePushActionItemsResponse>(
          `/api/lens-runs/estate/${id}/push-action-items`,
          { method: "POST", body },
        ),
      refreshFromPlan: (id: string) =>
        request<LensRunsApi.EstateRefreshResponse>(
          `/api/lens-runs/estate/${id}/refresh-from-plan`,
          { method: "POST" },
        ),
    },
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
