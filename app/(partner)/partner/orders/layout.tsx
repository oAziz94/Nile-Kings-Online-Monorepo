import type { Metadata } from "next";

// `partner/orders/page.tsx` is a client component and cannot export metadata itself —
// backlog 10.30. Nested routes (`[id]`, `pick-list`) each override this with their own
// title/generateMetadata. `title.template` is repeated (identical to
// `app/(partner)/partner/layout.tsx`'s) so it still reaches `[id]`'s `generateMetadata` two
// hops down instead of stopping at a plain string here (Next.js only carries a
// `title.template` one layout deep).
export const metadata: Metadata = {
  title: { default: "الطلبات", template: "%s · لوحة الشريك" },
};

export default function PartnerOrdersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
