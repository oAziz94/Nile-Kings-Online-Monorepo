"use client";

/**
 * Single TanStack Query hook resolving `/api/partner/me` (backlog 4.16, standing rule 3:
 * "partner identity comes from one `usePartnerMe()` TanStack Query hook, never a per-page
 * `/api/partner/me` fetch"). `PartnerShell` is the primary consumer; any future page that
 * needs the partner's identity/role should call this hook rather than fetching directly.
 *
 * Contract for callers (kept small/typed/documented — consumed by 4.17–4.23):
 *   const { data, isLoading, isError, refetch } = usePartnerMe();
 *   data?.partnerType   -> "AGENT" | "DISTRIBUTOR" | undefined (undefined while loading/on error)
 *   data?.name/phone/id/governorate/linkedAgentId/isActive -> Partner row fields, as-is
 *
 * `staleTime` 5 minutes per the task brief — the partner's own type/name/phone essentially
 * never changes mid-session, so this avoids a refetch on every route change/window focus
 * while still allowing `refetch()` for the shell's failure-state retry action.
 */
import { useQuery } from "@tanstack/react-query";

export type PartnerType = "AGENT" | "DISTRIBUTOR";

export type PartnerMe = {
  id: string;
  name: string;
  phone: string;
  partnerType: PartnerType;
  governorate: string;
  linkedAgentId: string | null;
  isActive: boolean;
};

type ApiEnvelope<T> = { data?: T; error?: { message?: string } };

async function fetchPartnerMe(): Promise<PartnerMe> {
  const res = await fetch("/api/partner/me", { credentials: "include" });
  const json = (await res.json().catch(() => null)) as ApiEnvelope<{ partner: PartnerMe | null }> | null;
  if (!res.ok || !json?.data?.partner) {
    throw new Error(json?.error?.message ?? "تعذر تحميل بيانات الشريك");
  }
  const partner = json.data.partner;
  if (partner.partnerType !== "AGENT" && partner.partnerType !== "DISTRIBUTOR") {
    throw new Error("نوع شريك غير معروف");
  }
  return partner;
}

export function usePartnerMe() {
  return useQuery({
    queryKey: ["partner-me"],
    queryFn: fetchPartnerMe,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}
