"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Banknote, CalendarRange, CheckCircle2, Download, Package, ShoppingCart, TrendingUp } from "lucide-react";
import { AdminKpiCard } from "@/components/admin/admin-kpi-card";
import { AdminSearchInput } from "@/components/admin/admin-search-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/shared/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  clampEndDate,
  clampStartDate,
  defaultReportRange,
  rangeForPreset,
  resolveEndWhenStartChanges,
  todayIso,
  type ReportRangePreset,
} from "@/lib/analytics/date-range";
import { piastresToEgp } from "@/lib/catalog";
import { formatDateEn, formatNumberEn } from "@/lib/format-en-numbers";
import { cn } from "@/lib/utils";

type Kpis = {
  totalRevenuePiastres: number;
  netMerchandisePiastres: number;
  orderCount: number;
  period: { from: string; to: string };
};

type RevenueBucket = {
  period: string;
  totalRevenuePiastres: number;
  netMerchandisePiastres: number;
  orderCount: number;
};

type ProductVariantRow = {
  variantId: string;
  productName: string;
  variantName: string;
  colorName: string | null;
  sku: string;
  pricePiastres: number;
  quantitySold: number;
  lineRevenuePiastres: number;
  stockAvailable: number;
  stockReserved: number;
};

type AnalyticsData = {
  kpis: Kpis;
  revenue: RevenueBucket[];
  products: ProductVariantRow[];
};

const PRESETS: { id: ReportRangePreset; label: string }[] = [
  { id: "7d", label: "آخر 7 أيام" },
  { id: "30d", label: "آخر 30 يوم" },
  { id: "month", label: "هذا الشهر" },
  { id: "all", label: "من البداية" },
];

const DATE_INPUT_CLASS =
  "h-10 w-full min-w-[10.5rem] rounded-xl border border-input bg-background/80 px-3 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function matchesPreset(from: string, to: string, preset: ReportRangePreset): boolean {
  const range = rangeForPreset(preset);
  return from === range.from && to === range.to;
}

function ReportsSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-28 w-full rounded-2xl" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-36 rounded-2xl" />
      </div>
      <Skeleton className="h-64 rounded-2xl" />
      <Skeleton className="h-96 rounded-2xl" />
    </div>
  );
}

function ExportButton({ onClick, label = "تصدير CSV" }: { onClick: () => void; label?: string }) {
  return (
    <Button variant="outline" size="sm" className="gap-1.5 rounded-xl border-dashed" onClick={onClick}>
      <Download className="h-4 w-4" />
      {label}
    </Button>
  );
}

