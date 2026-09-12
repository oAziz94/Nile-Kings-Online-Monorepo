"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ProductCard } from "@/components/shared/product-card";
import { EmptyState } from "@/components/shared/empty-state";
import { TrustBar } from "@/components/shared/trust-bar";
import { CollectionRail } from "@/components/shared/collection-rail";
import { Ankh } from "@/components/brand/ankh";
import { Package, Shield, Leaf, Hand } from "lucide-react";
import type { getHomeData } from "@/lib/storefront-data";
import { productCardLabel } from "@/lib/catalog";
import { useToast } from "@/hooks/use-toast";

/** Home category tiles — backlog 4.7, canvas copy/heights (artboard 1a `cats`). Hrefs unchanged. */
const CATEGORY_TILES = [
  {
    slug: "men",
    name: "رجالي",
    line: "قمصان، تيشيرتات، وبناطيل بقصّات هادئة.",
    aria: "تسوق رجالي",
    href: "/categories/men",
    image: "/brand/storefront/category-men.jpg",
    focus: "48% 42%",
    heightClass: "h-[220px] lg:h-[600px]",
  },
  {
    slug: "women",
    name: "حريمي",
    line: "فساتين وبلوزات وجلابيات بيتي.",
    aria: "تسوق حريمي",
    href: "/categories/women",
    image: "/brand/storefront/category-women.jpg",
    focus: "40% 45%",
    heightClass: "h-[200px] lg:h-[520px]",
  },
  {
    slug: "kids",
    name: "أطفال",
    line: "بيجامات وتيشيرتات تتحمّل اللعب.",
    aria: "تسوق أطفال",
    href: "/categories/kids",
    image: "/brand/storefront/category-kids.jpg",
    focus: "50% 45%",
    heightClass: "h-[200px] lg:h-[460px]",
  },
] as const;

/**
 * Four-tile collage (one row; the user dropped the pyjamas tile 2026-09-12) — backlog 4.7. Every tile links to a real destination confirmed against the
 * redesign DB (queried directly, `04-decisions.md`/backlog 4.7): the catalog has no bed-linen
 * category or products at all today, so that one tile — image kept per spec — points at the full
 * catalog rather than a fabricated filter; the other four use `?q=` search terms confirmed to
 * return real results.
 */
const COLLAGE_TILES = [
  {
    key: "bed-linen",
    text: "مفروشات فاخرة",
    link: "قريبًا",
    aria: "مفروشات فاخرة — قريبًا",
    href: "/products",
    comingSoon: true,
    image: "/brand/storefront/bed-linen.jpg",
    tone: "bg-[hsl(35_38%_60%)]",
  },
  {
    key: "tees",
    text: "تيشيرتات قطنية",
    link: "تسوق التيشيرتات",
    aria: "تيشيرتات قطنية — تسوق التيشيرتات",
    href: `/products?q=${encodeURIComponent("تي شيرت")}`,
    image: "/brand/storefront/tees.jpg",
    tone: "bg-[hsl(40_30%_88%)]",
  },
  {
    key: "socks",
    text: "جوارب عالية الجودة",
    link: "تسوق الجوارب",
    aria: "جوارب عالية الجودة — تسوق الجوارب",
    href: `/products?q=${encodeURIComponent("شراب")}`,
    image: "/brand/storefront/socks.jpg",
    tone: "bg-[hsl(228_40%_14%)]",
  },
  {
    key: "underwear",
    text: "ملابس داخلية فاخرة",
    link: "تسوق الآن",
    aria: "ملابس داخلية فاخرة — تسوق الآن",
    href: `/products?q=${encodeURIComponent("داخلي")}`,
    image: "/brand/storefront/underwear.jpg",
    tone: "bg-[hsl(35_32%_78%)]",
  },
] as const;

