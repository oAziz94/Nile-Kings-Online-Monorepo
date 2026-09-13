/**
 * Short Arabic relative-time strings for اليوم's queue rows (backlog 5.2) — "منذ 25 دقيقة",
 * "منذ ساعة", "منذ يومين". Deliberately simple (no i18n library): only the three units the
 * queue actually needs (minutes/hours/days), Western numerals via the caller's own `.num`
 * styling (this returns plain text, digits included).
 */
export function formatRelativeTimeAr(iso: string | Date, now: Date = new Date()): string {
  const then = typeof iso === "string" ? new Date(iso) : iso;
  const diffMs = Math.max(0, now.getTime() - then.getTime());
  const minutes = Math.floor(diffMs / 60_000);

  if (minutes < 1) return "الآن";
  if (minutes < 60) return minutes === 1 ? "منذ دقيقة" : `منذ ${minutes} دقيقة`;

  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 24) return hours === 1 ? "منذ ساعة" : hours === 2 ? "منذ ساعتين" : `منذ ${hours} ساعة`;

  const days = Math.floor(diffMs / 86_400_000);
  return days === 1 ? "منذ يوم" : days === 2 ? "منذ يومين" : `منذ ${days} يومًا`;
}
