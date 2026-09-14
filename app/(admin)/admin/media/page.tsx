"use client";

/**
 * `/admin/media` — الصور library (backlog 9.8a (e)), رebuilt per `Media.dc.html` (generator
 * block 10): a grid of every `MediaAsset` with its usage, filters, upload (multi-file,
 * drag-drop), a selection bar (assign to a product colour, set hero, delete unused-only), and
 * a tile detail Sheet (preview, alt, usage links, replace, delete). Nav: الكتالوج -> الصور.
 */
import * as React from "react";
import Link from "next/link";
import { RefreshCw, Upload, Search, X } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PanelCard } from "@/components/dashboard/panel-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetCloseButton,
} from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatDateEn, formatNumberEn } from "@/lib/format-en-numbers";
import { cn } from "@/lib/utils";

type UsageEntry =
  | { kind: "product_hero"; productId: string; productName: string }
  | { kind: "variant_representative"; productId: string; productName: string; colorName: string | null; variantId: string }
  | { kind: "gallery"; productId: string; productName: string; colorKey: string; colorName: string | null; sortOrder: number; variantImageId: string }
  | { kind: "proof"; routedOrderId: string; orderId: string; orderShortId: string };

type MediaItem = {
  id: string;
  publicId: string;
  url: string;
  thumbUrl: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  format: string | null;
  folder: string;
  alt: string | null;
  createdAt: string;
  deletedAt: string | null;
  usage: UsageEntry[];
  usageLabel: string;
};

type ProductOption = { id: string; name: string };
type ColorOption = { colorKey: string; colorName: string | null; colorHex: string | null };

function usageTone(item: MediaItem): "used" | "unused" | "missing" {
  if (item.deletedAt) return "missing";
  return item.usage.length > 0 ? "used" : "unused";
}

