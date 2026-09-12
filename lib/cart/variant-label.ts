/**
 * Display-only friendly variant label for the cart (backlog 4.10, `04-decisions.md` 2026-09-12
 * decision 8): "المقاس {size} · {colorName}" (color part omitted when absent), built from the
 * additive `size`/`colorName` cart-payload fields. Falls back to the existing slug-derived
 * `variantName` string when those fields are missing (e.g. a stale client bundle or a payload
 * shape this helper doesn't recognize yet) so the UI never renders a blank descriptor.
 */
export function friendlyVariantLabel(item: {
  size?: string | null;
  colorName?: string | null;
  variantName: string;
}): string {
  const size = item.size?.trim();
  if (!size) return item.variantName;
  const colorName = item.colorName?.trim();
  return colorName ? `المقاس ${size} · ${colorName}` : `المقاس ${size}`;
}
