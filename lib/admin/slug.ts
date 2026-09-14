/**
 * Slugify for admin-created slugs (categories, products).
 */
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}-]/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "item";
}

/** Normalize hex for variant slug: "000000" or "noc" if missing/invalid. */
function slugColorHexCode(colorHex: string | null | undefined): string {
  if (!colorHex?.trim()) return "noc";
  const hex = colorHex.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{6}$/.test(hex)) return hex;
  if (/^[0-9a-f]{3}$/.test(hex)) return hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  return "noc";
}

/**
 * Build variant slug: productSlug_size_colorHexCode (e.g. cotton-tshirt_m_000000).
 */
export function variantSlug(productSlug: string, size: string, colorHex: string | null | undefined): string {
  const sizePart = size.trim().toLowerCase().replace(/[^a-z0-9]/g, "") || "one";
  const colorPart = slugColorHexCode(colorHex);
  return `${productSlug}_${sizePart}_${colorPart}`;
}

/**
 * Turns a colour name/hex into an ASCII-safe SKU part (handles Arabic etc. via a stable hash
 * when there's no usable ASCII content). Single source of truth — backlog 9.8b pulled this out
 * of `app/api/admin/products/[id]/variants/route.ts` and `app/api/admin/variants/[id]/route.ts`
 * (both had their own byte-identical copy) so the colour-creation route (`/colors`) generates
 * SKUs the exact same way as adding a size one at a time.
 */
export function toSkuSafeColor(color: string): string {
  const cleaned = color.replace(/\s+/g, "_").toUpperCase().replace(/[^A-Z0-9_]/g, "");
  if (cleaned.length >= 2) return cleaned;
  let h = 0;
  for (let i = 0; i < color.length; i++) h = ((h << 5) - h + color.charCodeAt(i)) | 0;
  return "C" + Math.abs(h).toString(36).toUpperCase().slice(0, 8);
}

/**
 * Build a variant SKU: `${productSlug}-${size}-${colorPart}`, uppercased, non-alphanumeric
 * collapsed to `_`. Same convention `app/api/admin/products/[id]/variants/route.ts` used
 * inline before 9.8b's extraction.
 */
export function buildVariantSku(
  productSlug: string,
  size: string,
  colorName: string | null | undefined,
  colorHex: string | null | undefined
): string {
  const colorRaw = colorName?.trim() || colorHex?.trim() || "NOC";
  const colorPart = toSkuSafeColor(colorRaw);
  const skuBase = `${productSlug}-${size}-${colorPart}`;
  return skuBase.toUpperCase().replace(/[^A-Z0-9_]/g, "_") || `${productSlug}-V`;
}

/** The standard size run offered when creating a colour ("لون جديد") or bulk-generating sizes —
 * same list `app/api/admin/products/[id]/variants/route.ts`'s `generateSizes` used inline. */
export const STANDARD_SIZE_RUN = ["S", "M", "L", "XL", "XXL"] as const;
