import Link from "next/link";
import Image from "next/image";
import { ProductCard } from "@/components/shared/product-card";
import { ProductGridSkeleton } from "@/components/shared/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionTitle } from "@/components/shared/section-title";
import { RotatingProductGrid } from "@/components/shared/rotating-product-grid";
import { CollectionCarouselSection } from "@/components/shared/collection-carousel-section";
import { Package, Shield, CircleCheck, Heart } from "lucide-react";
import type { ProductListItem } from "@/lib/catalog";

/** Homepage category grid: Men & Kids (left), Women (right). Arabic labels. */
const CATEGORY_BANNERS = [
  { slug: "men", labelAr: "رجالي", href: "/categories/men", image: "https://images.unsplash.com/photo-1617127365659-c47fa864d8bc?w=800" },
  { slug: "women", labelAr: "حريمي", href: "/categories/women", image: "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=800" },
  { slug: "kids", labelAr: "أطفال", href: "/categories/kids", image: "https://images.unsplash.com/photo-1503919545889-aef636e10ad4?w=800" },
] as const;

type HomeProduct = {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  priceEgp: number;
  originalPriceEgp?: number;
  discountPercent?: number;
  inStock?: boolean;
  colorVariants?: { id: string; colorHex: string | null; colorName: string | null; imageUrl: string | null }[];
};

/** Home data shape from getHomeData(); collection products are ProductListItem[]. */
type HomeData = Awaited<ReturnType<typeof import("@/lib/storefront-data").getHomeData>> | null;

function toCardProps(p: HomeProduct | ProductListItem) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    imageUrl: p.imageUrl,
    price: p.priceEgp,
    originalPrice: p.originalPriceEgp,
    discountPercent: p.discountPercent,
    colorVariants: p.colorVariants,
    inStock: p.inStock ?? true,
  };
}

const WHY_ITEMS = [
  {
    icon: Shield,
    title: "المتانة",
    description: "خياطة محكمة وجودة عالية تضمن لك منتج يدوم طويلاً ويحافظ على شكله",
  },
  {
    icon: CircleCheck,
    title: "قطن مصري",
    description: "أجود أنواع القطن المصري الأصيل، معروف عالميا بجودته الفائقة ونعومته",
  },
  {
    icon: Heart,
    title: "الراحة",
    description: "تصميم مريح يلائم حركتك اليومية مع نسيج ناعم يلامس بشرتك برفق",
  },
];

