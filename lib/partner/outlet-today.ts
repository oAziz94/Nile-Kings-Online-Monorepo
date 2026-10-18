/**
 * اليوم for an outlet (DISTRIBUTOR) — backlog 11.2, plan `12-distributor-store-plan.md` §3.
 * Everything here reads `StoreSale` / `PartnerInventory` for ONE partner; there is no order
 * or SLA input. The Prisma client and the threshold resolver are injected so the
 * whole builder runs against a fake in `outlet-today.test.ts`; `app/api/partner/today/route.ts`
 * passes the real ones.
 */
import { addDaysIsoUtc, cairoDateIso, cairoStartOfDayUtc } from "../analytics/cairo-day";
import { getDisplaySizeLabel, isKidsCategory } from "../size-display";

export const OUTLET_TREND_DAYS = 14;
export const OUTLET_RECENT_RECEIPTS = 5;
export const OUTLET_LOW_STOCK_ROWS = 3;

export type OutletPaymentMethod = "CASH" | "INSTAPAY" | "CARD";

export type OutletTodayDb = {
  storeSale: {
    findMany(args: {
      where: { partnerId: string; status: "COMPLETED"; soldAt?: { gte: Date } };
      orderBy?: { soldAt: "desc" };
      take?: number;
      select: {
        id: true;
        receiptNo: true;
        soldAt: true;
        subtotalPiastres: true;
        paymentMethod: true;
        items: { select: { quantity: true } };
      };
    }): Promise<
      {
        id: string;
        receiptNo: number;
        soldAt: Date;
        subtotalPiastres: number;
        paymentMethod: OutletPaymentMethod;
        items: { quantity: number }[];
      }[]
    >;
  };
  partnerInventory: {
    findMany(args: {
      where: { partnerId: string };
      select: unknown;
    }): Promise<
      {
        stockAvailable: number;
        stockReserved: number;
        variant: {
          id: string;
          name: string;
          colorName: string | null;
          pricePiastres: number;
          product: { id: string; name: string; categoryId: string; category: { slug: string } };
        };
      }[]
    >;
  };
};

export type OutletThresholds = { forVariant: (input: { productId: string; categoryId: string }) => number };

export type OutletTodayResponse = {
  partnerType: "DISTRIBUTOR";
  partnerName: string;
  kpis: {
    salesCountToday: number;
    revenueTodayPiastres: number;
    unitsSoldToday: number;
    stockValuePiastres: number;
    sellableUnits: number;
    underThresholdCount: number;
  };
  queue: {
    lowStock: {
      count: number;
      moreCount: number;
      rows: { variantId: string; productName: string; variantName: string; sellable: number; threshold: number }[];
    };
    recentReceipts: {
      id: string;
      receiptNo: number;
      soldAt: string;
      totalPiastres: number;
      paymentMethod: OutletPaymentMethod;
    }[];
  };
  /** 14 Cairo-day points ending today, zero-filled. */
  trend: { date: string; revenuePiastres: number; salesCount: number }[];
};

export async function buildOutletToday(
  db: OutletTodayDb,
  input: { partnerId: string; partnerName: string; thresholds: OutletThresholds; now?: Date }
): Promise<OutletTodayResponse> {
  const now = input.now ?? new Date();
  const todayIso = cairoDateIso(now);
  const startOfToday = cairoStartOfDayUtc(todayIso);
  const windowStartIso = addDaysIsoUtc(todayIso, -(OUTLET_TREND_DAYS - 1));
  const windowStart = cairoStartOfDayUtc(windowStartIso);

  const saleSelect = {
    id: true,
    receiptNo: true,
    soldAt: true,
    subtotalPiastres: true,
    paymentMethod: true,
    items: { select: { quantity: true } },
  } as const;

  const [windowSales, recent, inventoryRows] = await Promise.all([
    db.storeSale.findMany({
      where: { partnerId: input.partnerId, status: "COMPLETED", soldAt: { gte: windowStart } },
      select: saleSelect,
    }),
    db.storeSale.findMany({
      where: { partnerId: input.partnerId, status: "COMPLETED" },
      orderBy: { soldAt: "desc" },
      take: OUTLET_RECENT_RECEIPTS,
      select: saleSelect,
    }),
    db.partnerInventory.findMany({
      where: { partnerId: input.partnerId },
      select: {
        stockAvailable: true,
        stockReserved: true,
        variant: {
          select: {
            id: true,
            name: true,
            colorName: true,
            pricePiastres: true,
            product: { select: { id: true, name: true, categoryId: true, category: { select: { slug: true } } } },
          },
        },
      },
    }),
  ]);

  // Sales: bucket by Cairo calendar day; "today" is everything since Cairo midnight.
  const byDay = new Map<string, { revenuePiastres: number; salesCount: number }>();
  let salesCountToday = 0;
  let revenueTodayPiastres = 0;
  let unitsSoldToday = 0;
  for (const sale of windowSales) {
    const key = cairoDateIso(sale.soldAt);
    const bucket = byDay.get(key) ?? { revenuePiastres: 0, salesCount: 0 };
    bucket.revenuePiastres += sale.subtotalPiastres;
    bucket.salesCount += 1;
    byDay.set(key, bucket);
    if (sale.soldAt >= startOfToday) {
      salesCountToday += 1;
      revenueTodayPiastres += sale.subtotalPiastres;
      unitsSoldToday += sale.items.reduce((sum, i) => sum + i.quantity, 0);
    }
  }
  const trend = Array.from({ length: OUTLET_TREND_DAYS }, (_, i) => {
    const date = addDaysIsoUtc(windowStartIso, i);
    const bucket = byDay.get(date);
    return { date, revenuePiastres: bucket?.revenuePiastres ?? 0, salesCount: bucket?.salesCount ?? 0 };
  });

  // Stock: sellable = available - reserved (never below 0 for the value); value at catalogue price.
  let sellableUnits = 0;
  let stockValuePiastres = 0;
  const lowStock: OutletTodayResponse["queue"]["lowStock"]["rows"] = [];
  for (const row of inventoryRows) {
    const sellable = row.stockAvailable - row.stockReserved;
    sellableUnits += sellable;
    stockValuePiastres += Math.max(0, sellable) * row.variant.pricePiastres;
    const threshold = input.thresholds.forVariant({
      productId: row.variant.product.id,
      categoryId: row.variant.product.categoryId,
    });
    if (sellable <= threshold) {
      const sizeLabel = getDisplaySizeLabel(row.variant.name, isKidsCategory(row.variant.product.category.slug));
      lowStock.push({
        variantId: row.variant.id,
        productName: row.variant.product.name,
        variantName: [sizeLabel, row.variant.colorName].filter(Boolean).join(" · "),
        sellable,
        threshold,
      });
    }
  }
  lowStock.sort((a, b) => a.sellable - b.sellable);

  return {
    partnerType: "DISTRIBUTOR",
    partnerName: input.partnerName,
    kpis: {
      salesCountToday,
      revenueTodayPiastres,
      unitsSoldToday,
      stockValuePiastres,
      sellableUnits,
      underThresholdCount: lowStock.length,
    },
    queue: {
      lowStock: {
        count: lowStock.length,
        moreCount: Math.max(0, lowStock.length - OUTLET_LOW_STOCK_ROWS),
        rows: lowStock.slice(0, OUTLET_LOW_STOCK_ROWS),
      },
      recentReceipts: recent.map((s) => ({
        id: s.id,
        receiptNo: s.receiptNo,
        soldAt: s.soldAt.toISOString(),
        totalPiastres: s.subtotalPiastres,
        paymentMethod: s.paymentMethod,
      })),
    },
    trend,
  };
}
