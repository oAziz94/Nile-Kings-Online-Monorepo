import type { Metadata } from "next";

// `profile/orders/page.tsx` is a client component and cannot export metadata itself —
// backlog 10.30.
export const metadata: Metadata = { title: "طلباتي" };

export default function ProfileOrdersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
