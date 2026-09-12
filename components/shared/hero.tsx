import Image from "next/image";
import Link from "next/link";
import { Ankh } from "@/components/brand/ankh";

/**
 * Home hero — backlog 4.7, artboard 1a/1b of `Storefront v3.dc.html`. Full-bleed campaign
 * photograph below the (opaque, per `04-decisions.md` 2026-09-12 decision 11) navbar, the
 * "قطن ملوك النيل" display heading, the "المصري ☥ للمصري" slogan line with the drawn Ankh
 * (sanctioned use #1, slogan separator), the one approved promise line and a single CTA into the
 * catalog. No invented numbers, no free-shipping claim (standing rules 1–2).
 */
export function Hero() {
  return (
    <section aria-label="الحملة الحالية" className="relative -mt-[60px] overflow-hidden lg:-mt-[84px]">
      <div className="relative h-[520px] w-full sm:h-[600px] lg:h-[760px]">
        <Image
          src="/brand/storefront/hero.jpg"
          alt="قطن ملوك النيل — قطن مصري أصيل"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        {/* Canvas 1a: a dark top gradient so the transparent navbar's ivory controls read over any
            photograph. Inline, not a Tailwind gradient class — the class was dropped from the
            served CSS in dev (see 04-decisions.md 2026-09-12 "storefront edits"). */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-40 lg:h-60"
          style={{ background: "linear-gradient(to bottom, hsl(228 40% 14% / 0.62), hsl(228 40% 14% / 0))" }}
        />
      </div>

      <div className="relative px-4 pb-2 pt-6 sm:px-6 lg:absolute lg:inset-x-0 lg:bottom-[19%] lg:px-12 lg:pb-0 lg:pt-0">
        {/* A soft ivory wash behind the type so it reads over the photograph (user note, 2026-09-12). */}
        <div className="max-w-[680px] lg:-m-8 lg:bg-gradient-to-l lg:from-papyrus/70 lg:via-papyrus/40 lg:to-transparent lg:p-8">
          <h1 className="mb-3 font-amiri text-[42px] font-bold leading-[1.05] text-[hsl(228_40%_14%)] sm:text-6xl lg:text-[104px]">
            قطن ملوك النيل
          </h1>
          <p className="mb-4 flex items-center gap-3 border-b border-[hsl(228_40%_14%)]/28 pb-4 font-amiri text-2xl text-[hsl(228_40%_14%)] sm:gap-4 sm:text-3xl lg:text-[44px]">
            <span>المصري</span>
            {/* Weight 7 on the 48×96 viewBox (2 rendered under 1px and vanished — user note, 2026-09-12); ink like the slogan so it never blends into the photograph. */}
            <Ankh size={40} strokeWidth={7} className="text-[hsl(228_40%_14%)]" />
            <span>للمصري</span>
          </p>
          <p className="mb-6 max-w-[480px] text-sm leading-relaxed text-[hsl(228_26%_24%)] sm:text-base lg:text-[20px] lg:leading-[1.7]">
            قطن مصري أصيل، وراحة تحسها من أول لمسة.
          </p>
          <Link
            href="/products"
            className="flex h-[52px] w-full items-center justify-center gap-3 bg-[hsl(228_40%_14%)] px-8 font-medium text-papyrus transition-colors hover:bg-[hsl(228_40%_20%)] sm:inline-flex sm:h-14 sm:w-auto"
          >
            تسوق الكولكشن
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
              <path d="M19 12H5M11 6l-6 6 6 6" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}
