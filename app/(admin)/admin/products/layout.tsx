import type { Metadata } from "next";

// `admin/products/page.tsx` is a client component and cannot export metadata itself —
// backlog 10.30. Nested routes (`[id]`, `new`) each override this with their own title.
// `title.template` is repeated (see `orders/layout.tsx`'s comment) so it still reaches
// `[id]`'s `generateMetadata` two hops down instead of stopping at a plain string here.
export const metadata: Metadata = {
  title: { default: "المنتجات", template: "%s · لوحة الإدارة" },
};

export default function AdminProductsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
