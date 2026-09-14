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
