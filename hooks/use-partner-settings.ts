"use client";

/** `/partner/settings` data (backlog 4.17) — wraps `GET`/`PATCH /api/partner/settings`. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type PartnerSettings = { lowStockThreshold: number };

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
    mutationFn: async (input: PartnerSettings) => {
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
    },
  });
}
