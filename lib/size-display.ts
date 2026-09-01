const KIDS_SIZE_LABEL_MAP: Record<string, string> = {
  S: "2",
  M: "4",
  L: "6",
  XL: "8",
  XXL: "10",
  XXXL: "12",
  "3XL": "12",
  "4XL": "14",
};

const SIZE_ORDER = ["S", "M", "L", "XL", "XXL", "XXXL", "4XL"];

type VariantSizeSource = {
  name: string;
  inStock: boolean;
};

export function normalizeSizeName(sizeName: string): string {
  const key = sizeName.trim().toUpperCase();
  if (key === "3XL") return "XXXL";
  if (key === "4X") return "4XL";
  return key;
}

export function isKidsCategory(categorySlug?: string | null): boolean {
  return (categorySlug ?? "").trim().toLowerCase() === "kids";
}

export function getDisplaySizeLabel(sizeName: string, forKids: boolean): string {
  if (!forKids) return sizeName;
  return KIDS_SIZE_LABEL_MAP[normalizeSizeName(sizeName)] ?? sizeName;
}

function sizeSortIndex(sizeName: string): number {
  const index = SIZE_ORDER.indexOf(normalizeSizeName(sizeName));
  return index === -1 ? SIZE_ORDER.length : index;
}

export function getVariantSizeOptions(
  variants: VariantSizeSource[],
  forKids: boolean
): { id: string; label: string; disabled: boolean }[] {
  const bySize = new Map<string, { name: string; inStock: boolean }>();

  for (const variant of variants) {
    const name = variant.name.trim();
    if (!name) continue;

    const id = normalizeSizeName(name);
    const existing = bySize.get(id);
    bySize.set(id, {
      name: existing?.name ?? name,
      inStock: Boolean(existing?.inStock || variant.inStock),
    });
  }

  return Array.from(bySize.entries())
    .sort(([, a], [, b]) => {
      const orderDelta = sizeSortIndex(a.name) - sizeSortIndex(b.name);
      if (orderDelta !== 0) return orderDelta;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    })
    .map(([id, option]) => ({
      id,
      label: getDisplaySizeLabel(option.name, forKids),
      disabled: !option.inStock,
    }));
}
