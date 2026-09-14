"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Boxes,
  Check,
  ClipboardList,
  Eye,
  FileDown,
  Handshake,
  Loader2,
  MessageSquare,
  Plus,
  Route as RouteIcon,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PaginationBar } from "@/components/dashboard/pagination";
import { PanelCard } from "@/components/dashboard/panel-card";
import { SearchInput } from "@/components/dashboard/search-input";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useListUrlState } from "@/hooks/use-list-url-state";
import { useRowScrollRestore } from "@/hooks/use-row-scroll-restore";
import { GOVERNORATE_OPTIONS } from "@/lib/services/shipping";
import { piastresToEgp } from "@/lib/catalog";
import { formatDateEn, formatNumberEn } from "@/lib/format-en-numbers";
import { cn } from "@/lib/utils";
import type { CoverTone } from "@/lib/admin/partners-list";

/**
 * `/admin/partners` (backlog 9.4a (d)+(f)) — the الشركاء hub list, in the partner v2 list
 * language (`PanelCard`/`DataTable`/`SearchInput`, matching `app/(admin)/admin/orders/page.tsx`).
 * Tabs: الشركاء (health columns from `GET /api/admin/partners?health=1`) and طلبات الشراكة
 * (the applications table, restyled). التوجيه/مخزون الشبكة are plain links to their
 * *current* homes — `/admin/rerouting-rules` and `/admin/partner-inventory` — until 9.5
 * builds their real tabs (per the task text: "until 9.5 lands they point at [...] — say so
 * in a comment").
 */

function egp(piastres: number): string {
  return `${formatNumberEn(piastresToEgp(piastres))} ج.م`;
}

type PillVariant = NonNullable<BadgeProps["variant"]>;
const COVER_TONE_VARIANT: Record<CoverTone, PillVariant> = { d: "danger", w: "warning", s: "success" };
const COVER_TONE_LABEL: Record<CoverTone, string> = { d: "منخفضة", w: "قريبة", s: "جيدة" };

type PartnerHealth = {
  openOrders: number;
  overdueOrders: number;
  overduePct: number;
  coverDays: number | null;
  coverTone: CoverTone | null;
  balancePiastres: number;
  nextDueAt: string | null;
  needsAttention: boolean;
};

type PartnerRow = {
  id: string;
  partnerType: "AGENT" | "DISTRIBUTOR";
  name: string;
  governorate: string;
  phone: string;
  isActive: boolean;
  linkedAgent?: { id: string; name: string } | null;
  health: PartnerHealth | null;
};

const TABS = [
  { id: "partners", label: "الشركاء" },
  { id: "requests", label: "طلبات الشراكة" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function AdminPartnersPage() {
  const [tab, setTab] = React.useState<TabId>("partners");
  const [pendingCount, setPendingCount] = React.useState(0);

  React.useEffect(() => {
    fetch("/api/admin/partner-requests?limit=1&status=PENDING", { credentials: "include" })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: { total?: number } }) => {
        if (json?.success && json.data) setPendingCount(json.data.total ?? 0);
      })
      .catch(() => {});
  }, [tab]);

  return (
    <div className="space-y-6">
      <PageHeader title="الشركاء" description="الوكلاء والموزعون، صحتهم التشغيلية والمالية." />

      <div role="tablist" aria-label="أقسام الشركاء" className="flex flex-wrap gap-1 rounded-2xl bg-white p-1.5 shadow-soft">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500",
                active ? "bg-lapis-800 text-white" : "text-ink-soft hover:bg-stone-50"
              )}
            >
              {t.label}
              {t.id === "requests" && pendingCount > 0 && (
                <span className={cn("rounded-full px-1.5 text-[11px] font-extrabold", active ? "bg-white/20" : "bg-carnelian-50 text-danger-text")}>
                  {formatNumberEn(pendingCount)}
                </span>
              )}
            </button>
          );
        })}
        {/* التوجيه · مخزون الشبكة — 9.5 builds the real matrix/network-stock tabs; until then
            these are plain links to their current homes. */}
        <Link
          href="/admin/rerouting-rules"
          className="flex items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-bold text-ink-soft hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
        >
          <RouteIcon className="h-3.5 w-3.5" />
          التوجيه
        </Link>
        <Link
          href="/admin/partner-inventory"
          className="flex items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-bold text-ink-soft hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
        >
          <Boxes className="h-3.5 w-3.5" />
          مخزون الشبكة
        </Link>
      </div>

      {tab === "partners" ? <PartnersTab /> : <PartnerRequestsTab onChanged={() => setTab("partners")} />}
    </div>
  );
}

