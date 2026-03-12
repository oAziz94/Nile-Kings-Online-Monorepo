"use client";

import * as React from "react";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { FileDown, Package, Plus } from "lucide-react";

type Product = {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  active: boolean;
  weightGrams: number | null;
  basePricePiastres: number | null;
  discountPricePiastres: number | null;
  category: { id: string; name: string; slug: string };
  variants: { id: string; name: string; stockAvailable: number }[];
};

export default function AdminProductsPage() {
  const [products, setProducts] = React.useState<Product[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [exporting, setExporting] = React.useState(false);
  const { toast } = useToast();

  React.useEffect(() => {
    fetch("/api/admin/products", { credentials: "include" })
      .then((res) => res.json())
      .then((json: { success?: boolean; data?: Product[] }) => {
        if (json?.success && Array.isArray(json.data)) setProducts(json.data);
      })
      .catch(() => toast({ title: "فشل تحميل المنتجات", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [toast]);

  if (loading) {
    return (
      <div dir="rtl" className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  const list = products ?? [];
  const empty = list.length === 0;

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
    <div dir="rtl" className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">المنتجات</h1>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleExportExcel}
            disabled={exporting || empty}
          >
            <FileDown className="h-4 w-4" />
            تصدير إلى Excel
          </Button>
          <Button asChild>
            <Link href="/admin/products/new">
              <Plus className="h-4 w-4" />
              إضافة منتج
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>قائمة المنتجات</CardTitle>
          <CardDescription>إدارة المنتجات والمتغيرات والأسعار.</CardDescription>
        </CardHeader>
        <CardContent>
          {empty ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 py-16 text-center">
              <Package className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-2">لا توجد منتجات بعد</p>
              <Button asChild variant="outline">
                <Link href="/admin/products/new">إضافة أول منتج</Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الصورة</TableHead>
                  <TableHead>الاسم</TableHead>
                  <TableHead>الفئة</TableHead>
                  <TableHead>الوزن (غ)</TableHead>
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
