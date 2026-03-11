/**
 * Courier export: matches NewTemplate.xlsx column names.
 * Only red columns + COD_Value are filled; all other columns left empty.
 * City = governorate mapped to the template's 27 Egyptian governorate names.
 */

import * as XLSX from "xlsx";

/** Template column headers in exact order (from NewTemplate.xlsx). Do not change. */
export const COURIER_EXPORT_HEADERS = [
  "Package_Serial",
  "Description",
  "Total_Weight",
  "Package_volume",
  "COD_Value",
  "Item_Special_Notes",
  "Customer_Name",
  "Mobile_No",
  "Street",
  "City",
  "Package_Ref. Number",
  "Merchant_Name",
  "Warehouse_Name",
  "HasPOD",
  "SellerName",
  "Post_Id",
] as const;

export type CourierExportRow = Record<
  (typeof COURIER_EXPORT_HEADERS)[number],
  string | number
>;

/** Allowed City values for the template (27 Egyptian governorates). */
export const TEMPLATE_CITY_VALUES = [
  "CAIRO",
  "GIZA",
  "ALEXANDRIA",
  "BEHIRA",
  "QALIUBIA",
  "GHARBIA",
  "MONOUFIA",
  "DOMITTA",
  "DAKAHLIA",
  "KAFR EL SHEIKH",
  "MARSA MATROUH",
  "ISMAILIA",
  "SUEZ",
  "PORT SAID",
  "SHARKIA",
  "FAYOUM",
  "BANI SWEIF",
  "MENIA",
  "ASSIUT",
  "SOUHAGE",
  "QENA",
  "ASWAN",
  "LOUXOR",
  "RED SEA",
  "NEW VALLEY",
  "NORTH SINAI",
  "SOUTH SINAI",
] as const;

/** Map governorate (Arabic or normalized) → template City value. */
const GOVERNORATE_TO_TEMPLATE_CITY: Record<string, string> = {
  // Arabic (from GOVERNORATE_OPTIONS)
  "القاهرة": "CAIRO",
  "الجيزة": "GIZA",
  "الإسكندرية": "ALEXANDRIA",
  "البحيرة": "BEHIRA",
  "القليوبية": "QALIUBIA",
  "الغربية": "GHARBIA",
  "المنوفية": "MONOUFIA",
  "دمياط": "DOMITTA",
  "الدقهلية": "DAKAHLIA",
  "كفر الشيخ": "KAFR EL SHEIKH",
  "مرسى مطروح": "MARSA MATROUH",
  "الإسماعيلية": "ISMAILIA",
  "السويس": "SUEZ",
  "بورسعيد": "PORT SAID",
  "الشرقية": "SHARKIA",
  "الفيوم": "FAYOUM",
  "بني سويف": "BANI SWEIF",
  "المنيا": "MENIA",
  "أسيوط": "ASSIUT",
  "سوهاج": "SOUHAGE",
  "قنا": "QENA",
  "الأقصر": "LOUXOR",
  "أسوان": "ASWAN",
  "البحر الأحمر": "RED SEA",
  "الوادي الجديد": "NEW VALLEY",
  "شمال سيناء": "NORTH SINAI",
  "جنوب سيناء": "SOUTH SINAI",
  // English (normalized uppercase) for lookup
  "CAIRO": "CAIRO",
  "GIZA": "GIZA",
  "ALEXANDRIA": "ALEXANDRIA",
  "BEHIRA": "BEHIRA",
  "QALIUBIA": "QALIUBIA",
  "GHARBIA": "GHARBIA",
  "MONOUFIA": "MONOUFIA",
  "DOMITTA": "DOMITTA",
  "DAKAHLIA": "DAKAHLIA",
  "KAFR EL SHEIKH": "KAFR EL SHEIKH",
  "MARSA MATROUH": "MARSA MATROUH",
  "ISMAILIA": "ISMAILIA",
  "SUEZ": "SUEZ",
  "PORT SAID": "PORT SAID",
  "SHARKIA": "SHARKIA",
  "FAYOUM": "FAYOUM",
  "BANI SWEIF": "BANI SWEIF",
  "MENIA": "MENIA",
  "ASSIUT": "ASSIUT",
  "SOUHAGE": "SOUHAGE",
  "QENA": "QENA",
  "ASWAN": "ASWAN",
  "LOUXOR": "LOUXOR",
  "RED SEA": "RED SEA",
  "NEW VALLEY": "NEW VALLEY",
  "NORTH SINAI": "NORTH SINAI",
  "SOUTH SINAI": "SOUTH SINAI",
};

