"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { createPortal } from "react-dom";
import type { ComponentType, SVGProps } from "react";
import { AlertTriangle, LogOut, Menu, Settings, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/shared/skeleton";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetCloseButton,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  SidebarCollapseButton,
  SidebarCollapseScript,
  SidebarCollapseTooltip,
  useSidebarCollapsed,
} from "@/components/dashboard/sidebar-collapse";

/**
 * Backlog 9.1 (a) — generic chrome extracted from `components/partner/partner-shell.tsx`
 * (backlog 5.1/7.1). `PartnerShell` is now a thin wrapper passing partner-shaped data into
 * this component; `AdminShell` (9.1 b) is the second consumer. Every partner-facing class,
 * DOM structure, `data-partner-chrome` attribute, aria-label and the `PartnerTopbarSlot`
 * portal are byte-for-byte what they were before this extraction — see 06-admin-v2.md §4
 * rule B2 ("the shell ... [is] shared with partner v2 — no admin-only variants").
 */

export type NavIcon = ComponentType<SVGProps<SVGSVGElement>>;

export type ShellNavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  /** Present + truthy renders one badge element (never two — repositioned via CSS when the
   * rail is collapsed, backlog 7.1's rule carried over from the v1 admin shell). */
  badge?: number;
  /** Formats the accessible name for the badge, e.g. `(n) => \`${n} سؤال بانتظار الرد\`` . */
  badgeLabel?: (count: number) => string;
};

export type ShellNavSection = {
  id: string;
  label: string;
  items: readonly ShellNavItem[];
};

export type ShellAccountNav = {
  /** Omit for a shell whose settings link already lives in the main nav sections (admin) —
   * the account block then shows only المتجر/تسجيل الخروج, per 06-admin-v2.md §4. */
  settingsHref?: string;
  settingsLabel?: string;
  storeHref: string;
  storeLabel: string;
  logoutLabel: string;
};

export type ShellMobileTab = {
  href: string;
  label: string;
  icon: NavIcon;
};

export type ShellIdentity = {
  status: "loading" | "error" | "ready";
  /** Always provided (falls back to a generic label upstream) — only `status` gates the
   * skeleton/error treatment, matching the partner shell's original behaviour. */
  name: string;
  caption: string;
  onRetry: () => void;
};

export type ChromeAttr = "data-partner-chrome" | "data-admin-chrome";

export type DashboardShellProps = {
  brand: { subtitle: string };
  identity: ShellIdentity;
  sections: ShellNavSection[];
  accountNav: ShellAccountNav;
  mobileTabs: readonly ShellMobileTab[];
  drawerTitle: string;
  navAriaLabel: string;
  menuButtonLabel: string;
  /** Rendered at the end (visually first, RTL) of the desktop topbar's right-hand cluster. */
  topbarEnd?: React.ReactNode;
  /** Rendered at the end of the mobile top bar, next to the identity block. Optional — the
   * v1 admin mobile header had nothing there, so omitting it changes nothing for admin. */
  mobileTopbarEnd?: React.ReactNode;
  navId: string;
  chromeAttr: ChromeAttr;
  railTestId?: string;
  children: React.ReactNode;
};

/** Topbar slot (backlog 5.6a) — a page-level portal target next to the topbar's end cluster,
 * used by the reports pages for the report-switcher chips. Generic now: both shells can use
 * the same context/provider machinery; `PartnerTopbarSlot` (partner-shell.tsx) re-exports the
 * same portal under its original name so existing call sites are untouched. */
export const DashboardTopbarSlotContext = React.createContext<HTMLDivElement | null>(null);

export function DashboardTopbarSlot({ children }: { children: React.ReactNode }) {
  const target = React.useContext(DashboardTopbarSlotContext);
  if (!target) return null;
  return createPortal(children, target);
}

function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "؟";
  return trimmed.slice(0, 2);
}

