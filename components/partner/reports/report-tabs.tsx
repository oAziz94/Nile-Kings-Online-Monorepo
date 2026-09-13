"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Report family switcher (backlog 5.6a) — "المبيعات · التجهيز · المخزون · الشبكة · المال"
 * chips per the artboards, rendered into the topbar slot (`PartnerTopbarSlot`). Fulfilment/
 * network/money render a "قريبًا" panel until 5.6b lands (still reachable, per rule 16's
 * "every screen" verification — a chip that 404s would be worse than one that says "soon").
 */
const REPORT_FAMILIES = [
  { href: "/partner/reports/sales", label: "المبيعات" },
  { href: "/partner/reports/fulfilment", label: "التجهيز" },
  { href: "/partner/reports/inventory", label: "المخزون" },
  { href: "/partner/reports/network", label: "الشبكة" },
  { href: "/partner/reports/money", label: "المال" },
] as const;

export function ReportTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="التقارير" className="flex flex-wrap items-center gap-1">
      {REPORT_FAMILIES.map((f) => {
        const active = pathname === f.href || pathname.startsWith(`${f.href}/`);
        return (
          <Link
            key={f.href}
            href={f.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2",
              active
                ? "border-lapis-800 bg-lapis-800 text-white"
                : "border-stone-200 bg-white text-ink hover:bg-stone-50"
            )}
          >
            {f.label}
          </Link>
        );
      })}
    </nav>
  );
}
