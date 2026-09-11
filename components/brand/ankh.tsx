/**
 * The drawn Ankh mark — backlog 4.5 (Auth visual refresh), per
 * docs/redesign/design-canvas/Auth Surface v2.dc.html section A ("The mark — a drawn Ankh, not
 * a glyph"). Exact construction copied from the canvas, not redrawn/approximated: a true
 * semicircle on a 21-unit span (viewBox 0 0 48 96), detached from the crossbar by a 6-unit air
 * gap, an off-centre crossbar (18 units one side, 19 the other), butt-cut terminals throughout.
 *
 * Per docs/redesign/04-decisions.md 2026-09-11 ("Crown vs. Ankh as the primary app mark"), the
 * crown stays the app's primary mark — this component is ONLY used in the five sanctioned
 * supporting roles the canvas documents: (1) slogan separator, (2) favicon tile, (3) divider
 * interrupt, (4) cropped watermark, (5) one-time draw-on-verify animation. It must never replace
 * the crown lockup itself.
 *
 * Decorative in every sanctioned use (the slogan text next to it already carries the meaning,
 * the watermark/divider are pure background texture) — always `aria-hidden`.
 */
import { cn } from "@/lib/utils";

export interface AnkhProps {
  /** Rendered height in px; width is derived from the mark's fixed 1:2 aspect ratio (48:96). */
  size?: number;
  /** Stroke weight — the canvas's "two weights" guidance: 5 for display-size marks, 8 for UI
   * size, 11 for small/13px use (weight compensates as the mark shrinks so the air gap survives). */
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
  /**
   * Plays the canvas's one-time `nkDraw` stroke animation (900ms, ease-out) — sanctioned use #5,
   * "draws at verification". Guarded by `prefers-reduced-motion` in app/(auth)/auth-motion.css
   * (renders fully drawn, no animation, when the user has that preference).
   */
  animateDraw?: boolean;
  /** Animation start delay (ms) for `animateDraw`, matching the canvas's staggered reveals. */
  drawDelayMs?: number;
}

const VIEW_BOX = "0 0 48 96";
const PATHS = (
  <>
    <path d="M13.5 44V28a10.5 10.5 0 0 1 21 0v16" />
    <path d="M6 50h37" />
    <path d="M24 50v43" />
  </>
);

export function Ankh({
  size = 24,
  strokeWidth = 8,
  className,
  style,
  animateDraw = false,
  drawDelayMs = 0,
}: AnkhProps) {
  const width = size / 2;
  return (
    <svg
      viewBox={VIEW_BOX}
      width={width}
      height={size}
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={style}
    >
      <g
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="butt"
        strokeDasharray={animateDraw ? 150 : undefined}
        className={cn(animateDraw && "nk-draw")}
        style={animateDraw ? { animationDelay: `${drawDelayMs}ms` } : undefined}
      >
        {PATHS}
      </g>
    </svg>
  );
}
