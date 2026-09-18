"use client";

/**
 * Backlog 9.8b bulk edit: category / active / tags add-remove / price by amount or percent
 * (base and/or selling), with a preview table of affected variants (SKU, old -> new) before a
 * confirm that writes everything in one transaction (`/api/admin/products/bulk/{preview,apply}`).
 */
import * as React from "react";
import { useToast } from "@/hooks/use-toast";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ProductIdentity } from "@/components/dashboard/product-identity";

type Category = { id: string; name: string };

type PreviewVariant = { id: string; sku: string; oldBasePricePiastres: number | null; newBasePricePiastres: number | null; oldPricePiastres: number; newPricePiastres: number };
type PreviewProduct = {
  id: string;
  name: string;
  slug: string;
  categoryChange: { fromId: string; toId: string } | null;
  activeChange: { from: boolean; to: boolean } | null;
  tagsAfter: string[] | null;
  variants: PreviewVariant[];
};

export function BulkEditDialog({
  open,
  onOpenChange,
  productIds,
  categories,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productIds: string[];
  categories: Category[];
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [step, setStep] = React.useState<"form" | "preview">("form");
  const [categoryId, setCategoryId] = React.useState("");
  const [activeMode, setActiveMode] = React.useState<"" | "true" | "false">("");
  const [tagsAdd, setTagsAdd] = React.useState("");
  const [tagsRemove, setTagsRemove] = React.useState("");
  const [priceEnabled, setPriceEnabled] = React.useState(false);
  const [priceField, setPriceField] = React.useState<"base" | "selling" | "both">("selling");
  const [priceMode, setPriceMode] = React.useState<"amount" | "percent">("percent");
  const [priceValue, setPriceValue] = React.useState("");
  const [preview, setPreview] = React.useState<PreviewProduct[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [applying, setApplying] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setStep("form");
      setCategoryId("");
      setActiveMode("");
      setTagsAdd("");
      setTagsRemove("");
      setPriceEnabled(false);
      setPriceValue("");
      setPreview([]);
    }
  }, [open]);

  const buildBody = () => {
    const body: Record<string, unknown> = { productIds };
    if (categoryId) body.categoryId = categoryId;
    if (activeMode) body.active = activeMode === "true";
    const add = tagsAdd.split(/\s*-\s*/).map((t) => t.trim()).filter(Boolean);
    const remove = tagsRemove.split(/\s*-\s*/).map((t) => t.trim()).filter(Boolean);
    if (add.length) body.tagsAdd = add;
    if (remove.length) body.tagsRemove = remove;
    if (priceEnabled && priceValue !== "") {
      const value = priceMode === "percent" ? parseFloat(priceValue) : Math.round(parseFloat(priceValue) * 100);
      body.price = { field: priceField, mode: priceMode, value };
    }
    return body;
  };

  const loadPreview = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/products/bulk/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(buildBody()),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        setPreview(json.data.products);
        setStep("preview");
      } else {
        toast({ title: json?.error?.message ?? "فشل التحضير", variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  const apply = async () => {
    setApplying(true);
    try {
      const res = await fetch("/api/admin/products/bulk/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(buildBody()),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        toast({ title: `تم تعديل ${json.data.updated} منتج` });
        onDone();
      } else {
        toast({ title: json?.error?.message ?? "فشل التعديل", variant: "destructive" });
      }
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle>تعديل جماعي ({productIds.length} منتج)</DialogTitle>
          <DialogDescription>
            {step === "form" ? "اختر التعديلات المطلوبة، ثم عاين التأثير قبل التأكيد." : "عاين التغييرات قبل التأكيد النهائي."}
          </DialogDescription>
        </DialogHeader>

        {step === "form" ? (
          <div className="space-y-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="bulk-category">الفئة</Label>
              <Select id="bulk-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">بدون تغيير</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bulk-active">الحالة</Label>
              <Select id="bulk-active" value={activeMode} onChange={(e) => setActiveMode(e.target.value as typeof activeMode)}>
                <option value="">بدون تغيير</option>
                <option value="true">تفعيل</option>
                <option value="false">تعطيل</option>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="bulk-tags-add">إضافة وسوم</Label>
                <Input id="bulk-tags-add" value={tagsAdd} onChange={(e) => setTagsAdd(e.target.value)} placeholder="وسوم مفصولة بشرطة" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="bulk-tags-remove">إزالة وسوم</Label>
                <Input id="bulk-tags-remove" value={tagsRemove} onChange={(e) => setTagsRemove(e.target.value)} placeholder="وسوم مفصولة بشرطة" />
              </div>
            </div>
            <div className="rounded-xl border border-stone-200 p-3">
              <label htmlFor="bulk-price-enabled" className="flex items-center gap-2 text-sm font-bold">
                <input id="bulk-price-enabled" type="checkbox" checked={priceEnabled} onChange={(e) => setPriceEnabled(e.target.checked)} className="rounded border-input" />
                تعديل الأسعار
              </label>
              {priceEnabled && (
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="bulk-price-field">السعر</Label>
                    <Select id="bulk-price-field" value={priceField} onChange={(e) => setPriceField(e.target.value as typeof priceField)}>
                      <option value="base">قبل الخصم</option>
                      <option value="selling">البيع</option>
                      <option value="both">كلاهما</option>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="bulk-price-mode">الطريقة</Label>
                    <Select id="bulk-price-mode" value={priceMode} onChange={(e) => setPriceMode(e.target.value as typeof priceMode)}>
                      <option value="percent">نسبة %</option>
                      <option value="amount">مبلغ (ج.م)</option>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="bulk-price-value">{priceMode === "percent" ? "النسبة %" : "المبلغ (ج.م)"}</Label>
                    <Input id="bulk-price-value" type="number" step={0.01} value={priceValue} onChange={(e) => setPriceValue(e.target.value)} placeholder={priceMode === "percent" ? "مثال: 10 أو -10" : "مثال: 5 أو -5"} />
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="max-h-[50vh] space-y-4 overflow-y-auto py-2">
            {preview.map((p) => (
              <div key={p.id} className="rounded-xl border border-stone-200 p-3">
                <ProductIdentity name={p.name} identifier={p.slug} nameClassName="text-sm font-bold text-ink" />
                <ul className="mt-1 space-y-0.5 text-xs text-ink-soft">
                  {p.categoryChange && <li>الفئة تتغيّر</li>}
                  {p.activeChange && <li>الحالة: {p.activeChange.from ? "نشط" : "معطّل"} ← {p.activeChange.to ? "نشط" : "معطّل"}</li>}
                  {p.tagsAfter && <li>الوسوم بعد التعديل: {p.tagsAfter.join("، ") || "—"}</li>}
                </ul>
                {p.variants.length > 0 && (
                  <Table className="mt-2">
                    <TableHeader>
                      <TableRow>
                        <TableHead>SKU</TableHead>
                        <TableHead>السعر قبل</TableHead>
                        <TableHead>بعد</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {p.variants
                        .filter((v) => v.newPricePiastres !== v.oldPricePiastres || v.newBasePricePiastres !== v.oldBasePricePiastres)
                        .map((v) => (
                          <TableRow key={v.id}>
                            <TableCell dir="ltr" className="font-mono text-xs">{v.sku}</TableCell>
                            <TableCell>{(v.oldPricePiastres / 100).toFixed(2)}</TableCell>
                            <TableCell>{(v.newPricePiastres / 100).toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          {step === "form" ? (
            <>
              <Button type="button" variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>إلغاء</Button>
              <Button type="button" className="rounded-full" disabled={loading} onClick={loadPreview}>
                {loading ? "جاري التحضير…" : "معاينة"}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" className="rounded-full" onClick={() => setStep("form")}>رجوع</Button>
              <Button type="button" className="rounded-full" disabled={applying} onClick={apply}>
                {applying ? "جاري التنفيذ…" : "تأكيد"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
