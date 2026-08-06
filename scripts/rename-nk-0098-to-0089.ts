import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const OLD_PRODUCT_SLUG = "nk-0098";
const NEW_PRODUCT_SLUG = "nk-0089";
const OLD_SKU_PREFIX = "NK_0098";
const NEW_SKU_PREFIX = "NK_0089";

function replacePrefix(value: string | null, oldPrefix: string, newPrefix: string): string | null {
  if (!value?.startsWith(oldPrefix)) return value;
  return `${newPrefix}${value.slice(oldPrefix.length)}`;
}

function hasApplyFlag(): boolean {
  return process.argv.includes("--apply");
}

function hasVerifyFlag(): boolean {
  return process.argv.includes("--verify");
}

function hasScanFlag(): boolean {
  return process.argv.includes("--scan");
}

function hasAllFlag(): boolean {
  return process.argv.includes("--all");
}

async function main() {
  const apply = hasApplyFlag();
  const verify = hasVerifyFlag();
  const scan = hasScanFlag();
  const all = hasAllFlag();

  if (scan) {
    const products = await prisma.product.findMany({
      where: { slug: { startsWith: OLD_PRODUCT_SLUG } },
      select: { id: true, name: true, slug: true },
      orderBy: { slug: "asc" },
    });
    const variants = await prisma.variant.findMany({
      where: {
        OR: [
          { sku: { startsWith: OLD_SKU_PREFIX } },
          { slug: { startsWith: OLD_PRODUCT_SLUG } },
        ],
      },
      select: {
        id: true,
        sku: true,
        slug: true,
        product: { select: { slug: true, name: true } },
      },
      orderBy: { sku: "asc" },
    });
    const orderItems = await prisma.orderItem.findMany({
      where: {
        OR: [
          { sku: { startsWith: OLD_SKU_PREFIX } },
          { variantName: { startsWith: OLD_PRODUCT_SLUG } },
        ],
      },
      select: { id: true, sku: true, variantName: true },
      orderBy: { sku: "asc" },
    });

    console.log("Products:");
    for (const product of products) console.log(`  ${product.slug} (${product.name}, ${product.id})`);
    console.log("\nVariants:");
    for (const variant of variants) {
      console.log(`  ${variant.sku}; slug=${variant.slug}; product=${variant.product.slug} (${variant.product.name})`);
    }
    console.log("\nOrder items:");
    for (const item of orderItems) console.log(`  ${item.sku}; variantName=${item.variantName}; id=${item.id}`);
    return;
  }

  if (all) {
    const products = await prisma.product.findMany({
      where: { slug: { startsWith: OLD_PRODUCT_SLUG } },
      include: {
        variants: {
          orderBy: { sku: "asc" },
          select: { id: true, sku: true, slug: true },
        },
      },
      orderBy: { slug: "asc" },
    });

    const productUpdates = products.map((product) => ({
      id: product.id,
      oldSlug: product.slug,
      newSlug: replacePrefix(product.slug, OLD_PRODUCT_SLUG, NEW_PRODUCT_SLUG) ?? product.slug,
    }));
    const variantUpdates = products.flatMap((product) =>
      product.variants.map((variant) => ({
        id: variant.id,
        oldSku: variant.sku,
        newSku: replacePrefix(variant.sku, OLD_SKU_PREFIX, NEW_SKU_PREFIX) ?? variant.sku,
        oldSlug: variant.slug,
        newSlug: replacePrefix(variant.slug, OLD_PRODUCT_SLUG, NEW_PRODUCT_SLUG),
      }))
    );
    const changedProducts = productUpdates.filter((p) => p.oldSlug !== p.newSlug);
    const changedSkus = variantUpdates.filter((v) => v.newSku !== v.oldSku);
    const changedSlugs = variantUpdates.filter((v) => v.newSlug !== v.oldSlug);

    const productConflicts = changedProducts.length
      ? await prisma.product.findMany({
          where: {
            slug: { in: changedProducts.map((p) => p.newSlug) },
            id: { notIn: changedProducts.map((p) => p.id) },
          },
          select: { id: true, slug: true },
        })
      : [];
    const skuConflicts = changedSkus.length
      ? await prisma.variant.findMany({
          where: {
            sku: { in: changedSkus.map((v) => v.newSku) },
            id: { notIn: changedSkus.map((v) => v.id) },
          },
          select: { id: true, sku: true },
        })
      : [];
    const targetSlugs = changedSlugs
      .map((v) => v.newSlug)
      .filter((slug): slug is string => Boolean(slug));
    const slugConflicts = targetSlugs.length
      ? await prisma.variant.findMany({
          where: {
            slug: { in: targetSlugs },
            id: { notIn: changedSlugs.map((v) => v.id) },
          },
          select: { id: true, slug: true },
        })
      : [];

    if (productConflicts.length || skuConflicts.length || slugConflicts.length) {
      console.error("Conflicts found:");
      for (const conflict of productConflicts) console.error(`  product slug: ${conflict.slug} (${conflict.id})`);
      for (const conflict of skuConflicts) console.error(`  SKU: ${conflict.sku} (${conflict.id})`);
      for (const conflict of slugConflicts) console.error(`  variant slug: ${conflict.slug} (${conflict.id})`);
      process.exit(1);
    }

    const orderItemsToUpdate = await prisma.orderItem.findMany({
      where: {
        variantId: { in: variantUpdates.map((variant) => variant.id) },
        OR: [
          { sku: { startsWith: OLD_SKU_PREFIX } },
          { variantName: { startsWith: OLD_PRODUCT_SLUG } },
        ],
      },
      select: { id: true, sku: true, variantName: true },
    });

    console.log(apply ? "APPLYING full prefix rename" : "DRY RUN full prefix rename");
    console.log(`Products to update: ${changedProducts.length}`);
    console.log(`Variants found: ${variantUpdates.length}`);
    console.log(`Variant slugs to update: ${changedSlugs.length}`);
    console.log(`Variant SKUs to update: ${changedSkus.length}`);
    console.log(`Order item snapshots to update: ${orderItemsToUpdate.length}`);

    for (const product of changedProducts) console.log(`Product ${product.oldSlug} -> ${product.newSlug}`);

    if (!apply) {
      console.log("\nNo changes written. Re-run with --all --apply to update the database.");
      return;
    }

    await prisma.$transaction(async (tx) => {
      for (const product of productUpdates) {
        await tx.product.update({
          where: { id: product.id },
          data: { slug: product.newSlug },
        });
      }

      for (const variant of variantUpdates) {
        await tx.variant.update({
          where: { id: variant.id },
          data: {
            sku: variant.newSku,
            slug: variant.newSlug,
          },
        });
      }

      for (const item of orderItemsToUpdate) {
        await tx.orderItem.update({
          where: { id: item.id },
          data: {
            sku: replacePrefix(item.sku, OLD_SKU_PREFIX, NEW_SKU_PREFIX) ?? item.sku,
            variantName: replacePrefix(item.variantName, OLD_PRODUCT_SLUG, NEW_PRODUCT_SLUG) ?? item.variantName,
          },
        });
      }
    });

    console.log("Done.");
    return;
  }

  if (verify) {
    const oldProduct = await prisma.product.count({ where: { slug: OLD_PRODUCT_SLUG } });
    const newProduct = await prisma.product.findUnique({
      where: { slug: NEW_PRODUCT_SLUG },
      include: { variants: { select: { id: true } } },
    });
    const oldVariants = await prisma.variant.count({
      where: {
        OR: [
          { sku: { startsWith: OLD_SKU_PREFIX } },
          { slug: { startsWith: OLD_PRODUCT_SLUG } },
        ],
      },
    });
    const oldOrderItems = await prisma.orderItem.count({
      where: {
        OR: [
          { sku: { startsWith: OLD_SKU_PREFIX } },
          { variantName: { startsWith: OLD_PRODUCT_SLUG } },
        ],
      },
    });

    console.log(
      JSON.stringify(
        {
          oldProduct,
          newProductSlug: newProduct?.slug ?? null,
          newVariantCount: newProduct?.variants.length ?? 0,
          oldVariants,
          oldOrderItems,
        },
        null,
        2
      )
    );
    return;
  }

  const product = await prisma.product.findUnique({
    where: { slug: OLD_PRODUCT_SLUG },
    include: {
      variants: {
        orderBy: { sku: "asc" },
        select: {
          id: true,
          sku: true,
          slug: true,
          name: true,
          colorName: true,
        },
      },
    },
  });

  if (!product) {
    throw new Error(`Product not found: ${OLD_PRODUCT_SLUG}`);
  }

  const targetProduct = await prisma.product.findUnique({
    where: { slug: NEW_PRODUCT_SLUG },
    select: { id: true },
  });
  if (targetProduct && targetProduct.id !== product.id) {
    throw new Error(`Target product slug already exists: ${NEW_PRODUCT_SLUG}`);
  }

  const variantUpdates = product.variants.map((variant) => ({
    id: variant.id,
    oldSku: variant.sku,
    newSku: replacePrefix(variant.sku, OLD_SKU_PREFIX, NEW_SKU_PREFIX) ?? variant.sku,
    oldSlug: variant.slug,
    newSlug: replacePrefix(variant.slug, OLD_PRODUCT_SLUG, NEW_PRODUCT_SLUG),
  }));

  const changedSkus = variantUpdates.filter((v) => v.newSku !== v.oldSku);
  const changedSlugs = variantUpdates.filter((v) => v.newSlug !== v.oldSlug);

  const skuConflicts = changedSkus.length
    ? await prisma.variant.findMany({
        where: {
          sku: { in: changedSkus.map((v) => v.newSku) },
          id: { notIn: changedSkus.map((v) => v.id) },
        },
        select: { id: true, sku: true },
      })
    : [];

  const targetSlugs = changedSlugs
    .map((v) => v.newSlug)
    .filter((slug): slug is string => Boolean(slug));
  const slugConflicts = targetSlugs.length
    ? await prisma.variant.findMany({
        where: {
          slug: { in: targetSlugs },
          id: { notIn: changedSlugs.map((v) => v.id) },
        },
        select: { id: true, slug: true },
      })
    : [];

  if (skuConflicts.length || slugConflicts.length) {
    console.error("Conflicts found:");
    for (const conflict of skuConflicts) console.error(`  SKU: ${conflict.sku} (${conflict.id})`);
    for (const conflict of slugConflicts) console.error(`  slug: ${conflict.slug} (${conflict.id})`);
    process.exit(1);
  }

  const orderItemsToUpdate = await prisma.orderItem.findMany({
    where: {
      variantId: { in: product.variants.map((variant) => variant.id) },
      OR: [
        { sku: { startsWith: OLD_SKU_PREFIX } },
        { variantName: { startsWith: OLD_PRODUCT_SLUG } },
      ],
    },
    select: { id: true, sku: true, variantName: true },
  });

  console.log(apply ? "APPLYING rename" : "DRY RUN");
  console.log(`Product: ${OLD_PRODUCT_SLUG} -> ${NEW_PRODUCT_SLUG}`);
  console.log(`Variants found: ${product.variants.length}`);
  console.log(`Variant slugs to update: ${changedSlugs.length}`);
  console.log(`Variant SKUs to update: ${changedSkus.length}`);
  console.log(`Order item snapshots to update: ${orderItemsToUpdate.length}`);

  for (const variant of variantUpdates) {
    if (variant.oldSku !== variant.newSku || variant.oldSlug !== variant.newSlug) {
      console.log(
        `Variant ${variant.id}: sku ${variant.oldSku} -> ${variant.newSku}; slug ${variant.oldSlug ?? "null"} -> ${variant.newSlug ?? "null"}`
      );
    }
  }

  if (!apply) {
    console.log("\nNo changes written. Re-run with --apply to update the database.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: product.id },
      data: { slug: NEW_PRODUCT_SLUG },
    });

    for (const variant of variantUpdates) {
      await tx.variant.update({
        where: { id: variant.id },
        data: {
          sku: variant.newSku,
          slug: variant.newSlug,
        },
      });
    }

    for (const item of orderItemsToUpdate) {
      await tx.orderItem.update({
        where: { id: item.id },
        data: {
          sku: replacePrefix(item.sku, OLD_SKU_PREFIX, NEW_SKU_PREFIX) ?? item.sku,
          variantName: replacePrefix(item.variantName, OLD_PRODUCT_SLUG, NEW_PRODUCT_SLUG) ?? item.variantName,
        },
      });
    }
  });

  console.log("Done.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