const WHY_ITEMS = [
  {
    n: "01",
    icon: Shield,
    title: "يدوم",
    body: "التيلة الطويلة تعني خيطًا أقل تشعّبًا وقماشًا لا يتوبّر ولا يهترئ بعد الغسلات المتكررة.",
  },
  {
    n: "02",
    icon: Leaf,
    title: "قطن مصري أصيل",
    body: "من الدلتا، صنف جيزة، مغزول ومنسوج ومفصّل في مصر — لا خلطات ولا استيراد.",
  },
  {
    n: "03",
    icon: Hand,
    title: "مريح على الجلد",
    body: "ألياف ناعمة تتنفس، تمتص الرطوبة، وتبرد في الصيف وتدفّئ قليلًا في الشتاء.",
  },
] as const;

const RAIL_DEFS = [
  {
    key: "women" as const,
    id: "rail-women",
    title: "كولكشن السيدات",
    href: "/categories/women",
    prevLabel: "السابق في كولكشن السيدات",
    nextLabel: "التالي في كولكشن السيدات",
  },
  {
    key: "kids" as const,
    id: "rail-kids",
    title: "كولكشن الأطفال",
    href: "/categories/kids",
    prevLabel: "السابق في كولكشن الأطفال",
    nextLabel: "التالي في كولكشن الأطفال",
  },
  {
    key: "men" as const,
    id: "rail-men",
    title: "كولكشن الرجال",
    href: "/categories/men",
    prevLabel: "السابق في كولكشن الرجال",
    nextLabel: "التالي في كولكشن الرجال",
  },
];

type CollageTileDef = (typeof COLLAGE_TILES)[number];

/**
 * Collage tile. Bed linen is not in the catalog yet (user decision, 2026-09-12): its tile is a
 * button that toasts "coming soon" instead of a link into the full listing, so the home page never
 * sends a shopper to a page that does not have what the tile promised.
 */
function CollageTile({ tile, children }: { tile: CollageTileDef; children: React.ReactNode }) {
  const { toast } = useToast();
  const className = `group relative block w-full overflow-hidden text-start text-papyrus no-underline ${tile.tone}`;
  if ("comingSoon" in tile && tile.comingSoon) {
    return (
      <button
        type="button"
        aria-label={`${tile.text} — قريبًا`}
        className={`${className} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500`}
        onClick={() => toast({ title: "المفروشات قريبًا", description: "نجهّز كولكشن المفروشات — ترقّبوه في المتجر قريبًا." })}
      >
        {children}
      </button>
    );
  }
  return (
    <Link href={tile.href} aria-label={tile.aria} className={className}>
      {children}
    </Link>
  );
}

type HomeData = Awaited<ReturnType<typeof getHomeData>>;

function toCardProps(p: HomeData extends null ? never : NonNullable<HomeData>["bestSellers"][number]) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    imageUrl: p.imageUrl,
    price: p.priceEgp,
    originalPrice: p.originalPriceEgp,
    discountPercent: p.discountPercent,
    colorVariants: p.colorVariants,
    variantSlug: p.variantSlug,
    inStock: p.inStock ?? true,
    categoryLabel: productCardLabel(p),
  };
}

/**
 * `data === null` in-page error block — backlog 4.7 / `04-decisions.md` 2026-09-11 architecture
 * note + 2026-09-12 decision 13: a styled block with a reload action, not the old dead-code
 * "skeleton" branch (removed — the page is `force-dynamic`, so that branch could only ever fire
 * on a genuine backend failure, never an in-flight fetch, per `home.md` Notes).
 */
function HomeErrorState() {
  const router = useRouter();
  return (
    <div className="px-4 py-20 sm:px-6 lg:px-12" role="alert">
      <EmptyState
        icon={<Package className="h-8 w-8" />}
        title="تعذّر تحميل الصفحة الرئيسية"
        description="حدث خطأ أثناء تحميل المنتجات. حاول إعادة تحميل الصفحة."
        action={
          <button
            type="button"
            onClick={() => router.refresh()}
            className="h-11 border border-[hsl(228_40%_14%)] px-6 text-sm font-medium text-[hsl(228_40%_14%)] transition-colors hover:bg-[hsl(228_40%_14%)]/6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
          >
            إعادة التحميل
          </button>
        }
      />
    </div>
  );
}

