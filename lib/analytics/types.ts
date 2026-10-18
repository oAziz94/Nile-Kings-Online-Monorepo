/** Analytics date granularity and range */

export type DateGranularity = "day" | "week" | "month";

/** Only delivered orders count toward financial reporting. */
export const REPORT_ORDER_STATUS = "DELIVERED" as const;
