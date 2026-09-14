"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Loader2, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { formatDateEn } from "@/lib/format-en-numbers";
import { cn } from "@/lib/utils";
import { PartnerEditForm, type PartnerPatchResponse } from "@/components/admin/partner-edit-form";
import { PartnerOrdersTab } from "@/components/admin/partner-orders-tab";
import { PartnerStockTab } from "@/components/admin/partner-stock-tab";
import { PartnerFinanceTab } from "@/components/admin/partner-finance-tab";
import { PartnerSettingsTab } from "@/components/admin/partner-settings-tab";

/**
 * `/admin/partners/[id]` (backlog 9.4a (e)) — the partner profile. Header (back link,
 * identity, "اتصال") + five tabs via `?tab=` (default الملف): الملف · الطلبات · المخزون ·
 * الحساب المالي · الإعدادات. الأداء and this page's use as a tab of العملاء's admins are
 * 9.4b — out of this task's scope.
 *
 * Deviation from the task text's literal header list ("... 'تعطيل الحساب…'/'تفعيل الحساب'
 * (confirm dialog; the 8.2 PATCH)"): that control is not duplicated in the header — the 8.2
 * `PartnerEditForm` (moved into الملف unchanged, per the same bullet) already owns it with
 * its own confirm dialog and focus management, and الملف is the default tab, so it is one
 * click away with no extra navigation. A second, separate toggle in the header would either
 * duplicate the control or need to stay in sync with the tab's own state — not worth the
 * ambiguity for a page whose default view already shows it.
 */

type PartnerDetail = {
  id: string;
  partnerType: "AGENT" | "DISTRIBUTOR";
  name: string;
  governorate: string;
  phone: string;
  isActive: boolean;
  linkedAgentId: string | null;
  linkedAgent: { id: string; name: string; phone: string } | null;
  createdAt: string;
};

const TABS = [
  { id: "profile", label: "الملف" },
  { id: "orders", label: "الطلبات" },
  { id: "stock", label: "المخزون" },
  { id: "finance", label: "الحساب المالي" },
  { id: "settings", label: "الإعدادات" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function AdminPartnerProfilePage() {
  return (
    <React.Suspense fallback={null}>
      <AdminPartnerProfilePageInner />
    </React.Suspense>
  );
}

function AdminPartnerProfilePageInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const tabParam = searchParams.get("tab") as TabId | null;
  const tab: TabId = TABS.some((t) => t.id === tabParam) ? (tabParam as TabId) : "profile";

  const [partner, setPartner] = React.useState<PartnerDetail | null>(null);
  const [agents, setAgents] = React.useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(() => {
    fetch(`/api/admin/partners/${id}`, { credentials: "include" })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: PartnerDetail }) => {
        if (json?.success && json.data) setPartner(json.data);
        else toast({ title: "تعذر تحميل بيانات الشريك", variant: "destructive" });
      })
      .finally(() => setLoading(false));
  }, [id, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    if (partner?.partnerType === "DISTRIBUTOR") {
      fetch("/api/admin/partners?partnerType=AGENT&limit=200", { credentials: "include" })
        .then((r) => r.json())
        .then((json: { success?: boolean; data?: { partners: { id: string; name: string }[] } }) => {
          if (json?.success && json.data) setAgents(json.data.partners);
        });
    }
  }, [partner?.partnerType]);

  const setTab = (next: TabId) => {
    router.replace(`/admin/partners/${id}?tab=${next}`, { scroll: false });
  };

  const handleUpdated = (updated: PartnerPatchResponse) => {
    setPartner((prev) => (prev ? { ...prev, ...updated } : prev));
  };

  if (loading || !partner) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-ink-soft">
        <Loader2 className="ml-2 h-4 w-4 animate-spin" />
        جاري التحميل…
      </div>
    );
  }

  const sinceLabel = formatDateEn(partner.createdAt);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-soft sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/partners" aria-label="رجوع إلى الشركاء" className="flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 text-ink-soft hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500">
            <ArrowRight className="h-4 w-4" />
          </Link>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-lapis-800 text-[13px] font-extrabold text-gold-500">
            {partner.name.trim().slice(0, 2) || "؟"}
          </span>
          <div>
            <p className="text-lg font-extrabold text-ink">{partner.name}</p>
            <p className="text-xs text-ink-soft">
              {partner.partnerType === "AGENT" ? "وكيل" : "موزع"} · {partner.governorate} · نشط منذ {sinceLabel}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild type="button" variant="outline" size="sm" className="rounded-full">
            <a href={`tel:${partner.phone}`}>
              <Phone className="h-3.5 w-3.5" />
              اتصال
            </a>
          </Button>
        </div>
      </div>

      <div role="tablist" aria-label="أقسام ملف الشريك" className="flex flex-wrap gap-1 rounded-2xl bg-white p-1.5 shadow-soft">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-xl px-3.5 py-2 text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500",
              tab === t.id ? "bg-lapis-800 text-white" : "text-ink-soft hover:bg-stone-50"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "profile" && (
        <div className="rounded-2xl bg-white p-5 shadow-soft">
          <p className="mb-3 text-sm">
            <strong>الحالة:</strong> {partner.isActive ? "نشط" : "غير نشط"}
          </p>
          <PartnerEditForm
            partner={{ ...partner, linkedAgentId: partner.linkedAgent?.id ?? partner.linkedAgentId ?? null }}
            agents={agents}
            onUpdated={handleUpdated}
          />
        </div>
      )}
      {tab === "orders" && <PartnerOrdersTab partnerId={id} />}
      {tab === "stock" && <PartnerStockTab partnerId={id} />}
      {tab === "finance" && <PartnerFinanceTab partnerId={id} />}
      {tab === "settings" && <PartnerSettingsTab partnerId={id} />}
    </div>
  );
}