export function HomeSections({ data }: { data: HomeData }) {
  if (!data) {
    return <HomeErrorState />;
  }

  const { bestSellers, collectionProducts } = data;
  const bestSellersSlice = bestSellers.slice(0, 4);

  return (
    <>
      <TrustBar />

      {/* Categories */}
      <section aria-labelledby="cat-h" className="px-4 pt-16 sm:px-6 lg:px-12 lg:pt-[88px]">
        <h2 id="cat-h" className="mb-6 font-amiri text-3xl font-bold text-[hsl(228_40%_14%)] lg:mb-8 lg:text-[38px]">
          تسوق حسب الفئة
        </h2>
        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[1.25fr_1fr_1fr] lg:items-end lg:gap-5">
          {CATEGORY_TILES.map((c) => (
            <Link
              key={c.slug}
              href={c.href}
              aria-label={c.aria}
              className={`group relative block overflow-hidden text-papyrus no-underline ${c.heightClass}`}
            >
              <Image
                src={c.image}
                alt=""
                fill
                sizes="(max-width: 1023px) 100vw, 33vw"
                className="object-cover transition-transform duration-300 ease-out group-hover:scale-105"
                style={{ objectPosition: c.focus }}
              />
              {/* Inline gradient, not a Tailwind class — see hero.tsx / 04-decisions.md 2026-09-12. */}
              <span
                aria-hidden
                className="absolute inset-x-0 bottom-0 h-[82%]"
                style={{ background: "linear-gradient(to top, hsl(228 40% 14% / 0.94), hsl(228 40% 14% / 0.6) 55%, hsl(228 40% 14% / 0))" }}
              />
              <span className="absolute inset-x-5 bottom-5 flex flex-col items-start gap-2 lg:inset-x-7 lg:bottom-7">
                <span className="font-amiri text-[28px] font-bold leading-none lg:text-[34px]">{c.name}</span>
                <span className="text-[13px] text-papyrus/85 lg:text-sm">{c.line}</span>
                <span className="mt-1 inline-flex h-10 items-center gap-2 border border-papyrus px-3.5 text-[13px] font-medium lg:mt-2.5 lg:h-[42px] lg:px-[18px] lg:text-sm">
                  تسوق الآن
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
                    <path d="M19 12H5M11 6l-6 6 6 6" />
                  </svg>
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Best sellers */}
      <section aria-labelledby="best-h" className="px-4 pt-14 sm:px-6 lg:px-12 lg:pt-24">
        <div className="mb-6 flex items-baseline justify-between lg:mb-8">
          <h2 id="best-h" className="font-amiri text-3xl font-bold text-[hsl(228_40%_14%)] lg:text-[38px]">
            الأكثر طلبًا
          </h2>
          <Link
            href="/products?sort=best_sales"
            className="border-b border-gold-500 pb-0.5 text-sm text-[hsl(228_40%_14%)] transition-colors hover:text-gold-600"
          >
            عرض الكل
          </Link>
        </div>
        {bestSellersSlice.length === 0 ? (
          <EmptyState icon={<Package className="h-8 w-8" />} title="لا توجد منتجات بعد" description="تصفح المنتجات وستظهر هنا." />
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-6">
            {bestSellersSlice.map((p) => (
              <ProductCard key={p.id} compact {...toCardProps(p)} />
            ))}
          </div>
        )}
      </section>

      {/* Brand story */}
      <section aria-labelledby="story-h" className="mt-16 grid grid-cols-1 bg-[hsl(228_40%_14%)] text-papyrus lg:mt-[104px] lg:min-h-[520px] lg:grid-cols-2">
        <div className="relative h-[240px] lg:order-2 lg:m-10 lg:h-auto">
          <Image src="/brand/storefront/cotton-field.jpg" alt="حقل قطن مصري" fill sizes="(max-width: 1023px) 100vw, 50vw" className="object-cover" />
        </div>
        <div className="flex flex-col justify-center gap-4 px-5 py-8 lg:order-1 lg:gap-6 lg:px-16 lg:py-[88px]">
          <Ankh size={30} strokeWidth={2} className="text-gold-500" />
          <h2 id="story-h" className="max-w-[520px] font-amiri text-2xl font-normal leading-[1.3] lg:text-[46px] lg:leading-[1.25]">
            قطن واحد فقط في العالم يُسمّى باسم بلده.
          </h2>
          <p className="max-w-[480px] text-sm leading-[1.8] text-papyrus/78 lg:text-base">
            تيلة أطول، خيط أنعم، وقماش يتنفس. من الدلتا إلى مصانعنا، نختار القطن المصري طويل التيلة ونفصّله بأيدٍ مصرية — لأن الأفضل في العالم لا يجب أن يُصدَّر كله.
          </p>
        </div>
      </section>

      {/* Collection rails — fixed, no auto-rotation */}
      {RAIL_DEFS.map((r) => (
        <CollectionRail
          key={r.key}
          id={r.id}
          title={r.title}
          viewAllHref={r.href}
          prevLabel={r.prevLabel}
          nextLabel={r.nextLabel}
          products={collectionProducts[r.key]}
        />
      ))}

      {/* Collage */}
      <section aria-label="مختارات من الكولكشن" className="px-4 pt-14 sm:px-6 lg:px-12 lg:pt-[104px]">
        <div className="grid grid-cols-2 auto-rows-[220px] gap-2.5 lg:grid-cols-4 lg:auto-rows-[400px] lg:gap-4">
          {COLLAGE_TILES.map((c) => (
            <CollageTile key={c.key} tile={c}>
              <Image
                src={c.image}
                alt=""
                fill
                sizes="(max-width: 1023px) 50vw, 25vw"
                className="object-cover transition-transform duration-300 ease-out group-hover:scale-105"
              />
              {/* Dark overlay so the type reads on any photograph (user note, 2026-09-12). */}
              <span
                aria-hidden
                className="absolute inset-0"
                style={{ background: "linear-gradient(to top, hsl(228 40% 14% / 0.9), hsl(228 40% 14% / 0.45) 45%, hsl(228 40% 14% / 0.15))" }}
              />
              <span className="pointer-events-none absolute inset-x-3.5 bottom-10 max-w-[90%] font-amiri text-2xl font-bold leading-[1.15] lg:inset-x-6 lg:bottom-14 lg:text-[30px]">
                {c.text}
              </span>
              <span className="pointer-events-none absolute inset-x-3.5 bottom-3 self-start border-b border-current pb-0.5 text-xs lg:inset-x-6 lg:bottom-[22px] lg:text-[13px]">
                {c.link}
              </span>
            </CollageTile>
          ))}
        </div>
      </section>

      {/* Why us */}
      <section aria-labelledby="why-h" className="px-4 pt-14 sm:px-6 lg:px-12 lg:pt-[104px]">
        <h2 id="why-h" className="mb-6 font-amiri text-3xl font-bold text-[hsl(228_40%_14%)] lg:mb-10 lg:text-[38px]">
          لماذا ملوك النيل
        </h2>
        <div className="flex flex-col border-t border-[hsl(228_40%_14%)] lg:grid lg:grid-cols-3 lg:gap-0">
          {WHY_ITEMS.map((v) => (
            <div
              key={v.n}
              className="flex flex-col gap-3 border-b border-[hsl(228_40%_14%)]/16 py-5 lg:me-10 lg:-mt-px lg:border-t-2 lg:border-b-0 lg:border-[hsl(228_40%_14%)] lg:py-8 lg:pe-7"
            >
              <div className="flex items-baseline justify-between lg:flex-col-reverse lg:items-start lg:justify-start lg:gap-3">
                <h3 className="font-amiri text-xl font-bold text-[hsl(228_40%_14%)] lg:text-2xl">{v.title}</h3>
                <span className="font-archivo text-xs font-medium text-gold-500" style={{ direction: "ltr" }}>
                  {v.n}
                </span>
              </div>
              <p className="text-sm leading-[1.7] text-[hsl(228_18%_40%)] lg:text-[15px] lg:leading-[1.75]">{v.body}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="pb-16 lg:pb-24" />
    </>
  );
}
