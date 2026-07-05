"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { ImageUpload } from "@/components/admin/image-upload";
import { Skeleton } from "@/components/shared/skeleton";

type Category = { id: string; name: string; slug: string };

export default function NewProductPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [imageUrl, setImageUrl] = React.useState("");
  const [weightGrams, setWeightGrams] = React.useState("");
  const [basePricePiastres, setBasePricePiastres] = React.useState("");
  const [discountPricePiastres, setDiscountPricePiastres] = React.useState("");
  const [tagsInput, setTagsInput] = React.useState("");
  const [sortOrder, setSortOrder] = React.useState("0");
  const [active, setActive] = React.useState(true);

  React.useEffect(() => {
    fetch("/api/admin/categories", { credentials: "include" })
      .then((res) => res.json())
      .then((json: { success?: boolean; data?: { id: string; name: string; slug: string }[] }) => {
        if (json?.success && Array.isArray(json.data)) setCategories(json.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !categoryId) {
      toast({ title: "الاسم والفئة مطلوبان", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim() || undefined,
          categoryId,
          description: description.trim() || null,
          imageUrl: imageUrl.trim() || null,
          weightGrams: weightGrams === "" ? null : parseInt(weightGrams, 10),
          basePricePiastres: basePricePiastres === "" ? null : Math.round(parseFloat(basePricePiastres) * 100),
          discountPricePiastres: discountPricePiastres === "" ? null : Math.round(parseFloat(discountPricePiastres) * 100),
          sortOrder: parseInt(sortOrder, 10) || 0,
          active,
          tags: tagsInput
            .split(/\s*-\s*/)
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });
      const json = await res.json();
      const created = json?.data;
      if (res.ok && created?.id) {
        toast({ title: "تم إنشاء المنتج" });
        router.push(`/admin/products/${created.id}`);
      } else {
        toast({ title: json?.error?.message ?? "فشل الحفظ", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton className="h-96 w-full rounded-2xl" />;

  return (
    <div dir="rtl" className="max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/products">← المنتجات</Link>
        </Button>
        <h1 className="text-2xl font-bold">إضافة منتج</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>بيانات المنتج</CardTitle>
          <CardDescription>الاسم، الفئة، الصورة، الوزن، الوسوم والأسعار.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="name">الاسم *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="اسم المنتج"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="slug">الرابط (slug)</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="اختياري - يُنشأ من الاسم"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="categoryId">الفئة *</Label>
              <Select
                id="categoryId"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                required
              >
                <option value="">اختر الفئة</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">الوصف</Label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="flex min-h-[80px] w-full rounded-2xl border border-input bg-background px-4 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="وصف اختياري"
              />
            </div>
            <ImageUpload
              value={imageUrl || null}
              onChange={setImageUrl}
              label="صورة المنتج"
            />
            <div className="grid gap-2">
              <Label htmlFor="imageUrl">أو رابط الصورة يدوياً</Label>
              <Input
                id="imageUrl"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="weightGrams">الوزن (غرام)</Label>
              <Input
                id="weightGrams"
                type="number"
                min={0}
                value={weightGrams}
                onChange={(e) => setWeightGrams(e.target.value)}
                placeholder="للشحن"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sortOrder">أولوية العرض</Label>
              <Input
                id="sortOrder"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">الرقم الأعلى يظهر أولاً في المتجر.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tags">الوسوم</Label>
              <Input
                id="tags"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="وسوم مفصولة بشرطة، مثل: حريمي - دانتيل - قطني"
              />
              <p className="text-xs text-muted-foreground">الوسوم يمكن أن تحتوي مسافات. افصل بين الوسوم بشرطة (-).</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="basePricePiastres">السعر الأساسي (ج.م)</Label>
                <Input
                  id="basePricePiastres"
                  type="number"
                  min={0}
                  step={0.01}
                  value={basePricePiastres}
                  onChange={(e) => setBasePricePiastres(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="discountPricePiastres">سعر التخفيض (ج.م)</Label>
                <Input
                  id="discountPricePiastres"
                  type="number"
                  min={0}
                  step={0.01}
                  value={discountPricePiastres}
                  onChange={(e) => setDiscountPricePiastres(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="active"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="rounded border-input"
              />
              <Label htmlFor="active">المنتج نشط (يظهر في المتجر)</Label>
            </div>
            <div className="flex gap-2 pt-4">
              <Button type="submit" disabled={saving}>
                {saving ? "جاري الحفظ…" : "إنشاء المنتج"}
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href="/admin/products">إلغاء</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
