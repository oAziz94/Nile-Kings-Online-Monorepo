import Image from "next/image";
import { Amiri, Archivo, IBM_Plex_Sans_Arabic } from "next/font/google";
import "./auth-motion.css";
import { Ankh } from "@/components/brand/ankh";
import { cn } from "@/lib/utils";
import { AuthVisualProvider } from "./auth-visual-context";
import { AuthHeroImage } from "./auth-hero-image";
import { AuthHeader } from "./auth-header";

/**
 * Shared shell for every (auth) screen (login, register, forgot-password) — backlog 4.5's
 * "Auth visual refresh", built against the reviewed Claude Design canvas:
 * docs/redesign/design-canvas/Auth Surface v2.dc.html ("Material, not panels").
 *
 * Desktop (lg+) is the canvas's material-crosses-the-seam composition: cotton photography as a
 * cropped hero on the left half (cut by 3 of 4 edges), a folded-stack crop straddling the
 * material/ivory seam, the "المصري ☥ للمصري" slogan crossing that seam, and the form column
 * positioned high on the ivory side. The canvas only specifies one desktop frame (1440×900), so
 * everything on the ivory side is anchored to the SEAM (50%) and scaled with the viewport via
 * the CSS variables on the wrapper — the slogan's overhang past the seam, the form column's
 * width and right margin all shrink together down to 1024px so nothing ever collides
 * (the fixed-pixel version of this overlapped the heading with the slogan below ~1360px).
 * Vertical rhythm scales with viewport height the same way so a 1080p laptop at 125% (≈680px
 * of CSS viewport) fits without an inner scrollbar; if a step is genuinely taller than the
 * viewport (register's profile step), the PAGE scrolls — the column is a normal flow block,
 * never its own scroll container.
 *
 * Mobile (< lg) is its OWN composition per the canvas's section D, not a squeezed desktop:
 * cotton cropped hard to a top band, the form sheet overlapping the band. Between md and lg
 * (tablets, small laptop windows) the sheet keeps that composition but its content is capped at
 * a readable measure instead of stretching 1000px-wide inputs across the screen.
 *
 * `{children}` (the actual form, which owns real client state and field ids) renders EXACTLY
 * ONCE; only the purely-decorative pieces (hero, slogan, seam accents) exist as separate
 * mobile/desktop siblings toggled by the `lg` breakpoint.
 *
 * Fonts: the canvas's 3-family system (Amiri display / IBM Plex Sans Arabic body / Archivo for
 * Latin + Western numerals), scoped to this route group via CSS variables — the rest of the app
 * stays on Cairo per docs/redesign/01-design-system.md.
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

// Seam-anchored desktop geometry. At the canvas's 1440px every value resolves to the canvas's
// own numbers (204px slogan overhang past the seam, 88px right margin, 404px form measure);
// they scale down linearly so the 1024–1439px range still fits the same composition.
const layoutVars = {
  "--auth-overhang": "clamp(80px, 28vw - 200px, 204px)",
  "--auth-form-margin": "clamp(32px, 6.1vw, 88px)",
  "--auth-form-w": "min(404px, calc(50% - var(--auth-form-margin) - 24px - var(--auth-overhang)))",
} as React.CSSProperties;

function Slogan({
  ankhSize,
  ankhStroke,
  className,
  textClassName,
  delayMs = 0,
}: {
  ankhSize: number;
  ankhStroke: number;
  className?: string;
  textClassName: string;
  delayMs?: number;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn("nk-rise pointer-events-none flex w-max items-center gap-4 lg:gap-5", className)}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <span className={cn("font-amiri font-bold text-[hsl(228_40%_14%)]", textClassName)}>المصري</span>
      <Ankh size={ankhSize} strokeWidth={ankhStroke} className="shrink-0 text-gold-500" />
      <span className={cn("font-amiri font-bold text-[hsl(228_40%_14%)]", textClassName)}>للمصري</span>
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
        <div className="relative min-h-screen w-full overflow-hidden bg-papyrus" style={layoutVars}>
          <AuthHeader />

          {/* ============================= Mobile / tablet hero band (< lg) ============================= */}
          <div className="absolute inset-x-0 top-14 h-64 overflow-hidden md:h-72 lg:hidden">
            <AuthHeroImage sizes="100vw" className="nk-drift object-cover" />
            <div className="pointer-events-none absolute inset-0" style={{ background: heroGradientMobile }} />
          </div>
          <Slogan
            ankhSize={26}
            ankhStroke={9}
            textClassName="text-[30px]"
            className="absolute right-6 top-[150px] z-[3] md:right-8 md:top-[170px] lg:hidden"
          />

          {/* ============================= Desktop material pane (lg+) ============================= */}
          <div className="absolute bottom-[-64px] left-0 top-[76px] hidden w-1/2 overflow-hidden lg:block">
            <AuthHeroImage sizes="50vw" className="nk-drift object-cover" />
            <div className="pointer-events-none absolute inset-0" style={{ background: heroGradient }} />
          </div>
          {/* Ankh watermark — cropped by two edges, 9% ink. */}
          <Ankh
            size={392}
            strokeWidth={5}
            className="pointer-events-none absolute -bottom-14 -left-12 hidden text-[hsl(228_40%_14%)] opacity-[0.09] lg:block"
          />
          {/* Gold seam — two segments, gapped where the slogan crosses. */}
          <div className="pointer-events-none absolute left-1/2 top-[76px] hidden h-[100px] w-px bg-gold-500/50 lg:block" />
          <div className="pointer-events-none absolute bottom-0 left-1/2 top-[300px] hidden w-px bg-gold-500/50 lg:block" />
          {/* Folded-stack crop — straddles the seam, escapes the bottom edge. */}
          <div className="absolute bottom-[-72px] left-[calc(50%-120px)] hidden h-[clamp(270px,23.6vw,340px)] w-[clamp(200px,17.5vw,252px)] overflow-hidden shadow-[-14px_-14px_34px_rgba(32,30,29,0.13)] lg:block">
            <Image src="/brand/cotton-stack.jpg" alt="" aria-hidden="true" fill sizes="252px" className="object-cover" />
          </div>
          <Slogan
            ankhSize={38}
            ankhStroke={7}
            textClassName="text-[clamp(32px,3.2vw,46px)]"
            className="absolute right-[calc(50%-var(--auth-overhang))] top-[188px] z-[3] hidden lg:flex"
          />
          <p
            aria-hidden="true"
            className="nk-rise pointer-events-none absolute right-[calc(50%-var(--auth-overhang))] top-[262px] z-[3] hidden w-[340px] font-plex-arabic text-[14.5px] leading-[1.9] lg:block"
            style={{ animationDelay: "120ms" }}
          >
            قطن مصري أصيل، جودة تحسها من أول لمسة.
          </p>
          {/* Trust line on the material — present on every (auth) desktop screen; regression
              coverage in tests/e2e/auth-register.spec.ts expects it site-wide on desktop. */}
          <p
            aria-hidden="true"
            className="pointer-events-none absolute bottom-9 left-10 z-[3] hidden font-plex-arabic text-[11.5px] text-[hsl(228_26%_26%)] lg:block"
          >
            أكثر من <span dir="ltr" className="font-archivo font-medium">27</span> محافظة مغطاة
            بشبكة شركاء التوصيل
          </p>

          {/* ============================= Form column — single instance =============================
              Mobile: the only in-flow child (header/band/slogan are all absolute), so its top
              margin is an explicit offset: header (56) + band (256, md: 288) − a 32px overlap so
              the sheet genuinely overlaps the material.
              Desktop: a normal-flow block hugging the right edge (RTL start) at the seam-scaled
              margin/width above; its top padding scales with viewport height so the column sits
              high without forcing an inner scrollbar at short viewports. */}
          <div
            className={cn(
              "relative z-[3] mt-[280px] flex min-h-[calc(100vh-280px)] flex-col border-t border-[hsl(40_12%_80%)] bg-papyrus px-6 pb-8 pt-8 md:mt-[312px] md:min-h-[calc(100vh-312px)]",
              "lg:mr-[var(--auth-form-margin)] lg:mt-0 lg:min-h-0 lg:w-[var(--auth-form-w)] lg:border-t-0 lg:bg-transparent lg:px-0 lg:pb-16 lg:pt-[clamp(110px,16.9vh,152px)]"
            )}
          >
            <div className="flex w-full flex-1 flex-col md:mx-auto md:max-w-[560px] lg:mx-0 lg:max-w-none">
              {children}
            </div>
          </div>
        </div>
      </div>
    </AuthVisualProvider>
  );
}
