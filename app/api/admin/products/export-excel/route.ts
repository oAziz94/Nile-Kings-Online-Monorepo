import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiUnauthorized, apiForbidden } from "@/lib/api/response";
import {
  buildCatalogXlsx,
  catalogExportFilename,
  type CatalogExportProduct,
} from "@/lib/catalog-export";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }

  const products = await prisma.product.findMany({
    orderBy: [{ sortOrder: "desc" }, { createdAt: "desc" }],
    include: {
      variants: {
        select: {
          sku: true,
          name: true,
          colorName: true,
          colorHex: true,
          pricePiastres: true,
          stockAvailable: true,
          imageUrl: true,
        },
      },
    },
  });

  const forExport: CatalogExportProduct[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    imageUrl: p.imageUrl,
    variants: p.variants.map((v) => ({
      sku: v.sku,
      name: v.name,
      colorName: v.colorName,
      colorHex: v.colorHex,
      pricePiastres: v.pricePiastres,
      stockAvailable: v.stockAvailable,
      imageUrl: v.imageUrl,
    })),
  }));

  // Use canonical store URL so exported catalog links point to the live site (nilekingscotton.com), not localhost
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://nilekingscotton.com";
  const brand = process.env.NEXT_PUBLIC_BRAND_NAME ?? "Nile Kings";

  const buffer = buildCatalogXlsx(forExport, baseUrl, brand);
  const filename = catalogExportFilename();

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
