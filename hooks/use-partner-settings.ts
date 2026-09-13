"use client";

/**
 * `/partner/settings` data (backlog 4.17, extended 5.1). Wraps `GET`/`PATCH
 * /api/partner/settings` (working profile) and `GET`/`PUT /api/partner/settings/thresholds`
 * (category/product low-stock overrides). `costRateBps` is read-only here by design —
 * `useUpdatePartnerSettings` never sends it (rule 18).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type HandoverMethod = "COURIER" | "PICKUP" | "OWN_DELIVERY";

export type PartnerSettings = {
  lowStockThreshold: number;
  workingDays: string[];
  dailyOrderCapacity: number | null;
  confirmSlaHours: number;
  shipSlaHours: number;
  handoverMethod: HandoverMethod;
  serviceAreas: Record<string, string[]> | null;
  alertPrefs: Record<string, boolean> | null;
  costRateBps: number;
  marginBps: number;
  paymentMethodLabel: string;
  /** Reports platform (backlog 5.6a) — inventory report settings. */
  deadStockDays: number;
  targetCoverDays: number;
};

export type PartnerSettingsPatch = Partial<
  Omit<PartnerSettings, "costRateBps" | "marginBps" | "paymentMethodLabel">
>;

type ApiEnvelope<T> = { data?: T; error?: { message?: string } };

async function fetchPartnerSettings(): Promise<PartnerSettings> {
  const res = await fetch("/api/partner/settings", { credentials: "include" });
  const json = (await res.json().catch(() => null)) as ApiEnvelope<PartnerSettings> | null;
  if (!res.ok || !json?.data) {
    throw new Error(json?.error?.message ?? "تعذر تحميل الإعدادات");
  }
  return json.data;
}

export function usePartnerSettings() {
  return useQuery({
    queryKey: ["partner-settings"],
    queryFn: fetchPartnerSettings,
  });
}

export function useUpdatePartnerSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: PartnerSettingsPatch) => {
      const res = await fetch("/api/partner/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = (await res.json().catch(() => null)) as ApiEnvelope<PartnerSettings> | null;
      if (!res.ok || !json?.data) {
        throw new Error(json?.error?.message ?? "تعذر حفظ الإعدادات");
      }
      return json.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["partner-settings"], data);
      queryClient.invalidateQueries({ queryKey: ["partner-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["partner-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["partner-today"] });
    },
  });
}

export type ThresholdsData = {
  categories: { categoryId: string; name: string; threshold: number | null }[];
  productOverrides: { productId: string; name: string; threshold: number }[];
};

async function fetchThresholds(): Promise<ThresholdsData> {
  const res = await fetch("/api/partner/settings/thresholds", { credentials: "include" });
  const json = (await res.json().catch(() => null)) as ApiEnvelope<ThresholdsData> | null;
  if (!res.ok || !json?.data) {
    throw new Error(json?.error?.message ?? "تعذر تحميل حدود المخزون");
  }
  return json.data;
}

export function usePartnerThresholds() {
  return useQuery({
    queryKey: ["partner-settings-thresholds"],
    queryFn: fetchThresholds,
  });
}

export function useUpdatePartnerThresholds() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      categoryThresholds: Record<string, number | null>;
      productThresholds: { productId: string; threshold: number }[];
    }) => {
      const res = await fetch("/api/partner/settings/thresholds", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = (await res.json().catch(() => null)) as ApiEnvelope<{ ok: true }> | null;
      if (!res.ok || !json?.data) {
        throw new Error(json?.error?.message ?? "تعذر حفظ حدود المخزون");
      }
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner-settings-thresholds"] });
      queryClient.invalidateQueries({ queryKey: ["partner-dashboard"] });
    },
  });
}
