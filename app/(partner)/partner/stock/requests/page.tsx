"use client";

/**
 * "طلبات التوريد" tab (backlog 5.4, `05-partner-portal-v2.md` §2) — merges the two old v1
 * screens (backlog 4.20) into one route, branching on role: AGENT sees incoming distributor
 * requests (`.../distributor-requests`), DISTRIBUTOR sees their own requests to their agent
 * (`.../restock-requests`). Both APIs (`GET/PATCH /api/partner/restock-requests[/[id]]`) and
 * the shared `components/partner/restock/*` view models are unchanged.
 */
import * as React from "react";
import { AlertTriangle, ClipboardList, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PanelCard } from "@/components/dashboard/panel-card";
import { SearchInput } from "@/components/dashboard/search-input";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/shared/skeleton";
import { PartnerRoleGatePanel } from "@/components/partner/role-gate-panel";
import { RestockItemLines } from "@/components/partner/restock/item-lines";
import { RestockRequestCard } from "@/components/partner/restock/request-card";
import { RestockStatusPill } from "@/components/partner/restock/status-pill";
import type { RestockRequest } from "@/components/partner/restock/types";
import { usePartnerMe } from "@/hooks/use-partner-me";
import { useToast } from "@/hooks/use-toast";
import { formatDateEn } from "@/lib/format-en-numbers";
import { cn } from "@/lib/utils";

type ApiEnvelope<T> = { success?: boolean; data?: T; error?: { message?: string } };

type ProductRow = {
  id: string;
  name: string;
  category: { name: string };
  variants: { id: string; sku: string; name: string; colorName: string | null }[];
};

type DraftLine = { variantId: string; label: string; quantity: number };

async function fetchRequests(): Promise<RestockRequest[]> {
  const res = await fetch("/api/partner/restock-requests", { credentials: "include" });
  const json = (await res.json().catch(() => null)) as ApiEnvelope<{ requests: RestockRequest[] }> | null;
  if (!res.ok || !json?.success) {
    throw new Error(json?.error?.message ?? "فشل تحميل طلبات إعادة التوريد");
  }
  return json.data?.requests ?? [];
}

async function cancelRequest(id: string) {
  const res = await fetch(`/api/partner/restock-requests/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action: "cancel" }),
  });
  const json = (await res.json().catch(() => null)) as ApiEnvelope<unknown> | null;
  if (!res.ok || !json?.success) {
    throw new Error(json?.error?.message ?? "تعذر إلغاء الطلب");
  }
  return json.data;
}

type Action = "approve" | "reject" | "fulfill";

async function patchRequest(id: string, action: Action, responseNotes: string | null) {
  const res = await fetch(`/api/partner/restock-requests/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action, responseNotes }),
  });
  const json = (await res.json().catch(() => null)) as ApiEnvelope<unknown> | null;
  if (!res.ok || !json?.success) {
    throw new Error(json?.error?.message ?? "فشل تحديث الطلب");
  }
  return json.data;
}

