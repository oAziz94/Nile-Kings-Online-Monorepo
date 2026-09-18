"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeftRight, Boxes, Download, Package, RefreshCw, Upload } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { ProductImagePreview } from "@/components/shared/product-image-preview";
import { PanelCard } from "@/components/dashboard/panel-card";
import { ProductIdentityLine } from "@/components/dashboard/product-identity";
import { PaginationBar } from "@/components/dashboard/pagination";
import { SearchInput } from "@/components/dashboard/search-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { useToast } from "@/hooks/use-toast";
import { usePartnerMe } from "@/hooks/use-partner-me";
import { useListUrlState, useRequestAbort } from "@/hooks/use-list-url-state";
import { useRowScrollRestore } from "@/hooks/use-row-scroll-restore";
import { piastresToEgp } from "@/lib/catalog";
import { formatNumberEn } from "@/lib/format-en-numbers";
import { formatCoverDays } from "@/lib/partner/stock-cover";
import { cn } from "@/lib/utils";

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  category: { id: string; name: string; slug: string };
  variants: {
    id: string;
    pricePiastres: number;
    basePricePiastres: number | null;
    stockAvailable: number;
    stockReserved: number;
    sellable: number;
    threshold: number;
    coverDays: number | null;
  }[];
};

function egp(piastres: number | null | undefined): string {
  return typeof piastres === "number" ? `${formatNumberEn(piastresToEgp(piastres))} ج.م` : "—";
}

function coverBadgeVariant(coverDays: number | null): "success" | "warning" | "danger" | "neutral" {
  if (coverDays === null) return "neutral";
  if (coverDays <= 3) return "danger";
  if (coverDays <= 14) return "warning";
  return "success";
}

type ReceiptSummary = { id: string; kind: "FACTORY" | "COUNT"; createdAt: string; totalUnits: number; totalCostPiastres: number | null };
type RestockSummary = { id: string; sourcePartner: { name: string }; destinationPartner: { name: string }; status: string; items: { quantity: number }[]; createdAt: string };

