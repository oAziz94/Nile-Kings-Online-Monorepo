"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { MenuDrawer } from "@/components/shared/menu-drawer";
import { cn } from "@/lib/utils";

/**
 * The site navbar in its v2 form — the one identity bar that every surface shares. Today it is
 * mounted by the (auth) route group (login / register / forgot-password); the storefront still
 * runs the pre-redesign `components/shared/header.tsx` until its own backlog task swaps it for
 * this component (docs/redesign/04-decisions.md 2026-09-11 "Two site-wide design/architecture
 * notes"). It lives in components/shared/ precisely so that swap is a one-line change, not a
 * rebuild: nothing in here is auth-specific except the `current` prop.
 *
 * Composition (from the reviewed design canvas, refined 2026-09-11 per the user's art-direction
 * brief): a 1fr/auto/1fr grid on the ivory ground — menu control at the inline start, the crown
 * lockup centered (~25% larger than the canvas's 58px), then wishlist / cart / account at the
 * inline end. Hand-drawn 21-unit icons at one 1.3 stroke, no text labels, no English.
 * The section the visitor is in (`current`) gets full-ink weight plus the gold hairline underline;
 * the other controls sit at 78% ink so the "you are here" reads without a badge.
 *
 * The wishlist control is part of the bar's identity per the brief, but the product has no
 * wishlist feature yet — it is rendered inert (`aria-disabled`, no navigation) rather than pointed
 * at a route that doesn't exist. Point it at the real route when that feature ships.
 */

export type SiteNavbarSection = "account" | "cart" | "wishlist";

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

const iconClass = "block h-[22px] w-[22px]";

const controlBase =
  "relative grid h-11 w-11 place-items-center transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2 focus-visible:ring-offset-papyrus";

function controlClass(isCurrent: boolean): string {
  return cn(
    controlBase,
    isCurrent
      ? "text-[hsl(228_40%_14%)]"
      : "text-[hsl(228_30%_22%)]/80 hover:text-[hsl(228_40%_14%)]"
  );
}

/** The gold "you are here" hairline under the current section's icon. */
function CurrentMark() {
  return <span aria-hidden="true" className="absolute inset-x-2.5 bottom-0.5 h-px bg-gold-500" />;
}

export function SiteNavbar({ current }: { current?: SiteNavbarSection }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <header
        role="banner"
        className="absolute inset-x-0 top-0 z-40 grid h-[60px] grid-cols-[1fr_auto_1fr] items-center border-b border-[hsl(40_14%_84%)] bg-papyrus px-2 lg:h-[84px] lg:px-8"
      >
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="القائمة"
          aria-expanded={menuOpen}
          className={cn(controlClass(false), "justify-self-start")}
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
            className="h-[50px] w-auto lg:h-[72px]"
          />
        </Link>

        <div className="flex items-center justify-self-end lg:gap-1.5">
          <button
            type="button"
            aria-label="المفضلة"
            aria-disabled="true"
            className={cn(controlClass(current === "wishlist"), "cursor-default")}
          >
            <svg {...iconProps} className={iconClass}>
              <path d="M10.5 17.6C6.2 14.5 3.2 12 3.2 8.8 3.2 6.6 4.9 5 7 5c1.4 0 2.7.8 3.5 2 .8-1.2 2.1-2 3.5-2 2.1 0 3.8 1.6 3.8 3.8 0 3.2-3 5.7-7.3 8.8z" />
            </svg>
            {current === "wishlist" && <CurrentMark />}
          </button>
          <Link
            href="/cart"
            aria-label="سلة التسوق"
            aria-current={current === "cart" ? "page" : undefined}
            className={controlClass(current === "cart")}
          >
            <svg {...iconProps} className={iconClass}>
              <path d="M4.8 6.6h11.4l-.9 10.8H5.7z" />
              <path d="M8 6.6V5.2a2.5 2.5 0 0 1 5 0v1.4" />
            </svg>
            {current === "cart" && <CurrentMark />}
          </Link>
          <Link
            href="/login"
            aria-label="حسابي"
            aria-current={current === "account" ? "page" : undefined}
            className={controlClass(current === "account")}
          >
            <svg {...iconProps} className={iconClass}>
              <circle cx="10.5" cy="7.6" r="3.1" />
              <path d="M4.8 17.4c0-3 2.6-4.8 5.7-4.8s5.7 1.8 5.7 4.8" />
            </svg>
            {current === "account" && <CurrentMark />}
          </Link>
        </div>
      </header>
      <MenuDrawer isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}