export default function AdminMediaPage() {
  const { toast } = useToast();

  const [q, setQ] = React.useState("");
  const [productFilter, setProductFilter] = React.useState("");
  const [colorFilter, setColorFilter] = React.useState("");
  const [unusedOnly, setUnusedOnly] = React.useState(true);
  const [missingOnly, setMissingOnly] = React.useState(false);
  const [folder, setFolder] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");

  const [items, setItems] = React.useState<MediaItem[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [counts, setCounts] = React.useState({ unused: 0, missing: 0 });
  const [lastSyncAt, setLastSyncAt] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);

  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [syncing, setSyncing] = React.useState(false);
  const [uploadStatuses, setUploadStatuses] = React.useState<{ name: string; status: "uploading" | "done" | "error" }[]>([]);
  const [dragOver, setDragOver] = React.useState(false);

  const [assignOpen, setAssignOpen] = React.useState(false);
  const [heroOpen, setHeroOpen] = React.useState(false);
  const [detailId, setDetailId] = React.useState<string | null>(null);

  const [products, setProducts] = React.useState<ProductOption[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const requestSeq = React.useRef(0);

  const loadProducts = React.useCallback((query: string) => {
    fetch(`/api/admin/products?q=${encodeURIComponent(query)}&limit=20`, { credentials: "include" })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: { products: { id: string; name: string }[] } }) => {
        if (json?.success && json.data) setProducts(json.data.products.map((p) => ({ id: p.id, name: p.name })));
      })
      .catch(() => undefined);
  }, []);

  React.useEffect(() => {
    loadProducts("");
  }, [loadProducts]);

  const buildParams = React.useCallback(
    (cursor?: string) => {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (productFilter) params.set("product", productFilter);
      if (colorFilter) params.set("color", colorFilter);
      if (unusedOnly) params.set("unused", "1");
      if (missingOnly) params.set("missing", "1");
      if (folder) params.set("folder", folder);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      params.set("limit", "50");
      if (cursor) params.set("cursor", cursor);
      return params;
    },
    [q, productFilter, colorFilter, unusedOnly, missingOnly, folder, from, to]
  );

  const load = React.useCallback(() => {
    const seq = ++requestSeq.current;
    setLoading(true);
    fetch(`/api/admin/media?${buildParams().toString()}`, { credentials: "include" })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: { items: MediaItem[]; nextCursor: string | null; counts: { unused: number; missing: number }; lastSyncAt: string | null } }) => {
        if (seq !== requestSeq.current) return;
        if (json?.success && json.data) {
          setItems(json.data.items);
          setNextCursor(json.data.nextCursor);
          setCounts(json.data.counts);
          setLastSyncAt(json.data.lastSyncAt);
          setSelected(new Set());
        }
      })
      .finally(() => {
        if (seq === requestSeq.current) setLoading(false);
      });
  }, [buildParams]);

  React.useEffect(() => {
    load();
  }, [load]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/admin/media?${buildParams(nextCursor).toString()}`, { credentials: "include" });
      const json = await res.json();
      if (json?.success && json.data) {
        setItems((prev) => [...prev, ...json.data.items]);
        setNextCursor(json.data.nextCursor);
      }
    } finally {
      setLoadingMore(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/admin/media/sync", { method: "POST", credentials: "include" });
      const json = await res.json();
      if (res.ok && json?.success) {
        toast({
          title: "تمت المزامنة",
          description: `${json.data.imported} مستوردة · ${json.data.missing} مفقودة · ${json.data.adopted} مرتبطة (${json.data.total} صورة في ${Math.round(json.data.durationMs / 1000)} ثانية)`,
        });
        load();
      } else {
        toast({ title: json?.error?.message ?? "فشلت المزامنة", variant: "destructive" });
      }
    } finally {
      setSyncing(false);
    }
  };

  const uploadFiles = React.useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
      if (list.length === 0) return;
      setUploadStatuses(list.map((f) => ({ name: f.name, status: "uploading" })));
      let anyOk = false;
      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        try {
          const buf = await file.arrayBuffer();
          const base64 = btoa(new Uint8Array(buf).reduce((acc, byte) => acc + String.fromCharCode(byte), ""));
          const res = await fetch("/api/admin/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ image: `data:${file.type};base64,${base64}`, contentType: file.type }),
          });
          const json = await res.json();
          setUploadStatuses((prev) => prev.map((s, idx) => (idx === i ? { ...s, status: res.ok && json?.success ? "done" : "error" } : s)));
          if (res.ok && json?.success) anyOk = true;
        } catch {
          setUploadStatuses((prev) => prev.map((s, idx) => (idx === i ? { ...s, status: "error" } : s)));
        }
      }
      if (anyOk) load();
      setTimeout(() => setUploadStatuses([]), 4000);
    },
    [load]
  );

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
  };

  const deleteSelected = async () => {
    const ids = Array.from(selected);
    let deleted = 0;
    const refused: string[] = [];
    for (const id of ids) {
      const res = await fetch(`/api/admin/media/${id}`, { method: "DELETE", credentials: "include" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) deleted++;
      else refused.push(json?.error?.message ?? id);
    }
    if (deleted > 0) toast({ title: `حُذفت ${deleted} صورة` });
    if (refused.length > 0) toast({ title: `تعذّر حذف ${refused.length}`, description: refused[0], variant: "destructive" });
    load();
  };

  const canHero = selected.size === 1;

  return (
    <div className="space-y-6" onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}>
      <PageHeader
        title="الصور"
        description="الكتالوج · مكتبة الصور · كل رفع يُسجَّل هنا بمعرّفه في Cloudinary"
        actions={
          <>
            <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={runSync} disabled={syncing}>
              <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
              {syncing ? "جاري المزامنة…" : "مزامنة مع Cloudinary"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) uploadFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <Button type="button" size="sm" className="rounded-full" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4" />
              رفع صور
            </Button>
          </>
        }
        meta={lastSyncAt ? `آخر مزامنة: ${formatDateEn(lastSyncAt, { hour: "numeric", minute: "2-digit" })}` : "لم تتم أي مزامنة بعد"}
      />

      {uploadStatuses.length > 0 && (
        <div className="rounded-2xl bg-white p-3 shadow-soft text-xs">
          {uploadStatuses.map((s, idx) => (
            <div key={idx} className="flex items-center justify-between py-1">
              <span className="truncate">{s.name}</span>
              <span className={cn(s.status === "done" && "text-malachite-text", s.status === "error" && "text-danger-text")}>
                {s.status === "uploading" ? "جاري الرفع…" : s.status === "done" ? "تم" : "فشل"}
              </span>
            </div>
          ))}
        </div>
      )}

      <PanelCard title="" noPadding>
        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3.5 sm:px-[22px]">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="اسم الملف أو المنتج" className="h-10 rounded-lg pr-10" />
          </div>

          <Label htmlFor="media-filter-product" className="sr-only">المنتج</Label>
          <Select
            id="media-filter-product"
            value={productFilter}
            onChange={(e) => { setProductFilter(e.target.value); setColorFilter(""); }}
            className="h-10 w-auto rounded-full"
          >
            <option value="">المنتج</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>

          <button
            type="button"
            aria-pressed={unusedOnly}
            onClick={() => { setUnusedOnly((v) => !v); if (!unusedOnly) setMissingOnly(false); }}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500",
              unusedOnly ? "border-lapis-800 bg-lapis-800 text-white" : "border-stone-200 bg-white text-ink"
            )}
          >
            غير مستخدمة ({formatNumberEn(counts.unused)})
          </button>
          <button
            type="button"
            aria-pressed={missingOnly}
            onClick={() => { setMissingOnly((v) => !v); if (!missingOnly) setUnusedOnly(false); }}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500",
              missingOnly ? "border-lapis-800 bg-lapis-800 text-white" : "border-stone-200 bg-white text-ink"
            )}
          >
            مفقودة ({formatNumberEn(counts.missing)})
          </button>

          <Label htmlFor="media-filter-folder" className="sr-only">المجلد</Label>
          <Select id="media-filter-folder" value={folder} onChange={(e) => setFolder(e.target.value)} className="h-10 w-auto rounded-full">
            <option value="">كل المجلدات</option>
            <option value="products">المنتجات</option>
            <option value="proofs">الإثباتات</option>
          </Select>

          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-36" aria-label="من تاريخ" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-36" aria-label="إلى تاريخ" />
        </div>

        {selected.size > 0 && (
          <div className="mx-4 mb-3 flex flex-wrap items-center gap-3 rounded-xl bg-lapis-50 px-4 py-2.5 sm:mx-[22px]">
            <span className="text-[13px] font-extrabold text-lapis-800">{formatNumberEn(selected.size)} صورة محددة</span>
            <Button type="button" size="sm" className="rounded-full" onClick={() => setAssignOpen(true)}>
              إسناد إلى منتج ولون
            </Button>
            <Button type="button" size="sm" variant="outline" className="rounded-full" disabled={!canHero} onClick={() => setHeroOpen(true)}>
              تعيين كصورة رئيسية
            </Button>
            <Button type="button" size="sm" variant="outline" className="rounded-full text-danger-text" onClick={deleteSelected}>
              حذف (غير المستخدمة فقط)
            </Button>
            <button type="button" className="mr-auto text-xs font-bold text-lapis-800 underline" onClick={() => setSelected(new Set())}>
              إلغاء التحديد
            </button>
          </div>
        )}

        <div
          onDrop={onDrop}
          className={cn(
            "grid grid-cols-2 gap-3 px-4 pb-5 sm:grid-cols-3 sm:px-[22px] md:grid-cols-4 lg:grid-cols-5",
            dragOver && "outline-dashed outline-2 outline-lapis-800"
          )}
        >
          {loading ? (
            <p className="col-span-full py-10 text-center text-sm text-ink-soft">جاري التحميل…</p>
          ) : items.length === 0 ? (
            <p className="col-span-full py-10 text-center text-sm text-ink-soft">لا توجد صور مطابقة</p>
          ) : (
            items.map((item) => {
              const tone = usageTone(item);
              return (
                <div key={item.id} className="overflow-hidden rounded-2xl border border-stone-100 bg-white">
                  <div className="relative h-[130px] bg-stone-100">
                    <button
                      type="button"
                      onClick={() => setDetailId(item.id)}
                      className="block h-full w-full"
                      aria-label={`فتح تفاصيل الصورة ${item.publicId}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.thumbUrl} alt={item.alt ?? ""} className="h-full w-full object-cover" />
                    </button>
                    <span className="absolute right-2 top-2">
                      <Checkbox checked={selected.has(item.id)} onCheckedChange={() => toggleSelect(item.id)} aria-label={`تحديد ${item.publicId}`} />
                    </span>
                  </div>
                  <div className="space-y-1 p-2.5">
                    <p dir="ltr" className="truncate text-[11px] font-mono text-ink-soft">{item.publicId}</p>
                    <p className="truncate text-xs">{item.usageLabel}</p>
                    <div className="flex items-center justify-between">
                      <span dir="ltr" className="text-[11px] text-ink-soft">
                        {item.width && item.height ? `${item.width}×${item.height}` : "—"}
                        {item.bytes ? ` · ${formatNumberEn(Math.round(item.bytes / 1024))} KB` : ""}
                      </span>
                      <Badge
                        variant={tone === "used" ? "success" : tone === "missing" ? "danger" : "neutral"}
                        className="rounded-full text-[10px]"
                      >
                        {tone === "used" ? "مستخدمة" : tone === "missing" ? "مفقودة" : "غير مستخدمة"}
                      </Badge>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {nextCursor && !loading && (
          <div className="flex justify-center border-t border-stone-100 p-4">
            <Button type="button" variant="outline" onClick={loadMore} disabled={loadingMore} className="rounded-full">
              {loadingMore ? "جاري التحميل…" : "تحميل المزيد"}
            </Button>
          </div>
        )}
      </PanelCard>

      <AssignDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        assetIds={Array.from(selected)}
        onDone={() => { setAssignOpen(false); load(); }}
        loadProducts={loadProducts}
        products={products}
      />
      <HeroDialog
        open={heroOpen}
        onOpenChange={setHeroOpen}
        assetId={canHero ? Array.from(selected)[0] : null}
        onDone={() => { setHeroOpen(false); load(); }}
        loadProducts={loadProducts}
        products={products}
      />
      <MediaDetailSheet
        item={items.find((i) => i.id === detailId) ?? null}
        open={detailId !== null}
        onOpenChange={(open) => { if (!open) setDetailId(null); }}
        onChanged={load}
      />
    </div>
  );
}