async function fetchLastReceipts(): Promise<ReceiptSummary[]> {
  const res = await fetch("/api/partner/receipts?limit=3&offset=0", { credentials: "include" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) return [];
  return json.data.receipts ?? [];
}

async function fetchIncomingRequests(): Promise<RestockSummary[]> {
  const res = await fetch("/api/partner/restock-requests", { credentials: "include" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) return [];
  return (json.data.requests ?? []).filter((r: RestockSummary) => r.status === "PENDING");
}

export default function PartnerStockIndexPage() {
  return (
    <React.Suspense fallback={null}>
      <PartnerStockIndexPageInner />
    </React.Suspense>
  );
}

function PartnerStockIndexPageInner() {
  const { toast } = useToast();
  const { data: me } = usePartnerMe();
  const isAgent = me?.partnerType === "AGENT";
  const [products, setProducts] = React.useState<ProductRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [fetching, setFetching] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const { search, setSearch, debouncedQ, page, setPage, pageSize, setPageSize, filters, setFilter } =
    useListUrlState({ lowStock: "", outOfStock: "" });
  const { rememberRow } = useRowScrollRestore("partner-stock-last-row", products);
  const getAbortSignal = useRequestAbort();
  const lowStockOn = filters.lowStock === "1";
  const outOfStockOn = filters.outOfStock === "1";

  React.useEffect(() => {
    if (loading) return;
    const totalPages = total === 0 ? 1 : Math.max(1, Math.ceil(total / pageSize));
    if (page > totalPages - 1) setPage(Math.max(0, totalPages - 1));
  }, [loading, page, pageSize, total, setPage]);

  const load = React.useCallback(async () => {
    setFetching(true);
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String(page * pageSize),
    });
    if (debouncedQ) params.set("q", debouncedQ);
    if (lowStockOn) params.set("lowStock", "1");
    if (outOfStockOn) params.set("outOfStock", "1");

    const signal = getAbortSignal();
    try {
      const res = await fetch(`/api/partner/inventory?${params}`, { credentials: "include", signal });
      const json = await res.json();
      if (res.ok && json?.success) {
        setProducts(json.data.products ?? []);
        setTotal(json.data.total ?? 0);
        setLoadError(null);
      } else {
        const message = json?.error?.message ?? "فشل تحميل المخزون";
        setLoadError(message);
        toast({ title: message, variant: "destructive" });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const message = error instanceof Error ? error.message : "خطأ غير متوقع";
      setLoadError("فشل تحميل المخزون");
      toast({ title: "فشل تحميل المخزون", description: message, variant: "destructive" });
    } finally {
      if (!signal.aborted) {
        setLoading(false);
        setFetching(false);
      }
    }
  }, [debouncedQ, lowStockOn, outOfStockOn, page, pageSize, toast, getAbortSignal]);

  React.useEffect(() => {
    load();
  }, [load]);

  const { data: lastReceipts } = useQuery({
    queryKey: ["partner-stock-last-receipts"],
    queryFn: fetchLastReceipts,
    enabled: isAgent,
  });
  const { data: incomingRequests } = useQuery({
    queryKey: ["partner-stock-incoming-requests"],
    queryFn: fetchIncomingRequests,
  });

  const columns = React.useMemo<ColumnDef<ProductRow, unknown>[]>(
    () => [
      {
        id: "image",
        header: "الصورة",
        enableSorting: false,
        cell: ({ row }) => {
          const product = row.original;
          return product.imageUrl ? (
            <ProductImagePreview
              src={product.imageUrl}
              title={product.name}
              code={product.slug}
              className="overflow-hidden rounded-xl"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-stone-100">
              <Package className="h-6 w-6 text-ink-soft" />
            </div>
          );
        },
      },
      {
        id: "name",
        header: "المنتج",
        enableSorting: false,
        cell: ({ row }) => (
          <div>
            <div className="font-bold text-ink">{row.original.name}</div>
            <div className="text-xs text-ink-soft">{row.original.category.name}</div>
            <ProductIdentityLine identifier={row.original.slug} />
          </div>
        ),
      },
      {
        id: "price",
        header: "السعر",
        enableSorting: false,
        cell: ({ row }) => egp(row.original.variants[0]?.pricePiastres ?? null),
      },
      {
        id: "variantCount",
        header: "المتغيرات",
        enableSorting: false,
        cell: ({ row }) => `${formatNumberEn(row.original.variants.length)} متغير`,
      },
      {
        id: "available",
        header: "المتاح",
        enableSorting: false,
        cell: ({ row }) =>
          formatNumberEn(row.original.variants.reduce((sum, v) => sum + v.stockAvailable, 0)),
      },
      {
        id: "reserved",
        header: "المحجوز",
        enableSorting: false,
        cell: ({ row }) =>
          formatNumberEn(row.original.variants.reduce((sum, v) => sum + v.stockReserved, 0)),
      },
      {
        id: "sellable",
        header: "قابل للبيع",
        enableSorting: false,
        cell: ({ row }) => {
          const sellable = row.original.variants.reduce((sum, v) => sum + v.sellable, 0);
          return (
            <Badge variant={sellable > 0 ? "success" : "destructive"}>{formatNumberEn(sellable)}</Badge>
          );
        },
      },
      {
        id: "cover",
        header: "تغطية (يوم)",
        enableSorting: false,
        cell: ({ row }) => {
          const withCover = row.original.variants.filter(
            (v): v is typeof v & { coverDays: number } => v.coverDays !== null
          );
          const worstCoverDays = withCover.length > 0 ? Math.min(...withCover.map((v) => v.coverDays)) : null;
          return (
            <Badge variant={coverBadgeVariant(worstCoverDays)}>{formatCoverDays(worstCoverDays)}</Badge>
          );
        },
      },
      {
        id: "threshold",
        header: "الحد",
        enableSorting: false,
        cell: ({ row }) => formatNumberEn(row.original.variants[0]?.threshold ?? 0),
      },
      {
        id: "actions",
        header: "إجراءات",
        enableSorting: false,
        cell: ({ row }) => (
          <Button variant="ghost" size="sm" asChild>
            <Link
              href={`/partner/stock/products/${row.original.id}`}
              onClick={() => rememberRow(row.original.id)}
            >
              تعديل المخزون
            </Link>
          </Button>
        ),
      },
    ],
    [rememberRow]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="بحث بالاسم أو SKU…" />
        <button
          type="button"
          aria-pressed={lowStockOn}
          onClick={() => setFilter("lowStock", lowStockOn ? "" : "1")}
          className={cn(
            "rounded-full px-4 py-[7px] text-[13px] font-bold transition-colors",
            lowStockOn ? "bg-lapis-800 text-white" : "bg-stone-100 text-ink-soft hover:bg-stone-200"
          )}
        >
          تحت الحد فقط
        </button>
        <button
          type="button"
          aria-pressed={outOfStockOn}
          onClick={() => setFilter("outOfStock", outOfStockOn ? "" : "1")}
          className={cn(
            "rounded-full px-4 py-[7px] text-[13px] font-bold transition-colors",
            outOfStockOn ? "bg-lapis-800 text-white" : "bg-stone-100 text-ink-soft hover:bg-stone-200"
          )}
        >
          نفد
        </button>
        <div className="mr-auto flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="rounded-lg" asChild>
            <a href="/api/partner/inventory/export">
              <Download className="h-4 w-4" />
              تصدير
            </a>
          </Button>
          {isAgent && (
            <Button type="button" variant="outline" size="sm" className="rounded-lg" asChild>
              <Link href="/partner/stock/intake/new">
                <Upload className="h-4 w-4" />
                استيراد
              </Link>
            </Button>
          )}
          <Button type="button" size="sm" className="rounded-lg bg-gold-500 text-ink hover:bg-gold-500/90" asChild>
            <Link href="/partner/reports/inventory?action=reorder">
              <ArrowLeftRight className="h-4 w-4" />
              مقترح إعادة الطلب
            </Link>
          </Button>
          <Button type="button" variant="outline" className="rounded-lg" onClick={load} disabled={fetching}>
            <RefreshCw className={cn("h-4 w-4", fetching && "animate-spin")} />
            تحديث
          </Button>
        </div>
      </div>

      {loadError && products.length === 0 ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-xl border border-carnelian-500/30 bg-danger-bg p-4 text-danger-text"
        >
          <p className="flex items-center gap-2 text-sm font-bold">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {loadError}
          </p>
          <Button type="button" size="sm" variant="outline" className="rounded-lg" onClick={load}>
            <RefreshCw className="h-4 w-4" />
            إعادة المحاولة
          </Button>
        </div>
      ) : (
        <>
          {fetching && products.length > 0 && (
            <div className="mb-3 flex items-center gap-2 text-sm text-ink-soft">
              <RefreshCw className="h-4 w-4 animate-spin" />
              جاري التحديث…
            </div>
          )}
          <DataTable
            columns={columns}
            data={products}
            getRowId={(row) => row.id}
            loading={loading && products.length === 0}
            className={cn(fetching && products.length > 0 && "opacity-70")}
            emptyIcon={<Package className="h-8 w-8" strokeWidth={1.5} />}
            emptyTitle={debouncedQ || lowStockOn || outOfStockOn ? "لا توجد نتائج للبحث" : "لا توجد منتجات متاحة"}
          />
          {total > 0 && (
            <PaginationBar
              className="mt-6"
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              disabled={fetching}
            />
          )}
        </>
      )}

      {isAgent && (
        <div className="grid gap-4 lg:grid-cols-3">
          <PanelCard title="الاستلام من المصنع" icon={<Boxes className="h-5 w-5 text-lapis-800" />}>
            <p className="text-xs leading-relaxed text-ink-soft">
              صدّر ملف الجرد، عبّئ الكميات المستلمة، ثم استورده لمراجعته قبل التطبيق. كل استلام يُسجَّل ويُطبع.
            </p>
            <Button type="button" size="sm" className="mt-3 w-fit rounded-full" asChild>
              <Link href="/partner/stock/intake/new">استلام جديد</Link>
            </Button>
          </PanelCard>

          <PanelCard title="آخر الاستلامات" icon={<Boxes className="h-5 w-5 text-lapis-800" />}>
            {(lastReceipts?.length ?? 0) === 0 ? (
              <p className="text-xs text-ink-soft">لا توجد استلامات بعد.</p>
            ) : (
              <div className="space-y-2">
                {lastReceipts!.map((r) => (
                  <Link
                    key={r.id}
                    href={`/partner/stock/intake/${r.id}`}
                    className="flex items-center justify-between border-t border-stone-100 pt-2 text-xs first:border-0 first:pt-0"
                  >
                    <span dir="ltr" className="font-bold">
                      #{r.id.slice(-6).toUpperCase()}
                    </span>
                    <span dir="ltr">{formatNumberEn(r.totalUnits)} قطعة</span>
                    <span dir="ltr" className="font-bold">
                      {r.totalCostPiastres ? egp(r.totalCostPiastres) : "—"}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </PanelCard>

          <PanelCard title="طلبات التوريد الواردة" icon={<ArrowLeftRight className="h-5 w-5 text-lapis-800" />}>
            {(incomingRequests?.length ?? 0) === 0 ? (
              <p className="text-xs text-ink-soft">لا توجد طلبات بانتظارك.</p>
            ) : (
              <div className="space-y-2">
                {incomingRequests!.map((r) => (
                  <div key={r.id} className="flex items-center justify-between border-t border-stone-100 pt-2 text-xs first:border-0 first:pt-0">
                    <span className="font-bold">{r.destinationPartner.name}</span>
                    <span dir="ltr">{formatNumberEn(r.items.reduce((s, i) => s + i.quantity, 0))} قطعة</span>
                    <Button type="button" size="sm" variant="outline" className="rounded-lg" asChild>
                      <Link href="/partner/stock/requests">مراجعة</Link>
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </PanelCard>
        </div>
      )}
    </div>
  );
}
