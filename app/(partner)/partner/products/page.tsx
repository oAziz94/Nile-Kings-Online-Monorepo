"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, Package, RefreshCw } from "lucide-react";
import { ProductImagePreview } from "@/components/shared/product-image-preview";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader, StatusBadge } from "@/components/dashboard/page-header";
import { PaginationBar } from "@/components/dashboard/pagination";
import { PanelCard } from "@/components/dashboard/panel-card";
import { SearchInput } from "@/components/dashboard/search-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useListUrlState } from "@/hooks/use-list-url-state";
import { useRowScrollRestore } from "@/hooks/use-row-scroll-restore";
import { piastresToEgp } from "@/lib/catalog";
import { formatNumberEn } from "@/lib/format-en-numbers";
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
  const { search, setSearch, debouncedQ, page, setPage, pageSize, setPageSize } = useListUrlState({});
  const { rememberRow } = useRowScrollRestore("partner-products-last-row", products);

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

    try {
      const res = await fetch(`/api/partner/inventory?${params}`, { credentials: "include" });
      const json = await res.json();
      if (res.ok && json?.success) {
        setProducts(json.data.products ?? []);
        setTotal(json.data.total ?? 0);
      } else {
        toast({ title: json?.error?.message ?? "فشل تحميل المنتجات", variant: "destructive" });
      }
    } catch (error) {
      toast({
        title: "فشل تحميل المنتجات",
        description: error instanceof Error ? error.message : "خطأ غير متوقع",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setFetching(false);
    }
  }, [debouncedQ, page, pageSize, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  if (loading && products.length === 0) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="ml-2 h-4 w-4 animate-spin" />
        جاري تحميل المنتجات
      </div>
    );
  }

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
        icon={<Package className="h-5 w-5 text-burgundy" />}
        toolbar={
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="بحث بالاسم أو SKU…"
          />
        }
      >
        {fetching && products.length > 0 && (
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            جاري التحديث…
          </div>
        )}

        {products.length === 0 && !fetching ? (
          <EmptyState
            icon={<Package className="h-12 w-12" />}
            title={debouncedQ ? "لا توجد نتائج للبحث" : "لا توجد منتجات متاحة"}
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <Table className={cn(fetching && "opacity-70")}>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>الصورة</TableHead>
                  <TableHead>الاسم</TableHead>
                  <TableHead>الفئة</TableHead>
                  <TableHead>السعر</TableHead>
                  <TableHead>المتغيرات</TableHead>
                  <TableHead>المتاح</TableHead>
                  <TableHead>المحجوز</TableHead>
                  <TableHead>قابل للبيع</TableHead>
                  <TableHead className="text-left">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => {
                  const available = product.variants.reduce((sum, variant) => sum + variant.stockAvailable, 0);
                  const reserved = product.variants.reduce((sum, variant) => sum + variant.stockReserved, 0);
                  const sellable = product.variants.reduce((sum, variant) => sum + variant.sellable, 0);
                  const firstVariant = product.variants[0];
                  return (
                    <TableRow key={product.id} data-row-id={product.id}>
                      <TableCell>
                        {product.imageUrl ? (
                          <ProductImagePreview
                            src={product.imageUrl}
                            title={product.name}
                            code={product.slug}
                            className="overflow-hidden rounded-xl"
                          />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                            <Package className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell>{product.category.name}</TableCell>
                      <TableCell>{egp(firstVariant?.pricePiastres ?? null)}</TableCell>
                      <TableCell>{formatNumberEn(product.variants.length)} متغير</TableCell>
                      <TableCell>{formatNumberEn(available)}</TableCell>
                      <TableCell>{formatNumberEn(reserved)}</TableCell>
                      <TableCell>
                        <Badge variant={sellable > 0 ? "default" : "destructive"}>
                          {formatNumberEn(sellable)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-left">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/partner/products/${product.id}`} onClick={() => rememberRow(product.id)}>
                            تعديل المخزون
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

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
      </PanelCard>
    </div>
  );
}
