import { describe, it, expect } from "vitest";
import {
  buildImportPreview,
  buildInventoryExportRows,
  computeUnitCostPiastres,
  inventoryExportFilename,
  parseInventoryWorkbookRows,
  type RawImportRow,
  type VariantForPreview,
} from "./receipts";
import * as XLSX from "xlsx";

function bufferFromAoa(aoa: (string | number)[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Inventory");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

describe("buildInventoryExportRows", () => {
  it("emits the exact header row plus one row per variant with sellable derived", () => {
    const rows = buildInventoryExportRows(
      [
        {
          sku: "SKU-1",
          productName: "قميص",
          sizeLabel: "M",
          colorName: "أزرق",
          stockAvailable: 10,
          stockReserved: 3,
        },
      ],
      5
    );
    expect(rows[0]).toEqual([
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
    ]);
    expect(rows[1]).toEqual(["SKU-1", "قميص", "M", "أزرق", 10, 3, 7, 5, "", ""]);
  });

  it("handles a null colorName as an empty string", () => {
    const rows = buildInventoryExportRows(
      [{ sku: "SKU-2", productName: "بنطلون", sizeLabel: "L", colorName: null, stockAvailable: 0, stockReserved: 0 }],
      5
    );
    expect(rows[1][3]).toBe("");
  });
});

describe("inventoryExportFilename", () => {
  it("formats as inventory_YYYY_MM_DD.xlsx", () => {
    expect(inventoryExportFilename(new Date(2026, 8, 12))).toBe("inventory_2026_09_12.xlsx");
  });
});

describe("parseInventoryWorkbookRows", () => {
  const header = [...["SKU", "المنتج", "المقاس", "اللون", "المتاح", "المحجوز", "قابل للبيع", "حد التنبيه", "كمية مستلمة", "جرد فعلي"]];

  it("reads the receipt column and skips blank cells", () => {
    const buffer = bufferFromAoa([
      header,
      ["SKU-1", "قميص", "M", "أزرق", 10, 0, 10, 5, 4, ""],
      ["SKU-2", "قميص", "L", "أزرق", 5, 0, 5, 5, "", ""],
    ]);
    const rows = parseInventoryWorkbookRows(buffer, "receipt");
    expect(rows).toEqual([
      { sku: "SKU-1", rawValue: 4 },
      { sku: "SKU-2", rawValue: null },
    ]);
  });

  it("reads the count column independently of the receipt column", () => {
    const buffer = bufferFromAoa([
      header,
      ["SKU-1", "قميص", "M", "أزرق", 10, 0, 10, 5, 4, 12],
    ]);
    const rows = parseInventoryWorkbookRows(buffer, "count");
    expect(rows).toEqual([{ sku: "SKU-1", rawValue: 12 }]);
  });

  it("trims the SKU cell and skips rows with no SKU", () => {
    const buffer = bufferFromAoa([header, ["  SKU-3  ", "", "", "", 0, 0, 0, 5, 3, ""], ["", "", "", "", 0, 0, 0, 5, 1, ""]]);
    const rows = parseInventoryWorkbookRows(buffer, "receipt");
    expect(rows).toEqual([{ sku: "SKU-3", rawValue: 3 }]);
  });

  it("returns an empty array when the expected columns are missing", () => {
    const buffer = bufferFromAoa([["Not", "The", "Right", "Headers"], ["a", "b", "c", "d"]]);
    expect(parseInventoryWorkbookRows(buffer, "receipt")).toEqual([]);
  });
});

describe("buildImportPreview", () => {
  const variantsBySku = new Map<string, VariantForPreview>([
    [
      "SKU-OK",
      { variantId: "v1", sku: "SKU-OK", productName: "قميص", variantLabel: "M · أزرق", current: 10, stockReserved: 2 },
    ],
    [
      "SKU-RESERVED",
      {
        variantId: "v2",
        sku: "SKU-RESERVED",
        productName: "بنطلون",
        variantLabel: "L",
        current: 5,
        stockReserved: 3,
      },
    ],
  ]);

  it("flags an unknown SKU as a row error", () => {
    const rows: RawImportRow[] = [{ sku: "SKU-MISSING", rawValue: 5 }];
    const preview = buildImportPreview(rows, "receipt", variantsBySku);
    expect(preview).toEqual([
      { sku: "SKU-MISSING", variantId: null, product: null, variant: null, current: null, newAvailable: null, error: "SKU غير معروف" },
    ]);
  });

  it("computes newAvailable = current + delta for a valid receipt row", () => {
    const rows: RawImportRow[] = [{ sku: "SKU-OK", rawValue: 8 }];
    const preview = buildImportPreview(rows, "receipt", variantsBySku);
    expect(preview).toEqual([
      { sku: "SKU-OK", variantId: "v1", product: "قميص", variant: "M · أزرق", current: 10, delta: 8, newAvailable: 18 },
    ]);
  });

  it("flags a non-integer value as a row error", () => {
    const rows: RawImportRow[] = [{ sku: "SKU-OK", rawValue: "abc" }];
    const preview = buildImportPreview(rows, "receipt", variantsBySku);
    expect(preview[0].error).toBe("القيمة يجب أن تكون رقماً صحيحاً");
  });

  it("flags a negative value as a row error", () => {
    const rows: RawImportRow[] = [{ sku: "SKU-OK", rawValue: -1 }];
    const preview = buildImportPreview(rows, "receipt", variantsBySku);
    expect(preview[0].error).toBe("القيمة يجب أن تكون رقماً موجباً");
  });

  it("rejects a count below stockReserved with the products screen's exact message", () => {
    const rows: RawImportRow[] = [{ sku: "SKU-RESERVED", rawValue: 1 }];
    const preview = buildImportPreview(rows, "count", variantsBySku);
    expect(preview[0].error).toBe("لا يمكن أن يكون المخزون أقل من المحجوز (3)");
    expect(preview[0].newAvailable).toBeNull();
  });

  it("accepts a count at or above stockReserved and sets newAvailable = counted", () => {
    const rows: RawImportRow[] = [{ sku: "SKU-RESERVED", rawValue: 3 }];
    const preview = buildImportPreview(rows, "count", variantsBySku);
    expect(preview[0]).toEqual({
      sku: "SKU-RESERVED",
      variantId: "v2",
      product: "بنطلون",
      variant: "L",
      current: 5,
      counted: 3,
      newAvailable: 3,
    });
  });

  it("merges duplicate SKUs in receipt mode by summing", () => {
    const rows: RawImportRow[] = [
      { sku: "SKU-OK", rawValue: 3 },
      { sku: "SKU-OK", rawValue: 4 },
    ];
    const preview = buildImportPreview(rows, "receipt", variantsBySku);
    expect(preview).toHaveLength(1);
    expect(preview[0].delta).toBe(7);
    expect(preview[0].newAvailable).toBe(17);
  });

  it("merges duplicate SKUs in count mode by last-value-wins", () => {
    const rows: RawImportRow[] = [
      { sku: "SKU-OK", rawValue: 20 },
      { sku: "SKU-OK", rawValue: 25 },
    ];
    const preview = buildImportPreview(rows, "count", variantsBySku);
    expect(preview).toHaveLength(1);
    expect(preview[0].counted).toBe(25);
    expect(preview[0].newAvailable).toBe(25);
  });

  it("skips a blank cell entirely (never appears in the preview)", () => {
    const rows: RawImportRow[] = [{ sku: "SKU-OK", rawValue: null }];
    const preview = buildImportPreview(rows, "receipt", variantsBySku);
    expect(preview).toHaveLength(0);
  });
});

describe("computeUnitCostPiastres (backlog 5.1 settlement snapshot)", () => {
  it("rounds pricePiastres * costRateBps / 10000", () => {
    // 75% of 12000 piastres = 9000 exactly.
    expect(computeUnitCostPiastres(12000, 7500)).toBe(9000);
  });

  it("rounds to the nearest piastre for a non-round rate", () => {
    // 72% of 12500 = 9000 exactly; 72% of 12501 = 9000.72 -> rounds to 9001.
    expect(computeUnitCostPiastres(12500, 7200)).toBe(9000);
    expect(computeUnitCostPiastres(12501, 7200)).toBe(9001);
  });

  it("is zero at a zero rate and equal to price at a 100% rate", () => {
    expect(computeUnitCostPiastres(5000, 0)).toBe(0);
    expect(computeUnitCostPiastres(5000, 10000)).toBe(5000);
  });
});
