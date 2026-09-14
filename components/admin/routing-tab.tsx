"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Pause, Play, Plus, Route as RouteIcon, X } from "lucide-react";
import { PanelCard } from "@/components/dashboard/panel-card";
import { SearchInput } from "@/components/dashboard/search-input";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatNumberEn } from "@/lib/format-en-numbers";
import type { RoutingModePill } from "@/lib/rerouting/mode-pill";
import { cn } from "@/lib/utils";

/**
 * التوجيه tab (backlog 9.5a, `/admin/partners?tab=routing`) — one row per governorate from
 * `GOVERNORATE_OPTIONS` (`GET /api/admin/routing`), whether or not it has a `ReroutingRule`
 * yet. Writes go through the existing `/api/admin/rerouting-rules*` routes (each
 * audit-logged there under `routing`/governorate) — this component never writes directly to
 * a routing table.
 */

type RoutingPartner = {
  linkId: string;
  partnerId: string;
  name: string;
  partnerType: "AGENT" | "DISTRIBUTOR";
  isActive: boolean;
  orders30d: number;
  sharePercent: number;
};

type RoutingRow = {
  governorate: string;
  governorateLabel: string;
  ruleId: string | null;
  isActive: boolean;
  partners: RoutingPartner[];
  totalOrders30d: number;
  mode: RoutingModePill;
};

type PartnerOption = { id: string; name: string; isActive: boolean };

const MODE_VARIANT: Record<RoutingModePill, NonNullable<BadgeProps["variant"]>> = {
  auto: "success",
  single: "warning",
  danger: "danger",
};
const MODE_LABEL: Record<RoutingModePill, string> = {
  auto: "تلقائي",
  single: "شريك واحد فقط",
  danger: "الطلبات تنتظر إسنادًا يدويًا",
};

