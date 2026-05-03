import { z } from "zod";
import { requireAdvisor } from "@/lib/api/auth";
import { err, list } from "@/lib/api/respond";
import {
  clampLimit,
  dbErrorMessage,
  decodeCursor,
  encodeCursor,
  mapDbError,
} from "@/lib/api/db_queries";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/clients/[id]/plans — list plans for a client (newest first).
export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireAdvisor();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const { data: clientRow, error: clientErr } = await auth.supabase
    .from("clients")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (clientErr) return err(mapDbError(clientErr), dbErrorMessage(clientErr));
  if (!clientRow) return err("not_found", `No client with id ${id}.`);

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const limit = clampLimit(url.searchParams.get("limit"));
  const cursor = decodeCursor(url.searchParams.get("cursor"));

  let q = auth.supabase
    .from("plans")
    .select("*")
    .eq("client_id", id)
    .order("generated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (status) {
    const parsedStatus = z
      .enum(["queued", "processing", "ready_for_review", "approved", "archived", "failed"])
      .safeParse(status);
    if (parsedStatus.success) q = q.eq("status", parsedStatus.data);
  }
  if (cursor) {
    const key = String(cursor.key);
    q = q.or(`generated_at.lt.${key},and(generated_at.eq.${key},id.lt.${cursor.id})`);
  }

  const { data, error } = await q;
  if (error) return err(mapDbError(error), dbErrorMessage(error));
  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const next = hasMore && items.length > 0
    ? encodeCursor({ id: items[items.length - 1].id, key: items[items.length - 1].generated_at })
    : null;
  return list(items, next);
}
