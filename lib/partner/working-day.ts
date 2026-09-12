/**
 * Working-day check (backlog 5.1) — drives اليوم's non-working-day header note and hides
 * the capacity meter (nothing is ever blocked, per `05-partner-portal-v2.md` §4.2). Pure,
 * no Prisma — `Partner.workingDays` is passed in directly by the caller.
 */
export const ISO_DAY_CODES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
export type IsoDayCode = (typeof ISO_DAY_CODES)[number];

/** Maps `Date#getDay()` (0 = Sunday) to the ISO day codes `Partner.workingDays` stores. */
export function isoDayCodeFor(date: Date): IsoDayCode {
  return ISO_DAY_CODES[date.getDay()];
}

export function isWorkingDay(partner: { workingDays: string[] }, date: Date): boolean {
  return partner.workingDays.includes(isoDayCodeFor(date));
}
