import type { Metadata } from "next";
import { prisma } from "@/lib/db";

// `admin/partners/[id]/page.tsx` is a client component and cannot export metadata itself —
// backlog 10.30. Reads only the partner's display name, falling back to the plural label.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const partner = await prisma.partner.findUnique({ where: { id }, select: { name: true } });
  return { title: partner?.name ?? "الشركاء" };
}

export default function AdminPartnerDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
