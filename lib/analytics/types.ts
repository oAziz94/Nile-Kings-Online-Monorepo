/** Analytics date granularity and range */

export type DateGranularity = "day" | "week" | "month";

export type AnalyticsDateRange = {
  from: Date;
  to: Date;
};

/** Only delivered orders count toward financial reporting. */
export const REPORT_ORDER_STATUS = "DELIVERED" as const;