function isActivePath(pathname: string, href: string): boolean {
  if (href.split("/").length <= 2) return pathname === href; // e.g. "/partner", "/admin"
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavSkeleton() {
  return (
    <div className="space-y-6 px-1 py-2">
      {[0, 1, 2].map((section) => (
        <div key={section} className="space-y-2">
          <Skeleton className="h-3 w-16 rounded" />
          <Skeleton className="h-9 w-full rounded-[10px]" />
          <Skeleton className="h-9 w-full rounded-[10px]" />
        </div>
      ))}
    </div>
  );
}

function NavError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="mx-1 mt-2 rounded-lg border border-carnelian-500/30 bg-danger-bg p-3 text-danger-text">
      <p className="flex items-center gap-2 text-sm font-bold">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        تعذر تحميل بيانات الحساب
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 text-xs font-bold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
      >
        إعادة المحاولة
      </button>
    </div>
  );
}

async function logout() {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  window.location.href = "/login";
}

const NAV_ITEM_BASE =
  "flex items-center gap-2.5 rounded-[10px] px-3 py-[11px] text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500";
const NAV_ITEM_ACTIVE = "bg-lapis-50 text-lapis-800";
const NAV_ITEM_INACTIVE = "text-ink-soft hover:bg-stone-100 hover:text-ink";

function NavSections({
  sections,
  accountNav,
  pathname,
  onNavigate,
  collapsed = false,
  itemClassName,
  captionClassName,
  labelClassName,
}: {
  sections: ShellNavSection[];
  accountNav: ShellAccountNav;
  pathname: string;
  onNavigate?: () => void;
  collapsed?: boolean;
  itemClassName?: string;
  captionClassName?: string;
  labelClassName?: string;
}) {
  return (
    <div className="space-y-1">
      {sections.map((section) => (
        <div key={section.id} className="mb-1">
          <p className={cn("mb-1.5 mt-4 px-2.5 text-[11px] font-bold uppercase tracking-wide text-stone-300", captionClassName)}>
            {section.label}
          </p>
          {section.items.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;
            const badgeCount = item.badge;
            return (
              <SidebarCollapseTooltip key={item.href} active={collapsed} label={item.label}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    NAV_ITEM_BASE,
                    active ? NAV_ITEM_ACTIVE : NAV_ITEM_INACTIVE,
                    // "relative" only for items that can ever carry a badge (config-time,
                    // not the current count) — keeps the partner rail's classes byte-for-byte
                    // unchanged, since no partner nav item ever sets `badgeLabel`.
                    item.badgeLabel !== undefined && "relative",
                    itemClassName
                  )}
                >
                  <Icon className="h-[17px] w-[17px] shrink-0" strokeWidth={2} />
                  <span className={cn(item.badgeLabel !== undefined && "flex-1", labelClassName)}>{item.label}</span>
                  {/* Expanded: an inline pill. Collapsed (sidebar-collapsed:): repositioned to
                      the icon's top-start corner — one element, same aria-label, never two
                      elements sharing an accessible name (06-admin-v2.md §4). */}
                  {Boolean(badgeCount) && (
                    <span
                      className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gold-500 px-1.5 text-[11px] font-extrabold text-lapis-900 sidebar-collapsed:absolute sidebar-collapsed:-top-1 sidebar-collapsed:inset-inline-start-1 sidebar-collapsed:h-3.5 sidebar-collapsed:min-w-3.5 sidebar-collapsed:px-0.5 sidebar-collapsed:text-[8px]"
                      aria-label={item.badgeLabel ? item.badgeLabel(badgeCount!) : String(badgeCount)}
                    >
                      {badgeCount}
                    </span>
                  )}
                </Link>
              </SidebarCollapseTooltip>
            );
          })}
        </div>
      ))}
      <div className="mt-4 border-t border-stone-200 pt-3">
        <p className={cn("mb-1.5 px-2.5 text-[11px] font-bold uppercase tracking-wide text-stone-300", captionClassName)}>
          الحساب
        </p>
        {accountNav.settingsHref && accountNav.settingsLabel && (
          <SidebarCollapseTooltip active={collapsed} label={accountNav.settingsLabel}>
            <Link
              href={accountNav.settingsHref}
              onClick={onNavigate}
              aria-current={isActivePath(pathname, accountNav.settingsHref) ? "page" : undefined}
              className={cn(
                NAV_ITEM_BASE,
                isActivePath(pathname, accountNav.settingsHref) ? NAV_ITEM_ACTIVE : NAV_ITEM_INACTIVE,
                itemClassName
              )}
            >
              <Settings className="h-[17px] w-[17px] shrink-0" strokeWidth={2} />
              <span className={labelClassName}>{accountNav.settingsLabel}</span>
            </Link>
          </SidebarCollapseTooltip>
        )}
        <SidebarCollapseTooltip active={collapsed} label={accountNav.storeLabel}>
          <Link href={accountNav.storeHref} onClick={onNavigate} className={cn(NAV_ITEM_BASE, NAV_ITEM_INACTIVE, itemClassName)}>
            <Store className="h-[17px] w-[17px] shrink-0" strokeWidth={2} />
            <span className={labelClassName}>{accountNav.storeLabel}</span>
          </Link>
        </SidebarCollapseTooltip>
        <SidebarCollapseTooltip active={collapsed} label={accountNav.logoutLabel}>
          <button type="button" onClick={logout} className={cn(NAV_ITEM_BASE, NAV_ITEM_INACTIVE, "w-full", itemClassName)}>
            <LogOut className="h-[17px] w-[17px] shrink-0" strokeWidth={2} />
            <span className={labelClassName}>{accountNav.logoutLabel}</span>
          </button>
        </SidebarCollapseTooltip>
      </div>
    </div>
  );
}

