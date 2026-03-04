import Link from "next/link";
import { ProductCard } from "@/components/shared/product-card";
import { ProductGridSkeleton } from "@/components/shared/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionTitle } from "@/components/shared/section-title";
import { Package, Shield, CircleCheck, Heart } from "lucide-react";

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
          <SectionTitle title="تسوق حسب التصنيف" />
          <div className="mx-auto grid max-w-4xl grid-cols-2 gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />
            ))}
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

  const { categories, trending, recommended } = data;
  const categoriesSlice = categories.slice(0, 4);

  return (
    <>
      {/* 1. Shop by Category — max 4 cards, centered grid */}
      <section className="py-6 md:py-8">
        <SectionTitle title="تسوق حسب التصنيف" subtitle="اختر التصنيف المناسب لك" />
        {categoriesSlice.length === 0 ? (
          <EmptyState
            icon={<Package className="h-8 w-8" />}
            title="لا توجد تصنيفات"
            description="سيتم إضافة التصنيفات قريباً."
          />
        ) : (
          <div className="mx-auto grid max-w-4xl grid-cols-2 gap-4 md:grid-cols-4">
            {categoriesSlice.map((c) => (
              <Link
                key={c.id}
                href={`/categories/${c.slug}`}
                className="flex flex-col items-center justify-center rounded-2xl bg-card p-4 text-center shadow-sm transition-all hover:-translate-y-1 hover:shadow-md"
              >
                <span className="font-medium text-foreground">{c.name}</span>
                <span className="mt-1 text-sm text-muted-foreground">
                  {c.productCount} منتج
                </span>
              </Link>
            ))}
          </div>
        )}
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
