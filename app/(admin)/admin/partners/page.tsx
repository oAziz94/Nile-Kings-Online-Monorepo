"use client";

import * as React from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/shared/skeleton";
import { PaginationBar } from "@/components/dashboard/pagination";
import { TableScroll } from "@/components/dashboard/table-scroll";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ClipboardList,
  Users,
  Truck,
  UserPlus,
  Eye,
  Check,
  X,
  MessageSquare,
  Loader2,
  Search,
} from "lucide-react";
import { formatDateEn } from "@/lib/format-en-numbers";
import { PageHeader } from "@/components/dashboard/page-header";
import { GOVERNORATE_OPTIONS } from "@/lib/services/shipping";

type TabId = "requests" | "agents" | "distributors" | "new";

type PartnerRequestRow = {
  id: string;
  requestType: string;
  name: string;
  governorate: string;
  phone: string;
  status: string;
  notes: string | null;
  createdAt: string;
  facebookUrl: string | null;
  instagramUrl: string | null;
  tiktokUrl: string | null;
  youtubeUrl: string | null;
  websiteUrl: string | null;
  otherUrl: string | null;
};

type PartnerRow = {
  id: string;
  partnerType: string;
  name: string;
  governorate: string;
  phone: string;
  isActive: boolean;
  linkedAgent?: { id: string; name: string; phone: string } | null;
  _count?: { distributors: number };
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "قيد الانتظار",
  CONTACTED: "تم التواصل",
  APPROVED: "مقبول",
  REJECTED: "مرفوض",
};

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "requests", label: "طلبات شراكة", icon: <ClipboardList className="h-4 w-4" /> },
  { id: "agents", label: "وكلاء", icon: <Users className="h-4 w-4" /> },
  { id: "distributors", label: "موزعين", icon: <Truck className="h-4 w-4" /> },
  { id: "new", label: "إدخال شريك جديد", icon: <UserPlus className="h-4 w-4" /> },
];

export default function AdminPartnersPage() {
  const [activeTab, setActiveTab] = React.useState<TabId>("requests");
  const { toast } = useToast();

  return (
    <div className="space-y-6">
      <PageHeader
        title="شركاؤنا"
        description="طلبات الشراكة، الوكلاء، الموزعون، وإدخال شركاء جدد."
      />
      <div className="flex flex-wrap gap-2 rounded-2xl border border-border/80 bg-card p-2 shadow-subtle">
        {TABS.map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? "default" : "ghost"}
            size="sm"
            className={cn(
              "gap-2 rounded-xl",
              activeTab === tab.id && "shadow-sm"
            )}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon}
            {tab.label}
          </Button>
        ))}
      </div>

      {activeTab === "requests" && <PartnerRequestsTab toast={toast} />}
      {activeTab === "agents" && <AgentsTab toast={toast} />}
      {activeTab === "distributors" && <DistributorsTab toast={toast} />}
      {activeTab === "new" && <NewPartnerTab toast={toast} onSuccess={() => setActiveTab("agents")} />}
    </div>
  );
}

