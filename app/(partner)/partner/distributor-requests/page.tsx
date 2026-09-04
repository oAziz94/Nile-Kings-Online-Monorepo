"use client";

import * as React from "react";
import { ClipboardList, Loader2, RefreshCw } from "lucide-react";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { PanelCard } from "@/components/dashboard/panel-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { formatDateEn } from "@/lib/format-en-numbers";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "قيد المراجعة",
  APPROVED: "مقبول",
  REJECTED: "مرفوض",
  FULFILLED: "تم التنفيذ",
  CANCELLED: "ملغي",
};

type RestockRequest = {
  id: string;
  status: string;
  createdAt: string;
  notes: string | null;
  responseNotes: string | null;
  sourcePartner: { name: string; phone: string };
  destinationPartner: { name: string; phone: string };
  items: {
    id: string;
    quantity: number;
    variant: { id: string; sku: string; name: string; colorName: string | null; product: { name: string } };
  }[];
};

function badgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (["FULFILLED", "APPROVED"].includes(status)) return "default";
  if (["REJECTED", "CANCELLED"].includes(status)) return "destructive";
  if (status === "PENDING") return "secondary";
  return "outline";
}

export default function PartnerDistributorRequestsPage() {
  const { toast } = useToast();
  const [requests, setRequests] = React.useState<RestockRequest[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [updatingId, setUpdatingId] = React.useState<string | null>(null);
  const [responseDrafts, setResponseDrafts] = React.useState<Record<string, string>>({});

  const load = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/partner/restock-requests", { credentials: "include" });
      const json = await res.json();
      if (res.ok && json?.success) setRequests(json.data.requests ?? []);
      else toast({ title: json?.error?.message ?? "فشل تحميل طلبات الموزعين", variant: "destructive" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function updateRequest(id: string, action: "approve" | "reject" | "fulfill") {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/partner/restock-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action, responseNotes: responseDrafts[id]?.trim() || null }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        toast({ title: "تم تحديث طلب الموزع" });
        await load();
      } else {
        toast({ title: json?.error?.message ?? "فشل تحديث الطلب", variant: "destructive" });
      }
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="طلبات الموزعين"
        description="مراجعة طلبات إعادة التوريد القادمة من الموزعين وتنفيذها من مخزونك."
        actions={
          <Button type="button" variant="outline" className="rounded-md" onClick={load} disabled={refreshing}>
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            تحديث
          </Button>
        }
      />

      <PanelCard title="طلبات إعادة التوريد" icon={<ClipboardList className="h-5 w-5 text-burgundy" />}>
        {loading ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="ml-2 h-4 w-4 animate-spin" />
            جاري التحميل
          </div>
        ) : requests.length === 0 ? (
          <EmptyState icon={<ClipboardList className="h-12 w-12" />} title="لا توجد طلبات موزعين" />
        ) : (
          <div className="space-y-3">
            {requests.map((request) => (
              <div key={request.id} className="rounded-lg border border-border p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={badgeVariant(request.status)}>
                        {STATUS_LABELS[request.status] ?? request.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{formatDateEn(request.createdAt)}</span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      من: {request.destinationPartner.name} · {request.destinationPartner.phone}
                    </p>
                  </div>
                  {["PENDING", "APPROVED"].includes(request.status) && (
                    <div className="flex flex-wrap gap-2">
                      {request.status === "PENDING" && (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="rounded-md"
                            disabled={updatingId === request.id}
                            onClick={() => updateRequest(request.id, "approve")}
                          >
                            قبول
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="rounded-md"
                            disabled={updatingId === request.id}
                            onClick={() => updateRequest(request.id, "reject")}
                          >
                            رفض
                          </Button>
                        </>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        className="rounded-md"
                        disabled={updatingId === request.id}
                        onClick={() => updateRequest(request.id, "fulfill")}
                      >
                        {updatingId === request.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        تنفيذ التحويل
                      </Button>
                    </div>
                  )}
                </div>
                <div className="mt-3 grid gap-2">
                  {request.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2 text-sm">
                      <span className="min-w-0 truncate">
                        {item.variant.product.name} · {item.variant.sku}
                        {item.variant.colorName ? ` · ${item.variant.colorName}` : ""}
                      </span>
                      <span className="shrink-0 font-medium">x{item.quantity}</span>
                    </div>
                  ))}
                </div>
                {request.notes && <p className="mt-3 text-xs text-muted-foreground">ملاحظات: {request.notes}</p>}
                {["PENDING", "APPROVED"].includes(request.status) ? (
                  <div className="mt-3 grid gap-2">
                    <label className="text-xs font-medium text-muted-foreground">رد الوكيل</label>
                    <textarea
                      className="min-h-[72px] rounded-xl border border-input bg-background px-3 py-2 text-sm"
                      value={responseDrafts[request.id] ?? request.responseNotes ?? ""}
                      onChange={(event) =>
                        setResponseDrafts((current) => ({ ...current, [request.id]: event.target.value }))
                      }
                      placeholder="اكتب ملاحظة للموزع قبل قبول أو رفض أو تنفيذ الطلب"
                    />
                  </div>
                ) : request.responseNotes ? (
                  <p className="mt-2 text-xs text-muted-foreground">رد: {request.responseNotes}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </PanelCard>
    </div>
  );
}
