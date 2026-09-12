"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
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
import { PARTNER_ACCOUNT_NAV, getPartnerNavForRole, type PartnerNavSection } from "@/components/partner/partner-nav-config";
import { PartnerAlertsBell } from "@/components/partner/partner-alerts-bell";
import { cn } from "@/lib/utils";

/**
 * Partner shell (backlog 4.16) rebuilt to the design-canvas dashboard chrome —
 * `docs/redesign/design-canvas/PartnerOrders-Desktop.dc.html`: lapis-900 sidebar (236px,
 * `lg+`) with the crown-only mark, sectioned nav (`partner-nav-config.ts`), gold-on-
 * lapis-700 active item; white topbar; stone-50 content ground. Below `lg` the sidebar
 * collapses to a white top bar + a `Sheet` (`side="right"`) drawer carrying the same nav.
 *
 * Fixes the flagged bug from `00-feature-inventory/partner/dashboard.md` (Edge cases):
 * the old shell defaulted `partnerType === null` to the AGENT nav set, so a distributor
 * could briefly (or permanently, on fetch failure) see agent-only nav items. Now: while
 * `usePartnerMe()` is loading, the nav renders a skeleton (no role assumed either way);
 * on a resolved error, an in-page alert with a retry button replaces the nav entirely.
 */

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
    <div className="space-y-6 px-3 py-2">
      {[0, 1, 2].map((section) => (
        <div key={section} className="space-y-2">
          <Skeleton className="h-3 w-16 rounded" />
          <Skeleton className="h-9 w-full rounded-lg" />
          <Skeleton className="h-9 w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}

function NavError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="mx-3 mt-2 rounded-lg border border-carnelian-500/30 bg-danger-bg p-3 text-danger-text">
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

function NavSections({
  sections,
  pathname,
  onNavigate,
}: {
  sections: PartnerNavSection[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="space-y-1">
      {sections.map((section) => (
        <div key={section.id} className="mb-1">
          <p className="mb-2 mt-4 px-2.5 text-[11px] font-bold uppercase tracking-wide text-[hsl(220_20%_55%)]">
            {section.label}
          </p>
          {section.items.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-[10px] px-3 py-[11px] text-sm font-semibold transition-colors",
                  active
                    ? "bg-lapis-700 text-gold-500"
                    : "text-[hsl(220_25%_72%)] hover:bg-lapis-700/60 hover:text-gold-50",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2 focus-visible:ring-offset-lapis-900"
                )}
              >
                <Icon className="h-[17px] w-[17px] shrink-0" strokeWidth={2} />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
      <div className="mt-4 border-t border-white/10 pt-3">
        <p className="mb-2 px-2.5 text-[11px] font-bold uppercase tracking-wide text-[hsl(220_20%_55%)]">
          الحساب
        </p>
        <Link
          href={PARTNER_ACCOUNT_NAV.settingsHref}
          onClick={onNavigate}
          aria-current={isActivePath(pathname, PARTNER_ACCOUNT_NAV.settingsHref) ? "page" : undefined}
          className={cn(
            "flex items-center gap-2.5 rounded-[10px] px-3 py-[11px] text-sm font-semibold transition-colors",
            isActivePath(pathname, PARTNER_ACCOUNT_NAV.settingsHref)
              ? "bg-lapis-700 text-gold-500"
              : "text-[hsl(220_25%_72%)] hover:bg-lapis-700/60 hover:text-gold-50",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2 focus-visible:ring-offset-lapis-900"
          )}
        >
          <Settings className="h-[17px] w-[17px] shrink-0" strokeWidth={2} />
          {PARTNER_ACCOUNT_NAV.settingsLabel}
        </Link>
        <Link
          href={PARTNER_ACCOUNT_NAV.storeHref}
          onClick={onNavigate}
          className="flex items-center gap-2.5 rounded-[10px] px-3 py-[11px] text-sm font-semibold text-[hsl(220_25%_72%)] transition-colors hover:bg-lapis-700/60 hover:text-gold-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2 focus-visible:ring-offset-lapis-900"
        >
          <Store className="h-[17px] w-[17px] shrink-0" strokeWidth={2} />
          {PARTNER_ACCOUNT_NAV.storeLabel}
        </Link>
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-[11px] text-sm font-semibold text-[hsl(220_25%_72%)] transition-colors hover:bg-lapis-700/60 hover:text-gold-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2 focus-visible:ring-offset-lapis-900"
        >
          <LogOut className="h-[17px] w-[17px] shrink-0" strokeWidth={2} />
          {PARTNER_ACCOUNT_NAV.logoutLabel}
        </button>
      </div>
    </div>
  );
}

export function PartnerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const { data: partner, isLoading, isError, refetch } = usePartnerMe();

  React.useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const sections = partner ? getPartnerNavForRole(partner.partnerType) : null;
  const displayName = partner?.name?.trim() || "شريك";

  const navBody = isLoading ? (
    <NavSkeleton />
  ) : isError || !sections ? (
    <NavError onRetry={() => refetch()} />
  ) : (
    <NavSections sections={sections} pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
  );

  return (
    <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
    <div className="flex min-h-screen flex-col bg-stone-50 lg:flex-row" dir="rtl">
      {/* Mobile/tablet top bar (<lg) */}
      <header data-partner-chrome className="sticky top-0 z-40 flex shrink-0 items-center gap-3 border-b border-stone-200 bg-white px-4 py-3 print:hidden lg:hidden">
        <SheetTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-md"
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
        <PartnerAlertsBell className="shrink-0 rounded-lg" />
      </header>

      <SheetContent side="right" className="w-[min(18rem,88vw)] bg-lapis-900 p-0 lg:hidden">
        <SheetHeader className="border-b border-white/10 bg-lapis-900 px-4">
          <SheetTitle className="font-cairo text-base text-white">قائمة الشريك</SheetTitle>
          <SheetCloseButton className="text-white/70 hover:text-white" />
        </SheetHeader>
        <nav className="flex-1 overflow-y-auto p-3" aria-label="التنقل في لوحة الشريك">
          {navBody}
        </nav>
      </SheetContent>

      {/* Desktop sidebar (lg+) */}
      <aside data-partner-chrome className="sticky top-0 hidden h-screen w-[236px] shrink-0 flex-col overflow-y-auto bg-lapis-900 px-4 py-6 print:hidden lg:flex">
        <div className="mb-2 flex items-center px-2 pb-6">
          <Image src="/brand/logo-gold-mark.png" alt="نايل كينجز" width={24} height={24} className="h-6 w-auto" />
        </div>
        <div className="mb-2 rounded-lg bg-white/5 px-3 py-2.5">
          {isLoading ? (
            <>
              <Skeleton className="h-4 w-28 rounded" />
              <Skeleton className="mt-2 h-3 w-20 rounded" />
            </>
          ) : (
            <>
              <p className="truncate text-sm font-bold text-white">{displayName}</p>
              <p dir="ltr" className="truncate text-right text-xs text-[hsl(220_20%_60%)]">
                {partner?.phone ?? ""}
              </p>
              {partner && (
                <p className="mt-0.5 text-[11px] font-semibold text-gold-500">
                  {partnerTypeLabel(partner.partnerType)}
                </p>
              )}
            </>
          )}
        </div>
        <nav className="flex-1 overflow-y-auto" aria-label="التنقل في لوحة الشريك">
          {navBody}
        </nav>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        {/* Desktop topbar — `data-partner-chrome` + `print:hidden`: app chrome never prints (4.23 verifier finding). */}
        <div data-partner-chrome className="hidden items-center justify-between border-b border-stone-200 bg-white px-8 py-4 print:hidden lg:flex">
          <div />
          <div className="flex items-center gap-4">
            <PartnerAlertsBell />
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-lapis-800 text-[13px] font-extrabold text-gold-500">
              {isLoading ? "" : initials(displayName)}
            </div>
          </div>
        </div>

        <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden p-4 sm:p-6 lg:overflow-auto lg:p-8">
          {children}
        </main>
      </div>
    </div>
    </Sheet>
  );
}
