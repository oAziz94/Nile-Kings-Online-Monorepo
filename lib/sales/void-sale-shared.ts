import { cairoDateIso, cairoStartOfDayUtc } from "@/lib/analytics/cairo-day";

/** Client-safe pieces of the void rules (no Prisma), shared by `void-sale.ts` and the receipt UI. */

export const VOID_REASON_MIN = 3;
export const VOID_REASON_MAX = 200;
export const VOID_TODAY_ONLY_MESSAGE = "يمكن إلغاء إيصال اليوم فقط";

export type VoidActor = "OUTLET" | "ADMIN";

export function validateVoidReason(raw: unknown): { ok: true; reason: string } | { ok: false; message: string } {
  const reason = typeof raw === "string" ? raw.trim() : "";
  if (reason.length < VOID_REASON_MIN || reason.length > VOID_REASON_MAX) {
    return { ok: false, message: `سبب الإلغاء يجب أن يكون بين ${VOID_REASON_MIN} و ${VOID_REASON_MAX} حرفاً` };
  }
  return { ok: true, reason };
}

/** True when `soldAt` falls before 00:00 Africa/Cairo of the day containing `now`. */
export function isBeforeCairoToday(soldAt: Date, now: Date = new Date()): boolean {
  return soldAt.getTime() < cairoStartOfDayUtc(cairoDateIso(now)).getTime();
}

