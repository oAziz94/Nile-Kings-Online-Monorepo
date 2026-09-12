/**
 * Factory intake / inventory import-export — backlog 4.23 ("source of truth" between the
 * partner and the factory). Pure, unit-testable helpers used by both the export route
 * (`app/api/partner/inventory/export/route.ts`), the import-preview route
 * (`app/api/partner/inventory/import/route.ts`) and the client-side drop-zone's instant
 * feedback pass on `/partner/receipts/new` — kept side-effect-free (no Prisma, no fetch) so
 * they can be exercised directly in `lib/inventory/receipts.test.ts` without a DB.
 *
 * Design (04-decisions.md 2026-09-12, "Factory intake + import/export"): the SKU is the
 * key; the exported file's two blank input columns ("كمية مستلمة" for a factory receipt,
 * "جرد فعلي" for a physical count) round-trip as the same file for the intake/count
 * template. Column headers are matched exactly after trim (backlog 4.23's own wording).
 */
import * as XLSX from "xlsx";

/** Export column headers, in exact order. Do not change (the import parser matches on these). */
export const INVENTORY_EXPORT_HEADERS = [
  "SKU",
  "المنتج",
  "المقاس",
  "اللون",
  "المتاح",
  "المحجوز",
  "قابل للبيع",
  "حد التنبيه",
  "كمية مستلمة",
  "جرد فعلي",
] as const;

export const RECEIPT_VALUE_HEADER = "كمية مستلمة" as const;
export const COUNT_VALUE_HEADER = "جرد فعلي" as const;

export type ReceiptMode = "receipt" | "count";

export type InventoryExportVariant = {
  sku: string;
  productName: string;
  sizeLabel: string;
  colorName: string | null;
  stockAvailable: number;
  stockReserved: number;
};

/** Build the export sheet's rows (header + one row per variant), array-of-arrays form. */
export function buildInventoryExportRows(
  variants: InventoryExportVariant[],
  lowStockThreshold: number
): (string | number)[][] {
  return [
    [...INVENTORY_EXPORT_HEADERS],
    ...variants.map((v) => {
      const sellable = Math.max(0, v.stockAvailable - v.stockReserved);
      return [
        v.sku,
        v.productName,
        v.sizeLabel,
        v.colorName ?? "",
        v.stockAvailable,
        v.stockReserved,
        sellable,
        lowStockThreshold,
        "",
        "",
      ];
    }),
  ];
}

/** Build the export workbook as a Buffer (xlsx, one sheet "Inventory"). */
export function buildInventoryExportXlsx(
  variants: InventoryExportVariant[],
  lowStockThreshold: number
): Buffer {
  const data = buildInventoryExportRows(variants, lowStockThreshold);
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Inventory");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(buf);
}

/** Filename for the inventory export: inventory_YYYY_MM_DD.xlsx */
export function inventoryExportFilename(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `inventory_${y}_${m}_${d}.xlsx`;
}

// ---------------------------------------------------------------------------
// Import parsing (xlsx buffer -> raw {sku, rawValue} rows) — used by both the server
// route (multipart upload) and, indirectly, the client drop-zone (same `xlsx` package,
// browser build) for instant feedback before the server-side preview call.
// ---------------------------------------------------------------------------

export type RawImportRow = {
  sku: string;
  /** `null` when the input cell was blank (skipped per backlog 4.23: "blank input cells skipped"). */
  rawValue: string | number | null;
};

/**
 * Parse an uploaded workbook's first sheet into raw SKU/value rows for the given mode.
 * The SKU column is "SKU"; the value column is `RECEIPT_VALUE_HEADER`/`COUNT_VALUE_HEADER`
 * depending on `mode` — both matched **exactly after trim**, per the backlog's own wording.
 * Rows with no SKU are skipped outright (not even reported as an error row — there's nothing
 * to key them by). Returns `[]` if the required columns aren't found (caller decides how to
 * report that — the API route surfaces a single "unrecognised file" error rather than a
 * per-row one).
 */
function extractRowsFromWorkbook(workbook: XLSX.WorkBook, mode: ReceiptMode): RawImportRow[] {
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
  if (grid.length === 0) return [];

  const header = (grid[0] as unknown[]).map((cell) => String(cell ?? "").trim());
  const skuIndex = header.indexOf("SKU");
  const valueHeader = mode === "receipt" ? RECEIPT_VALUE_HEADER : COUNT_VALUE_HEADER;
  const valueIndex = header.indexOf(valueHeader);
  if (skuIndex === -1 || valueIndex === -1) return [];

  const rows: RawImportRow[] = [];
  for (let i = 1; i < grid.length; i++) {
    const line = grid[i] as unknown[];
    const skuCell = line[skuIndex];
    const sku = skuCell === undefined || skuCell === null ? "" : String(skuCell).trim();
    if (!sku) continue;

    const valueCell = line[valueIndex];
    const isBlank =
      valueCell === undefined || valueCell === null || String(valueCell).trim() === "";
    rows.push({ sku, rawValue: isBlank ? null : (valueCell as string | number) });
  }
  return rows;
}

/** Server-side parse (multipart upload buffer). */
export function parseInventoryWorkbookRows(buffer: Buffer, mode: ReceiptMode): RawImportRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  return extractRowsFromWorkbook(workbook, mode);
}

