"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { MenuDrawer } from "@/components/shared/menu-drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * The site navbar in its v2 form — the one identity bar every surface shares. Mounted by both the
 * (auth) route group (login / register / forgot-password) and, since backlog 4.6, the (public)
 * route group (via `components/shared/public-site-navbar.tsx`), which replaced the pre-redesign
 * `components/shared/header.tsx` (deleted). Nothing in here is auth-specific except the `current`
 * prop, and the storefront-only additions below are all opt-in.
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
 *
 * Backlog 4.6 (Public storefront shell) extends this component with what the storefront needs
 * and (auth) doesn't, both strictly additive/opt-in so (auth)'s existing rendering never changes:
 * - `cartCount` — a live badge (Archivo numeral, ink pill, hidden at 0). Supplied by the caller,
 *   never read from `useCart()` in here, because this component also mounts inside `(auth)`,
 *   where `CartProvider` is not in the tree — reading the context here would throw there.
 * - `accountMenu` — when true, the account control becomes real: logged-out renders the same
 *   `/login` link, logged-in fetches `/api/auth/me` and swaps it for a `DropdownMenu` matching
 *   the pre-redesign `Header`'s items/hrefs (حسابي → /profile/account, طلباتي → /profile/orders,
 *   عناويني → /profile/addresses, تسجيل الخروج → POST /api/auth/logout + router.refresh()).
 *   Defaults to false so `(auth)` keeps rendering the plain `/login` link unchanged.
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

