import { SearchContent } from "./search-content";
import { pageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "بحث",
  description: "ابحث عن المنتجات بالاسم أو الوسم في متجر نايل كينجز",
  path: "search",
});

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <div className="container px-4 py-6 md:py-8">
      <SearchContent initialParams={params} />
    </div>
  );
}
