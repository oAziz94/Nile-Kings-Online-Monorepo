import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const products = await prisma.product.findMany({
    select: {
      id: true,
      slug: true,
      imageUrl: true,
      variants: { select: { id: true, name: true, colorHex: true, colorName: true, imageUrl: true } },
    },
  });

  let singleColorSafe = 0;
  let multiColorRisky = 0;
  const risky: { slug: string; colorName: string | null; colorHex: string | null; otherColorsWithPhoto: number }[] = [];

  for (const product of products) {
    const byColor = new Map<string, typeof product.variants>();
    for (const v of product.variants) {
      const key = `${v.colorHex ?? ""}|${v.colorName ?? ""}`;
      const arr = byColor.get(key) ?? [];
      arr.push(v);
      byColor.set(key, arr);
    }
    const colorGroups = [...byColor.values()];
    const noPhotoGroups = colorGroups.filter((g) => !g.some((v) => v.imageUrl?.trim()));
    if (noPhotoGroups.length === 0) continue;

    if (colorGroups.length === 1) {
      // single-color product: falling back to product image is correct, not a mismatch.
      singleColorSafe += noPhotoGroups.length;
    } else {
      for (const g of noPhotoGroups) {
        const otherColorsWithPhoto = colorGroups.filter((og) => og !== g && og.some((v) => v.imageUrl?.trim())).length;
        multiColorRisky++;
        risky.push({ slug: product.slug, colorName: g[0].colorName, colorHex: g[0].colorHex, otherColorsWithPhoto });
      }
    }
  }

  console.log("Single-color products (safe, product image = only color, no mismatch possible):", singleColorSafe);
  console.log("Multi-color products where THIS color has no photo but sibling colors do (real risk of showing wrong color's photo):", multiColorRisky);
  console.table(risky.slice(0, 40));
  console.log(`...total risky rows: ${risky.length}`);
}
main().finally(() => prisma.$disconnect());