function controlClass(isCurrent: boolean, onDark = false): string {
  if (onDark) return cn(controlBase, "text-papyrus/90 hover:text-papyrus");
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

/** Ink pill cart-count badge — Archivo numeral, hidden entirely at 0/undefined. */
function CartBadge({ count }: { count?: number }) {
  if (!count || count <= 0) return null;
  return (
    <span
      aria-hidden="true"
      className="absolute -top-0.5 inset-inline-end-0 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[hsl(228_40%_14%)] px-1 font-archivo text-[10px] font-semibold leading-none text-papyrus"
      style={{ direction: "ltr" }}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

type NavbarUser = { name: string | null; phone: string } | null;
type OrderSummary = { openCount: number; orderCount: number; addressCount: number } | null;

/** First whitespace-separated token of the name; falls back to the phone when there's no name
 * (backlog 6.1's "أهلًا، <first name>" greeting rule). */
function greetingFor(user: NavbarUser): string {
  const trimmed = user?.name?.trim();
  if (trimmed) return trimmed.split(/\s+/)[0];
  return user?.phone ?? "";
}

/** Amiri initial for the gold-ringed avatar — first character of the name, or a neutral glyph
 * when there's no name to draw from. */
function initialFor(user: NavbarUser): string {
  const trimmed = user?.name?.trim();
  return trimmed ? trimmed[0] : "؟";
}

export function SiteNavbar({
  current,
  cartCount,
  accountMenu = false,
  search = false,
  sticky = false,
  transparent = false,
  transparentTone = "cream",
}: {
  current?: SiteNavbarSection;
  /** Live cart item count; supplied by the caller (see file header — never read via `useCart()` here). */
  cartCount?: number;
  /** Opt-in: turns the account control into a real logged-in/out control with a dropdown. */
  accountMenu?: boolean;
  /**
   * Opt-in: the product search (inline field on lg+, icon that opens the drawer below). The
   * storefront turns it on; (auth) keeps the identity bar exactly as shipped — user direction
   * 2026-09-13 "hide it on auth, keep the site identity".
   */
  search?: boolean;
  /**
   * `(auth)` composes its own single-screen layout around an `absolute`-positioned bar (default,
   * unchanged). The storefront scrolls real content underneath it, so `(public)` opts into a
   * `fixed` bar that stays put — same 60/84px heights either way.
   */
  sticky?: boolean;
  /**
   * Home only (canvas artboard 1a): the bar starts transparent over the hero photograph — ivory
   * controls and the cream logo on the hero's dark top gradient — and becomes the normal ivory bar
   * once the page scrolls. Every other page keeps the opaque bar.
   */
  transparent?: boolean;
  /**
   * What the marks look like while the bar is transparent. `"cream"` (home): the cream logo and
   * ivory controls, for a dark photograph under the bar. `"ink"` (auth, user direction
   * 2026-09-12 "the auth page should have the same transparent navbar"): the lapis logo and ink
   * controls with no ground and no rule, for the auth surface's light cotton photograph and ivory
   * ground — the cream marks would vanish on the ivory half there.
   */
  transparentTone?: "cream" | "ink";
}) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    // Only a bar that stays in the viewport (`sticky`) turns opaque on scroll; an `absolute` bar
    // scrolls away with the page and simply stays transparent.
    if (!transparent || !sticky) return;
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [transparent, sticky]);
  const isTransparent = transparent && !scrolled;
  const onDark = isTransparent && transparentTone === "cream";
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerFocusSearch, setDrawerFocusSearch] = useState(false);
  const [user, setUser] = useState<NavbarUser>(null);
  const [summary, setSummary] = useState<OrderSummary>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();
  const fetchedRef = useRef(false);
  const summaryFetchedRef = useRef(false);

  useEffect(() => {
    if (!accountMenu || fetchedRef.current) return;
    fetchedRef.current = true;
    fetch("/api/auth/me", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) {
          setUser(null);
          return;
        }
        const data = await res.json();
        setUser({ name: data.data?.name ?? null, phone: data.data?.phone ?? "" });
      })
      .catch(() => setUser(null));
  }, [accountMenu]);

  // The open-order count only makes sense for a real, logged-in customer, and only when the
  // account menu is actually rendered — no point paying for the round trip on (auth).
  useEffect(() => {
    if (!accountMenu || !user || summaryFetchedRef.current) return;
    summaryFetchedRef.current = true;
    fetch("/api/profile/orders/summary", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        if (data?.success) setSummary(data.data);
      })
      .catch(() => {});
  }, [accountMenu, user]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
    setSummary(null);
    summaryFetchedRef.current = false;
    setAccountOpen(false);
    router.refresh();
  }

  function handleSearchSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
  }

  function openDrawer(focusSearch: boolean) {
    setDrawerFocusSearch(focusSearch);
    setMenuOpen(true);
  }

  return (
    <>
      <header
        role="banner"
        className={cn(
          sticky ? "fixed" : "absolute",
          "inset-x-0 top-0 z-40 grid h-[60px] grid-cols-[1fr_auto_1fr] items-center border-b px-2 transition-colors duration-300 motion-reduce:transition-none lg:h-[84px] lg:px-8",
          isTransparent ? "border-transparent bg-transparent" : "border-[hsl(40_14%_84%)] bg-papyrus"
        )}
      >
        <div className="flex items-center justify-self-start lg:gap-3">
          <button
            type="button"
            onClick={() => openDrawer(false)}
            aria-label="القائمة"
            aria-expanded={menuOpen}
            className={controlClass(false, onDark)}
          >
            <svg {...iconProps} className={iconClass}>
              <path d="M3.6 6.4h13.8" />
              <path d="M3.6 10.5h13.8" />
              <path d="M3.6 14.6h13.8" />
            </svg>
          </button>

          {search && (
            <>
          {/* Phone: a search icon next to the burger that opens the drawer with its search box
              focused (backlog 6.1a). Desktop gets the real inline field below instead. */}
          <button
            type="button"
            onClick={() => openDrawer(true)}
            aria-label="بحث عن منتج"
            className={cn(controlClass(false, onDark), "lg:hidden")}
          >
            <svg {...iconProps} className={iconClass}>
              <circle cx="9.5" cy="9.5" r="5.5" />
              <path d="M17.5 17.5l-4.1-4.1" />
            </svg>
          </button>

          {/* Desktop `lg+`: the hairline-underlined search field next to the burger. */}
          <form
            role="search"
            onSubmit={handleSearchSubmit}
            className="hidden lg:flex lg:items-center"
          >
            <label htmlFor="navbar-search" className="sr-only">
              ابحث عن منتج
            </label>
            <div
              className={cn(
                "flex h-10 w-[220px] items-center gap-2 border-b px-1 transition-colors",
                // Visible focus: the hairline turns gold and thickens while the input has focus
                // (verifier finding, 6.1) — same language as the drawer's search box.
                "focus-within:border-b-2 focus-within:border-gold-500",
                onDark ? "border-papyrus/40 text-papyrus" : "border-[hsl(228_20%_70%)] text-[hsl(228_30%_22%)]"
              )}
            >
              <svg {...iconProps} className="block h-[18px] w-[18px] shrink-0">
                <circle cx="9.5" cy="9.5" r="5.5" />
                <path d="M17.5 17.5l-4.1-4.1" />
              </svg>
              <input
                id="navbar-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث عن منتج…"
                className={cn(
                  "w-full bg-transparent text-[13.5px] outline-none",
                  onDark ? "placeholder:text-papyrus/60" : "placeholder:text-[hsl(228_18%_55%)]"
                )}
              />
            </div>
          </form>
            </>
          )}
        </div>

        <Link
          href="/"
          aria-label="العودة للمتجر — قطن ملوك النيل"
          className="justify-self-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2 focus-visible:ring-offset-papyrus"
        >
          <Image
            src={onDark ? "/brand/logo-cream.png" : "/brand/logo-lapis.png"}
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
            className={cn(controlClass(current === "wishlist", onDark), "cursor-default")}
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
            className={cn(controlClass(current === "cart", onDark), "relative")}
          >
            <svg {...iconProps} className={iconClass}>
              <path d="M4.8 6.6h11.4l-.9 10.8H5.7z" />
              <path d="M8 6.6V5.2a2.5 2.5 0 0 1 5 0v1.4" />
            </svg>
            <CartBadge count={cartCount} />
            {current === "cart" && <CurrentMark />}
          </Link>

          {accountMenu && user ? (
            <DropdownMenu open={accountOpen} onOpenChange={setAccountOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="حسابي"
                  aria-current={current === "account" ? "page" : undefined}
                  aria-expanded={accountOpen}
                  className={cn(
                    controlClass(current === "account", onDark),
                    "lg:inline-flex lg:w-auto lg:items-center lg:gap-1.5 lg:px-2"
                  )}
                >
                  <svg {...iconProps} className={cn(iconClass, "lg:hidden")}>
                    <circle cx="10.5" cy="7.6" r="3.1" />
                    <path d="M4.8 17.4c0-3 2.6-4.8 5.7-4.8s5.7 1.8 5.7 4.8" />
                  </svg>
                  <span className="hidden text-[13.5px] font-medium lg:inline">
                    أهلًا، {greetingFor(user)}
                  </span>
                  <svg {...iconProps} className="hidden h-[14px] w-[14px] lg:block">
                    <path d="M6 8.5l4.5 4.5L15 8.5" />
                  </svg>
                  {current === "account" && <CurrentMark />}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 rounded-none border-[hsl(228_20%_86%)] p-0">
                <div className="flex items-center gap-3 border-b border-[hsl(228_20%_88%)] px-4 py-3.5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-gold-500 font-amiri text-lg text-[hsl(228_40%_14%)]">
                    {initialFor(user)}
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium text-[hsl(228_26%_24%)]">
                      {user.name?.trim() || "حسابي"}
                    </span>
                    {user.phone ? (
                      <span className="font-archivo text-xs text-muted-foreground" dir="ltr">
                        {user.phone}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="p-1">
                  <DropdownMenuItem asChild>
                    <Link href="/profile/orders" onClick={() => setAccountOpen(false)} className="gap-3">
                      <svg {...iconProps} className="block h-[18px] w-[18px] shrink-0">
                        <path d="M3.5 7l7-3.5 7 3.5v7l-7 3.5-7-3.5z" />
                        <path d="M3.5 7l7 3.5 7-3.5M10.5 10.5v7" />
                      </svg>
                      <span className="flex-1">طلباتي</span>
                      {summary && summary.openCount > 0 ? (
                        <span className="font-archivo text-xs text-muted-foreground" dir="ltr">
                          {summary.openCount}
                        </span>
                      ) : null}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/profile/addresses" onClick={() => setAccountOpen(false)} className="gap-3">
                      <svg {...iconProps} className="block h-[18px] w-[18px] shrink-0">
                        <path d="M10.5 18s-5.5-5-5.5-9a5.5 5.5 0 0 1 11 0c0 4-5.5 9-5.5 9z" />
                        <circle cx="10.5" cy="9" r="2" />
                      </svg>
                      عناويني
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/profile/account" onClick={() => setAccountOpen(false)} className="gap-3">
                      <svg {...iconProps} className="block h-[18px] w-[18px] shrink-0">
                        <circle cx="10.5" cy="7.6" r="3.1" />
                        <path d="M4.8 17.4c0-3 2.6-4.8 5.7-4.8s5.7 1.8 5.7 4.8" />
                      </svg>
                      حسابي
                    </Link>
                  </DropdownMenuItem>
                </div>
                <DropdownMenuSeparator className="mx-0" />
                <div className="p-1">
                  <DropdownMenuItem onClick={handleLogout} className="gap-3">
                    <svg {...iconProps} className="block h-[18px] w-[18px] shrink-0">
                      <path d="M8 17.5H4.5v-14H8" />
                      <path d="M13 14l3.5-3.5L13 7M16.5 10.5H8" />
                    </svg>
                    تسجيل الخروج
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link
              href="/login"
              aria-label="حسابي"
              aria-current={current === "account" ? "page" : undefined}
              className={cn(
                controlClass(current === "account", onDark),
                // The text label is a storefront addition (6.1); (auth) keeps the icon-only
                // identity bar — user direction 2026-09-13 "keep the site identity".
                accountMenu && "lg:inline-flex lg:w-auto lg:items-center lg:gap-1.5 lg:px-2"
              )}
            >
              <svg {...iconProps} className={iconClass}>
                <circle cx="10.5" cy="7.6" r="3.1" />
                <path d="M4.8 17.4c0-3 2.6-4.8 5.7-4.8s5.7 1.8 5.7 4.8" />
              </svg>
              {accountMenu && <span className="hidden text-[13.5px] lg:inline">تسجيل الدخول</span>}
              {current === "account" && <CurrentMark />}
            </Link>
          )}
        </div>
      </header>
      <MenuDrawer
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        focusSearch={drawerFocusSearch}
      />
    </>
  );
}
