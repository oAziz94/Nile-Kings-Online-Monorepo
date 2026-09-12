"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Download, Package, RefreshCw } from "lucide-react";
import { ProductImagePreview } from "@/components/shared/product-image-preview";
import { PageHeader, StatusBadge } from "@/components/dashboard/page-header";
import { PaginationBar } from "@/components/dashboard/pagination";
import { PanelCard } from "@/components/dashboard/panel-card";
import { SearchInput } from "@/components/dashboard/search-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { useToast } from "@/hooks/use-toast";
import { useListUrlState } from "@/hooks/use-list-url-state";
import { useRowScrollRestore } from "@/hooks/use-row-scroll-restore";
import { piastresToEgp } from "@/lib/catalog";
import { formatNumberEn } from "@/lib/format-en-numbers";
import { cn } from "@/lib/utils";

// Backlog 4.23: `app/api/partner/inventory/export/route.ts` now exists, so the button below
// (link-only, per backlog 4.18) is enabled.
const INVENTORY_EXPORT_ENABLED = true;

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
  }[];
};

function egp(piastres: number | null | undefined): string {
  return typeof piastres === "number" ? `${formatNumberEn(piastresToEgp(piastres))} ج.م` : "—";
}

export default function PartnerProductsPage() {
  return (
    <React.Suspense fallback={null}>
      <PartnerProductsPageInner />
    </React.Suspense>
  );
}

function PartnerProductsPageInner() {
  const { toast } = useToast();
  const [products, setProducts] = React.useState<ProductRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [fetching, setFetching] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const { search, setSearch, debouncedQ, page, setPage, pageSize, setPageSize, filters, setFilter } =
    useListUrlState({ lowStock: "" });
  const { rememberRow } = useRowScrollRestore("partner-products-last-row", products);
  const lowStockOn = filters.lowStock === "1";

  React.useEffect(() => {
    if (loading) return; // total isn't known yet on first render — don't clamp against a stale 0
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

    try {
      const res = await fetch(`/api/partner/inventory?${params}`, { credentials: "include" });
      const json = await res.json();
      if (res.ok && json?.success) {
        setProducts(json.data.products ?? []);
        setTotal(json.data.total ?? 0);
        setLoadError(null);
      } else {
        const message = json?.error?.message ?? "فشل تحميل المنتجات";
        setLoadError(message);
        toast({ title: message, variant: "destructive" });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "خطأ غير متوقع";
      setLoadError("فشل تحميل المنتجات");
      toast({ title: "فشل تحميل المنتجات", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
      setFetching(false);
    }
  }, [debouncedQ, lowStockOn, page, pageSize, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

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
        header: "الاسم",
        enableSorting: false,
        cell: ({ row }) => <span className="font-bold text-ink">{row.original.name}</span>,
      },
      {
        id: "category",
        header: "الفئة",
        enableSorting: false,
        cell: ({ row }) => row.original.category.name,
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
        id: "actions",
        header: "إجراءات",
        enableSorting: false,
        cell: ({ row }) => (
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/partner/products/${row.original.id}`} onClick={() => rememberRow(row.original.id)}>
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
      <PageHeader
        title="المنتجات"
        description="نفس جدول المنتجات في لوحة الإدارة مع صلاحية تعديل مخزون المتغيرات فقط."
        badge={<StatusBadge>تعديل المخزون فقط</StatusBadge>}
        actions={
          <Button type="button" variant="outline" className="rounded-xl" onClick={load} disabled={fetching}>
            <RefreshCw className={cn("h-4 w-4", fetching && "animate-spin")} />
            تحديث
          </Button>
        }
      />

      <PanelCard
        title="قائمة المنتجات"
        icon={<Package className="h-5 w-5 text-lapis-800" />}
        noPadding
        toolbar={
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
              مخزون منخفض فقط
            </button>
            {INVENTORY_EXPORT_ENABLED && (
              <Button type="button" variant="outline" size="sm" className="rounded-lg" asChild>
                <a href="/api/partner/inventory/export">
                  <Download className="h-4 w-4" />
                  تصدير المخزون
                </a>
              </Button>
            )}
          </div>
        }
      >
        <div className="p-4 sm:p-[22px]">
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
                emptyTitle={debouncedQ || lowStockOn ? "لا توجد نتائج للبحث" : "لا توجد منتجات متاحة"}
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
        </div>
      </PanelCard>
    </div>
  );
}
