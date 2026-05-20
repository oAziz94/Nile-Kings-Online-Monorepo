/**
 * Audit variant stock counters vs open InstaPay CREATED orders.
 *
 *   npm run inventory:audit
 *   npm run inventory:rebuild-reserved        # fix reserved counters
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const INSTAPAY = "INSTAPAY_PREPAID";

function aggregateLines(
  rows: { variantId: string; quantity: number }[]
): Map<string, number> {
  const m = new Map<string, number>();
  for (const { variantId, quantity } of rows) {
    if (quantity <= 0) continue;
    m.set(variantId, (m.get(variantId) ?? 0) + quantity);
  }
  return m;
}

async function main() {
  const variants = await prisma.variant.findMany({
    select: {
      id: true,
      sku: true,
      stockAvailable: true,
      stockReserved: true,
      product: { select: { name: true } },
    },
    orderBy: { sku: "asc" },
  });

  const holdOrders = await prisma.order.findMany({
    where: { status: "CREATED", paymentMethod: INSTAPAY },
    include: { items: { select: { variantId: true, quantity: true } } },
  });

  const expectedReserved = new Map<string, number>();
  for (const order of holdOrders) {
    for (const [variantId, qty] of aggregateLines(order.items)) {
      expectedReserved.set(variantId, (expectedReserved.get(variantId) ?? 0) + qty);
    }
  }

  console.log("=== Inventory audit ===\n");
  console.log(`Open InstaPay CREATED orders (unpaid holds): ${holdOrders.length}`);
  console.log(`Variants with stockReserved > 0: ${variants.filter((v) => v.stockReserved > 0).length}\n`);

  let mismatchCount = 0;
  for (const v of variants) {
    const expected = expectedReserved.get(v.id) ?? 0;
    if (v.stockReserved !== expected) {
      mismatchCount++;
      console.log(
        `MISMATCH ${v.sku} (${v.product.name}): stockReserved=${v.stockReserved}, expected=${expected}, sellable=${v.stockAvailable - v.stockReserved}`
      );
    }
  }
  if (mismatchCount === 0) {
    console.log("All variant stockReserved values match InstaPay CREATED order totals.");
  } else {
    console.log(`\n${mismatchCount} variant(s) out of sync. Run: npm run inventory:rebuild-reserved`);
  }

  const ghostReserved = variants.filter(
    (v) => v.stockReserved > 0 && (expectedReserved.get(v.id) ?? 0) === 0
  );
  if (ghostReserved.length > 0) {
    console.log(`\nGhost reserved: ${ghostReserved.length} variant(s) (reserved > 0, no open InstaPay hold)`);
  }

  const negativeSellable = variants.filter(
    (v) => v.stockAvailable - v.stockReserved < 0
  );
  if (negativeSellable.length > 0) {
    console.log(
      `\nNegative sellable: ${negativeSellable.length} variant(s) — fix stockAvailable (physical count), not reserved alone.`
    );
  }

  console.log("\n--- Per-variant summary (reserved > 0 or expected > 0) ---");
  for (const v of variants) {
    const expected = expectedReserved.get(v.id) ?? 0;
    if (v.stockReserved === 0 && expected === 0) continue;
    console.log(
      `${v.sku}: available=${v.stockAvailable}, reserved=${v.stockReserved}, expectedHold=${expected}, sellable=${v.stockAvailable - v.stockReserved}`
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
