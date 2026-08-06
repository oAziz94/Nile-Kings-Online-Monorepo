"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, Eye, FileText, Loader2, RefreshCw, ShoppingBag } from "lucide-react";
import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPaginationBar } from "@/components/admin/admin-pagination";
import { AdminPanelCard } from "@/components/admin/admin-panel-card";
import { AdminSearchInput } from "@/components/admin/admin-search-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { piastresToEgp } from "@/lib/catalog";
import { formatDateEn, formatNumberEn } from "@/lib/format-en-numbers";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  CREATED: "قيد الانشاء",
  CONFIRMED: "مؤكد",
  PROCESSING: "قيد التجهيز",
  READY_TO_SHIP: "جاهز للشحن",
  SHIPPED: "تم الشحن",
  DELIVERED: "تم التسليم",
  CANCELLED: "ملغي",
};

const STATUS_BADGE_CLASSES: Record<string, string> = {
  CREATED: "border-slate-300 bg-slate-100 text-slate-700",
  CONFIRMED: "border-blue-300 bg-blue-100 text-blue-700",
  PROCESSING: "border-amber-300 bg-amber-100 text-amber-700",
  READY_TO_SHIP: "border-violet-300 bg-violet-100 text-violet-700",
  SHIPPED: "border-cyan-300 bg-cyan-100 text-cyan-700",
  DELIVERED: "border-emerald-300 bg-emerald-100 text-emerald-700",
  CANCELLED: "border-rose-300 bg-rose-100 text-rose-700",
};

const PAYMENT_LABELS: Record<string, string> = {
  COD: "الدفع عند الاستلام",
  INSTAPAY_PREPAID: "الدفع عبر InstaPay",
  PAYMOB: "بطاقة",
};

type Order = {
  id: string;
  status: string;
  subtotalPiastres: number;
  shippingPiastres: number;
  codFeePiastres: number;
  totalPiastres: number;
  paymentMethod: string;
  adminNotes: string | null;
  createdAt: string;
  user: { phone: string; name: string | null };
  items: { quantity: number; productName: string; variantName: string; totalPiastres: number }[];
  routedOrder: { id: string; status: string; assignedAt: string } | null;
};

const NOTE_PREVIEW_MAX = 56;

function ExpandableNotesCell({ notes }: { notes: string | null }) {
  const [expanded, setExpanded] = React.useState(false);
  const text = notes?.trim() ?? "";
  if (!text) return <span className="text-xs text-muted-foreground">—</span>;
  const needsToggle = text.length > NOTE_PREVIEW_MAX || text.includes("\n");
  return (
    <div className="max-w-[11rem] min-w-[4.5rem]">
      <p
        className={cn(
          "break-words whitespace-pre-wrap text-xs leading-relaxed text-foreground/90",
          !expanded && needsToggle && "line-clamp-2 whitespace-normal"
        )}
      >
        {text}
      </p>
      {needsToggle && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-1 inline-flex items-center gap-0.5 rounded text-[11px] font-medium text-burgundy hover:underline"
        >
          {expanded ? "أقل" : "المزيد"}
          <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
        </button>
      )}
    </div>
  );
}

function egp(piastres: number): string {
  return `${formatNumberEn(piastresToEgp(piastres))} ج.م`;
}

