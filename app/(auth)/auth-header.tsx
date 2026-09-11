"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { MenuDrawer } from "@/components/shared/menu-drawer";
import { cn } from "@/lib/utils";

/**
 * The header the design canvas draws on every Auth screen (docs/redesign/design-canvas/Auth
 * Surface v2.dc.html): a 1fr/auto/1fr grid — menu control at the inline start, crown logo
 * centered, cart + account at the inline end, account carrying the gold "you are here" underline.
 * 76px on desktop, 56px on mobile, hairline bottom rule, icons at the canvas's 1.3 stroke.
 *
 * Also the reference for the site-wide navbar the storefront will adopt later (see
 * docs/redesign/04-decisions.md 2026-09-11 "Two site-wide design/architecture notes") — kept in
 * (auth) until that task is scoped, not promoted to a shared component yet.
 *
 * The canvas's "المفضلة" heart is deliberately not rendered: the product has no favorites/wishlist
 * feature, and a dead icon is worse than a missing one. The cart icon has no count badge for the
 * same reason — CartProvider isn't mounted in this route group.
 */

const iconClass = "block h-[21px] w-[21px] lg:h-[22px] lg:w-[22px]";
const iconProps = {
  viewBox: "0 0 21 21",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.3,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
} as const;

const controlClass =
  "grid h-11 w-11 place-items-center text-[hsl(228_30%_22%)] transition-colors hover:text-[hsl(228_40%_14%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2 focus-visible:ring-offset-papyrus lg:h-10 lg:w-10";

export function AuthHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <header className="absolute inset-x-0 top-0 z-40 grid h-14 grid-cols-[1fr_auto_1fr] items-center border-b border-[hsl(40_12%_80%)] bg-papyrus px-2 lg:h-[76px] lg:px-[34px]">
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="القائمة"
          className={cn(controlClass, "justify-self-start")}
        >
          <svg {...iconProps} className={iconClass}>
            <path d="M3.6 6.4h13.8" />
            <path d="M3.6 10.5h13.8" />
            <path d="M3.6 14.6h13.8" />
          </svg>
        </button>

        <Link
          href="/"
          aria-label="العودة للمتجر — قطن ملوك النيل"
          className="justify-self-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2 focus-visible:ring-offset-papyrus"
        >
          <Image
            src="/brand/logo-lapis.png"
            alt="قطن ملوك النيل"
            width={700}
            height={437}
            priority
            className="h-[42px] w-auto lg:h-[58px]"
          />
        </Link>

        <div className="flex items-center justify-self-end lg:gap-5">
          <Link href="/cart" aria-label="سلة التسوق" className={controlClass}>
            <svg {...iconProps} className={iconClass}>
              <path d="M4.8 6.6h11.4l-.9 10.8H5.7z" />
              <path d="M8 6.6V5.2a2.5 2.5 0 0 1 5 0v1.4" />
            </svg>
          </Link>
          <Link
            href="/login"
            aria-label="حسابي"
            aria-current="page"
            className={cn(controlClass, "relative text-[hsl(228_40%_14%)]")}
          >
            <svg {...iconProps} className={iconClass}>
              <circle cx="10.5" cy="7.6" r="3.1" />
              <path d="M4.8 17.4c0-3 2.6-4.8 5.7-4.8s5.7 1.8 5.7 4.8" />
            </svg>
            <span aria-hidden="true" className="absolute bottom-1.5 h-px w-[19px] bg-gold-500 lg:bottom-0 lg:w-full" />
          </Link>
        </div>
      </header>
      <MenuDrawer isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}
