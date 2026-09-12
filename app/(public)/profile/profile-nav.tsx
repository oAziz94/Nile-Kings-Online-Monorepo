"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Profile section nav — backlog 4.13. Text links only (no icons), same "gold hairline under the
 * current item" language as `components/shared/site-navbar.tsx`'s `CurrentMark`. Three items:
 * "العرض الخاص" (`/profile/senior`) is deliberately NOT linked — user direction 2026-09-12, "it is
 * not ready yet"; the route still renders for anyone who has the URL, exactly as before the
 * redesign. Re-add `{ href: "/profile/senior", label: "العرض الخاص" }` here when it launches.
 *
 * Same active-match rule as the pre-redesign nav: exact match, or `pathname.startsWith(href)`
 * (every one of these routes is a leaf, so this only ever matches its own route).
 */
const nav = [
  { href: "/profile/orders", label: "طلباتي" },
  { href: "/profile/addresses", label: "عناويني" },
  { href: "/profile/account", label: "حسابي" },
];

function isActiveHref(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href);
}

export function ProfileNav() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop: vertical text-link sidebar. */}
      <nav aria-label="أقسام حسابي" className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {nav.map((item) => {
            const active = isActiveHref(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative inline-block py-2 font-plex-arabic text-[15px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500",
                    active
                      ? "font-medium text-[hsl(228_40%_14%)]"
                      : "text-[hsl(228_40%_14%)]/80 hover:text-[hsl(228_40%_14%)]"
                  )}
                >
                  {item.label}
                  {active && (
                    <span aria-hidden="true" className="absolute inset-x-0 -bottom-0.5 h-px bg-gold-500" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Mobile: horizontally scrolling row of hairline chips. */}
      <nav aria-label="أقسام حسابي" className="-mx-4 overflow-x-auto px-4 lg:hidden">
        <ul className="m-0 flex list-none gap-2 p-0 pb-1">
          {nav.map((item) => {
            const active = isActiveHref(pathname, item.href);
            return (
              <li key={item.href} className="shrink-0">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative block border px-4 py-2 font-plex-arabic text-[13.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500",
                    active
                      ? "border-[hsl(228_40%_14%)] font-medium text-[hsl(228_40%_14%)]"
                      : "border-[hsl(228_16%_84%)] text-[hsl(228_40%_14%)]/80"
                  )}
                >
                  {item.label}
                  {active && (
                    <span aria-hidden="true" className="absolute inset-x-3 bottom-0.5 h-px bg-gold-500" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
