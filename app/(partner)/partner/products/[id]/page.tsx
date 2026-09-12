"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  ClipboardList,
  Loader2,
  Minus,
  Package,
  Plus,
  RefreshCw,
  Save,
  Warehouse,
} from "lucide-react";
import { ProductImagePreview } from "@/components/shared/product-image-preview";
import { EmptyState } from "@/components/dashboard/empty-state";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PageHeader, StatusBadge } from "@/components/dashboard/page-header";
import { PanelCard } from "@/components/dashboard/panel-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { piastresToEgp } from "@/lib/catalog";
import { formatDateEn, formatNumberEn } from "@/lib/format-en-numbers";
import { getDisplaySizeLabel, isKidsCategory } from "@/lib/size-display";
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

const STOCK_VERIFY_STATUSES = "CREATED,CONFIRMED,PROCESSING";
const DEFAULT_LOW_STOCK_THRESHOLD = 5;

function money(piastres: number) {
  return `${formatNumberEn(piastresToEgp(piastres))} ج.م`;
}

function variantName(variant: VariantRow, forKids: boolean) {
  const size = getDisplaySizeLabel(variant.name, forKids);
  return `${size}${variant.colorName ? ` · ${variant.colorName}` : ""}`;
}

export default function PartnerProductVariantsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const productId = params.id;
  const { toast } = useToast();
  const [product, setProduct] = React.useState<ProductRow | null>(null);
  const [lowStockThreshold, setLowStockThreshold] = React.useState(DEFAULT_LOW_STOCK_THRESHOLD);
  const [loading, setLoading] = React.useState(true);
  const [fetching, setFetching] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [adjustDrafts, setAdjustDrafts] = React.useState<Record<string, string>>({});
  const [savingVariantId, setSavingVariantId] = React.useState<string | null>(null);
  const [notFound, setNotFound] = React.useState(false);

  const load = React.useCallback(async () => {
    setFetching(true);
    try {
      const params = new URLSearchParams({ productId, limit: "1" });
      const res = await fetch(`/api/partner/inventory?${params}`, { credentials: "include" });
      const json = await res.json();
      if (res.ok && json?.success) {
        const found = json.data.products?.[0] ?? null;
        setProduct(found);
        setNotFound(!found);
        setLowStockThreshold(json.data.partner?.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD);
        setDrafts({});
        setAdjustDrafts({});
        setLoadError(null);
      } else {
        const message = json?.error?.message ?? "فشل تحميل المتغيرات";
        setLoadError(message);
        toast({ title: message, variant: "destructive" });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "خطأ غير متوقع";
      setLoadError("فشل تحميل المتغيرات");
      toast({ title: "فشل تحميل المتغيرات", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
      setFetching(false);
    }
  }, [productId, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  const forKidsSizes = isKidsCategory(product?.category.slug);

  const totals = React.useMemo(
    () =>
      (product?.variants ?? []).reduce(
        (acc, variant) => {
          acc.available += variant.stockAvailable;
          acc.reserved += variant.stockReserved;
          if (variant.sellable <= lowStockThreshold) acc.low += 1;
          return acc;
        },
        { available: 0, reserved: 0, low: 0 }
      ),
    [product, lowStockThreshold]
  );

  const applyServerRow = React.useCallback(
    (variantId: string, row: { stockAvailable: number; stockReserved: number; updatedAt: string }) => {
      setProduct((current) =>
        current
          ? {
              ...current,
              variants: current.variants.map((item) =>
                item.id === variantId
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
        delete next[variantId];
        return next;
      });
      setAdjustDrafts((current) => {
        const next = { ...current };
        delete next[variantId];
        return next;
      });
    },
    []
  );

  const patchStock = React.useCallback(
    async (variantId: string, body: { stockAvailable: number } | { delta: number }) => {
      setSavingVariantId(variantId);
      try {
        const res = await fetch("/api/partner/inventory", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ variantId, ...body }),
        });
        const json = await res.json();
        if (res.ok && json?.success) {
          applyServerRow(variantId, json.data);
          toast({ title: "تم حفظ المخزون" });
        } else {
          toast({ title: json?.error?.message ?? "فشل حفظ المخزون", variant: "destructive" });
        }
      } catch (error) {
        toast({
          title: "فشل حفظ المخزون",
          description: error instanceof Error ? error.message : "خطأ غير متوقع",
          variant: "destructive",
        });
      } finally {
        setSavingVariantId(null);
      }
    },
    [applyServerRow, toast]
  );

  const saveStock = React.useCallback(
    async (variant: VariantRow) => {
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
      await patchStock(variant.id, { stockAvailable });
    },
    [drafts, patchStock, toast]
  );

  const adjustStock = React.useCallback(
    async (variant: VariantRow, sign: 1 | -1) => {
      const raw = adjustDrafts[variant.id] ?? "";
      const amount = Number.parseInt(raw, 10);
      if (!Number.isInteger(amount) || amount <= 0) {
        toast({ title: "أدخل كمية صحيحة أكبر من صفر", variant: "destructive" });
        return;
      }
      const delta = sign * amount;
      const projected = variant.stockAvailable + delta;
      if (projected < variant.stockReserved) {
        toast({
          title: `لا يمكن أن يكون المخزون أقل من المحجوز (${variant.stockReserved})`,
          variant: "destructive",
        });
        return;
      }
      await patchStock(variant.id, { delta });
    },
    [adjustDrafts, patchStock, toast]
  );

  const columns = React.useMemo<ColumnDef<VariantRow, unknown>[]>(() => {
    if (!product) return [];
    return [
      {
        id: "image",
        header: "الصورة",
        enableSorting: false,
        cell: ({ row }) => {
          const variant = row.original;
          return variant.imageUrl || product.imageUrl ? (
            <ProductImagePreview
              src={variant.imageUrl ?? product.imageUrl ?? ""}
              title={variantName(variant, forKidsSizes)}
              code={variant.sku}
              className="overflow-hidden rounded-md border border-stone-200"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-md border border-dashed border-stone-300 bg-stone-100 text-ink-soft">
              <Package className="h-5 w-5" />
            </div>
          );
        },
      },
      {
        id: "variant",
        header: "المتغير",
        enableSorting: false,
        cell: ({ row }) => {
          const variant = row.original;
          return (
            <div className="flex min-w-40 items-center gap-2">
              {variant.colorHex && (
                <span
                  className="h-4 w-4 rounded-full border border-stone-300"
                  style={{ backgroundColor: variant.colorHex }}
                />
              )}
              <span className="font-bold text-ink">{variantName(variant, forKidsSizes)}</span>
            </div>
          );
        },
      },
      {
        id: "sku",
        header: "SKU",
        enableSorting: false,
        cell: ({ row }) => <span className="font-mono text-xs" dir="ltr">{row.original.sku}</span>,
      },
      {
        id: "price",
        header: "السعر",
        enableSorting: false,
        cell: ({ row }) => money(row.original.pricePiastres),
      },
      {
        id: "available",
        header: "المتاح",
        enableSorting: false,
        cell: ({ row }) => {
          const variant = row.original;
          const draft = drafts[variant.id] ?? String(variant.stockAvailable);
          const dirty = draft !== String(variant.stockAvailable);
          return (
            <Input
              inputMode="numeric"
              aria-label={`المتاح لمتغير ${variantName(variant, forKidsSizes)}`}
              value={draft}
              onChange={(e) => setDrafts((current) => ({ ...current, [variant.id]: e.target.value }))}
              className={cn("h-9 w-24 rounded-md", dirty && "border-gold-500/60 bg-gold-50")}
            />
          );
        },
      },
      {
        id: "quickAdjust",
        header: "تعديل سريع",
        enableSorting: false,
        cell: ({ row }) => {
          const variant = row.original;
          const saving = savingVariantId === variant.id;
          return (
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-8 w-8 rounded-md"
                aria-label={`إنقاص المتاح لمتغير ${variantName(variant, forKidsSizes)}`}
                disabled={saving}
                onClick={() => adjustStock(variant, -1)}
              >
                <Minus className="h-3.5 w-3.5" />
              </Button>
              <Input
                inputMode="numeric"
                aria-label={`كمية التعديل السريع لمتغير ${variantName(variant, forKidsSizes)}`}
                placeholder="N"
                value={adjustDrafts[variant.id] ?? ""}
                onChange={(e) => setAdjustDrafts((current) => ({ ...current, [variant.id]: e.target.value }))}
                className="h-8 w-14 rounded-md px-2 text-center"
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-8 w-8 rounded-md"
                aria-label={`زيادة المتاح لمتغير ${variantName(variant, forKidsSizes)}`}
                disabled={saving}
                onClick={() => adjustStock(variant, 1)}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        },
      },
      {
        id: "reserved",
        header: "المحجوز",
        enableSorting: false,
        cell: ({ row }) => formatNumberEn(row.original.stockReserved),
      },
      {
        id: "sellable",
        header: "قابل للبيع",
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={row.original.sellable > 0 ? "success" : "destructive"}>
            {formatNumberEn(row.original.sellable)}
          </Badge>
        ),
      },
      {
        id: "updatedAt",
        header: "آخر تحديث",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs text-ink-soft">
            {row.original.updatedAt ? formatDateEn(row.original.updatedAt) : "لم يسجل"}
          </span>
        ),
      },
      {
        id: "reservedOrders",
        header: "الطلبات المحجوزة",
        enableSorting: false,
        cell: ({ row }) => (
          <Button asChild type="button" size="sm" variant="outline" className="rounded-md">
            <Link
              href={`/partner/routed-orders?variantId=${row.original.id}&status=${STOCK_VERIFY_STATUSES}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ClipboardList className="h-4 w-4" />
              عرض الطلبات
            </Link>
          </Button>
        ),
      },
      {
        id: "save",
        header: "حفظ",
        enableSorting: false,
        cell: ({ row }) => {
          const variant = row.original;
          const draft = drafts[variant.id] ?? String(variant.stockAvailable);
          const dirty = draft !== String(variant.stockAvailable);
          const saving = savingVariantId === variant.id;
          return (
            <Button
              type="button"
              size="sm"
              variant={dirty ? "default" : "outline"}
              className="rounded-md"
              disabled={!dirty || saving}
              onClick={() => saveStock(variant)}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              حفظ
            </Button>
          );
        },
      },
    ];
  }, [product, forKidsSizes, drafts, adjustDrafts, savingVariantId, saveStock, adjustStock]);

  if (loading) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center text-sm text-ink-soft">
        <Loader2 className="ml-2 h-4 w-4 animate-spin" />
        جاري تحميل المتغيرات
      </div>
    );
  }

  if (loadError && !product) {
    return (
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
    );
  }

  if (notFound || !product) {
    return (
      <EmptyState
        icon={<Package className="h-12 w-12" />}
        title="المنتج غير موجود"
        description="ارجع إلى قائمة المنتجات واختر منتجاً آخر."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={product.name}
        description={`${product.category.name} · تعديل مخزون متغيرات هذا المنتج فقط.`}
        badge={<StatusBadge>متغيرات المنتج</StatusBadge>}
        actions={
          <>
            <Button type="button" variant="outline" className="rounded-md" onClick={() => router.back()}>
              <ArrowRight className="h-4 w-4" />
              رجوع للمنتجات
            </Button>
            <Button type="button" variant="outline" className="rounded-md" onClick={load} disabled={fetching}>
              <RefreshCw className={cn("h-4 w-4", fetching && "animate-spin")} />
              تحديث
            </Button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard
          title="عدد المتغيرات"
          value={formatNumberEn(product.variants.length)}
          hint="مقاسات وألوان"
          icon={<Boxes className="h-5 w-5" />}
          accent="burgundy"
        />
        <KpiCard
          title="إجمالي المتاح"
          value={formatNumberEn(totals.available)}
          hint={`${formatNumberEn(totals.reserved)} محجوز`}
          icon={<Warehouse className="h-5 w-5" />}
          accent="emerald"
        />
        <KpiCard
          title="مخزون منخفض"
          value={formatNumberEn(totals.low)}
          hint={`متغيرات ${formatNumberEn(lowStockThreshold)} أو أقل`}
          icon={<Package className="h-5 w-5" />}
          accent={totals.low > 0 ? "gold" : "emerald"}
        />
      </div>

      <PanelCard
        title="متغيرات المنتج"
        description="الخانة الوحيدة القابلة للتعديل يدوياً هي المتاح، أو استخدم التعديل السريع للإضافة/الخصم. المحجوز والقابل للبيع للقراءة فقط."
        icon={<Boxes className="h-5 w-5 text-lapis-800" />}
        noPadding
      >
        <div className="p-4 sm:p-[22px]">
          {product.variants.length === 0 ? (
            <EmptyState icon={<Boxes className="h-12 w-12" />} title="لا توجد متغيرات لهذا المنتج" />
          ) : (
            <DataTable
              columns={columns}
              data={product.variants}
              getRowId={(row) => row.id}
              className={cn(fetching && "opacity-70")}
            />
          )}
        </div>
      </PanelCard>
    </div>
  );
}
