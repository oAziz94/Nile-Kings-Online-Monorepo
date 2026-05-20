"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Folder,
  Handshake,
  LayoutDashboard,
  Package,
  Route,
  Settings,
  ShoppingBag,
  Ticket,
  Truck,
  Users,
} from "lucide-react";
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

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-muted/20" dir="rtl">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-l border-border/80 bg-card shadow-subtle">
        <div className="border-b border-border/60 px-5 py-5">
          <p className="text-lg font-bold text-foreground">نايل كينجز</p>
          <p className="text-xs text-muted-foreground">لوحة الإدارة</p>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {NAV.map((item) => {
            const { href, label, icon: Icon } = item;
            const exact = "exact" in item ? item.exact : undefined;
            const active = isActive(pathname, href, exact);
            return (
              <Link
                key={href}
                href={href}
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
        </nav>
      </aside>
      <main className="min-w-0 flex-1 overflow-auto p-6 lg:p-8">{children}</main>
    </div>
  );
}
