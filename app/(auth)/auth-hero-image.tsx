"use client";

import Image from "next/image";
import { useAuthVisual, type AuthHeroVariant } from "./auth-visual-context";

// Web-sized JPEG derivatives of the approved photography (source of truth stays at
// docs/redesign/design-canvas/art/*.jpeg, ~2.5–3 MB each — far too heavy to hand next/image as a
// source on every first paint). Roles per the 2026-09-11 art-direction brief:
//   weave — MATERIAL (hero): the macro cotton, tactile and close.
//   drape — LIVING: bed linen, used only where the story moves to the home (forgot-password's
//           new-password step), never forced into login.
const SOURCES = {
  weave: {
    src: "/brand/cotton-weave.jpg",
    alt: "نسيج قطن مصري خام",
  },
  drape: {
    src: "/brand/cotton-drape.jpg",
    alt: "كتان قطني مطوي",
  },
} as const;

/** How a block frames the photograph: the plate is drawn larger than the block (`inset`, all
 * negative) and `position` says which part of the photograph the block looks at. */
export interface AuthHeroCrop {
  inset: string;
  position: string;
}

/**
 * The hero photography plate behind the material block (desktop) / top band (mobile). Reads
 * `AuthVisualProvider`'s current variant so forgot-password's "new password" step can switch to
 * the "drape" (linen) crop per the canvas while every other screen/step uses "weave" — see
 * auth-visual-context.tsx. `crops` is the crop per photograph: the layout chooses where the block
 * sits on each photograph per breakpoint (the images themselves are never altered — brief §3/§4).
 */
export function AuthHeroImage({
  className,
  sizes,
  crops,
}: {
  className?: string;
  sizes: string;
  crops: Record<AuthHeroVariant, AuthHeroCrop>;
}) {
  const { variant } = useAuthVisual();
  const { src, alt } = SOURCES[variant];
  const crop = crops[variant];
  return (
    <div data-auth-hero="" className="absolute" style={{ inset: crop.inset }}>
      <Image
        key={variant}
        src={src}
        alt={alt}
        fill
        priority
        sizes={sizes}
        className={className}
        style={{ objectPosition: crop.position }}
      />
    </div>
  );
}
