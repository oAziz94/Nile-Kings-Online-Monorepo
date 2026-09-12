"use client";

/**
 * Partner — new factory-intake / stock-count receipt (backlog 4.23). AGENT only. Two ways to
 * build the line list before one shared preview + confirm step:
 *   1. "إدخال يدوي" — search the catalog (same `/api/partner/inventory` endpoint the products
 *      list and restock-request forms use) and add lines by variant, merged client-side.
 *   2. "رفع ملف" — drop the exported `inventory_YYYY_MM_DD.xlsx` (or a JSON re-upload of the
 *      same shape); parsed client-side with `xlsx` for an instant row count, then posted to
 *      `POST /api/partner/inventory/import` for the authoritative preview.
 * Nothing is applied until "تأكيد الاستلام" in the confirm dialog, which calls
 * `POST /api/partner/receipts`. Both entry modes converge on one `previewRows` preview table
 * (current → new; error rows in carnelian, excluded from the apply payload).
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Boxes,
  Loader2,
  Plus,
  ShieldAlert,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { PageHeader, StatusBadge } from "@/components/dashboard/page-header";
import { PanelCard } from "@/components/dashboard/panel-card";
import { SearchInput } from "@/components/dashboard/search-input";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/shared/skeleton";
import { useToast } from "@/hooks/use-toast";
import { usePartnerMe } from "@/hooks/use-partner-me";
import {
  buildImportPreview,
  parseInventoryWorkbookRowsFromArrayBuffer,
  type PreviewRow,
  type RawImportRow,
  type ReceiptMode,
  type VariantForPreview,
} from "@/lib/inventory/receipts";
import { formatNumberEn } from "@/lib/format-en-numbers";
import { cn } from "@/lib/utils";

type ProductRow = {
  id: string;
  name: string;
  variants: {
    id: string;
    sku: string;
    name: string;
    colorName: string | null;
    stockAvailable: number;
    stockReserved: number;
  }[];
};

function RoleGatePanel({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-[14px] border border-stone-200 bg-white py-14 text-center">
      <ShieldAlert className="h-9 w-9 text-stone-300" strokeWidth={1.5} />
      <p className="text-[15px] font-extrabold text-ink">{message}</p>
    </div>
  );
}

/** Manual entry keeps its own small draft (variantId -> quantity) before it feeds the shared preview builder. */
type ManualLine = { variantId: string; sku: string; label: string; quantity: number };

