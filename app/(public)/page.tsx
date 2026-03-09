import { HomeSections } from "./home-sections";
import { getHomeData } from "@/lib/storefront-data";
import { Hero } from "@/components/shared/hero";
import { pageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "الرئيسية",
  description: "متجر نايل كينجز أونلاين - تسوق من أفضل المنتجات مع توصيل لجميع المحافظات",
  path: "",
});

export default async function StorefrontPage() {
  const data = await getHomeData();

  return (
    <>
      <Hero />
      <div className="max-w-[1400px] mx-auto px-6 py-6 md:py-8">
        <HomeSections data={data} />
      </div>
    </>
  );
}
