/**
 * Resolves `AdminAuditLog.actorUserId` to a display name — "أنت" for the viewer, otherwise
 * the actor's name/phone, or "مستخدم محذوف" if the user row is gone. Shared by the 9.2 اليوم
 * "آخر النشاط" widget (`lib/admin/today.ts`) and 9.7's `/admin/audit` + in-context audit reads
 * (`GET /api/admin/audit`), so "من فعل" resolves identically everywhere it appears.
 */
import { prisma } from "@/lib/db";

export async function resolveActorNames(
  actorUserIds: string[],
  viewerUserId: string
): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(actorUserIds));
  if (uniqueIds.length === 0) return new Map();
  const actors = await prisma.user.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, name: true, phone: true },
  });
  const actorById = new Map(actors.map((a) => [a.id, a]));
  const result = new Map<string, string>();
  for (const id of uniqueIds) {
    if (id === viewerUserId) {
      result.set(id, "أنت");
      continue;
    }
    const actor = actorById.get(id);
    result.set(id, actor?.name?.trim() || actor?.phone || "مستخدم محذوف");
  }
  return result;
}
