/**
 * Partner-shell navigation config (backlog 4.16).
 *
 * Single source of truth for `PartnerShell`'s sidebar/drawer nav — sectioned per the
 * design-canvas sidebar (`docs/redesign/design-canvas/PartnerOrders-Desktop.dc.html`:
 * النظرة العامة / المخزون / الشبكة / التقارير / الحساب) and per
 * `docs/redesign/03-backlog.md`'s Partner-portal intro + standing rule (10): "nav items
 * live in `components/partner/partner-nav-config.ts` — a task that adds a screen appends
 * its item there, in the section the task names."
 *
 * Shape contract for later tasks (4.17–4.23): each `PartnerNavItem` is
 * `{ href, label, icon, roles }` where `roles` is the subset of `PartnerType` that can
 * see the item (`["AGENT"]`, `["DISTRIBUTOR"]`, or both). Sections are ordered arrays,
 * each `PartnerNavSection` is `{ id, label, items }`. Append new items to the correct
 * section's `items` array — do not invent a new file or a second nav source.
 *
 * Every route below except `/partner/settings` (4.17) and `/partner/receipts` (4.23)
 * already exists in the app today (pre-redesign pages 4.18–4.22 will re-skin in place),
 * so those items render now per the backlog's exact nav list; the two truly-new routes
 * are commented out with a `TODO(4.NN)` marker and uncommented by their own task rather
 * than linking to a 404.
 */
import type { ComponentType, SVGProps } from "react";
import {
  BarChart3,
  Boxes,
  ClipboardList,
  LayoutDashboard,
  PackageSearch,
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
      { href: "/partner", label: "النظرة العامة", icon: LayoutDashboard, roles: ["AGENT", "DISTRIBUTOR"] },
      { href: "/partner/routed-orders", label: "الطلبات", icon: Truck, roles: ["AGENT", "DISTRIBUTOR"] },
    ],
  },
  {
    id: "inventory",
    label: "المخزون",
    items: [
      { href: "/partner/products", label: "مخزون المنتجات", icon: PackageSearch, roles: ["AGENT", "DISTRIBUTOR"] },
      { href: "/partner/distributor-requests", label: "طلبات الموزعين", icon: ClipboardList, roles: ["AGENT"] },
      // TODO(4.23): uncomment once /partner/receipts exists.
      // { href: "/partner/receipts", label: "الاستلام من المصنع", icon: Boxes, roles: ["AGENT"] },
      { href: "/partner/restock-requests", label: "طلب إعادة توريد", icon: ClipboardList, roles: ["DISTRIBUTOR"] },
    ],
  },
  {
    id: "network",
    label: "الشبكة",
    items: [
      { href: "/partner/distributors", label: "الموزعون", icon: Users, roles: ["AGENT"] },
    ],
  },
  {
    id: "reports",
    label: "التقارير",
    items: [
      { href: "/partner/reports", label: "التقارير", icon: BarChart3, roles: ["AGENT", "DISTRIBUTOR"] },
    ],
  },
] as const;

/** Static "الحساب" section — not role-filtered, always the same two rows + logout. */
export const PARTNER_ACCOUNT_NAV = {
  // TODO(4.17): { href: "/partner/settings", label: "الإعدادات" },
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
