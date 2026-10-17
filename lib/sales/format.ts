/** Display helpers for the counter screen and receipt (backlog 11.3). English digits always. */

export const PAYMENT_METHOD_LABELS: Record<"CASH" | "INSTAPAY" | "CARD", string> = {
  CASH: "نقدي",
  INSTAPAY: "إنستاباي",
  CARD: "بطاقة",
};

export const DEFAULT_RECEIPT_FOOTER = "شكراً لتسوقكم من ملوك النيل";

/** 12500 piastres -> "125" ; 12550 -> "125.5". */
export function formatEgp(piastres: number): string {
  return (piastres / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

const cairoFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Cairo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "17/10/2026 14:05" in Africa/Cairo. */
export function formatSaleDateTime(date: Date | string): string {
  const parts = cairoFormatter.formatToParts(typeof date === "string" ? new Date(date) : date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}
