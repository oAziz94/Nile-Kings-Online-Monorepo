"use client";

import * as React from "react";
import { AlertTriangle, ClipboardList, Loader2, Package } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/shared/skeleton";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ProductIdentity } from "@/components/dashboard/product-identity";
import { RestockItemLines } from "@/components/partner/restock/item-lines";
import { RestockRequestCard } from "@/components/partner/restock/request-card";
import type { RestockRequest } from "@/components/partner/restock/types";
import { useToast } from "@/hooks/use-toast";
import { formatNumberEn } from "@/lib/format-en-numbers";
import { cn } from "@/lib/utils";

type ApiEnvelope<T> = { success?: boolean; data?: T; error?: { message?: string } };

type StockLine = {
  variant: { id: string; sku: string; name: string; colorName: string | null; product: { name: string } };
  stockAvailable: number;
  stockReserved: number;
  sellable: number;
};

async function fetchDistributorStock(distributorId: string): Promise<StockLine[]> {
  const res = await fetch(`/api/partner/distributors/${distributorId}/stock`, { credentials: "include" });
  const json = (await res.json().catch(() => null)) as ApiEnvelope<{ stock: StockLine[] }> | null;
  if (!res.ok || !json?.success) {
    throw new Error(json?.error?.message ?? "فشل تحميل مخزون الموزع");
  }
  return json.data?.stock ?? [];
}

async function fetchAllRequests(): Promise<RestockRequest[]> {
  const res = await fetch("/api/partner/restock-requests", { credentials: "include" });
  const json = (await res.json().catch(() => null)) as ApiEnvelope<{ requests: RestockRequest[] }> | null;
  if (!res.ok || !json?.success) {
    throw new Error(json?.error?.message ?? "فشل تحميل طلبات التوريد");
  }
  return json.data?.requests ?? [];
}

type Action = "approve" | "reject" | "fulfill";

