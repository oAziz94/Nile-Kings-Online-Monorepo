"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight, Boxes, Loader2, Package, RefreshCw, Save, Warehouse } from "lucide-react";
import { ProductImagePreview } from "@/components/shared/product-image-preview";
import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { AdminKpiCard } from "@/components/admin/admin-kpi-card";
import { AdminPageHeader, AdminStatusBadge } from "@/components/admin/admin-page-header";
import { AdminPanelCard } from "@/components/admin/admin-panel-card";
import { AdminTableScroll } from "@/components/admin/admin-table-scroll";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { piastresToEgp } from "@/lib/catalog";
import { formatDateEn, formatNumberEn } from "@/lib/format-en-numbers";
import { cn } from "@/lib/utils";

type VariantRow = {
  id: string;
  sku: string;
  name: string;
  colorName: string | null;
  colorHex: string | null;
  imageUrl: string | null;
  pricePiastres: number;
  stockAvailable: number;
  stockReserved: number;
  sellable: number;
  updatedAt: string | null;
};

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  category: { id: string; name: string; slug: string };
  variants: VariantRow[];
};

function money(piastres: number) {
  return `${formatNumberEn(piastresToEgp(piastres))} ج.م`;
}

function variantName(variant: VariantRow) {
  return `${variant.name}${variant.colorName ? ` · ${variant.colorName}` : ""}`;
}