function PartnersTab() {
  const { toast } = useToast();
  const router = useRouter();
  const { search, setSearch, debouncedQ, page, setPage, pageSize, setPageSize, filters, setFilter } =
    useListUrlState({ type: "", governorate: "", attention: "" }, 25);

  const [rows, setRows] = React.useState<PartnerRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [fetching, setFetching] = React.useState(false);
  const [newOpen, setNewOpen] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);

  const { rememberRow } = useRowScrollRestore("admin-partners-last-row", rows);

  const load = React.useCallback(async () => {
    setFetching(true);
    const params = new URLSearchParams({ health: "1", limit: String(pageSize), offset: String(page * pageSize) });
    if (debouncedQ) params.set("q", debouncedQ);
    if (filters.type) params.set("partnerType", filters.type);
    if (filters.governorate) params.set("governorate", filters.governorate);
    if (filters.attention === "1") params.set("needsAttention", "1");
    try {
      const res = await fetch(`/api/admin/partners?${params}`, { credentials: "include" });
      const json = await res.json();
      if (res.ok && json?.success) {
        setRows(json.data.partners ?? []);
        setTotal(json.data.total ?? 0);
      } else {
        toast({ title: json?.error?.message ?? "فشل تحميل الشركاء", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "فشل تحميل الشركاء", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setLoading(false);
      setFetching(false);
    }
  }, [debouncedQ, filters.type, filters.governorate, filters.attention, page, pageSize, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  const exportCsv = React.useCallback(() => {
    setExporting(true);
    try {
      const header = ["الشريك", "النوع", "المحافظة", "طلبات مفتوحة", "متأخرة", "نسبة التأخير", "تغطية المخزون (يوم)", "مستحق للمصنع (ج.م)", "الحالة"];
      const escape = (s: string | number) => {
        const str = String(s);
        return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
      };
      const lines = [header.map(escape).join(",")];
      for (const r of rows) {
        lines.push(
          [
            r.name,
            r.partnerType === "AGENT" ? "وكيل" : "موزع",
            r.governorate,
            r.health?.openOrders ?? 0,
            r.health?.overdueOrders ?? 0,
            r.health?.overduePct ?? 0,
            r.health?.coverDays ?? "",
            r.health ? Math.round(r.health.balancePiastres) / 100 : "",
            r.isActive ? "نشط" : "غير نشط",
          ]
            .map(escape)
            .join(",")
        );
      }
      const csv = `﻿${lines.join("\n")}`;
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "partners.csv";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }, [rows]);

  const columns = React.useMemo<ColumnDef<PartnerRow, unknown>[]>(
    () => [
      {
        id: "partner",
        header: "الشريك",
        cell: ({ row }) => {
          const p = row.original;
          const subtitle = [p.partnerType === "AGENT" ? "وكيل" : "موزع", p.governorate, p.linkedAgent ? `تابع لـ ${p.linkedAgent.name}` : null]
            .filter(Boolean)
            .join(" · ");
          return (
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lapis-800 text-[12px] font-extrabold text-gold-500">
                {p.name.trim().slice(0, 2) || "؟"}
              </span>
              <div className="min-w-0">
                <Link
                  href={`/admin/partners/${p.id}`}
                  onClick={(e) => { e.stopPropagation(); rememberRow(p.id); }}
                  className="block truncate font-bold text-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 rounded"
                >
                  {p.name}
                </Link>
                <p className="truncate text-xs text-ink-soft">{subtitle}</p>
              </div>
            </div>
          );
        },
      },
      {
        id: "openOrders",
        header: "طلبات مفتوحة",
        cell: ({ row }) => <span dir="ltr">{formatNumberEn(row.original.health?.openOrders ?? 0)}</span>,
      },
      {
        id: "overdue",
        header: "متأخرة",
        cell: ({ row }) => {
          const n = row.original.health?.overdueOrders ?? 0;
          return <span dir="ltr" className={cn("font-extrabold", n > 0 && "text-danger-text")}>{formatNumberEn(n)}</span>;
        },
      },
      {
        id: "overduePct",
        header: "نسبة التأخير",
        cell: ({ row }) => <span dir="ltr">{formatNumberEn(row.original.health?.overduePct ?? 0)}%</span>,
      },
      {
        id: "cover",
        header: "تغطية المخزون",
        cell: ({ row }) => {
          const h = row.original.health;
          if (!h || h.coverDays === null || !h.coverTone) return <span className="text-ink-soft">—</span>;
          return (
            <Badge variant={COVER_TONE_VARIANT[h.coverTone]} className="gap-1.5 rounded-full text-[11px] font-extrabold">
              {formatNumberEn(h.coverDays)} يوم · {COVER_TONE_LABEL[h.coverTone]}
            </Badge>
          );
        },
      },
      {
        id: "balance",
        header: "مستحق للمصنع",
        cell: ({ row }) => {
          const h = row.original.health;
          if (!h) return <span className="text-ink-soft">—</span>;
          return <span className={cn("font-extrabold tabular-nums", h.balancePiastres > 0 && "text-danger-text")}>{egp(h.balancePiastres)}</span>;
        },
      },
      {
        id: "status",
        header: "الحالة",
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "success" : "neutral"} className="rounded-full text-[11px] font-extrabold">
            {row.original.isActive ? "نشط" : "غير نشط"}
          </Badge>
        ),
      },
      {
        id: "open",
        header: "فتح",
        cell: ({ row }) => (
          <Button asChild type="button" size="sm" variant="outline" className="rounded-lg">
            <Link href={`/admin/partners/${row.original.id}`} onClick={(e) => { e.stopPropagation(); rememberRow(row.original.id); }}>
              <Eye className="h-3.5 w-3.5" />
              فتح
            </Link>
          </Button>
        ),
      },
    ],
    [rememberRow]
  );

  return (
    <>
      <PanelCard title="قائمة الشركاء" icon={<Handshake className="h-5 w-5 text-lapis-800" />} noPadding>
        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3.5 sm:px-[22px]">
          <SearchInput value={search} onChange={setSearch} placeholder="الاسم أو الهاتف" className="sm:w-72" />
          <Select value={filters.type} onChange={(e) => setFilter("type", e.target.value)} className="h-8 w-auto rounded-full border-stone-200 px-3 text-xs" aria-label="النوع">
            <option value="">النوع</option>
            <option value="AGENT">وكيل</option>
            <option value="DISTRIBUTOR">موزع</option>
          </Select>
          <Select value={filters.governorate} onChange={(e) => setFilter("governorate", e.target.value)} className="h-8 w-auto rounded-full border-stone-200 px-3 text-xs" aria-label="المحافظة">
            <option value="">المحافظة</option>
            {GOVERNORATE_OPTIONS.map((g) => (
              <option key={g.value} value={g.value}>{g.label}</option>
            ))}
          </Select>
          <button
            type="button"
            aria-pressed={filters.attention === "1"}
            onClick={() => setFilter("attention", filters.attention === "1" ? "" : "1")}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500",
              filters.attention === "1" ? "border-lapis-800 bg-lapis-800 text-white" : "border-stone-200 bg-white text-ink"
            )}
          >
            يحتاج انتباه
          </button>
          <div className="mr-auto flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={exportCsv} disabled={exporting || rows.length === 0}>
              <FileDown className="h-3.5 w-3.5" />
              تصدير
            </Button>
            <Button type="button" size="sm" className="rounded-full" onClick={() => setNewOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              شريك جديد
            </Button>
          </div>
        </div>

        {fetching && rows.length > 0 && (
          <div className="flex items-center gap-2 border-b border-stone-200 px-4 py-2 text-sm text-ink-soft sm:px-[22px]">
            <Loader2 className="h-4 w-4 animate-spin" />
            جاري التحديث…
          </div>
        )}

        <div className={cn("p-4 sm:p-[22px]", fetching && "opacity-70")}>
          <DataTable
            columns={columns}
            data={rows}
            getRowId={(p) => p.id}
            onRowClick={(p) => { rememberRow(p.id); router.push(`/admin/partners/${p.id}`); }}
            loading={loading}
            emptyTitle={debouncedQ ? "لا توجد نتائج للبحث" : "لا يوجد شركاء"}
          />
        </div>

        {total > 0 && (
          <div className="border-t border-stone-200 px-4 py-4 sm:px-[22px]">
            <PaginationBar page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} disabled={fetching} pageSizeOptions={[25, 50, 100]} />
          </div>
        )}
      </PanelCard>

      <NewPartnerDialog open={newOpen} onOpenChange={setNewOpen} onCreated={load} />
    </>
  );
}

function NewPartnerDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [partnerType, setPartnerType] = React.useState<"AGENT" | "DISTRIBUTOR">("AGENT");
  const [name, setName] = React.useState("");
  const [governorate, setGovernorate] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [agents, setAgents] = React.useState<{ id: string; name: string }[]>([]);
  const [linkedAgentId, setLinkedAgentId] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open && partnerType === "DISTRIBUTOR") {
      fetch("/api/admin/partners?partnerType=AGENT&limit=200", { credentials: "include" })
        .then((r) => r.json())
        .then((json: { success?: boolean; data?: { partners: { id: string; name: string }[] } }) => {
          if (json?.success && json.data) setAgents(json.data.partners);
        });
    }
  }, [open, partnerType]);

  const reset = () => {
    setPartnerType("AGENT");
    setName("");
    setGovernorate("");
    setPhone("");
    setLinkedAgentId("");
  };

  const submit = async () => {
    if (!name.trim() || !governorate.trim() || !phone.trim()) {
      toast({ title: "الاسم والمحافظة ورقم التليفون مطلوبة", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/partners", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerType,
          name: name.trim(),
          governorate: governorate.trim(),
          phone: phone.trim(),
          linkedAgentId: partnerType === "DISTRIBUTOR" && linkedAgentId ? linkedAgentId : null,
          isActive: true,
        }),
      });
      const json = await res.json();
      if (json?.success) {
        toast({ title: "تم إضافة الشريك" });
        reset();
        onOpenChange(false);
        onCreated();
      } else {
        toast({ title: json?.error?.message ?? "فشل الإضافة", variant: "destructive" });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl border-stone-200 bg-white">
        <DialogHeader>
          <DialogTitle>شريك جديد</DialogTitle>
          <DialogDescription>إضافة وكيل أو موزع يدوياً.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="np-type">نوع الشريك *</Label>
            <Select id="np-type" value={partnerType} onChange={(e) => setPartnerType(e.target.value as "AGENT" | "DISTRIBUTOR")}>
              <option value="AGENT">وكيل</option>
              <option value="DISTRIBUTOR">موزع</option>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="np-name">الاسم *</Label>
            <Input id="np-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="np-gov">المحافظة *</Label>
            <Select id="np-gov" value={governorate} onChange={(e) => setGovernorate(e.target.value)}>
              <option value="">اختر المحافظة</option>
              {GOVERNORATE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="np-phone">رقم التليفون *</Label>
            <Input id="np-phone" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          {partnerType === "DISTRIBUTOR" && (
            <div className="grid gap-2">
              <Label htmlFor="np-agent">الوكيل المرتبط (اختياري)</Label>
              <Select id="np-agent" value={linkedAgentId} onChange={(e) => setLinkedAgentId(e.target.value)}>
                <option value="">— لا وكيل —</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" className="rounded-full" disabled={submitting}>إلغاء</Button>
          </DialogClose>
          <Button className="rounded-full" onClick={submit} disabled={submitting}>
            {submitting ? "جاري الإضافة…" : "إضافة"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type PartnerRequestRow = {
  id: string;
  requestType: string;
  name: string;
  governorate: string;
  phone: string;
  status: string;
  notes: string | null;
  createdAt: string;
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "قيد الانتظار",
  CONTACTED: "تم التواصل",
  APPROVED: "مقبول",
  REJECTED: "مرفوض",
};

function PartnerRequestsTab({ onChanged }: { onChanged: () => void }) {
  const { toast } = useToast();
  const [requests, setRequests] = React.useState<PartnerRequestRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [debouncedQ, setDebouncedQ] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(20);
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);
  const [statusModal, setStatusModal] = React.useState<{ id: string; status: string; notes: string } | null>(null);
  const [convertModal, setConvertModal] = React.useState<{ id: string; requestType: string } | null>(null);
  const [agents, setAgents] = React.useState<{ id: string; name: string }[]>([]);
  const [convertAgentId, setConvertAgentId] = React.useState("");

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  const load = React.useCallback(() => {
    const params = new URLSearchParams({ limit: String(pageSize), offset: String(page * pageSize) });
    if (debouncedQ) params.set("q", debouncedQ);
    fetch(`/api/admin/partner-requests?${params}`, { credentials: "include" })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: { requests: PartnerRequestRow[]; total: number } }) => {
        if (json?.success && json.data) {
          setRequests(json.data.requests);
          setTotal(json.data.total);
        }
      })
      .catch(() => toast({ title: "فشل تحميل الطلبات", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [toast, debouncedQ, page, pageSize]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    if (convertModal?.requestType === "DISTRIBUTOR") {
      fetch("/api/admin/partners?partnerType=AGENT&limit=200", { credentials: "include" })
        .then((r) => r.json())
        .then((json: { success?: boolean; data?: { partners: { id: string; name: string }[] } }) => {
          if (json?.success && json.data) setAgents(json.data.partners);
        });
    }
  }, [convertModal]);

  const updateStatus = (id: string, status: string, notes: string) => {
    setActionLoading(id);
    fetch(`/api/admin/partner-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ status, notes: notes || null }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json?.success) {
          toast({ title: "تم تحديث الحالة" });
          setStatusModal(null);
          load();
        } else toast({ title: json?.error?.message ?? "فشل التحديث", variant: "destructive" });
      })
      .finally(() => setActionLoading(null));
  };

  const reject = (id: string) => {
    setActionLoading(id);
    fetch(`/api/admin/partner-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ status: "REJECTED" }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json?.success) {
          toast({ title: "تم الرفض" });
          load();
        } else toast({ title: json?.error?.message ?? "فشل", variant: "destructive" });
      })
      .finally(() => setActionLoading(null));
  };

  const convert = (id: string, linkedAgentId: string | null) => {
    setActionLoading(id);
    const url = linkedAgentId
      ? `/api/admin/partner-requests/${id}/convert?linkedAgentId=${encodeURIComponent(linkedAgentId)}`
      : `/api/admin/partner-requests/${id}/convert`;
    fetch(url, { method: "POST", credentials: "include" })
      .then((r) => r.json())
      .then((json) => {
        if (json?.success) {
          toast({ title: "تم التحويل إلى شريك بنجاح" });
          setConvertModal(null);
          setConvertAgentId("");
          load();
          onChanged();
        } else toast({ title: json?.error?.message ?? "فشل التحويل", variant: "destructive" });
      })
      .finally(() => setActionLoading(null));
  };

  return (
    <>
      <PanelCard title="طلبات الشراكة" icon={<ClipboardList className="h-5 w-5 text-lapis-800" />} noPadding>
        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3.5 sm:px-[22px]">
          <SearchInput value={search} onChange={setSearch} placeholder="الاسم أو الهاتف أو المحافظة" className="sm:w-72" />
        </div>
        <div className="p-4 sm:p-[22px]">
          <DataTable
            columns={
              [
                { id: "type", header: "النوع", cell: ({ row }) => (row.original.requestType === "AGENT" ? "وكيل" : "موزع") },
                { id: "name", header: "الاسم", cell: ({ row }) => row.original.name },
                { id: "gov", header: "المحافظة", cell: ({ row }) => row.original.governorate },
                { id: "phone", header: "الهاتف", cell: ({ row }) => <span dir="ltr" className="font-mono text-xs">{row.original.phone}</span> },
                { id: "date", header: "تاريخ الطلب", cell: ({ row }) => formatDateEn(row.original.createdAt) },
                {
                  id: "status",
                  header: "الحالة",
                  cell: ({ row }) => (
                    <Badge variant={row.original.status === "APPROVED" ? "success" : row.original.status === "REJECTED" ? "danger" : "neutral"} className="rounded-full text-[11px] font-extrabold">
                      {STATUS_LABELS[row.original.status] ?? row.original.status}
                    </Badge>
                  ),
                },
                {
                  id: "actions",
                  header: "الإجراءات",
                  cell: ({ row }) => {
                    const r = row.original;
                    return (
                      <div className="flex flex-wrap gap-1.5">
                        <Button type="button" size="sm" variant="outline" className="rounded-lg" onClick={() => setStatusModal({ id: r.id, status: r.status, notes: r.notes ?? "" })}>
                          <MessageSquare className="h-3.5 w-3.5" />
                          حالة
                        </Button>
                        {r.status !== "APPROVED" && r.status !== "REJECTED" && (
                          <>
                            <Button type="button" size="sm" className="rounded-lg" onClick={() => setConvertModal({ id: r.id, requestType: r.requestType })} disabled={!!actionLoading}>
                              {actionLoading === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                              قبول وتحويل
                            </Button>
                            <Button type="button" size="sm" variant="outline" className="rounded-lg" onClick={() => reject(r.id)} disabled={!!actionLoading}>
                              <X className="h-3.5 w-3.5" />
                              رفض
                            </Button>
                          </>
                        )}
                      </div>
                    );
                  },
                },
              ] satisfies ColumnDef<PartnerRequestRow, unknown>[]
            }
            data={requests}
            getRowId={(r) => r.id}
            loading={loading}
            emptyTitle={debouncedQ ? "لا توجد نتائج للبحث" : "لا توجد طلبات شراكة"}
          />
        </div>
        {total > 0 && (
          <div className="border-t border-stone-200 px-4 py-4 sm:px-[22px]">
            <PaginationBar page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} />
          </div>
        )}
      </PanelCard>

      <Dialog open={!!statusModal} onOpenChange={(open) => !open && setStatusModal(null)}>
        <DialogContent className="rounded-2xl border-stone-200 bg-white">
          <DialogHeader><DialogTitle>تغيير الحالة / إضافة ملاحظات</DialogTitle></DialogHeader>
          {statusModal && (
            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label htmlFor="req-status">الحالة</Label>
                <Select id="req-status" value={statusModal.status} onChange={(e) => setStatusModal((m) => (m ? { ...m, status: e.target.value } : null))}>
                  {Object.entries(STATUS_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="req-notes">ملاحظات</Label>
                <textarea
                  id="req-notes"
                  value={statusModal.notes}
                  onChange={(e) => setStatusModal((m) => (m ? { ...m, notes: e.target.value } : null))}
                  className="flex min-h-[80px] w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setStatusModal(null)}>إلغاء</Button>
            {statusModal && (
              <Button className="rounded-full" onClick={() => updateStatus(statusModal.id, statusModal.status, statusModal.notes)} disabled={!!actionLoading}>
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!convertModal} onOpenChange={(open) => !open && setConvertModal(null)}>
        <DialogContent className="rounded-2xl border-stone-200 bg-white">
          <DialogHeader><DialogTitle>قبول وتحويل إلى شريك</DialogTitle></DialogHeader>
          {convertModal && (
            <div className="grid gap-3">
              <p className="text-sm text-ink-soft">
                {convertModal.requestType === "DISTRIBUTOR" ? "اختر الوكيل المرتبط (اختياري):" : "سيتم إنشاء وكيل جديد."}
              </p>
              {convertModal.requestType === "DISTRIBUTOR" && (
                <div className="grid gap-2">
                  <Label htmlFor="convert-agent">الوكيل</Label>
                  <Select id="convert-agent" value={convertAgentId} onChange={(e) => setConvertAgentId(e.target.value)}>
                    <option value="">— لا وكيل —</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </Select>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setConvertModal(null)}>إلغاء</Button>
            {convertModal && (
              <Button
                className="rounded-full"
                onClick={() => convert(convertModal.id, convertModal.requestType === "DISTRIBUTOR" ? convertAgentId || null : null)}
                disabled={!!actionLoading}
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "تحويل"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
