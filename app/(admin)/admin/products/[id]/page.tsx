"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminTableScroll } from "@/components/admin/admin-table-scroll";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ImageUpload } from "@/components/admin/image-upload";
import { Skeleton } from "@/components/shared/skeleton";
import { Package, Pencil, Plus, Trash2 } from "lucide-react";

type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  active: boolean;
  weightGrams: number | null;
  basePricePiastres: number | null;
  discountPricePiastres: number | null;
  tags: string[];
  category: { id: string; name: string; slug: string };
  variants: {
    id: string;
    sku: string;
    name: string;
    colorHex: string | null;
    colorName: string | null;
    imageUrl: string | null;
    basePricePiastres: number | null;
    pricePiastres: number;
    stockAvailable: number;
    stockReserved: number;
  }[];
};

type Category = { id: string; name: string; slug: string };

type ProductVariant = Product["variants"][number];

const SIZE_ORDER = ["S", "M", "L", "XL", "XXL", "XXXL", "4XL"];

function normalizeSizeName(sizeName: string): string {
  const key = sizeName.trim().toUpperCase();
  if (key === "3XL") return "XXXL";
  if (key === "4X") return "4XL";
  return key;
}

function sizeSortIndex(sizeName: string): number {
  const index = SIZE_ORDER.indexOf(normalizeSizeName(sizeName));
  return index === -1 ? SIZE_ORDER.length : index;
}

function variantColorHexSortKey(v: Pick<ProductVariant, "colorHex" | "colorName">): string {
  const colorHex = v.colorHex?.trim().toLocaleLowerCase();
  return colorHex || variantSwatchHex(v).toLocaleLowerCase();
}

function sortVariants(variants: ProductVariant[]): ProductVariant[] {
  return [...variants].sort((a, b) => {
    const colorHexDelta = variantColorHexSortKey(a).localeCompare(variantColorHexSortKey(b), undefined, {
      numeric: true,
      sensitivity: "base",
    });
    if (colorHexDelta !== 0) return colorHexDelta;

    const sizeDelta = sizeSortIndex(a.name) - sizeSortIndex(b.name);
    if (sizeDelta !== 0) return sizeDelta;

    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  });
}

function sortProductVariants<T extends Product>(product: T): T {
  return { ...product, variants: sortVariants(product.variants) };
}

/** Admin swatch: use variant colorHex, or infer from colorName so أسود/أبيض show correctly. */
function variantSwatchHex(v: { colorHex: string | null; colorName: string | null }): string {
  if (v.colorHex?.trim()) return v.colorHex.trim();
  const name = (v.colorName ?? "").trim().toLowerCase();
  const map: Record<string, string> = {
    أسود: "#000000", أبيض: "#ffffff", أحمر: "#b71c1c", أزرق: "#0d47a1",
    أخضر: "#1b5e20", أصفر: "#f9a825", برتقالي: "#e65100", رمادي: "#616161",
    وردي: "#ad1457", بني: "#3e2723", بيج: "#d7ccc8", كحلي: "#0d47a1",
    black: "#000000", white: "#ffffff", red: "#b71c1c", blue: "#0d47a1",
    green: "#1b5e20", yellow: "#f9a825", grey: "#616161", gray: "#616161",
    pink: "#ad1457", brown: "#3e2723", beige: "#d7ccc8", navy: "#0d47a1",
    orange: "#e65100",
  };
  return map[name] ?? "#9e9e9e";
}

