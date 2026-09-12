import Image from "next/image";
import "./auth-motion.css";
import { Ankh } from "@/components/brand/ankh";
import { SiteNavbar } from "@/components/shared/site-navbar";
import { cn } from "@/lib/utils";
import { AuthVisualProvider } from "./auth-visual-context";
import { AuthHeroImage } from "./auth-hero-image";
import { AuthFormReveal } from "./auth-form-reveal";

/**
 * Shared shell for every (auth) screen (login, register, forgot-password) — backlog 4.5's
 * "Auth visual refresh" built against the reviewed Claude Design canvas
 * (docs/redesign/design-canvas/Auth Surface v2.dc.html), then refined 2026-09-11 against the
 * user's art-direction brief (docs/redesign/04-decisions.md "4.5 refinement: art direction").
 * The refinement keeps the canvas's composition — editorial split, ivory/lapis/gold, the cotton
 * photography crossing into the ivory side, the drawn Ankh in the slogan — and changes proportion,
 * crop, typography and copy, not the concept.
 *
 * Desktop (lg+): the material photograph is a block anchored to the left and cut by the navbar,
 * the left edge and the bottom edge of the viewport (it is architecture, not a background); it is
 * a little under half the width so the slogan has room to cross its right edge. The slogan
 * "المصري ☥ للمصري" sits mid-height, its inline start on the ivory side and the Ankh + second
 * word on the photograph — type and picture composed together. The folded-stack photograph
 * enters from the bottom, straddling the same edge and escaping the viewport. The form column
 * holds the top-right. Everything on the ivory side is anchored to the photograph's edge and
 * scaled with the viewport via the CSS variables on the wrapper — the form column's width is
 * derived last so it can never collide with the slogan's overhang, down to 1024px.
 * Vertical rhythm scales with viewport height so a 1080p laptop at 125% (≈680px of CSS
 * viewport) fits without an inner scrollbar; a step taller than the viewport (register's profile
 * step) scrolls the PAGE — the column is a normal flow block, never its own scroll container.
 *
 * Mobile (< lg) is its own composition, not a squeezed desktop: the photograph as a top band
 * with the slogan on it, the ivory sheet overlapping the band's foot, and the folded-stack
 * photograph straddling that edge at the left while the heading holds the right. Between md and
 * lg (tablets) the sheet keeps that composition with its content capped at a readable measure.
 *
 * `{children}` (the actual form, which owns real client state and field ids) renders EXACTLY
 * ONCE; only the purely-decorative pieces (hero, slogan, stack) exist as separate mobile/desktop
 * siblings toggled by the `lg` breakpoint.
 *
 * Fonts: the canvas's 3-family system (Amiri display / IBM Plex Sans Arabic body / Archivo for
 * Latin + Western numerals). Backlog 4.6 moved the three `next/font` loaders to the root
 * `app/layout.tsx` (loaded once, site-wide) — this route group just opts into the
 * `font-plex-arabic` utility; the CSS variables (`--font-amiri`/`--font-plex-arabic`/
 * `--font-archivo`) already live on `<html>`. The rest of the app (admin/partner) stays on Cairo
 * per docs/redesign/01-design-system.md.
 */

// Desktop geometry, all derived from the photograph's right edge (`--auth-photo-w`).
//   photo-w   : a little under half the viewport (686px at 1440), so the slogan can overhang it.
//   overhang  : how far the slogan's inline start reaches past that edge onto the ivory — at
//               1440px it is the width of the first word + its gap, so the Ankh lands on the edge.
//   form-w    : whatever is left after photo + overhang + a 24px air gap + the outer margin,
//               capped at 440px — derived last so the slogan and the form can never collide.
//   stack-w   : the folded-stack photograph; height follows a 5:6 ratio, capped by viewport
//               height so it never climbs into the slogan on short laptops.
const layoutVars = {
  "--auth-photo-w": "clamp(470px, 46vw + 24px, 760px)",
  "--auth-overhang": "clamp(40px, 22vw - 130px, 190px)",
  "--auth-form-margin": "clamp(40px, 6vw, 88px)",
  "--auth-form-w":
    "min(440px, calc(100% - var(--auth-photo-w) - var(--auth-overhang) - 24px - var(--auth-form-margin)))",
  "--auth-stack-w": "clamp(220px, min(22vw, 34vh), 320px)",
} as React.CSSProperties;

const SUPPORT_COPY = "قطن مصري أصيل، من أول لمسة تحس الفرق.";

// The crop, not the image (brief §4): each block draws the photograph larger than itself and
// looks at one region of it. The bed linen (drape, the hero) is framed on the sheet's creases
// and the fold rolling over the mattress edge, not on the bed frame; the macro weave (forgot-
// password's last step) on its calmer left third plus one diagonal crest at ~1.5×. Mobile
// bands are wide and short, so they look further in and lower.
const HERO_CROPS_DESKTOP = {
  drape: { inset: "-8% -30% -8% -6%", position: "58% 50%" },
  weave: { inset: "-24% -46% -30% -6%", position: "0% 50%" },
} as const;
const HERO_CROPS_MOBILE = {
  drape: { inset: "-6% -6% -6% -6%", position: "55% 55%" },
  weave: { inset: "-20% -10% -20% -30%", position: "0% 45%" },
} as const;

