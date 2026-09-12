import { NextRequest } from "next/server";
import { requirePartner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiBadRequest, apiForbidden, apiSuccess, apiUnauthorized } from "@/lib/api/response";
import { isKidsCategory, getDisplaySizeLabel } from "@/lib/size-display";
import {
  buildImportPreview,
  parseInventoryWorkbookRows,
  type RawImportRow,
  type ReceiptMode,
  type VariantForPreview,
} from "@/lib/inventory/receipts";

/**
 * POST /api/partner/inventory/import — backlog 4.23. AGENT only (the factory ships to
 * agents). Preview only: validates and returns a per-row result, writes nothing. Accepts
 * either a multipart upload (`file` + `mode` fields) or a JSON body
 * `{ mode, rows: [{ sku, value }] }` — the same row shape the client's own `xlsx` parse of
 * the dropped file produces, so the drop-zone can either hand the raw file to this route or
 * pre-parse it for instant feedback and post the extracted rows.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requirePartner();
    const partner = await prisma.partner.findUnique({
      where: { id: user.partnerId },
      select: { partnerType: true },
    });
    if (partner?.partnerType !== "AGENT") {
      return apiForbidden("هذه الصفحة متاحة للوكلاء فقط");
    }

    const contentType = req.headers.get("content-type") ?? "";
    let mode: string | null = null;
    let rows: RawImportRow[] = [];

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      mode = form.get("mode")?.toString() ?? null;
      const file = form.get("file");
      if (!(file instanceof File)) {
        return apiBadRequest("الملف مطلوب");
      }
      if (mode !== "receipt" && mode !== "count") {
        return apiBadRequest("mode يجب أن يكون receipt أو count");
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      rows = parseInventoryWorkbookRows(buffer, mode as ReceiptMode);
      if (rows.length === 0) {
        return apiBadRequest("لم يتم التعرف على أعمدة الملف — استخدم ملف التصدير كقالب");
      }
    } else {
      const body = await req.json().catch(() => null);
      mode = body?.mode ?? null;
      if (mode !== "receipt" && mode !== "count") {
        return apiBadRequest("mode يجب أن يكون receipt أو count");
      }
      const rawRows = Array.isArray(body?.rows) ? body.rows : null;
      if (!rawRows) {
        return apiBadRequest("rows مطلوبة");
      }
      rows = rawRows
        .map((r: unknown): RawImportRow | null => {
          if (!r || typeof r !== "object") return null;
          const sku = "sku" in r ? String((r as { sku: unknown }).sku ?? "").trim() : "";
          if (!sku) return null;
          const value = "value" in r ? (r as { value: unknown }).value : null;
          if (value === null || value === undefined || value === "") return { sku, rawValue: null };
          if (typeof value === "number" || typeof value === "string") {
            return { sku, rawValue: value };
          }
          return { sku, rawValue: NaN };
        })
        .filter((r: RawImportRow | null): r is RawImportRow => r !== null);
    }

    const skus = Array.from(new Set(rows.map((r) => r.sku)));
    const variants = skus.length
      ? await prisma.variant.findMany({
          where: { sku: { in: skus }, product: { active: true } },
          select: {
            id: true,
            sku: true,
            name: true,
            colorName: true,
            product: { select: { name: true, category: { select: { slug: true } } } },
            partnerInventories: {
              where: { partnerId: user.partnerId },
              select: { stockAvailable: true, stockReserved: true },
            },
          },
        })
      : [];

    const variantsBySku = new Map<string, VariantForPreview>(
      variants.map((v) => {
        const inventory = v.partnerInventories[0] ?? null;
        const forKids = isKidsCategory(v.product.category?.slug);
        const sizeLabel = getDisplaySizeLabel(v.name, forKids);
        const variantLabel = v.colorName ? `${sizeLabel} · ${v.colorName}` : sizeLabel;
        return [
          v.sku,
          {
            variantId: v.id,
            sku: v.sku,
            productName: v.product.name,
            variantLabel,
            current: inventory?.stockAvailable ?? 0,
            stockReserved: inventory?.stockReserved ?? 0,
          },
        ];
      })
    );

    const preview = buildImportPreview(rows, mode as ReceiptMode, variantsBySku);
    return apiSuccess({ mode, rows: preview });
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }
}