function PartnerRequestsTab({ toast }: { toast: ReturnType<typeof useToast>["toast"] }) {
  const [requests, setRequests] = React.useState<PartnerRequestRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [fetching, setFetching] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [debouncedQ, setDebouncedQ] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(20);
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<PartnerRequestRow | null>(null);
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);
  const [statusModal, setStatusModal] = React.useState<{ id: string; status: string; notes: string } | null>(null);
  const [convertModal, setConvertModal] = React.useState<{ id: string; requestType: string } | null>(null);
  const [agents, setAgents] = React.useState<{ id: string; name: string }[]>([]);
  const [convertAgentId, setConvertAgentId] = React.useState("");

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  React.useEffect(() => {
    setPage(0);
  }, [debouncedQ]);

  React.useEffect(() => {
    const totalPages = total === 0 ? 1 : Math.max(1, Math.ceil(total / pageSize));
    if (page > totalPages - 1) setPage(Math.max(0, totalPages - 1));
  }, [total, pageSize, page]);

  const load = React.useCallback(() => {
    setFetching(true);
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String(page * pageSize),
    });
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
      .finally(() => {
        setLoading(false);
        setFetching(false);
      });
  }, [toast, debouncedQ, page, pageSize]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    if (detailId) {
      fetch(`/api/admin/partner-requests/${detailId}`, { credentials: "include" })
        .then((r) => r.json())
        .then((json: { success?: boolean; data?: PartnerRequestRow }) => {
          if (json?.success && json.data) setDetail(json.data);
        });
    } else {
      setDetail(null);
    }
  }, [detailId]);

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
          const convertedType = convertModal?.requestType;
          toast({ title: "تم التحويل إلى شريك بنجاح" });
          setConvertModal(null);
          setConvertAgentId("");
          load();
          if (convertedType) {
            window.dispatchEvent(new CustomEvent("partners-list-updated", { detail: { type: convertedType } }));
          }
        } else toast({ title: json?.error?.message ?? "فشل التحويل", variant: "destructive" });
      })
      .finally(() => setActionLoading(null));
  };

  if (loading && requests.length === 0) return <Skeleton className="h-64 w-full rounded-2xl" />;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-4 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>طلبات شراكة</CardTitle>
            <CardDescription>عرض وإدارة طلبات التسجيل كوكيل أو موزع.</CardDescription>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="بحث بالاسم أو الهاتف أو المحافظة…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {fetching && requests.length > 0 && (
            <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              جاري التحديث…
            </div>
          )}
          {requests.length === 0 && !fetching ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 py-16 text-center">
              <ClipboardList className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">{debouncedQ ? "لا توجد نتائج للبحث" : "لا توجد طلبات شراكة"}</p>
            </div>
          ) : (
            <TableScroll>
            <Table className={cn(fetching && "opacity-70")}>
              <TableHeader>
                <TableRow>
                  <TableHead>النوع</TableHead>
                  <TableHead>الاسم</TableHead>
                  <TableHead>المحافظة</TableHead>
                  <TableHead>رقم التليفون</TableHead>
                  <TableHead>تاريخ الطلب</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="text-left">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.requestType === "AGENT" ? "وكيل" : "موزع"}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>{r.governorate}</TableCell>
                    <TableCell className="font-mono">{r.phone}</TableCell>
                    <TableCell>{formatDateEn(r.createdAt)}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "APPROVED" ? "default" : r.status === "REJECTED" ? "destructive" : "secondary"}>
                        {STATUS_LABELS[r.status] ?? r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-left flex flex-wrap gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setDetailId(r.id)}>
                        <Eye className="h-4 w-4 ml-1" />
                        عرض
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setStatusModal({ id: r.id, status: r.status, notes: r.notes ?? "" })}>
                        <MessageSquare className="h-4 w-4 ml-1" />
                        حالة
                      </Button>
                      {r.status !== "APPROVED" && r.status !== "REJECTED" && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConvertModal({ id: r.id, requestType: r.requestType })}
                            disabled={!!actionLoading}
                          >
                            {actionLoading === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 ml-1" />}
                            قبول وتحويل
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => reject(r.id)} disabled={!!actionLoading}>
                            <X className="h-4 w-4 ml-1" />
                            رفض
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </TableScroll>
          )}
          {total > 0 && (
            <PaginationBar
              className="mt-6"
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              disabled={fetching}
            />
          )}
        </CardContent>
      </Card>

      {/* Detail modal */}
      <Dialog open={!!detailId} onOpenChange={(open) => !open && setDetailId(null)}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>تفاصيل طلب الشريك</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-2 text-sm">
              <p><strong>النوع:</strong> {detail.requestType === "AGENT" ? "وكيل" : "موزع"}</p>
              <p><strong>الاسم:</strong> {detail.name}</p>
              <p><strong>المحافظة:</strong> {detail.governorate}</p>
              <p><strong>رقم التليفون:</strong> {detail.phone}</p>
              <p><strong>تاريخ الطلب:</strong> {formatDateEn(detail.createdAt)}</p>
              <p><strong>الحالة:</strong> {STATUS_LABELS[detail.status] ?? detail.status}</p>
              {detail.notes && <p><strong>ملاحظات:</strong> {detail.notes}</p>}
              {(detail.facebookUrl || detail.instagramUrl || detail.websiteUrl) && (
                <div>
                  <strong>روابط:</strong>
                  <ul className="list-disc pr-4 mt-1">
                    {detail.facebookUrl && <li>Facebook: {detail.facebookUrl}</li>}
                    {detail.instagramUrl && <li>Instagram: {detail.instagramUrl}</li>}
                    {detail.tiktokUrl && <li>TikTok: {detail.tiktokUrl}</li>}
                    {detail.youtubeUrl && <li>YouTube: {detail.youtubeUrl}</li>}
                    {detail.websiteUrl && <li>Website: {detail.websiteUrl}</li>}
                    {detail.otherUrl && <li>Other: {detail.otherUrl}</li>}
                  </ul>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">إغلاق</Button></DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status/notes modal */}
      <Dialog open={!!statusModal} onOpenChange={(open) => !open && setStatusModal(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>تغيير الحالة / إضافة ملاحظات</DialogTitle></DialogHeader>
          {statusModal && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">الحالة</label>
                <select
                  value={statusModal.status}
                  onChange={(e) => setStatusModal((m) => m ? { ...m, status: e.target.value } : null)}
                  className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                >
                  {Object.entries(STATUS_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">ملاحظات</label>
                <textarea
                  value={statusModal.notes}
                  onChange={(e) => setStatusModal((m) => m ? { ...m, notes: e.target.value } : null)}
                  className="flex min-h-[80px] w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusModal(null)}>إلغاء</Button>
            {statusModal && (
              <Button
                onClick={() => updateStatus(statusModal.id, statusModal.status, statusModal.notes)}
                disabled={!!actionLoading}
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Convert modal */}
      <Dialog open={!!convertModal} onOpenChange={(open) => !open && setConvertModal(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>قبول وتحويل إلى شريك</DialogTitle></DialogHeader>
          {convertModal && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {convertModal.requestType === "DISTRIBUTOR"
                  ? "اختر الوكيل المرتبط (اختياري):"
                  : "سيتم إنشاء وكيل جديد."}
              </p>
              {convertModal.requestType === "DISTRIBUTOR" && (
                <div>
                  <label className="block text-sm font-medium mb-1">الوكيل</label>
                  <select
                    value={convertAgentId}
                    onChange={(e) => setConvertAgentId(e.target.value)}
                    className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">— لا وكيل —</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertModal(null)}>إلغاء</Button>
            {convertModal && (
              <Button
                onClick={() => convert(convertModal.id, convertModal.requestType === "DISTRIBUTOR" ? (convertAgentId || null) : null)}
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

function AgentsTab({ toast }: { toast: ReturnType<typeof useToast>["toast"] }) {
  const [partners, setPartners] = React.useState<(PartnerRow & { _count?: { distributors: number } })[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [fetching, setFetching] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [debouncedQ, setDebouncedQ] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(20);
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<PartnerRow | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  React.useEffect(() => {
    setPage(0);
  }, [debouncedQ]);

  React.useEffect(() => {
    const totalPages = total === 0 ? 1 : Math.max(1, Math.ceil(total / pageSize));
    if (page > totalPages - 1) setPage(Math.max(0, totalPages - 1));
  }, [total, pageSize, page]);

  const load = React.useCallback(() => {
    setFetching(true);
    const params = new URLSearchParams({
      partnerType: "AGENT",
      limit: String(pageSize),
      offset: String(page * pageSize),
    });
    if (debouncedQ) params.set("q", debouncedQ);
    fetch(`/api/admin/partners?${params}`, {
      credentials: "include",
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: { partners?: PartnerRow[]; total?: number } }) => {
        if (json?.success && json.data) {
          setPartners(Array.isArray(json.data.partners) ? json.data.partners : []);
          setTotal(typeof json.data.total === "number" ? json.data.total : 0);
        }
      })
      .catch(() => toast({ title: "فشل تحميل الوكلاء", variant: "destructive" }))
      .finally(() => {
        setLoading(false);
        setFetching(false);
      });
  }, [toast, debouncedQ, page, pageSize]);

  React.useEffect(() => load(), [load]);
  React.useEffect(() => {
    const handler = (e: CustomEvent<{ type?: string }>) => {
      if (e.detail?.type === "AGENT") load();
    };
    window.addEventListener("partners-list-updated", handler as EventListener);
    return () => window.removeEventListener("partners-list-updated", handler as EventListener);
  }, [load]);
  React.useEffect(() => {
    if (detailId) {
      fetch(`/api/admin/partners/${detailId}`, { credentials: "include" })
        .then((r) => r.json())
        .then((json: { success?: boolean; data?: PartnerRow & { distributors?: PartnerRow[] } }) => {
          if (json?.success && json.data) setDetail(json.data);
        });
    } else setDetail(null);
  }, [detailId]);

  if (loading && partners.length === 0) return <Skeleton className="h-64 w-full rounded-2xl" />;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-4 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>وكلاء</CardTitle>
            <CardDescription>قائمة الوكلاء وعدد الموزعين المرتبطين.</CardDescription>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="بحث بالاسم أو الهاتف…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {fetching && partners.length > 0 && (
            <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              جاري التحديث…
            </div>
          )}
          {partners.length === 0 && !fetching ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 py-16 text-center">
              <Users className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">{debouncedQ ? "لا توجد نتائج للبحث" : "لا يوجد وكلاء"}</p>
            </div>
          ) : (
            <TableScroll>
            <Table className={cn(fetching && "opacity-70")}>
              <TableHeader>
                <TableRow>
                  <TableHead>الاسم</TableHead>
                  <TableHead>المحافظة</TableHead>
                  <TableHead>رقم التليفون</TableHead>
                  <TableHead>عدد الموزعين المرتبطين</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="text-left">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partners.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.name}</TableCell>
                    <TableCell>{p.governorate}</TableCell>
                    <TableCell className="font-mono">{p.phone}</TableCell>
                    <TableCell>{p._count?.distributors ?? 0}</TableCell>
                    <TableCell>
                      <Badge variant={p.isActive ? "default" : "secondary"}>{p.isActive ? "نشط" : "غير نشط"}</Badge>
                    </TableCell>
                    <TableCell className="text-left">
                      <Button variant="ghost" size="sm" onClick={() => setDetailId(p.id)}>عرض التفاصيل</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </TableScroll>
          )}
          {total > 0 && (
            <PaginationBar
              className="mt-6"
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              disabled={fetching}
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={!!detailId} onOpenChange={(open) => !open && setDetailId(null)}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader><DialogTitle>تفاصيل الوكيل</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-2 text-sm">
              <p><strong>الاسم:</strong> {detail.name}</p>
              <p><strong>المحافظة:</strong> {detail.governorate}</p>
              <p><strong>رقم التليفون:</strong> {detail.phone}</p>
              <p><strong>الحالة:</strong> {detail.isActive ? "نشط" : "غير نشط"}</p>
              {detail && "distributors" in detail && Array.isArray((detail as { distributors?: PartnerRow[] }).distributors) && (
                <div>
                  <strong>الموزعون المرتبطين:</strong>
                  <ul className="list-disc pr-4 mt-1">
                    {((detail as { distributors: PartnerRow[] }).distributors || []).map((d) => (
                      <li key={d.id}>{d.name} – {d.phone}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function DistributorsTab({ toast }: { toast: ReturnType<typeof useToast>["toast"] }) {
  const [partners, setPartners] = React.useState<PartnerRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [fetching, setFetching] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [debouncedQ, setDebouncedQ] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(20);
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<PartnerRow | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  React.useEffect(() => {
    setPage(0);
  }, [debouncedQ]);

  React.useEffect(() => {
    const totalPages = total === 0 ? 1 : Math.max(1, Math.ceil(total / pageSize));
    if (page > totalPages - 1) setPage(Math.max(0, totalPages - 1));
  }, [total, pageSize, page]);

  const load = React.useCallback(() => {
    setFetching(true);
    const params = new URLSearchParams({
      partnerType: "DISTRIBUTOR",
      limit: String(pageSize),
      offset: String(page * pageSize),
    });
    if (debouncedQ) params.set("q", debouncedQ);
    fetch(`/api/admin/partners?${params}`, {
      credentials: "include",
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: { partners?: PartnerRow[]; total?: number } }) => {
        if (json?.success && json.data) {
          setPartners(Array.isArray(json.data.partners) ? json.data.partners : []);
          setTotal(typeof json.data.total === "number" ? json.data.total : 0);
        }
      })
      .catch(() => toast({ title: "فشل تحميل الموزعين", variant: "destructive" }))
      .finally(() => {
        setLoading(false);
        setFetching(false);
      });
  }, [toast, debouncedQ, page, pageSize]);

  React.useEffect(() => load(), [load]);
  React.useEffect(() => {
    const handler = (e: CustomEvent<{ type?: string }>) => {
      if (e.detail?.type === "DISTRIBUTOR") load();
    };
    window.addEventListener("partners-list-updated", handler as EventListener);
    return () => window.removeEventListener("partners-list-updated", handler as EventListener);
  }, [load]);
  React.useEffect(() => {
    if (detailId) {
      fetch(`/api/admin/partners/${detailId}`, { credentials: "include" })
        .then((r) => r.json())
        .then((json: { success?: boolean; data?: PartnerRow }) => {
          if (json?.success && json.data) setDetail(json.data);
        });
    } else setDetail(null);
  }, [detailId]);

  if (loading && partners.length === 0) return <Skeleton className="h-64 w-full rounded-2xl" />;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-4 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>موزعين</CardTitle>
            <CardDescription>قائمة الموزعين والوكيل المرتبط بكل موزع.</CardDescription>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="بحث بالاسم أو الهاتف…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {fetching && partners.length > 0 && (
            <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              جاري التحديث…
            </div>
          )}
          {partners.length === 0 && !fetching ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 py-16 text-center">
              <Truck className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">{debouncedQ ? "لا توجد نتائج للبحث" : "لا يوجد موزعين"}</p>
            </div>
          ) : (
            <TableScroll>
            <Table className={cn(fetching && "opacity-70")}>
              <TableHeader>
                <TableRow>
                  <TableHead>الاسم</TableHead>
                  <TableHead>المحافظة</TableHead>
                  <TableHead>رقم التليفون</TableHead>
                  <TableHead>الوكيل المرتبط</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="text-left">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partners.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.name}</TableCell>
                    <TableCell>{p.governorate}</TableCell>
                    <TableCell className="font-mono">{p.phone}</TableCell>
                    <TableCell>{p.linkedAgent ? p.linkedAgent.name : "—"}</TableCell>
                    <TableCell>
                      <Badge variant={p.isActive ? "default" : "secondary"}>{p.isActive ? "نشط" : "غير نشط"}</Badge>
                    </TableCell>
                    <TableCell className="text-left">
                      <Button variant="ghost" size="sm" onClick={() => setDetailId(p.id)}>عرض التفاصيل</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </TableScroll>
          )}
          {total > 0 && (
            <PaginationBar
              className="mt-6"
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              disabled={fetching}
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={!!detailId} onOpenChange={(open) => !open && setDetailId(null)}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader><DialogTitle>تفاصيل الموزع</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-2 text-sm">
              <p><strong>الاسم:</strong> {detail.name}</p>
              <p><strong>المحافظة:</strong> {detail.governorate}</p>
              <p><strong>رقم التليفون:</strong> {detail.phone}</p>
              <p><strong>الوكيل المرتبط:</strong> {detail.linkedAgent ? detail.linkedAgent.name : "—"}</p>
              <p><strong>الحالة:</strong> {detail.isActive ? "نشط" : "غير نشط"}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

type NewPartnerForm = {
  partnerType: "AGENT" | "DISTRIBUTOR";
  name: string;
  governorate: string;
  phone: string;
  facebookUrl: string;
  instagramUrl: string;
  tiktokUrl: string;
  youtubeUrl: string;
  websiteUrl: string;
  otherUrl: string;
  linkedAgentId: string;
  isActive: boolean;
  notes: string;
};

function NewPartnerTab({
  toast,
  onSuccess,
}: {
  toast: ReturnType<typeof useToast>["toast"];
  onSuccess: () => void;
}) {
  const [form, setForm] = React.useState<NewPartnerForm>({
    partnerType: "AGENT",
    name: "",
    governorate: "",
    phone: "",
    facebookUrl: "",
    instagramUrl: "",
    tiktokUrl: "",
    youtubeUrl: "",
    websiteUrl: "",
    otherUrl: "",
    linkedAgentId: "",
    isActive: true,
    notes: "",
  });
  const [agents, setAgents] = React.useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (form.partnerType === "DISTRIBUTOR") {
      fetch("/api/admin/partners?partnerType=AGENT&limit=200", { credentials: "include" })
        .then((r) => r.json())
        .then((json: { success?: boolean; data?: { partners: { id: string; name: string }[] } }) => {
          if (json?.success && json.data) setAgents(json.data.partners);
        });
    }
  }, [form.partnerType]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.governorate.trim() || !form.phone.trim()) {
      toast({ title: "الاسم والمحافظة ورقم التليفون مطلوبة", variant: "destructive" });
      return;
    }
    setLoading(true);
    fetch("/api/admin/partners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        partnerType: form.partnerType,
        name: form.name.trim(),
        governorate: form.governorate.trim(),
        phone: form.phone.trim(),
        facebookUrl: form.facebookUrl.trim() || null,
        instagramUrl: form.instagramUrl.trim() || null,
        tiktokUrl: form.tiktokUrl.trim() || null,
        youtubeUrl: form.youtubeUrl.trim() || null,
        websiteUrl: form.websiteUrl.trim() || null,
        otherUrl: form.otherUrl.trim() || null,
        linkedAgentId: form.partnerType === "DISTRIBUTOR" && form.linkedAgentId ? form.linkedAgentId : null,
        isActive: form.isActive,
        notes: form.notes.trim() || null,
      }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json?.success) {
          toast({ title: "تم إضافة الشريك بنجاح" });
          setForm({
            partnerType: "AGENT",
            name: "",
            governorate: "",
            phone: "",
            facebookUrl: "",
            instagramUrl: "",
            tiktokUrl: "",
            youtubeUrl: "",
            websiteUrl: "",
            otherUrl: "",
            linkedAgentId: "",
            isActive: true,
            notes: "",
          });
          onSuccess();
        } else toast({ title: json?.error?.message ?? "فشل الإضافة", variant: "destructive" });
      })
      .finally(() => setLoading(false));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>إدخال شريك جديد</CardTitle>
        <CardDescription>إضافة وكيل أو موزع يدوياً.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
          <div>
            <label className="mb-1 block text-sm font-medium">نوع الشريك *</label>
            <select
              value={form.partnerType}
              onChange={(e) => setForm((f) => ({ ...f, partnerType: e.target.value as "AGENT" | "DISTRIBUTOR" }))}
              className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="AGENT">وكيل</option>
              <option value="DISTRIBUTOR">موزع</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">الاسم *</label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="الاسم"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">المحافظة *</label>
            <select
              value={form.governorate}
              onChange={(e) => setForm((f) => ({ ...f, governorate: e.target.value }))}
              className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              required
            >
              <option value="">اختر المحافظة</option>
              {GOVERNORATE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">رقم التليفون *</label>
            <Input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="رقم التليفون"
              required
            />
          </div>
          {form.partnerType === "DISTRIBUTOR" && (
            <div>
              <label className="mb-1 block text-sm font-medium">الوكيل المرتبط (اختياري)</label>
              <select
                value={form.linkedAgentId}
                onChange={(e) => setForm((f) => ({ ...f, linkedAgentId: e.target.value }))}
                className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">— لا وكيل —</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="new-partner-active"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              className="rounded border-input"
            />
            <label htmlFor="new-partner-active" className="text-sm font-medium">نشط</label>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">ملاحظات</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="flex min-h-[80px] w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              rows={3}
            />
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
            إضافة الشريك
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
