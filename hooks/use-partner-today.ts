"use client";

/** اليوم screen data (backlog 5.2) — wraps `GET /api/partner/today`. */
import { useQuery } from "@tanstack/react-query";
import type { PartnerType } from "@/hooks/use-partner-me";

export type PartnerTodayOrderRow = {
  id: string;
  customerName: string;
  addressLine: string;
  totalPiastres: number;
  enteredAt: string;
  status: "CREATED" | "CONFIRMED" | "PROCESSING" | "READY_TO_SHIP";
};

export type PartnerTodayRestockRow = {
  id: string;
  counterpartyName: string;
  itemCount: number;
  occurredAt: string;
};

export type PartnerTodayStockRow = {
  variantId: string;
  productName: string;
  variantName: string;
  sellable: number;
  threshold: number;
};

export type PartnerTodayGroup<T> = { count: number; rows: T[]; moreCount: number };

export type PartnerTodayTrendPoint = { date: string; revenuePiastres: number; orderCount: number };

export type PartnerTodayResponse = {
  partnerType: PartnerType;
  partnerName: string;
  workingDay: boolean;
  capacity: { used: number; capacity: number | null; remaining: number | null };
  kpis: {
    ordersToday: number;
    ordersYesterday: number;
    revenueThisWeekPiastres: number;
    revenueLastWeekPiastres: number;
    sellableUnits: number;
    underThresholdCount: number;
    overdueCount: number;
  };
  queue: {
    toConfirm: PartnerTodayGroup<PartnerTodayOrderRow>;
    overdue: PartnerTodayGroup<PartnerTodayOrderRow>;
    readyToShip: PartnerTodayGroup<PartnerTodayOrderRow>;
    confirmed: PartnerTodayGroup<PartnerTodayOrderRow>;
    restock: PartnerTodayGroup<PartnerTodayRestockRow>;
    lowStock: PartnerTodayGroup<PartnerTodayStockRow>;
  };
  trend: PartnerTodayTrendPoint[];
  previousTrend: PartnerTodayTrendPoint[];
  trendDeltaPercent: number | null;
  trendError: boolean;
};

type ApiEnvelope<T> = { data?: T; error?: { message?: string } };

async function fetchPartnerToday(): Promise<PartnerTodayResponse> {
  const res = await fetch("/api/partner/today", { credentials: "include" });
  const json = (await res.json().catch(() => null)) as ApiEnvelope<PartnerTodayResponse> | null;
  if (!res.ok || !json?.data) {
    throw new Error(json?.error?.message ?? "تعذر تحميل بيانات اليوم");
  }
  return json.data;
}

export function usePartnerToday() {
  return useQuery({
    queryKey: ["partner-today"],
    queryFn: fetchPartnerToday,
    staleTime: 30_000,
  });
}
