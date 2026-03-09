"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { piastresToEgp } from "@/lib/catalog";
import {
  BarChart3,
  Download,
  Package,
  ShoppingCart,
  Users,
  TrendingUp,
  AlertTriangle,
  Ticket,
  Truck,
  CreditCard,
} from "lucide-react";

type Kpis = {
  totalRevenuePiastres: number;
  orderCount: number;
  productCount: number;
  customerCount: number;
  period: { from: string; to: string };
};

type RevenueBucket = { period: string; revenuePiastres: number; orderCount: number };
type BestSellerRow = {
  productName: string;
  variantName: string;
  sku: string;
  quantitySold: number;
  revenuePiastres: number;
};
type VariantRow = BestSellerRow & { stockAvailable: number; stockReserved: number };
type LowStockRow = {
  productName: string;
  variantName: string;
  sku: string;
  stockAvailable: number;
  stockReserved: number;
  threshold: number;
};
type CouponRow = {
  code: string;
  discountType: string;
  discountValue: number;
  uses: number;
  maxUses: number | null;
  totalDiscountPiastres: number;
  orderCount: number;
};
type SeniorRow = {
  orderId: string;
  totalPiastres: number;
  seniorFreeValuePiastres: number;
  createdAt: string;
};
type ProviderRow = { provider: string; orderCount: number; revenuePiastres: number };
type PaymentRow = { paymentMethod: string; orderCount: number; revenuePiastres: number };

