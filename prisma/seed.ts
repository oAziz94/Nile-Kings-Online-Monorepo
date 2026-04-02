import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SIZE_NAMES = ["S", "M", "L", "XL", "XXL"] as const;

async function main() {
  // Dev seed: ensure sample admin user exists (role only; no separate allowlist table)
  await prisma.user.upsert({
    where: { phone: "+201000000001" },
    create: { phone: "+201000000001", role: "ADMIN" },
    update: { role: "ADMIN" },
  });

  // Seed sample categories and products with S–XXL variants
  const catMen = await prisma.category.upsert({
    where: { slug: "men" },
    create: { name: "رجالي", slug: "men", sortOrder: 0 },
    update: {},
  });

  const catWomen = await prisma.category.upsert({
    where: { slug: "women" },
    create: { name: "نسائي", slug: "women", sortOrder: 1 },
    update: {},
  });

  const products = [
    { name: "تيشيرت قطني", slug: "cotton-tshirt", categoryId: catMen.id, priceBase: 19900, tags: ["تيشيرت", "قطني", "رجالي"] },
    { name: "بلوزة صيفية", slug: "summer-blouse", categoryId: catWomen.id, priceBase: 24900, tags: ["بلوزة", "صيفية", "نسائي"] },
    { name: "جينز كلاسيك", slug: "classic-jeans", categoryId: catMen.id, priceBase: 39900, tags: ["جينز", "كلاسيك", "رجالي"] },
  ];

  for (const p of products) {
    const product = await prisma.product.upsert({
      where: { slug: p.slug },
      create: {
        categoryId: p.categoryId,
        name: p.name,
        slug: p.slug,
        description: `منتج نموذجي - ${p.name}`,
        tags: p.tags,
        sortOrder: 0,
        active: true,
      },
      update: { tags: p.tags },
    });

    for (let i = 0; i < SIZE_NAMES.length; i++) {
      const name = SIZE_NAMES[i];
      const sku = `${product.slug}-${name}`.toUpperCase().replace(/-/g, "_");
      await prisma.variant.upsert({
        where: { sku },
        create: {
          productId: product.id,
          sku,
          name,
          pricePiastres: p.priceBase,
          stockAvailable: 50,
          stockReserved: 0,
        },
        update: {},
      });
    }
  }

  console.log("Seed completed: sample admin user, categories, products (S–XXL variants).");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
