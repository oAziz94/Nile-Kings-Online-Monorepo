import Image from "next/image";

/** Hero: product / flat lay image (e.g. folded cotton, underwear on dark surface). Replace /hero.png with your asset. */
const HERO_IMAGE = "/hero.png";

export function Hero() {
  return (
    <section
      className="relative flex min-h-[70vh] flex-col md:min-h-[85vh] md:flex-row"
      aria-label="الرئيسية"
    >
      {/* Product/flat lay hero — centered crop works at any aspect ratio */}
      <div className="absolute inset-0">
        <Image
          src={HERO_IMAGE}
          alt="نايل كينجز — قطن مصري أصلي"
          fill
          className="object-cover object-center"
          sizes="100vw"
          priority
        />
        <div
          className="absolute inset-0 bg-gradient-to-l from-black/55 via-black/20 to-transparent md:from-black/55 md:via-transparent md:to-transparent"
          aria-hidden
        />
      </div>

      {/* Text block — RTL: right side, overlaid */}
      <div className="relative z-10 flex w-full flex-col justify-center px-4 py-6 md:w-auto md:max-w-[480px] md:shrink-0 md:py-8 md:pe-8 md:ps-10 lg:pe-12">
        <p className="text-sm font-medium text-gold">المصري للمصري</p>
        <h1 className="mt-2 text-3xl font-bold leading-tight text-white md:text-4xl lg:text-5xl">
          قطن مصري أصلي…
          <br />
          إحساس يبان من أول لمسة
        </h1>
        <p className="mt-3 text-gold">
          جودة وتصميم يناسبك. اكتشف تشكيلتنا من المنتجات المصنوعة من أفضل
          الخامات.
        </p>
      </div>
    </section>
  );
}
