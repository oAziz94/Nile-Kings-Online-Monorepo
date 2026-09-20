import type { Metadata } from "next";
import { prisma } from "@/lib/db";

// `admin/clients/[id]/page.tsx` is a client component and cannot export metadata itself —
// backlog 10.30. Reads only the client's display name (same `name || phone` rule the page
// itself uses), falling back to the plural label.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const client = await prisma.user.findUnique({ where: { id }, select: { name: true, phone: true } });
  return { title: client ? client.name?.trim() || client.phone : "العملاء" };
}

export default function AdminClientDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
