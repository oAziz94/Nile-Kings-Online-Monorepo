"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Banknote,
  CalendarRange,
  CheckCircle2,
  Download,
  GitBranch,
  Package,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";
import { PageHeader, StatusBadge } from "@/components/dashboard/page-header";
import { PanelCard } from "@/components/dashboard/panel-card";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { SearchInput } from "@/components/dashboard/search-input";
import { TableScroll } from "@/components/dashboard/table-scroll";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { getOrderStatusLabel } from "@/lib/constants/order-status";
import { piastresToEgp } from "@/lib/catalog";
import { formatDateEn, formatNumberEn } from "@/lib/format-en-numbers";
import { cn } from "@/lib/utils";
import type { SortingState } from "@tanstack/table-core";

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

type StockReportRow = {
  variantId: string;
  productName: string;
  variantName: string;
  colorName: string | null;
  sku: string;
  stockAvailable: number;
  stockReserved: number;
  sellable: number;
  unitsSold30d: number;
  dailyVelocity: number;
  daysOfCover: number | null;
  low: boolean;
  out: boolean;
};

type OrderFunnelRow = {
  status: string;
  count: number;
};

type AnalyticsData = {
  kpis: Kpis;
  revenue: RevenueBucket[];
  products: ProductVariantRow[];
  stock: StockReportRow[];
  funnel: OrderFunnelRow[];
};

const PRESETS: { id: ReportRangePreset; label: string }[] = [
  { id: "7d", label: "آخر 7 أيام" },
  { id: "30d", label: "آخر 30 يوم" },
  { id: "month", label: "هذا الشهر" },
  { id: "all", label: "من البداية" },
];

const DATE_INPUT_CLASS =
  "h-10 w-full min-w-[10.5rem] rounded-xl border border-stone-200 bg-white px-3 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500";

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
      <Skeleton className="h-64 rounded-2xl" />
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

/** Order status -> pill variant, per the canvas's p-success/p-warning/p-info/p-neutral/carnelian legend. */
const STATUS_PILL_VARIANT: Record<string, "success" | "warning" | "info" | "secondary" | "destructive"> = {
  CREATED: "secondary",
  CONFIRMED: "info",
  PROCESSING: "warning",
  READY_TO_SHIP: "info",
  SHIPPED: "info",
  DELIVERED: "success",
  CANCELLED: "destructive",
};

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-[14px] border border-carnelian-500/30 bg-danger-bg p-8 text-center text-danger-text"
    >
      <AlertTriangle className="h-8 w-8" />
      <p className="text-[15px] font-extrabold">{message}</p>
      <p className="text-[13px] text-danger-text/80">هذا خطأ حقيقي في تحميل البيانات، وليس غياب بيانات في الفترة المحددة.</p>
      <Button type="button" variant="outline" size="sm" className="mt-1 rounded-xl border-carnelian-500/40" onClick={onRetry}>
        إعادة المحاولة
      </Button>
    </div>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-carnelian-500/30 bg-danger-bg px-4 py-3 text-danger-text"
    >
      <p className="flex items-center gap-2 text-sm font-bold">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {message}
      </p>
      <Button type="button" variant="outline" size="sm" className="rounded-lg border-carnelian-500/40" onClick={onRetry}>
        إعادة المحاولة
      </Button>
    </div>
  );
}

