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