function AssignDialog({
  open,
  onOpenChange,
  assetIds,
  onDone,
  loadProducts,
  products,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetIds: string[];
  onDone: () => void;
  loadProducts: (q: string) => void;
  products: ProductOption[];
}) {
  const { toast } = useToast();
  const [productId, setProductId] = React.useState("");
  const [colors, setColors] = React.useState<ColorOption[]>([]);
  const [colorKey, setColorKeyState] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!productId) { setColors([]); return; }
    fetch(`/api/admin/products/${productId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((json) => {
        if (json?.success && json.data) {
          const variants: { colorName: string | null; colorHex: string | null }[] = json.data.variants ?? [];
          const seen = new Map<string, ColorOption>();
          for (const v of variants) {
            const key = `${v.colorName ?? ""}|${v.colorHex ?? ""}`;
            if (!seen.has(key)) seen.set(key, { colorKey: key, colorName: v.colorName, colorHex: v.colorHex });
          }
          setColors(Array.from(seen.values()));
        }
      });
  }, [productId]);

  const submit = async () => {
    if (!productId || !colorKey || assetIds.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/media/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ assetIds, productId, colorKey }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        toast({ title: "أُسندت الصور إلى المعرض" });
        setProductId("");
        setColorKeyState("");
        onDone();
      } else {
        toast({ title: json?.error?.message ?? "فشل الإسناد", variant: "destructive" });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إسناد إلى منتج ولون</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="assign-product-search">المنتج</Label>
            <Input id="assign-product-search" placeholder="ابحث عن منتج" onChange={(e) => loadProducts(e.target.value)} className="mb-2" />
            <Select value={productId} onChange={(e) => { setProductId(e.target.value); setColorKeyState(""); }} aria-label="اختر منتج">
              <option value="">اختر منتجًا</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>
          {colors.length > 0 && (
            <div>
              <Label>اللون</Label>
              <div className="flex flex-wrap gap-2 pt-1">
                {colors.map((c) => (
                  <button
                    key={c.colorKey}
                    type="button"
                    aria-pressed={colorKey === c.colorKey}
                    onClick={() => setColorKeyState(c.colorKey)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold",
                      colorKey === c.colorKey ? "border-lapis-800 bg-lapis-800 text-white" : "border-stone-200 bg-white text-ink"
                    )}
                  >
                    {c.colorHex && <span className="h-3 w-3 rounded-full border border-stone-300" style={{ backgroundColor: c.colorHex }} />}
                    {c.colorName ?? "بلا اسم"}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button type="button" className="rounded-full" disabled={!productId || !colorKey || submitting} onClick={submit}>
            {submitting ? "جاري الإسناد…" : "إسناد"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HeroDialog({
  open,
  onOpenChange,
  assetId,
  onDone,
  loadProducts,
  products,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetId: string | null;
  onDone: () => void;
  loadProducts: (q: string) => void;
  products: ProductOption[];
}) {
  const { toast } = useToast();
  const [productId, setProductId] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const submit = async () => {
    if (!assetId || !productId) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/media/hero", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ assetId, productId }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        toast({ title: "عُيّنت الصورة الرئيسية" });
        setProductId("");
        onDone();
      } else {
        toast({ title: json?.error?.message ?? "فشل التعيين", variant: "destructive" });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تعيين كصورة رئيسية</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Label htmlFor="hero-product-search">المنتج</Label>
          <Input id="hero-product-search" placeholder="ابحث عن منتج" onChange={(e) => loadProducts(e.target.value)} className="mb-2" />
          <Select value={productId} onChange={(e) => setProductId(e.target.value)} aria-label="اختر منتج">
            <option value="">اختر منتجًا</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button type="button" className="rounded-full" disabled={!productId || submitting} onClick={submit}>
            {submitting ? "جاري التعيين…" : "تعيين"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const USAGE_LINE: Record<UsageEntry["kind"], (e: UsageEntry) => { text: string; href?: string }> = {
  product_hero: (e) => {
    const entry = e as Extract<UsageEntry, { kind: "product_hero" }>;
    return { text: `${entry.productName} · رئيسية`, href: `/admin/products/${entry.productId}` };
  },
  variant_representative: (e) => {
    const entry = e as Extract<UsageEntry, { kind: "variant_representative" }>;
    return { text: `${entry.productName} · ${entry.colorName ?? "بلا لون"} · ممثلة اللون`, href: `/admin/products/${entry.productId}` };
  },
  gallery: (e) => {
    const entry = e as Extract<UsageEntry, { kind: "gallery" }>;
    return { text: `${entry.productName} · ${entry.colorName ?? "بلا لون"} · معرض ${entry.sortOrder + 1}`, href: `/admin/products/${entry.productId}` };
  },
  proof: (e) => {
    const entry = e as Extract<UsageEntry, { kind: "proof" }>;
    return { text: `إثبات تسليم #${entry.orderShortId}`, href: `/admin/orders/${entry.orderId}` };
  },
};

