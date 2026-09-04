"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Boxes, Loader2, Package, RefreshCw, Save, Warehouse } from "lucide-react";
import { EmptyState } from "@/components/dashboard/empty-state";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { PaginationBar } from "@/components/dashboard/pagination";
import { PanelCard } from "@/components/dashboard/panel-card";
import { SearchInput } from "@/components/dashboard/search-input";
import { TableScroll } from "@/components/dashboard/table-scroll";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { formatDateEn, formatNumberEn } from "@/lib/format-en-numbers";
import { cn } from "@/lib/utils";

type PartnerOption = {
  id: string;
  name: string;
  phone: string;
  partnerType: string;
  governorate: string;
};

type VariantRow = {
  id: string;
  sku: string;
  name: string;
  colorName: string | null;
  colorHex: string | null;
  inventoryId: string | null;
  stockAvailable: number;
  stockReserved: number;
  sellable: number;
  updatedAt: string | null;
};

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  category: { id: string; name: string; slug: string };
  variants: VariantRow[];
};

function variantLabel(v: VariantRow) {
  return `${v.name}${v.colorName ? ` · ${v.colorName}` : ""}`;
}

export default function AdminPartnerInventoryPage() {
  return (
    <React.Suspense fallback={null}>
      <AdminPartnerInventoryPageInner />
    </React.Suspense>
  );
}

