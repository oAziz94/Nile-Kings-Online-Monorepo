import { prisma } from "@/lib/db";

type Tx = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/** Same `${colorName ?? ""}|${colorHex ?? ""}` convention as `hooks/use-variant-selection.ts`'s
 * `colorKey()` and `VariantImage.colorKey` (also duplicated in `app/api/admin/media/assign/
 * route.ts` — kept identical there since that route predates this helper, backlog 9.8a). */
export function colorKeyOf(v: { colorName: string | null; colorHex: string | null }): string {
  return `${v.colorName ?? ""}|${v.colorHex ?? ""}`;
}

/** Splits a `colorKey` back into `{ colorName, colorHex }` (empty segments become null) — used
 * to `WHERE` a product's variants by colour when the colour identity is only known as its key. */
export function splitColorKey(colorKey: string): { colorName: string | null; colorHex: string | null } {
  const sep = colorKey.indexOf("|");
  const name = sep >= 0 ? colorKey.slice(0, sep) : colorKey;
  const hex = sep >= 0 ? colorKey.slice(sep + 1) : "";
  return { colorName: name || null, colorHex: hex || null };
}

/**
 * Backlog 9.8b — keeps a colour's "representative" image (`Variant.imageUrl`/`imageAssetId`,
 * what the storefront card/cart/quick-shop read per `lib/catalog.ts`'s `buildProductListItem`)
 * in sync with the first (`sortOrder` 0) photo in that colour's `VariantImage` gallery. Called
 * after every gallery add/reorder/remove so the admin never has to set it separately. Every
 * variant sharing the colour (i.e. every size) gets the same representative image, same as
 * today's single-`imageUrl`-per-colour behaviour.
 */
export async function syncColorRepresentative(tx: Tx, productId: string, colorKey: string): Promise<void> {
  const { colorName, colorHex } = splitColorKey(colorKey);
  const images = await tx.variantImage.findMany({
    where: { productId, colorKey },
    orderBy: { sortOrder: "asc" },
    select: { url: true, assetId: true },
  });
  const rep = images[0] ?? null;
  await tx.variant.updateMany({
    where: { productId, colorName, colorHex },
    data: { imageUrl: rep?.url ?? null, imageAssetId: rep?.assetId ?? null },
  });
}
