import Image from "next/image";
import Link from "next/link";
import { Amiri, Archivo, IBM_Plex_Sans_Arabic } from "next/font/google";
import "./auth-motion.css";
import { Ankh } from "@/components/brand/ankh";
import { cn } from "@/lib/utils";
import { AuthVisualProvider } from "./auth-visual-context";
import { AuthHeroImage } from "./auth-hero-image";

/**
 * Shared shell for every (auth) screen (login, register, forgot-password) — backlog 4.5's
 * "Auth visual refresh", built against the reviewed Claude Design canvas:
 * docs/redesign/design-canvas/Auth Surface v2.dc.html ("Material, not panels").
 *
 * Replaces the previous centered-panel/brand-pane composition with the canvas's
 * material-crosses-the-seam composition: cotton photography as a cropped hero (never fully
 * contained — cut by 3 of 4 edges), a second folded-stack crop straddling the material/ivory
 * seam on desktop, the "المصري ☥ للمصري" slogan crossing that seam, and the form column
 * tightened to 404px and positioned high (not vertically centered).
 *
 * Mobile is its OWN composition (per the canvas's section D), not a squeezed desktop: cotton is
 * cropped hard to a top band, and the form sheet overlaps the material band below it.
 *
 * IMPORTANT: `{children}` (the actual login/register/forgot-password form, which owns real
 * client state and real form-field ids) is rendered EXACTLY ONCE below, in a single container
 * whose *position* switches between the mobile and desktop compositions via responsive Tailwind
 * classes. Everything else in this file (header, hero photography, slogan, seam accents) is
 * pure decoration and is duplicated as separate mobile/desktop sibling trees toggled by the `lg`
 * breakpoint — that duplication is safe (no ids, no state) but the content column must not be,
 * or every form field would exist twice in the DOM at once (broken duplicate ids, ambiguous
 * label association, real bugs — caught by this task's own Playwright verification pass).
 *
 * Fonts: the canvas's 3-family system (Amiri for Arabic display type, IBM Plex Sans Arabic for
 * body, Archivo for Latin/Western-numeral text) — scoped to this route group only via the CSS
 * variables below; the rest of the app stays on the single-family Cairo per
 * docs/redesign/01-design-system.md (that decision is unchanged; this is a deliberate, scoped
 * exception matching the literal design canvas that is this task's source of truth).
 */

const amiri = Amiri({
  subsets: ["arabic", "latin"],
  weight: ["400", "700"],
  variable: "--font-amiri",
  display: "swap",
});

const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-plex-arabic",
  display: "swap",
});

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-archivo",
  display: "swap",
});

const heroGradient =
  "linear-gradient(200deg, rgba(255,252,244,.34), rgba(21,26,46,.06) 46%, rgba(21,26,46,.16))";
const heroGradientMobile =
  "linear-gradient(190deg, rgba(255,252,244,.30), rgba(21,26,46,.04) 50%, rgba(21,26,46,.14))";

