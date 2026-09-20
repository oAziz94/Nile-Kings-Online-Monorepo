import type { Metadata } from "next";
import { prisma } from "@/lib/db";

// `partner/stock/products/[id]/page.tsx` is a client component and cannot export metadata
// itself — backlog 10.30. Reads only the product name, falling back to the "المخزون" label.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const product = await prisma.product.findUnique({ where: { id }, select: { name: true } });
  return { title: product?.name ?? "المخزون" };
}

export default function PartnerStockProductDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
