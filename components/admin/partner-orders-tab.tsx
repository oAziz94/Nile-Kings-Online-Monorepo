"use client";

import * as React from "react";
import Link from "next/link";
import { Eye, Loader2, RefreshCw } from "lucide-react";
import { PanelCard } from "@/components/dashboard/panel-card";
import { PaginationBar } from "@/components/dashboard/pagination";
import { SearchInput } from "@/components/dashboard/search-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { useToast } from "@/hooks/use-toast";
import { piastresToEgp } from "@/lib/catalog";
import { ADMIN_ORDER_STATUS_PILL_VARIANT, ORDER_STATUS_LABELS as STATUS_LABELS } from "@/lib/constants/order-status";
import { formatNumberEn } from "@/lib/format-en-numbers";
import { ShoppingBag } from "lucide-react";

/**
 * الطلبات tab on a partner's profile (backlog 9.4a (e)) — the 9.3 orders pipeline, filtered
 * to this partner (`partner=<id>` preset, the partner column/filter hidden since it's
 * always this one partner). Calls the exact same `GET /api/admin/orders` route the standalone
 * `/admin/orders` pipeline uses (B3 — no second orders query), with its own small local
 * state (no URL sync — this list lives inside `?tab=orders` on the profile route and must not
 * fight that query param for control of the URL).
 */

type Order = {
  id: string;
  status: string;
  totalPiastres: number;
  itemCount: number;
  createdAt: string;
  overdue: boolean;
  shippingAddress: { governorate?: string; area?: string | null };
  user: { phone: string; name: string | null };
};

function egp(piastres: number): string {
  return `${formatNumberEn(piastresToEgp(piastres))} ج.م`;
}

export function PartnerOrdersTab({ partnerId }: { partnerId: string }) {
  const { toast } = useToast();
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [fetching, setFetching] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [debouncedQ, setDebouncedQ] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(25);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);
  React.useEffect(() => setPage(0), [debouncedQ]);

  const load = React.useCallback(async () => {
    setFetching(true);
    const params = new URLSearchParams({ partner: partnerId, limit: String(pageSize), offset: String(page * pageSize) });
    if (debouncedQ) params.set("q", debouncedQ);
    try {
      const res = await fetch(`/api/admin/orders?${params}`, { credentials: "include" });
      const json = await res.json();
      if (res.ok && json?.success) {
        setOrders(json.data.orders ?? []);
        setTotal(json.data.total ?? 0);
      } else {
        toast({ title: json?.error?.message ?? "فشل تحميل الطلبات", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "فشل تحميل الطلبات", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setLoading(false);
      setFetching(false);
    }
  }, [partnerId, debouncedQ, page, pageSize, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  const columns = React.useMemo<ColumnDef<Order, unknown>[]>(
    () => [
      {
        id: "id",
        header: "رقم الطلب",
        cell: ({ row }) => (
          <Link href={`/admin/orders/${row.original.id}`} dir="ltr" className="font-mono text-xs text-lapis-800 underline-offset-2 hover:underline">
            #{row.original.id.slice(0, 8)}
          </Link>
        ),
      },
      {
        id: "customer",
        header: "العميل",
        cell: ({ row }) => <span dir="ltr">{row.original.user?.phone ?? "—"}</span>,
      },
      {
        id: "governorate",
        header: "المنطقة",
        cell: ({ row }) => <span className="text-ink-soft">{[row.original.shippingAddress?.area, row.original.shippingAddress?.governorate].filter(Boolean).join(" · ") || "—"}</span>,
      },
      { id: "items", header: "القطع", cell: ({ row }) => <span dir="ltr">{row.original.itemCount}</span> },
      { id: "total", header: "الإجمالي", cell: ({ row }) => <span className="font-extrabold tabular-nums">{egp(row.original.totalPiastres)}</span> },
      {
        id: "status",
        header: "الحالة",
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={ADMIN_ORDER_STATUS_PILL_VARIANT[row.original.status] ?? "neutral"} className="rounded-full text-[11px] font-extrabold">
              {STATUS_LABELS[row.original.status] ?? row.original.status}
            </Badge>
            {row.original.overdue && <Badge variant="danger" className="rounded-full text-[11px] font-extrabold">متأخرة</Badge>}
          </div>
        ),
      },
      {
        id: "open",
        header: "فتح",
        cell: ({ row }) => (
          <Button asChild type="button" size="sm" variant="outline" className="rounded-lg">
            <Link href={`/admin/orders/${row.original.id}`}>
              <Eye className="h-3.5 w-3.5" />
              فتح
            </Link>
          </Button>
        ),
      },
    ],
    []
  );

  return (
    <PanelCard title="طلبات هذا الشريك" icon={<ShoppingBag className="h-5 w-5 text-lapis-800" />} noPadding>
      <div className="flex flex-wrap items-center gap-2.5 px-4 py-3.5 sm:px-[22px]">
        <SearchInput value={search} onChange={setSearch} placeholder="رقم الطلب أو العميل أو الهاتف" className="sm:w-72" />
        <Button type="button" variant="outline" size="sm" className="mr-auto rounded-full" onClick={load} disabled={fetching}>
          <RefreshCw className={fetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          تحديث
        </Button>
      </div>
      {fetching && orders.length > 0 && (
        <div className="flex items-center gap-2 border-b border-stone-200 px-4 py-2 text-sm text-ink-soft sm:px-[22px]">
          <Loader2 className="h-4 w-4 animate-spin" />
          جاري التحديث…
        </div>
      )}
      <div className="p-4 sm:p-[22px]">
        <DataTable columns={columns} data={orders} getRowId={(o) => o.id} loading={loading} emptyTitle={debouncedQ ? "لا توجد نتائج للبحث" : "لا توجد طلبات لهذا الشريك"} />
      </div>
      {total > 0 && (
        <div className="border-t border-stone-200 px-4 py-4 sm:px-[22px]">
          <PaginationBar page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} disabled={fetching} pageSizeOptions={[25, 50, 100]} />
        </div>
      )}
    </PanelCard>
  );
}