export default function AdminProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { toast } = useToast();
  const [product, setProduct] = React.useState<Product | null>(null);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [deleteVariantId, setDeleteVariantId] = React.useState<string | null>(null);
  const [addVariantOpen, setAddVariantOpen] = React.useState(false);
  const [addVariantLoading, setAddVariantLoading] = React.useState(false);
  const [addForm, setAddForm] = React.useState({
    size: "",
    sizeCustom: "",
    colorName: "",
    colorHex: "",
    imageUrl: "",
    originalEgp: "",
    discountedEgp: "",
    stockAvailable: "0",
  });
  const [editingVariant, setEditingVariant] = React.useState<Product["variants"][number] | null>(null);
  const [editForm, setEditForm] = React.useState({
    name: "",
    colorHex: "",
    colorName: "",
    imageUrl: "",
    originalEgp: "",
    priceEgp: "",
    stockAvailable: "",
  });
  const [savingVariant, setSavingVariant] = React.useState(false);
  const [tagsInput, setTagsInput] = React.useState("");

  const defaultOriginalEgp = product ? (product.basePricePiastres != null ? product.basePricePiastres / 100 : "") : "";
  const defaultDiscountEgp = product ? (product.discountPricePiastres != null ? product.discountPricePiastres / 100 : "") : "";
  const sortedVariants = React.useMemo(
    () => (product ? sortVariants(product.variants) : []),
    [product]
  );

  const load = React.useCallback(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/admin/products/${id}`, { credentials: "include" }).then((r) => r.json()),
      fetch("/api/admin/categories", { credentials: "include" }).then((r) => r.json()),
    ])
      .then(([prodJson, catJson]) => {
        if (prodJson?.success && prodJson.data) {
          setProduct(sortProductVariants(prodJson.data));
          setTagsInput((prodJson.data.tags ?? []).join(" - "));
        }
        if (catJson?.success && Array.isArray(catJson.data)) setCategories(catJson.data);
      })
      .catch(() => toast({ title: "فشل التحميل", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [id, toast]);

  React.useEffect(() => load(), [load]);

  const saveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: product.name,
          slug: product.slug,
          categoryId: product.category.id,
          description: product.description,
          imageUrl: product.imageUrl,
          weightGrams: product.weightGrams ?? undefined,
          basePricePiastres: product.basePricePiastres ?? undefined,
          discountPricePiastres: product.discountPricePiastres ?? undefined,
          active: product.active,
          tags: tagsInput
            .split(/\s*-\s*/)
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });
      const json = await res.json();
      const updated = json?.data;
      if (res.ok && updated) {
        setProduct(sortProductVariants(updated));
        setTagsInput((updated.tags ?? []).join(" - "));
        toast({ title: "تم حفظ المنتج" });
      } else {
        toast({ title: json?.error?.message ?? "فشل الحفظ", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteVariant = async (variantId: string) => {
    try {
      const res = await fetch(`/api/admin/variants/${variantId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json();
      if (res.ok && json?.data) {
        toast({ title: "تم حذف المتغير" });
        setDeleteVariantId(null);
        load();
      } else toast({ title: json?.error?.message ?? "فشل الحذف", variant: "destructive" });
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    }
  };

  const openAddVariant = () => {
    setAddForm({
      size: "",
      sizeCustom: "",
      colorName: "",
      colorHex: "",
      imageUrl: "",
      originalEgp: product ? (product.basePricePiastres != null ? (product.basePricePiastres / 100).toString() : "") : "",
      discountedEgp: product ? (product.discountPricePiastres != null ? (product.discountPricePiastres / 100).toString() : "") : "",
      stockAvailable: "0",
    });
    setAddVariantOpen(true);
  };

  const addVariant = async () => {
    if (!product) return;
    const size = addForm.size === "custom" ? addForm.sizeCustom.trim() : addForm.size;
    if (!size) {
      toast({ title: "اختر المقاس أو أدخل مقاساً", variant: "destructive" });
      return;
    }
    if (!addForm.colorName.trim()) {
      toast({ title: "أدخل اسم اللون", variant: "destructive" });
      return;
    }
    const originalPiastres = addForm.originalEgp === "" ? null : Math.round(parseFloat(addForm.originalEgp) * 100);
    const discountedPiastres = addForm.discountedEgp === "" ? null : Math.round(parseFloat(addForm.discountedEgp) * 100);
    if (discountedPiastres === null || discountedPiastres < 0) {
      toast({ title: "سعر التخفيض مطلوب ويجب أن يكون غير سالب", variant: "destructive" });
      return;
    }
    setAddVariantLoading(true);
    try {
      const res = await fetch(`/api/admin/products/${id}/variants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: size,
          colorName: addForm.colorName.trim() || null,
          colorHex: addForm.colorHex.trim() || null,
          imageUrl: addForm.imageUrl.trim() || null,
          basePricePiastres: originalPiastres,
          pricePiastres: discountedPiastres,
          stockAvailable: parseInt(addForm.stockAvailable, 10) || 0,
        }),
      });
      const text = await res.text();
      let json: { success?: boolean; data?: unknown; error?: { message?: string } };
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        toast({ title: res.ok ? "خطأ في الاتصال" : `خطأ من الخادم (${res.status})`, variant: "destructive" });
        return;
      }
      if (res.ok && json?.data) {
        toast({ title: "تم إضافة المتغير" });
        setAddVariantOpen(false);
        load();
      } else {
        toast({ title: json?.error?.message ?? "فشل الإضافة", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setAddVariantLoading(false);
    }
  };

  const openEditVariant = (v: Product["variants"][0]) => {
    setEditingVariant(v);
    setEditForm({
      name: v.name,
      colorHex: v.colorHex ?? "",
      colorName: v.colorName ?? "",
      imageUrl: v.imageUrl ?? "",
      originalEgp: v.basePricePiastres != null ? (v.basePricePiastres / 100).toString() : "",
      priceEgp: (v.pricePiastres / 100).toString(),
      stockAvailable: String(v.stockAvailable),
    });
  };

  const saveEditVariant = async () => {
    if (!editingVariant) return;
    const pricePiastres = Math.round(parseFloat(editForm.priceEgp || "0") * 100);
    const basePricePiastres = editForm.originalEgp === "" ? null : Math.round(parseFloat(editForm.originalEgp) * 100);
    const stockAvailable = parseInt(editForm.stockAvailable, 10);
    if (isNaN(pricePiastres) || pricePiastres < 0) {
      toast({ title: "أدخل سعر التخفيض صحيحاً", variant: "destructive" });
      return;
    }
    if (basePricePiastres !== null && (isNaN(basePricePiastres) || basePricePiastres < 0)) {
      toast({ title: "السعر الأساسي يجب أن يكون غير سالب", variant: "destructive" });
      return;
    }
    if (isNaN(stockAvailable) || stockAvailable < 0) {
      toast({ title: "أدخل كمية مخزون صحيحة", variant: "destructive" });
      return;
    }
    setSavingVariant(true);
    try {
      const res = await fetch(`/api/admin/variants/${editingVariant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: editForm.name.trim() || editingVariant.name,
          colorHex: editForm.colorHex.trim() || null,
          colorName: editForm.colorName.trim() || null,
          imageUrl: editForm.imageUrl.trim() || null,
          basePricePiastres,
          pricePiastres,
          stockAvailable,
        }),
      });
      const json = await res.json();
      const updated = json?.data;
      if (res.ok && updated) {
        setProduct((p) =>
          p
            ? { ...p, variants: sortVariants(p.variants.map((v) => (v.id === updated.id ? updated : v))) }
            : p
        );
        setEditingVariant(null);
        toast({ title: "تم حفظ المتغير" });
      } else {
        toast({ title: json?.error?.message ?? "فشل الحفظ", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setSavingVariant(false);
    }
  };

  if (loading || !product) {
    return (
      <div dir="rtl" className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/products">← المنتجات</Link>
        </Button>
        <h1 className="text-2xl font-bold">{product.name}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>بيانات المنتج</CardTitle>
          <CardDescription>تعديل الاسم، الفئة، الصورة، الوزن، الوسوم والأسعار.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveProduct} className="space-y-4">
            <div className="grid gap-2">
              <Label>الاسم *</Label>
              <Input
                value={product.name}
                onChange={(e) => setProduct((p) => (p ? { ...p, name: e.target.value } : p))}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label>الرابط (slug)</Label>
              <Input
                value={product.slug}
                onChange={(e) => setProduct((p) => (p ? { ...p, slug: e.target.value } : p))}
              />
            </div>
            <div className="grid gap-2">
              <Label>الفئة</Label>
              <Select
                value={product.category.id}
                onChange={(e) =>
                  setProduct((p) => {
                    if (!p) return p;
                    const c = categories.find((x) => x.id === e.target.value);
                    return c ? { ...p, category: c } : p;
                  })
                }
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </div>
            <ImageUpload
              value={product.imageUrl}
              onChange={(url) => setProduct((p) => (p ? { ...p, imageUrl: url } : p))}
              label="صورة المنتج"
              disabled={saving}
            />
            <div className="grid gap-2">
              <Label>أو رابط الصورة يدوياً</Label>
              <Input
                value={product.imageUrl ?? ""}
                onChange={(e) => setProduct((p) => (p ? { ...p, imageUrl: e.target.value || null } : p))}
              />
            </div>
            <div className="grid gap-2">
              <Label>الوزن (غرام)</Label>
              <Input
                type="number"
                min={0}
                value={product.weightGrams ?? ""}
                onChange={(e) =>
                  setProduct((p) => (p ? { ...p, weightGrams: e.target.value === "" ? null : parseInt(e.target.value, 10) || 0 } : p))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>الوسوم</Label>
              <Input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="وسوم مفصولة بشرطة، مثل: حريمي - دانتيل - قطني"
              />
              <p className="text-xs text-muted-foreground">الوسوم يمكن أن تحتوي مسافات. افصل بين الوسوم بشرطة (-).</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>السعر الأساسي (ج.م)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={product.basePricePiastres != null ? product.basePricePiastres / 100 : ""}
                  onChange={(e) =>
                    setProduct((p) =>
                      p ? { ...p, basePricePiastres: e.target.value === "" ? null : Math.round(parseFloat(e.target.value) * 100) } : p
                    )
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>سعر التخفيض (ج.م)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={product.discountPricePiastres != null ? product.discountPricePiastres / 100 : ""}
                  onChange={(e) =>
                    setProduct((p) =>
                      p ? { ...p, discountPricePiastres: e.target.value === "" ? null : Math.round(parseFloat(e.target.value) * 100) } : p
                    )
                  }
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={product.active}
                onChange={(e) => setProduct((p) => (p ? { ...p, active: e.target.checked } : p))}
                className="rounded border-input"
              />
              <Label>المنتج نشط</Label>
            </div>
            <Button type="submit" disabled={saving}>{saving ? "جاري الحفظ…" : "حفظ المنتج"}</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>المتغيرات (المقاس + اللون)</CardTitle>
              <CardDescription>أسعار المنتج تُنسخ تلقائياً؛ يمكنك تعديل أسعار كل متغير.</CardDescription>
            </div>
            <Button type="button" variant="default" onClick={openAddVariant}>
              <Plus className="h-4 w-4" />
              إضافة متغير
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {sortedVariants.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 py-12 text-center">
              <Package className="h-10 w-10 text-muted-foreground mb-2" />
              <p className="text-muted-foreground mb-2">لا توجد متغيرات. أضِ متغيراً (مقاس + لون).</p>
              <Button variant="default" onClick={openAddVariant}>إضافة متغير</Button>
            </div>
          ) : (
            <AdminTableScroll>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>المقاس</TableHead>
                  <TableHead>اللون</TableHead>
                  <TableHead>السعر الأساسي (ج.م)</TableHead>
                  <TableHead>سعر التخفيض (ج.م)</TableHead>
                  <TableHead>المخزون</TableHead>
                  <TableHead className="w-24 text-left">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedVariants.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.name}</TableCell>
                    <TableCell>
                      <span className="mr-2 inline-block h-4 w-4 rounded-full border border-border shrink-0 align-middle" style={{ backgroundColor: variantSwatchHex(v) }} />
                      {v.colorName ?? "—"}
                    </TableCell>
                    <TableCell>{v.basePricePiastres != null ? (v.basePricePiastres / 100).toFixed(2) : "—"}</TableCell>
                    <TableCell>{(v.pricePiastres / 100).toFixed(2)}</TableCell>
                    <TableCell>{v.stockAvailable} (محجوز: {v.stockReserved})</TableCell>
                    <TableCell className="text-left">
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditVariant(v)}
                          title="تعديل"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteVariantId(v.id)}
                          disabled={v.stockReserved > 0}
                          title="حذف"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </AdminTableScroll>
          )}
        </CardContent>
      </Card>

      <Dialog open={addVariantOpen} onOpenChange={setAddVariantOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة متغير</DialogTitle>
            <DialogDescription>اختر المقاس واللون؛ الأسعار تُنسخ من المنتج ويمكنك تعديلها.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>المقاس *</Label>
              <div className="flex gap-2">
                <Select
                  value={addForm.size}
                  onChange={(e) => setAddForm((f) => ({ ...f, size: e.target.value }))}
                >
                  <option value="">اختر المقاس</option>
                  <option value="S">S</option>
                  <option value="M">M</option>
                  <option value="L">L</option>
                  <option value="XL">XL</option>
                  <option value="XXL">XXL</option>
                  <option value="custom">آخر (أدخل يدوياً)</option>
                </Select>
                {addForm.size === "custom" && (
                  <Input
                    value={addForm.sizeCustom}
                    onChange={(e) => setAddForm((f) => ({ ...f, sizeCustom: e.target.value }))}
                    placeholder="المقاس"
                  />
                )}
              </div>
            </div>
            <div className="grid gap-2">
              <Label>اسم اللون *</Label>
              <Input
                value={addForm.colorName}
                onChange={(e) => setAddForm((f) => ({ ...f, colorName: e.target.value }))}
                placeholder="مثل: أسود، أبيض"
              />
            </div>
            <div className="grid gap-2">
              <Label>كود اللون (اختياري)</Label>
              <Input
                type="text"
                value={addForm.colorHex}
                onChange={(e) => setAddForm((f) => ({ ...f, colorHex: e.target.value }))}
                placeholder="#000000"
              />
            </div>
            <div className="grid gap-2">
              <Label>صورة اللون (اختياري)</Label>
              <p className="text-xs text-muted-foreground">تظهر على صفحة المنتج عند اختيار هذا اللون</p>
              <ImageUpload
                value={addForm.imageUrl || null}
                onChange={(url) => setAddForm((f) => ({ ...f, imageUrl: url ?? "" }))}
                label=""
                disabled={addVariantLoading}
              />
              <Input
                type="url"
                value={addForm.imageUrl}
                onChange={(e) => setAddForm((f) => ({ ...f, imageUrl: e.target.value }))}
                placeholder="أو رابط الصورة يدوياً"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>السعر الأساسي (ج.م)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={addForm.originalEgp}
                  onChange={(e) => setAddForm((f) => ({ ...f, originalEgp: e.target.value }))}
                  placeholder={defaultOriginalEgp ? String(defaultOriginalEgp) : "من المنتج"}
                />
              </div>
              <div className="grid gap-2">
                <Label>سعر التخفيض (ج.م) *</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={addForm.discountedEgp}
                  onChange={(e) => setAddForm((f) => ({ ...f, discountedEgp: e.target.value }))}
                  placeholder={defaultDiscountEgp ? String(defaultDiscountEgp) : "من المنتج"}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>الكمية المتاحة</Label>
              <Input
                type="number"
                min={0}
                value={addForm.stockAvailable}
                onChange={(e) => setAddForm((f) => ({ ...f, stockAvailable: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">إلغاء</Button>
            </DialogClose>
            <Button onClick={addVariant} disabled={addVariantLoading}>
              {addVariantLoading ? "جاري الإضافة…" : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editingVariant && (
        <Dialog open={!!editingVariant} onOpenChange={(o) => !o && setEditingVariant(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>تعديل المتغير</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>المقاس</Label>
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="مثل: M, L, XL"
                />
              </div>
              <div className="grid gap-2">
                <Label>اسم اللون (اختياري)</Label>
                <Input
                  value={editForm.colorName}
                  onChange={(e) => setEditForm((f) => ({ ...f, colorName: e.target.value }))}
                  placeholder="مثل: أسود"
                />
              </div>
              <div className="grid gap-2">
                <Label>كود اللون (اختياري)</Label>
                <Input
                  type="text"
                  value={editForm.colorHex}
                  onChange={(e) => setEditForm((f) => ({ ...f, colorHex: e.target.value }))}
                  placeholder="#000000"
                />
              </div>
              <div className="grid gap-2">
                <Label>صورة اللون (اختياري)</Label>
                <p className="text-xs text-muted-foreground">تظهر على صفحة المنتج عند اختيار هذا اللون</p>
                <ImageUpload
                  value={editForm.imageUrl || null}
                  onChange={(url) => setEditForm((f) => ({ ...f, imageUrl: url ?? "" }))}
                  label=""
                  disabled={savingVariant}
                />
                <Input
                  type="url"
                  value={editForm.imageUrl}
                  onChange={(e) => setEditForm((f) => ({ ...f, imageUrl: e.target.value }))}
                  placeholder="أو رابط الصورة يدوياً"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>السعر الأساسي (ج.م)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={editForm.originalEgp}
                    onChange={(e) => setEditForm((f) => ({ ...f, originalEgp: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>سعر التخفيض (ج.م) *</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={editForm.priceEgp}
                    onChange={(e) => setEditForm((f) => ({ ...f, priceEgp: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>الكمية المتاحة *</Label>
                <Input
                  type="number"
                  min={0}
                  value={editForm.stockAvailable}
                  onChange={(e) => setEditForm((f) => ({ ...f, stockAvailable: e.target.value }))}
                />
              </div>
              <p className="text-xs text-muted-foreground">SKU: {editingVariant.sku}</p>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">إلغاء</Button>
              </DialogClose>
              <Button onClick={saveEditVariant} disabled={savingVariant}>
                {savingVariant ? "جاري الحفظ…" : "حفظ"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {deleteVariantId && (
        <Dialog open={!!deleteVariantId} onOpenChange={(o) => !o && setDeleteVariantId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>حذف المتغير</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">هل أنت متأكد؟ لا يمكن التراجع.</p>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">إلغاء</Button>
              </DialogClose>
              <Button variant="destructive" onClick={() => deleteVariant(deleteVariantId)}>
                حذف
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
