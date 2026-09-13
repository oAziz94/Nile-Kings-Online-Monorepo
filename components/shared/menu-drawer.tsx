"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { X, ChevronDown, ChevronUp, ChevronLeft, Facebook, MessageCircle, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MENU_SECTIONS, type MenuSection } from "@/lib/menu-config";
import { cn } from "@/lib/utils";

/**
 * The shared mobile/desktop drawer — rebuilt for backlog 6.1 against `design-canvas/account`'s
 * `MobileDrawer.dc.html`/`MobileDrawerOut.dc.html` (categories stay in the burger on every
 * width per `04-decisions.md` 2026-09-13 "categories stay in the burger on desktop"). Same
 * `isOpen`/`onClose` contract, same `/api/menu` fetch + `MENU_SECTIONS` fallback, same
 * env-driven contact links as before this task. New: a user card (or login/register) built from
 * `/api/auth/me` + `/api/profile/orders/summary`, a search box, current-pathname highlighting on
 * category children, three account links, and the partner panel restyled to the artboard.
 */

type NavbarUser = { name: string | null; phone: string } | null;
type OrderSummary = { openCount: number; orderCount: number; addressCount: number } | null;

async function fetchMenuSections(): Promise<MenuSection[]> {
  const res = await fetch("/api/menu", { cache: "no-store" });
  const json = await res.json();
  if (json?.success && Array.isArray(json?.data?.sections)) return json.data.sections;
  return MENU_SECTIONS;
}

type MenuDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  /** Opt-in: focuses the search box the moment the drawer opens (the navbar's mobile search
   * icon uses this — backlog 6.1). */
  focusSearch?: boolean;
};