function MediaDetailSheet({
  item,
  open,
  onOpenChange,
  onChanged,
}: {
  item: MediaItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [alt, setAlt] = React.useState("");
  const [savingAlt, setSavingAlt] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [replacing, setReplacing] = React.useState(false);
  const replaceInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setAlt(item?.alt ?? "");
  }, [item?.id, item?.alt]);

  if (!item) return null;

  const saveAlt = async () => {
    setSavingAlt(true);
    try {
      const res = await fetch(`/api/admin/media/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ alt }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        toast({ title: "تم حفظ النص البديل" });
        onChanged();
      } else {
        toast({ title: json?.error?.message ?? "فشل الحفظ", variant: "destructive" });
      }
    } finally {
      setSavingAlt(false);
    }
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/media/${item.id}`, { method: "DELETE", credentials: "include" });
      const json = await res.json();
      if (res.ok && json?.success) {
        toast({ title: "حُذفت الصورة" });
        onOpenChange(false);
        onChanged();
      } else {
        toast({ title: json?.error?.message ?? "تعذّر الحذف", variant: "destructive" });
      }
    } finally {
      setDeleting(false);
    }
  };

  const doReplace = async (file: File) => {
    setReplacing(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/admin/media/${item.id}/replace`, { method: "POST", credentials: "include", body: form });
      const json = await res.json();
      if (res.ok && json?.success) {
        toast({ title: "استُبدلت الصورة" });
        onOpenChange(false);
        onChanged();
      } else {
        toast({ title: json?.error?.message ?? "فشل الاستبدال", variant: "destructive" });
      }
    } finally {
      setReplacing(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="max-w-xl border-l border-stone-200 bg-white">
        <SheetHeader className="border-stone-100">
          <SheetTitle className="font-cairo text-ink">تفاصيل الصورة</SheetTitle>
          <SheetCloseButton className="text-ink-soft hover:text-ink" />
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.url} alt={item.alt ?? ""} className="max-h-72 w-full rounded-xl border border-stone-100 object-contain bg-stone-50" />

          <div className="space-y-1 text-xs text-ink-soft">
            <p dir="ltr" className="font-mono text-ink">{item.publicId}</p>
            <p dir="ltr">
              {item.width && item.height ? `${item.width}×${item.height}` : "—"}
              {item.bytes ? ` · ${formatNumberEn(Math.round(item.bytes / 1024))} KB` : ""}
              {item.format ? ` · ${item.format.toUpperCase()}` : ""}
            </p>
            <p>رُفعت {formatDateEn(item.createdAt)}</p>
            {item.deletedAt && <p className="font-bold text-danger-text">مسجّلة والملف غير موجود</p>}
          </div>

          <div>
            <Label htmlFor="media-alt">النص البديل</Label>
            <div className="flex items-center gap-2">
              <Input id="media-alt" value={alt} onChange={(e) => setAlt(e.target.value)} />
              <Button type="button" size="sm" className="rounded-full" disabled={savingAlt} onClick={saveAlt}>
                {savingAlt ? "…" : "حفظ"}
              </Button>
            </div>
          </div>

          <div>
            <Label>الاستخدام</Label>
            {item.usage.length === 0 ? (
              <p className="text-xs text-ink-soft">غير مسندة</p>
            ) : (
              <ul className="space-y-1">
                {item.usage.map((entry, idx) => {
                  const { text, href } = USAGE_LINE[entry.kind](entry);
                  return (
                    <li key={idx} className="text-xs">
                      {href ? (
                        <Link href={href} className="font-bold text-lapis-800 hover:underline">{text}</Link>
                      ) : (
                        <span>{text}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap gap-2 border-t border-stone-100 pt-4">
            <input
              ref={replaceInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) doReplace(f);
                e.target.value = "";
              }}
            />
            <Button type="button" variant="outline" size="sm" className="rounded-full" disabled={replacing} onClick={() => replaceInputRef.current?.click()}>
              {replacing ? "جاري الاستبدال…" : "استبدال"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full text-danger-text"
              disabled={deleting || item.usage.length > 0}
              title={item.usage.length > 0 ? "لا يمكن حذف صورة مستخدمة" : undefined}
              onClick={doDelete}
            >
              <X className="h-3.5 w-3.5" />
              {deleting ? "جاري الحذف…" : "حذف"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
