import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";
import path from "path";

const prisma = new PrismaClient();

const GAMAL_PARTNER_ID = "cmnhoc985000zjs04vrixqxjh"; // جمال السيد عبدالعزيز

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  return lines.join("\n");
}

async function main() {
  const rows = await prisma.$queryRawUnsafe<
    {
      sku: string;
      productName: string;
      variantName: string;
      colorName: string | null;
      stockAvailable: number;
      stockReserved: number;
      pricePiastres: number;
    }[]
  >(
    `
    SELECT
      v.sku,
      p.name AS "productName",
      v.name AS "variantName",
      v."colorName",
      pi."stockAvailable",
      pi."stockReserved",
      v."pricePiastres"
    FROM "PartnerInventory" pi
    JOIN "Variant" v ON v.id = pi."variantId"
    JOIN "Product" p ON p.id = v."productId"
    WHERE pi."partnerId" = $1
      AND (pi."stockAvailable" - pi."stockReserved") <> 0
    ORDER BY p.name ASC, v.sku ASC
    `,
    GAMAL_PARTNER_ID
  );

  const normalized = (
    JSON.parse(
      JSON.stringify(rows, (_key, value) => (typeof value === "bigint" ? Number(value) : value))
    ) as typeof rows
  ).map((r) => ({ ...r, sellable: r.stockAvailable - r.stockReserved }));

  // Detail CSV (one row per SKU)
  const detailCsv = toCsv(
    normalized.map((r) => ({
      sku: r.sku,
      product: r.productName,
      variant: r.variantName,
      color: r.colorName ?? "",
      available: r.stockAvailable,
      reserved: r.stockReserved,
      sellable: r.sellable,
      price_egp: (r.pricePiastres / 100).toFixed(2),
      worth_egp: ((r.sellable * r.pricePiastres) / 100).toFixed(2),
    }))
  );
  writeFileSync(path.join(process.cwd(), "gamal-available-inventory-detail.csv"), detailCsv, "utf-8");

  // Product-level summary
  const byProduct = new Map<string, { qty: number; worthPiastres: number; skuCount: number }>();
  for (const r of normalized) {
    const agg = byProduct.get(r.productName) ?? { qty: 0, worthPiastres: 0, skuCount: 0 };
    agg.qty += r.sellable;
    agg.worthPiastres += r.sellable * r.pricePiastres;
    agg.skuCount += 1;
    byProduct.set(r.productName, agg);
  }

  const summaryRows = Array.from(byProduct.entries())
    .map(([product, agg]) => ({
      product,
      skuCount: agg.skuCount,
      qty: agg.qty,
      worth_egp: (agg.worthPiastres / 100).toFixed(2),
    }))
    .sort((a, b) => Number(b.worth_egp) - Number(a.worth_egp));

  const summaryCsv = toCsv(summaryRows);
  writeFileSync(path.join(process.cwd(), "gamal-available-inventory-summary.csv"), summaryCsv, "utf-8");

  console.log("product,skuCount,qty,worth_egp");
  for (const r of summaryRows) console.log(`${r.product},${r.skuCount},${r.qty},${r.worth_egp}`);

  const totalQty = normalized.reduce((sum, r) => sum + r.sellable, 0);
  const totalWorthPiastres = normalized.reduce((sum, r) => sum + r.sellable * r.pricePiastres, 0);
  console.log(`\nTOTAL PRODUCTS: ${byProduct.size}`);
  console.log(`TOTAL SKUs: ${normalized.length}`);
  console.log(`TOTAL SELLABLE QTY: ${totalQty}`);
  console.log(`TOTAL SELLABLE WORTH (EGP): ${(totalWorthPiastres / 100).toFixed(2)}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
