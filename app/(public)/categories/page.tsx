import { pageMetadata } from "@/lib/seo";
import { CategoriesContent } from "./categories-content";

export const metadata = pageMetadata({
  title: "التصنيفات",
  description: "تصفح تصنيفات المنتجات في متجر نايل كينجز",
  path: "categories",
});

export default function CategoriesPage() {
  return <CategoriesContent />;
}