/**
 * Client-side parse (drop-zone instant feedback, backlog 4.23: "parse client-side with xlsx
 * for instant feedback, then the server preview"). Same column matching as the server path —
 * this is only ever used for a quick row-count/spot-check before the authoritative server
 * preview call, never to apply anything itself.
 */
export function parseInventoryWorkbookRowsFromArrayBuffer(
  data: ArrayBuffer,
  mode: ReceiptMode
): RawImportRow[] {
  const workbook = XLSX.read(new Uint8Array(data), { type: "array" });
  return extractRowsFromWorkbook(workbook, mode);
}

// ---------------------------------------------------------------------------
// Preview / validation — the pure core the API route and the unit tests both exercise.
// Nothing here touches the database; the caller resolves SKUs to variants first.
// ---------------------------------------------------------------------------

export type VariantForPreview = {
  variantId: string;
  sku: string;
  productName: string;
  variantLabel: string;
  current: number; // stockAvailable
  stockReserved: number;
};

export type PreviewRow = {
  sku: string;
  variantId: string | null;
  product: string | null;
  variant: string | null;
  current: number | null;
  delta?: number;
  counted?: number;
  newAvailable: number | null;
  error?: string;
};

const RESERVED_FLOOR_MESSAGE = (reserved: number) =>
  `لا يمكن أن يكون المخزون أقل من المحجوز (${reserved})`;

/**
 * Merge duplicate SKUs/rows before validation. Decision (documented per backlog 4.23's
 * "pick one and document it"): duplicates are MERGED, not rejected — receipt-mode values are
 * summed (matching `aggregateStockLines`'s existing convention for restock-request lines
 * elsewhere in this codebase), count-mode values use the LAST occurrence (a physical count is
 * a single fact about the shelf at read time; summing two counts of the same variant would be
 * meaningless, and last-wins matches "the operator corrected themselves further down the
 * sheet" more sensibly than either summing or rejecting the whole file).
 */
function mergeRawRows(rows: RawImportRow[], mode: ReceiptMode): Map<string, number | null> {
  const merged = new Map<string, number | null>();
  for (const row of rows) {
    const numeric =
      row.rawValue === null
        ? null
        : typeof row.rawValue === "number"
          ? row.rawValue
          : Number(String(row.rawValue).trim());
    if (row.rawValue !== null && !Number.isFinite(numeric)) {
      // Keep a sentinel (NaN) so the per-row validation below reports it as a bad number
      // rather than silently disappearing into the merge.
      merged.set(row.sku, NaN);
      continue;
    }
    if (numeric === null) continue; // blank cell — skip entirely, never overwrites a real value
    if (mode === "receipt") {
      const existing = merged.get(row.sku);
      merged.set(row.sku, (Number.isFinite(existing) ? (existing as number) : 0) + numeric);
    } else {
      merged.set(row.sku, numeric); // count mode: last occurrence wins
    }
  }
  return merged;
}

/**
 * Build the per-row preview: unknown SKUs and non-integers become row errors (excluded from
 * apply by the caller); blank cells were already dropped by `mergeRawRows`. Pure function —
 * `variantsBySku` is resolved by the caller (the API route queries Prisma; tests pass a plain
 * Map).
 */
export function buildImportPreview(
  rows: RawImportRow[],
  mode: ReceiptMode,
  variantsBySku: Map<string, VariantForPreview>
): PreviewRow[] {
  const merged = mergeRawRows(rows, mode);
  const preview: PreviewRow[] = [];

  for (const [sku, value] of merged) {
    const variant = variantsBySku.get(sku);
    if (!variant) {
      preview.push({
        sku,
        variantId: null,
        product: null,
        variant: null,
        current: null,
        newAvailable: null,
        error: "SKU غير معروف",
      });
      continue;
    }

    if (value === null || !Number.isFinite(value) || !Number.isInteger(value)) {
      preview.push({
        sku,
        variantId: variant.variantId,
        product: variant.productName,
        variant: variant.variantLabel,
        current: variant.current,
        newAvailable: null,
        error: "القيمة يجب أن تكون رقماً صحيحاً",
      });
      continue;
    }

    if (value < 0) {
      preview.push({
        sku,
        variantId: variant.variantId,
        product: variant.productName,
        variant: variant.variantLabel,
        current: variant.current,
        newAvailable: null,
        error: "القيمة يجب أن تكون رقماً موجباً",
      });
      continue;
    }

    if (mode === "receipt") {
      preview.push({
        sku,
        variantId: variant.variantId,
        product: variant.productName,
        variant: variant.variantLabel,
        current: variant.current,
        delta: value,
        newAvailable: variant.current + value,
      });
    } else {
      if (value < variant.stockReserved) {
        preview.push({
          sku,
          variantId: variant.variantId,
          product: variant.productName,
          variant: variant.variantLabel,
          current: variant.current,
          counted: value,
          newAvailable: null,
          error: RESERVED_FLOOR_MESSAGE(variant.stockReserved),
        });
        continue;
      }
      preview.push({
        sku,
        variantId: variant.variantId,
        product: variant.productName,
        variant: variant.variantLabel,
        current: variant.current,
        counted: value,
        newAvailable: value,
      });
    }
  }

  return preview;
}
