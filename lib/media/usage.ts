/**
 * Where a `MediaAsset` is used (backlog 9.8a (c)) — the الصور library's usage line ("المنتج ·
 * اللون · رئيسية/معرض N" / "غير مسندة" / "مسجّلة والملف غير موجود" / "إثبات تسليم #…") and the
 * rule that governs delete/replace: an asset in use cannot be deleted.
 *
 * Matches by id first (the columns this task adds — `Product.heroAssetId`,
 * `Variant.imageAssetId`, `VariantImage.assetId`), then by URL for rows that predate the id
 * (legacy uploads before this task, or rows the sync reconcile has not adopted yet).
 * `RoutedOrder` has no id column (a proof is a one-off delivery photo, not catalog media) — it
 * matches by `proofImagePublicId` against the asset's Cloudinary `publicId`.
 *
 * One query per table, never per asset — callers pass the whole batch of assets they need
 * usage for (typically one grid page) and get a `Map` back.
 */
import { prisma } from "@/lib/db";

export type AssetUsageEntry =
  | { kind: "product_hero"; productId: string; productName: string }
  | {
      kind: "variant_representative";
      productId: string;
      productName: string;
      colorName: string | null;
      variantId: string;
    }
  | {
      kind: "gallery";
      productId: string;
      productName: string;
      colorKey: string;
      colorName: string | null;
      sortOrder: number;
      variantImageId: string;
    }
  | { kind: "proof"; routedOrderId: string; orderId: string; orderShortId: string };

export type AssetForUsage = { id: string; url: string; publicId: string };

/** Turns a usage list into the library's one-line summary, in the spec's exact vocabulary. */
export function summarizeUsage(entries: AssetUsageEntry[]): string {
  if (entries.length === 0) return "غير مسندة";
  const parts = entries.map((e) => {
    if (e.kind === "product_hero") return `${e.productName} · رئيسية`;
    if (e.kind === "variant_representative") return `${e.productName} · ${e.colorName ?? "بلا لون"} · ممثلة`;
    if (e.kind === "gallery") return `${e.productName} · ${e.colorName ?? "بلا لون"} · معرض ${e.sortOrder + 1}`;
    return `إثبات تسليم #${e.orderShortId}`;
  });
  return parts.join(" · ");
}

export async function getAssetUsage(
  assets: AssetForUsage[]
): Promise<Map<string, AssetUsageEntry[]>> {
  const result = new Map<string, AssetUsageEntry[]>();
  if (assets.length === 0) return result;

  const ids = assets.map((a) => a.id);
  const urls = assets.map((a) => a.url);
  const publicIds = assets.map((a) => a.publicId);
  const urlToId = new Map(assets.map((a) => [a.url, a.id]));
  const publicIdToId = new Map(assets.map((a) => [a.publicId, a.id]));

  const push = (assetId: string | undefined, entry: AssetUsageEntry) => {
    if (!assetId) return;
    const list = result.get(assetId) ?? [];
    list.push(entry);
    result.set(assetId, list);
  };

  const [products, variants, variantImages, proofs] = await Promise.all([
    prisma.product.findMany({
      where: { OR: [{ heroAssetId: { in: ids } }, { imageUrl: { in: urls } }] },
      select: { id: true, name: true, heroAssetId: true, imageUrl: true },
    }),
    prisma.variant.findMany({
      where: { OR: [{ imageAssetId: { in: ids } }, { imageUrl: { in: urls } }] },
      select: {
        id: true,
        productId: true,
        colorName: true,
        imageAssetId: true,
        imageUrl: true,
        product: { select: { name: true } },
      },
    }),
    prisma.variantImage.findMany({
      where: { OR: [{ assetId: { in: ids } }, { url: { in: urls } }] },
      select: {
        id: true,
        productId: true,
        colorKey: true,
        assetId: true,
        url: true,
        sortOrder: true,
        product: { select: { name: true } },
      },
    }),
    prisma.routedOrder.findMany({
      where: { proofImagePublicId: { in: publicIds } },
      select: { id: true, orderId: true, proofImagePublicId: true },
    }),
  ]);

  for (const p of products) {
    const assetId = p.heroAssetId ?? (p.imageUrl ? urlToId.get(p.imageUrl) : undefined);
    push(assetId, { kind: "product_hero", productId: p.id, productName: p.name });
  }

  for (const v of variants) {
    const assetId = v.imageAssetId ?? (v.imageUrl ? urlToId.get(v.imageUrl) : undefined);
    push(assetId, {
      kind: "variant_representative",
      productId: v.productId,
      productName: v.product.name,
      colorName: v.colorName,
      variantId: v.id,
    });
  }

  for (const vi of variantImages) {
    const assetId = vi.assetId ?? urlToId.get(vi.url);
    const colorName = vi.colorKey.split("|")[0] || null;
    push(assetId, {
      kind: "gallery",
      productId: vi.productId,
      productName: vi.product.name,
      colorKey: vi.colorKey,
      colorName: colorName || null,
      sortOrder: vi.sortOrder,
      variantImageId: vi.id,
    });
  }

  for (const ro of proofs) {
    const assetId = ro.proofImagePublicId ? publicIdToId.get(ro.proofImagePublicId) : undefined;
    push(assetId, {
      kind: "proof",
      routedOrderId: ro.id,
      orderId: ro.orderId,
      orderShortId: ro.orderId.slice(-8).toUpperCase(),
    });
  }

  return result;
}