function MenuAccordionSection({
  section,
  isExpanded,
  onToggle,
  onClose,
  pathname,
}: {
  section: MenuSection;
  isExpanded: boolean;
  onToggle: () => void;
  onClose: () => void;
  pathname: string;
}) {
  const id = `menu-accordion-${section.id}`;
  return (
    <div className="border-b border-[hsl(228_16%_86%)] last:border-b-0">
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-controls={id}
        id={`${id}-trigger`}
        onClick={onToggle}
        className={cn(
          "flex w-full items-center justify-between gap-3 py-4 text-right font-amiri text-xl font-bold text-[hsl(228_40%_14%)]",
          "outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2"
        )}
      >
        <span>{section.labelAr}</span>
        <span className="shrink-0 text-[hsl(228_18%_50%)]" aria-hidden>
          {isExpanded ? (
            <ChevronUp className="h-[18px] w-[18px]" strokeWidth={1.5} />
          ) : (
            <ChevronDown className="h-[18px] w-[18px]" strokeWidth={1.5} />
          )}
        </span>
      </button>
      <div
        id={id}
        role="region"
        aria-labelledby={`${id}-trigger`}
        className={cn(
          "overflow-hidden transition-[grid-template-rows] duration-200 ease-out",
          isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
        style={{ display: "grid" }}
      >
        <div className="min-h-0">
          <ul className="flex flex-col gap-0.5 pb-3">
            {section.children.map((item) => {
              let itemPath = item.href;
              try {
                itemPath = new URL(item.href, "http://x").pathname;
              } catch {
                // href already a bare path
              }
              const isCurrent = itemPath === pathname;
              return (
                <li key={item.href + item.labelAr}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      "block border-s py-2 pe-0 ps-3 text-[15px] transition-colors",
                      isCurrent
                        ? "border-s-gold-500 text-[hsl(228_40%_14%)]"
                        : "border-s-transparent text-[hsl(228_18%_45%)] hover:text-[hsl(228_40%_14%)]"
                    )}
                  >
                    {item.labelAr}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

const ACCOUNT_LINKS = [
  {
    href: "/profile/orders",
    label: "طلباتي",
    icon: (
      <>
        <path d="M3.5 7l7-3.5 7 3.5v7l-7 3.5-7-3.5z" />
        <path d="M3.5 7l7 3.5 7-3.5M10.5 10.5v7" />
      </>
    ),
  },
  {
    href: "/profile/addresses",
    label: "عناويني",
    icon: (
      <>
        <path d="M10.5 18s-5.5-5-5.5-9a5.5 5.5 0 0 1 11 0c0 4-5.5 9-5.5 9z" />
        <circle cx="10.5" cy="9" r="2" />
      </>
    ),
  },
  {
    href: "/profile/account",
    label: "حسابي",
    icon: (
      <>
        <circle cx="10.5" cy="7.6" r="3.1" />
        <path d="M4.8 17.4c0-3 2.6-4.8 5.7-4.8s5.7 1.8 5.7 4.8" />
      </>
    ),
  },
];

const drawerIconProps = {
  viewBox: "0 0 21 21",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.3,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
};

export function MenuDrawer({ isOpen, onClose, focusSearch = false }: MenuDrawerProps) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [sections, setSections] = React.useState<MenuSection[]>(MENU_SECTIONS);
  const [user, setUser] = React.useState<NavbarUser>(null);
  const [summary, setSummary] = React.useState<OrderSummary>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const toggleSection = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  React.useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetchMenuSections().then((data) => {
      if (!cancelled) setSections(data);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetch("/api/auth/me", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) {
          if (!cancelled) setUser(null);
          return;
        }
        const data = await res.json();
        if (!cancelled) setUser({ name: data.data?.name ?? null, phone: data.data?.phone ?? "" });
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen || !user) return;
    let cancelled = false;
    fetch("/api/profile/orders/summary", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.success) setSummary(data.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOpen, user]);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  React.useEffect(() => {
    if (!isOpen) {
      setExpandedId(null);
      setSearchQuery("");
    }
  }, [isOpen]);

  React.useEffect(() => {
    if (isOpen && focusSearch) {
      const handle = window.setTimeout(() => searchInputRef.current?.focus(), 50);
      return () => window.clearTimeout(handle);
    }
  }, [isOpen, focusSearch]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
    setSummary(null);
    onClose();
    router.refresh();
  }

  function handleSearchSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = searchQuery.trim();
    onClose();
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  if (!isOpen) return null;

  const greeting = (() => {
    const trimmed = user?.name?.trim();
    if (trimmed) return trimmed.split(/\s+/)[0];
    return user?.phone ?? "";
  })();
  const initial = user?.name?.trim() ? user.name.trim()[0] : "؟";

  return (
    <>
      <div
        className="fixed inset-0 z-[110] bg-[rgba(21,26,53,.45)] transition-opacity duration-300"
        aria-hidden
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="القائمة"
        className={cn(
          "fixed top-0 bottom-0 z-[110] flex flex-col",
          "w-[calc(100vw-52px)] lg:w-[420px]",
          "bg-papyrus shadow-[24px_0_48px_-24px_rgba(21,26,53,.5)]",
          "inset-inline-start-0",
          "animate-in slide-in-from-right duration-300 ease-out"
        )}
        dir="rtl"
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[hsl(228_16%_86%)] px-4 py-2.5">
          <Image src="/brand/logo-lapis.png" alt="قطن ملوك النيل" width={200} height={125} className="h-10 w-auto" />
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="إغلاق القائمة"
            className="h-11 w-11 rounded-full text-[hsl(228_30%_22%)]/80 hover:text-[hsl(228_40%_14%)]"
          >
            <X className="h-[22px] w-[22px]" strokeWidth={1.5} />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {user ? (
            <Link
              href="/profile/account"
              onClick={onClose}
              className="flex items-center gap-3 border-b border-[hsl(228_16%_86%)] bg-white px-5 py-4"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-gold-500 font-amiri text-lg text-[hsl(228_40%_14%)]">
                {initial}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <b className="truncate text-[14.5px] font-medium text-[hsl(228_40%_14%)]">أهلًا، {greeting}</b>
                <span className="text-[12.5px] text-[hsl(228_18%_50%)]">
                  {summary ? (
                    <>
                      <span className="font-archivo" dir="ltr">
                        {summary.openCount}
                      </span>{" "}
                      طلبات جارية ·{" "}
                      <span className="font-archivo" dir="ltr">
                        {summary.addressCount}
                      </span>{" "}
                      عناوين
                    </>
                  ) : (
                    "عرض الحساب"
                  )}
                </span>
              </span>
              <ChevronLeft className="h-[18px] w-[18px] shrink-0 text-[hsl(228_18%_50%)]" strokeWidth={1.5} aria-hidden />
            </Link>
          ) : (
            <div className="flex gap-2.5 border-b border-[hsl(228_16%_86%)] px-5 py-4">
              <Button asChild size="sm" className="flex-1">
                <Link href="/login" onClick={onClose}>
                  تسجيل الدخول
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="flex-1">
                <Link href="/register" onClick={onClose}>
                  حساب جديد
                </Link>
              </Button>
            </div>
          )}

          <div className="px-5 pt-4">
            <form role="search" onSubmit={handleSearchSubmit}>
              <label htmlFor="drawer-search" className="sr-only">
                ابحث عن منتج
              </label>
              <div className="flex h-11 items-center gap-2 border border-[hsl(228_16%_84%)] px-3.5 text-[13.5px] text-[hsl(228_18%_50%)] focus-within:border-gold-500">
                <svg {...drawerIconProps} className="block h-[18px] w-[18px] shrink-0">
                  <circle cx="9.5" cy="9.5" r="5.5" />
                  <path d="M17.5 17.5l-4.1-4.1" />
                </svg>
                <input
                  id="drawer-search"
                  ref={searchInputRef}
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ابحث عن منتج…"
                  className="w-full bg-transparent text-[hsl(228_30%_22%)] outline-none placeholder:text-[hsl(228_18%_55%)]"
                />
              </div>
            </form>
          </div>

          <div className="px-5">
            <nav aria-label="تصنيفات المتجر" className="mt-2">
              {sections.map((section) => (
                <MenuAccordionSection
                  key={section.id}
                  section={section}
                  isExpanded={expandedId === section.id}
                  onToggle={() => toggleSection(section.id)}
                  onClose={onClose}
                  pathname={pathname}
                />
              ))}
              <Link
                href="/products?sort=best_sales"
                onClick={onClose}
                className="flex items-center justify-between border-b border-[hsl(228_16%_86%)] py-4 font-amiri text-xl font-bold text-[hsl(228_40%_14%)]"
              >
                الأكثر مبيعًا
                <ChevronLeft className="h-[18px] w-[18px] text-[hsl(228_18%_50%)]" strokeWidth={1.5} aria-hidden />
              </Link>
            </nav>

            {user ? (
              <div className="pt-2">
                {ACCOUNT_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={onClose}
                    className="flex items-center gap-3 py-3 text-[15px] text-[hsl(228_40%_14%)]"
                  >
                    <svg {...drawerIconProps} className="block h-[18px] w-[18px] shrink-0">
                      {link.icon}
                    </svg>
                    {link.label}
                  </Link>
                ))}
              </div>
            ) : null}

            <div className="mt-3 flex flex-col border-t border-[hsl(228_16%_86%)] pt-3">
              <a
                href={
                  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER
                    ? `https://wa.me/${(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "").replace(/\D/g, "")}`
                    : "#"
                }
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClose}
                className="flex items-center gap-3 py-2.5 text-sm text-[hsl(228_30%_22%)]/80 transition-colors hover:text-[hsl(228_40%_14%)]"
                aria-label="تواصل معنا على واتساب"
              >
                <MessageCircle className="h-[18px] w-[18px] shrink-0" strokeWidth={1.5} />
                تواصل معنا على واتساب
              </a>
              <a
                href={
                  process.env.NEXT_PUBLIC_CUSTOMER_SERVICE_PHONE
                    ? `tel:${(process.env.NEXT_PUBLIC_CUSTOMER_SERVICE_PHONE ?? "").replace(/\D/g, "")}`
                    : "#"
                }
                onClick={onClose}
                className="flex items-center gap-3 py-2.5 text-sm text-[hsl(228_30%_22%)]/80 transition-colors hover:text-[hsl(228_40%_14%)]"
                aria-label="خدمة عملاء - اتصل بنا"
              >
                <Phone className="h-[18px] w-[18px] shrink-0" strokeWidth={1.5} />
                خدمة العملاء
              </a>
              <a
                href={process.env.NEXT_PUBLIC_FACEBOOK_URL ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClose}
                className="flex items-center gap-3 py-2.5 text-sm text-[hsl(228_30%_22%)]/80 transition-colors hover:text-[hsl(228_40%_14%)]"
                aria-label="تابعنا على فيسبوك"
              >
                <Facebook className="h-[18px] w-[18px] shrink-0" strokeWidth={1.5} />
                تابعنا على فيسبوك
              </a>
            </div>

            <div className="my-4 border border-[hsl(228_16%_86%)] bg-white p-4">
              <p className="mb-1 text-sm font-medium text-[hsl(228_40%_14%)]">كن شريكًا لملوك النيل</p>
              <p className="mb-3 text-xs text-[hsl(228_18%_50%)]">وكيل أو موزع أونلاين — سجّل طلبك في دقيقة.</p>
              <div className="flex gap-2">
                <Button asChild variant="outline" size="sm" className="flex-1 rounded-none">
                  <Link href="/partners?type=agent" onClick={onClose}>
                    وكيل
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="flex-1 rounded-none">
                  <Link href="/partners?type=distributor" onClick={onClose}>
                    موزع
                  </Link>
                </Button>
              </div>
            </div>

            {user ? (
              <button
                type="button"
                onClick={handleLogout}
                className="mb-7 flex items-center gap-3 text-sm text-[hsl(228_30%_22%)]/70"
              >
                <svg {...drawerIconProps} className="block h-[18px] w-[18px] shrink-0">
                  <path d="M8 17.5H4.5v-14H8" />
                  <path d="M13 14l3.5-3.5L13 7M16.5 10.5H8" />
                </svg>
                تسجيل الخروج
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
