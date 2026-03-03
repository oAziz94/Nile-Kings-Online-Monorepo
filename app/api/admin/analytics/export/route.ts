import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { apiSuccess, apiUnauthorized, apiForbidden, apiBadRequest } from "@/lib/api/response";
import * as queries from "@/lib/analytics/queries";

function piastresToEgp(piastres: number): string {
  return (piastres / 100).toFixed(2);
}

function escapeCsvCell(s: string | number): string {
  const str = String(s);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }

  const { searchParams } = new URL(req.url);
  const report = searchParams.get("report") ?? "";
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;

  let csv = "";
  const filename: string[] = ["analytics"];

  if (report === "revenue" || report === "all") {
    const rows = await queries.getRevenueOverTime("day", from, to);
    csv += "Period,Revenue (EGP),Order Count\n";
    for (const r of rows) {
      csv += `${escapeCsvCell(r.period)},${escapeCsvCell(piastresToEgp(r.revenuePiastres))},${escapeCsvCell(r.orderCount)}\n`;
    }
    csv += "\n";
    filename.push("revenue");
  }

  if (report === "best_sellers" || report === "all") {
    const rows = await queries.getBestSellers(from, to, 100);
    csv += "Product,Variant,SKU,Quantity Sold,Revenue (EGP)\n";
    for (const r of rows) {
      csv += `${escapeCsvCell(r.productName)},${escapeCsvCell(r.variantName)},${escapeCsvCell(r.sku)},${escapeCsvCell(r.quantitySold)},${escapeCsvCell(piastresToEgp(r.revenuePiastres))}\n`;
    }
    csv += "\n";
    filename.push("best-sellers");
  }

  if (report === "variant_performance" || report === "all") {
    const rows = await queries.getVariantPerformance(from, to, 100);
    csv += "Product,Variant,SKU,Quantity Sold,Revenue (EGP),Stock Available,Stock Reserved\n";
    for (const r of rows) {
      csv += `${escapeCsvCell(r.productName)},${escapeCsvCell(r.variantName)},${escapeCsvCell(r.sku)},${escapeCsvCell(r.quantitySold)},${escapeCsvCell(piastresToEgp(r.revenuePiastres))},${escapeCsvCell(r.stockAvailable)},${escapeCsvCell(r.stockReserved)}\n`;
    }
    csv += "\n";
    filename.push("variant-performance");
  }

  if (report === "low_stock") {
    const threshold = Math.max(0, parseInt(searchParams.get("threshold") ?? "5", 10) || 5);
    const rows = await queries.getLowStockAlerts(threshold);
    csv += "Product,Variant,SKU,Stock Available,Stock Reserved,Threshold\n";
    for (const r of rows) {
      csv += `${escapeCsvCell(r.productName)},${escapeCsvCell(r.variantName)},${escapeCsvCell(r.sku)},${escapeCsvCell(r.stockAvailable)},${escapeCsvCell(r.stockReserved)},${escapeCsvCell(r.threshold)}\n`;
    }
    filename.push("low-stock");
  }

  if (report === "coupons" || report === "all") {
    const rows = await queries.getCouponPerformance(from, to);
    csv += "Code,Discount Type,Discount Value,Uses,Max Uses,Total Discount (EGP),Order Count\n";
    for (const r of rows) {
      csv += `${escapeCsvCell(r.code)},${escapeCsvCell(r.discountType)},${escapeCsvCell(r.discountValue)},${escapeCsvCell(r.uses)},${escapeCsvCell(r.maxUses ?? "")},${escapeCsvCell(piastresToEgp(r.totalDiscountPiastres))},${escapeCsvCell(r.orderCount)}\n`;
    }
    csv += "\n";
    filename.push("coupons");
  }

  if (report === "senior_promo" || report === "all") {
    const rows = await queries.getSeniorPromoReport(from, to);
    csv += "Order ID,User ID,Total (EGP),Senior Free Value (EGP),Created At\n";
    for (const r of rows) {
      csv += `${escapeCsvCell(r.orderId)},${escapeCsvCell(r.userId)},${escapeCsvCell(piastresToEgp(r.totalPiastres))},${escapeCsvCell(piastresToEgp(r.seniorFreeValuePiastres))},${escapeCsvCell(r.createdAt.toISOString())}\n`;
    }
    csv += "\n";
    filename.push("senior-promo");
  }

  if (report === "providers" || report === "all") {
    const rows = await queries.getProviderPerformance(from, to);
    csv += "Provider,Order Count,Revenue (EGP)\n";
    for (const r of rows) {
      csv += `${escapeCsvCell(r.provider)},${escapeCsvCell(r.orderCount)},${escapeCsvCell(piastresToEgp(r.revenuePiastres))}\n`;
    }
    csv += "\n";
    filename.push("providers");
  }

  if (report === "payment_methods" || report === "all") {
    const rows = await queries.getPaymentMethodBreakdown(from, to);
    csv += "Payment Method,Order Count,Revenue (EGP)\n";
    for (const r of rows) {
      csv += `${escapeCsvCell(r.paymentMethod)},${escapeCsvCell(r.orderCount)},${escapeCsvCell(piastresToEgp(r.revenuePiastres))}\n`;
    }
    filename.push("payment-methods");
  }

  if (!csv && report !== "") {
    return apiBadRequest("تقرير غير صالح");
  }

  const name = filename.join("-") + ".csv";
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
