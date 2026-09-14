"use client";

/**
 * `/admin/products/[id]` — rebuilt per backlog 9.8b (`Product.dc.html`, generator block 9):
 * colours + sizes, inline gallery per colour, no stock field anywhere. Left column: الألوان
 * (chips, the selected colour's panel + معرض هذا اللون inline gallery + مقاسات لون «X» table);
 * right column: بيانات المنتج، صورة المنتج الرئيسية، السعر الافتراضي. `stockAvailable`/
 * `stockReserved` are never shown or written here (06-admin-v2.md §3.5 ownership rule) — stock
 * lives entirely under الشركاء's مخزون الشبكة, one link out to it.
 */
import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/dashboard/page-header";
import { PanelCard } from "@/components/dashboard/panel-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/dashboard/table-scroll";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { MediaPickerDialog } from "@/components/admin/media-picker-dialog";
import { Skeleton } from "@/components/shared/skeleton";
import { sortVariants } from "@/lib/admin/variant-sort";
import { getDisplaySizeLabel, isKidsCategory } from "@/lib/size-display";
import { STANDARD_SIZE_RUN } from "@/lib/admin/slug";
import { Package, Plus, Trash2, Upload, ImageIcon, ExternalLink, ChevronUp, ChevronDown, Star } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = {
  id: string;
  sku: string;
  slug: string | null;
  name: string;
  colorHex: string | null;
  colorName: string | null;
  imageUrl: string | null;
  imageAssetId: string | null;
  basePricePiastres: number | null;
  pricePiastres: number;
  active: boolean;
  partnerCount: number;
};

type VariantImageRow = { id: string; colorKey: string; url: string; assetId: string | null; sortOrder: number };

type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  active: boolean;
  sortOrder: number;
  weightGrams: number | null;
  basePricePiastres: number | null;
  discountPricePiastres: number | null;
  tags: string[];
  category: { id: string; name: string; slug: string };
  variants: Variant[];
  variantImages: VariantImageRow[];
};

type Category = { id: string; name: string; slug: string };

function colorKeyOf(v: { colorName: string | null; colorHex: string | null }): string {
  return `${v.colorName ?? ""}|${v.colorHex ?? ""}`;
}

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

type Colour = { colorKey: string; colorName: string | null; colorHex: string | null; active: boolean; variants: Variant[] };

function groupColours(variants: Variant[]): Colour[] {
  const map = new Map<string, Colour>();
  for (const v of variants) {
    const key = colorKeyOf(v);
    const existing = map.get(key);
    if (existing) {
      existing.variants.push(v);
    } else {
      map.set(key, { colorKey: key, colorName: v.colorName, colorHex: v.colorHex, active: v.active, variants: [v] });
    }
  }
  return Array.from(map.values());
}

