/**
 * Format numbers and dates using English (Western) numerals (0-9) across the site.
 * Use these helpers so no Arabic-Indic digits (٠-٩) appear.
 */

/** Format a number with English numerals (e.g. 1,234.56). */
export function formatNumberEn(value: number): string {
  return value.toLocaleString("en-US");
}

/** Format a date with English numerals; keeps Arabic month names when using ar-EG. */
export function formatDateEn(
  date: Date | string,
  options: Intl.DateTimeFormatOptions = {}
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("ar-EG-u-nu-latn", {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...options,
  });
}

/** Short date for tables (e.g. numeric day/month/year in English digits). */
export function formatDateEnShort(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const CAIRO_TZ = "Africa/Cairo";

const cairoDateSlashFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: CAIRO_TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const cairoTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: CAIRO_TZ,
  hour12: false,
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Order-list date cell (backlog 10.29): the Cairo-local calendar date as `dd/mm/yyyy`
 * and the 24h time as `HH:mm`, both with English (Latin) digits. Two separate strings
 * so the caller can render them on two lines (date, then a muted time line).
 */
export function formatDateEnCairo(date: Date | string): { date: string; time: string } {
  const d = typeof date === "string" ? new Date(date) : date;
  return {
    date: cairoDateSlashFormatter.format(d),
    time: cairoTimeFormatter.format(d),
  };
}
