/**
 * Partner-shell v2 navigation config (backlog 5.1, `05-partner-portal-v2.md` §2
 * "Information architecture"). Organised around the partner's day, not the database
 * tables — six top-level items, role differences live inside items (`roles`), not
 * separate menus. Replaces the v1 config (4.16) one-for-one; the mobile bottom tab bar
 * (`اليوم · الطلبات · المخزون · التقارير`, backlog 5.1) is built from the same section
 * data in `PartnerShell`.
 *
 * Shape contract unchanged from v1: each `PartnerNavItem` is
 * `{ href, label, icon, roles }`; sections are ordered arrays. Append new items to the
 * correct section per whichever v2 task names it (5.2–5.6).
 */
import type { ComponentType, SVGProps } from "react";
import {
  BarChart3,
  Bell,
  Boxes,
  LayoutDashboard,
  ReceiptText,
  Truck,
  Users,
} from "lucide-react";

export type PartnerType = "AGENT" | "DISTRIBUTOR";

export type PartnerNavItem = {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  roles: readonly PartnerType[];
};

export type PartnerNavSection = {
  id: string;
  label: string;
  items: readonly PartnerNavItem[];
};

export const PARTNER_NAV_SECTIONS: readonly PartnerNavSection[] = [
  {
    id: "home",
    label: "الرئيسية",
    items: [
      { href: "/partner", label: "اليوم", icon: LayoutDashboard, roles: ["AGENT", "DISTRIBUTOR"] },
      { href: "/partner/orders", label: "الطلبات", icon: Truck, roles: ["AGENT"] },
      // Outlet counter sales (backlog 11.2; the screen itself is 11.3).
      { href: "/partner/sales", label: "المبيعات", icon: ReceiptText, roles: ["DISTRIBUTOR"] },
    ],
  },
  {
    id: "inventory",
    label: "المخزون",
    items: [
      { href: "/partner/stock", label: "المخزون", icon: Boxes, roles: ["AGENT", "DISTRIBUTOR"] },
    ],
  },
  {
    id: "network",
    label: "الشبكة",
    items: [
      { href: "/partner/network", label: "الموزعون", icon: Users, roles: ["AGENT"] },
    ],
  },
  {
    id: "reports",
    label: "التقارير",
    items: [
      { href: "/partner/reports/sales", label: "التقارير", icon: BarChart3, roles: ["AGENT", "DISTRIBUTOR"] },
    ],
  },
  {
    id: "notifications",
    label: "الإشعارات",
    items: [
      { href: "/partner/notifications", label: "الإشعارات", icon: Bell, roles: ["AGENT"] },
    ],
  },
] as const;

/** Bottom mobile tab bar (backlog 5.1 visual system: "اليوم · الطلبات · المخزون · التقارير"). */
export const PARTNER_MOBILE_TABS: readonly { href: string; label: string; icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { href: "/partner", label: "اليوم", icon: LayoutDashboard },
  { href: "/partner/orders", label: "الطلبات", icon: Truck },
  { href: "/partner/stock", label: "المخزون", icon: Boxes },
  { href: "/partner/reports/sales", label: "التقارير", icon: BarChart3 },
];

/** Outlet (DISTRIBUTOR) bottom tab bar, backlog 11.2: اليوم · المبيعات · المخزون · التقارير. */
export const OUTLET_MOBILE_TABS: typeof PARTNER_MOBILE_TABS = [
  { href: "/partner", label: "اليوم", icon: LayoutDashboard },
  { href: "/partner/sales", label: "المبيعات", icon: ReceiptText },
  { href: "/partner/stock", label: "المخزون", icon: Boxes },
  { href: "/partner/reports/sales", label: "التقارير", icon: BarChart3 },
];

export function getPartnerMobileTabs(partnerType: PartnerType | undefined): typeof PARTNER_MOBILE_TABS {
  return partnerType === "DISTRIBUTOR" ? OUTLET_MOBILE_TABS : PARTNER_MOBILE_TABS;
}

/**
 * Routes only an AGENT may open (backlog 11.2). The server already 403s each of them for an
 * outlet; the shell uses this to redirect an outlet to /partner with a toast instead of
 * rendering a dead page. Segment-aware: "/partner/orders-x" does not match "/partner/orders".
 */
export const AGENT_ONLY_ROUTE_PREFIXES: readonly string[] = [
  "/partner/orders",
  "/partner/routed-orders",
  "/partner/network",
  "/partner/restock-requests",
  "/partner/distributor-requests",
  "/partner/reports/fulfilment",
  "/partner/reports/network",
  "/partner/reports/money",
];

export function isAgentOnlyRoute(pathname: string): boolean {
  return AGENT_ONLY_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"));
}

/** Static "الحساب" section — not role-filtered: settings, store link, logout. */
export const PARTNER_ACCOUNT_NAV = {
  settingsHref: "/partner/settings",
  settingsLabel: "الإعدادات",
  storeHref: "/",
  storeLabel: "المتجر",
  logoutLabel: "تسجيل الخروج",
} as const;

/** Resolve every nav item visible to `partnerType`, in section order, flattened per section. */
export function getPartnerNavForRole(partnerType: PartnerType): PartnerNavSection[] {
  return PARTNER_NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => item.roles.includes(partnerType)),
  })).filter((section) => section.items.length > 0);
}

export const PARTNER_NAV_BOXES_ICON = Boxes;
