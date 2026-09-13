"use client";

/** اليوم screen data (backlog 9.2) — wraps `GET /api/admin/today`. */
import { useQuery } from "@tanstack/react-query";
import type { AdminTodayResponse } from "@/lib/admin/today";

export type { AdminTodayResponse };

type ApiEnvelope<T> = { data?: T; error?: { message?: string } };

async function fetchAdminToday(): Promise<AdminTodayResponse> {
  const res = await fetch("/api/admin/today", { credentials: "include" });
  const json = (await res.json().catch(() => null)) as ApiEnvelope<AdminTodayResponse> | null;
  if (!res.ok || !json?.data) {
    throw new Error(json?.error?.message ?? "تعذر تحميل بيانات اليوم");
  }
  return json.data;
}

export function useAdminToday() {
  return useQuery({
    queryKey: ["admin-today"],
    queryFn: fetchAdminToday,
    staleTime: 30_000,
  });
}
