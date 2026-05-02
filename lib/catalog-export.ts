/**
 * Catalog products export: matches the Meta/Facebook product catalog format
 * (e.g. catalog_products_*.xlsx) with columns: id, quantity, title, description, availability,
 * condition, price, link, image_link, brand. One row per variant (product + color/size).
 * quantity is stockAvailable for that variant.
 */

import * as XLSX from "xlsx";

/** Column headers in exact order (from catalog template). */
export const CATALOG_EXPORT_HEADERS = [
  "id",
  "quantity",
  "title",
  "description",
  "availability",
  "condition",
  "price",
  "link",
  "image_link",
  "brand",
] as const;

export type CatalogExportVariant = {
  sku: string;
  name: string; // size e.g. S, M, L
  colorName: string | null;
  colorHex: string | null;
  pricePiastres: number;
  stockAvailable: number;
  imageUrl: string | null;
};

export type CatalogExportProduct = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  variants: CatalogExportVariant[];
};

function appBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

function absoluteImageUrl(imageUrl: string | null, baseUrl: string): string {
  if (!imageUrl?.trim()) return "";
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) return imageUrl;
  return `${appBaseUrl(baseUrl)}/${imageUrl.replace(/^\//, "")}`;
}

/**
 * Build one catalog row per variant. Product and variant are matched by the same product;
 * each variant (color/size) gets its own row with id = variant SKU.
 */
function productVariantToRow(
  product: CatalogExportProduct,
  variant: CatalogExportVariant,
  baseUrl: string,
  brand: string
): (string | number)[] {
  const titleParts = [product.name, variant.name];
  if (variant.colorName?.trim()) titleParts.push(variant.colorName.trim());
  const title = titleParts.join(" - ");

  const description = (product.description ?? product.name).replace(/\s+/g, " ").trim().slice(0, 9999);
  const availability = variant.stockAvailable > 0 ? "in stock" : "out of stock";
  const condition = "new";
  const priceEgp = (variant.pricePiastres / 100).toFixed(2);
  const price = `${priceEgp} EGP`;
  const link = `${appBaseUrl(baseUrl)}/products/${product.slug}`;
  const imageLink = absoluteImageUrl(variant.imageUrl ?? product.imageUrl, baseUrl);

  return [
    variant.sku,
    variant.stockAvailable,
    title,
    description,
    availability,
    condition,
    price,
    link,
    imageLink,
    brand,
  ];
}

/**
 * Build XLSX with catalog column order. One row per variant; products are matched to their
 * color/size variants so each SKU appears exactly once.
 */
export function buildCatalogXlsx(
  products: CatalogExportProduct[],
  baseUrl: string,
  brand: string = "Nile Kings"
): Buffer {
  const headerRow = [...CATALOG_EXPORT_HEADERS];
  const data: (string | number)[][] = [headerRow];

  for (const product of products) {
    for (const variant of product.variants) {
      data.push(productVariantToRow(product, variant, baseUrl, brand));
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Products");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(buf);
}

/** Filename for catalog export: catalog_products_YYYY_MM_DD.xlsx */
export function catalogExportFilename(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `catalog_products_${y}-${m}-${d}_${h}_${min}_${s}.xlsx`;
}