function Slogan({
  ankhSize,
  ankhStroke,
  className,
  textClassName,
  gapClassName = "gap-4",
}: {
  ankhSize: number | string;
  ankhStroke: number;
  className?: string;
  textClassName: string;
  gapClassName?: string;
}) {
  const textClass = cn(
    "font-amiri font-bold leading-none tracking-[-0.01em] text-[hsl(228_40%_14%)]",
    textClassName
  );
  return (
    <div className={cn("pointer-events-none flex w-max items-center", gapClassName, className)}>
      <span className={textClass}>المصري</span>
      <Ankh
        size={typeof ankhSize === "number" ? ankhSize : 24}
        strokeWidth={ankhStroke}
        className="shrink-0 text-gold-500"
        style={typeof ankhSize === "string" ? { height: ankhSize, width: `calc(${ankhSize} / 2)` } : undefined}
      />
      <span className={textClass}>للمصري</span>
    </div>
  );
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthVisualProvider>
      <div
        dir="rtl"
        className={cn("font-plex-arabic text-[hsl(228_26%_24%)]")}
      >
        <div className="relative min-h-screen w-full overflow-hidden bg-papyrus" style={layoutVars}>
          {/* Transparent over the photograph like the home hero (user direction 2026-09-12), in the
              ink tone: the auth surface's ground is ivory and its photographs are light cotton. */}
          <SiteNavbar current="account" transparent transparentTone="ink" />

          {/* ============================= Mobile / tablet band (< lg) ============================= */}
          <div className="absolute inset-x-0 top-0 h-[332px] overflow-hidden md:h-[380px] lg:hidden">
            <AuthHeroImage sizes="140vw" className="nk-drift object-cover" crops={HERO_CROPS_MOBILE} />
            <div
              aria-hidden="true"
              className="nk-rise absolute bottom-[56px] right-6 z-[3] flex flex-col items-start md:bottom-[60px] md:right-10"
            >
              <Slogan
                ankhSize={30}
                ankhStroke={8}
                gapClassName="gap-3"
                textClassName="text-[38px] md:text-[44px]"
              />
              <p className="mt-3 font-plex-arabic text-[13.5px] leading-[1.6] text-[hsl(228_30%_18%)]">
                {SUPPORT_COPY}
              </p>
            </div>
          </div>
          {/* Folded-stack photograph — straddles the band/sheet edge at the left. */}
          <div className="nk-enter absolute left-4 top-[236px] z-[4] h-[88px] w-[110px] overflow-hidden shadow-[-10px_-8px_26px_rgba(32,30,29,0.14)] md:left-8 md:top-[262px] md:h-[130px] md:w-[164px] lg:hidden">
            <Image src="/brand/cotton-stack.jpg" alt="" aria-hidden="true" fill sizes="164px" className="object-cover" />
          </div>

          {/* ============================= Desktop material block (lg+) ============================= */}
          <div className="absolute bottom-[-80px] left-0 top-0 hidden w-[var(--auth-photo-w)] overflow-hidden lg:block">
            <AuthHeroImage sizes="75vw" className="nk-drift object-cover" crops={HERO_CROPS_DESKTOP} />
          </div>
          {/* Slogan + brand promise — inline start on the ivory, the Ankh on the photograph's edge. */}
          <div
            aria-hidden="true"
            className="nk-rise absolute right-[calc(100%-var(--auth-photo-w)-var(--auth-overhang))] top-[clamp(280px,44vh,400px)] z-[3] hidden flex-col items-start lg:flex"
          >
            <Slogan
              ankhSize="0.82em"
              ankhStroke={6}
              gapClassName="gap-[0.28em]"
              textClassName="text-[1em]"
              className="text-[length:clamp(46px,4.4vw,66px)]"
            />
            <p className="mt-5 w-[300px] font-plex-arabic text-[15px] leading-[1.85] text-[hsl(228_26%_22%)]">
              {SUPPORT_COPY}
            </p>
          </div>
          {/* Folded-stack photograph — enters from the bottom, straddles the photograph's edge. */}
          <div
            className="nk-enter absolute bottom-[-56px] z-[2] hidden w-[var(--auth-stack-w)] overflow-hidden shadow-[-18px_-14px_44px_rgba(32,30,29,0.15)] lg:block"
            style={{ left: "calc(var(--auth-photo-w) - var(--auth-stack-w) * 0.42)", aspectRatio: "5 / 6" }}
          >
            <Image src="/brand/cotton-stack.jpg" alt="" aria-hidden="true" fill sizes="320px" className="object-cover" />
          </div>

          {/* ============================= Form column — single instance =============================
              Mobile: the only in-flow child (navbar/band/stack are all absolute), so its top
              margin is an explicit offset: navbar (60) + band (272, md: 320) − a 36px overlap so
              the sheet genuinely overlaps the material; its top padding clears the stack.
              Desktop: a normal-flow block hugging the right edge (RTL start) at the derived
              margin/width above; its top padding scales with viewport height so the column sits
              high without forcing an inner scrollbar at short viewports. */}
          <div
            className={cn(
              "relative z-[3] mt-[296px] flex min-h-[calc(100vh-296px)] flex-col bg-papyrus px-6 pb-10 pt-14 md:mt-[344px] md:min-h-[calc(100vh-344px)] md:pt-16",
              "lg:mr-[var(--auth-form-margin)] lg:mt-0 lg:min-h-0 lg:w-[var(--auth-form-w)] lg:bg-transparent lg:px-0 lg:pb-20 lg:pt-[clamp(96px,14vh,136px)]"
            )}
          >
            <div className="flex w-full flex-1 flex-col md:mx-auto md:max-w-[560px] lg:mx-0 lg:max-w-none">
              <AuthFormReveal>{children}</AuthFormReveal>
            </div>
          </div>
        </div>
      </div>
    </AuthVisualProvider>
  );
}
