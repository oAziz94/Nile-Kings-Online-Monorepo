"use client";

/**
 * Partner — الشبكة (backlog 5.5, `05-partner-portal-v2.md` §4.5). AGENT-only roster of
 * every linked DISTRIBUTOR, rebuilt as cards (name, phone ltr, active pill, sellable
 * units, pending requests, last activity) per the `.card`/`.pill`/`.well` vocabulary from
 * `design-canvas/partner-v2/{Main,Stock}.dc.html` — there is no dedicated network
 * artboard. Each card opens a `Sheet` (side="right") with the distributor's stock, their
 * restock requests (agent actions unchanged), and their fill rate.
 *
 * Role gate: `GET /api/partner/distributors` 403s a non-AGENT server-side (unchanged);
 * this page also gates client-side via `usePartnerMe()` (standing rule 3) to render the
 * explicit "هذه الصفحة متاحة للوكلاء فقط" panel instead of an empty grid.
 */
import * as React from "react";
import { AlertTriangle, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, StatusBadge } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/shared/skeleton";
import { PartnerRoleGatePanel } from "@/components/partner/role-gate-panel";
import { RosterCard, type RosterDistributor } from "@/components/partner/network/roster-card";
import { usePartnerMe } from "@/hooks/use-partner-me";
import { cn } from "@/lib/utils";

type ApiEnvelope<T> = { success?: boolean; data?: T; error?: { message?: string } };

type DistributorRow = {
  id: string;
  name: string;
  phone: string;
  isActive: boolean;
  inventoryTotals: { sellable: number };
  pendingRequestsCount: number;
  lastActivityAt: string | null;
};

async function fetchDistributors(): Promise<RosterDistributor[]> {
  const res = await fetch("/api/partner/distributors", { credentials: "include" });
  const json = (await res.json().catch(() => null)) as ApiEnvelope<{ distributors: DistributorRow[] }> | null;
  if (!res.ok || !json?.success) {
    throw new Error(json?.error?.message ?? "فشل تحميل الموزعين");
  }
  return (json.data?.distributors ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    phone: d.phone,
    isActive: d.isActive,
    sellableUnits: d.inventoryTotals.sellable,
    pendingRequestsCount: d.pendingRequestsCount,
    lastActivityAt: d.lastActivityAt,
  }));
}

function LoadErrorPanel({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-white p-10 text-center shadow-soft"
    >
      <AlertTriangle className="h-9 w-9 text-danger-text" strokeWidth={1.5} />
      <p className="text-[15px] font-extrabold text-danger-text">فشل تحميل الموزعين</p>
      <Button type="button" variant="outline" className="mt-2 rounded-xl" onClick={onRetry}>
        إعادة المحاولة
      </Button>
    </div>
  );
}

export default function PartnerNetworkPage() {
  const { data: partner, isLoading: partnerLoading, isError: partnerError, refetch: refetchPartner } =
    usePartnerMe();

  const isAgent = partner?.partnerType === "AGENT";

  const {
    data: distributors,
    isLoading: listLoading,
    isFetching: listFetching,
    isError: listError,
    refetch: refetchList,
  } = useQuery({
    queryKey: ["partner-distributors"],
    queryFn: fetchDistributors,
    enabled: isAgent,
  });

  let body: React.ReactNode;

  if (partnerLoading) {
    body = (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-44 w-full rounded-2xl" />
        ))}
      </div>
    );
  } else if (partnerError) {
    body = <LoadErrorPanel onRetry={() => refetchPartner()} />;
  } else if (!isAgent) {
    body = <PartnerRoleGatePanel allowedRole="AGENT" />;
  } else if (listLoading) {
    body = (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-44 w-full rounded-2xl" />
        ))}
      </div>
    );
  } else if (listError) {
    body = <LoadErrorPanel onRetry={() => refetchList()} />;
  } else if (!distributors || distributors.length === 0) {
    body = <EmptyState icon={<Users className="h-10 w-10" />} title="لا يوجد موزعون مرتبطون بعد" />;
  } else {
    body = (
      <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3", listFetching && "opacity-70")}>
        {distributors.map((distributor) => (
          <RosterCard key={distributor.id} distributor={distributor} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="الشبكة"
        description="حالة كل موزع مرتبط بك — مخزونه وطلباته ومعدّل تنفيذك لها."
        badge={<StatusBadge>وكلاء فقط</StatusBadge>}
        actions={
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            onClick={() => refetchList()}
            disabled={!isAgent || listFetching}
          >
            تحديث
          </Button>
        }
      />
      {body}
    </div>
  );
}