export default function PartnerReportsPage() {
  const initialRange = defaultReportRange();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [granularity, setGranularity] = useState<"day" | "week" | "month">("day");
  const [productSearch, setProductSearch] = useState("");
  const today = todayIso();

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ section: "all", granularity });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const res = await fetch(`/api/partner/analytics?${params}`, { credentials: "include" });
    if (!res.ok) {
      setData(null);
      setLoading(false);
      return;
    }
    const json = await res.json();
    setData(json.success && json.data ? json.data : null);
    setLoading(false);
  }, [from, to, granularity]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleFromChange = (value: string) => {
    const newFrom = clampStartDate(value);
    setFrom(newFrom);
    setTo(resolveEndWhenStartChanges(newFrom, from, to));
  };

  const handleToChange = (value: string) => {
    setTo(clampEndDate(value, from));
  };

  const applyPreset = (preset: ReportRangePreset) => {
    const range = rangeForPreset(preset);
    setFrom(range.from);
    setTo(range.to);
  };

  const exportCsv = (report: "summary" | "revenue" | "products") => {
    const params = new URLSearchParams({ report });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (report === "revenue") params.set("granularity", granularity);
    window.open(`/api/partner/analytics/export?${params}`, "_blank");
  };

  const kpis = data?.kpis;
  const revenue = data?.revenue ?? [];
  const products = data?.products ?? [];
  const maxRevenue = useMemo(() => Math.max(...revenue.map((row) => row.totalRevenuePiastres), 1), [revenue]);
  const soldCount = useMemo(() => products.filter((row) => row.quantitySold > 0).length, [products]);
  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (row) =>
        row.productName.toLowerCase().includes(q) ||
        row.variantName.toLowerCase().includes(q) ||
        row.sku.toLowerCase().includes(q) ||
        (row.colorName?.toLowerCase().includes(q) ?? false)
    );
  }, [productSearch, products]);

  if (loading && !data) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold text-foreground">التقارير</h1>
        <ReportsSkeleton />
      </div>
    );
  }

  return (
    <div className={cn("space-y-8 transition-opacity", loading && data && "opacity-70")}>
      <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-l from-burgundy/8 via-card to-gold/10 p-4 shadow-card sm:p-6">
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-foreground sm:text-2xl">التقارير</h1>
              <Badge variant="success" className="gap-1 font-normal">
                <CheckCircle2 className="h-3 w-3" />
                تم التسليم فقط
              </Badge>
            </div>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              ملخص الإيرادات والمبيعات للطلبات المُسلَّمة والمسندة لك فقط.
            </p>
            {kpis && (
              <p className="mt-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">الفترة المعروضة:</span>{" "}
                {formatDateEn(kpis.period.from)} - {formatDateEn(kpis.period.to)}
              </p>
            )}
          </div>

          <Card className="w-full max-w-2xl shrink-0 rounded-2xl border-border/60 bg-background/90 shadow-subtle backdrop-blur-sm">
            <CardHeader className="pb-3 pt-4">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <CalendarRange className="h-4 w-4 text-burgundy" />
                فترة التقرير
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pb-4 pt-0">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="space-y-1.5">
                  <Label htmlFor="partner-report-from" className="text-xs text-muted-foreground">من</Label>
                  <input id="partner-report-from" type="date" className={DATE_INPUT_CLASS} value={from} max={to || today} onChange={(e) => handleFromChange(e.target.value)} />
                </label>
                <label className="space-y-1.5">
                  <Label htmlFor="partner-report-to" className="text-xs text-muted-foreground">إلى</Label>
                  <input id="partner-report-to" type="date" className={DATE_INPUT_CLASS} value={to} min={from} max={today} onChange={(e) => handleToChange(e.target.value)} />
                </label>
                <label className="space-y-1.5">
                  <Label htmlFor="partner-report-granularity" className="text-xs text-muted-foreground">التجميع</Label>
                  <select id="partner-report-granularity" className={DATE_INPUT_CLASS} value={granularity} onChange={(e) => setGranularity(e.target.value as "day" | "week" | "month")}>
                    <option value="day">يومي</option>
                    <option value="week">أسبوعي</option>
                    <option value="month">شهري</option>
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map(({ id, label }) => (
                  <Button key={id} type="button" variant={matchesPreset(from, to, id) ? "default" : "outline"} size="sm" className="h-8 rounded-full px-3 text-xs" onClick={() => applyPreset(id)}>
                    {label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <AdminKpiCard title="إجمالي الإيراد" value={kpis ? `${formatNumberEn(piastresToEgp(kpis.totalRevenuePiastres))} ج.م` : "-"} hint="شامل الشحن ورسوم COD" icon={<TrendingUp className="h-6 w-6" />} accent="burgundy" loading={loading} footer={<Button variant="link" size="sm" className="mt-2 h-auto p-0 text-xs text-burgundy" onClick={() => exportCsv("summary")}><Download className="ml-1 h-3 w-3" />تصدير الملخص</Button>} />
        <AdminKpiCard title="صافي المنتجات" value={kpis ? `${formatNumberEn(piastresToEgp(kpis.netMerchandisePiastres))} ج.م` : "-"} hint="بعد الخصومات، بدون الشحن ورسوم COD" icon={<Banknote className="h-6 w-6" />} accent="gold" loading={loading} />
        <AdminKpiCard title="طلبات مُسلَّمة" value={kpis ? formatNumberEn(kpis.orderCount) : "-"} hint="عدد طلباتك في الفترة" icon={<ShoppingCart className="h-6 w-6" />} accent="emerald" loading={loading} />
      </div>

      <Card className="rounded-2xl border-border/80 shadow-card">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-muted/30 pb-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="h-5 w-5 text-burgundy" />
              الإيرادات عبر الزمن
            </CardTitle>
            <CardDescription className="mt-1">مقارنة الإيراد الكلي وصافي المنتجات حسب الفترة</CardDescription>
          </div>
          <ExportButton onClick={() => exportCsv("revenue")} />
        </CardHeader>
        <CardContent className="pt-6">
          {revenue.length > 0 ? (
            <div className="space-y-6">
              <div className="flex items-end gap-1 overflow-x-auto pb-2 pt-1">
                {revenue.map((row) => {
                  const height = Math.max(8, Math.round((row.totalRevenuePiastres / maxRevenue) * 120));
                  return (
                    <div key={row.period} className="flex min-w-[2.5rem] flex-1 flex-col items-center gap-2">
                      <div className="w-full max-w-[3rem] rounded-t-lg bg-gradient-to-t from-burgundy/80 to-burgundy/40" style={{ height: `${height}px` }} />
                      <span className="max-w-[3.5rem] truncate text-center text-[10px] text-muted-foreground">{row.period}</span>
                    </div>
                  );
                })}
              </div>
              <div className="overflow-x-auto rounded-xl border border-border/60">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead>الفترة</TableHead>
                      <TableHead>إجمالي الإيراد</TableHead>
                      <TableHead>صافي المنتجات</TableHead>
                      <TableHead className="text-center">الطلبات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {revenue.map((row) => (
                      <TableRow key={row.period}>
                        <TableCell className="font-medium">{row.period}</TableCell>
                        <TableCell>{formatNumberEn(piastresToEgp(row.totalRevenuePiastres))}</TableCell>
                        <TableCell>{formatNumberEn(piastresToEgp(row.netMerchandisePiastres))}</TableCell>
                        <TableCell className="text-center"><Badge variant="secondary">{row.orderCount}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <BarChart3 className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">لا توجد بيانات في الفترة المحددة.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/80 shadow-card">
        <CardHeader className="flex flex-col gap-4 border-b border-border/60 bg-muted/30 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Package className="h-5 w-5 text-burgundy" />
              المنتجات والمتغيرات
            </CardTitle>
            <CardDescription className="mt-1">
              {formatNumberEn(products.length)} متغير · {formatNumberEn(soldCount)} بمبيعات في الفترة
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AdminSearchInput value={productSearch} onChange={setProductSearch} placeholder="بحث منتج، مقاس، SKU..." />
            <ExportButton onClick={() => exportCsv("products")} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredProducts.length > 0 ? (
            <div className="max-h-[32rem] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card shadow-sm">
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead>المنتج</TableHead>
                    <TableHead>المقاس</TableHead>
                    <TableHead>اللون</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>السعر</TableHead>
                    <TableHead className="text-center">مباع</TableHead>
                    <TableHead>إيراد البنود</TableHead>
                    <TableHead className="text-center">متبقي</TableHead>
                    <TableHead className="text-center">محجوز</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((row) => (
                    <TableRow key={row.variantId} className={cn(row.quantitySold > 0 && "bg-emerald-500/[0.03]")}>
                      <TableCell className="font-medium">{row.productName}</TableCell>
                      <TableCell>{row.variantName}</TableCell>
                      <TableCell className="text-muted-foreground">{row.colorName ?? "-"}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{row.sku}</TableCell>
                      <TableCell>{formatNumberEn(piastresToEgp(row.pricePiastres))}</TableCell>
                      <TableCell className="text-center">{row.quantitySold > 0 ? <Badge variant="success">{row.quantitySold}</Badge> : <span className="text-muted-foreground">0</span>}</TableCell>
                      <TableCell>{row.lineRevenuePiastres > 0 ? `${formatNumberEn(piastresToEgp(row.lineRevenuePiastres))} ج.م` : "-"}</TableCell>
                      <TableCell className="text-center"><Badge variant={row.stockAvailable === 0 ? "destructive" : "outline"}>{row.stockAvailable}</Badge></TableCell>
                      <TableCell className="text-center text-muted-foreground">{row.stockReserved}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <Package className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">{productSearch.trim() ? "لا توجد نتائج للبحث." : "لا توجد منتجات نشطة."}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
