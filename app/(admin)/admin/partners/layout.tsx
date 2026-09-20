import type { Metadata } from "next";

// `admin/partners/page.tsx` is a client component and cannot export metadata itself —
// backlog 10.30. `title.template` is repeated (see `orders/layout.tsx`'s comment) so it
// still reaches `[id]`'s `generateMetadata` two hops down instead of stopping at a plain
// string here.
export const metadata: Metadata = {
  title: { default: "الشركاء", template: "%s · لوحة الإدارة" },
};

export default function AdminPartnersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