async function uploadFile(file: File): Promise<string | null> {
  const buf = await file.arrayBuffer();
  const base64 = btoa(new Uint8Array(buf).reduce((acc, byte) => acc + String.fromCharCode(byte), ""));
  const res = await fetch("/api/admin/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ image: `data:${file.type};base64,${base64}`, contentType: file.type }),
  });
  const json = await res.json();
  return res.ok && json?.success ? (json.data.assetId as string) : null;
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
  const [selectedColorKey, setSelectedColorKey] = React.useState<string | null>(null);
  const [tagsInput, setTagsInput] = React.useState("");
  const [colorNameDraft, setColorNameDraft] = React.useState("");
  const [colorHexDraft, setColorHexDraft] = React.useState("");
  const [savingColor, setSavingColor] = React.useState(false);
  const [newColorOpen, setNewColorOpen] = React.useState(false);
  const [addSizeOpen, setAddSizeOpen] = React.useState(false);
  const [galleryPickerOpen, setGalleryPickerOpen] = React.useState(false);
  const [heroPickerOpen, setHeroPickerOpen] = React.useState(false);
  const [representativePickerOpen, setRepresentativePickerOpen] = React.useState(false);
  const [rowDrafts, setRowDrafts] = React.useState<Record<string, { pricePiastres: string; basePricePiastres: string }>>({});
  const [savingRow, setSavingRow] = React.useState<string | null>(null);
  const galleryUploadRef = React.useRef<HTMLInputElement>(null);
  const heroUploadRef = React.useRef<HTMLInputElement>(null);
  const [uploadingGallery, setUploadingGallery] = React.useState(false);
  const [uploadingHero, setUploadingHero] = React.useState(false);
  const [dragImageId, setDragImageId] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/admin/products/${id}`, { credentials: "include" }).then((r) => r.json()),
      fetch("/api/admin/categories", { credentials: "include" }).then((r) => r.json()),
    ])
      .then(([prodJson, catJson]) => {
        if (prodJson?.success && prodJson.data) {
          const p = prodJson.data as Product;
          setProduct(p);
          setTagsInput((p.tags ?? []).join(" - "));
          setSelectedColorKey((prev) => {
            const colours = groupColours(p.variants);
            if (prev && colours.some((c) => c.colorKey === prev)) return prev;
            return colours[0]?.colorKey ?? null;
          });
        }
        if (catJson?.success && Array.isArray(catJson.data)) setCategories(catJson.data);
      })
      .catch(() => toast({ title: "فشل التحميل", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [id, toast]);

  React.useEffect(() => load(), [load]);

  const colours = React.useMemo(() => (product ? groupColours(product.variants) : []), [product]);
  const selectedColour = colours.find((c) => c.colorKey === selectedColorKey) ?? null;
  const forKidsSizes = isKidsCategory(product?.category.slug);

  React.useEffect(() => {
    if (selectedColour) {
      setColorNameDraft(selectedColour.colorName ?? "");
      setColorHexDraft(selectedColour.colorHex ?? "");
    }
  }, [selectedColour?.colorKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const gallery = React.useMemo(
    () => (product && selectedColorKey ? product.variantImages.filter((vi) => vi.colorKey === selectedColorKey) : []),
    [product, selectedColorKey]
  );

  // The colour's representative image is an explicit choice (PM ruling, 9.8b review) — never
  // derived from the gallery's first photo. Every variant sharing a colour is kept in sync by
  // the representative route, so reading it off any one of them (the first) is enough.
  const representativeAssetId = selectedColour?.variants[0]?.imageAssetId ?? null;
  const representativeUrl = selectedColour?.variants[0]?.imageUrl ?? null;
  const isRepresentativeImage = React.useCallback(
    (img: VariantImageRow) => (representativeAssetId ? img.assetId === representativeAssetId : representativeUrl != null && img.url === representativeUrl),
    [representativeAssetId, representativeUrl]
  );

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
          sortOrder: product.sortOrder,
          active: product.active,
          tags: tagsInput.split(/\s*-\s*/).map((t) => t.trim()).filter(Boolean),
        }),
      });
      const json = await res.json();
      if (res.ok && json?.data) {
        toast({ title: "تم حفظ المنتج" });
        load();
      } else {
        toast({ title: json?.error?.message ?? "فشل الحفظ", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggleColorVisible = async (active: boolean) => {
    if (!selectedColour) return;
    const res = await fetch(`/api/admin/products/${id}/colors/${encodeURIComponent(selectedColour.colorKey)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ active }),
    });
    const json = await res.json();
    if (res.ok && json?.success) {
      toast({ title: active ? "أصبح اللون مرئياً" : "أصبح اللون مخفياً" });
      load();
    } else {
      toast({ title: json?.error?.message ?? "فشل التغيير", variant: "destructive" });
    }
  };

  const saveColorDetails = async () => {
    if (!selectedColour) return;
    setSavingColor(true);
    try {
      const res = await fetch(`/api/admin/products/${id}/colors/${encodeURIComponent(selectedColour.colorKey)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ colorName: colorNameDraft.trim(), colorHex: colorHexDraft.trim() || null }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        toast({ title: "تم حفظ اللون" });
        setSelectedColorKey(json.data.colorKey);
        load();
      } else {
        toast({ title: json?.error?.message ?? "فشل الحفظ", variant: "destructive" });
      }
    } finally {
      setSavingColor(false);
    }
  };

  const assignToGallery = async (assetIds: string[]) => {
    if (!selectedColour) return;
    const res = await fetch("/api/admin/media/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ assetIds, productId: id, colorKey: selectedColour.colorKey }),
    });
    const json = await res.json();
    if (res.ok && json?.success) {
      toast({ title: "أُضيفت الصور إلى المعرض" });
      load();
    } else {
      toast({ title: json?.error?.message ?? "فشل الإضافة", variant: "destructive" });
    }
  };

  const onGalleryUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !selectedColour) return;
    setUploadingGallery(true);
    try {
      const assetIds: string[] = [];
      for (const file of Array.from(files)) {
        const assetId = await uploadFile(file);
        if (assetId) assetIds.push(assetId);
      }
      if (assetIds.length > 0) await assignToGallery(assetIds);
      else toast({ title: "فشل الرفع", variant: "destructive" });
    } finally {
      setUploadingGallery(false);
    }
  };

  const removeGalleryImage = async (imageId: string) => {
    const res = await fetch(`/api/admin/variant-images/${imageId}`, { method: "DELETE", credentials: "include" });
    const json = await res.json();
    if (res.ok && json?.success) {
      toast({ title: "أُزيلت الصورة" });
      load();
    } else {
      toast({ title: json?.error?.message ?? "فشل الحذف", variant: "destructive" });
    }
  };

  const reorderGallery = async (orderedImageIds: string[]) => {
    if (!selectedColour) return;
    // Optimistic local reorder so drag feedback feels instant.
    setProduct((p) => {
      if (!p) return p;
      const byId = new Map(p.variantImages.map((vi) => [vi.id, vi] as const));
      const reordered = orderedImageIds.map((imgId, i) => ({ ...byId.get(imgId)!, sortOrder: i }));
      const others = p.variantImages.filter((vi) => vi.colorKey !== selectedColour.colorKey);
      return { ...p, variantImages: [...others, ...reordered] };
    });
    const res = await fetch(`/api/admin/products/${id}/gallery/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ colorKey: selectedColour.colorKey, orderedImageIds }),
    });
    const json = await res.json();
    if (!res.ok || !json?.success) {
      toast({ title: json?.error?.message ?? "فشل الترتيب", variant: "destructive" });
      load();
    } else {
      load();
    }
  };

  const onDropThumb = (targetId: string) => {
    if (!dragImageId || dragImageId === targetId) return;
    const order = gallery.map((g) => g.id);
    const fromIdx = order.indexOf(dragImageId);
    const toIdx = order.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    order.splice(fromIdx, 1);
    order.splice(toIdx, 0, dragImageId);
    setDragImageId(null);
    reorderGallery(order);
  };

  /** Keyboard-reachable alternative to drag reorder — the ▲/▼ buttons on each thumbnail
   * (backlog 9.8b review fix 5). Swaps the thumbnail at `idx` with its neighbour and calls the
   * same reorder endpoint drag-and-drop uses. */
  const moveImage = (idx: number, delta: -1 | 1) => {
    const order = gallery.map((g) => g.id);
    const targetIdx = idx + delta;
    if (targetIdx < 0 || targetIdx >= order.length) return;
    [order[idx], order[targetIdx]] = [order[targetIdx], order[idx]];
    reorderGallery(order);
  };

  const setColorRepresentative = async (body: { assetId: string | null } | { variantImageId: string }) => {
    if (!selectedColour) return;
    const res = await fetch(`/api/admin/products/${id}/colors/${encodeURIComponent(selectedColour.colorKey)}/representative`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (res.ok && json?.success) {
      toast({ title: "assetId" in body && body.assetId === null ? "أُزيلت الصورة التمثيلية" : "عُيّنت الصورة التمثيلية" });
      load();
    } else {
      toast({ title: json?.error?.message ?? "فشل التعيين", variant: "destructive" });
    }
  };

  const setHero = async (assetId: string) => {
    const res = await fetch("/api/admin/media/hero", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ assetId, productId: id }),
    });
    const json = await res.json();
    if (res.ok && json?.success) {
      toast({ title: "عُيّنت الصورة الرئيسية" });
      load();
    } else {
      toast({ title: json?.error?.message ?? "فشل التعيين", variant: "destructive" });
    }
  };

  const onHeroUpload = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setUploadingHero(true);
    try {
      const assetId = await uploadFile(file);
      if (assetId) await setHero(assetId);
      else toast({ title: "فشل الرفع", variant: "destructive" });
    } finally {
      setUploadingHero(false);
    }
  };

  const rowDraftFor = (v: Variant) =>
    rowDrafts[v.id] ?? { pricePiastres: (v.pricePiastres / 100).toString(), basePricePiastres: v.basePricePiastres != null ? (v.basePricePiastres / 100).toString() : "" };

  const setRowDraft = (v: Variant, patch: Partial<{ pricePiastres: string; basePricePiastres: string }>) => {
    setRowDrafts((prev) => ({ ...prev, [v.id]: { ...rowDraftFor(v), ...patch } }));
  };

  const saveRow = async (v: Variant) => {
    const draft = rowDraftFor(v);
    const pricePiastres = Math.round(parseFloat(draft.pricePiastres || "0") * 100);
    const basePricePiastres = draft.basePricePiastres === "" ? null : Math.round(parseFloat(draft.basePricePiastres) * 100);
    if (isNaN(pricePiastres) || pricePiastres < 0) {
      toast({ title: "أدخل سعراً صحيحاً", variant: "destructive" });
      return;
    }
    setSavingRow(v.id);
    try {
      const res = await fetch(`/api/admin/variants/${v.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ pricePiastres, basePricePiastres }),
      });
      const json = await res.json();
      if (res.ok && json?.data) {
        toast({ title: "تم حفظ المقاس" });
        load();
      } else {
        toast({ title: json?.error?.message ?? "فشل الحفظ", variant: "destructive" });
      }
    } finally {
      setSavingRow(null);
    }
  };

  const toggleRowActive = async (v: Variant, active: boolean) => {
    const res = await fetch(`/api/admin/variants/${v.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ active }),
    });
    const json = await res.json();
    if (res.ok && json?.data) load();
    else toast({ title: json?.error?.message ?? "فشل التغيير", variant: "destructive" });
  };

  const deleteRow = async (v: Variant) => {
    const res = await fetch(`/api/admin/variants/${v.id}`, { method: "DELETE", credentials: "include" });
    const json = await res.json();
    if (res.ok && json?.data) {
      toast({ title: "تم حذف المقاس" });
      load();
    } else toast({ title: json?.error?.message ?? "فشل الحذف", variant: "destructive" });
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
      <PageHeader
        title={product.name}
        description={`الكتالوج · المنتجات · ${product.slug}`}
        actions={
          <>
            <Button variant="ghost" size="sm" type="button" onClick={() => router.push("/admin/products")}>
              ← المنتجات
            </Button>
            <Button variant="outline" size="sm" className="rounded-full" asChild>
              <Link href={`/products/${product.slug}`} target="_blank">
                <ExternalLink className="h-4 w-4" />
                عرض في المتجر
              </Link>
            </Button>
            <Button size="sm" className="rounded-full" onClick={saveProduct} disabled={saving}>
              {saving ? "جاري الحفظ…" : "حفظ"}
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* Left column: colours */}
        <div className="space-y-6">
          <PanelCard title="الألوان" description="كل لون مجموعة من المقاسات تشارك نفس الاسم والكود.">
            <div className="flex flex-wrap gap-2 pb-4">
              {colours.map((c) => (
                <button
                  key={c.colorKey}
                  type="button"
                  onClick={() => setSelectedColorKey(c.colorKey)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold",
                    selectedColorKey === c.colorKey ? "border-lapis-800 bg-lapis-800 text-white" : "border-stone-200 bg-white text-ink",
                    !c.active && "opacity-50"
                  )}
                >
                  <span className="h-3 w-3 rounded-full border border-stone-300" style={{ backgroundColor: variantSwatchHex(c) }} />
                  {c.colorName ?? "بلا اسم"}
                  {!c.active && " (مخفي)"}
                </button>
              ))}
              <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={() => setNewColorOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                لون جديد
              </Button>
            </div>

            {selectedColour && (
              <div className="space-y-5 border-t border-stone-100 pt-4">
                <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
                  <div className="grid gap-1.5">
                    <Label htmlFor="color-name">اسم اللون</Label>
                    <Input id="color-name" value={colorNameDraft} onChange={(e) => setColorNameDraft(e.target.value)} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="color-hex">الكود</Label>
                    <div className="flex items-center gap-2">
                      <span className="h-8 w-8 shrink-0 rounded-full border border-stone-300" style={{ backgroundColor: colorHexDraft || variantSwatchHex(selectedColour) }} />
                      <Input id="color-hex" value={colorHexDraft} onChange={(e) => setColorHexDraft(e.target.value)} placeholder="#000000" />
                    </div>
                  </div>
                  <div className="flex items-end gap-3">
                    <div className="flex items-center gap-2">
                      <Switch checked={selectedColour.active} onCheckedChange={toggleColorVisible} aria-label="مرئي في المتجر" />
                      <Label className="text-xs">مرئي في المتجر</Label>
                    </div>
                  </div>
                </div>
                <Button type="button" size="sm" className="rounded-full" onClick={saveColorDetails} disabled={savingColor}>
                  {savingColor ? "جاري الحفظ…" : "حفظ بيانات اللون"}
                </Button>

                <div>
                  <h3 className="mb-2 text-sm font-bold text-ink">الصورة التمثيلية</h3>
                  <p className="mb-2 text-xs text-ink-soft">
                    الصورة التي تظهر في بطاقة المنتج بالمتجر وفي منتقي اللون بصفحة المنتج — اختيار صريح، لا تُشتق تلقائياً من ترتيب المعرض.
                  </p>
                  {representativeUrl ? (
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={representativeUrl}
                        alt=""
                        className="h-24 w-24 rounded-xl border-2 border-gold-500 object-cover"
                      />
                      <div className="flex flex-col gap-2">
                        <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => setRepresentativePickerOpen(true)}>
                          <ImageIcon className="h-3.5 w-3.5" />
                          من المكتبة
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="rounded-full text-danger-text" onClick={() => setColorRepresentative({ assetId: null })}>
                          إزالة
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="flex h-24 w-24 items-center justify-center rounded-xl border border-dashed border-stone-300 bg-stone-50 text-center">
                        <ImageIcon className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <div className="flex flex-col gap-2">
                        <p className="text-xs text-ink-soft">لا صورة تمثيلية — البطاقة تعرض صورة المنتج</p>
                        <Button type="button" variant="outline" size="sm" className="w-fit rounded-full" onClick={() => setRepresentativePickerOpen(true)}>
                          <ImageIcon className="h-3.5 w-3.5" />
                          من المكتبة
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-bold text-ink">معرض هذا اللون</h3>
                  {gallery.length === 0 ? (
                    <p className="text-xs text-ink-soft">لا توجد صور بعد لهذا اللون.</p>
                  ) : (
                    <div role="list" aria-label={`معرض لون ${selectedColour.colorName ?? "بلا اسم"}`} className="flex flex-wrap gap-2">
                      {gallery.map((img, idx) => {
                        const isRep = isRepresentativeImage(img);
                        return (
                        <div
                          key={img.id}
                          role="listitem"
                          tabIndex={0}
                          aria-label={`صورة ${idx + 1} من ${gallery.length}${isRep ? " · الصورة التمثيلية الحالية" : ""}`}
                          draggable
                          onDragStart={() => setDragImageId(img.id)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => onDropThumb(img.id)}
                          className={cn(
                            "group relative h-20 w-20 overflow-hidden rounded-xl border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500",
                            isRep ? "border-gold-500" : "border-transparent"
                          )}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={img.url} alt="" className="h-full w-full object-cover" />

                          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-0.5 bg-black/50 py-0.5">
                            <button
                              type="button"
                              onClick={() => moveImage(idx, -1)}
                              disabled={idx === 0}
                              aria-label="نقل الصورة للأعلى في الترتيب"
                              className="rounded p-0.5 text-white opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-30"
                            >
                              <ChevronUp className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveImage(idx, 1)}
                              disabled={idx === gallery.length - 1}
                              aria-label="نقل الصورة للأسفل في الترتيب"
                              className="rounded p-0.5 text-white opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-30"
                            >
                              <ChevronDown className="h-3 w-3" />
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => setColorRepresentative({ variantImageId: img.id })}
                            aria-label={isRep ? "هذه هي الصورة التمثيلية للون" : "تعيين كصورة تمثيلية للون"}
                            className={cn(
                              "absolute right-1 top-1 rounded-full bg-white/90 p-1 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100",
                              isRep ? "text-gold-600" : "text-ink"
                            )}
                          >
                            <Star className="h-3 w-3" fill={isRep ? "currentColor" : "none"} />
                          </button>

                          <button
                            type="button"
                            onClick={() => removeGalleryImage(img.id)}
                            aria-label="إزالة الصورة"
                            className="absolute left-1 top-1 rounded-full bg-white/90 p-1 text-danger-text opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="mt-3 flex gap-2">
                    <input
                      ref={galleryUploadRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        onGalleryUpload(e.target.files);
                        e.target.value = "";
                      }}
                    />
                    <Button type="button" variant="outline" size="sm" className="rounded-full" disabled={uploadingGallery} onClick={() => galleryUploadRef.current?.click()}>
                      <Upload className="h-3.5 w-3.5" />
                      {uploadingGallery ? "جاري الرفع…" : "رفع"}
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => setGalleryPickerOpen(true)}>
                      <ImageIcon className="h-3.5 w-3.5" />
                      من المكتبة
                    </Button>
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-ink">مقاسات لون «{selectedColour.colorName ?? "—"}»</h3>
                    <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={() => setAddSizeOpen(true)}>
                      <Plus className="h-3.5 w-3.5" />
                      إضافة مقاس
                    </Button>
                  </div>
                  <TableScroll>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>SKU</TableHead>
                          <TableHead>المقاس</TableHead>
                          <TableHead>السعر</TableHead>
                          <TableHead>قبل الخصم</TableHead>
                          <TableHead>متوفر عند</TableHead>
                          <TableHead>نشط</TableHead>
                          <TableHead className="w-24 text-left">إجراءات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortVariants(selectedColour.variants).map((v) => {
                          const draft = rowDraftFor(v);
                          return (
                            <TableRow key={v.id}>
                              <TableCell dir="ltr" className="font-mono text-xs">{v.sku}</TableCell>
                              <TableCell>{getDisplaySizeLabel(v.name, forKidsSizes)}</TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  className="h-8 w-24"
                                  aria-label={`السعر — ${v.sku}`}
                                  value={draft.pricePiastres}
                                  onChange={(e) => setRowDraft(v, { pricePiastres: e.target.value })}
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  className="h-8 w-24"
                                  aria-label={`السعر قبل الخصم — ${v.sku}`}
                                  value={draft.basePricePiastres}
                                  onChange={(e) => setRowDraft(v, { basePricePiastres: e.target.value })}
                                />
                              </TableCell>
                              <TableCell className="text-xs text-ink-soft">{v.partnerCount} شركاء</TableCell>
                              <TableCell>
                                <Switch checked={v.active} onCheckedChange={(checked) => toggleRowActive(v, checked)} aria-label="نشط" />
                              </TableCell>
                              <TableCell className="text-left">
                                <div className="flex items-center gap-1">
                                  <Button type="button" variant="ghost" size="sm" onClick={() => saveRow(v)} disabled={savingRow === v.id}>
                                    {savingRow === v.id ? "…" : "حفظ"}
                                  </Button>
                                  <Button type="button" variant="ghost" size="sm" onClick={() => deleteRow(v)} title="حذف">
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableScroll>
                </div>
              </div>
            )}

            {colours.length === 0 && (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 py-12 text-center">
                <Package className="h-10 w-10 text-muted-foreground mb-2" />
                <p className="text-muted-foreground mb-2">لا توجد ألوان بعد. أضف أول لون.</p>
                <Button variant="default" onClick={() => setNewColorOpen(true)}>لون جديد</Button>
              </div>
            )}
          </PanelCard>

          <div className="text-left">
            <Button type="button" variant="outline" size="sm" className="rounded-full" asChild>
              <Link href={`/admin/partners?tab=network&q=${encodeURIComponent(product.slug)}`}>
                <Package className="h-4 w-4" />
                إدارة المخزون عبر الشركاء
              </Link>
            </Button>
          </div>
        </div>

        {/* Right column: product data */}
        <div className="space-y-6">
          <PanelCard title="بيانات المنتج">
            <div className="space-y-4">
              <div className="grid gap-1.5">
                <Label>الاسم *</Label>
                <Input value={product.name} onChange={(e) => setProduct((p) => (p ? { ...p, name: e.target.value } : p))} required />
              </div>
              <div className="grid gap-1.5">
                <Label>الفئة</Label>
                <Select
                  value={product.category.id}
                  onChange={(e) => {
                    const c = categories.find((x) => x.id === e.target.value);
                    if (c) setProduct((p) => (p ? { ...p, category: c } : p));
                  }}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>الرابط (slug)</Label>
                <Input value={product.slug} onChange={(e) => setProduct((p) => (p ? { ...p, slug: e.target.value } : p))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label>الوزن (غرام)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={product.weightGrams ?? ""}
                    onChange={(e) => setProduct((p) => (p ? { ...p, weightGrams: e.target.value === "" ? null : parseInt(e.target.value, 10) || 0 } : p))}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>أولوية العرض</Label>
                  <Input
                    type="number"
                    value={product.sortOrder}
                    onChange={(e) => setProduct((p) => (p ? { ...p, sortOrder: parseInt(e.target.value, 10) || 0 } : p))}
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>الوسوم</Label>
                <Input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="وسوم مفصولة بشرطة، مثل: حريمي - دانتيل" />
              </div>
              <div className="grid gap-1.5">
                <Label>الوصف</Label>
                <textarea
                  value={product.description ?? ""}
                  onChange={(e) => setProduct((p) => (p ? { ...p, description: e.target.value } : p))}
                  className="flex min-h-[80px] w-full rounded-2xl border border-input bg-background px-4 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={product.active} onCheckedChange={(checked) => setProduct((p) => (p ? { ...p, active: checked } : p))} aria-label="المنتج نشط" />
                <Label className="text-xs">المنتج نشط</Label>
              </div>
            </div>
          </PanelCard>

          <PanelCard title="صورة المنتج الرئيسية" description="تظهر في بطاقة المنتج وفي السلة.">
            <div className="flex items-center gap-3">
              {product.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={product.imageUrl} alt="" className="h-20 w-20 rounded-xl border border-stone-100 object-cover" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-muted">
                  <ImageIcon className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
              <div className="flex flex-col gap-2">
                <input
                  ref={heroUploadRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    onHeroUpload(e.target.files);
                    e.target.value = "";
                  }}
                />
                <Button type="button" variant="outline" size="sm" className="rounded-full" disabled={uploadingHero} onClick={() => heroUploadRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5" />
                  {uploadingHero ? "جاري الرفع…" : "رفع"}
                </Button>
                <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => setHeroPickerOpen(true)}>
                  <ImageIcon className="h-3.5 w-3.5" />
                  من المكتبة
                </Button>
              </div>
            </div>
          </PanelCard>

          <PanelCard title="السعر الافتراضي" description="يُستخدم إن لم يحدَّد سعر خاص بالمقاس.">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label>السعر الأساسي (ج.م)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={product.basePricePiastres != null ? product.basePricePiastres / 100 : ""}
                  onChange={(e) => setProduct((p) => (p ? { ...p, basePricePiastres: e.target.value === "" ? null : Math.round(parseFloat(e.target.value) * 100) } : p))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>سعر التخفيض (ج.م)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={product.discountPricePiastres != null ? product.discountPricePiastres / 100 : ""}
                  onChange={(e) => setProduct((p) => (p ? { ...p, discountPricePiastres: e.target.value === "" ? null : Math.round(parseFloat(e.target.value) * 100) } : p))}
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-ink-soft">سعر أي مقاس يُدخَل يدوياً يتجاوز هذا الافتراضي.</p>
          </PanelCard>
        </div>
      </div>

      <NewColorDialog open={newColorOpen} onOpenChange={setNewColorOpen} productId={id} onDone={load} />
      {selectedColour && (
        <AddSizeDialog
          open={addSizeOpen}
          onOpenChange={setAddSizeOpen}
          productId={id}
          colour={selectedColour}
          onDone={load}
        />
      )}
      <MediaPickerDialog open={galleryPickerOpen} onOpenChange={setGalleryPickerOpen} multiple onPick={assignToGallery} />
      <MediaPickerDialog open={heroPickerOpen} onOpenChange={setHeroPickerOpen} multiple={false} onPick={(ids) => setHero(ids[0])} />
      <MediaPickerDialog
        open={representativePickerOpen}
        onOpenChange={setRepresentativePickerOpen}
        multiple={false}
        onPick={(ids) => setColorRepresentative({ assetId: ids[0] })}
      />
    </div>
  );
}

function NewColorDialog({
  open,
  onOpenChange,
  productId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = React.useState("");
  const [hex, setHex] = React.useState("");
  const [sizes, setSizes] = React.useState<string[]>([...STANDARD_SIZE_RUN]);
  const [price, setPrice] = React.useState("");
  const [basePrice, setBasePrice] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const toggleSize = (s: string) => setSizes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const submit = async () => {
    if (!name.trim()) {
      toast({ title: "اسم اللون مطلوب", variant: "destructive" });
      return;
    }
    if (sizes.length === 0) {
      toast({ title: "اختر مقاساً واحداً على الأقل", variant: "destructive" });
      return;
    }
    const pricePiastres = Math.round(parseFloat(price || "0") * 100);
    if (isNaN(pricePiastres) || pricePiastres < 0) {
      toast({ title: "أدخل سعراً صحيحاً", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/products/${productId}/colors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          colorName: name.trim(),
          colorHex: hex.trim() || null,
          sizes,
          pricePiastres,
          basePricePiastres: basePrice === "" ? null : Math.round(parseFloat(basePrice) * 100),
        }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        toast({ title: "تم إنشاء اللون" });
        setName("");
        setHex("");
        setSizes([...STANDARD_SIZE_RUN]);
        setPrice("");
        setBasePrice("");
        onOpenChange(false);
        onDone();
      } else {
        toast({ title: json?.error?.message ?? "فشل الإنشاء", variant: "destructive" });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>لون جديد</DialogTitle>
          <DialogDescription>يُنشأ متغير لكل مقاس مختار بنفس الاسم والكود.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="new-color-name">اسم اللون *</Label>
            <Input id="new-color-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثل: أسود" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="new-color-hex">الكود</Label>
            <Input id="new-color-hex" value={hex} onChange={(e) => setHex(e.target.value)} placeholder="#000000" />
          </div>
          <div className="grid gap-1.5">
            <Label>المقاسات</Label>
            <div className="flex flex-wrap gap-2">
              {STANDARD_SIZE_RUN.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={sizes.includes(s)}
                  onClick={() => toggleSize(s)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-semibold",
                    sizes.includes(s) ? "border-lapis-800 bg-lapis-800 text-white" : "border-stone-200 bg-white text-ink"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="new-color-base">السعر الأساسي (ج.م)</Label>
              <Input id="new-color-base" type="number" min={0} step={0.01} value={basePrice} onChange={(e) => setBasePrice(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="new-color-price">السعر (ج.م) *</Label>
              <Input id="new-color-price" type="number" min={0} step={0.01} value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">إلغاء</Button>
          </DialogClose>
          <Button onClick={submit} disabled={submitting}>{submitting ? "جاري الإنشاء…" : "إنشاء"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddSizeDialog({
  open,
  onOpenChange,
  productId,
  colour,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  colour: Colour;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [size, setSize] = React.useState("");
  const [customSize, setCustomSize] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [basePrice, setBasePrice] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const submit = async () => {
    const sizeValue = size === "custom" ? customSize.trim() : size;
    if (!sizeValue) {
      toast({ title: "اختر المقاس أو أدخل مقاساً", variant: "destructive" });
      return;
    }
    const pricePiastres = Math.round(parseFloat(price || "0") * 100);
    if (isNaN(pricePiastres) || pricePiastres < 0) {
      toast({ title: "أدخل سعراً صحيحاً", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/products/${productId}/variants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: sizeValue,
          colorName: colour.colorName,
          colorHex: colour.colorHex,
          basePricePiastres: basePrice === "" ? null : Math.round(parseFloat(basePrice) * 100),
          pricePiastres,
        }),
      });
      const json = await res.json();
      if (res.ok && json?.data) {
        toast({ title: "تم إضافة المقاس" });
        setSize("");
        setCustomSize("");
        setPrice("");
        setBasePrice("");
        onOpenChange(false);
        onDone();
      } else {
        toast({ title: json?.error?.message ?? "فشل الإضافة", variant: "destructive" });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle>إضافة مقاس للون «{colour.colorName ?? "—"}»</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label>المقاس *</Label>
            <div className="flex gap-2">
              <Select value={size} onChange={(e) => setSize(e.target.value)}>
                <option value="">اختر المقاس</option>
                {STANDARD_SIZE_RUN.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
                <option value="custom">آخر (أدخل يدوياً)</option>
              </Select>
              {size === "custom" && <Input value={customSize} onChange={(e) => setCustomSize(e.target.value)} placeholder="المقاس" />}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label>السعر الأساسي (ج.م)</Label>
              <Input type="number" min={0} step={0.01} value={basePrice} onChange={(e) => setBasePrice(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>السعر (ج.م) *</Label>
              <Input type="number" min={0} step={0.01} value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">إلغاء</Button>
          </DialogClose>
          <Button onClick={submit} disabled={submitting}>{submitting ? "جاري الإضافة…" : "إضافة"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
