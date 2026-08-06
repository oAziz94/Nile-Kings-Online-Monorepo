"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import {
  BarChart3,
  Boxes,
  Folder,
  Handshake,
  LayoutDashboard,
  Menu,
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

function AdminNavLinks({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="space-y-4">
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="space-y-1">
          <p className="px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {group.label}
          </p>
          {group.items.map((item) => {
            const { href, label, icon: Icon } = item;
            const exact = "exact" in item ? item.exact : undefined;
            const active = isActive(pathname, href, exact);
            return (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-foreground text-primary-foreground hover:text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </div>
      ))}
    </div>
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
          <AdminNavLinks pathname={pathname} onNavigate={onClose} />
        </nav>
      </aside>
    </>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = React.useState(false);
  const [identity, setIdentity] = React.useState<AdminIdentity | null>(null);

  React.useEffect(() => {
    setNavOpen(false);
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

  return (
    <div className="flex min-h-screen flex-col bg-background lg:flex-row" dir="rtl">
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
      />

      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-l border-border bg-card lg:flex">
        <div className="border-b border-border px-5 py-4">
          <p className="text-base font-bold text-foreground">Nile Kings</p>
          <p className="text-xs text-muted-foreground">Admin</p>
          <div className="mt-4 rounded-md border border-border bg-muted/40 px-3 py-2">
            <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
            <p className="truncate text-xs text-muted-foreground">{identity?.phone || identity?.role || "Admin"}</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          <AdminNavLinks pathname={pathname} />
        </nav>
      </aside>

      <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden p-4 sm:p-6 lg:overflow-auto lg:p-6">
        {children}
      </main>
    </div>
  );
}
