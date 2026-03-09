import Link from "next/link";
import Image from "next/image";
import { ProductCard } from "@/components/shared/product-card";
import { ProductGridSkeleton } from "@/components/shared/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionTitle } from "@/components/shared/section-title";
import { Package, Shield, CircleCheck, Heart } from "lucide-react";

/** Homepage category grid: Men & Kids (left), Women (right). Arabic labels. */
const CATEGORY_BANNERS = [
  { slug: "men", labelAr: "رجالي", href: "/categories/men", image: "https://images.unsplash.com/photo-1617127365659-c47fa864d8bc?w=800" },
  { slug: "women", labelAr: "حريمي", href: "/categories/women", image: "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=800" },
  { slug: "kids", labelAr: "أطفال", href: "/categories/kids", image: "https://images.unsplash.com/photo-1503919545889-aef636e10ad4?w=800" },
] as const;

type HomeData = {
  categories: { id: string; name: string; slug: string; productCount: number }[];
  trending: { id: string; name: string; slug: string; imageUrl: string | null; priceEgp: number; originalPriceEgp?: number; discountPercent?: number }[];
  recommended: { id: string; name: string; slug: string; imageUrl: string | null; priceEgp: number; originalPriceEgp?: number; discountPercent?: number }[];
  newArrivals: { id: string; name: string; slug: string; imageUrl: string | null; priceEgp: number; originalPriceEgp?: number; discountPercent?: number }[];
} | null;

function toCardProps(p: {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  priceEgp: number;
  originalPriceEgp?: number;
  discountPercent?: number;
}) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    imageUrl: p.imageUrl,
    price: p.priceEgp,
    originalPrice: p.originalPriceEgp,
    discountPercent: p.discountPercent,
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
          <SectionTitle title="الأكثر مبيعاً" />
          <ProductGridSkeleton count={4} />
        </section>
        <section className="bg-[#1a1a1a] py-12 md:py-16">
          <div className="mx-auto h-32 max-w-3xl animate-pulse rounded-2xl bg-white/5" />
        </section>
        <section className="py-6 md:py-8">
          <SectionTitle title="قد يعجبك" />
          <ProductGridSkeleton count={4} />
        </section>
        <section className="py-6 md:py-8">
          <SectionTitle title="لماذا ملوك النيل" subtitle="التميز في كل تفصيلة" />
          <div className="mx-auto grid max-w-4xl gap-4 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        </section>
      </>
    );
  }

  const { trending, recommended } = data;

  return (
    <>
      {/* 1. Shop by Category — premium visual grid: Men & Kids left, Women right */}
      <section className="py-6 md:py-8" aria-label="تسوق حسب التصنيف">
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
      </section>

      {/* 2. Best Sellers */}
      <section className="py-6 md:py-8">
        <SectionTitle title="الأكثر مبيعاً" />
        {trending.length === 0 ? (
          <EmptyState
            icon={<Package className="h-8 w-8" />}
            title="لا توجد منتجات بعد"
            description="تصفح المنتجات وستظهر هنا."
          />
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {trending.map((p) => (
              <ProductCard key={p.id} {...toCardProps(p)} />
            ))}
          </div>
        )}
      </section>

      {/* قصة القطن المصري — story section with dark background */}
      <section className="bg-[#1a1a1a] py-12 md:py-16">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-3xl font-bold text-white md:text-4xl">
            قصة القطن المصري
          </h2>
          <div className="mx-auto mt-3 h-0.5 w-16 bg-[#a87d3a]" aria-hidden />
          <p className="mt-6 leading-relaxed text-[#d9d9d9] md:text-lg">
            منذ آلاف السنين، اشتهرت مصر بأجود أنواع القطن في العالم. قطننا المصري الأصيل يتميز بألياف طويلة وناعمة تمنحك راحة لا مثيل لها. نحن نختار بعناية فائقة أفضل المحاصيل لنقدم لك تجربة فاخرة تليق بملوك الراحة.
          </p>
        </div>
      </section>

      {/* قد يعجبك — recommended products */}
      <section className="py-6 md:py-8">
        <SectionTitle title="قد يعجبك" />
        {recommended.length === 0 ? (
          <EmptyState
            icon={<Package className="h-8 w-8" />}
            title="لا توجد توصيات بعد"
            description="تصفح المنتجات لرؤية توصيات مخصصة لك."
          />
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {recommended.map((p) => (
              <ProductCard key={p.id} {...toCardProps(p)} />
            ))}
          </div>
        )}
      </section>

      {/* 5. Why Nile Kings — 3 equal centered cards */}
      <section className="py-6 md:py-8">
        <SectionTitle title="لماذا ملوك النيل" subtitle="التميز في كل تفصيلة" />
        <div className="mx-auto grid max-w-4xl gap-4 md:grid-cols-3">
          {WHY_ITEMS.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="flex flex-col items-center rounded-2xl bg-card p-6 text-center shadow-sm"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-burgundy/10 text-burgundy">
                <Icon className="h-6 w-6" />
              </div>
              <h3 className="mt-3 font-semibold text-foreground">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
