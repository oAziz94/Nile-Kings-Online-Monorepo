"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Report family switcher (backlog 5.6a) — "المبيعات · التجهيز · المخزون · الشبكة · المال"
 * chips per the artboards, rendered into the topbar slot (`PartnerTopbarSlot` /
 * `DashboardTopbarSlot`). Fulfilment/network/money render a "قريبًا" panel until 5.6b lands
 * (still reachable, per rule 16's "every screen" verification — a chip that 404s would be
 * worse than one that says "soon").
 *
 * Backlog 9.4b: the admin's الأداء tab reuses this exact component (B2 — no admin-only
 * variant) but has no route per report family (it's one tab, `/admin/partners/[id]?tab=
 * performance`) — passing `activeId`/`onSelect` switches the chips to buttons that flip local
 * state instead of `Link`s. Neither prop is passed by the partner report pages, so their
 * rendered DOM is unchanged.
 *
 * Backlog 9.6: the admin's network-wide `/admin/reports/*` pages are real routes (not a
 * tab), so they pass `basePath="/admin/reports"` instead — real `Link`s, just pointed at the
 * admin's own routes; `families` drops "network" (no network-wide agent-network report).
 */
export type ReportFamilyId = "sales" | "fulfilment" | "inventory" | "network" | "money";

function reportFamilies(basePath: string): { id: ReportFamilyId; href: string; label: string }[] {
  return [
    { id: "sales", href: `${basePath}/sales`, label: "المبيعات" },
    { id: "fulfilment", href: `${basePath}/fulfilment`, label: "التجهيز" },
    { id: "inventory", href: `${basePath}/inventory`, label: "المخزون" },
    { id: "network", href: `${basePath}/network`, label: "الشبكة" },
    { id: "money", href: `${basePath}/money`, label: "المال" },
  ];
}

const chipClass = (active: boolean) =>
  cn(
    "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2",
    active
      ? "border-lapis-800 bg-lapis-800 text-white"
      : "border-stone-200 bg-white text-ink hover:bg-stone-50"
  );

export function ReportTabs({
  activeId,
  onSelect,
  families,
  basePath = "/partner/reports",
}: {
  /** Embedded mode (admin الأداء tab): the active family id, driven by the caller's own state. */
  activeId?: ReportFamilyId;
  /** Embedded mode: selecting a chip calls this instead of navigating. */
  onSelect?: (id: ReportFamilyId) => void;
  /** Embedded mode: restrict the chips shown (e.g. drop الشبكة for a non-agent partner). */
  families?: ReportFamilyId[];
  /** Backlog 9.6: the admin's `/admin/reports/*` pages navigate here instead. */
  basePath?: string;
}) {
  const pathname = usePathname();
  const allFamilies = reportFamilies(basePath);
  const items = families ? allFamilies.filter((f) => families.includes(f.id)) : allFamilies;

  if (onSelect) {
    return (
      <nav aria-label="التقارير" className="flex flex-wrap items-center gap-1">
        {items.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-current={activeId === f.id ? "page" : undefined}
            onClick={() => onSelect(f.id)}
            className={chipClass(activeId === f.id)}
          >
            {f.label}
          </button>
        ))}
      </nav>
    );
  }

  return (
    <nav aria-label="التقارير" className="flex flex-wrap items-center gap-1">
      {items.map((f) => {
        const active = pathname === f.href || pathname.startsWith(`${f.href}/`);
        return (
          <Link key={f.id} href={f.href} aria-current={active ? "page" : undefined} className={chipClass(active)}>
            {f.label}
          </Link>
        );
      })}
    </nav>
  );
}
