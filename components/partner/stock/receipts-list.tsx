"use client";

/**
 * Shared receipts list body for the "الاستلام من المصنع" (kind=FACTORY) and "الجرد"
 * (kind=COUNT) tabs under `/partner/stock` (backlog 5.4) — same
 * `GET /api/partner/receipts?kind=` list, same table, different kind + copy. AGENT only
 * (the factory ships to agents; distributors receive via restock requests, unchanged).
 */
import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Boxes, Plus, RefreshCw, ShieldAlert } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PaginationBar } from "@/components/dashboard/pagination";
import { Button } from "@/components/ui/button";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { usePartnerMe } from "@/hooks/use-partner-me";
import { useListUrlState } from "@/hooks/use-list-url-state";
import { formatDateEn, formatNumberEn } from "@/lib/format-en-numbers";
import { piastresToEgp } from "@/lib/catalog";
import { cn } from "@/lib/utils";

type ReceiptRow = {
  id: string;
  kind: "FACTORY" | "COUNT";
  reference: string | null;
  notes: string | null;
  createdAt: string;
  lineCount: number;
  totalUnits: number;
  totalCostPiastres: number | null;
};

async function fetchReceipts(
  kind: "FACTORY" | "COUNT",
  limit: number,
  offset: number
): Promise<{ receipts: ReceiptRow[]; total: number }> {
  const params = new URLSearchParams({ kind, limit: String(limit), offset: String(offset) });
  const res = await fetch(`/api/partner/receipts?${params}`, { credentials: "include" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(json?.error?.message ?? "فشل تحميل الإيصالات");
  }
  return json.data;
}

function RoleGatePanel({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-[14px] border border-stone-200 bg-white py-14 text-center">
      <ShieldAlert className="h-9 w-9 text-stone-300" strokeWidth={1.5} />
      <p className="text-[15px] font-extrabold text-ink">{message}</p>
    </div>
  );
}

function LoadErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-2 rounded-[14px] border border-carnelian-500/30 bg-danger-bg py-14 text-center text-danger-text"
    >
      <AlertTriangle className="h-9 w-9" strokeWidth={1.5} />
      <p className="text-[15px] font-extrabold">{message}</p>
      <Button type="button" variant="outline" className="mt-2 rounded-xl" onClick={onRetry}>
        إعادة المحاولة
      </Button>
    </div>
  );
}

export function ReceiptsListTab({ kind }: { kind: "FACTORY" | "COUNT" }) {
  const { data: partner, isLoading: partnerLoading, isError: partnerError, refetch: refetchPartner } =
    usePartnerMe();
  const isAgent = partner?.partnerType === "AGENT";
  const { page, setPage, pageSize, setPageSize } = useListUrlState({});

  const {
    data,
    isLoading: listLoading,
    isFetching: listFetching,
    isError: listError,
    error: listErrorObj,
    refetch: refetchList,
  } = useQuery({
    queryKey: ["partner-receipts", kind, page, pageSize],
    queryFn: () => fetchReceipts(kind, pageSize, page * pageSize),
    enabled: isAgent,
  });

  const columns = React.useMemo<ColumnDef<ReceiptRow, unknown>[]>(
    () => [
      { id: "createdAt", header: "التاريخ", enableSorting: false, cell: ({ row }) => formatDateEn(row.original.createdAt) },
      { id: "reference", header: "المرجع", enableSorting: false, cell: ({ row }) => row.original.reference ?? "—" },
      {
        id: "lineCount",
        header: "عدد البنود",
        enableSorting: false,
        cell: ({ row }) => formatNumberEn(row.original.lineCount),
      },
      {
        id: "totalUnits",
        header: "إجمالي الوحدات",
        enableSorting: false,
        cell: ({ row }) => formatNumberEn(row.original.totalUnits),
      },
      ...(kind === "FACTORY"
        ? [
            {
              id: "totalCost",
              header: "التكلفة",
              enableSorting: false,
              cell: ({ row }: { row: { original: ReceiptRow } }) =>
                row.original.totalCostPiastres != null
                  ? `${formatNumberEn(piastresToEgp(row.original.totalCostPiastres))} ج.م`
                  : "—",
            } satisfies ColumnDef<ReceiptRow, unknown>,
          ]
        : []),
    ],
    [kind]
  );

  const newHref = "/partner/stock/intake/new";

  let body: React.ReactNode;
  if (partnerLoading) {
    body = (
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white p-4">
        <DataTable columns={columns} data={[]} loading />
      </div>
    );
  } else if (partnerError) {
    body = <LoadErrorPanel message="فشل تحميل بيانات الشريك" onRetry={() => refetchPartner()} />;
  } else if (!isAgent) {
    body = <RoleGatePanel message="هذه الصفحة متاحة للوكلاء فقط" />;
  } else if (listError) {
    body = (
      <LoadErrorPanel
        message={listErrorObj instanceof Error ? listErrorObj.message : "فشل تحميل الإيصالات"}
        onRetry={() => refetchList()}
      />
    );
  } else {
    body = (
      <>
        <DataTable
          columns={columns}
          data={data?.receipts ?? []}
          getRowId={(row) => row.id}
          loading={listLoading}
          className={cn(listFetching && !listLoading && "opacity-70")}
          emptyIcon={<Boxes className="h-8 w-8" strokeWidth={1.5} />}
          emptyTitle={kind === "FACTORY" ? "لا توجد استلامات بعد" : "لا توجد عمليات جرد بعد"}
          onRowClick={(row) => {
            window.location.href = `/partner/stock/intake/${row.id}`;
          }}
        />
        {(data?.total ?? 0) > 0 && (
          <PaginationBar
            className="mt-6"
            page={page}
            pageSize={pageSize}
            total={data?.total ?? 0}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            disabled={listFetching}
          />
        )}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">
          {kind === "FACTORY"
            ? "سجل كل استلام من المصنع — المصدر الموحّد للمخزون بينك وبين المصنع."
            : "سجل كل جرد فعلي لمخزونك."}
        </p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={() => refetchList()} disabled={!isAgent || listFetching}>
            <RefreshCw className={cn("h-4 w-4", listFetching && "animate-spin")} />
            تحديث
          </Button>
          {isAgent && (
            <Button type="button" size="sm" className="rounded-lg" asChild>
              <Link href={kind === "FACTORY" ? newHref : `${newHref}?kind=COUNT`}>
                <Plus className="h-4 w-4" />
                {kind === "FACTORY" ? "استلام جديد" : "جرد جديد"}
              </Link>
            </Button>
          )}
        </div>
      </div>
      {body}
    </div>
  );
}