type AnalyticsData = {
  kpis: Kpis;
  revenue: RevenueBucket[];
  bestSellers: BestSellerRow[];
  variantPerformance: VariantRow[];
  lowStock: LowStockRow[];
  coupons: CouponRow[];
  seniorPromo: SeniorRow[];
  providers: ProviderRow[];
  paymentMethods: PaymentRow[];
};

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [granularity, setGranularity] = useState<"day" | "week" | "month">("day");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("section", "all");
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    params.set("granularity", granularity);
    const res = await fetch(`/api/admin/analytics?${params}`);
    if (!res.ok) {
      setData(null);
      setLoading(false);
      return;
    }
    const json = await res.json();
    if (json.success && json.data) setData(json.data);
    else setData(null);
    setLoading(false);
  }, [from, to, granularity]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const exportCsv = (report: string) => {
    const params = new URLSearchParams();
    params.set("report", report);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    window.open(`/api/admin/analytics/export?${params}`, "_blank");
  };

  if (loading && !data) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-muted-foreground">
        جاري التحميل...
      </div>
    );
  }

  const kpis = data?.kpis;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">التحليلات</h1>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <input
            type="date"
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
          <select
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
            value={granularity}
            onChange={(e) => setGranularity(e.target.value as "day" | "week" | "month")}
          >
            <option value="day">يومي</option>
            <option value="week">أسبوعي</option>
            <option value="month">شهري</option>
          </select>
          <Button variant="outline" size="sm" onClick={fetchData}>
            تحديث
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportCsv("all")}>
            <Download className="ml-1 h-4 w-4" />
            تصدير CSV
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-2xl border border-border shadow-subtle">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              إجمالي المبيعات
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-foreground">
              {kpis ? `${piastresToEgp(kpis.totalRevenuePiastres).toLocaleString("ar-EG")} ج.م` : "—"}
            </p>
            {kpis && (
              <p className="mt-1 text-xs text-muted-foreground">
                {formatDate(kpis.period.from)} – {formatDate(kpis.period.to)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-2xl border border-border shadow-subtle">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">الطلبات</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-foreground">
              {kpis ? kpis.orderCount.toLocaleString("ar-EG") : "—"}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border border-border shadow-subtle">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">المنتجات</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-foreground">
              {kpis ? kpis.productCount.toLocaleString("ar-EG") : "—"}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border border-border shadow-subtle">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">العملاء</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-foreground">
              {kpis ? kpis.customerCount.toLocaleString("ar-EG") : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Revenue over time */}
      <Card className="rounded-2xl border border-border shadow-subtle">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            الإيرادات عبر الزمن
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => exportCsv("revenue")}>
            CSV
          </Button>
        </CardHeader>
        <CardContent>
          {data?.revenue && data.revenue.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الفترة</TableHead>
                    <TableHead>الإيراد (ج.م)</TableHead>
                    <TableHead>عدد الطلبات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.revenue.map((r) => (
                    <TableRow key={r.period}>
                      <TableCell>{r.period}</TableCell>
                      <TableCell>{piastresToEgp(r.revenuePiastres).toLocaleString("ar-EG")}</TableCell>
                      <TableCell>{r.orderCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">لا توجد بيانات في الفترة المحددة.</p>
          )}
        </CardContent>
      </Card>

      {/* Best sellers */}
      <Card className="rounded-2xl border border-border shadow-subtle">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>الأكثر مبيعاً</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => exportCsv("best_sellers")}>
            CSV
          </Button>
        </CardHeader>
        <CardContent>
          {data?.bestSellers && data.bestSellers.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>المنتج</TableHead>
                  <TableHead>المقاس/النوع</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>الكمية المباعة</TableHead>
                  <TableHead>الإيراد (ج.م)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.bestSellers.map((r, i) => (
                  <TableRow key={`${r.sku}-${i}`}>
                    <TableCell>{r.productName}</TableCell>
                    <TableCell>{r.variantName}</TableCell>
                    <TableCell>{r.sku}</TableCell>
                    <TableCell>{r.quantitySold}</TableCell>
                    <TableCell>{piastresToEgp(r.revenuePiastres).toLocaleString("ar-EG")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">لا توجد مبيعات في الفترة.</p>
          )}
        </CardContent>
      </Card>

      {/* Variant performance + remaining stock */}
      <Card className="rounded-2xl border border-border shadow-subtle">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>أداء المتغيرات والمخزون المتبقي</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => exportCsv("variant_performance")}>
            CSV
          </Button>
        </CardHeader>
        <CardContent>
          {data?.variantPerformance && data.variantPerformance.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>المنتج</TableHead>
                  <TableHead>المقاس</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>مباع</TableHead>
                  <TableHead>الإيراد</TableHead>
                  <TableHead>متبقي</TableHead>
                  <TableHead>محجوز</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.variantPerformance.map((r, i) => (
                  <TableRow key={`${r.sku}-${i}`}>
                    <TableCell>{r.productName}</TableCell>
                    <TableCell>{r.variantName}</TableCell>
                    <TableCell>{r.sku}</TableCell>
                    <TableCell>{r.quantitySold}</TableCell>
                    <TableCell>{piastresToEgp(r.revenuePiastres).toLocaleString("ar-EG")} ج.م</TableCell>
                    <TableCell>{r.stockAvailable}</TableCell>
                    <TableCell>{r.stockReserved}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">لا توجد بيانات.</p>
          )}
        </CardContent>
      </Card>

      {/* Low stock alerts */}
      <Card className="rounded-2xl border border-border shadow-subtle">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            تنبيهات مخزون منخفض
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => exportCsv("low_stock")}>
            CSV
          </Button>
        </CardHeader>
        <CardContent>
          {data?.lowStock && data.lowStock.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>المنتج</TableHead>
                  <TableHead>المقاس</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>المتاح</TableHead>
                  <TableHead>المحجوز</TableHead>
                  <TableHead>الحد</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.lowStock.map((r, i) => (
                  <TableRow key={`${r.sku}-${i}`}>
                    <TableCell>{r.productName}</TableCell>
                    <TableCell>{r.variantName}</TableCell>
                    <TableCell>{r.sku}</TableCell>
                    <TableCell>
                      <Badge variant={r.stockAvailable === 0 ? "destructive" : "secondary"}>
                        {r.stockAvailable}
                      </Badge>
                    </TableCell>
                    <TableCell>{r.stockReserved}</TableCell>
                    <TableCell>{r.threshold}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">لا توجد عناصر تحت الحد.</p>
          )}
        </CardContent>
      </Card>

      {/* Coupon performance */}
      <Card className="rounded-2xl border border-border shadow-subtle">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5" />
            أداء الكوبونات
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => exportCsv("coupons")}>
            CSV
          </Button>
        </CardHeader>
        <CardContent>
          {data?.coupons && data.coupons.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الكود</TableHead>
                  <TableHead>النوع</TableHead>
                  <TableHead>القيمة</TableHead>
                  <TableHead>الاستخدامات</TableHead>
                  <TableHead>الحد الأقصى</TableHead>
                  <TableHead>إجمالي الخصم (ج.م)</TableHead>
                  <TableHead>طلبات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.coupons.map((c) => (
                  <TableRow key={c.code}>
                    <TableCell className="font-mono">{c.code}</TableCell>
                    <TableCell>{c.discountType}</TableCell>
                    <TableCell>{c.discountValue}</TableCell>
                    <TableCell>{c.uses}</TableCell>
                    <TableCell>{c.maxUses ?? "—"}</TableCell>
                    <TableCell>{piastresToEgp(c.totalDiscountPiastres).toLocaleString("ar-EG")}</TableCell>
                    <TableCell>{c.orderCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">لا توجد كوبونات أو استخدامات.</p>
          )}
        </CardContent>
      </Card>

      {/* Provider + Payment in one row */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="rounded-2xl border border-border shadow-subtle">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              أداء مقدمي الشحن
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => exportCsv("providers")}>
              CSV
            </Button>
          </CardHeader>
          <CardContent>
            {data?.providers && data.providers.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المزود</TableHead>
                    <TableHead>الطلبات</TableHead>
                    <TableHead>الإيراد (ج.م)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.providers.map((r) => (
                    <TableRow key={r.provider}>
                      <TableCell>{r.provider}</TableCell>
                      <TableCell>{r.orderCount}</TableCell>
                      <TableCell>{piastresToEgp(r.revenuePiastres).toLocaleString("ar-EG")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">لا توجد بيانات.</p>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-2xl border border-border shadow-subtle">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              طرق الدفع
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => exportCsv("payment_methods")}>
              CSV
            </Button>
          </CardHeader>
          <CardContent>
            {data?.paymentMethods && data.paymentMethods.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>طريقة الدفع</TableHead>
                    <TableHead>الطلبات</TableHead>
                    <TableHead>الإيراد (ج.م)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.paymentMethods.map((r) => (
                    <TableRow key={r.paymentMethod}>
                      <TableCell>{r.paymentMethod}</TableCell>
                      <TableCell>{r.orderCount}</TableCell>
                      <TableCell>{piastresToEgp(r.revenuePiastres).toLocaleString("ar-EG")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">لا توجد بيانات.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