export function RoutingTab() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [rows, setRows] = React.useState<RoutingRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState(searchParams.get("q") ?? "");
  const [noPartnerOnly, setNoPartnerOnly] = React.useState(false);
  const [partnerOptions, setPartnerOptions] = React.useState<PartnerOption[]>([]);
  const [addFor, setAddFor] = React.useState<RoutingRow | null>(null);
  const [selectedPartnerId, setSelectedPartnerId] = React.useState("");
  const [busyKey, setBusyKey] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    fetch("/api/admin/routing", { credentials: "include" })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: { rows: RoutingRow[] } }) => {
        if (json?.success && json.data) setRows(json.data.rows);
        else toast({ title: "فشل تحميل قواعد التوجيه", variant: "destructive" });
      })
      .catch(() => toast({ title: "فشل تحميل قواعد التوجيه", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    fetch("/api/admin/partners?health=1&limit=200", { credentials: "include" })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: { partners: { id: string; name: string; isActive: boolean }[] } }) => {
        if (json?.success && json.data) {
          setPartnerOptions(json.data.partners.filter((p) => p.isActive));
        }
      })
      .catch(() => {});
  }, []);

  const dangerCount = rows.filter((r) => r.mode === "danger").length;

  const filtered = rows.filter((r) => {
    if (noPartnerOnly && r.mode !== "danger") return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      r.governorateLabel.toLowerCase().includes(q) ||
      r.partners.some((p) => p.name.toLowerCase().includes(q))
    );
  });

  async function setMode(row: RoutingRow, isActive: boolean) {
    setBusyKey(`mode-${row.governorate}`);
    try {
      const res = row.ruleId
        ? await fetch(`/api/admin/rerouting-rules/${row.ruleId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ isActive }),
          })
        : await fetch("/api/admin/rerouting-rules", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ governorate: row.governorate, isActive }),
          });
      const json = await res.json();
      if (res.ok && json?.success) {
        toast({ title: "تم تحديث وضع التوجيه" });
        load();
      } else {
        toast({ title: json?.error?.message ?? "فشل التحديث", variant: "destructive" });
      }
    } finally {
      setBusyKey(null);
    }
  }

  async function togglePartner(row: RoutingRow, partner: RoutingPartner) {
    if (!row.ruleId) return;
    setBusyKey(`toggle-${partner.linkId}`);
    try {
      const res = await fetch(`/api/admin/rerouting-rules/${row.ruleId}/partners/${partner.linkId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isActive: !partner.isActive }),
      });
      if (res.ok) {
        toast({ title: partner.isActive ? "تم إيقاف الشريك" : "تم تفعيل الشريك" });
        load();
      } else {
        const json = await res.json();
        toast({ title: json?.error?.message ?? "فشل التحديث", variant: "destructive" });
      }
    } finally {
      setBusyKey(null);
    }
  }

  async function removePartner(row: RoutingRow, partner: RoutingPartner) {
    if (!row.ruleId) return;
    setBusyKey(`remove-${partner.linkId}`);
    try {
      const res = await fetch(`/api/admin/rerouting-rules/${row.ruleId}/partners/${partner.linkId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast({ title: "تم إزالة الشريك" });
        load();
      } else {
        toast({ title: "فشل الحذف", variant: "destructive" });
      }
    } finally {
      setBusyKey(null);
    }
  }

  async function addPartner() {
    if (!addFor || !selectedPartnerId) return;
    setBusyKey("add");
    try {
      let ruleId = addFor.ruleId;
      if (!ruleId) {
        const createRes = await fetch("/api/admin/rerouting-rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ governorate: addFor.governorate, isActive: true }),
        });
        const createJson = await createRes.json();
        if (!createRes.ok || !createJson?.success) {
          toast({ title: createJson?.error?.message ?? "فشل إنشاء القاعدة", variant: "destructive" });
          setBusyKey(null);
          return;
        }
        ruleId = createJson.data.id;
      }
      const res = await fetch(`/api/admin/rerouting-rules/${ruleId}/partners`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ partnerId: selectedPartnerId }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        toast({ title: "تم إضافة الشريك" });
        setAddFor(null);
        setSelectedPartnerId("");
        load();
      } else {
        toast({ title: json?.error?.message ?? "فشل الإضافة", variant: "destructive" });
      }
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <>
      <PanelCard title="مصفوفة التوجيه حسب المحافظة" icon={<RouteIcon className="h-5 w-5 text-lapis-800" />} noPadding>
        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3.5 sm:px-[22px]">
          <SearchInput value={search} onChange={setSearch} placeholder="المحافظة أو اسم الشريك" className="sm:w-72" />
          <button
            type="button"
            aria-pressed={noPartnerOnly}
            onClick={() => setNoPartnerOnly((v) => !v)}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500",
              noPartnerOnly ? "border-carnelian-500 bg-carnelian-50 text-danger-text" : "border-stone-200 bg-white text-ink"
            )}
          >
            بلا شريك فقط ({formatNumberEn(dangerCount)})
          </button>
          <p className="mr-auto text-xs text-ink-soft">دوران على الشركاء النشطين حسب ترتيب الإضافة (round-robin)</p>
        </div>

        {loading ? (
          <div className="flex h-40 items-center justify-center text-sm text-ink-soft">
            <Loader2 className="ml-2 h-4 w-4 animate-spin" />
            جاري التحميل
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-soft">لا توجد نتائج</div>
        ) : (
          <div className="divide-y divide-stone-200">
            {filtered.map((row) => (
              <div key={row.governorate} data-testid={`routing-row-${row.governorate}`} className={cn("p-4 sm:p-[22px]", row.mode === "danger" && "bg-carnelian-50/60")}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <h3 className="font-extrabold text-ink">{row.governorateLabel}</h3>
                    <Badge data-testid="routing-mode-pill" variant={MODE_VARIANT[row.mode]} className="rounded-full text-[11px] font-extrabold">
                      {MODE_LABEL[row.mode]}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-ink-soft">
                      <span dir="ltr">{formatNumberEn(row.totalOrders30d)}</span> طلب · 30 يومًا
                    </span>
                    <Select
                      aria-label={`وضع التوجيه — ${row.governorateLabel}`}
                      value={row.isActive ? "AUTO" : "MANUAL"}
                      onChange={(e) => setMode(row, e.target.value === "AUTO")}
                      disabled={busyKey === `mode-${row.governorate}`}
                      className="h-8 w-auto rounded-full border-stone-200 px-3 text-xs"
                    >
                      <option value="AUTO">تلقائي</option>
                      <option value="MANUAL">يدوي</option>
                    </Select>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {row.partners.map((p) => (
                    <span
                      key={p.linkId}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
                        p.isActive ? "border-stone-200 bg-white text-ink" : "border-stone-200 bg-stone-50 text-ink-soft line-through"
                      )}
                    >
                      {p.name}
                      <button
                        type="button"
                        aria-label={p.isActive ? `إيقاف ${p.name}` : `تفعيل ${p.name}`}
                        onClick={() => togglePartner(row, p)}
                        disabled={busyKey === `toggle-${p.linkId}`}
                        className="rounded-full p-0.5 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
                      >
                        {p.isActive ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                      </button>
                      <button
                        type="button"
                        aria-label={`إزالة ${p.name}`}
                        onClick={() => removePartner(row, p)}
                        disabled={busyKey === `remove-${p.linkId}`}
                        className="rounded-full p-0.5 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => setAddFor(row)}
                    className="flex items-center gap-1.5 rounded-full border border-dashed border-stone-300 px-2.5 py-1 text-xs font-semibold text-ink-soft hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
                  >
                    <Plus className="h-3 w-3" />
                    إضافة
                  </button>
                </div>

                {row.partners.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {row.partners.map((p) => (
                      <div key={`share-${p.linkId}`} className="flex items-center gap-2 text-xs">
                        <span className="w-32 shrink-0 truncate text-ink-soft">{p.name}</span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100">
                          <span className="block h-full rounded-full bg-lapis-800" style={{ width: `${p.sharePercent}%` }} />
                        </span>
                        <span dir="ltr" className="w-24 shrink-0 text-left tabular-nums text-ink-soft">
                          {formatNumberEn(p.orders30d)} طلب · {formatNumberEn(p.sharePercent)}٪
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </PanelCard>

      <Dialog open={!!addFor} onOpenChange={(open) => !open && setAddFor(null)}>
        <DialogContent className="rounded-2xl border-stone-200 bg-white">
          <DialogHeader>
            <DialogTitle>إضافة شريك — {addFor?.governorateLabel}</DialogTitle>
          </DialogHeader>
          <Select
            aria-label="اختر الشريك"
            value={selectedPartnerId}
            onChange={(e) => setSelectedPartnerId(e.target.value)}
          >
            <option value="">— اختر —</option>
            {partnerOptions
              .filter((p) => !addFor?.partners.some((rp) => rp.partnerId === p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </Select>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setAddFor(null)}>
              إلغاء
            </Button>
            <Button className="rounded-full" onClick={addPartner} disabled={!selectedPartnerId || busyKey === "add"}>
              {busyKey === "add" ? <Loader2 className="h-4 w-4 animate-spin" /> : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
