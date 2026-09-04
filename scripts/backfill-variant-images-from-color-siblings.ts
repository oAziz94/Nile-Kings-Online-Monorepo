import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const products = await prisma.product.findMany({
    select: {
      id: true,
      slug: true,
      variants: { select: { id: true, colorHex: true, colorName: true, imageUrl: true } },
    },
  });

  const updates: { id: string; imageUrl: string }[] = [];

  for (const product of products) {
    const byColor = new Map<string, typeof product.variants>();
    for (const v of product.variants) {
      const key = `${v.colorHex ?? ""}|${v.colorName ?? ""}`;
      const arr = byColor.get(key) ?? [];
      arr.push(v);
      byColor.set(key, arr);
    }

    for (const variants of byColor.values()) {
      const reference = variants.find((v) => v.imageUrl?.trim())?.imageUrl;
      if (!reference) continue;
      for (const v of variants) {
        if (!v.imageUrl?.trim()) updates.push({ id: v.id, imageUrl: reference });
      }
    }
  }

  console.log(`Prepared ${updates.length} variant image backfills.`);

  if (process.argv.includes("--dry-run")) {
    console.log("Dry run — no writes performed.");
    return;
  }

  const BATCH_SIZE = 200;
  let done = 0;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    await prisma.$transaction(
      batch.map((u) => prisma.variant.update({ where: { id: u.id }, data: { imageUrl: u.imageUrl } }))
    );
    done += batch.length;
    console.log(`  updated ${done}/${updates.length}`);
  }
  console.log("Done.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
