"use client";

/**
 * Partner alerts feed (backlog 4.17) — wraps `GET /api/partner/alerts` and
 * `POST /api/partner/alerts/seen` for the topbar bell (`partner-alerts-bell.tsx`) and the
 * `/partner` home page's attention panels.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PartnerAlertKind } from "@/app/api/partner/alerts/route";

export type { PartnerAlertKind };

export type PartnerAlert = {
  id: string;
  kind: PartnerAlertKind;
  message: string;
  href: string;
  occurredAt: string;
};

export type PartnerAlertsResponse = {
  alerts: PartnerAlert[];
  unseenCount: number;
  alertsSeenAt: string | null;
};

type ApiEnvelope<T> = { data?: T; error?: { message?: string } };

async function fetchPartnerAlerts(): Promise<PartnerAlertsResponse> {
  const res = await fetch("/api/partner/alerts", { credentials: "include" });
  const json = (await res.json().catch(() => null)) as ApiEnvelope<PartnerAlertsResponse> | null;
  if (!res.ok || !json?.data) {
    throw new Error(json?.error?.message ?? "تعذر تحميل التنبيهات");
  }
  return json.data;
}

export function usePartnerAlerts() {
  return useQuery({
    queryKey: ["partner-alerts"],
    queryFn: fetchPartnerAlerts,
    staleTime: 30_000,
  });
}

export function useMarkPartnerAlertsSeen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/partner/alerts/seen", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("تعذر تحديث التنبيهات");
      return res.json();
    },
    onSuccess: () => {
      queryClient.setQueryData<PartnerAlertsResponse | undefined>(["partner-alerts"], (prev) =>
        prev ? { ...prev, unseenCount: 0, alertsSeenAt: new Date().toISOString() } : prev
      );
      queryClient.invalidateQueries({ queryKey: ["partner-alerts"] });
    },
  });
}
