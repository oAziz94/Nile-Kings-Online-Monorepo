"use client";

import * as React from "react";
import { Store } from "lucide-react";
import { useAdminMe } from "@/hooks/use-admin-me";
import { AdminQueueBell } from "@/components/admin/today/queue-bell";
import {
  ADMIN_ACCOUNT_NAV,
  ADMIN_MOBILE_TABS,
  ADMIN_NAV_SECTIONS,
} from "@/components/admin/admin-nav-config";
import { DashboardShell, type ShellNavSection } from "@/components/dashboard/dashboard-shell";

/**
 * Admin shell v2 (backlog 9.1 b) — rebuilt on the shared `DashboardShell` (9.1 a), the same
 * light-SaaS chrome as `PartnerShell`, per `06-admin-v2.md` §4 rule B2 ("no admin-only
 * variants"). Replaces the v1 dark-lapis 224px rail/hand-rolled drawer entirely.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const { data: identity, isLoading, isError, refetch } = useAdminMe();
  const [ticketOpenCount, setTicketOpenCount] = React.useState<number | undefined>(undefined);

  React.useEffect(() => {
    let alive = true;
    fetch("/api/admin/order-tickets/counts", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!alive) return;
        const open = json?.data?.open;
        if (typeof open === "number") setTicketOpenCount(open);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const sections: ShellNavSection[] = React.useMemo(
    () =>
      ADMIN_NAV_SECTIONS.map((section) => ({
        ...section,
        items: section.items.map((item) =>
          item.href === "/admin/order-tickets" ? { ...item, badge: ticketOpenCount } : item
        ),
      })),
    [ticketOpenCount]
  );

  const displayName = identity?.name?.trim() || identity?.phone || "مسؤول";
  const status: "loading" | "error" | "ready" = isLoading ? "loading" : isError || !identity ? "error" : "ready";

  return (
    <DashboardShell
      brand={{ subtitle: "لوحة الإدارة" }}
      identity={{ status, name: displayName, caption: "مسؤول · المصنع", onRetry: () => refetch() }}
      sections={sections}
      accountNav={ADMIN_ACCOUNT_NAV}
      mobileTabs={ADMIN_MOBILE_TABS}
      drawerTitle="قائمة الإدارة"
      navAriaLabel="التنقل في لوحة الإدارة"
      menuButtonLabel="فتح قائمة لوحة الإدارة"
      navId="admin-desktop-nav"
      chromeAttr="data-admin-chrome"
      topbarEnd={
        <div className="flex items-center gap-2">
          <AdminQueueBell />
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white text-ink">
            <Store className="h-[18px] w-[18px]" strokeWidth={2} />
          </span>
        </div>
      }
      mobileTopbarEnd={<AdminQueueBell className="h-9 w-9 shrink-0 rounded-[10px] border-transparent bg-stone-100" />}
    >
      {children}
    </DashboardShell>
  );
}
