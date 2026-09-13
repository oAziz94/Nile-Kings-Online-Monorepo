"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { createPortal } from "react-dom";
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
import { usePartnerMe, type PartnerType } from "@/hooks/use-partner-me";
import {
  PARTNER_ACCOUNT_NAV,
  PARTNER_MOBILE_TABS,
  getPartnerNavForRole,
  type PartnerNavSection,
} from "@/components/partner/partner-nav-config";
import { PartnerAlertsBell } from "@/components/partner/partner-alerts-bell";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  SidebarCollapseButton,
  SidebarCollapseScript,
  SidebarCollapseTooltip,
  useSidebarCollapsed,
} from "@/components/dashboard/sidebar-collapse";

/**
 * Partner shell v2 (backlog 5.1) rebuilt to `design-canvas/partner-v2/Main.dc.html`'s
 * light SaaS shell — a **different visual language** from the v1 dark-lapis rail: white
 * 248px sidebar on a stone-50 ground, 1px stone-200 right border, soft `lapis-50` active
 * pill with lapis-800 text, white topbar, mobile top bar + bottom tab bar
 * (اليوم · الطلبات · المخزون · التقارير) below `lg` with the sidebar becoming the
 * existing `Sheet` drawer for anything not on the tab bar.
 *
 * Carries over from v1 (4.16): the loading/error nav states (never assume a role while
 * `usePartnerMe()` is loading — skeleton first, alert+retry on failure), the alerts bell,
 * `data-partner-chrome` + `print:hidden` on every chrome region.
 */

/**
 * Topbar slot (backlog 5.6a) — a page-level portal target next to the alerts bell, used by
 * the reports pages for the report-switcher chips (المبيعات · التجهيز · المخزون · الشبكة ·
 * المال). `PartnerTopbarSlot` renders into whichever `PartnerShell` instance is mounted;
 * pages that don't need it simply never render it, leaving the topbar unchanged.
 */
const PartnerTopbarSlotContext = React.createContext<HTMLDivElement | null>(null);

export function PartnerTopbarSlot({ children }: { children: React.ReactNode }) {
  const target = React.useContext(PartnerTopbarSlotContext);
  if (!target) return null;
  return createPortal(children, target);
}

function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "؟";
  return trimmed.slice(0, 2);
}

function partnerTypeLabel(type: PartnerType): string {
  return type === "DISTRIBUTOR" ? "موزع" : "وكيل";
}

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/partner") return pathname === "/partner";
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

/**
 * Backlog 7.1 — `collapsed` (real state, desktop only) gates the Tooltip wrapper so the
 * expanded rail never mounts tooltip machinery; `itemClassName`/`captionClassName`/
 * `labelClassName` (CSS-only, `sidebar-collapsed:` variant) are only passed by the desktop
 * aside — the mobile drawer calls this with none of them, so it never receives the narrow
 * styling even if `<html data-sidebar-collapsed>` happens to be stale from a desktop visit.
 */
function NavSections({
  sections,
  pathname,
  onNavigate,
  collapsed = false,
  itemClassName,
  captionClassName,
  labelClassName,
}: {
  sections: PartnerNavSection[];
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
            return (
              <SidebarCollapseTooltip key={item.href} active={collapsed} label={item.label}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(NAV_ITEM_BASE, active ? NAV_ITEM_ACTIVE : NAV_ITEM_INACTIVE, itemClassName)}
                >
                  <Icon className="h-[17px] w-[17px] shrink-0" strokeWidth={2} />
                  <span className={labelClassName}>{item.label}</span>
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
        <SidebarCollapseTooltip active={collapsed} label={PARTNER_ACCOUNT_NAV.settingsLabel}>
          <Link
            href={PARTNER_ACCOUNT_NAV.settingsHref}
            onClick={onNavigate}
            aria-current={isActivePath(pathname, PARTNER_ACCOUNT_NAV.settingsHref) ? "page" : undefined}
            className={cn(
              NAV_ITEM_BASE,
              isActivePath(pathname, PARTNER_ACCOUNT_NAV.settingsHref) ? NAV_ITEM_ACTIVE : NAV_ITEM_INACTIVE,
              itemClassName
            )}
          >
            <Settings className="h-[17px] w-[17px] shrink-0" strokeWidth={2} />
            <span className={labelClassName}>{PARTNER_ACCOUNT_NAV.settingsLabel}</span>
          </Link>
        </SidebarCollapseTooltip>
        <SidebarCollapseTooltip active={collapsed} label={PARTNER_ACCOUNT_NAV.storeLabel}>
          <Link href={PARTNER_ACCOUNT_NAV.storeHref} onClick={onNavigate} className={cn(NAV_ITEM_BASE, NAV_ITEM_INACTIVE, itemClassName)}>
            <Store className="h-[17px] w-[17px] shrink-0" strokeWidth={2} />
            <span className={labelClassName}>{PARTNER_ACCOUNT_NAV.storeLabel}</span>
          </Link>
        </SidebarCollapseTooltip>
        <SidebarCollapseTooltip active={collapsed} label={PARTNER_ACCOUNT_NAV.logoutLabel}>
          <button type="button" onClick={logout} className={cn(NAV_ITEM_BASE, NAV_ITEM_INACTIVE, "w-full", itemClassName)}>
            <LogOut className="h-[17px] w-[17px] shrink-0" strokeWidth={2} />
            <span className={labelClassName}>{PARTNER_ACCOUNT_NAV.logoutLabel}</span>
          </button>
        </SidebarCollapseTooltip>
      </div>
    </div>
  );
}

