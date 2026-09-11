"use client";

import Image from "next/image";
import { useAuthVisual } from "./auth-visual-context";

const SOURCES = {
  weave: {
    src: "/brand/cotton-weave.png",
    alt: "نسيج قطن مصري خام",
  },
  drape: {
    src: "/brand/cotton-drape.png",
    alt: "كتان قطني مطوي",
  },
} as const;

/**
 * The hero photography plate behind the material pane (desktop) / top band (mobile). Reads
 * `AuthVisualProvider`'s current variant so forgot-password's "new password" step can switch to
 * the "drape" (linen) crop per the canvas while every other screen/step uses "weave" — see
 * auth-visual-context.tsx.
 */
export function AuthHeroImage({ className, sizes }: { className?: string; sizes: string }) {
  const { variant } = useAuthVisual();
  const { src, alt } = SOURCES[variant];
  return (
    <Image
      key={variant}
      src={src}
      alt={alt}
      fill
      priority
      sizes={sizes}
      className={className}
    />
  );
}