async function patchRequest(id: string, action: Action, responseNotes: string | null) {
  const res = await fetch(`/api/partner/restock-requests/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action, responseNotes }),
  });
  const json = (await res.json().catch(() => null)) as ApiEnvelope<unknown> | null;
  if (!res.ok || !json?.success) {
    throw new Error(json?.error?.message ?? "فشل تحديث الطلب");
  }
  return json.data;
}

function FillRateStrip({ requests }: { requests: RestockRequest[] }) {
  // Backlog 5.5: `RestockRequestItem` carries no fulfilled-quantity field (verified against
  // `prisma/schema.prisma`) — fill rate is requested units on FULFILLED requests ÷ requested
  // units on every non-CANCELLED request, per the task's fallback rule.
  const fulfilledUnits = requests
    .filter((r) => r.status === "FULFILLED")
    .reduce((sum, r) => sum + r.items.reduce((s, i) => s + i.quantity, 0), 0);
  const eligibleUnits = requests
    .filter((r) => r.status !== "CANCELLED")
    .reduce((sum, r) => sum + r.items.reduce((s, i) => s + i.quantity, 0), 0);
  const rate = eligibleUnits > 0 ? Math.round((fulfilledUnits / eligibleUnits) * 100) : null;

  return (
    <div className="flex items-center justify-between rounded-2xl bg-stone-50 px-4 py-3">
      <span className="text-xs font-bold text-ink-soft">معدّل التنفيذ (وحدات مطلوبة)</span>
      <span dir="ltr" className="text-sm font-extrabold text-ink">
        {rate === null ? "—" : `${rate}%`}
      </span>
    </div>
  );
}

function StockTable({
  loading,
  isError,
  onRetry,
  stock,
}: {
  loading: boolean;
  isError: boolean;
  onRetry: () => void;
  stock: StockLine[];
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" />
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <div role="alert" className="rounded-xl bg-danger-bg p-3 text-sm text-danger-text">
        <p className="flex items-center gap-2 font-bold">
          <AlertTriangle className="h-4 w-4" />
          فشل تحميل مخزون الموزع
        </p>
        <button type="button" onClick={onRetry} className="mt-2 text-xs font-bold underline underline-offset-2">
          إعادة المحاولة
        </button>
      </div>
    );
  }
  if (stock.length === 0) {
    return <EmptyState icon={<Package className="h-8 w-8" />} title="لا يوجد مخزون مسجل لهذا الموزع" />;
  }
  return (
    <div className="overflow-hidden rounded-xl border border-stone-100">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-stone-50 text-xs font-extrabold text-ink-soft">
            <th className="px-3 py-2 text-right">الصنف</th>
            <th className="px-3 py-2 text-right">متاح</th>
            <th className="px-3 py-2 text-right">محجوز</th>
            <th className="px-3 py-2 text-right">قابل للبيع</th>
          </tr>
        </thead>
        <tbody>
          {stock.map((line) => (
            <tr key={line.variant.id} className="border-t border-stone-100">
              <td className="px-3 py-2">
                <ProductIdentity
                  name={
                    <>
                      {line.variant.product.name}
                      {line.variant.colorName ? ` · ${line.variant.colorName}` : ""}
                    </>
                  }
                  identifier={line.variant.sku}
                  nameClassName="font-bold text-ink"
                />
              </td>
              <td dir="ltr" className="px-3 py-2 text-right">
                {formatNumberEn(line.stockAvailable)}
              </td>
              <td dir="ltr" className="px-3 py-2 text-right text-ink-soft">
                {formatNumberEn(line.stockReserved)}
              </td>
              <td dir="ltr" className="px-3 py-2 text-right font-extrabold">
                {formatNumberEn(line.sellable)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Backlog 5.5 — the network detail sheet's body: fill rate, the distributor's stock table,
 * and their restock requests with the agent's approve/reject/fulfil actions. No new
 * mutations — `PATCH /api/partner/restock-requests/[id]` is unchanged. The fulfil
 * confirmation is inline (not a nested `Dialog`) because `components/ui/dialog.tsx`'s
 * overlay is hard-coded to `z-50`, below the `Sheet`'s `z-[110]` — a modal-in-modal here
 * would render its overlay/content underneath the sheet, so the confirmation step is a
 * plain expand within the request card's row instead of a second portal.
 */
export function DistributorDetail({
  distributorId,
  open,
}: {
  distributorId: string;
  open: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [responseDrafts, setResponseDrafts] = React.useState<Record<string, string>>({});
  const [confirmingId, setConfirmingId] = React.useState<string | null>(null);

  const stockQuery = useQuery({
    queryKey: ["partner-network-stock", distributorId],
    queryFn: () => fetchDistributorStock(distributorId),
    enabled: open,
  });

  const requestsQuery = useQuery({
    queryKey: ["partner-restock-requests", "agent"],
    queryFn: fetchAllRequests,
    enabled: open,
  });

  const distributorRequests = React.useMemo(
    () => (requestsQuery.data ?? []).filter((r) => r.destinationPartner.id === distributorId),
    [requestsQuery.data, distributorId]
  );

  const mutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: Action }) =>
      patchRequest(id, action, responseDrafts[id]?.trim() || null),
    onSuccess: () => {
      toast({ title: "تم تحديث طلب الموزع" });
      queryClient.invalidateQueries({ queryKey: ["partner-restock-requests", "agent"] });
      queryClient.invalidateQueries({ queryKey: ["partner-distributors"] });
      setConfirmingId(null);
    },
    onError: (error: unknown) => {
      toast({
        title: error instanceof Error ? error.message : "فشل تحديث الطلب",
        variant: "destructive",
      });
    },
  });

  function draftFor(request: RestockRequest) {
    return responseDrafts[request.id] ?? request.responseNotes ?? "";
  }

  const updatingId = mutation.isPending ? mutation.variables?.id ?? null : null;
  const confirmingRequest = distributorRequests.find((r) => r.id === confirmingId) ?? null;

  return (
    <div className="flex flex-col gap-5 overflow-y-auto p-4">
      <FillRateStrip requests={distributorRequests} />

      <div>
        <h3 className="mb-2 text-sm font-extrabold text-ink">المخزون لدى الموزع</h3>
        <StockTable
          loading={stockQuery.isLoading}
          isError={stockQuery.isError}
          onRetry={() => stockQuery.refetch()}
          stock={stockQuery.data ?? []}
        />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-extrabold text-ink">طلبات التوريد</h3>
        {requestsQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-2xl" />
            ))}
          </div>
        ) : requestsQuery.isError ? (
          <div role="alert" className="rounded-xl bg-danger-bg p-3 text-sm text-danger-text">
            <p className="flex items-center gap-2 font-bold">
              <AlertTriangle className="h-4 w-4" />
              فشل تحميل الطلبات
            </p>
            <button
              type="button"
              onClick={() => requestsQuery.refetch()}
              className="mt-2 text-xs font-bold underline underline-offset-2"
            >
              إعادة المحاولة
            </button>
          </div>
        ) : distributorRequests.length === 0 ? (
          <EmptyState icon={<ClipboardList className="h-8 w-8" />} title="لا توجد طلبات توريد من هذا الموزع" />
        ) : (
          <div className={cn("space-y-3", requestsQuery.isFetching && "opacity-70")}>
            {distributorRequests.map((request) => (
              <div key={request.id} className="space-y-2">
                <RestockRequestCard
                  request={request}
                  responseDraft={draftFor(request)}
                  onDraftChange={(value) =>
                    setResponseDrafts((current) => ({ ...current, [request.id]: value }))
                  }
                  onApprove={() => mutation.mutate({ id: request.id, action: "approve" })}
                  onReject={() => mutation.mutate({ id: request.id, action: "reject" })}
                  onFulfillClick={() => setConfirmingId(request.id)}
                  updating={updatingId === request.id}
                />
                {confirmingRequest?.id === request.id && (
                  <div className="rounded-xl border border-gold-500/40 bg-gold-50 p-3">
                    <p className="text-xs font-bold text-ink">
                      تأكيد نقل الكميات التالية من مخزونك إلى مخزون {request.destinationPartner.name}؟
                    </p>
                    <RestockItemLines items={request.items} dense className="mt-2" />
                    <div className="mt-3 flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-lg"
                        onClick={() => setConfirmingId(null)}
                      >
                        إلغاء
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="rounded-lg"
                        disabled={mutation.isPending}
                        onClick={() => mutation.mutate({ id: request.id, action: "fulfill" })}
                      >
                        {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        تأكيد ونقل المخزون
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
