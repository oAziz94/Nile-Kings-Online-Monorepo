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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
  category: { id: string; name: string; slug: string };
  variants: {
    id: string;
    sku: string;
    name: string;
    colorHex: string | null;
    colorName: string | null;
    pricePiastres: number;
    stockAvailable: number;
    stockReserved: number;
  }[];
};

type Category = { id: string; name: string; slug: string };

export default function AdminProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { toast } = useToast();
  const [product, setProduct] = React.useState<Product | null>(null);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [generateSizesOpen, setGenerateSizesOpen] = React.useState(false);
  const [generateSizesLoading, setGenerateSizesLoading] = React.useState(false);
  const [deleteVariantId, setDeleteVariantId] = React.useState<string | null>(null);
  const [editingVariant, setEditingVariant] = React.useState<Product["variants"][number] | null>(null);
  const [editForm, setEditForm] = React.useState({ name: "", colorHex: "", colorName: "", priceEgp: "", stockAvailable: "" });
  const [savingVariant, setSavingVariant] = React.useState(false);

  const load = React.useCallback(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/admin/products/${id}`, { credentials: "include" }).then((r) => r.json()),
      fetch("/api/admin/categories", { credentials: "include" }).then((r) => r.json()),
    ])
      .then(([prodJson, catJson]) => {
        if (prodJson?.success && prodJson.data) setProduct(prodJson.data);
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
        }),
      });
      const json = await res.json();
      const updated = json?.data;
      if (res.ok && updated) {
        setProduct(updated);
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

  const generateSizes = async () => {
    setGenerateSizesLoading(true);
    try {
      const res = await fetch(`/api/admin/products/${id}/variants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ generateSizes: true }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        toast({ title: "تم إنشاء المقاسات" });
        setGenerateSizesOpen(false);
        load();
      } else toast({ title: json?.error?.message ?? "فشل", variant: "destructive" });
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setGenerateSizesLoading(false);
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

  const openEditVariant = (v: Product["variants"][0]) => {
    setEditingVariant(v);
    setEditForm({
      name: v.name,
      colorHex: v.colorHex ?? "",
      colorName: v.colorName ?? "",
      priceEgp: (v.pricePiastres / 100).toString(),
      stockAvailable: String(v.stockAvailable),
    });
  };

  const saveEditVariant = async () => {
    if (!editingVariant) return;
    const pricePiastres = Math.round(parseFloat(editForm.priceEgp || "0") * 100);
    const stockAvailable = parseInt(editForm.stockAvailable, 10);
    if (isNaN(pricePiastres) || pricePiastres < 0) {
      toast({ title: "أدخل سعراً صحيحاً", variant: "destructive" });
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
          pricePiastres,
          stockAvailable,
        }),
      });
      const json = await res.json();
      const updated = json?.data;
      if (res.ok && updated) {
        setProduct((p) =>
          p
            ? { ...p, variants: p.variants.map((v) => (v.id === updated.id ? updated : v)) }
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
          <CardDescription>تعديل الاسم، الفئة، الصورة، الوزن والأسعار.</CardDescription>
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
              <CardTitle>المتغيرات (المقاسات / الألوان)</CardTitle>
              <CardDescription>المخزون والسعر لكل متغير.</CardDescription>
            </div>
            <Dialog open={generateSizesOpen} onOpenChange={setGenerateSizesOpen}>
              <Button type="button" variant="outline" onClick={() => setGenerateSizesOpen(true)}>
                <Plus className="h-4 w-4" />
                إنشاء مقاسات S–XXL
              </Button>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>إنشاء مقاسات S حتى XXL</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">
                  سيتم إنشاء متغيرات للمقاسات S, M, L, XL, XXL إن لم تكن موجودة. السعر الافتراضي من سعر المنتج.
                </p>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">إلغاء</Button>
                  </DialogClose>
                  <Button onClick={generateSizes} disabled={generateSizesLoading}>
                    {generateSizesLoading ? "جاري…" : "إنشاء"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {product.variants.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 py-12 text-center">
              <Package className="h-10 w-10 text-muted-foreground mb-2" />
              <p className="text-muted-foreground mb-2">لا توجد متغيرات. أنشئ مقاسات S–XXL أو أضف متغيراً يدوياً.</p>
              <Button variant="outline" onClick={() => setGenerateSizesOpen(true)}>إنشاء مقاسات S–XXL</Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>المقاس/الاسم</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>اللون</TableHead>
                  <TableHead>السعر (ج.م)</TableHead>
                  <TableHead>المخزون</TableHead>
                  <TableHead className="w-24 text-left">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {product.variants.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.name}</TableCell>
                    <TableCell>{v.sku}</TableCell>
                    <TableCell>
                      {v.colorName ?? "—"}
                      {v.colorHex && (
                        <span
                          className="mr-2 inline-block h-4 w-4 rounded-full border border-border"
                          style={{ backgroundColor: v.colorHex }}
                        />
                      )}
                    </TableCell>
                    <TableCell>{(v.pricePiastres / 100).toFixed(0)}</TableCell>
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
          )}
        </CardContent>
      </Card>

      {editingVariant && (
        <Dialog open={!!editingVariant} onOpenChange={(o) => !o && setEditingVariant(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>تعديل المتغير</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>المقاس / الاسم</Label>
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
                <Label>السعر (ج.م) *</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={editForm.priceEgp}
                  onChange={(e) => setEditForm((f) => ({ ...f, priceEgp: e.target.value }))}
                />
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
              <p className="text-xs text-muted-foreground">SKU الحالي: {editingVariant.sku} (يُحدَّث تلقائياً عند تغيير الاسم)</p>
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
