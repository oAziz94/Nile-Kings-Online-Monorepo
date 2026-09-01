import { PrismaClient } from "@prisma/client";
import { variantSlug } from "../lib/admin/slug";

const prisma = new PrismaClient();

const CANONICAL_LADDER = ["S", "M", "L", "XL", "XXL", "XXXL", "4XL"];

const ALIASES: Record<string, string> = {
  "3XL": "XXXL",
  "4X": "4XL",
  "4 XL": "4XL",
};

function canonicalOf(size: string): string {
  const upper = size.toUpperCase();
  return ALIASES[upper] ?? upper;
}

/** Mirrors app/api/admin/products/[id]/variants/route.ts toSkuSafeColor(). */
function toSkuSafeColor(color: string): string {
  const cleaned = color.replace(/\s+/g, "_").toUpperCase().replace(/[^A-Z0-9_]/g, "");
  if (cleaned.length >= 2) return cleaned;
  let h = 0;
  for (let i = 0; i < color.length; i++) h = ((h << 5) - h + color.charCodeAt(i)) | 0;
  return "C" + Math.abs(h).toString(36).toUpperCase().slice(0, 8);
}

function buildSku(productSlug: string, size: string, colorRaw: string): string {
  const colorPart = toSkuSafeColor(colorRaw);
  const skuBase = `${productSlug}-${size}-${colorPart}`;
  return skuBase.toUpperCase().replace(/[^A-Z0-9_]/g, "_") || `${productSlug}-V`;
}

async function main() {
  const products = await prisma.product.findMany({
    where: { active: true },
    select: {
      id: true,
      slug: true,
      variants: {
        select: {
          id: true,
          name: true,
          colorHex: true,
          colorName: true,
          pricePiastres: true,
          basePricePiastres: true,
        },
      },
    },
  });

  const existingSkus = new Set(
    (await prisma.variant.findMany({ select: { sku: true } })).map((v) => v.sku)
  );
  const existingSlugs = new Set(
    (await prisma.variant.findMany({ select: { slug: true } })).map((v) => v.slug).filter(Boolean)
  );

  type ToCreate = {
    productId: string;
    sku: string;
    slug: string;
    name: string;
    colorHex: string | null;
    colorName: string | null;
    basePricePiastres: number | null;
    pricePiastres: number;
    stockAvailable: number;
    stockReserved: number;
  };

  const toCreate: ToCreate[] = [];
  let skippedCollisions = 0;

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
      const presentCanonical = new Set(variants.map((v) => canonicalOf(v.name)));
      const missingSizes = CANONICAL_LADDER.filter((rung) => !presentCanonical.has(rung));
      if (missingSizes.length === 0) continue;

      const sample = variants[0];
      const colorRaw = sample.colorName?.trim() || sample.colorHex?.trim() || "NOC";

      for (const size of missingSizes) {
        const sku = buildSku(product.slug, size, colorRaw);
        const slug = variantSlug(product.slug, size, sample.colorHex ?? null);

        if (existingSkus.has(sku) || existingSlugs.has(slug)) {
          skippedCollisions++;
          console.warn(`  SKIP (collision) product=${product.slug} size=${size} color=${colorRaw} sku=${sku} slug=${slug}`);
          continue;
        }
        existingSkus.add(sku);
        existingSlugs.add(slug);

        toCreate.push({
          productId: product.id,
          sku,
          slug,
          name: size,
          colorHex: sample.colorHex,
          colorName: sample.colorName,
          basePricePiastres: sample.basePricePiastres,
          pricePiastres: sample.pricePiastres,
          stockAvailable: 0,
          stockReserved: 0,
        });
      }
    }
  }

  console.log(`Prepared ${toCreate.length} variants to create (${skippedCollisions} skipped due to sku/slug collisions).`);

  if (process.argv.includes("--dry-run")) {
    console.log("Dry run — no writes performed.");
    return;
  }

  const BATCH_SIZE = 200;
  let created = 0;
  for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
    const batch = toCreate.slice(i, i + BATCH_SIZE);
    await prisma.$transaction(batch.map((data) => prisma.variant.create({ data })));
    created += batch.length;
    console.log(`  created ${created}/${toCreate.length}`);
  }

  console.log(`Done. Created ${created} variants.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