export default function PartnerOrdersPage() {
  const { toast } = useToast();
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [fetching, setFetching] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [debouncedQ, setDebouncedQ] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(20);
  const [partnerType, setPartnerType] = React.useState<"AGENT" | "DISTRIBUTOR" | null>(null);

  React.useEffect(() => {
    let alive = true;
    fetch("/api/partner/me", { credentials: "include" })
      .then((res) => res.json())
      .then((json) => {
        const type = json?.data?.partner?.partnerType;
        if (alive && (type === "AGENT" || type === "DISTRIBUTOR")) setPartnerType(type);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(search.trim()), 400);
    return () => clearTimeout(timer);
  }, [search]);

  React.useEffect(() => {
    setPage(0);
  }, [debouncedQ, statusFilter]);

  React.useEffect(() => {
    const totalPages = total === 0 ? 1 : Math.max(1, Math.ceil(total / pageSize));
    if (page > totalPages - 1) setPage(Math.max(0, totalPages - 1));
  }, [page, pageSize, total]);

  const load = React.useCallback(async () => {
    setFetching(true);
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String(page * pageSize),
    });
    if (debouncedQ) params.set("q", debouncedQ);
    if (statusFilter) params.set("status", statusFilter);

    try {
      const res = await fetch(`/api/partner/routed-orders?${params}`, { credentials: "include" });
      const json = await res.json();
      if (res.ok && json?.success) {
        setOrders(json.data.orders ?? []);
        setTotal(json.data.total ?? 0);
      } else {
        toast({ title: json?.error?.message ?? "فشل تحميل الطلبات", variant: "destructive" });
      }
    } catch (error) {
      toast({
        title: "فشل تحميل الطلبات",
        description: error instanceof Error ? error.message : "خطأ غير متوقع",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setFetching(false);
    }
  }, [debouncedQ, page, pageSize, statusFilter, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  if (loading && orders.length === 0) {
    return <div className="h-64 rounded-2xl bg-muted/40" />;
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="الطلبات"
        description="نفس جدول الطلبات في لوحة الإدارة، لكن مقتصر على الطلبات المسندة لك."
        actions={
          <Button type="button" variant="outline" className="rounded-xl" onClick={load} disabled={fetching}>
            <RefreshCw className={cn("h-4 w-4", fetching && "animate-spin")} />
            تحديث
          </Button>
        }
      />

      <AdminPanelCard
        title="قائمة الطلبات"
        description="ابحث برقم الطلب أو بيانات العميل أو المنتج."
        icon={<ShoppingBag className="h-5 w-5 text-burgundy" />}
        toolbar={
          <div className="flex w-full flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-end">
            <AdminSearchInput
              value={search}
              onChange={setSearch}
              placeholder="بحث برقم الطلب أو العميل…"
              className="sm:min-w-[16rem] lg:w-64"
            />
            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-10 w-full rounded-xl sm:w-40"
            >
              <option value="">كل الحالات</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
        }
      >
        {fetching && orders.length > 0 && (
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            جاري التحديث…
          </div>
        )}
        {orders.length === 0 && !fetching ? (
          <AdminEmptyState
            icon={<FileText className="h-12 w-12" />}
            title={debouncedQ ? "لا توجد نتائج للبحث" : "لا توجد طلبات"}
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <Table className={cn(fetching && "opacity-70")}>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>الرقم</TableHead>
                  <TableHead>العميل</TableHead>
                  <TableHead>الإجمالي</TableHead>
                  <TableHead>طريقة الدفع</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="min-w-[5.5rem] max-w-[12rem]">ملاحظات</TableHead>
                  <TableHead>التاريخ</TableHead>
                  {partnerType === "AGENT" && <TableHead className="text-left">فتح</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-sm">{order.id.slice(0, 8)}</TableCell>
                    <TableCell>
                      {order.user?.phone ?? "—"} {order.user?.name ? `(${order.user.name})` : ""}
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="space-y-1 whitespace-nowrap">
                        <p className="font-semibold tabular-nums">{egp(order.totalPiastres)}</p>
                        <div className="text-[11px] leading-snug text-muted-foreground tabular-nums">
                          <p>
                            <span className="text-foreground/70">المجموع الفرعي:</span>{" "}
                            {egp(order.subtotalPiastres)}
                          </p>
                          <p>
                            <span className="text-foreground/70">الشحن:</span> {egp(order.shippingPiastres)}
                          </p>
                          <p>
                            <span className="text-foreground/70">رسوم الدفع عند الاستلام:</span>{" "}
                            {egp(order.codFeePiastres)}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod ?? "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(STATUS_BADGE_CLASSES[order.status] ?? "border-muted")}
                      >
                        {STATUS_LABELS[order.status] ?? order.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="align-top py-3">
                      <ExpandableNotesCell notes={order.adminNotes} />
                    </TableCell>
                    <TableCell>{formatDateEn(order.createdAt)}</TableCell>
                    {partnerType === "AGENT" && (
                      <TableCell className="text-left">
                        <Button asChild type="button" size="sm" variant="outline" className="rounded-md">
                          <Link href={`/partner/orders/${order.id}`}>
                            <Eye className="h-4 w-4" />
                            فتح
                          </Link>
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {total > 0 && (
          <AdminPaginationBar
            className="mt-6"
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            disabled={fetching}
          />
        )}
      </AdminPanelCard>
    </div>
  );
}
