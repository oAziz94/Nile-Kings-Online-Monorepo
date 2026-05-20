/** Helpers for admin report date filters (YYYY-MM-DD). */

export const DEFAULT_REPORT_RANGE_DAYS = 30;

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

export function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toIsoDate(d);
}

export function defaultReportRange(): { from: string; to: string } {
  return {
    from: daysAgoIso(DEFAULT_REPORT_RANGE_DAYS),
    to: todayIso(),
  };
}

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daySpanMs(fromIso: string, toIso: string): number {
  return Math.max(0, parseIso(toIso).getTime() - parseIso(fromIso).getTime());
}

/**
 * When the start date changes, shift the end date by the same window length when possible,
 * then clamp so end >= start and end <= today.
 */
export function resolveEndWhenStartChanges(
  newFrom: string,
  previousFrom: string,
  previousTo: string
): string {
  const today = todayIso();
  if (!newFrom) return previousTo || today;

  const spanMs =
    previousFrom && previousTo
      ? daySpanMs(previousFrom, previousTo)
      : DEFAULT_REPORT_RANGE_DAYS * 24 * 60 * 60 * 1000;

  let newTo = toIsoDate(new Date(parseIso(newFrom).getTime() + spanMs));

  if (newTo < newFrom) newTo = newFrom;
  if (newTo > today) newTo = today;
  if (newFrom > today) return newFrom;

  return newTo;
}

export function clampStartDate(value: string): string {
  const today = todayIso();
  if (!value) return daysAgoIso(DEFAULT_REPORT_RANGE_DAYS);
  return value > today ? today : value;
}

export function clampEndDate(value: string, from: string): string {
  const today = todayIso();
  if (!value) return today;
  let to = value > today ? today : value;
  if (from && to < from) to = from;
  return to;
}

export type ReportRangePreset = "7d" | "30d" | "month" | "all";

export function rangeForPreset(preset: ReportRangePreset): { from: string; to: string } {
  const today = todayIso();
  if (preset === "7d") return { from: daysAgoIso(7), to: today };
  if (preset === "30d") return defaultReportRange();
  if (preset === "month") {
    const d = new Date();
    const from = toIsoDate(new Date(d.getFullYear(), d.getMonth(), 1));
    return { from, to: today };
  }
  return { from: "1970-01-01", to: today };
}
