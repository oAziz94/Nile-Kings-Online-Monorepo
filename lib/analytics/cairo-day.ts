/**
 * Africa/Cairo calendar-day helpers (backlog 7.5 — the daily stock-snapshot cron). Egypt
 * reinstated seasonal DST in 2023 (UTC+3 roughly late April–late October, UTC+2 the rest of
 * the year) — the backlog line's own "22:05 UTC = 00:05 Cairo" note assumed the older
 * fixed-UTC+2 rule, which no longer holds for the whole year. Every helper here goes
 * through `Intl.DateTimeFormat` with an explicit `timeZone`, so it stays correct across
 * both the winter and summer offset regardless of which one is in effect when the cron
 * actually runs.
 *
 * Pure — no Prisma — so every function here is directly unit-testable.
 */

const CAIRO_TZ = "Africa/Cairo";

const cairoDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: CAIRO_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The Africa/Cairo calendar date (`YYYY-MM-DD`) that a given instant falls on. */
export function cairoDateIso(date: Date): string {
  return cairoDateFormatter.format(date);
}

const cairoOffsetFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: CAIRO_TZ,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Africa/Cairo's UTC offset, in minutes, at the given instant (positive = ahead of UTC). */
function cairoOffsetMinutesAt(instant: Date): number {
  const parts = cairoOffsetFormatter.formatToParts(instant).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  // `hour` can read "24" for local midnight in some ICU versions — normalise to 0.
  const hour = Number(parts.hour) % 24;
  const asIfUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), hour, Number(parts.minute), Number(parts.second));
  return Math.round((asIfUtc - instant.getTime()) / 60_000);
}

/** `iso` shifted by `days` (may be negative), using UTC calendar arithmetic — safe for any
 * server timezone since it never touches the local `Date` fields. */
export function addDaysIsoUtc(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Yesterday's Africa/Cairo calendar date, relative to `now` (defaults to the real now). */
export function cairoYesterdayIso(now: Date = new Date()): string {
  return addDaysIsoUtc(cairoDateIso(now), -1);
}

/** A UTC midnight `Date` for the given calendar day — the value stored in
 * `PartnerStockSnapshot.day` (`@db.Date`, which truncates time-of-day regardless; UTC
 * midnight just avoids any local-timezone ambiguity when constructing it). */
export function dayIsoToDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/**
 * The correct UTC instant for 00:00:00.000 Cairo-local time on the given calendar day —
 * backlog 9.2's "طلبات اليوم vs أمس" KPI needs a Cairo calendar-day window, not a UTC one.
 * Same DST-safe offset lookup as `cairoEndOfDayUtc` below.
 */
export function cairoStartOfDayUtc(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  const middayGuessUtc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const offsetMin = cairoOffsetMinutesAt(middayGuessUtc);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) - offsetMin * 60_000);
}

/** The correct UTC instant for 23:59:59.999 Cairo-local time on the given calendar day —
 * the reference instant the cron computes "yesterday"'s totals as of. Derives the real
 * offset (via `cairoOffsetMinutesAt`, sampled at that day's midday to avoid any ambiguity
 * right at a DST transition) rather than assuming a fixed UTC+2. */
export function cairoEndOfDayUtc(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  const middayGuessUtc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const offsetMin = cairoOffsetMinutesAt(middayGuessUtc);
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999) - offsetMin * 60_000);
}

/**
 * Whole-day difference `targetIso - candidateIso` (both `YYYY-MM-DD`), for the
 * nearest-snapshot-within-N-days lookup. Positive means the candidate is before the target.
 */
export function daysBetweenIso(candidateIso: string, targetIso: string): number {
  const [cy, cm, cd] = candidateIso.split("-").map(Number);
  const [ty, tm, td] = targetIso.split("-").map(Number);
  const candidate = Date.UTC(cy, cm - 1, cd);
  const target = Date.UTC(ty, tm - 1, td);
  return Math.round((target - candidate) / 86_400_000);
}

/** True when `candidateIso` is on or up to `maxLookbackDays` before `targetIso` — never
 * after it (a snapshot can't be "nearest before" a date it postdates). */
export function isSnapshotWithinLookback(candidateIso: string, targetIso: string, maxLookbackDays = 7): boolean {
  const diff = daysBetweenIso(candidateIso, targetIso);
  return diff >= 0 && diff <= maxLookbackDays;
}

/** Given a set of candidate snapshot days, the nearest one on-or-before `targetIso` within
 * `maxLookbackDays`, or `null` if none qualifies. Pure logic double of the real Prisma
 * query in `partner-stock-totals.ts` (`findNearestStockSnapshot`), kept separately
 * unit-testable without a database. */
export function pickNearestSnapshotDay(candidateIsos: string[], targetIso: string, maxLookbackDays = 7): string | null {
  const usable = candidateIsos.filter((c) => isSnapshotWithinLookback(c, targetIso, maxLookbackDays));
  if (usable.length === 0) return null;
  return usable.sort().reverse()[0];
}
