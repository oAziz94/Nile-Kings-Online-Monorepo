"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import {
  BarChart3,
  Boxes,
  Folder,
  Handshake,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircleQuestion,
  Package,
  Route,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Ticket,
  Truck,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  SidebarCollapseButton,
  SidebarCollapseScript,
  SidebarCollapseTooltip,
  useSidebarCollapsed,
} from "@/components/dashboard/sidebar-collapse";

type AdminIdentity = {
  name: string | null;
  phone: string;
  role: string;
};

const NAV_GROUPS = [
  {
    label: "الرئيسية",
    items: [{ href: "/admin", label: "لوحة التحكم", icon: LayoutDashboard, exact: true }],
  },
  {
    label: "العمليات",
    items: [
      { href: "/admin/orders", label: "الطلبات", icon: ShoppingBag },
      { href: "/admin/order-tickets", label: "أسئلة العملاء", icon: MessageCircleQuestion },
      { href: "/admin/routed-orders", label: "الطلبات الموجهة", icon: Truck },
      { href: "/admin/rerouting-rules", label: "قواعد التوجيه", icon: Route },
    ],
  },
  {
    label: "الكتالوج",
    items: [
      { href: "/admin/products", label: "المنتجات", icon: Package },
      { href: "/admin/partner-inventory", label: "مخزون الشركاء", icon: Boxes },
      { href: "/admin/categories", label: "الفئات", icon: Folder },
      { href: "/admin/coupons", label: "الكوبونات", icon: Ticket },
    ],
  },
  {
    label: "الأشخاص",
    items: [
      { href: "/admin/clients", label: "العملاء", icon: Users },
      { href: "/admin/admins", label: "المسؤولون", icon: ShieldCheck },
      { href: "/admin/partners", label: "الشركاء", icon: Handshake },
    ],
  },
  {
    label: "الإدارة",
    items: [
      { href: "/admin/analytics", label: "التقارير", icon: BarChart3 },
      { href: "/admin/settings", label: "الإعدادات", icon: Settings },
    ],
  },
] as const;

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Backlog 7.1 — `collapsed` (real state) is only passed by the desktop aside, gating the
 * Tooltip wrapper. `itemClassName`/`captionClassName`/`labelClassName` (CSS-only,
 * `sidebar-collapsed:` variant) are also only passed by the desktop aside — the mobile
 * drawer (`AdminNavDrawer`) calls this with none of them, so it's untouched.
 */
