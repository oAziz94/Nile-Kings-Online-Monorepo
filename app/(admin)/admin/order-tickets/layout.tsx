import type { Metadata } from "next";

// `admin/order-tickets/page.tsx` is a client component and cannot export metadata itself —
// backlog 10.30. `title.template` is repeated (see `orders/layout.tsx`'s comment) so it
// still reaches `[id]`'s `generateMetadata` two hops down instead of stopping at a plain
// string here.
export const metadata: Metadata = {
  title: { default: "أسئلة العملاء", template: "%s · لوحة الإدارة" },
};

export default function AdminOrderTicketsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
