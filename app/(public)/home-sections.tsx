import Link from "next/link";
import { ProductCard } from "@/components/shared/product-card";
import { ProductGridSkeleton } from "@/components/shared/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionTitle } from "@/components/shared/section-title";
import { Package, Award, Truck, Shield } from "lucide-react";

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
    icon: Award,
    title: "جودة مصرية",
    description: "قطن وخامات محلية بمعايير عالية.",
  },
  {
    icon: Truck,
    title: "شحن سريع",
    description: "توصيل لجميع المحافظات.",
  },
  {
    icon: Shield,
    title: "ضمان الرضا",
    description: "استبدال وإرجاع سهل.",
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
        <section className="py-6 md:py-8">
          <div className="h-24 animate-pulse rounded-2xl bg-muted" />
        </section>
        <section className="py-6 md:py-8">
          <SectionTitle title="قد يعجبك" />
          <ProductGridSkeleton count={4} />
        </section>
        <section className="py-6 md:py-8">
          <SectionTitle title="لماذا نايل كينجز" />
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

      {/* 3. Pensioners offer — link to verify / profile */}
      <section className="py-6 md:py-8">
        <Link
          href="/profile/senior"
          className="block mx-auto max-w-2xl rounded-2xl border border-border/60 bg-card/50 px-5 py-6 text-center shadow-sm transition-all hover:border-burgundy/40 hover:shadow-md md:px-8 md:py-8"
        >
          <p className="text-sm font-medium text-burgundy">عرض خاص</p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground md:text-3xl">
            خصم خاص لأصحاب المعاشات
          </h2>
          <p className="mt-3 text-muted-foreground">
            اشتري قطعتين واحصل على الثالثة مجاناً
          </p>
          <span className="mt-4 inline-block text-sm font-medium text-burgundy underline underline-offset-2">
            اعرف الشروط وسجّل بياناتك
          </span>
        </Link>
      </section>

      {/* 4. قد يعجبك — recommended products */}
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
        <SectionTitle title="لماذا نايل كينجز" />
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
