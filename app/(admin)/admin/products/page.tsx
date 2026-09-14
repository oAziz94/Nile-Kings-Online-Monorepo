"use client";

/**
 * `/admin/products` — backlog 9.8b: list language (search/category/active/"بلا صور" filters,
 * الصورة·المنتج·الفئة·الألوان·المقاسات·السعر·نشط·فتح columns) plus a checkbox column and bulk
 * edit (category, active, tags add/remove, price by amount/percent with a preview + confirm).
 */
import * as React from "react";
import Link from "next/link";
import { ProductImagePreview } from "@/components/shared/product-image-preview";
import { useToast } from "@/hooks/use-toast";
import { useListUrlState } from "@/hooks/use-list-url-state";
import { useRowScrollRestore } from "@/hooks/use-row-scroll-restore";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/shared/skeleton";
import { PaginationBar } from "@/components/dashboard/pagination";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { PanelCard } from "@/components/dashboard/panel-card";
import { SearchInput } from "@/components/dashboard/search-input";
import { BulkEditDialog } from "@/components/admin/bulk-edit-dialog";
import { FileDown, Package, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Product = {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  active: boolean;
  sortOrder: number;
  weightGrams: number | null;
  basePricePiastres: number | null;
  discountPricePiastres: number | null;
  category: { id: string; name: string; slug: string };
  variants: { id: string; name: string; colorHex: string | null; colorName: string | null }[];
};

type Category = { id: string; name: string; slug: string };

export default function AdminProductsPage() {
  return (
    <React.Suspense fallback={null}>
      <AdminProductsPageInner />
    </React.Suspense>
  );
}

function AdminProductsPageInner() {
  const [products, setProducts] = React.useState<Product[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [fetching, setFetching] = React.useState(false);
  const { search, setSearch, debouncedQ, page, setPage, pageSize, setPageSize, filters, setFilter } = useListUrlState({
    categoryId: "",
    active: "",
    noImage: "",
  });
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [exporting, setExporting] = React.useState(false);
  const { toast } = useToast();
  const { rememberRow } = useRowScrollRestore("admin-products-last-row", products);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    fetch("/api/admin/categories", { credentials: "include" })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: Category[] }) => {
        if (json?.success && Array.isArray(json.data)) setCategories(json.data);
      })
      .catch(() => undefined);
  }, []);

  React.useEffect(() => {
    if (loading) return;
    const totalPages = total === 0 ? 1 : Math.max(1, Math.ceil(total / pageSize));
    if (page > totalPages - 1) setPage(Math.max(0, totalPages - 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, total, pageSize, page]);

  React.useEffect(() => {
    const ac = new AbortController();
    setFetching(true);
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String(page * pageSize),
    });
    if (debouncedQ) params.set("q", debouncedQ);
    if (filters.categoryId) params.set("categoryId", filters.categoryId);
    if (filters.active) params.set("active", filters.active);
    if (filters.noImage === "1") params.set("noImage", "1");
    fetch(`/api/admin/products?${params}`, { credentials: "include", signal: ac.signal })
      .then((res) => res.json())
      .then((json: { success?: boolean; data?: { products: Product[]; total: number } }) => {
        if (ac.signal.aborted) return;
        if (json?.success && json.data && Array.isArray(json.data.products)) {
          setProducts(json.data.products);
          setTotal(json.data.total);
          setSelected(new Set());
        }
      })
      .catch(() => {
        if (!ac.signal.aborted) toast({ title: "فشل تحميل المنتجات", variant: "destructive" });
      })
      .finally(() => {
        if (!ac.signal.aborted) {
          setLoading(false);
          setFetching(false);
        }
      });
    return () => ac.abort();
  }, [debouncedQ, page, pageSize, filters.categoryId, filters.active, filters.noImage, reloadKey, toast]);

  if (loading && products.length === 0) {
    return (
      <div dir="rtl" className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  const list = products;
  const empty = list.length === 0 && !fetching;

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((prev) => (prev.size === list.length ? new Set() : new Set(list.map((p) => p.id))));
  };

  async function handleExportExcel() {
    setExporting(true);
    try {
      const res = await fetch("/api/admin/products/export-excel", { credentials: "include" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast({
          title: "فشل التصدير",
          description: j?.error?.message ?? res.statusText,
          variant: "destructive",
        });
        return;
      }
      const blob = await res.blob();
      const filename =
        res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ??
        "catalog_products.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "تم تصدير الكتالوج إلى Excel" });
    } catch (e) {
      toast({
        title: "فشل التصدير",
        description: e instanceof Error ? e.message : "خطأ غير متوقع",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="المنتجات"
        description="إدارة الكتالوج، الألوان والمقاسات، الأسعار، والتصدير إلى Excel."
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={handleExportExcel}
              disabled={exporting}
            >
              <FileDown className="h-4 w-4" />
              تصدير Excel
            </Button>
            <Button asChild className="rounded-xl">
              <Link href="/admin/products/new">
                <Plus className="h-4 w-4" />
                إضافة منتج
              </Link>
            </Button>
          </>
        }
      />

      <PanelCard
        title="قائمة المنتجات"
        icon={<Package className="h-5 w-5 text-burgundy" />}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={search} onChange={setSearch} placeholder="بحث بالاسم أو slug…" />
            <Label htmlFor="filter-category" className="sr-only">الفئة</Label>
            <Select id="filter-category" value={filters.categoryId} onChange={(e) => setFilter("categoryId", e.target.value)} className="h-10 w-auto rounded-full">
              <option value="">كل الفئات</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            <Label htmlFor="filter-active" className="sr-only">الحالة</Label>
            <Select id="filter-active" value={filters.active} onChange={(e) => setFilter("active", e.target.value)} className="h-10 w-auto rounded-full">
              <option value="">كل الحالات</option>
              <option value="true">نشط</option>
              <option value="false">معطّل</option>
            </Select>
            <button
              type="button"
              aria-pressed={filters.noImage === "1"}
              onClick={() => setFilter("noImage", filters.noImage === "1" ? "" : "1")}
              className={cn(
                "flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500",
                filters.noImage === "1" ? "border-lapis-800 bg-lapis-800 text-white" : "border-stone-200 bg-white text-ink"
              )}
            >
              بلا صور
            </button>
          </div>
        }
      >
          {selected.size > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl bg-lapis-50 px-4 py-2.5">
              <span className="text-[13px] font-extrabold text-lapis-800">{selected.size} منتج محدد</span>
              <Button type="button" size="sm" className="rounded-full" onClick={() => setBulkOpen(true)}>
                تعديل جماعي
              </Button>
              <button type="button" className="mr-auto text-xs font-bold text-lapis-800 underline" onClick={() => setSelected(new Set())}>
                إلغاء التحديد
              </button>
            </div>
          )}
          {fetching && list.length > 0 && (
            <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              جاري التحديث…
            </div>
          )}
          {empty ? (
            <EmptyState
              icon={<Package className="h-12 w-12" />}
              title={debouncedQ ? "لا توجد نتائج للبحث" : "لا توجد منتجات بعد"}
              description="ابدأ بإضافة أول منتج إلى الكتالوج."
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border/60">
            <Table className={cn(fetching && "opacity-70")}>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-10">
                    <Checkbox checked={selected.size > 0 && selected.size === list.length} onCheckedChange={toggleSelectAll} aria-label="تحديد الكل" />
                  </TableHead>
                  <TableHead>الصورة</TableHead>
                  <TableHead>المنتج</TableHead>
                  <TableHead>الفئة</TableHead>
                  <TableHead>الألوان</TableHead>
                  <TableHead>المقاسات</TableHead>
                  <TableHead>السعر</TableHead>
                  <TableHead>نشط</TableHead>
                  <TableHead className="text-left">فتح</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((p) => {
                  const colorCount = new Set(p.variants.map((v) => `${v.colorName ?? ""}|${v.colorHex ?? ""}`)).size;
                  return (
                  <TableRow key={p.id} data-row-id={p.id}>
                    <TableCell>
                      <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggleSelect(p.id)} aria-label={`تحديد ${p.name}`} />
                    </TableCell>
                    <TableCell>
                      {p.imageUrl ? (
                        <ProductImagePreview
                          src={p.imageUrl}
                          title={p.name}
                          code={p.slug}
                          className="overflow-hidden rounded-xl"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
                          <Package className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{p.category.name}</TableCell>
                    <TableCell>{colorCount}</TableCell>
                    <TableCell>{p.variants.length}</TableCell>
                    <TableCell>
                      {p.discountPricePiastres != null
                        ? `${(p.discountPricePiastres / 100).toFixed(0)} ج.م`
                        : p.basePricePiastres != null
                          ? `${(p.basePricePiastres / 100).toFixed(0)} ج.م`
                          : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.active ? "success" : "secondary"}>
                        {p.active ? "نشط" : "معطّل"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-left">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/admin/products/${p.id}`} onClick={() => rememberRow(p.id)}>
                          تعديل
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

      <BulkEditDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        productIds={Array.from(selected)}
        categories={categories}
        onDone={() => {
          setBulkOpen(false);
          setSelected(new Set());
          setReloadKey((k) => k + 1);
        }}
      />
    </div>
  );
}
