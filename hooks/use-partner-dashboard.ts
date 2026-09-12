"use client";

/** `/partner` home data (backlog 4.17) — wraps `GET /api/partner/dashboard`. */
import { useQuery } from "@tanstack/react-query";
import type { PartnerType } from "@/hooks/use-partner-me";

export type PartnerDashboardRestockItem = {
  id: string;
  status: string;
  createdAt: string;
  counterpartyName: string;
  itemCount: number;
};

export type PartnerDashboardLowStockLine = {
  variantId: string;
  productName: string;
  productSlug: string;
  variantName: string;
  sellable: number;
};

export type PartnerDashboardResponse = {
  partnerType: PartnerType;
  lowStockThreshold: number;
  orders: {
    CREATED: number;
    CONFIRMED: number;
    PROCESSING: number;
    READY_TO_SHIP: number;
    shippedToday: number;
  };
  lowStockCount: number;
  outOfStockCount: number;
  topLowStockLines: PartnerDashboardLowStockLine[];
  restock: {
    pendingCount: number;
    recent: PartnerDashboardRestockItem[];
  };
  activeDistributorCount: number | null;
};

type ApiEnvelope<T> = { data?: T; error?: { message?: string } };

async function fetchPartnerDashboard(): Promise<PartnerDashboardResponse> {
  const res = await fetch("/api/partner/dashboard", { credentials: "include" });
  const json = (await res.json().catch(() => null)) as ApiEnvelope<PartnerDashboardResponse> | null;
  if (!res.ok || !json?.data) {
    throw new Error(json?.error?.message ?? "تعذر تحميل بيانات لوحة التحكم");
  }
  return json.data;
}

export function usePartnerDashboard() {
  return useQuery({
    queryKey: ["partner-dashboard"],
    queryFn: fetchPartnerDashboard,
    staleTime: 30_000,
  });
}
