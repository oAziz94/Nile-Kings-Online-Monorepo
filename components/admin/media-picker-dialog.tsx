"use client";

/**
 * "من المكتبة" — backlog 9.8b reuses the 9.8a `/admin/media` tile grid's selection idea in a
 * lightweight dialog: search the library, pick one or more assets, `onPick` receives their
 * ids. The caller decides what happens next (assign to a colour gallery, set as hero, …) —
 * this component only picks.
 */
import * as React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Search } from "lucide-react";

type MediaTile = { id: string; url: string; thumbUrl: string; publicId: string; usageLabel: string };

export function MediaPickerDialog({
  open,
  onOpenChange,
  multiple = true,
  onPick,
  onPickItems,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  multiple?: boolean;
  /** Called with the picked asset ids. */
  onPick?: (assetIds: string[]) => void | Promise<void>;
  /** Called with the picked assets' `{ id, url }` — for callers that need the URL directly
   * (e.g. setting `Category.imageUrl`) without a second round trip. */
  onPickItems?: (items: { id: string; url: string }[]) => void | Promise<void>;
}) {
  const [q, setQ] = React.useState("");
  const [items, setItems] = React.useState<MediaTile[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setQ("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ limit: "40" });
    if (q.trim()) params.set("q", q.trim());
    fetch(`/api/admin/media?${params}`, { credentials: "include" })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: { items: MediaTile[] } }) => {
        if (cancelled) return;
        if (json?.success && json.data) setItems(json.data.items);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, q]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      if (multiple) {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }
      return prev.has(id) ? new Set() : new Set([id]);
    });
  };

  const confirm = async () => {
    if (selected.size === 0) return;
    setSubmitting(true);
    try {
      const ids = Array.from(selected);
      await onPick?.(ids);
      if (onPickItems) {
        const byId = new Map(items.map((i) => [i.id, i] as const));
        await onPickItems(ids.map((id) => ({ id, url: byId.get(id)?.url ?? "" })).filter((i) => i.url));
      }
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle>اختر من المكتبة</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="اسم الملف أو المنتج" className="pr-10" />
        </div>
        <div className="grid max-h-[50vh] grid-cols-3 gap-2 overflow-y-auto py-2 sm:grid-cols-4">
          {loading ? (
            <p className="col-span-full py-8 text-center text-sm text-ink-soft">جاري التحميل…</p>
          ) : items.length === 0 ? (
            <p className="col-span-full py-8 text-center text-sm text-ink-soft">لا توجد صور</p>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => toggle(item.id)}
                className="relative overflow-hidden rounded-lg border border-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.thumbUrl} alt="" className="h-20 w-full object-cover" />
                <span className="absolute right-1 top-1">
                  <Checkbox checked={selected.has(item.id)} onCheckedChange={() => toggle(item.id)} aria-label={`اختيار ${item.publicId}`} />
                </span>
              </button>
            ))
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button type="button" className="rounded-full" disabled={selected.size === 0 || submitting} onClick={confirm}>
            {submitting ? "جاري…" : `اختيار (${selected.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