export default function PartnerStockRequestsTab() {
  const { data: me, isLoading: meLoading, isError: meError, refetch: refetchMe } = usePartnerMe();

  if (meLoading) {
    return <Skeleton className="h-64 w-full rounded-[14px]" />;
  }

  if (meError || !me) {
    return (
      <div role="alert" className="rounded-[14px] border border-danger-bg bg-danger-bg/60 p-4 text-sm text-danger-text">
        <p className="flex items-center gap-2 font-bold">
          <AlertTriangle className="h-4 w-4" />
          تعذر تحميل بيانات الحساب
        </p>
        <button type="button" onClick={() => refetchMe()} className="mt-2 text-xs font-bold underline underline-offset-2">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  if (me.partnerType === "AGENT") return <DistributorRequestsContent />;
  if (me.partnerType === "DISTRIBUTOR") return <RestockRequestsContent />;
  return <PartnerRoleGatePanel allowedRole="AGENT" />;
}

function RestockRequestsContent() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [productQuery, setProductQuery] = React.useState("");
  const [products, setProducts] = React.useState<ProductRow[]>([]);
  const [selectedVariantId, setSelectedVariantId] = React.useState("");
  const [quantity, setQuantity] = React.useState(1);
  const [notes, setNotes] = React.useState("");
  const [lines, setLines] = React.useState<DraftLine[]>([]);
  const [cancelTarget, setCancelTarget] = React.useState<RestockRequest | null>(null);

  const {
    data: requests = [],
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["partner-restock-requests", "distributor"],
    queryFn: fetchRequests,
  });

  React.useEffect(() => {
    if (isError) toast({ title: "فشل تحميل طلبات إعادة التوريد", variant: "destructive" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isError]);

  React.useEffect(() => {
    const ac = new AbortController();
    const timer = setTimeout(async () => {
      const params = new URLSearchParams({ limit: "30", offset: "0" });
      if (productQuery.trim()) params.set("q", productQuery.trim());
      try {
        const res = await fetch(`/api/partner/inventory?${params}`, {
          credentials: "include",
          signal: ac.signal,
        });
        const json = await res.json();
        if (!ac.signal.aborted && res.ok && json?.success) setProducts(json.data.products ?? []);
      } catch {
        if (!ac.signal.aborted) setProducts([]);
      }
    }, 300);
    return () => {
      ac.abort();
      clearTimeout(timer);
    };
  }, [productQuery]);

  const variantOptions = React.useMemo(
    () =>
      products.flatMap((product) =>
        product.variants.map((variant) => ({
          id: variant.id,
          label: `${product.name} - ${variant.name}${variant.colorName ? ` - ${variant.colorName}` : ""} - ${variant.sku}`,
        }))
      ),
    [products]
  );

  function addLine() {
    const option = variantOptions.find((item) => item.id === selectedVariantId);
    if (!option) return;
    const qty = Math.max(1, Math.trunc(quantity || 1));
    setLines((current) => {
      const existing = current.find((line) => line.variantId === option.id);
      if (existing) {
        return current.map((line) =>
          line.variantId === option.id ? { ...line, quantity: line.quantity + qty } : line
        );
      }
      return [...current, { variantId: option.id, label: option.label, quantity: qty }];
    });
    setSelectedVariantId("");
    setQuantity(1);
  }

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/partner/restock-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          notes: notes.trim() || null,
          items: lines.map((line) => ({ variantId: line.variantId, quantity: line.quantity })),
        }),
      });
      const json = (await res.json().catch(() => null)) as ApiEnvelope<unknown> | null;
      if (!res.ok || !json?.success) {
        throw new Error(json?.error?.message ?? "فشل إرسال الطلب");
      }
      return json.data;
    },
    onSuccess: () => {
      toast({ title: "تم إرسال طلب إعادة التوريد" });
      setLines([]);
      setNotes("");
      setProductQuery("");
      queryClient.invalidateQueries({ queryKey: ["partner-restock-requests", "distributor"] });
    },
    onError: (error: unknown) => {
      toast({ title: error instanceof Error ? error.message : "فشل إرسال الطلب", variant: "destructive" });
    },
  });

  function submitRequest() {
    if (lines.length === 0) {
      toast({ title: "أضف متغيراً واحداً على الأقل", variant: "destructive" });
      return;
    }
    submitMutation.mutate();
  }

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelRequest(id),
    onSuccess: () => {
      toast({ title: "تم إلغاء الطلب" });
      queryClient.invalidateQueries({ queryKey: ["partner-restock-requests", "distributor"] });
    },
    onError: (error: unknown) => {
      toast({ title: error instanceof Error ? error.message : "تعذر إلغاء الطلب", variant: "destructive" });
    },
  });

  const columns = React.useMemo<ColumnDef<RestockRequest, unknown>[]>(
    () => [
      { id: "status", header: "الحالة", cell: ({ row }) => <RestockStatusPill status={row.original.status} /> },
      { id: "sourcePartner", header: "الوكيل", cell: ({ row }) => row.original.sourcePartner.name },
      { id: "items", header: "الأصناف", cell: ({ row }) => <RestockItemLines items={row.original.items} dense /> },
      { id: "notes", header: "ملاحظاتك", cell: ({ row }) => row.original.notes ?? "—" },
      { id: "responseNotes", header: "رد الوكيل", cell: ({ row }) => row.original.responseNotes ?? "—" },
      { id: "createdAt", header: "التاريخ", cell: ({ row }) => <span dir="ltr">{formatDateEn(row.original.createdAt)}</span> },
      {
        id: "actions",
        header: "",
        cell: ({ row }) =>
          row.original.status === "PENDING" ? (
            <Button type="button" size="sm" variant="outline" className="rounded-lg text-danger-text" onClick={() => setCancelTarget(row.original)}>
              إلغاء الطلب
            </Button>
          ) : null,
      },
    ],
    []
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">اطلب متغيرات من الوكيل المرتبط بحسابك وتابع حالة الطلب.</p>
        <Button type="button" variant="outline" className="rounded-lg" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          تحديث
        </Button>
      </div>

      <PanelCard title="طلب جديد" icon={<Plus className="h-5 w-5 text-lapis-800" />}>
        <div className="grid gap-4">
          <SearchInput value={productQuery} onChange={setProductQuery} placeholder="بحث عن منتج أو SKU" className="w-full sm:w-80" />
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_8rem_auto] lg:items-end">
            <div className="grid gap-2">
              <Label htmlFor="variant-select">المتغير</Label>
              <Select id="variant-select" value={selectedVariantId} onChange={(event) => setSelectedVariantId(event.target.value)}>
                <option value="">اختر متغيراً</option>
                {variantOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="quantity-input">الكمية</Label>
              <Input
                id="quantity-input"
                type="number"
                min={1}
                value={quantity}
                onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
              />
            </div>
            <Button type="button" className="rounded-lg" onClick={addLine} disabled={!selectedVariantId}>
              <Plus className="h-4 w-4" />
              إضافة
            </Button>
          </div>

          {lines.length > 0 && (
            <div className="space-y-1.5">
              {lines.map((line) => (
                <div key={line.variantId} className="flex items-center justify-between gap-3 rounded-lg bg-stone-50 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{line.label}</span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span dir="ltr" className="font-extrabold text-ink">
                      × {line.quantity}
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 rounded-md"
                      onClick={() => setLines((current) => current.filter((item) => item.variantId !== line.variantId))}
                      aria-label="حذف"
                    >
                      <Trash2 className="h-4 w-4 text-danger-text" />
                    </Button>
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="notes-textarea">ملاحظات</Label>
            <Textarea
              id="notes-textarea"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="أي تفاصيل إضافية للوكيل"
            />
          </div>

          <Button type="button" className="w-fit rounded-lg" onClick={submitRequest} disabled={submitMutation.isPending || lines.length === 0}>
            {submitMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            إرسال الطلب
          </Button>
        </div>
      </PanelCard>

      <PanelCard title="طلبات سابقة" icon={<ClipboardList className="h-5 w-5 text-lapis-800" />} noPadding>
        {isError ? (
          <div role="alert" className="m-4 rounded-[14px] border border-danger-bg bg-danger-bg/60 p-4 text-sm text-danger-text">
            <p className="flex items-center gap-2 font-bold">
              <AlertTriangle className="h-4 w-4" />
              فشل تحميل طلبات إعادة التوريد
            </p>
            <button type="button" onClick={() => refetch()} className="mt-2 text-xs font-bold underline underline-offset-2">
              إعادة المحاولة
            </button>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={requests}
            loading={isLoading}
            getRowId={(row) => row.id}
            emptyTitle="لا توجد طلبات إعادة توريد"
            emptyIcon={<ClipboardList className="h-8 w-8" strokeWidth={1.5} />}
            className={cn("rounded-none border-0", isFetching && "opacity-70")}
          />
        )}
      </PanelCard>

      <Dialog open={cancelTarget !== null} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إلغاء الطلب</DialogTitle>
            <DialogDescription>سيتم إلغاء هذا الطلب نهائياً ولن يستطيع الوكيل تنفيذه. هل تريد المتابعة؟</DialogDescription>
          </DialogHeader>
          {cancelTarget && <RestockItemLines items={cancelTarget.items} dense />}
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-lg" onClick={() => setCancelTarget(null)}>
              تراجع
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="rounded-lg"
              disabled={cancelMutation.isPending}
              onClick={() => {
                if (!cancelTarget) return;
                const id = cancelTarget.id;
                setCancelTarget(null);
                cancelMutation.mutate(id);
              }}
            >
              {cancelMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              إلغاء الطلب
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DistributorRequestsContent() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [responseDrafts, setResponseDrafts] = React.useState<Record<string, string>>({});
  const [fulfillTarget, setFulfillTarget] = React.useState<RestockRequest | null>(null);

  const {
    data: requests = [],
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["partner-restock-requests", "agent"],
    queryFn: fetchRequests,
  });

  const mutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: Action }) =>
      patchRequest(id, action, responseDrafts[id]?.trim() || null),
    onSuccess: () => {
      toast({ title: "تم تحديث طلب الموزع" });
      queryClient.invalidateQueries({ queryKey: ["partner-restock-requests", "agent"] });
    },
    onError: (error: unknown) => {
      toast({ title: error instanceof Error ? error.message : "فشل تحديث الطلب", variant: "destructive" });
    },
  });

  React.useEffect(() => {
    if (isError) toast({ title: "فشل تحميل طلبات الموزعين", variant: "destructive" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isError]);

  function draftFor(request: RestockRequest) {
    return responseDrafts[request.id] ?? request.responseNotes ?? "";
  }

  const updatingId = mutation.isPending ? mutation.variables?.id ?? null : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">مراجعة طلبات إعادة التوريد القادمة من الموزعين وتنفيذها من مخزونك.</p>
        <Button type="button" variant="outline" className="rounded-lg" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          تحديث
        </Button>
      </div>

      <PanelCard title="طلبات إعادة التوريد" icon={<ClipboardList className="h-5 w-5 text-lapis-800" />}>
        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-40 w-full rounded-[14px]" />
            ))}
          </div>
        ) : isError ? (
          <div role="alert" className="rounded-[14px] border border-danger-bg bg-danger-bg/60 p-4 text-sm text-danger-text">
            <p className="flex items-center gap-2 font-bold">
              <AlertTriangle className="h-4 w-4" />
              فشل تحميل طلبات الموزعين
            </p>
            <button type="button" onClick={() => refetch()} className="mt-2 text-xs font-bold underline underline-offset-2">
              إعادة المحاولة
            </button>
          </div>
        ) : requests.length === 0 ? (
          <EmptyState icon={<ClipboardList className="h-12 w-12" />} title="لا توجد طلبات موزعين" />
        ) : (
          <div className={cn("space-y-3", isFetching && "opacity-70")}>
            {requests.map((request) => (
              <RestockRequestCard
                key={request.id}
                request={request}
                responseDraft={draftFor(request)}
                onDraftChange={(value) => setResponseDrafts((current) => ({ ...current, [request.id]: value }))}
                onApprove={() => mutation.mutate({ id: request.id, action: "approve" })}
                onReject={() => mutation.mutate({ id: request.id, action: "reject" })}
                onFulfillClick={() => setFulfillTarget(request)}
                updating={updatingId === request.id}
              />
            ))}
          </div>
        )}
      </PanelCard>

      <Dialog open={fulfillTarget !== null} onOpenChange={(open) => !open && setFulfillTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تأكيد تنفيذ التحويل</DialogTitle>
            <DialogDescription>
              سيتم خصم الكميات التالية من مخزونك وإضافتها إلى مخزون {fulfillTarget?.destinationPartner.name}. هذا
              الإجراء فوري ولا يمكن التراجع عنه.
            </DialogDescription>
          </DialogHeader>
          {fulfillTarget && <RestockItemLines items={fulfillTarget.items} showDestinationStock dense />}
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-lg" onClick={() => setFulfillTarget(null)}>
              إلغاء
            </Button>
            <Button
              type="button"
              className="rounded-lg"
              disabled={mutation.isPending}
              onClick={() => {
                if (!fulfillTarget) return;
                const id = fulfillTarget.id;
                setFulfillTarget(null);
                mutation.mutate({ id, action: "fulfill" });
              }}
            >
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              تأكيد ونقل المخزون
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
