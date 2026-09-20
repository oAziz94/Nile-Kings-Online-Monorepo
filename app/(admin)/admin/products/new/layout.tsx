import type { Metadata } from "next";

// `admin/products/new/page.tsx` is a client component and cannot export metadata itself —
// backlog 10.30.
export const metadata: Metadata = { title: "المنتجات · جديد" };

export default function AdminProductNewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
