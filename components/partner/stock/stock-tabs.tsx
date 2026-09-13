"use client";

/**
 * المخزون hub tab bar (backlog 5.4, `Stock.dc.html`). Client routes, not client-side tab
 * state — every tab is a real URL (`/partner/stock`, `/partner/stock/movements`, …) so it is
 * bookmarkable/back-button-safe and each tab keeps its own `useListUrlState` filters.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, LayoutGrid, PackageCheck, Truck, Users } from "lucide-react";
import { usePartnerMe } from "@/hooks/use-partner-me";
import { cn } from "@/lib/utils";

type StockTab = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  agentOnly?: boolean;
};

const TABS: StockTab[] = [
  { href: "/partner/stock", label: "المخزون", icon: LayoutGrid },
  { href: "/partner/stock/movements", label: "الحركات", icon: Truck },
  { href: "/partner/stock/intake", label: "الاستلام من المصنع", icon: PackageCheck, agentOnly: true },
  { href: "/partner/stock/counts", label: "الجرد", icon: ClipboardList, agentOnly: true },
  { href: "/partner/stock/requests", label: "طلبات التوريد", icon: Users },
];

export function StockTabs() {
  const pathname = usePathname();
  const { data: partner } = usePartnerMe();
  const isAgent = partner?.partnerType === "AGENT";

  return (
    <nav aria-label="أقسام المخزون" className="flex flex-wrap gap-1 border-b border-stone-200 px-2 pt-1">
      {TABS.filter((tab) => !tab.agentOnly || isAgent).map((tab) => {
        const active = tab.href === "/partner/stock" ? pathname === tab.href : pathname?.startsWith(tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-[13px] font-bold transition-colors",
              active
                ? "border-gold-500 text-lapis-800"
                : "border-transparent text-ink-soft hover:text-ink"
            )}
          >
            <Icon className="h-[15px] w-[15px]" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
