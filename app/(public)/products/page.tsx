import { Suspense } from "react";
import { ProductsContent } from "./products-content";
import { LoadingDots } from "@/components/shared/loading-dots";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "المنتجات",
  description: "تصفح جميع المنتجات في متجر نايل كينجز",
  path: "products",
});

export default function ProductsPage() {
  return (
    <div className="container px-4 py-6 md:py-8">
      <Suspense fallback={<LoadingDots />}>
        <ProductsContent />
      </Suspense>
    </div>
  );
}