export default function PartnerProductVariantsPage() {
  const params = useParams<{ id: string }>();
  const productId = params.id;
  const { toast } = useToast();
  const [product, setProduct] = React.useState<ProductRow | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [fetching, setFetching] = React.useState(false);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [savingVariantId, setSavingVariantId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setFetching(true);
    try {
      const params = new URLSearchParams({ productId, limit: "1" });
      const res = await fetch(`/api/partner/inventory?${params}`, { credentials: "include" });
      const json = await res.json();
      if (res.ok && json?.success) {
        setProduct(json.data.products?.[0] ?? null);
        setDrafts({});
      } else {
        toast({ title: json?.error?.message ?? "فشل تحميل المتغيرات", variant: "destructive" });
      }
    } catch (error) {
      toast({
        title: "فشل تحميل المتغيرات",
        description: error instanceof Error ? error.message : "خطأ غير متوقع",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setFetching(false);
    }
  }, [productId, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  const totals = React.useMemo(
    () =>
      (product?.variants ?? []).reduce(
        (acc, variant) => {
          acc.available += variant.stockAvailable;
          acc.reserved += variant.stockReserved;
          if (variant.sellable <= 3) acc.low += 1;
          return acc;
        },
        { available: 0, reserved: 0, low: 0 }
      ),
    [product]
  );

  async function saveStock(variant: VariantRow) {
    const raw = drafts[variant.id] ?? String(variant.stockAvailable);
    const stockAvailable = Number.parseInt(raw, 10);
    if (!Number.isInteger(stockAvailable) || stockAvailable < 0) {
      toast({ title: "أدخل رقم مخزون صحيح", variant: "destructive" });
      return;
    }
    if (stockAvailable < variant.stockReserved) {
      toast({
        title: `لا يمكن أن يكون المخزون أقل من المحجوز (${variant.stockReserved})`,
        variant: "destructive",
      });
      return;
    }

    setSavingVariantId(variant.id);
    try {
      const res = await fetch("/api/partner/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ variantId: variant.id, stockAvailable }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        const row = json.data as { stockAvailable: number; stockReserved: number; updatedAt: string };
        setProduct((current) =>
          current
            ? {
                ...current,
                variants: current.variants.map((item) =>
                  item.id === variant.id
                    ? {
                        ...item,
                        stockAvailable: row.stockAvailable,
                        stockReserved: row.stockReserved,
                        sellable: Math.max(0, row.stockAvailable - row.stockReserved),
                        updatedAt: row.updatedAt,
                      }
                    : item
                ),
              }
            : current
        );
        setDrafts((current) => {
          const next = { ...current };
          delete next[variant.id];
          return next;
        });
        toast({ title: "تم حفظ المخزون" });
      } else {
        toast({ title: json?.error?.message ?? "فشل حفظ المخزون", variant: "destructive" });
      }
    } finally {
      setSavingVariantId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="ml-2 h-4 w-4 animate-spin" />
        جاري تحميل المتغيرات
      </div>
    );
  }

  if (!product) {
    return (
      <AdminEmptyState
        icon={<Package className="h-12 w-12" />}
        title="المنتج غير موجود"
        description="ارجع إلى قائمة المنتجات واختر منتجاً آخر."
      />
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={product.name}
        description={`${product.category.name} · تعديل مخزون متغيرات هذا المنتج فقط.`}
        badge={<AdminStatusBadge>متغيرات المنتج</AdminStatusBadge>}
        actions={
          <>
            <Button asChild type="button" variant="outline" className="rounded-md">
              <Link href="/partner/products">
                <ArrowRight className="h-4 w-4" />
                رجوع للمنتجات
              </Link>
            </Button>
            <Button type="button" variant="outline" className="rounded-md" onClick={load} disabled={fetching}>
              <RefreshCw className={cn("h-4 w-4", fetching && "animate-spin")} />
              تحديث
            </Button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <AdminKpiCard
          title="عدد المتغيرات"
          value={formatNumberEn(product.variants.length)}
          hint="مقاسات وألوان"
          icon={<Boxes className="h-5 w-5" />}
          accent="burgundy"
        />
        <AdminKpiCard
          title="إجمالي المتاح"
          value={formatNumberEn(totals.available)}
          hint={`${formatNumberEn(totals.reserved)} محجوز`}
          icon={<Warehouse className="h-5 w-5" />}
          accent="emerald"
        />
        <AdminKpiCard
          title="مخزون منخفض"
          value={formatNumberEn(totals.low)}
          hint="متغيرات 3 أو أقل"
          icon={<Package className="h-5 w-5" />}
          accent={totals.low > 0 ? "gold" : "emerald"}
        />
      </div>

      <AdminPanelCard
        title="متغيرات المنتج"
        description="الخانة الوحيدة القابلة للتعديل هي المتاح. المحجوز والقابل للبيع للقراءة فقط."
        icon={<Boxes className="h-5 w-5 text-burgundy" />}
      >
        {product.variants.length === 0 ? (
          <AdminEmptyState icon={<Boxes className="h-12 w-12" />} title="لا توجد متغيرات لهذا المنتج" />
        ) : (
          <AdminTableScroll>
            <Table className={cn(fetching && "opacity-70")}>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>الصورة</TableHead>
                  <TableHead>المتغير</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>السعر</TableHead>
                  <TableHead>المتاح</TableHead>
                  <TableHead>المحجوز</TableHead>
                  <TableHead>قابل للبيع</TableHead>
                  <TableHead>آخر تحديث</TableHead>
                  <TableHead className="text-left">حفظ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {product.variants.map((variant) => {
                  const draft = drafts[variant.id] ?? String(variant.stockAvailable);
                  const dirty = draft !== String(variant.stockAvailable);
                  return (
                    <TableRow key={variant.id}>
                      <TableCell>
                        {variant.imageUrl || product.imageUrl ? (
                          <ProductImagePreview
                            src={variant.imageUrl ?? product.imageUrl ?? ""}
                            title={variantName(variant)}
                            code={variant.sku}
                            className="overflow-hidden rounded-md border border-border"
                          />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-md border border-dashed border-border bg-muted text-muted-foreground">
                            <Package className="h-5 w-5" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex min-w-40 items-center gap-2">
                          {variant.colorHex && (
                            <span
                              className="h-4 w-4 rounded-full border border-border"
                              style={{ backgroundColor: variant.colorHex }}
                            />
                          )}
                          <span className="font-medium">{variantName(variant)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{variant.sku}</TableCell>
                      <TableCell>{money(variant.pricePiastres)}</TableCell>
                      <TableCell>
                        <Input
                          inputMode="numeric"
                          value={draft}
                          onChange={(e) => setDrafts((current) => ({ ...current, [variant.id]: e.target.value }))}
                          className={cn("h-9 w-24 rounded-md", dirty && "border-amber-400 bg-amber-50")}
                        />
                      </TableCell>
                      <TableCell>{formatNumberEn(variant.stockReserved)}</TableCell>
                      <TableCell>
                        <Badge variant={variant.sellable > 0 ? "default" : "destructive"}>
                          {formatNumberEn(variant.sellable)}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {variant.updatedAt ? formatDateEn(variant.updatedAt) : "لم يسجل"}
                      </TableCell>
                      <TableCell className="text-left">
                        <Button
                          type="button"
                          size="sm"
                          variant={dirty ? "default" : "outline"}
                          className="rounded-md"
                          disabled={!dirty || savingVariantId === variant.id}
                          onClick={() => saveStock(variant)}
                        >
                          {savingVariantId === variant.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                          حفظ
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </AdminTableScroll>
        )}
      </AdminPanelCard>
    </div>
  );
}
