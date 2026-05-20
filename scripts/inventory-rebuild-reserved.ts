/**
 * Clear ghost stockReserved; keep holds for open InstaPay CREATED orders only.
 * stockAvailable is never modified (sellable changes only via reserved).
 *
 *   npm run inventory:rebuild-reserved
 *   npm run inventory:rebuild-reserved -- --dry-run
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
  const dryRun = process.argv.includes("--dry-run");

  const holdOrders = await prisma.order.findMany({
    where: { status: "CREATED", paymentMethod: INSTAPAY },
    select: {
      id: true,
      createdAt: true,
      items: { select: { variantId: true, quantity: true, sku: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const otherCreated = await prisma.order.count({
    where: { status: "CREATED", paymentMethod: { not: INSTAPAY } },
  });

  /** Per variant: reserved qty required by open InstaPay orders (0 if none). */
  const keepReserved = new Map<string, number>();
  for (const order of holdOrders) {
    for (const [variantId, qty] of aggregateLines(order.items)) {
      keepReserved.set(variantId, (keepReserved.get(variantId) ?? 0) + qty);
    }
  }

  const variants = await prisma.variant.findMany({
    select: { id: true, sku: true, stockAvailable: true, stockReserved: true },
  });

  const changes = variants
    .map((v) => {
      const next = keepReserved.get(v.id) ?? 0;
      if (v.stockReserved === next) return null;
      const clearingGhost = v.stockReserved > 0 && next === 0;
      const trimmingExcess = v.stockReserved > next && next > 0;
      const fixingHold = v.stockReserved < next;
      return {
        id: v.id,
        sku: v.sku,
        before: v.stockReserved,
        after: next,
        clearingGhost,
        trimmingExcess,
        fixingHold,
        sellableBefore: v.stockAvailable - v.stockReserved,
        sellableAfter: v.stockAvailable - next,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const ghostClears = changes.filter((c) => c.clearingGhost).length;
  const holdAdjusts = changes.filter((c) => c.after > 0).length;

  console.log("=== Clear ghost reserved (keep open InstaPay holds) ===\n");
  console.log("stockAvailable: NOT modified");
  console.log(`Mode: ${dryRun ? "DRY RUN (no writes)" : "APPLY"}`);
  console.log(`Open InstaPay CREATED orders: ${holdOrders.length}`);
  if (otherCreated > 0) {
    console.log(`Warning: ${otherCreated} other CREATED order(s) (non-InstaPay) — not included.`);
  }
  console.log(`SKUs that keep reserved (from those orders): ${keepReserved.size}`);
  console.log(`Variants to update: ${changes.length} (${ghostClears} cleared to 0, ${holdAdjusts} hold rows set)\n`);

  if (holdOrders.length > 0) {
    console.log("--- Open orders (reserved kept) ---");
    for (const o of holdOrders) {
      const lineSummary = o.items.map((i) => `${i.sku}×${i.quantity}`).join(", ");
      console.log(`  ${o.id}  ${new Date(o.createdAt).toISOString().slice(0, 10)}  ${lineSummary}`);
    }
    console.log();
  }

  if (changes.length > 0) {
    console.log("--- Changes (first 40) ---");
    for (const c of changes.slice(0, 40)) {
      const tag = c.clearingGhost ? "clear ghost" : c.fixingHold ? "fix hold" : "trim excess";
      console.log(
        `  [${tag}] ${c.sku}: reserved ${c.before} → ${c.after}, sellable ${c.sellableBefore} → ${c.sellableAfter}`
      );
    }
    if (changes.length > 40) {
      console.log(`  … and ${changes.length - 40} more`);
    }
    console.log();
  }

  if (dryRun) {
    console.log("Dry run complete. Re-run without --dry-run to apply.");
    await prisma.$disconnect();
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const c of changes) {
      await tx.variant.update({
        where: { id: c.id },
        data: { stockReserved: c.after },
      });
    }
  });

  const afterNonZero = await prisma.variant.count({ where: { stockReserved: { gt: 0 } } });
  console.log(`Applied. Variants with reserved > 0 now: ${afterNonZero}`);
  console.log("Run npm run inventory:audit to verify.");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
