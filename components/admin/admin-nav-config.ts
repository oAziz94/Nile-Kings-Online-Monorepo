/**
 * Admin-shell v2 navigation config (backlog 9.1 b, `06-admin-v2.md` §4 "Shell" +
 * `design-canvas/admin-v2/build.mjs`'s `NAV` constant). Sections/order/hrefs match the
 * canvas exactly: التشغيل (اليوم · الطلبات · أسئلة العملاء) · الشبكة (الشركاء) · الكتالوج
 * (المنتجات · الفئات · الكوبونات — الصور joins in 9.8) · الأشخاص (العملاء) · المتابعة
 * (التقارير · الإعدادات — السجل joins in 9.7).
 *
 * The four screens leaving the nav (`/admin/routed-orders`, `/admin/rerouting-rules`,
 * `/admin/partner-inventory`, `/admin/admins`) stay reachable by URL, each now a permanent
 * redirect to its new home rather than a live page: `/admin/routed-orders` (9.3),
 * `/admin/rerouting-rules*` -> `/admin/partners?tab=routing` and `/admin/partner-inventory`
 * -> `/admin/partners?tab=network` (both 9.5, rule B4), `/admin/admins` ->
 * `/admin/clients?tab=admins` (9.4b) — this config deletes nothing, it just stops linking to
 * them from the rail.
 */
import {
  BarChart3,
  Folder,
  Handshake,
  LayoutDashboard,
  MessageCircleQuestion,
  Settings,
  Tag,
  Ticket,
  Truck,
  Users,
} from "lucide-react";
import type { ShellMobileTab, ShellNavSection } from "@/components/dashboard/dashboard-shell";

export const ADMIN_NAV_SECTIONS: readonly ShellNavSection[] = [
  {
    id: "operations",
    label: "التشغيل",
    items: [
      { href: "/admin", label: "اليوم", icon: LayoutDashboard },
      { href: "/admin/orders", label: "الطلبات", icon: Truck },
      {
        href: "/admin/order-tickets",
        label: "أسئلة العملاء",
        icon: MessageCircleQuestion,
        badgeLabel: (count: number) => `${count} سؤال بانتظار الرد`,
      },
    ],
  },
  {
    id: "network",
    label: "الشبكة",
    items: [{ href: "/admin/partners", label: "الشركاء", icon: Handshake }],
  },
  {
    id: "catalog",
    label: "الكتالوج",
    items: [
      { href: "/admin/products", label: "المنتجات", icon: Tag },
      { href: "/admin/categories", label: "الفئات", icon: Folder },
      { href: "/admin/coupons", label: "الكوبونات", icon: Ticket },
    ],
  },
  {
    id: "people",
    label: "الأشخاص",
    items: [{ href: "/admin/clients", label: "العملاء", icon: Users }],
  },
  {
    id: "follow-up",
    label: "المتابعة",
    items: [
      { href: "/admin/reports/sales", label: "التقارير", icon: BarChart3 },
      { href: "/admin/settings", label: "الإعدادات", icon: Settings },
    ],
  },
] as const;

/** Mobile bottom tab bar (06-admin-v2.md §4): اليوم · الطلبات · الأسئلة · الشركاء. */
export const ADMIN_MOBILE_TABS: readonly ShellMobileTab[] = [
  { href: "/admin", label: "اليوم", icon: LayoutDashboard },
  { href: "/admin/orders", label: "الطلبات", icon: Truck },
  { href: "/admin/order-tickets", label: "الأسئلة", icon: MessageCircleQuestion },
  { href: "/admin/partners", label: "الشركاء", icon: Handshake },
];

/** Static "الحساب" account block: المتجر / تسجيل الخروج only (backlog 9.1 b) — no settings
 * link here, since "الإعدادات" already lives in المتابعة above; `ShellAccountNav.settingsHref`
 * is left unset so `DashboardShell` omits that entry for admin (avoids a duplicate link). */
export const ADMIN_ACCOUNT_NAV = {
  storeHref: "/",
  storeLabel: "المتجر",
  logoutLabel: "تسجيل الخروج",
} as const;
