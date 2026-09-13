"use client";

import * as React from "react";
import { Store } from "lucide-react";
import { usePartnerMe, type PartnerType } from "@/hooks/use-partner-me";
import {
  PARTNER_ACCOUNT_NAV,
  PARTNER_MOBILE_TABS,
  getPartnerNavForRole,
} from "@/components/partner/partner-nav-config";
import { PartnerAlertsBell } from "@/components/partner/partner-alerts-bell";
import {
  DashboardShell,
  DashboardTopbarSlot,
  type ShellNavSection,
} from "@/components/dashboard/dashboard-shell";

/**
 * Partner shell v2 (backlog 5.1, extracted into the shared `DashboardShell` by 9.1) —
 * `design-canvas/partner-v2/Main.dc.html`'s light SaaS shell: white 248px sidebar on a
 * stone-50 ground, 1px stone-200 right border, soft `lapis-50` active pill with lapis-800
 * text, white topbar, mobile top bar + bottom tab bar (اليوم · الطلبات · المخزون · التقارير)
 * below `lg` with the sidebar becoming the existing `Sheet` drawer for anything not on the
 * tab bar. This file is now a thin adapter: all chrome markup/classes/aria live in
 * `components/dashboard/dashboard-shell.tsx`, shared with `AdminShell` (9.1 b) per
 * `06-admin-v2.md` §4 rule B2.
 *
 * `PartnerTopbarSlot` keeps its original name/behaviour (re-export of the shared portal) so
 * every existing call site (reports pages' switcher chips) is untouched.
 */
export const PartnerTopbarSlot = DashboardTopbarSlot;

function partnerTypeLabel(type: PartnerType): string {
  return type === "DISTRIBUTOR" ? "موزع" : "وكيل";
}

export function PartnerShell({ children }: { children: React.ReactNode }) {
  const { data: partner, isLoading, isError, refetch } = usePartnerMe();

  const sections: ShellNavSection[] = partner ? getPartnerNavForRole(partner.partnerType) : [];
  const displayName = partner?.name?.trim() || "شريك";
  const caption = partner ? `${partnerTypeLabel(partner.partnerType)} · ${partner.governorate}` : "";

  const status: "loading" | "error" | "ready" = isLoading ? "loading" : isError || !partner ? "error" : "ready";

  return (
    <DashboardShell
      brand={{ subtitle: "بوابة الشركاء" }}
      identity={{ status, name: displayName, caption, onRetry: () => refetch() }}
      sections={sections}
      accountNav={PARTNER_ACCOUNT_NAV}
      mobileTabs={PARTNER_MOBILE_TABS}
      drawerTitle="قائمة الشريك"
      navAriaLabel="التنقل في لوحة الشريك"
      menuButtonLabel="فتح قائمة لوحة الشريك"
      navId="partner-desktop-nav"
      chromeAttr="data-partner-chrome"
      mobileTopbarEnd={<PartnerAlertsBell className="shrink-0 rounded-full border border-stone-200" />}
      topbarEnd={
        <>
          <PartnerAlertsBell />
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white text-ink">
            <Store className="h-[18px] w-[18px]" strokeWidth={2} />
          </span>
        </>
      }
    >
      {children}
    </DashboardShell>
  );
}
