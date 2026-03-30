const KIDS_SIZE_LABEL_MAP: Record<string, string> = {
  S: "2",
  M: "4",
  L: "6",
  XL: "8",
  XXL: "10",
  XXXL: "12",
  "3XL": "12",
};

export function normalizeSizeName(sizeName: string): string {
  const key = sizeName.trim().toUpperCase();
  return key === "3XL" ? "XXXL" : key;
}

export function isKidsCategory(categorySlug?: string | null): boolean {
  return (categorySlug ?? "").trim().toLowerCase() === "kids";
}

export function getDisplaySizeLabel(sizeName: string, forKids: boolean): string {
  if (!forKids) return sizeName;
  return KIDS_SIZE_LABEL_MAP[normalizeSizeName(sizeName)] ?? sizeName;
}