export default function PartnerNewReceiptPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data: partner, isLoading: partnerLoading, isError: partnerError } = usePartnerMe();
  const isAgent = partner?.partnerType === "AGENT";

  const [kind, setKind] = React.useState<"FACTORY" | "COUNT">("FACTORY");
  const [reference, setReference] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const mode: ReceiptMode = kind === "FACTORY" ? "receipt" : "count";

  // Manual-entry state.
  const [productQuery, setProductQuery] = React.useState("");
  const [products, setProducts] = React.useState<ProductRow[]>([]);
  const [selectedVariantId, setSelectedVariantId] = React.useState("");
  const [quantity, setQuantity] = React.useState(1);
  const [manualLines, setManualLines] = React.useState<ManualLine[]>([]);
  const variantsBySkuRef = React.useRef(new Map<string, VariantForPreview>());

  // Upload-entry state.
  const [uploadRows, setUploadRows] = React.useState<PreviewRow[] | null>(null);
  const [uploadFileName, setUploadFileName] = React.useState<string | null>(null);
  const [uploadParsedCount, setUploadParsedCount] = React.useState<number | null>(null);
  const [uploadLoading, setUploadLoading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = React.useState<"manual" | "upload">("manual");
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  // Reset both entry modes' lines when the kind toggle changes — a delta list built for a
  // factory receipt has no valid meaning as a physical count and vice versa.
  React.useEffect(() => {
    setManualLines([]);
    setUploadRows(null);
    setUploadParsedCount(null);
    setUploadFileName(null);
    setUploadError(null);
  }, [kind]);

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
        if (!ac.signal.aborted && res.ok && json?.success) {
          const rows: ProductRow[] = json.data.products ?? [];
          setProducts(rows);
          for (const product of rows) {
            for (const variant of product.variants) {
              variantsBySkuRef.current.set(variant.sku, {
                variantId: variant.id,
                sku: variant.sku,
                productName: product.name,
                variantLabel: `${variant.name}${variant.colorName ? ` · ${variant.colorName}` : ""}`,
                current: variant.stockAvailable,
                stockReserved: variant.stockReserved,
              });
            }
          }
        }
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
          sku: variant.sku,
          label: `${product.name} - ${variant.name}${variant.colorName ? ` - ${variant.colorName}` : ""} - ${variant.sku}`,
        }))
      ),
    [products]
  );

  function addManualLine() {
    const option = variantOptions.find((item) => item.id === selectedVariantId);
    if (!option) return;
    const qty = Math.trunc(quantity || 0);
    if (kind === "FACTORY" && qty <= 0) {
      toast({ title: "كمية الاستلام يجب أن تكون رقماً صحيحاً موجباً", variant: "destructive" });
      return;
    }
    if (kind === "COUNT" && qty < 0) {
      toast({ title: "الجرد الفعلي يجب أن يكون رقماً صحيحاً غير سالب", variant: "destructive" });
      return;
    }
    setManualLines((current) => {
      const existing = current.find((line) => line.variantId === option.id);
      if (existing) {
        return current.map((line) =>
          line.variantId === option.id
            ? { ...line, quantity: kind === "FACTORY" ? line.quantity + qty : qty }
            : line
        );
      }
      return [...current, { variantId: option.id, sku: option.sku, label: option.label, quantity: qty }];
    });
    setSelectedVariantId("");
    setQuantity(1);
  }

  function removeManualLine(variantId: string) {
    setManualLines((current) => current.filter((line) => line.variantId !== variantId));
  }

  async function handleFile(file: File) {
    setUploadError(null);
    setUploadLoading(true);
    setUploadFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      // Instant client-side feedback (backlog 4.23) before the authoritative server preview.
      try {
        const quickRows = parseInventoryWorkbookRowsFromArrayBuffer(buffer.slice(0), mode);
        setUploadParsedCount(quickRows.length);
      } catch {
        setUploadParsedCount(null);
      }

      const form = new FormData();
      form.set("mode", mode);
      form.set("file", file);
      const res = await fetch("/api/partner/inventory/import", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setUploadError(json?.error?.message ?? "فشل تحليل الملف");
        setUploadRows(null);
        return;
      }
      setUploadRows(json.data.rows ?? []);
    } catch {
      setUploadError("فشل قراءة الملف");
      setUploadRows(null);
    } finally {
      setUploadLoading(false);
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  // Manual lines -> the same PreviewRow shape the upload path already returns, via the shared
  // pure `buildImportPreview` helper (no duplicated validation logic between the two paths).
  const manualPreview = React.useMemo<PreviewRow[]>(() => {
    if (manualLines.length === 0) return [];
    const rawRows: RawImportRow[] = manualLines.map((l) => ({ sku: l.sku, rawValue: l.quantity }));
    return buildImportPreview(rawRows, mode, variantsBySkuRef.current);
  }, [manualLines, mode]);

  const previewRows = activeTab === "manual" ? manualPreview : uploadRows ?? [];
  const validRows = previewRows.filter((r) => !r.error && r.variantId);
  const errorRows = previewRows.filter((r) => r.error);
  const totalUnits = validRows.reduce(
    (sum, r) => sum + Math.abs(kind === "FACTORY" ? r.delta ?? 0 : r.counted ?? 0),
    0
  );

  async function submitReceipt() {
    if (validRows.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/partner/receipts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          reference: reference.trim() || null,
          notes: notes.trim() || null,
          lines: validRows.map((r) => ({
            variantId: r.variantId,
            quantity: kind === "FACTORY" ? r.delta : r.counted,
          })),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast({ title: json?.error?.message ?? "فشل حفظ الإيصال", variant: "destructive" });
        setConfirmOpen(false);
        return;
      }
      toast({ title: "تم حفظ الإيصال" });
      router.push(`/partner/receipts/${json.data.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (partnerLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64 rounded-lg" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }
  if (partnerError) {
    return (
      <div role="alert" className="rounded-2xl border border-carnelian-500/30 bg-danger-bg p-6 text-danger-text">
        فشل تحميل بيانات الشريك
      </div>
    );
  }
  if (!isAgent) {
    return <RoleGatePanel message="هذه الصفحة متاحة للوكلاء فقط" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="استلام جديد"
        description="سجّل استلاماً من المصنع أو جرداً فعلياً — راجع المعاينة قبل التأكيد."
        badge={<StatusBadge>وكلاء فقط</StatusBadge>}
      />

      <PanelCard title="نوع الإيصال" icon={<Boxes className="h-5 w-5 text-lapis-800" />}>
        <div className="grid gap-4">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="نوع الإيصال">
            <button
              type="button"
              role="radio"
              aria-checked={kind === "FACTORY"}
              onClick={() => setKind("FACTORY")}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-bold transition-colors",
                kind === "FACTORY" ? "bg-lapis-800 text-white" : "bg-stone-100 text-ink-soft hover:bg-stone-200"
              )}
            >
              استلام من المصنع
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={kind === "COUNT"}
              onClick={() => setKind("COUNT")}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-bold transition-colors",
                kind === "COUNT" ? "bg-lapis-800 text-white" : "bg-stone-100 text-ink-soft hover:bg-stone-200"
              )}
            >
              جرد فعلي
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="reference">المرجع (اختياري)</Label>
              <Input
                id="reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="رقم فاتورة أو إذن التسليم"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes">ملاحظات (اختياري)</Label>
              <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="أي تفاصيل إضافية" />
            </div>
          </div>
        </div>
      </PanelCard>

      <PanelCard title="بنود الإيصال" icon={<Plus className="h-5 w-5 text-lapis-800" />}>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "manual" | "upload")}>
          <TabsList>
            <TabsTrigger value="manual">إدخال يدوي</TabsTrigger>
            <TabsTrigger value="upload">رفع ملف</TabsTrigger>
          </TabsList>

          <TabsContent value="manual">
            <div className="grid gap-4">
              <SearchInput
                value={productQuery}
                onChange={setProductQuery}
                placeholder="بحث عن منتج أو SKU"
                className="w-full sm:w-80"
              />
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_8rem_auto] lg:items-end">
                <div className="grid gap-2">
                  <Label htmlFor="variant-select">المتغير</Label>
                  <Select
                    id="variant-select"
                    value={selectedVariantId}
                    onChange={(e) => setSelectedVariantId(e.target.value)}
                  >
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
                    min={kind === "FACTORY" ? 1 : 0}
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value) || 0)}
                  />
                </div>
                <Button type="button" className="rounded-xl" onClick={addManualLine} disabled={!selectedVariantId}>
                  <Plus className="h-4 w-4" />
                  إضافة
                </Button>
              </div>
              {manualLines.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-stone-200">
                  <table className="w-full border-collapse text-right text-sm">
                    <thead className="bg-stone-100">
                      <tr>
                        <th className="px-4 py-2 text-xs font-extrabold text-ink-soft">المتغير</th>
                        <th className="px-4 py-2 text-xs font-extrabold text-ink-soft">
                          {kind === "FACTORY" ? "الكمية المستلمة" : "الجرد الفعلي"}
                        </th>
                        <th className="px-4 py-2 text-xs font-extrabold text-ink-soft">حذف</th>
                      </tr>
                    </thead>
                    <tbody>
                      {manualLines.map((line) => (
                        <tr key={line.variantId} className="border-t border-stone-200">
                          <td className="px-4 py-2">{line.label}</td>
                          <td className="px-4 py-2">{formatNumberEn(line.quantity)}</td>
                          <td className="px-4 py-2">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              aria-label={`حذف ${line.label}`}
                              onClick={() => removeManualLine(line.variantId)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="upload">
            <div
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-stone-300 bg-stone-50 px-6 py-10 text-center"
            >
              <UploadCloud className="h-8 w-8 text-stone-400" strokeWidth={1.5} />
              <p className="text-sm font-bold text-ink">اسحب ملف Excel هنا أو</p>
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={() => fileInputRef.current?.click()}
              >
                اختيار ملف
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                aria-label="اختيار ملف المخزون"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                  e.target.value = "";
                }}
              />
              <p className="text-xs text-ink-soft">
                استخدم ملف &quot;تصدير المخزون&quot; من صفحة المنتجات كقالب — عمود{" "}
                {kind === "FACTORY" ? '"كمية مستلمة"' : '"جرد فعلي"'}.
              </p>
              {uploadFileName && (
                <p className="text-xs text-ink-soft">
                  الملف: {uploadFileName}
                  {uploadParsedCount !== null && ` — ${formatNumberEn(uploadParsedCount)} صف`}
                </p>
              )}
              {uploadLoading && (
                <p className="flex items-center gap-2 text-xs text-ink-soft">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  جاري التحليل…
                </p>
              )}
              {uploadError && (
                <p role="alert" className="text-xs font-bold text-carnelian-600">
                  {uploadError}
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </PanelCard>

      {previewRows.length > 0 && (
        <PanelCard title="المعاينة" icon={<Boxes className="h-5 w-5 text-lapis-800" />} noPadding>
          <div className="overflow-x-auto p-4 sm:p-[22px]">
            <table className="w-full border-collapse text-right text-sm">
              <thead className="bg-stone-100">
                <tr>
                  <th className="px-4 py-2 text-xs font-extrabold text-ink-soft">SKU</th>
                  <th className="px-4 py-2 text-xs font-extrabold text-ink-soft">المنتج</th>
                  <th className="px-4 py-2 text-xs font-extrabold text-ink-soft">الحالي</th>
                  <th className="px-4 py-2 text-xs font-extrabold text-ink-soft">الجديد</th>
                  <th className="px-4 py-2 text-xs font-extrabold text-ink-soft">ملاحظة</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => (
                  <tr
                    key={`${row.sku}-${i}`}
                    className={cn("border-t border-stone-200", row.error && "bg-carnelian-50")}
                  >
                    <td dir="ltr" className="px-4 py-2 text-right font-mono text-xs">
                      {row.sku}
                    </td>
                    <td className="px-4 py-2">{row.product ?? "—"}</td>
                    <td className="px-4 py-2">{row.current !== null ? formatNumberEn(row.current) : "—"}</td>
                    <td className="px-4 py-2 font-bold">
                      {row.newAvailable !== null ? formatNumberEn(row.newAvailable) : "—"}
                    </td>
                    <td className="px-4 py-2">
                      {row.error ? (
                        <span className="flex items-center gap-1 font-bold text-carnelian-600">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {row.error}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PanelCard>
      )}

      <div className="flex items-center justify-between rounded-2xl border border-stone-200 bg-white p-4">
        <p className="text-sm text-ink-soft">
          {formatNumberEn(validRows.length)} بند صالح
          {errorRows.length > 0 && ` · ${formatNumberEn(errorRows.length)} بند به خطأ (لن يُطبّق)`}
          {" · "}
          إجمالي الوحدات: {formatNumberEn(totalUnits)}
        </p>
        <Button type="button" className="rounded-xl" disabled={validRows.length === 0} onClick={() => setConfirmOpen(true)}>
          تأكيد الاستلام
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تأكيد {kind === "FACTORY" ? "الاستلام من المصنع" : "الجرد الفعلي"}</DialogTitle>
            <DialogDescription>
              سيتم تطبيق {formatNumberEn(validRows.length)} بند بإجمالي {formatNumberEn(totalUnits)} وحدة على مخزونك.
              {errorRows.length > 0 && ` سيتم تجاهل ${formatNumberEn(errorRows.length)} بند به خطأ.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)} disabled={submitting}>
              إلغاء
            </Button>
            <Button type="button" onClick={submitReceipt} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              تأكيد الاستلام
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
