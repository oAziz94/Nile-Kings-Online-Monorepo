import type { Metadata } from "next";

// `admin/categories/page.tsx` is a client component and cannot export metadata itself —
// backlog 10.30.
export const metadata: Metadata = { title: "الفئات" };

export default function AdminCategoriesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
