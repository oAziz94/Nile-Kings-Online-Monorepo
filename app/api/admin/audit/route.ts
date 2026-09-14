import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiUnauthorized, apiForbidden } from "@/lib/api/response";
import { describeAdminAudit } from "@/lib/audit/describe-admin-audit";
import { resolveActorNames } from "@/lib/audit/resolve-actor-names";

/**
 * GET /api/admin/audit — backlog 9.1 c, extended additively by 9.7 (c)/(d) for `/admin/audit`
 * and in-context audit (the order timeline, the partner settings tab, the settings previous-
 * value note all read this same endpoint by `entityType`+`entityId` — no new endpoints).
 *
 * Query params: entityType, entityId, actorUserId, actorRole ("ADMIN" | "PARTNER"), action,
 * q (matches entityLabel/entityId, case-insensitive), from/to (ISO date, inclusive day range),
 * cursor (an AdminAuditLog id), limit (default 50, max 100), format=csv (streams up to 10,000
 * matching rows as CSV instead of a paginated JSON page — ignores cursor/limit).
 */
function buildWhere(searchParams: URLSearchParams): Prisma.AdminAuditLogWhereInput {
  const entityType = searchParams.get("entityType") ?? undefined;
  const entityId = searchParams.get("entityId") ?? undefined;
  const actorUserId = searchParams.get("actorUserId") ?? undefined;
  const actorRole = searchParams.get("actorRole") ?? undefined;
  const action = searchParams.get("action") ?? undefined;
  const q = (searchParams.get("q") ?? "").trim();
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;

  const where: Prisma.AdminAuditLogWhereInput = {
    ...(entityType && { entityType }),
    ...(entityId && { entityId }),
    ...(actorUserId && { actorUserId }),
    ...(actorRole && { actorRole }),
    ...(action && { action }),
  };
  if (from || to) {
    where.createdAt = {
      ...(from && { gte: new Date(from) }),
      ...(to && { lte: new Date(`${to}T23:59:59.999Z`) }),
    };
  }
  if (q) {
    where.OR = [
      { entityLabel: { contains: q, mode: "insensitive" } },
      { entityId: { contains: q, mode: "insensitive" } },
    ];
  }
  return where;
}

function toCsvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function GET(req: NextRequest) {
  let viewer;
  try {
    viewer = await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }

  const { searchParams } = new URL(req.url);
  const where = buildWhere(searchParams);

  if (searchParams.get("format") === "csv") {
    const rows = await prisma.adminAuditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 10_000,
    });
    const actorNameById = await resolveActorNames(rows.map((r) => r.actorUserId), viewer.userId);
    const header = ["متى", "من", "الصفة", "الإجراء", "النوع", "على", "التغيير"].join(",");
    const lines = rows.map((row) => {
      const sentence = describeAdminAudit({
        action: row.action,
        entityType: row.entityType,
        entityLabel: row.entityLabel,
        before: row.before,
        after: row.after,
      });
      return [
        row.createdAt.toISOString(),
        actorNameById.get(row.actorUserId) ?? "مستخدم محذوف",
        row.actorRole,
        row.action,
        row.entityType,
        row.entityLabel ?? row.entityId,
        sentence,
      ]
        .map((v) => toCsvField(String(v)))
        .join(",");
    });
    const csv = "﻿" + [header, ...lines].join("\n");
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="audit.csv"',
      },
    });
  }

  const cursor = searchParams.get("cursor") ?? undefined;
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50));

  const items = await prisma.adminAuditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
  });

  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;

  const actorNameById = await resolveActorNames(page.map((r) => r.actorUserId), viewer.userId);
  const enriched = page.map((row) => ({
    ...row,
    actorName: actorNameById.get(row.actorUserId) ?? "مستخدم محذوف",
    sentence: describeAdminAudit({
      action: row.action,
      entityType: row.entityType,
      entityLabel: row.entityLabel,
      before: row.before,
      after: row.after,
    }),
  }));

  return apiSuccess({ items: enriched, nextCursor });
}