function MobileBottomTabBar({
  pathname,
  mobileTabs,
  chromeAttr,
}: {
  pathname: string;
  mobileTabs: readonly ShellMobileTab[];
  chromeAttr: ChromeAttr;
}) {
  return (
    <nav
      {...{ [chromeAttr]: true }}
      aria-label="التنقل السريع"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-stone-200 bg-white px-2 pb-[max(theme(spacing.2),env(safe-area-inset-bottom))] pt-2 print:hidden lg:hidden"
    >
      {mobileTabs.map((tab) => {
        const active = isActivePath(pathname, tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-[10px] py-1.5 text-[11px] font-bold",
              active ? "bg-lapis-50 text-lapis-800" : "text-ink-soft"
            )}
          >
            <Icon className="h-5 w-5" strokeWidth={2} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function DashboardShell({
  brand,
  identity,
  sections,
  accountNav,
  mobileTabs,
  drawerTitle,
  navAriaLabel,
  menuButtonLabel,
  topbarEnd,
  mobileTopbarEnd,
  navId,
  chromeAttr,
  railTestId = "dashboard-rail",
  children,
}: DashboardShellProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [topbarSlotEl, setTopbarSlotEl] = React.useState<HTMLDivElement | null>(null);

  React.useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const isLoading = identity.status === "loading";
  const isError = identity.status === "error";
  const displayName = identity.name;
  const { collapsed, toggle } = useSidebarCollapsed();

  const drawerNavBody = isLoading ? (
    <NavSkeleton />
  ) : isError ? (
    <NavError onRetry={identity.onRetry} />
  ) : (
    <NavSections sections={sections} accountNav={accountNav} pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
  );

  const desktopNavBody = isLoading ? (
    <NavSkeleton />
  ) : isError ? (
    <NavError onRetry={identity.onRetry} />
  ) : (
    <NavSections
      sections={sections}
      accountNav={accountNav}
      pathname={pathname}
      collapsed={collapsed}
      itemClassName="sidebar-collapsed:justify-center sidebar-collapsed:px-0 sidebar-collapsed:h-10 sidebar-collapsed:w-10 sidebar-collapsed:mx-auto"
      captionClassName="sidebar-collapsed:hidden"
      labelClassName="sidebar-collapsed:hidden"
    />
  );

  return (
    <DashboardTopbarSlotContext.Provider value={topbarSlotEl}>
    <TooltipProvider delayDuration={150}>
    <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
    <div className="flex min-h-screen flex-col bg-stone-50 lg:flex-row" dir="rtl">
      <SidebarCollapseScript />
      {/* Mobile/tablet top bar (<lg) */}
      <header {...{ [chromeAttr]: true }} className="sticky top-0 z-40 flex shrink-0 items-center gap-3 border-b border-stone-200 bg-white px-4 py-3 print:hidden lg:hidden">
        <SheetTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-full border border-stone-200"
            aria-label={menuButtonLabel}
          >
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <Image src="/brand/logo-gold-mark.png" alt="نايل كينجز" width={24} height={24} className="h-6 w-6" />
        <div className="min-w-0 flex-1">
          {isLoading ? (
            <Skeleton className="h-4 w-24 rounded" />
          ) : (
            <p className="truncate text-sm font-bold text-ink">{displayName}</p>
          )}
        </div>
        {mobileTopbarEnd}
      </header>

      <SheetContent side="right" className="w-[min(18rem,88vw)] bg-white p-0 lg:hidden">
        <SheetHeader className="border-b border-stone-200 bg-white px-4">
          <SheetTitle className="font-cairo text-base text-ink">{drawerTitle}</SheetTitle>
          <SheetCloseButton />
        </SheetHeader>
        <nav className="flex-1 overflow-y-auto p-3" aria-label={navAriaLabel}>
          {drawerNavBody}
        </nav>
      </SheetContent>

      {/* Desktop sidebar (lg+) — 248px, white, stone-200 border, per Main.dc.html.
          Backlog 7.1: collapses to 72px via the sidebar-collapsed: variant (CSS only —
          expanded is today's layout byte-for-byte). */}
      <aside
        {...{ [chromeAttr]: true }}
        data-testid={railTestId}
        className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col overflow-y-auto border-l border-stone-200 bg-white px-3.5 py-5 print:hidden lg:flex sidebar-collapsed:w-[72px] sidebar-collapsed:px-2"
      >
        <div className="mb-3.5 flex items-center gap-2.5 px-1.5 sidebar-collapsed:justify-center sidebar-collapsed:px-0">
          <Image src="/brand/logo-gold-mark.png" alt="" width={34} height={34} className="h-[34px] w-[34px] shrink-0 object-contain" />
          <div className="min-w-0 sidebar-collapsed:hidden">
            <p className="truncate text-sm font-extrabold leading-tight text-ink">قطن ملوك النيل</p>
            <p className="text-[11px] text-ink-soft">{brand.subtitle}</p>
          </div>
        </div>
        <div className="mb-2 flex items-center gap-2.5 rounded-xl bg-stone-50 px-3 py-2.5 sidebar-collapsed:justify-center sidebar-collapsed:bg-transparent sidebar-collapsed:px-0 sidebar-collapsed:py-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-lapis-800 text-[13px] font-extrabold text-gold-500">
            {isLoading ? "" : initials(displayName)}
          </div>
          <div className="min-w-0 flex-1 sidebar-collapsed:hidden">
            {isLoading ? (
              <>
                <Skeleton className="h-4 w-28 rounded" />
                <Skeleton className="mt-2 h-3 w-20 rounded" />
              </>
            ) : (
              <>
                <p className="truncate text-[13px] font-extrabold text-ink">{displayName}</p>
                <p className="truncate text-[11px] text-ink-soft">{identity.caption}</p>
              </>
            )}
          </div>
        </div>
        <nav id={navId} className="flex-1 overflow-y-auto" aria-label={navAriaLabel}>
          {desktopNavBody}
        </nav>
        <div className="mt-auto border-t border-stone-200 pt-3">
          <SidebarCollapseButton collapsed={collapsed} onToggle={toggle} navId={navId} />
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        {/* Desktop topbar — the middle slot renders whatever the current page portals into it
            (e.g. the reports switcher chips) via `DashboardTopbarSlot`. */}
        <div {...{ [chromeAttr]: true }} className="hidden items-center justify-between gap-3 border-b border-stone-200 bg-white px-7 py-4 print:hidden lg:flex">
          <div ref={setTopbarSlotEl} className="min-w-0 flex-1 empty:hidden" />
          <div className="flex shrink-0 items-center gap-3">
            {topbarEnd}
          </div>
        </div>

        <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden p-4 pb-24 sm:p-6 lg:overflow-auto lg:p-8 lg:pb-8">
          {children}
        </main>
      </div>

      <MobileBottomTabBar pathname={pathname} mobileTabs={mobileTabs} chromeAttr={chromeAttr} />
    </div>
    </Sheet>
    </TooltipProvider>
    </DashboardTopbarSlotContext.Provider>
  );
}