export function HomeSections({ data }: { data: HomeData }) {
  if (!data) {
    return (
      <>
        <section className="py-6 md:py-8">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:grid-rows-2">
            <div className="h-[200px] animate-pulse rounded-2xl bg-muted md:h-[240px] md:row-start-1" />
            <div className="h-[200px] animate-pulse rounded-2xl bg-muted md:col-start-2 md:row-span-2 md:row-start-1" />
            <div className="h-[200px] animate-pulse rounded-2xl bg-muted md:h-[240px] md:row-start-2" />
          </div>
        </section>
        <section className="py-6 md:py-8">
          <div className="mb-6 flex items-center justify-center gap-4">
          <span className="h-0.5 max-w-12 flex-1 bg-foreground/40" aria-hidden />
          <h2 className="text-2xl font-semibold text-foreground md:text-3xl" dir="rtl">الأكثر مبيعًا</h2>
          <span className="h-0.5 max-w-12 flex-1 bg-foreground/40" aria-hidden />
          </div>
          <ProductGridSkeleton count={4} />
        </section>
        <section className="bg-[#1a1a1a] py-12 md:py-16">
          <div className="mx-auto h-32 max-w-3xl animate-pulse rounded-2xl bg-white/5" />
        </section>
        {[1, 2, 3].map((i) => (
          <section key={i} className="py-10 md:py-12">
            <div className="mb-6 flex items-center justify-center gap-4">
              <span className="h-0.5 max-w-12 flex-1 bg-foreground/40" aria-hidden />
              <div className="h-8 w-48 animate-pulse rounded bg-muted" />
              <span className="h-0.5 max-w-12 flex-1 bg-foreground/40" aria-hidden />
            </div>
            <ProductGridSkeleton count={4} />
            <div className="mt-10 flex justify-center">
              <div className="h-10 w-24 animate-pulse rounded-2xl bg-muted" />
            </div>
          </section>
        ))}
        <section className="py-12 md:py-16">
          <SectionTitle title="لماذا ملوك النيل" subtitle="التميز في كل تفصيلة" variant="large" />
          <div className="mx-auto grid max-w-6xl gap-6 px-4 md:grid-cols-3 md:gap-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-44 animate-pulse rounded-2xl bg-muted md:h-52" />
            ))}
          </div>
        </section>
      </>
    );
  }

  const { trending, bestSellers, collectionProducts } = data;
  const bestSellersSlice = bestSellers.slice(0, 4);
  const womenProducts: ProductListItem[] = collectionProducts.women;
  const kidsProducts: ProductListItem[] = collectionProducts.kids;
  const menProducts: ProductListItem[] = collectionProducts.men;

  return (
    <>
      {/* 1. Shop by Category — full width, premium visual grid */}
      <div className="w-screen relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw]">
        <section className="py-6 md:py-8" aria-label="تسوق حسب التصنيف">
          <div className="mx-auto max-w-[1400px] px-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:grid-rows-2 md:auto-rows-fr">
          {/* Men — desktop: col 1 row 1; mobile: first */}
          <Link
            href={CATEGORY_BANNERS[0].href}
            className="group relative min-h-[200px] overflow-hidden rounded-2xl bg-muted shadow-sm transition-shadow hover:shadow-md md:min-h-[240px] md:row-start-1"
          >
            <Image
              src={CATEGORY_BANNERS[0].image}
              alt={CATEGORY_BANNERS[0].labelAr}
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover transition-transform duration-300 ease-out group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" aria-hidden />
            <span className="absolute inset-0 flex items-center justify-center text-2xl font-semibold text-white drop-shadow-sm md:text-3xl">
              {CATEGORY_BANNERS[0].labelAr}
            </span>
          </Link>
          {/* Women — desktop: col 2, full height; mobile: second */}
          <Link
            href={CATEGORY_BANNERS[1].href}
            className="group relative min-h-[200px] overflow-hidden rounded-2xl bg-muted shadow-sm transition-shadow hover:shadow-md md:col-start-2 md:row-span-2 md:row-start-1 md:min-h-0"
          >
            <Image
              src={CATEGORY_BANNERS[1].image}
              alt={CATEGORY_BANNERS[1].labelAr}
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover transition-transform duration-300 ease-out group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" aria-hidden />
            <span className="absolute inset-0 flex items-center justify-center text-2xl font-semibold text-white drop-shadow-sm md:text-3xl">
              {CATEGORY_BANNERS[1].labelAr}
            </span>
          </Link>
          {/* Kids — desktop: col 1 row 2; mobile: third */}
          <Link
            href={CATEGORY_BANNERS[2].href}
            className="group relative min-h-[200px] overflow-hidden rounded-2xl bg-muted shadow-sm transition-shadow hover:shadow-md md:min-h-[240px] md:row-start-2"
          >
            <Image
              src={CATEGORY_BANNERS[2].image}
              alt={CATEGORY_BANNERS[2].labelAr}
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover transition-transform duration-300 ease-out group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" aria-hidden />
            <span className="absolute inset-0 flex items-center justify-center text-2xl font-semibold text-white drop-shadow-sm md:text-3xl">
              {CATEGORY_BANNERS[2].labelAr}
            </span>
          </Link>
            </div>
          </div>
        </section>
      </div>

      {/* 2. Best Sellers — max 4, centered, premium */}
      <section className="bg-background py-10 md:py-12" aria-label="الأكثر مبيعًا">
        <div className="mb-8 flex items-center justify-center gap-4 px-4">
          <span className="h-0.5 max-w-12 flex-1 bg-foreground/40" aria-hidden />
          <h2 className="text-2xl font-semibold text-foreground md:text-3xl" dir="rtl">
            الأكثر مبيعًا
          </h2>
          <span className="h-0.5 max-w-12 flex-1 bg-foreground/40" aria-hidden />
        </div>
        {bestSellersSlice.length === 0 ? (
          <EmptyState
            icon={<Package className="h-8 w-8" />}
            title="لا توجد منتجات بعد"
            description="تصفح المنتجات وستظهر هنا."
          />
        ) : (
          <div className="mx-auto grid max-w-5xl grid-cols-1 justify-items-center gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {bestSellersSlice.map((p) => (
              <ProductCard
                key={p.id}
                className="w-full max-w-[280px]"
                {...toCardProps(p)}
              />
            ))}
          </div>
        )}
      </section>

      {/* قصة القطن المصري — full width, dark background */}
      <div className="w-screen relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw]">
        <section className="bg-[#1a1a1a] py-12 md:py-16">
          <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold text-white md:text-4xl">
            قصة القطن المصري
          </h2>
          <div className="mx-auto mt-3 h-0.5 w-16 bg-[#a87d3a]" aria-hidden />
          <p className="mt-6 leading-relaxed text-[#d9d9d9] md:text-lg">
            منذ آلاف السنين، اشتهرت مصر بأجود أنواع القطن في العالم. قطننا المصري الأصيل يتميز بألياف طويلة وناعمة تمنحك راحة لا مثيل لها. نحن نختار بعناية فائقة أفضل المحاصيل لنقدم لك تجربة فاخرة تليق بملوك الراحة.
          </p>
          </div>
        </section>
      </div>

      {/* Collection sections: 4 products like الأكثر مبيعاً, rotate automatically */}
      <CollectionCarouselSection title="كولكشن السيدات" viewAllHref="/categories/women">
        <RotatingProductGrid products={womenProducts} />
      </CollectionCarouselSection>

      <CollectionCarouselSection title="كولكشن الأطفال" viewAllHref="/categories/kids">
        <RotatingProductGrid products={kidsProducts} />
      </CollectionCarouselSection>

      <CollectionCarouselSection title="كولكشن الرجال" viewAllHref="/categories/men">
        <RotatingProductGrid products={menProducts} />
      </CollectionCarouselSection>

      {/* 5. Why Nile Kings — 3 equal centered cards, larger section */}
      <section className="py-12 md:py-16">
        <SectionTitle title="لماذا ملوك النيل" subtitle="التميز في كل تفصيلة" variant="large" />
        <div className="mx-auto grid max-w-6xl gap-6 px-4 md:grid-cols-3 md:gap-8">
          {WHY_ITEMS.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="flex flex-col items-center rounded-2xl bg-card p-8 text-center shadow-sm md:p-10"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-burgundy/10 text-burgundy md:h-20 md:w-20">
                <Icon className="h-8 w-8 md:h-10 md:w-10" />
              </div>
              <h3 className="mt-4 text-xl font-semibold text-foreground md:text-2xl">{title}</h3>
              <p className="mt-3 text-base leading-relaxed text-muted-foreground md:text-lg">{description}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
