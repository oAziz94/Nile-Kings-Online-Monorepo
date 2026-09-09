"use client";

import * as React from "react";
import { MapPin, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { parseJsonResponse } from "@/lib/api/parse-json";
import { resolveGovernorateForArea } from "@/lib/data/egypt-areas-greater-cairo";
import { GOVERNORATE_AS_CITY_VALUES } from "@/lib/addresses/completeness";
import { cn } from "@/lib/utils";

type GovernorateOption = { value: string; label: string };

type StorefrontAddress = {
  governorate: string;
  area: string | null;
  city: string | null;
  street: string | null;
  building: string | null;
  floor: string | null;
  apartment: string | null;
  phone: string | null;
  label: string | null;
};

type RemovedCartItem = { productName: string; variantName: string };

const emptyDraft = {
  governorate: "",
  area: "",
  city: "",
  street: "",
  floor: "",
  apartment: "",
  phone: "",
  label: "",
  notes: "",
};

/** Handoff across the hard reload that follows a save, so the removed-items toast survives it. */
const REMOVED_ITEMS_KEY = "nile_removed_cart_items";

export function GovernorateSelector() {
  const { toast } = useToast();
  const [options, setOptions] = React.useState<GovernorateOption[]>([]);
  const [savedAddress, setSavedAddress] = React.useState<StorefrontAddress | null>(null);
  const [draft, setDraft] = React.useState(emptyDraft);
  const [showMore, setShowMore] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [editing, setEditing] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/storefront/governorate", { credentials: "include", cache: "no-store" })
      .then((res) =>
        parseJsonResponse<{
          success?: boolean;
          data?: { address: StorefrontAddress | null; options: GovernorateOption[] };
        }>(res)
      )
      .then((json) => {
        if (cancelled) return;
        const address = json?.data?.address ?? null;
        setOptions(json?.data?.options ?? []);
        setSavedAddress(address);
        setDraft({
          governorate: address?.governorate ?? "",
          area: address?.area ?? "",
          city: address?.city ?? "",
          street: address?.street ?? "",
          floor: address?.floor ?? "",
          apartment: address?.apartment ?? "",
          phone: address?.phone ?? "",
          label: address?.label ?? "",
          notes: "",
        });
        setEditing(!address);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Show the "items removed" notice left behind by a save that happened just before the
  // hard reload this mount is the result of.
  React.useEffect(() => {
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(REMOVED_ITEMS_KEY);
      if (raw) sessionStorage.removeItem(REMOVED_ITEMS_KEY);
    } catch {
      /* sessionStorage unavailable */
    }
    if (!raw) return;
    try {
      const items: RemovedCartItem[] = JSON.parse(raw);
      if (items.length > 0) {
        toast({
          title: "تم حذف بعض الأصناف من السلة",
          description: `غير متوفرة لدى الوكيل في محافظتك الجديدة: ${items
            .map((i) => i.productName)
            .join("، ")}`,
          variant: "destructive",
        });
      }
    } catch {
      /* malformed payload, ignore */
    }
  }, [toast]);

  function setArea(area: string) {
    setDraft((d) => ({ ...d, area }));
  }

  function applyAreaCorrection() {
    const resolved = resolveGovernorateForArea(draft.area);
    if (resolved && resolved !== draft.governorate) {
      setDraft((d) => ({ ...d, governorate: resolved }));
    }
  }

  function setGovernorate(governorate: string) {
    setDraft((d) => ({
      ...d,
      governorate,
      city: GOVERNORATE_AS_CITY_VALUES.includes(governorate as (typeof GOVERNORATE_AS_CITY_VALUES)[number]) && !d.city.trim()
        ? governorate
        : d.city,
    }));
  }

  async function saveLocation() {
    if (!draft.governorate || !draft.area.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/storefront/governorate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          governorate: draft.governorate,
          area: draft.area.trim(),
          city: draft.city.trim() || null,
          street: draft.street.trim() || null,
          floor: draft.floor.trim() || null,
          apartment: draft.apartment.trim() || null,
          phone: draft.phone.trim() || null,
          label: draft.label.trim() || null,
        }),
      });
      const json = await parseJsonResponse<{
        success?: boolean;
        data?: { governorate: string; removedItems?: RemovedCartItem[] };
      }>(res);
      if (res.ok && json?.success && json.data?.governorate) {
        if (json.data.removedItems?.length) {
          try {
            sessionStorage.setItem(REMOVED_ITEMS_KEY, JSON.stringify(json.data.removedItems));
          } catch {
            /* sessionStorage unavailable */
          }
        }
        // Hard reload, not router.refresh(): every product/category/cart page reads the
        // location cookie server-side to resolve the partner whose stock to show, and several
        // of those reads sit behind a time-based cache (unstable_cache). A soft refresh can leave
        // stale per-partner stock numbers on screen; a full reload guarantees fresh data.
        window.location.reload();
        return;
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;

  return (
    <>
      {savedAddress && !editing ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="fixed bottom-4 left-4 z-[95] flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-lg transition-colors hover:bg-muted"
        >
          <MapPin className="h-4 w-4 text-burgundy" />
          {savedAddress.governorate}
        </button>
      ) : null}

      {editing ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/45 p-4 sm:items-center">
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-card p-5 text-right shadow-2xl max-h-[90vh] overflow-y-auto"
            dir="rtl"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-burgundy/10 text-burgundy">
                <MapPin className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-foreground">عنوان التوصيل</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  سنعرض توفر المقاسات حسب مخزون الوكيل المسؤول عن منطقتك.
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">المحافظة *</label>
                <Select
                  value={draft.governorate}
                  onChange={(e) => setGovernorate(e.target.value)}
                  className="h-11 rounded-xl"
                >
                  <option value="">اختر المحافظة</option>
                  {options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">المنطقة *</label>
                <Input
                  value={draft.area}
                  onChange={(e) => setArea(e.target.value)}
                  onBlur={applyAreaCorrection}
                  placeholder="مثال: الدقي"
                  className="h-11 rounded-xl"
                />
              </div>

              <button
                type="button"
                onClick={() => setShowMore((v) => !v)}
                className="flex w-full items-center justify-between text-sm font-medium text-primary"
              >
                أضف باقي بيانات العنوان (اختياري الآن)
                <ChevronDown className={cn("h-4 w-4 transition-transform", showMore && "rotate-180")} />
              </button>

              {showMore ? (
                <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-foreground">تسمية (اختياري)</label>
                    <Input
                      value={draft.label}
                      onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                      placeholder="مثال: المنزل"
                      className="rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-foreground">المدينة</label>
                    <Input
                      value={draft.city}
                      onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value }))}
                      className="rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-foreground">العنوان بالتفصيل</label>
                    <Input
                      value={draft.street}
                      onChange={(e) => setDraft((d) => ({ ...d, street: e.target.value }))}
                      className="rounded-xl"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-foreground">الدور</label>
                      <Input
                        value={draft.floor}
                        onChange={(e) => setDraft((d) => ({ ...d, floor: e.target.value }))}
                        className="rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-foreground">الشقة</label>
                      <Input
                        value={draft.apartment}
                        onChange={(e) => setDraft((d) => ({ ...d, apartment: e.target.value }))}
                        className="rounded-xl"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-foreground">هاتف التوصيل</label>
                    <Input
                      type="tel"
                      value={draft.phone}
                      onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
                      dir="ltr"
                      className="rounded-xl"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    استكمال هذه البيانات يحفظ العنوان كعنوان توصيل جاهز لطلباتك القادمة.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="mt-5 flex gap-2">
              {savedAddress ? (
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 rounded-xl"
                  onClick={() => {
                    setDraft({
                      governorate: savedAddress.governorate,
                      area: savedAddress.area ?? "",
                      city: savedAddress.city ?? "",
                      street: savedAddress.street ?? "",
                      floor: savedAddress.floor ?? "",
                      apartment: savedAddress.apartment ?? "",
                      phone: savedAddress.phone ?? "",
                      label: savedAddress.label ?? "",
                      notes: "",
                    });
                    setEditing(false);
                  }}
                  disabled={saving}
                >
                  إلغاء
                </Button>
              ) : null}
              <Button
                type="button"
                className="flex-1 rounded-xl"
                onClick={saveLocation}
                disabled={!draft.governorate || !draft.area.trim() || saving}
              >
                {saving ? "جاري الحفظ..." : "حفظ العنوان"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