function MobileBottomTabBar({ pathname }: { pathname: string }) {
  return (
    <nav
      data-partner-chrome
      aria-label="التنقل السريع"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-stone-200 bg-white px-2 pb-[max(theme(spacing.2),env(safe-area-inset-bottom))] pt-2 print:hidden lg:hidden"
    >
      {PARTNER_MOBILE_TABS.map((tab) => {
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

export function PartnerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const { data: partner, isLoading, isError, refetch } = usePartnerMe();
  const [topbarSlotEl, setTopbarSlotEl] = React.useState<HTMLDivElement | null>(null);

  React.useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const sections = partner ? getPartnerNavForRole(partner.partnerType) : null;
  const displayName = partner?.name?.trim() || "شريك";
  const { collapsed, toggle } = useSidebarCollapsed();

  const drawerNavBody = isLoading ? (
    <NavSkeleton />
  ) : isError || !sections ? (
    <NavError onRetry={() => refetch()} />
  ) : (
    <NavSections sections={sections} pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
  );

  const desktopNavBody = isLoading ? (
    <NavSkeleton />
  ) : isError || !sections ? (
    <NavError onRetry={() => refetch()} />
  ) : (
    <NavSections
      sections={sections}
      pathname={pathname}
      collapsed={collapsed}
      itemClassName="sidebar-collapsed:justify-center sidebar-collapsed:px-0 sidebar-collapsed:h-10 sidebar-collapsed:w-10 sidebar-collapsed:mx-auto"
      captionClassName="sidebar-collapsed:hidden"
      labelClassName="sidebar-collapsed:hidden"
    />
  );

  return (
    <PartnerTopbarSlotContext.Provider value={topbarSlotEl}>
    <TooltipProvider delayDuration={150}>
    <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
    <div className="flex min-h-screen flex-col bg-stone-50 lg:flex-row" dir="rtl">
      <SidebarCollapseScript />
      {/* Mobile/tablet top bar (<lg) */}
      <header data-partner-chrome className="sticky top-0 z-40 flex shrink-0 items-center gap-3 border-b border-stone-200 bg-white px-4 py-3 print:hidden lg:hidden">
        <SheetTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-full border border-stone-200"
            aria-label="فتح قائمة لوحة الشريك"
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
        <PartnerAlertsBell className="shrink-0 rounded-full border border-stone-200" />
      </header>

      <SheetContent side="right" className="w-[min(18rem,88vw)] bg-white p-0 lg:hidden">
        <SheetHeader className="border-b border-stone-200 bg-white px-4">
          <SheetTitle className="font-cairo text-base text-ink">قائمة الشريك</SheetTitle>
          <SheetCloseButton />
        </SheetHeader>
        <nav className="flex-1 overflow-y-auto p-3" aria-label="التنقل في لوحة الشريك">
          {drawerNavBody}
        </nav>
      </SheetContent>

      {/* Desktop sidebar (lg+) — 248px, white, stone-200 border, per Main.dc.html.
          Backlog 7.1: collapses to 72px via the sidebar-collapsed: variant (CSS only —
          expanded is today's layout byte-for-byte). */}
      <aside
        data-partner-chrome
        data-testid="dashboard-rail"
        className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col overflow-y-auto border-l border-stone-200 bg-white px-3.5 py-5 print:hidden lg:flex sidebar-collapsed:w-[72px] sidebar-collapsed:px-2"
      >
        <div className="mb-3.5 flex items-center gap-2.5 px-1.5 sidebar-collapsed:justify-center sidebar-collapsed:px-0">
          <Image src="/brand/logo-gold-mark.png" alt="" width={34} height={34} className="h-[34px] w-[34px] shrink-0 object-contain" />
          <div className="min-w-0 sidebar-collapsed:hidden">
            <p className="truncate text-sm font-extrabold leading-tight text-ink">قطن ملوك النيل</p>
            <p className="text-[11px] text-ink-soft">بوابة الشركاء</p>
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
                <p className="truncate text-[11px] text-ink-soft">
                  {partner ? `${partnerTypeLabel(partner.partnerType)} · ${partner.governorate}` : ""}
                </p>
              </>
            )}
          </div>
        </div>
        <nav id="partner-desktop-nav" className="flex-1 overflow-y-auto" aria-label="التنقل في لوحة الشريك">
          {desktopNavBody}
        </nav>
        <div className="mt-auto border-t border-stone-200 pt-3">
          <SidebarCollapseButton collapsed={collapsed} onToggle={toggle} navId="partner-desktop-nav" />
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        {/* Desktop topbar — the middle slot renders whatever the current page portals into it
            (e.g. the reports switcher chips) via `PartnerTopbarSlot`. */}
        <div data-partner-chrome className="hidden items-center justify-between gap-3 border-b border-stone-200 bg-white px-7 py-4 print:hidden lg:flex">
          <div ref={setTopbarSlotEl} className="min-w-0 flex-1 empty:hidden" />
          <div className="flex shrink-0 items-center gap-3">
            <PartnerAlertsBell />
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white text-ink">
              <Store className="h-[18px] w-[18px]" strokeWidth={2} />
            </span>
          </div>
        </div>

        <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden p-4 pb-24 sm:p-6 lg:overflow-auto lg:p-8 lg:pb-8">
          {children}
        </main>
      </div>

      <MobileBottomTabBar pathname={pathname} />
    </div>
    </Sheet>
    </TooltipProvider>
    </PartnerTopbarSlotContext.Provider>
  );
}