function mapGovernorateToTemplateCity(governorate: string | undefined | null): string {
  if (!governorate || typeof governorate !== "string") return "";
  const trimmed = governorate.trim();
  if (!trimmed) return "";
  const byArabic = GOVERNORATE_TO_TEMPLATE_CITY[trimmed];
  if (byArabic) return byArabic;
  const byUpper = GOVERNORATE_TO_TEMPLATE_CITY[trimmed.toUpperCase()];
  if (byUpper) return byUpper;
  return "";
}

type ShippingAddressJson = {
  governorate?: string;
  city?: string | null;
  area?: string | null;
  street?: string;
  building?: string | null;
  floor?: string | null;
  apartment?: string | null;
  notes?: string | null;
  phone?: string;
};

export type OrderForCourierExport = {
  id: string;
  totalPiastres: number;
  paymentMethod: string;
  shippingAddress: unknown;
  user: { name: string | null; phone: string };
  /** productName, variantName, quantity; weightGrams (from product) for Total_Weight. */
  items: { productName: string; variantName: string; quantity: number; weightGrams?: number | null }[];
};

function getAddress(o: OrderForCourierExport): ShippingAddressJson {
  let raw = o.shippingAddress;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      return {};
    }
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw))
    return raw as ShippingAddressJson;
  return {};
}

function toEgp(piastres: number): string {
  return (piastres / 100).toFixed(2);
}

/** COD_Value: 0 if InstaPay (or other non-COD), order total (EGP) if COD. */
function getCodValue(order: OrderForCourierExport): string {
  const isCod = order.paymentMethod === "COD";
  return isCod ? toEgp(order.totalPiastres) : "0";
}

/** Description text from order items: e.g. "Product A - Variant x 2, Product B - Variant x 1". */
function getDescription(order: OrderForCourierExport): string {
  return order.items
    .map((i) => `${i.productName} - ${i.variantName} x${i.quantity}`)
    .join(", ");
}

/** Total weight in grams: sum of (quantity * weightGrams) per item. */
function getTotalWeightGrams(order: OrderForCourierExport): number {
  return order.items.reduce(
    (sum, i) => sum + i.quantity * (i.weightGrams ?? 0),
    0
  );
}

/** Build one row: only red columns + COD_Value filled; City = governorate mapped to template list. */
export function orderToCourierRow(order: OrderForCourierExport): CourierExportRow {
  const addr = getAddress(order);
  const city = mapGovernorateToTemplateCity(addr.governorate);
  const street = [addr.street, addr.building, addr.floor, addr.apartment]
    .filter(Boolean)
    .join(", ");

  return {
    "Package_Serial": "",
    "Description": getDescription(order),
    "Total_Weight": getTotalWeightGrams(order),
    "Package_volume": "",
    "COD_Value": getCodValue(order),
    "Item_Special_Notes": addr.notes ?? "",
    "Customer_Name": order.user?.name ?? "",
    "Mobile_No": order.user?.phone ?? addr.phone ?? "",
    "Street": street,
    "City": city,
    "Package_Ref. Number": "",
    "Merchant_Name": "",
    "Warehouse_Name": "",
    "HasPOD": "",
    "SellerName": "",
    "Post_Id": "",
  };
}

/** Build one data row as an array in exact header order (avoids key-mismatch / stale bundle issues). */
function orderToRowArray(order: OrderForCourierExport): (string | number)[] {
  const addr = getAddress(order);
  const city = mapGovernorateToTemplateCity(addr.governorate);
  const street = [addr.street, addr.building, addr.floor, addr.apartment]
    .filter(Boolean)
    .join(", ");
  const codVal = order.paymentMethod === "COD" ? toEgp(order.totalPiastres) : "0";
  return [
    "", // Package_Serial
    getDescription(order), // Description
    getTotalWeightGrams(order), // Total_Weight (grams)
    "", // Package_volume
    codVal,
    addr.notes ?? "",
    order.user?.name ?? "",
    order.user?.phone ?? addr.phone ?? "",
    street,
    city,
    "", // Package_Ref. Number — left empty
    "", // Merchant_Name
    "", // Warehouse_Name
    "", // HasPOD
    "", // SellerName
    "", // Post_Id
  ];
}

/** Build XLSX with template column order; only red columns + COD_Value filled. */
export function buildCourierXlsx(orders: OrderForCourierExport[]): Buffer {
  const data: (string | number)[][] = [
    [...COURIER_EXPORT_HEADERS],
    ...orders.map(orderToRowArray),
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Shipments");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(buf);
}

/** Filename for courier export: shipments_YYYY_MM_DD.xlsx */
export function courierExportFilename(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `shipments_${y}_${m}_${d}.xlsx`;
}
