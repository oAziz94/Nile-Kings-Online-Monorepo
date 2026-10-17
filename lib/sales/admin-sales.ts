import { listStoreSales, type SalesFilters, type SalesListDb, type SalesListResponse } from "@/lib/sales/list-sales";

/**
 * Admin view of one outlet's sales (backlog 11.6): the same filters/totals as the outlet's own log
 * (`listStoreSales`), behind a guard that the id names an existing outlet (DISTRIBUTOR). An agent id
 * never reaches the query. Takes the Prisma client as an argument so it runs against a fake in tests.
 */
export type AdminSalesDb = SalesListDb & {
  partner: {
    findUnique(args: { where: { id: string }; select: { partnerType: true } }): Promise<{ partnerType: string } | null>;
  };
};

export type AdminSalesResult =
  | { ok: true; value: SalesListResponse }
  | { ok: false; reason: "not_found" | "not_outlet" | "bad_cursor" };

export async function listOutletSalesForAdmin(db: AdminSalesDb, partnerId: string, f: SalesFilters): Promise<AdminSalesResult> {
  const partner = await db.partner.findUnique({ where: { id: partnerId }, select: { partnerType: true } });
  if (!partner) return { ok: false, reason: "not_found" };
  if (partner.partnerType !== "DISTRIBUTOR") return { ok: false, reason: "not_outlet" };
  const result = await listStoreSales(db, partnerId, f);
  if ("badCursor" in result) return { ok: false, reason: "bad_cursor" };
  return { ok: true, value: result };
}
