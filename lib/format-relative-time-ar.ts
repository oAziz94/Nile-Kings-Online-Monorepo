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
  // Arabic counted nouns: 1 singular, 2 dual, 3–10 plural, 11+ singular accusative.
  const counted = (n: number, one: string, two: string, few: string, many: string) =>
    n === 1 ? `منذ ${one}` : n === 2 ? `منذ ${two}` : n <= 10 ? `منذ ${n} ${few}` : `منذ ${n} ${many}`;

  if (minutes < 60) return counted(minutes, "دقيقة", "دقيقتين", "دقائق", "دقيقة");

  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 24) return counted(hours, "ساعة", "ساعتين", "ساعات", "ساعة");

  const days = Math.floor(diffMs / 86_400_000);
  return counted(days, "يوم", "يومين", "أيام", "يومًا");
}