function AdminNavLinks({
  pathname,
  onNavigate,
  ticketOpenCount,
  collapsed = false,
  itemClassName,
  captionClassName,
  labelClassName,
}: {
  pathname: string;
  onNavigate?: () => void;
  ticketOpenCount?: number;
  collapsed?: boolean;
  itemClassName?: string;
  captionClassName?: string;
  labelClassName?: string;
}) {
  return (
    <div className="space-y-4">
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="space-y-1">
          <p className={cn("px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground", captionClassName)}>
            {group.label}
          </p>
          {group.items.map((item) => {
            const { href, label, icon: Icon } = item;
            const exact = "exact" in item ? item.exact : undefined;
            const active = isActive(pathname, href, exact);
            const badgeCount = href === "/admin/order-tickets" ? ticketOpenCount : undefined;
            return (
              <SidebarCollapseTooltip key={href} active={collapsed} label={label}>
                <Link
                  href={href}
                  onClick={onNavigate}
                  className={cn(
                    "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-burgundy/10 text-burgundy shadow-sm ring-1 ring-inset ring-burgundy/15"
                      : "text-muted-foreground hover:bg-accent hover:text-background",
                    itemClassName
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", active && "text-burgundy")} />
                  <span className={cn("flex-1", labelClassName)}>{label}</span>
                  {/* Expanded: today's inline pill, unchanged. Collapsed (sidebar-collapsed:):
                      repositioned to the icon's top-start corner instead — one element, same
                      `aria-label`, so it's never duplicated in the accessible tree. */}
                  {Boolean(badgeCount) && (
                    <span
                      className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gold-500 px-1.5 text-[11px] font-extrabold text-lapis-900 sidebar-collapsed:absolute sidebar-collapsed:-top-1 sidebar-collapsed:inset-inline-start-1 sidebar-collapsed:h-3.5 sidebar-collapsed:min-w-3.5 sidebar-collapsed:px-0.5 sidebar-collapsed:text-[8px]"
                      aria-label={`${badgeCount} سؤال بانتظار الرد`}
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
      <div className="space-y-1">
        <p className={cn("px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground", captionClassName)}>
          الحساب
        </p>
        <SidebarCollapseTooltip active={collapsed} label="المتجر">
          <Link
            href="/"
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              itemClassName
            )}
          >
            <LayoutDashboard className="h-4 w-4 shrink-0" />
            <span className={labelClassName}>المتجر</span>
          </Link>
        </SidebarCollapseTooltip>
        <SidebarCollapseTooltip active={collapsed} label="تسجيل الخروج">
          <button
            type="button"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
              window.location.href = "/login";
            }}
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              itemClassName
            )}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span className={labelClassName}>تسجيل الخروج</span>
          </button>
        </SidebarCollapseTooltip>
      </div>
    </div>
  );
}

function AdminNavDrawer({
  isOpen,
  onClose,
  pathname,
  ticketOpenCount,
}: {
  isOpen: boolean;
  onClose: () => void;
  pathname: string;
  ticketOpenCount?: number;
}) {
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

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[100] bg-black/40 lg:hidden"
        aria-hidden
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="قائمة لوحة الإدارة"
        className={cn(
          "fixed top-0 bottom-0 z-[100] flex w-[min(18rem,88vw)] flex-col",
          "border-l border-border bg-card shadow-lg",
          "right-0 left-auto lg:hidden",
          "animate-in slide-in-from-right duration-300 ease-out"
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-4">
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-foreground">Nile Kings</p>
            <p className="text-xs text-muted-foreground">Admin</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="إغلاق القائمة"
            className="h-9 w-9 shrink-0 rounded-md"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          <AdminNavLinks pathname={pathname} onNavigate={onClose} ticketOpenCount={ticketOpenCount} />
        </nav>
      </aside>
    </>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = React.useState(false);
  const [identity, setIdentity] = React.useState<AdminIdentity | null>(null);
  const [ticketOpenCount, setTicketOpenCount] = React.useState<number | undefined>(undefined);

  React.useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    let alive = true;
    fetch("/api/admin/order-tickets/counts", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!alive) return;
        const open = json?.data?.open;
        if (typeof open === "number") setTicketOpenCount(open);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [pathname]);

  React.useEffect(() => {
    let alive = true;
    fetch("/api/auth/me", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const data = json?.data;
        if (!alive || !data) return;
        setIdentity({
          name: data.name ?? null,
          phone: data.phone ?? "",
          role: data.role ?? "ADMIN",
        });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const displayName = identity?.name?.trim() || identity?.phone || "Admin";
  const { collapsed, toggle } = useSidebarCollapsed();

  return (
    <TooltipProvider delayDuration={150}>
    <div className="flex min-h-screen flex-col bg-background lg:flex-row" dir="rtl">
      <SidebarCollapseScript />
      <header className="sticky top-0 z-50 flex shrink-0 items-center gap-3 border-b border-border bg-card px-4 py-3 lg:hidden">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 rounded-md"
          onClick={() => setNavOpen(true)}
          aria-label="فتح قائمة لوحة الإدارة"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-foreground">{displayName}</p>
          <p className="truncate text-xs text-muted-foreground">Nile Kings Admin</p>
        </div>
      </header>

      <AdminNavDrawer
        isOpen={navOpen}
        onClose={() => setNavOpen(false)}
        pathname={pathname}
        ticketOpenCount={ticketOpenCount}
      />

      <aside
        data-testid="dashboard-rail"
        className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-l border-border bg-card lg:flex sidebar-collapsed:w-[72px]"
      >
        <div className="border-b border-border px-5 py-4 sidebar-collapsed:flex sidebar-collapsed:justify-center sidebar-collapsed:px-2">
          <div className="sidebar-collapsed:hidden">
            <p className="text-base font-bold text-foreground">Nile Kings</p>
            <p className="text-xs text-muted-foreground">Admin</p>
            <div className="mt-4 rounded-md border border-border bg-muted/40 px-3 py-2">
              <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
              <p className="truncate text-xs text-muted-foreground">{identity?.phone || identity?.role || "Admin"}</p>
            </div>
          </div>
          <Image
            src="/brand/logo-gold-mark.png"
            alt="Nile Kings"
            width={34}
            height={34}
            className="hidden h-[34px] w-[34px] object-contain sidebar-collapsed:block"
          />
        </div>
        <nav id="admin-desktop-nav" className="flex-1 space-y-1 overflow-y-auto p-3">
          <AdminNavLinks
            pathname={pathname}
            ticketOpenCount={ticketOpenCount}
            collapsed={collapsed}
            itemClassName="sidebar-collapsed:justify-center sidebar-collapsed:px-0 sidebar-collapsed:h-10 sidebar-collapsed:w-10 sidebar-collapsed:mx-auto"
            captionClassName="sidebar-collapsed:hidden"
            labelClassName="sidebar-collapsed:hidden"
          />
        </nav>
        <div className="mt-auto border-t border-border p-3">
          <SidebarCollapseButton
            collapsed={collapsed}
            onToggle={toggle}
            navId="admin-desktop-nav"
            className="rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          />
        </div>
      </aside>

      <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden p-4 sm:p-6 lg:overflow-auto lg:p-6">
        {children}
      </main>
    </div>
    </TooltipProvider>
  );
}
