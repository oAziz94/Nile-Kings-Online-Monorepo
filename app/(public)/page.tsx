import { HomeSections } from "./home-sections";
import { getHomeData } from "@/lib/storefront-data";
import { Hero } from "@/components/shared/hero";
import { pageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "الرئيسية",
  description: "قطن ملوك النيل — ملابس من القطن المصري طويل التيلة للرجال والسيدات والأطفال.",
  path: "",
});

export default async function StorefrontPage() {
  const data = await getHomeData();

  return (
    <>
      <Hero />
      <div className="overflow-x-hidden">
        <HomeSections data={data} />
      </div>
    </>
  );
}