function AdminPartnerInventoryPageInner() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [partners, setPartners] = React.useState<PartnerOption[]>([]);
  const [partnerId, setPartnerId] = React.useState("");
  const [products, setProducts] = React.useState<ProductRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [fetching, setFetching] = React.useState(false);
  const [search, setSearch] = React.useState(() => searchParams.get("q") ?? "");
  const [debouncedQ, setDebouncedQ] = React.useState(search);
  const [lowOnly, setLowOnly] = React.useState(false);
  const [needsSetupOnly, setNeedsSetupOnly] = React.useState(false);
  const [page, setPage] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(20);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [savingVariantId, setSavingVariantId] = React.useState<string | null>(null);

  React.useEffect(() => {
    Promise.all([
      fetch("/api/admin/partners?partnerType=AGENT&limit=200", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/admin/partners?partnerType=DISTRIBUTOR&limit=200", { credentials: "include" }).then((r) => r.json()),
    ])
      .then(([agentsJson, distributorsJson]) => {
        setPartners([
          ...(agentsJson?.data?.partners ?? []),
          ...(distributorsJson?.data?.partners ?? []),
        ]);
      })
      .catch(() => toast({ title: "فشل تحميل الشركاء", variant: "destructive" }));
  }, [toast]);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(search.trim()), 400);
    return () => clearTimeout(timer);
  }, [search]);

  React.useEffect(() => {
    setPage(0);
  }, [debouncedQ, lowOnly, needsSetupOnly, partnerId]);

  const load = React.useCallback(async () => {
    if (!partnerId) {
      setProducts([]);
      setTotal(0);
      return;
    }
    setFetching(true);
    const params = new URLSearchParams({
      partnerId,
      limit: String(pageSize),
      offset: String(page * pageSize),
    });
    if (debouncedQ) params.set("q", debouncedQ);
    if (lowOnly) params.set("lowOnly", "true");
    if (needsSetupOnly) params.set("needsSetupOnly", "true");

    try {
      const res = await fetch(`/api/admin/partner-inventory?${params}`, { credentials: "include" });
      const json = await res.json();
      if (res.ok && json?.success) {
        setProducts(json.data.products ?? []);
        setTotal(json.data.total ?? 0);
        setDrafts({});
      } else {
        toast({ title: json?.error?.message ?? "فشل تحميل المخزون", variant: "destructive" });
      }
    } catch (error) {
      toast({
        title: "فشل تحميل المخزون",
        description: error instanceof Error ? error.message : "خطأ غير متوقع",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setFetching(false);
    }
  }, [partnerId, debouncedQ, lowOnly, needsSetupOnly, page, pageSize, toast]);

  React.useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const rows = React.useMemo(
    () =>
      products.flatMap((product) =>
        product.variants.map((variant) => ({ product, variant }))
      ),
    [products]
  );

  const totals = rows.reduce(
    (acc, { variant }) => {
      acc.available += variant.stockAvailable;
      acc.reserved += variant.stockReserved;
      if (variant.sellable <= 3) acc.low += 1;
      if (variant.inventoryId === null) acc.needsSetup += 1;
      return acc;
    },
    { available: 0, reserved: 0, low: 0, needsSetup: 0 }
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
      const res = await fetch("/api/admin/partner-inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ partnerId, variantId: variant.id, stockAvailable }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        const row = json.data as { id: string; stockAvailable: number; stockReserved: number; updatedAt: string };
        setProducts((current) =>
          current.map((product) => ({
            ...product,
            variants: product.variants.map((item) =>
              item.id === variant.id
                ? {
                    ...item,
                    inventoryId: row.id,
                    stockAvailable: row.stockAvailable,
                    stockReserved: row.stockReserved,
                    sellable: Math.max(0, row.stockAvailable - row.stockReserved),
                    updatedAt: row.updatedAt,
                  }
                : item
            ),
          }))
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

  const selectedPartner = partners.find((p) => p.id === partnerId) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="مخزون الشركاء"
        description="اختر شريكاً لعرض وتعديل مخزونه الحقيقي مباشرة من الجدول."
        actions={
          partnerId ? (
            <Button type="button" variant="outline" className="rounded-md" onClick={load} disabled={fetching}>
              <RefreshCw className={cn("h-4 w-4", fetching && "animate-spin")} />
              تحديث
            </Button>
          ) : undefined
        }
      />

      <PanelCard title="الشريك" icon={<Warehouse className="h-5 w-5 text-burgundy" />}>
        <div className="max-w-md">
          <Select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
            <option value="">اختر الشريك لعرض مخزونه</option>
            {partners.map((partner) => (
              <option key={partner.id} value={partner.id}>
                {partner.name} · {partner.partnerType === "AGENT" ? "وكيل" : "موزع"} · {partner.governorate}
              </option>
            ))}
          </Select>
        </div>
      </PanelCard>

      {!partnerId ? (
        <EmptyState
          icon={<Warehouse className="h-12 w-12" />}
          title="اختر شريكاً للبدء"
          description="سيظهر هنا كل منتج ومتغير مع مخزون هذا الشريك الفعلي، وتقدر تعدّله مباشرة من الجدول."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
            <KpiCard title="إجمالي المتاح" value={formatNumberEn(totals.available)} icon={<Boxes className="h-5 w-5" />} accent="burgundy" />
            <KpiCard title="إجمالي المحجوز" value={formatNumberEn(totals.reserved)} icon={<Boxes className="h-5 w-5" />} />
            <KpiCard title="مخزون منخفض" value={formatNumberEn(totals.low)} hint="≤ 3 قطع قابلة للبيع" icon={<Boxes className="h-5 w-5" />} accent="burgundy" />
            <KpiCard title="يحتاج إعداد" value={formatNumberEn(totals.needsSetup)} hint="لا يوجد سجل مخزون بعد" icon={<Boxes className="h-5 w-5" />} />
          </div>

          <PanelCard
            title={`مخزون ${selectedPartner?.name ?? ""}`}
            icon={<Package className="h-5 w-5 text-burgundy" />}
            toolbar={
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={lowOnly ? "default" : "outline"}
                  className="rounded-md"
                  onClick={() => setLowOnly((v) => !v)}
                >
                  مخزون منخفض فقط
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={needsSetupOnly ? "default" : "outline"}
                  className="rounded-md"
                  onClick={() => setNeedsSetupOnly((v) => !v)}
                >
                  يحتاج إعداد فقط
                </Button>
                <SearchInput value={search} onChange={setSearch} placeholder="بحث بالمنتج أو SKU…" />
              </div>
            }
          >
            {loading ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                جاري التحميل
              </div>
            ) : rows.length === 0 ? (
              <EmptyState
                icon={<Package className="h-12 w-12" />}
                title={debouncedQ || lowOnly || needsSetupOnly ? "لا توجد نتائج مطابقة" : "لا توجد منتجات"}
              />
            ) : (
              <TableScroll>
                <Table className={cn(fetching && "opacity-70")}>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead>المنتج</TableHead>
                      <TableHead>المتغير</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>المتاح</TableHead>
                      <TableHead>المحجوز</TableHead>
                      <TableHead>قابل للبيع</TableHead>
                      <TableHead>آخر تحديث</TableHead>
                      <TableHead className="text-left">حفظ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map(({ product, variant }) => {
                      const draft = drafts[variant.id] ?? String(variant.stockAvailable);
                      const dirty = draft !== String(variant.stockAvailable);
                      return (
                        <TableRow key={variant.id}>
                          <TableCell className="font-medium">{product.name}</TableCell>
                          <TableCell>
                            <div className="flex min-w-32 items-center gap-2">
                              {variant.colorHex && (
                                <span
                                  className="h-4 w-4 shrink-0 rounded-full border border-border"
                                  style={{ backgroundColor: variant.colorHex }}
                                />
                              )}
                              <span>{variantLabel(variant)}</span>
                              {variant.inventoryId === null && (
                                <Badge variant="outline" className="text-[11px]">يحتاج إعداد</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{variant.sku}</TableCell>
                          <TableCell>
                            <Input
                              inputMode="numeric"
                              value={draft}
                              onChange={(e) => setDrafts((current) => ({ ...current, [variant.id]: e.target.value }))}
                              className={cn("h-9 w-24 rounded-md", dirty && "border-gold/50 bg-gold/10")}
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
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableScroll>
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
        </>
      )}
    </div>
  );
}
