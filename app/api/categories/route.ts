import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiSuccess } from "@/lib/api/response";
import { piastresToEgp } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const list = await prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      _count: { select: { products: { where: { active: true } } } },
    },
  });

  const data = list.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    sortOrder: c.sortOrder,
    productCount: c._count.products,
  }));

  return apiSuccess(data);
}
