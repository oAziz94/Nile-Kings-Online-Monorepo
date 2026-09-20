import type { Metadata } from "next";

// `admin/coupons/page.tsx` is a client component and cannot export metadata itself —
// backlog 10.30.
export const metadata: Metadata = { title: "الكوبونات" };

export default function AdminCouponsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
