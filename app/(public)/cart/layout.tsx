import type { Metadata } from "next";

// `cart/page.tsx` is a client component (cart context state) and cannot export metadata
// itself — backlog 10.30.
export const metadata: Metadata = { title: "السلة" };

export default function CartLayout({ children }: { children: React.ReactNode }) {
  return children;
}
