import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const GAMAL_NAME = "جمال السيد عبدالعزيز";

function normalize(value: unknown) {
  return JSON.parse(
    JSON.stringify(value, (_key, innerValue) =>
      typeof innerValue === "bigint" ? Number(innerValue) : innerValue
    )
  );
}

async function main() {
  const partner = await prisma.partner.findFirstOrThrow({
    where: { name: GAMAL_NAME },
    select: { id: true, name: true, phone: true },
  });

  const counts = await prisma.$queryRawUnsafe(`
    WITH gamal AS (
      SELECT '${partner.id}'::text AS id
    ),
    base AS (
      SELECT
        p.id,
        p.name,
        p.active,
        p."imageUrl",
        c.name AS category_name,
        count(DISTINCT v.id)::int AS variants,
        count(DISTINCT pi.id)::int AS inventory_rows,
        coalesce(sum(pi."stockAvailable"), 0)::int AS stock_available,
        coalesce(sum(pi."stockReserved"), 0)::int AS stock_reserved,
        count(DISTINCT v.id) FILTER (
          WHERE coalesce(pi."stockAvailable", 0) > 0
             OR coalesce(pi."stockReserved", 0) > 0
        )::int AS variants_with_stock
      FROM "Product" p
      JOIN "Category" c ON c.id = p."categoryId"
      JOIN "Variant" v ON v."productId" = p.id
      LEFT JOIN "PartnerInventory" pi
        ON pi."variantId" = v.id
       AND pi."partnerId" = (SELECT id FROM gamal)
      GROUP BY p.id, c.name
    )
    SELECT
      count(*)::int AS total_products,
      count(*) FILTER (WHERE active)::int AS active_products,
      count(*) FILTER (WHERE active AND inventory_rows > 0)::int AS active_products_with_gamal_inventory,
      count(*) FILTER (WHERE active AND stock_available + stock_reserved > 0)::int AS active_products_with_gamal_stock,
      count(*) FILTER (WHERE active AND stock_available > 0)::int AS active_products_with_gamal_available_stock,
      count(*) FILTER (
        WHERE active
          AND inventory_rows > 0
          AND "imageUrl" IS NOT NULL
          AND "imageUrl" <> ''
      )::int AS active_inventory_products_with_image
    FROM base
  `);

  const categories = await prisma.$queryRawUnsafe(`
    WITH gamal AS (
      SELECT '${partner.id}'::text AS id
    ),
    base AS (
      SELECT
        p.id,
        p.active,
        c.name AS category_name,
        count(DISTINCT pi.id)::int AS inventory_rows,
        coalesce(sum(pi."stockAvailable"), 0)::int AS stock_available,
        coalesce(sum(pi."stockReserved"), 0)::int AS stock_reserved
      FROM "Product" p
      JOIN "Category" c ON c.id = p."categoryId"
      JOIN "Variant" v ON v."productId" = p.id
      LEFT JOIN "PartnerInventory" pi
        ON pi."variantId" = v.id
       AND pi."partnerId" = (SELECT id FROM gamal)
      GROUP BY p.id, c.name
    )
    SELECT
      category_name,
      count(*) FILTER (WHERE active AND inventory_rows > 0)::int AS active_products_with_inventory,
      count(*) FILTER (WHERE active AND stock_available + stock_reserved > 0)::int AS active_products_with_stock
    FROM base
    GROUP BY category_name
    ORDER BY active_products_with_inventory DESC
  `);

  const duplicateNames = await prisma.$queryRawUnsafe(`
    WITH gamal AS (
      SELECT '${partner.id}'::text AS id
    ),
    base AS (
      SELECT
        p.id,
        p.name,
        p.active,
        count(DISTINCT pi.id)::int AS inventory_rows,
        coalesce(sum(pi."stockAvailable"), 0)::int AS stock_available,
        coalesce(sum(pi."stockReserved"), 0)::int AS stock_reserved
      FROM "Product" p
      JOIN "Variant" v ON v."productId" = p.id
      LEFT JOIN "PartnerInventory" pi
        ON pi."variantId" = v.id
       AND pi."partnerId" = (SELECT id FROM gamal)
      GROUP BY p.id
    )
    SELECT
      name,
      count(*)::int AS product_records,
      count(*) FILTER (WHERE stock_available + stock_reserved > 0)::int AS records_with_stock
    FROM base
    WHERE active AND inventory_rows > 0
    GROUP BY name
    HAVING count(*) > 1
    ORDER BY product_records DESC, name ASC
    LIMIT 30
  `);

  const distinctProductNames = await prisma.$queryRawUnsafe(`
    WITH gamal AS (
      SELECT '${partner.id}'::text AS id
    )
    SELECT
      count(DISTINCT p.name)::int AS distinct_active_product_names_with_inventory,
      count(DISTINCT p.name) FILTER (
        WHERE pi."stockAvailable" > 0 OR pi."stockReserved" > 0
      )::int AS distinct_active_product_names_with_stock
    FROM "Product" p
    JOIN "Variant" v ON v."productId" = p.id
    JOIN "PartnerInventory" pi
      ON pi."variantId" = v.id
     AND pi."partnerId" = (SELECT id FROM gamal)
    WHERE p.active = true
  `);

  console.log(
    JSON.stringify(
      normalize({
        partner,
        counts,
        distinctProductNames,
        categories,
        duplicateNames,
      }),
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
