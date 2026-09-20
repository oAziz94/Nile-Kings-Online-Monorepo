import type { Metadata } from "next";

// `admin/orders/new/page.tsx` is a client component and cannot export metadata itself —
// backlog 10.30.
export const metadata: Metadata = { title: "الطلبات · جديد" };

export default function AdminOrderNewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
