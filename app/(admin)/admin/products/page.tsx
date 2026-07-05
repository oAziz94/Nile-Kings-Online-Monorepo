"use client";

import * as React from "react";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
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
import { AdminPaginationBar } from "@/components/admin/admin-pagination";
import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPanelCard } from "@/components/admin/admin-panel-card";
import { AdminSearchInput } from "@/components/admin/admin-search-input";
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
  variants: { id: string; name: string; stockAvailable: number }[];
};

export default function AdminProductsPage() {
  const [products, setProducts] = React.useState<Product[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [fetching, setFetching] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [debouncedQ, setDebouncedQ] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(20);
  const [exporting, setExporting] = React.useState(false);
  const { toast } = useToast();

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  React.useEffect(() => {
    setPage(0);
  }, [debouncedQ]);

  React.useEffect(() => {
    const totalPages = total === 0 ? 1 : Math.max(1, Math.ceil(total / pageSize));
    if (page > totalPages - 1) setPage(Math.max(0, totalPages - 1));
  }, [total, pageSize, page]);

  React.useEffect(() => {
    const ac = new AbortController();
    setFetching(true);
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String(page * pageSize),
    });
    if (debouncedQ) params.set("q", debouncedQ);
    fetch(`/api/admin/products?${params}`, { credentials: "include", signal: ac.signal })
      .then((res) => res.json())
      .then((json: { success?: boolean; data?: { products: Product[]; total: number } }) => {
        if (ac.signal.aborted) return;
        if (json?.success && json.data && Array.isArray(json.data.products)) {
          setProducts(json.data.products);
          setTotal(json.data.total);
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
  }, [debouncedQ, page, pageSize, toast]);

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
      <AdminPageHeader
        title="المنتجات"
        description="إدارة الكتالوج، المتغيرات، الأسعار، والتصدير إلى Excel."
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

      <AdminPanelCard
        title="قائمة المنتجات"
        icon={<Package className="h-5 w-5 text-burgundy" />}
        toolbar={
          <AdminSearchInput
            value={search}
            onChange={setSearch}
            placeholder="بحث بالاسم أو slug…"
          />
        }
      >
          {fetching && list.length > 0 && (
            <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              جاري التحديث…
            </div>
          )}
          {empty ? (
            <AdminEmptyState
              icon={<Package className="h-12 w-12" />}
              title={debouncedQ ? "لا توجد نتائج للبحث" : "لا توجد منتجات بعد"}
              description="ابدأ بإضافة أول منتج إلى الكتالوج."
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border/60">
            <Table className={cn(fetching && "opacity-70")}>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>الصورة</TableHead>
                  <TableHead>الاسم</TableHead>
                  <TableHead>الفئة</TableHead>
                  <TableHead>الوزن (غ)</TableHead>
                  <TableHead>الأولوية</TableHead>
                  <TableHead>السعر</TableHead>
                  <TableHead>المتغيرات</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="text-left">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      {p.imageUrl ? (
                        <img
                          src={p.imageUrl}
                          alt=""
                          className="h-12 w-12 rounded-xl object-cover"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
                          <Package className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{p.category.name}</TableCell>
                    <TableCell>{p.weightGrams ?? "—"}</TableCell>
                    <TableCell>{p.sortOrder}</TableCell>
                    <TableCell>
                      {p.discountPricePiastres != null
                        ? `${(p.discountPricePiastres / 100).toFixed(0)} ج.م`
                        : p.basePricePiastres != null
                          ? `${(p.basePricePiastres / 100).toFixed(0)} ج.م`
                          : "—"}
                    </TableCell>
                    <TableCell>{p.variants.length} متغير</TableCell>
                    <TableCell>
                      <Badge variant={p.active ? "success" : "secondary"}>
                        {p.active ? "نشط" : "معطّل"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-left">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/admin/products/${p.id}`}>تعديل</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
          {total > 0 && (
            <AdminPaginationBar
              className="mt-6"
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              disabled={fetching}
            />
          )}
      </AdminPanelCard>
    </div>
  );
}
