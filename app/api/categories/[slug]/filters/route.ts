import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiSuccess, apiNotFound } from "@/lib/api/response";
import { piastresToEgp } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const category = await prisma.category.findFirst({
    where: { slug },
    select: { id: true },
  });

  if (!category) return apiNotFound("التصنيف غير موجود");

  const variants = await prisma.variant.findMany({
    where: { product: { categoryId: category.id, active: true } },
    select: { name: true, pricePiastres: true, stockAvailable: true },
  });

  const sizes = [...new Set(variants.map((v) => v.name))].sort();
  const prices = variants.map((v) => piastresToEgp(v.pricePiastres));
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;

  return apiSuccess({
    sizes,
    minPrice,
    maxPrice,
    hasInStock: variants.some((v) => v.stockAvailable > 0),
  });
}
