"use client";

/**
 * Admin identity hook (backlog 9.1 b) — mirrors `usePartnerMe()`'s contract exactly (one
 * TanStack Query hook, `staleTime` 5 minutes, `refetch()` for the shell's failure-state
 * retry action) but resolves `/api/auth/me`, the same endpoint the rest of the app already
 * uses for the logged-in user's identity.
 */
import { useQuery } from "@tanstack/react-query";

export type AdminMe = {
  userId: string;
  phone: string;
  name: string | null;
  role: string;
};

type ApiEnvelope<T> = { data?: T; error?: { message?: string } };

async function fetchAdminMe(): Promise<AdminMe> {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  const json = (await res.json().catch(() => null)) as ApiEnvelope<AdminMe> | null;
  if (!res.ok || !json?.data) {
    throw new Error(json?.error?.message ?? "تعذر تحميل بيانات الحساب");
  }
  return json.data;
}

export function useAdminMe() {
  return useQuery({
    queryKey: ["admin-me"],
    queryFn: fetchAdminMe,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}
