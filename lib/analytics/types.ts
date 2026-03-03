/** Analytics date granularity and range */

export type DateGranularity = "day" | "week" | "month";

export type AnalyticsDateRange = {
  from: Date;
  to: Date;
};

export const CONFIRMED_ORDER_STATUSES = [
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
] as const;

export type ConfirmedOrderStatus = (typeof CONFIRMED_ORDER_STATUSES)[number];
