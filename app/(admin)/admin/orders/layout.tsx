import type { Metadata } from "next";

// `admin/orders/page.tsx` is a client component and cannot export metadata itself —
// backlog 10.30. Nested routes (`[id]`, `new`, `picking`) each override this with their own
// title/generateMetadata. `title.template` is repeated here (identical to
// `app/(admin)/layout.tsx`'s) rather than left to just a plain string default — Next.js
// only carries a `title.template` one layout deep; a plain-string title here would stop the
// admin surface's template from reaching `[id]`'s `generateMetadata` two hops down.
export const metadata: Metadata = {
  title: { default: "الطلبات", template: "%s · لوحة الإدارة" },
};

export default function AdminOrdersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
