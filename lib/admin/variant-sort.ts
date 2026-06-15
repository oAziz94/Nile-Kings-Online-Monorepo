const SIZE_ORDER = ["S", "M", "L", "XL", "XXL", "XXXL", "4XL"];

type VariantSortInput = {
  name: string;
  colorHex: string | null;
  colorName: string | null;
};

function normalizeSizeName(sizeName: string): string {
  const key = sizeName.trim().toUpperCase();
  if (key === "3XL") return "XXXL";
  if (key === "4X") return "4XL";
  return key;
}

function sizeSortIndex(sizeName: string): number {
  const index = SIZE_ORDER.indexOf(normalizeSizeName(sizeName));
  return index === -1 ? SIZE_ORDER.length : index;
}

/** Admin swatch fallback: infer from colorName so named colors group with matching hex colors. */
function variantSwatchHex(v: Pick<VariantSortInput, "colorHex" | "colorName">): string {
  if (v.colorHex?.trim()) return v.colorHex.trim();
  const name = (v.colorName ?? "").trim().toLowerCase();
  const map: Record<string, string> = {
    أسود: "#000000", أبيض: "#ffffff", أحمر: "#b71c1c", أزرق: "#0d47a1",
    أخضر: "#1b5e20", أصفر: "#f9a825", برتقالي: "#e65100", رمادي: "#616161",
    وردي: "#ad1457", بني: "#3e2723", بيج: "#d7ccc8", كحلي: "#0d47a1",
    black: "#000000", white: "#ffffff", red: "#b71c1c", blue: "#0d47a1",
    green: "#1b5e20", yellow: "#f9a825", grey: "#616161", gray: "#616161",
    pink: "#ad1457", brown: "#3e2723", beige: "#d7ccc8", navy: "#0d47a1",
    orange: "#e65100",
  };
  return map[name] ?? "#9e9e9e";
}

function variantColorHexSortKey(v: Pick<VariantSortInput, "colorHex" | "colorName">): string {
  const colorHex = v.colorHex?.trim().toLocaleLowerCase();
  return colorHex || variantSwatchHex(v).toLocaleLowerCase();
}

export function sortVariants<T extends VariantSortInput>(variants: T[]): T[] {
  return [...variants].sort((a, b) => {
    const colorHexDelta = variantColorHexSortKey(a).localeCompare(variantColorHexSortKey(b), undefined, {
      numeric: true,
      sensitivity: "base",
    });
    if (colorHexDelta !== 0) return colorHexDelta;

    const sizeDelta = sizeSortIndex(a.name) - sizeSortIndex(b.name);
    if (sizeDelta !== 0) return sizeDelta;

    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  });
}
