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
  Boxes,
  LayoutDashboard,
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
      { href: "/partner/orders", label: "الطلبات", icon: Truck, roles: ["AGENT", "DISTRIBUTOR"] },
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
] as const;

/** Bottom mobile tab bar (backlog 5.1 visual system: "اليوم · الطلبات · المخزون · التقارير"). */
export const PARTNER_MOBILE_TABS: readonly { href: string; label: string; icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { href: "/partner", label: "اليوم", icon: LayoutDashboard },
  { href: "/partner/orders", label: "الطلبات", icon: Truck },
  { href: "/partner/stock", label: "المخزون", icon: Boxes },
  { href: "/partner/reports/sales", label: "التقارير", icon: BarChart3 },
];

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