function Slogan({
  size,
  ankhSize,
  ankhStroke,
  className,
  delayMs = 0,
}: {
  size: string;
  ankhSize: number;
  ankhStroke: number;
  className?: string;
  delayMs?: number;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn("nk-rise pointer-events-none flex items-center gap-4", className)}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <span className={cn("font-amiri font-bold text-[hsl(228_40%_14%)]", size)}>المصري</span>
      <Ankh size={ankhSize} strokeWidth={ankhStroke} className="shrink-0 text-gold-500" />
      <span className={cn("font-amiri font-bold text-[hsl(228_40%_14%)]", size)}>للمصري</span>
    </div>
  );
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthVisualProvider>
      <div
        dir="rtl"
        className={cn(
          amiri.variable,
          plexArabic.variable,
          archivo.variable,
          "font-plex-arabic text-[hsl(228_26%_24%)]"
        )}
      >
        <div className="relative min-h-screen w-full overflow-hidden bg-papyrus">
          {/* Brand header — single real instance, sized responsively (not duplicated: it's a
              real interactive <Link>, unlike the purely-decorative hero/slogan pieces below). */}
          <header className="absolute inset-x-0 top-0 z-40 flex h-14 items-center justify-center border-b border-[hsl(40_12%_80%)] bg-papyrus px-4 lg:h-[76px]">
            <Link href="/" aria-label="العودة للمتجر — قطن ملوك النيل">
              <Image
                src="/brand/logo-lapis.png"
                alt="قطن ملوك النيل"
                width={700}
                height={437}
                priority
                className="h-9 w-auto lg:h-[58px]"
              />
            </Link>
          </header>

          {/* ============================= Mobile hero band (< lg) ============================= */}
          <div className="absolute inset-x-0 top-14 h-64 overflow-hidden lg:hidden">
            <AuthHeroImage sizes="100vw" className="nk-drift object-cover" />
            <div className="pointer-events-none absolute inset-0" style={{ background: heroGradientMobile }} />
          </div>
          <Slogan
            size="text-[26px]"
            ankhSize={22}
            ankhStroke={9}
            className="absolute inset-x-6 top-[124px] z-[3] justify-end lg:hidden"
          />

          {/* ============================= Desktop material pane (lg+) ============================= */}
          <div className="absolute left-0 top-[76px] bottom-[-64px] hidden w-1/2 overflow-hidden lg:block">
            <AuthHeroImage sizes="50vw" className="nk-drift object-cover" />
            <div className="pointer-events-none absolute inset-0" style={{ background: heroGradient }} />
          </div>
          {/* Ankh watermark, cropped by two edges, low ink. */}
          <Ankh
            size={392}
            strokeWidth={5}
            className="pointer-events-none absolute -bottom-14 -left-12 hidden text-[hsl(228_40%_14%)] opacity-[0.09] lg:block"
          />
          {/* Gold seam accent — split into two segments, gapped where the fold-crop overlaps. */}
          <div className="pointer-events-none absolute top-[76px] left-1/2 hidden h-[100px] w-px bg-gold-500/50 lg:block" />
          <div className="pointer-events-none absolute top-[300px] bottom-0 left-1/2 hidden w-px bg-gold-500/50 lg:block" />
          {/* Second crop — the folded stack, straddles the material/ivory seam, escapes the bottom edge. */}
          <div className="absolute bottom-[-72px] left-[41.7%] hidden h-[340px] w-[252px] overflow-hidden shadow-[-14px_-14px_34px_rgba(32,30,29,0.13)] lg:block">
            <Image
              src="/brand/cotton-stack.png"
              alt=""
              aria-hidden="true"
              fill
              sizes="252px"
              className="object-cover"
            />
          </div>
          <Slogan
            size="text-[46px]"
            ankhSize={38}
            ankhStroke={7}
            className="absolute left-[29.5%] top-[188px] z-[3] hidden w-[500px] lg:flex"
          />
          <p
            aria-hidden="true"
            className="nk-rise pointer-events-none absolute left-[29.5%] top-[262px] z-[3] hidden w-[340px] font-plex-arabic text-[14.5px] leading-[1.9] lg:block"
            style={{ animationDelay: "120ms" }}
          >
            قطن مصري أصيل، جودة تحسها من أول لمسة.
          </p>
          {/* Shared trust line — present on every (auth) screen's desktop pane (not just
              login's canvas screens 2a/2b) per the pre-4.5 brand-pane's own copy, kept as
              existing regression coverage (tests/e2e/auth-register.spec.ts) expects it site-wide
              on desktop, not scoped to a single screen. */}
          <p
            aria-hidden="true"
            className="pointer-events-none absolute bottom-9 left-10 z-[3] hidden font-plex-arabic text-[11.5px] text-[hsl(228_26%_26%)] lg:block"
          >
            أكثر من <span dir="ltr" className="font-archivo font-medium">27</span> محافظة مغطاة
            بشبكة شركاء التوصيل
          </p>

          {/* ============================= Form content — single instance =============================
              Mobile: this is the ONLY in-flow child of the wrapper (header/hero-band/slogan are
              all `absolute`, so they contribute nothing to flow position) — its `margin-top` is
              therefore an explicit offset (header 56px + hero band 256px, minus a 32px overlap
              so the sheet genuinely overlaps the material band, per the canvas), not a small
              negative nudge assuming a flow position that doesn't exist.
              Desktop (lg+): absolute right column, tightened to 404px, positioned high (not
              vertically centered) — `overflow-y-auto` guards a tall step (e.g. register's
              profile step) against the fixed-height absolute positioning. */}
          <div
            className={cn(
              "relative z-[3] mt-[280px] flex min-h-[calc(100vh-280px)] flex-col border-t border-[hsl(40_12%_80%)] bg-papyrus px-6 pb-8 pt-8",
              "lg:absolute lg:inset-y-0 lg:right-[88px] lg:mt-0 lg:min-h-0 lg:w-[404px] lg:max-w-[404px]",
              "lg:overflow-y-auto lg:border-t-0 lg:bg-transparent lg:px-0 lg:pt-[150px] lg:pb-10"
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </AuthVisualProvider>
  );
}
