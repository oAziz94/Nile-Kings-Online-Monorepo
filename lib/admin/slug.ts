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
