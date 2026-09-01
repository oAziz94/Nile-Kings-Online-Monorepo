import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Canonical full size ladder every color should have.
const CANONICAL_LADDER = ["S", "M", "L", "XL", "XXL", "XXXL", "4XL"];

// Alias -> canonical rung. Different spellings of the same rung count as
// "already present" and are never duplicated.
const ALIASES: Record<string, string> = {
  "3XL": "XXXL",
  "4X": "4XL",
  "4 XL": "4XL",
  "14": "4XL", // kids-category data-entry inconsistency; should be renamed to 4XL
};

function canonicalOf(size: string): string {
  const upper = size.toUpperCase();
  return ALIASES[upper] ?? upper;
}

async function main() {
  const products = await prisma.product.findMany({
    where: { active: true },
    select: {
      id: true,
      name: true,
      slug: true,
      variants: {
        select: {
          id: true,
          name: true,
          colorHex: true,
          colorName: true,
          pricePiastres: true,
          basePricePiastres: true,
          sku: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  type Gap = {
    productName: string;
    productSlug: string;
    colorName: string | null;
    colorHex: string | null;
    existingSizes: string[];
    missingSizes: string[];
    sampleVariant: { sku: string; pricePiastres: number; basePricePiastres: number | null };
  };

  const gaps: Gap[] = [];
  let colorGroupsTotal = 0;

  for (const product of products) {
    if (product.variants.length === 0) continue;

    const byColor = new Map<string, typeof product.variants>();
    for (const v of product.variants) {
      const key = `${v.colorHex ?? ""}|${v.colorName ?? ""}`;
      const arr = byColor.get(key) ?? [];
      arr.push(v);
      byColor.set(key, arr);
    }

    for (const variants of byColor.values()) {
      colorGroupsTotal++;
      const presentCanonical = new Set(variants.map((v) => canonicalOf(v.name)));
      const missingSizes = CANONICAL_LADDER.filter((rung) => !presentCanonical.has(rung));
      if (missingSizes.length === 0) continue;

      const sample = variants[0];
      gaps.push({
        productName: product.name,
        productSlug: product.slug,
        colorName: sample.colorName,
        colorHex: sample.colorHex,
        existingSizes: [...new Set(variants.map((v) => v.name))],
        missingSizes,
        sampleVariant: {
          sku: sample.sku,
          pricePiastres: sample.pricePiastres,
          basePricePiastres: sample.basePricePiastres,
        },
      });
    }
  }

  console.log(`Active products scanned: ${products.length}`);
  console.log(`Color groups scanned: ${colorGroupsTotal}`);
  console.log(`Color groups missing at least one rung: ${gaps.length}`);
  const totalVariantsToAdd = gaps.reduce((sum, g) => sum + g.missingSizes.length, 0);
  console.log(`Total variants that would be created: ${totalVariantsToAdd}`);
  console.log("");

  for (const g of gaps) {
    console.log(`- ${g.productName} [${g.productSlug}] — color: ${g.colorName ?? "(none)"} ${g.colorHex ?? ""}`.trim());
    console.log(`    has:     ${g.existingSizes.join(", ")}`);
    console.log(`    MISSING: ${g.missingSizes.join(", ")}`);
    console.log(
      `    price ref: sku=${g.sampleVariant.sku} price=${g.sampleVariant.pricePiastres} base=${g.sampleVariant.basePricePiastres ?? "null"}`
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
