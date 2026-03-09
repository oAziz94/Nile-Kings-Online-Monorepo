import Image from "next/image";

/** Hero: product / flat lay image (e.g. folded cotton, underwear on dark surface). Replace /hero.png with your asset. */
const HERO_IMAGE = "/hero.png";

export function Hero() {
  return (
    <section
      className="relative flex min-h-[70vh] flex-col md:min-h-[88vh] md:flex-row"
      aria-label="الرئيسية"
    >
      {/* Background image — unchanged */}
      <div className="absolute inset-0">
        <Image
          src={HERO_IMAGE}
          alt="نايل كينجز — قطن مصري أصلي"
          fill
          className="object-cover object-[20%_center] md:object-center"
          sizes="100vw"
          priority
        />
        {/* Full overlay: on mobile fades center-to-bottom; on desktop fades right-to-left */}
        <div
          className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent md:bg-gradient-to-l md:from-black/70 md:via-black/40 md:to-transparent"
          aria-hidden
        />
      </div>

      {/* Text block — mobile: bottom-centered; desktop: right 1/3 */}
      <div className="relative z-10 flex h-full min-h-[70vh] w-full flex-col items-center justify-center text-center md:min-h-[88vh] md:w-1/3 md:shrink-0 md:pe-6 md:ps-4 lg:pe-10">
        <div className="w-full px-6 py-2 md:px-0 md:py-0">
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-gold md:mb-4 md:text-xs">
            المصري للمصري
          </p>

          <h1 className="text-4xl font-extrabold leading-snug text-white md:text-5xl lg:text-6xl xl:text-7xl">
            قطن مصري أصلي
            <br />
            <span className="text-gold">إحساس يبان</span>
            {" "}
            من أول لمسة
          </h1>

          <p className="mt-4 text-sm leading-relaxed text-white/85 md:mt-5 md:text-base md:leading-loose">
            جودة وتصميم يناسبك — اكتشف تشكيلتنا من المنتجات
            <br className="hidden md:block" />
            المصنوعة من أفضل الخامات المصرية.
          </p>
        </div>
      </div>
    </section>
  );
}