export default function PartnerReportsPage() {
  const initialRange = defaultReportRange();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [granularity, setGranularity] = useState<"day" | "week" | "month">("day");
  const [productSearch, setProductSearch] = useState("");
  const [stockSorting, setStockSorting] = useState<SortingState>([]);
  const today = todayIso();

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ section: "all", granularity });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    try {
      const res = await fetch(`/api/partner/analytics?${params}`, { credentials: "include" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success || !json?.data) {
        setError(json?.error?.message ?? "تعذر تحميل التقارير. حاول مرة أخرى.");
        setLoading(false);
        return;
      }
      setData(json.data);
      setError(null);
      setLoading(false);
    } catch {
      setError("تعذر الاتصال بالخادم. تحقق من الاتصال وحاول مرة أخرى.");
      setLoading(false);
    }
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

  const exportCsv = (report: "summary" | "revenue" | "products" | "stock" | "funnel") => {
    const params = new URLSearchParams({ report });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (report === "revenue" || report === "funnel") params.set("granularity", granularity);
    window.open(`/api/partner/analytics/export?${params}`, "_blank");
  };

  const kpis = data?.kpis;
  const revenue = data?.revenue ?? [];
  const products = data?.products ?? [];
  const stock = data?.stock ?? [];
  const funnel = data?.funnel ?? [];
  const maxRevenue = useMemo(() => Math.max(...revenue.map((row) => row.totalRevenuePiastres), 1), [revenue]);
  const maxFunnel = useMemo(() => Math.max(...funnel.map((row) => row.count), 1), [funnel]);
  const soldCount = useMemo(() => products.filter((row) => row.quantitySold > 0).length, [products]);
  const lowOrOutCount = useMemo(() => stock.filter((row) => row.low || row.out).length, [stock]);
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

  const stockColumns = useMemo<ColumnDef<StockReportRow, unknown>[]>(
    () => [
      {
        id: "productName",
        header: "المنتج",
        accessorKey: "productName",
        enableSorting: true,
        cell: ({ row }) => (
          <div>
            <p className="font-semibold text-ink">{row.original.productName}</p>
            <p className="text-xs text-ink-soft">
              {row.original.variantName}
              {row.original.colorName ? ` · ${row.original.colorName}` : ""}
            </p>
          </div>
        ),
      },
      {
        id: "sku",
        header: "SKU",
        accessorKey: "sku",
        enableSorting: true,
        cell: ({ getValue }) => <span dir="ltr" className="font-mono text-xs text-ink-soft">{getValue() as string}</span>,
      },
      {
        id: "sellable",
        header: "قابل للبيع",
        accessorKey: "sellable",
        enableSorting: true,
        cell: ({ row }) => (
          <div className="text-center">
            <p className="font-semibold text-ink">{formatNumberEn(row.original.sellable)}</p>
            <p className="text-[11px] text-ink-soft">
              {formatNumberEn(row.original.stockAvailable)} متاح · {formatNumberEn(row.original.stockReserved)} محجوز
            </p>
          </div>
        ),
      },
      {
        id: "unitsSold30d",
        header: "مباع (30 يوم)",
        accessorKey: "unitsSold30d",
        enableSorting: true,
        cell: ({ getValue }) => <span className="text-center block">{formatNumberEn(getValue() as number)}</span>,
      },
      {
        id: "dailyVelocity",
        header: "السرعة اليومية",
        accessorKey: "dailyVelocity",
        enableSorting: true,
        cell: ({ getValue }) => <span className="text-center block">{formatNumberEn(Number((getValue() as number).toFixed(2)))}</span>,
      },
      {
        id: "daysOfCover",
        header: "أيام التغطية",
        accessorKey: "daysOfCover",
        enableSorting: true,
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          return <span className="text-center block">{v === null ? "-" : formatNumberEn(Number(v.toFixed(1)))}</span>;
        },
      },
      {
        id: "status",
        header: "الحالة",
        cell: ({ row }) => {
          const { low, out } = row.original;
          if (out) return <Badge variant="destructive" className="gap-1">نفد</Badge>;
          if (low) return <Badge variant="warning" className="gap-1">منخفض</Badge>;
          return <Badge variant="success" className="gap-1">جيد</Badge>;
        },
      },
    ],
    []
  );

  if (loading && !data) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-extrabold text-ink">التقارير</h1>
        <ReportsSkeleton />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div>
        <PageHeader title="التقارير" description="ملخص الإيرادات والمبيعات للطلبات المُسلَّمة والمسندة لك فقط." />
        <ErrorPanel message={error} onRetry={fetchData} />
      </div>
    );
  }

  return (
    <div className={cn("space-y-8 transition-opacity", loading && data && "opacity-70")}>
      <PageHeader
        title="التقارير"
        badge={
          <StatusBadge>
            <CheckCircle2 className="h-3 w-3" />
            تم التسليم فقط
          </StatusBadge>
        }
        description="ملخص الإيرادات والمبيعات ومسار الطلبات للطلبات المسندة لك فقط."
        meta={
          kpis && (
            <span>
              <span className="font-semibold text-ink">الفترة المعروضة:</span>{" "}
              {formatDateEn(kpis.period.from)} - {formatDateEn(kpis.period.to)}
            </span>
          )
        }
      />

      {error && data && <ErrorBanner message={error} onRetry={fetchData} />}

      <PanelCard
        title="فترة التقرير"
        icon={<CalendarRange className="h-4 w-4 text-lapis-800" />}
        className="border-stone-200"
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1.5">
              <Label htmlFor="partner-report-from" className="text-xs text-ink-soft">من</Label>
              <input id="partner-report-from" type="date" className={DATE_INPUT_CLASS} value={from} max={to || today} onChange={(e) => handleFromChange(e.target.value)} />
            </label>
            <label className="space-y-1.5">
              <Label htmlFor="partner-report-to" className="text-xs text-ink-soft">إلى</Label>
              <input id="partner-report-to" type="date" className={DATE_INPUT_CLASS} value={to} min={from} max={today} onChange={(e) => handleToChange(e.target.value)} />
            </label>
            <label className="space-y-1.5">
              <Label htmlFor="partner-report-granularity" className="text-xs text-ink-soft">التجميع</Label>
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
        </div>
      </PanelCard>

      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard title="إجمالي الإيراد" value={kpis ? `${formatNumberEn(piastresToEgp(kpis.totalRevenuePiastres))} ج.م` : "-"} hint="شامل الشحن ورسوم COD" icon={<TrendingUp className="h-5 w-5" />} accent="burgundy" loading={loading} footer={<Button variant="link" size="sm" className="mt-2 h-auto p-0 text-xs text-lapis-800" onClick={() => exportCsv("summary")}><Download className="ml-1 h-3 w-3" />تصدير الملخص</Button>} />
        <KpiCard title="صافي المنتجات" value={kpis ? `${formatNumberEn(piastresToEgp(kpis.netMerchandisePiastres))} ج.م` : "-"} hint="بعد الخصومات، بدون الشحن ورسوم COD" icon={<Banknote className="h-5 w-5" />} accent="gold" loading={loading} />
        <KpiCard title="طلبات مُسلَّمة" value={kpis ? formatNumberEn(kpis.orderCount) : "-"} hint="عدد طلباتك في الفترة" icon={<ShoppingCart className="h-5 w-5" />} accent="emerald" loading={loading} />
      </div>

      <PanelCard
        title="الإيرادات عبر الزمن"
        description="مقارنة الإيراد الكلي وصافي المنتجات حسب الفترة"
        icon={<BarChart3 className="h-4 w-4 text-lapis-800" />}
        toolbar={<ExportButton onClick={() => exportCsv("revenue")} />}
        noPadding
      >
        {revenue.length > 0 ? (
          <div className="space-y-6 p-4 sm:p-[22px]">
            <div className="flex items-end gap-1 overflow-x-auto pb-2 pt-1">
              {revenue.map((row) => {
                const height = Math.max(8, Math.round((row.totalRevenuePiastres / maxRevenue) * 120));
                return (
                  <div key={row.period} className="flex min-w-[2.5rem] flex-1 flex-col items-center gap-2">
                    <div className="w-full max-w-[3rem] rounded-t-lg bg-gradient-to-t from-lapis-800 to-gold-500" style={{ height: `${height}px` }} />
                    <span className="max-w-[3.5rem] truncate text-center text-[10px] text-ink-soft">{row.period}</span>
                  </div>
                );
              })}
            </div>
            <TableScroll>
              <Table>
                <TableHeader>
                  <TableRow className="bg-stone-100 hover:bg-stone-100">
                    <TableHead className="text-xs font-extrabold text-ink-soft">الفترة</TableHead>
                    <TableHead className="text-xs font-extrabold text-ink-soft">إجمالي الإيراد</TableHead>
                    <TableHead className="text-xs font-extrabold text-ink-soft">صافي المنتجات</TableHead>
                    <TableHead className="text-center text-xs font-extrabold text-ink-soft">الطلبات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {revenue.map((row) => (
                    <TableRow key={row.period} className="border-stone-200">
                      <TableCell className="font-medium text-ink">{row.period}</TableCell>
                      <TableCell className="text-ink">{formatNumberEn(piastresToEgp(row.totalRevenuePiastres))}</TableCell>
                      <TableCell className="text-ink">{formatNumberEn(piastresToEgp(row.netMerchandisePiastres))}</TableCell>
                      <TableCell className="text-center"><Badge variant="secondary">{row.orderCount}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableScroll>
          </div>
        ) : (
          <EmptyState icon={<BarChart3 className="h-8 w-8" strokeWidth={1.5} />} title="لا توجد بيانات في الفترة المحددة." className="m-4 sm:m-[22px]" />
        )}
      </PanelCard>

      <PanelCard
        title="تقرير المخزون"
        description="السرعة اليومية وأيام التغطية محسوبة على مبيعات آخر 30 يومًا، بصرف النظر عن الفترة المختارة أعلاه."
        icon={<Package className="h-4 w-4 text-lapis-800" />}
        toolbar={<ExportButton onClick={() => exportCsv("stock")} />}
        noPadding
      >
        <div className="border-b border-stone-200 px-4 py-3 text-xs text-ink-soft sm:px-[22px]">
          {formatNumberEn(stock.length)} متغير · {formatNumberEn(lowOrOutCount)} منخفض أو نافد
        </div>
        <div className="p-4 sm:p-[22px]">
          <DataTable
            columns={stockColumns}
            data={stock}
            getRowId={(row) => row.variantId}
            sorting={stockSorting}
            onSortingChange={setStockSorting}
            emptyTitle="لا توجد منتجات نشطة."
            emptyIcon={<Package className="h-8 w-8" strokeWidth={1.5} />}
          />
        </div>
      </PanelCard>

      <PanelCard
        title="مسار الطلبات"
        description="عدد الطلبات المسندة لك حسب حالتها الحالية، في الفترة المحددة (يشمل الملغاة)."
        icon={<GitBranch className="h-4 w-4 text-lapis-800" />}
        toolbar={<ExportButton onClick={() => exportCsv("funnel")} />}
      >
        {funnel.some((row) => row.count > 0) ? (
          <div className="space-y-3">
            {funnel.map((row) => {
              const width = Math.max(2, Math.round((row.count / maxFunnel) * 100));
              const variant = STATUS_PILL_VARIANT[row.status] ?? "secondary";
              return (
                <div key={row.status} className="flex items-center gap-3">
                  <Badge variant={variant} className="w-28 shrink-0 justify-center gap-1">
                    {getOrderStatusLabel(row.status)}
                  </Badge>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-stone-100">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        row.status === "CANCELLED" ? "bg-carnelian-500" : "bg-lapis-800"
                      )}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-left text-sm font-bold text-ink">{formatNumberEn(row.count)}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={<GitBranch className="h-8 w-8" strokeWidth={1.5} />} title="لا توجد طلبات في الفترة المحددة." />
        )}
      </PanelCard>

      <PanelCard
        title="المنتجات والمتغيرات"
        description={`${formatNumberEn(products.length)} متغير · ${formatNumberEn(soldCount)} بمبيعات في الفترة`}
        icon={<Package className="h-4 w-4 text-lapis-800" />}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={productSearch} onChange={setProductSearch} placeholder="بحث منتج، مقاس، SKU..." />
            <ExportButton onClick={() => exportCsv("products")} />
          </div>
        }
        noPadding
      >
        {filteredProducts.length > 0 ? (
          <div className="max-h-[32rem] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-stone-100">
                <TableRow className="bg-stone-100 hover:bg-stone-100">
                  <TableHead className="text-xs font-extrabold text-ink-soft">المنتج</TableHead>
                  <TableHead className="text-xs font-extrabold text-ink-soft">المقاس</TableHead>
                  <TableHead className="text-xs font-extrabold text-ink-soft">اللون</TableHead>
                  <TableHead className="text-xs font-extrabold text-ink-soft">SKU</TableHead>
                  <TableHead className="text-xs font-extrabold text-ink-soft">السعر</TableHead>
                  <TableHead className="text-center text-xs font-extrabold text-ink-soft">مباع</TableHead>
                  <TableHead className="text-xs font-extrabold text-ink-soft">إيراد البنود</TableHead>
                  <TableHead className="text-center text-xs font-extrabold text-ink-soft">متبقي</TableHead>
                  <TableHead className="text-center text-xs font-extrabold text-ink-soft">محجوز</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((row) => (
                  <TableRow key={row.variantId} className={cn("border-stone-200", row.quantitySold > 0 && "bg-malachite-bg/40")}>
                    <TableCell className="font-medium text-ink">{row.productName}</TableCell>
                    <TableCell className="text-ink">{row.variantName}</TableCell>
                    <TableCell className="text-ink-soft">{row.colorName ?? "-"}</TableCell>
                    <TableCell dir="ltr" className="font-mono text-xs text-ink-soft">{row.sku}</TableCell>
                    <TableCell className="text-ink">{formatNumberEn(piastresToEgp(row.pricePiastres))}</TableCell>
                    <TableCell className="text-center">{row.quantitySold > 0 ? <Badge variant="success">{row.quantitySold}</Badge> : <span className="text-ink-soft">0</span>}</TableCell>
                    <TableCell className="text-ink">{row.lineRevenuePiastres > 0 ? `${formatNumberEn(piastresToEgp(row.lineRevenuePiastres))} ج.م` : "-"}</TableCell>
                    <TableCell className="text-center"><Badge variant={row.stockAvailable === 0 ? "destructive" : "outline"}>{row.stockAvailable}</Badge></TableCell>
                    <TableCell className="text-center text-ink-soft">{row.stockReserved}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState
            icon={<Package className="h-8 w-8" strokeWidth={1.5} />}
            title={productSearch.trim() ? "لا توجد نتائج للبحث." : "لا توجد منتجات نشطة."}
            className="m-4 sm:m-[22px]"
          />
        )}
      </PanelCard>
    </div>
  );
}
