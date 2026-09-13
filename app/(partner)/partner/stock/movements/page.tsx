"use client";

/**
 * "الحركات" tab (backlog 5.4, `05-partner-portal-v2.md` §4.4): `GET
 * /api/partner/inventory/ledger` over `InventoryLedger`, period + reason filters, and a
 * per-variant running balance already computed server-side. Server pagination, page size 50
 * (the API's fixed page size — the movements tab does not offer a page-size picker).
 */
import * as React from "react";
import { AlertTriangle, RefreshCw, Truck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PaginationBar } from "@/components/dashboard/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { Select } from "@/components/ui/select";
import { useListUrlState } from "@/hooks/use-list-url-state";
import { formatDateEn, formatNumberEn } from "@/lib/format-en-numbers";
import { cn } from "@/lib/utils";

type LedgerRow = {
  id: string;
  variantId: string;
  sku: string;
  product: string;
  variant: string;
  reason: string;
  quantityAvailableDelta: number;
  quantityReservedDelta: number;
  notes: string | null;
  createdAt: string;
  runningBalance: number | null;
};

const REASONS: { value: string; label: string }[] = [
  { value: "", label: "كل الأسباب" },
  { value: "MANUAL_ADJUSTMENT", label: "تعديل يدوي" },
  { value: "ORDER_RESERVE", label: "حجز طلب" },
  { value: "ORDER_COMMIT", label: "تنفيذ طلب" },
  { value: "ORDER_RELEASE", label: "تحرير حجز" },
  { value: "ORDER_RESTORE", label: "استرجاع طلب" },
  { value: "TRANSFER_IN", label: "تحويل وارد" },
  { value: "TRANSFER_OUT", label: "تحويل صادر" },
  { value: "RESTOCK_REQUEST_CREATE", label: "طلب توريد" },
  { value: "RESTOCK_REQUEST_FULFILL", label: "تنفيذ توريد" },
  { value: "FACTORY_RECEIPT", label: "استلام من المصنع" },
  { value: "STOCK_COUNT", label: "جرد فعلي" },
  { value: "LEGACY_BACKFILL", label: "تسوية سابقة" },
];

async function fetchLedger(params: URLSearchParams): Promise<{ rows: LedgerRow[]; total: number; pageSize: number }> {
  const res = await fetch(`/api/partner/inventory/ledger?${params}`, { credentials: "include" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(json?.error?.message ?? "فشل تحميل الحركات");
  }
  return json.data;
}

export default function PartnerStockMovementsTab() {
  return (
    <React.Suspense fallback={null}>
      <PartnerStockMovementsTabInner />
    </React.Suspense>
  );
}

function PartnerStockMovementsTabInner() {
  const { page, setPage, filters, setFilter } = useListUrlState({ from: "", to: "", reason: "" });

  const params = React.useMemo(() => {
    const p = new URLSearchParams({ page: String(page) });
    if (filters.from) p.set("from", filters.from);
    if (filters.to) p.set("to", filters.to);
    if (filters.reason) p.set("reason", filters.reason);
    return p;
  }, [page, filters.from, filters.to, filters.reason]);

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ["partner-inventory-ledger", params.toString()],
    queryFn: () => fetchLedger(params),
  });

  const columns = React.useMemo<ColumnDef<LedgerRow, unknown>[]>(
    () => [
      { id: "createdAt", header: "التاريخ", enableSorting: false, cell: ({ row }) => formatDateEn(row.original.createdAt) },
      {
        id: "sku",
        header: "الصنف",
        enableSorting: false,
        cell: ({ row }) => (
          <div>
            <div className="font-bold text-ink">{row.original.product}</div>
            <div className="text-xs text-ink-soft" dir="ltr">
              {row.original.variant} · {row.original.sku}
            </div>
          </div>
        ),
      },
      {
        id: "reason",
        header: "السبب",
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant="neutral">{REASONS.find((r) => r.value === row.original.reason)?.label ?? row.original.reason}</Badge>
        ),
      },
      {
        id: "delta",
        header: "الحركة",
        enableSorting: false,
        cell: ({ row }) => {
          const delta = row.original.quantityAvailableDelta;
          return (
            <span dir="ltr" className={cn("font-extrabold", delta >= 0 ? "text-malachite-text" : "text-carnelian-600")}>
              {delta >= 0 ? "+" : ""}
              {formatNumberEn(delta)}
            </span>
          );
        },
      },
      {
        id: "runningBalance",
        header: "الرصيد",
        enableSorting: false,
        cell: ({ row }) => (
          <span dir="ltr" className="font-bold">
            {row.original.runningBalance !== null ? formatNumberEn(row.original.runningBalance) : "—"}
          </span>
        ),
      },
      { id: "notes", header: "ملاحظات", enableSorting: false, cell: ({ row }) => row.original.notes ?? "—" },
    ],
    []
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-ink-soft">
          من
          <input
            type="date"
            value={filters.from}
            onChange={(e) => setFilter("from", e.target.value)}
            className="h-9 rounded-lg border border-stone-200 px-2 text-xs"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-ink-soft">
          إلى
          <input
            type="date"
            value={filters.to}
            onChange={(e) => setFilter("to", e.target.value)}
            className="h-9 rounded-lg border border-stone-200 px-2 text-xs"
          />
        </label>
        <Select
          aria-label="السبب"
          value={filters.reason}
          onChange={(e) => setFilter("reason", e.target.value)}
          className="h-9 w-auto rounded-lg"
        >
          {REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
        <Button type="button" variant="outline" size="sm" className="mr-auto rounded-lg" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          تحديث
        </Button>
      </div>

      {isError ? (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-carnelian-500/30 bg-danger-bg p-4 text-danger-text">
          <p className="flex items-center gap-2 text-sm font-bold">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error instanceof Error ? error.message : "فشل تحميل الحركات"}
          </p>
          <Button type="button" size="sm" variant="outline" className="rounded-lg" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
            إعادة المحاولة
          </Button>
        </div>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={data?.rows ?? []}
            getRowId={(row) => row.id}
            loading={isLoading}
            className={cn(isFetching && !isLoading && "opacity-70")}
            emptyIcon={<Truck className="h-8 w-8" strokeWidth={1.5} />}
            emptyTitle="لا توجد حركات مخزون"
          />
          {(data?.total ?? 0) > 0 && (
            <PaginationBar
              className="mt-2"
              page={page}
              pageSize={data?.pageSize ?? 50}
              total={data?.total ?? 0}
              onPageChange={setPage}
              disabled={isFetching}
            />
          )}
        </>
      )}
    </div>
  );
}
