"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Account shell nav — backlog 6.2. Renders the artboard's icon rail on `lg+`
 * (`design-canvas/account/build.mjs`'s `rail()`) and the three-tab row below `lg`
 * (`mobileTabs()`). Both live in this one client component so `ProfileLayout` (the account
 * shell's Server Component) never has to render `children` twice — CSS `hidden`/`lg:hidden`
 * removes the inactive variant from the accessibility tree entirely, same convention the
 * pre-redesign nav used.
 *
 * "العرض الخاص" (`/profile/senior`) is deliberately NOT linked — user direction 2026-09-12,
 * "it is not ready yet"; the route still renders for anyone who has the URL. Re-add
 * `{ href: "/profile/senior", ... }` here when it launches.
 *
 * Same active-match rule as before the redesign: exact match, or `pathname.startsWith(href)`
 * (every one of these routes is a leaf, so this only ever matches its own route).
 */
const INK = "#151A35";
const INK_60 = "rgba(21,26,53,.6)";
const INK_80 = "rgba(21,26,53,.8)";
const RULE_SOFT = "rgba(21,26,53,.09)";
const GOLD = "#B8902F";

const iconProps = {
  viewBox: "0 0 21 21",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.3,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
};

function PkgIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps} className={className}>
      <path d="M3.5 7l7-3.5 7 3.5v7l-7 3.5-7-3.5z" />
      <path d="M3.5 7l7 3.5 7-3.5M10.5 10.5v7" />
    </svg>
  );
}
function PinIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps} className={className}>
      <path d="M10.5 18s-5.5-5-5.5-9a5.5 5.5 0 0 1 11 0c0 4-5.5 9-5.5 9z" />
      <circle cx="10.5" cy="9" r="2" />
    </svg>
  );
}
function UserIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps} className={className}>
      <circle cx="10.5" cy="7.6" r="3.1" />
      <path d="M4.8 17.4c0-3 2.6-4.8 5.7-4.8s5.7 1.8 5.7 4.8" />
    </svg>
  );
}
function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps} className={className}>
      <path d="M8 17.5H4.5v-14H8" />
      <path d="M13 14l3.5-3.5L13 7M16.5 10.5H8" />
    </svg>
  );
}

const nav = [
  { href: "/profile/orders", label: "طلباتي", Icon: PkgIcon },
  { href: "/profile/addresses", label: "عناويني", Icon: PinIcon },
  { href: "/profile/account", label: "حسابي", Icon: UserIcon },
];

function isActiveHref(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href);
}

export function ProfileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = React.useState(false);

  const handleLogout = React.useCallback(async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } finally {
      router.refresh();
      router.push("/");
    }
  }, [loggingOut, router]);

  return (
    <>
      {/* Desktop / lg+: the icon rail. */}
      <nav
        aria-label="أقسام حسابي"
        className="hidden flex-col gap-0.5 border-s ps-6 lg:flex"
        style={{ borderColor: "rgba(21,26,53,.16)" }}
      >
        {nav.map((item) => {
          const active = isActiveHref(pathname, item.href);
          const Icon = item.Icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex items-center gap-3 py-2.5 font-plex-arabic text-[15px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
              )}
              style={{ color: active ? INK : INK_80, fontWeight: active ? 500 : 400 }}
            >
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute -inset-y-2.5 start-[-24px] w-0.5"
                  style={{ backgroundColor: GOLD }}
                />
              )}
              <Icon className="h-5 w-5 shrink-0" />
              {item.label}
            </Link>
          );
        })}
        <div className="my-3 h-px" style={{ backgroundColor: RULE_SOFT }} />
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex items-center gap-3 py-2.5 text-start font-plex-arabic text-[15px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 disabled:opacity-60"
          style={{ color: INK_60 }}
        >
          <LogoutIcon className="h-5 w-5 shrink-0" />
          تسجيل الخروج
        </button>
      </nav>

      {/* Phone / below lg: the three-tab row. */}
      <nav aria-label="أقسام حسابي" className="-mx-5 flex border-b px-5 lg:hidden" style={{ borderColor: "rgba(21,26,53,.16)" }}>
        {nav.map((item) => {
          const active = isActiveHref(pathname, item.href);
          const Icon = item.Icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="relative flex h-12 flex-1 items-center justify-center gap-2 font-plex-arabic text-[14px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
              style={{ color: active ? INK : INK_60, fontWeight: active ? 500 : 400 }}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              {item.label}
              {active && (
                <span aria-hidden="true" className="absolute inset-x-2 -bottom-px h-0.5" style={{ backgroundColor: GOLD }} />
              )}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
