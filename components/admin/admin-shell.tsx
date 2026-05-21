"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import {
  BarChart3,
  Folder,
  Handshake,
  LayoutDashboard,
  Menu,
  Package,
  Route,
  Settings,
  ShoppingBag,
  Ticket,
  Truck,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "لوحة التحكم", icon: LayoutDashboard, exact: true },
  { href: "/admin/analytics", label: "التقارير", icon: BarChart3 },
  { href: "/admin/products", label: "المنتجات", icon: Package },
  { href: "/admin/categories", label: "الفئات", icon: Folder },
  { href: "/admin/coupons", label: "الكوبونات", icon: Ticket },
  { href: "/admin/orders", label: "الطلبات", icon: ShoppingBag },
  { href: "/admin/rerouting-rules", label: "قواعد التوجيه", icon: Route },
  { href: "/admin/routed-orders", label: "الطلبات الموجهة", icon: Truck },
  { href: "/admin/clients", label: "العملاء والمسؤولون", icon: Users },
  { href: "/admin/partners", label: "شركاؤنا", icon: Handshake },
  { href: "/admin/settings", label: "الإعدادات", icon: Settings },
] as const;

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function AdminNavLinks({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      {NAV.map((item) => {
        const { href, label, icon: Icon } = item;
        const exact = "exact" in item ? item.exact : undefined;
        const active = isActive(pathname, href, exact);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-burgundy/10 text-burgundy shadow-sm ring-1 ring-inset ring-burgundy/15"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <Icon className={cn("h-4 w-4 shrink-0", active && "text-burgundy")} />
            {label}
          </Link>
        );
      })}
    </>
  );
}

function AdminNavDrawer({
  isOpen,
  onClose,
  pathname,
}: {
  isOpen: boolean;
  onClose: () => void;
  pathname: string;
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
          "border-l border-border/80 bg-card shadow-[0_0_40px_rgba(0,0,0,0.12)]",
          "right-0 left-auto lg:hidden",
          "animate-in slide-in-from-right duration-300 ease-out"
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4 py-4">
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-foreground">نايل كينجز</p>
            <p className="text-xs text-muted-foreground">لوحة الإدارة</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="إغلاق القائمة"
            className="h-10 w-10 shrink-0 rounded-full"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          <AdminNavLinks pathname={pathname} onNavigate={onClose} />
        </nav>
      </aside>
    </>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = React.useState(false);

  React.useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col bg-muted/20 lg:flex-row" dir="rtl">
      <header className="sticky top-0 z-50 flex shrink-0 items-center gap-3 border-b border-border/80 bg-card px-4 py-3 shadow-subtle lg:hidden">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0 rounded-xl"
          onClick={() => setNavOpen(true)}
          aria-label="فتح قائمة لوحة الإدارة"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-foreground">نايل كينجز</p>
          <p className="truncate text-xs text-muted-foreground">لوحة الإدارة</p>
        </div>
      </header>

      <AdminNavDrawer
        isOpen={navOpen}
        onClose={() => setNavOpen(false)}
        pathname={pathname}
      />

      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-l border-border/80 bg-card shadow-subtle lg:flex">
        <div className="border-b border-border/60 px-5 py-5">
          <p className="text-lg font-bold text-foreground">نايل كينجز</p>
          <p className="text-xs text-muted-foreground">لوحة الإدارة</p>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          <AdminNavLinks pathname={pathname} />
        </nav>
      </aside>

      <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden p-4 sm:p-6 lg:overflow-auto lg:p-8">
        {children}
      </main>
    </div>
  );
}
