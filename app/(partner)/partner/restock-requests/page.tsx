"use client";

import * as React from "react";
import { ClipboardList, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader, StatusBadge } from "@/components/dashboard/page-header";
import { PanelCard } from "@/components/dashboard/panel-card";
import { SearchInput } from "@/components/dashboard/search-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { formatDateEn } from "@/lib/format-en-numbers";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "قيد المراجعة",
  APPROVED: "مقبول",
  REJECTED: "مرفوض",
  FULFILLED: "تم التنفيذ",
  CANCELLED: "ملغي",
};

type ProductRow = {
  id: string;
  name: string;
  category: { name: string };
  variants: { id: string; sku: string; name: string; colorName: string | null }[];
};

type RequestRow = {
  id: string;
  status: string;
  createdAt: string;
  notes: string | null;
  responseNotes: string | null;
  sourcePartner: { name: string; phone: string };
  items: {
    id: string;
    quantity: number;
    variant: { id: string; sku: string; name: string; colorName: string | null; product: { name: string } };
  }[];
};

type DraftLine = {
  variantId: string;
  label: string;
  quantity: number;
};

function badgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (["FULFILLED", "APPROVED"].includes(status)) return "default";
  if (["REJECTED", "CANCELLED"].includes(status)) return "destructive";
  if (status === "PENDING") return "secondary";
  return "outline";
}

export default function PartnerRestockRequestsPage() {
  const { toast } = useToast();
  const [requests, setRequests] = React.useState<RequestRow[]>([]);
  const [products, setProducts] = React.useState<ProductRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [fetching, setFetching] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [productQuery, setProductQuery] = React.useState("");
  const [selectedVariantId, setSelectedVariantId] = React.useState("");
  const [quantity, setQuantity] = React.useState(1);
  const [notes, setNotes] = React.useState("");
  const [lines, setLines] = React.useState<DraftLine[]>([]);

  const loadRequests = React.useCallback(async () => {
    setFetching(true);
    try {
      const res = await fetch("/api/partner/restock-requests", { credentials: "include" });
      const json = await res.json();
      if (res.ok && json?.success) setRequests(json.data.requests ?? []);
      else toast({ title: json?.error?.message ?? "فشل تحميل طلبات إعادة التوريد", variant: "destructive" });
    } finally {
      setLoading(false);
      setFetching(false);
    }
  }, [toast]);

  React.useEffect(() => {
    loadRequests();
  }, [loadRequests]);

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

  async function submitRequest() {
    if (lines.length === 0) {
      toast({ title: "أضف متغيراً واحداً على الأقل", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/partner/restock-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          notes: notes.trim() || null,
          items: lines.map((line) => ({ variantId: line.variantId, quantity: line.quantity })),
        }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        toast({ title: "تم إرسال طلب إعادة التوريد" });
        setLines([]);
        setNotes("");
        await loadRequests();
      } else {
        toast({ title: json?.error?.message ?? "فشل إرسال الطلب", variant: "destructive" });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="طلب إعادة توريد"
        description="اطلب متغيرات من الوكيل المرتبط بحسابك وتابع حالة الطلب."
        badge={<StatusBadge>موزعون فقط</StatusBadge>}
        actions={
          <Button type="button" variant="outline" className="rounded-xl" onClick={loadRequests} disabled={fetching}>
            <RefreshCw className={cn("h-4 w-4", fetching && "animate-spin")} />
            تحديث
          </Button>
        }
      />

      <PanelCard title="طلب جديد" icon={<Plus className="h-5 w-5 text-burgundy" />}>
        <div className="grid gap-4">
          <SearchInput
            value={productQuery}
            onChange={setProductQuery}
            placeholder="بحث عن منتج أو SKU"
            className="w-full sm:w-80"
          />
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_8rem_auto] lg:items-end">
            <div className="grid gap-2">
              <Label>المتغير</Label>
              <Select value={selectedVariantId} onChange={(event) => setSelectedVariantId(event.target.value)}>
                <option value="">اختر متغيراً</option>
                {variantOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>الكمية</Label>
              <Input
                type="number"
                min={1}
                value={quantity}
                onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
              />
            </div>
            <Button type="button" className="rounded-xl" onClick={addLine} disabled={!selectedVariantId}>
              <Plus className="h-4 w-4" />
              إضافة
            </Button>
          </div>
          {lines.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>المتغير</TableHead>
                    <TableHead>الكمية</TableHead>
                    <TableHead className="text-left">حذف</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => (
                    <TableRow key={line.variantId}>
                      <TableCell>{line.label}</TableCell>
                      <TableCell>{line.quantity}</TableCell>
                      <TableCell className="text-left">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 rounded-md"
                          onClick={() => setLines((current) => current.filter((item) => item.variantId !== line.variantId))}
                          aria-label="حذف"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="grid gap-2">
            <Label>ملاحظات</Label>
            <textarea
              className="flex min-h-[90px] w-full rounded-xl border border-input bg-background px-4 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="أي تفاصيل إضافية للوكيل"
            />
          </div>
          <Button type="button" className="w-fit rounded-xl" onClick={submitRequest} disabled={submitting || lines.length === 0}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            إرسال الطلب
          </Button>
        </div>
      </PanelCard>

      <PanelCard title="طلبات سابقة" icon={<ClipboardList className="h-5 w-5 text-burgundy" />}>
        {loading ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="ml-2 h-4 w-4 animate-spin" />
            جاري التحميل
          </div>
        ) : requests.length === 0 ? (
          <EmptyState icon={<ClipboardList className="h-12 w-12" />} title="لا توجد طلبات إعادة توريد" />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <Table className={cn(fetching && "opacity-70")}>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>الحالة</TableHead>
                  <TableHead>الوكيل</TableHead>
                  <TableHead>الأصناف</TableHead>
                  <TableHead>ملاحظاتك</TableHead>
                  <TableHead>رد الوكيل</TableHead>
                  <TableHead>التاريخ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>
                      <Badge variant={badgeVariant(request.status)}>
                        {STATUS_LABELS[request.status] ?? request.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{request.sourcePartner.name}</TableCell>
                    <TableCell>
                      <div className="space-y-1 text-xs">
                        {request.items.map((item) => (
                          <p key={item.id}>
                            {item.variant.product.name} · {item.variant.sku} × {item.quantity}
                          </p>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>{request.notes ?? "—"}</TableCell>
                    <TableCell>{request.responseNotes ?? "—"}</TableCell>
                    <TableCell>{formatDateEn(request.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </PanelCard>
    </div>
  );
}
