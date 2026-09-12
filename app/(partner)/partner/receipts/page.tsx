"use client";

/**
 * Partner — Factory intake / stock-count receipts list (backlog 4.23). AGENT only (the
 * factory ships to agents; distributors receive via restock requests, unchanged) — a
 * DISTRIBUTOR gets the standing-rule-5 role panel, not an empty table.
 */
import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Boxes, Plus, RefreshCw, ShieldAlert } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, StatusBadge } from "@/components/dashboard/page-header";
import { PanelCard } from "@/components/dashboard/panel-card";
import { PaginationBar } from "@/components/dashboard/pagination";
import { Button } from "@/components/ui/button";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { usePartnerMe } from "@/hooks/use-partner-me";
import { useListUrlState } from "@/hooks/use-list-url-state";
import { formatDateEn, formatNumberEn } from "@/lib/format-en-numbers";
import { cn } from "@/lib/utils";

type ReceiptRow = {
  id: string;
  kind: "FACTORY" | "COUNT";
  reference: string | null;
  notes: string | null;
  createdAt: string;
  lineCount: number;
  totalUnits: number;
};

async function fetchReceipts(limit: number, offset: number): Promise<{ receipts: ReceiptRow[]; total: number }> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  const res = await fetch(`/api/partner/receipts?${params}`, { credentials: "include" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(json?.error?.message ?? "فشل تحميل الإيصالات");
  }
  return json.data;
}

function KindPill({ kind }: { kind: "FACTORY" | "COUNT" }) {
  const isFactory = kind === "FACTORY";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-[5px] text-xs font-extrabold",
        isFactory ? "bg-info-bg text-info-text" : "bg-warn-bg text-warn-text"
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", isFactory ? "bg-info-text" : "bg-warn-text")} />
      {isFactory ? "استلام من المصنع" : "جرد فعلي"}
    </span>
  );
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

const columns: ColumnDef<ReceiptRow, unknown>[] = [
  {
    id: "createdAt",
    header: "التاريخ",
    enableSorting: false,
    cell: ({ row }) => formatDateEn(row.original.createdAt),
  },
  {
    id: "kind",
    header: "النوع",
    enableSorting: false,
    cell: ({ row }) => <KindPill kind={row.original.kind} />,
  },
  {
    id: "reference",
    header: "المرجع",
    enableSorting: false,
    cell: ({ row }) => row.original.reference ?? "—",
  },
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
];

export default function PartnerReceiptsPage() {
  return (
    <React.Suspense fallback={null}>
      <PartnerReceiptsPageInner />
    </React.Suspense>
  );
}

function PartnerReceiptsPageInner() {
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
    queryKey: ["partner-receipts", page, pageSize],
    queryFn: () => fetchReceipts(pageSize, page * pageSize),
    enabled: isAgent,
  });

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
          emptyTitle="لا توجد إيصالات بعد"
          emptyDescription="سجّل أول استلام من المصنع أو جرد فعلي لبدء سجل المخزون."
          onRowClick={(row) => {
            window.location.href = `/partner/receipts/${row.id}`;
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
    <div className="space-y-6">
      <PageHeader
        title="الاستلام من المصنع"
        description="سجل كل استلام من المصنع أو جرد فعلي — المصدر الموحّد للمخزون بينك وبين المصنع."
        badge={<StatusBadge>وكلاء فقط</StatusBadge>}
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => refetchList()}
              disabled={!isAgent || listFetching}
            >
              <RefreshCw className={cn("h-4 w-4", listFetching && "animate-spin")} />
              تحديث
            </Button>
            {isAgent && (
              <Button type="button" className="rounded-xl" asChild>
                <Link href="/partner/receipts/new">
                  <Plus className="h-4 w-4" />
                  استلام جديد
                </Link>
              </Button>
            )}
          </>
        }
      />

      <PanelCard title="سجل الإيصالات" icon={<Boxes className="h-5 w-5 text-lapis-800" />} noPadding>
        <div className="p-4 sm:p-[22px]">{body}</div>
      </PanelCard>
    </div>
  );
}
