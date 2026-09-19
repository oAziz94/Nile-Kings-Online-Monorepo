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
import { useStorefrontBootstrap } from "@/components/storefront/storefront-bootstrap-provider";
import { GOVERNORATE_OPTIONS } from "@/lib/services/shipping";
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
  const bootstrap = useStorefrontBootstrap();
  const [options, setOptions] = React.useState<GovernorateOption[]>([]);
  const [savedAddress, setSavedAddress] = React.useState<StorefrontAddress | null>(null);
  const [draft, setDraft] = React.useState(emptyDraft);
  const [showMore, setShowMore] = React.useState(false);
  const [initialized, setInitialized] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [editing, setEditing] = React.useState(false);

  function draftFromAddress(address: StorefrontAddress | null) {
    return {
      governorate: address?.governorate ?? "",
      area: address?.area ?? "",
      city: address?.city ?? "",
      street: address?.street ?? "",
      floor: address?.floor ?? "",
      apartment: address?.apartment ?? "",
      phone: address?.phone ?? "",
      label: address?.label ?? "",
      notes: "",
    };
  }

  /** A real answer (from the bootstrap or the fallback fetch): render it, and force the modal
   * open only when there's genuinely no saved address yet (the intended "first-time visitor,
   * please pick a location" flow) — never as a side effect of a failed fetch. */
  function applyResolved(address: StorefrontAddress | null, resolvedOptions: GovernorateOption[]) {
    setOptions(resolvedOptions);
    setSavedAddress(address);
    setDraft(draftFromAddress(address));
    setEditing(!address);
    setInitialized(true);
  }

  /** Both the bootstrap and the fallback fetch failed: never force the modal open on a failure —
   * the guest must still be able to browse. The pill stays visible in a "pick your location"
   * prompt state (static `GOVERNORATE_OPTIONS` so the modal is never empty when opened by hand). */
  function applyFetchFailure() {
    setOptions(GOVERNORATE_OPTIONS);
    setSavedAddress(null);
    setDraft(draftFromAddress(null));
    setEditing(false);
    setInitialized(true);
  }

  // Initial data comes from the shared bootstrap request (backlog 6.2) instead of this
  // component's own `/api/storefront/governorate` GET; saving an address still POSTs there.
  // If the bootstrap request itself failed, fall back to this component's own GET — same pattern
  // `CartProvider` uses for `/api/cart` — before giving up and rendering the failure state above.
  React.useEffect(() => {
    if (initialized) return;
    if (bootstrap.status === "loading") return;
    if (bootstrap.status === "ready") {
      applyResolved(bootstrap.data?.governorate.address ?? null, bootstrap.data?.governorate.options ?? []);
      return;
    }

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
        if (json?.success && json.data) {
          applyResolved(json.data.address ?? null, json.data.options ?? []);
        } else {
          applyFetchFailure();
        }
      })
      .catch(() => {
        if (!cancelled) applyFetchFailure();
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrap.status, bootstrap.data, initialized]);

  const loading = !initialized;

  /** Shared by Escape, a backdrop click, and the إلغاء button: closing the modal always resets
   * the draft to the last known-good address (or an empty draft when there isn't one) rather than
   * leaving an in-progress edit lying around for the next open. */
  function closeEditing() {
    setDraft(draftFromAddress(savedAddress));
    setEditing(false);
  }

  // The forced-open modal must always be dismissable — Escape closes it regardless of *why* it's
  // open (verifier finding: a failed bootstrap must never lock the guest out of the page).
  React.useEffect(() => {
    if (!editing) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeEditing();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, savedAddress]);

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
      {!editing ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="fixed bottom-4 start-4 z-[95] flex items-center gap-2 rounded-none border border-[hsl(228_40%_14%)] bg-papyrus px-4 py-2 text-sm font-medium text-[hsl(228_26%_24%)] shadow-[0_10px_30px_-8px_rgba(21,26,46,0.25)] transition-colors hover:bg-[hsl(38_22%_93%)]"
        >
          <MapPin className="h-4 w-4 text-gold-600" />
          {savedAddress ? savedAddress.governorate : "اختر محافظتك"}
        </button>
      ) : null}

      {editing ? (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-[hsl(228_40%_9%)]/45 p-4 sm:items-center"
          onClick={closeEditing}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto border border-[hsl(228_16%_82%)] bg-papyrus p-5 text-right shadow-[0_24px_60px_-12px_rgba(21,26,46,0.28)]"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-[hsl(228_40%_14%)] text-[hsl(228_40%_14%)]">
                <MapPin className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-amiri text-lg font-bold text-[hsl(228_40%_14%)]">عنوان التوصيل</h2>
                <p className="mt-1 text-sm leading-6 text-[hsl(228_18%_45%)]">
                  سنعرض توفر المقاسات حسب مخزون الوكيل المسؤول عن منطقتك.
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-[hsl(228_26%_24%)]">المحافظة *</label>
                <Select
                  value={draft.governorate}
                  onChange={(e) => setGovernorate(e.target.value)}
                  className="h-11 rounded-none"
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
                <label className="mb-2 block text-sm font-medium text-[hsl(228_26%_24%)]">المنطقة *</label>
                <Input
                  value={draft.area}
                  onChange={(e) => setArea(e.target.value)}
                  onBlur={applyAreaCorrection}
                  placeholder="مثال: الدقي"
                  className="h-11 rounded-none"
                />
              </div>

              <button
                type="button"
                onClick={() => setShowMore((v) => !v)}
                className="flex w-full items-center justify-between text-sm font-medium text-[hsl(228_40%_14%)]"
              >
                أضف باقي بيانات العنوان (اختياري الآن)
                <ChevronDown className={cn("h-4 w-4 transition-transform", showMore && "rotate-180")} />
              </button>

              {showMore ? (
                <div className="space-y-4 border border-[hsl(228_16%_84%)] bg-[hsl(38_22%_95%)] p-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[hsl(228_26%_24%)]">تسمية (اختياري)</label>
                    <Input
                      value={draft.label}
                      onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                      placeholder="مثال: المنزل"
                      className="rounded-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[hsl(228_26%_24%)]">المدينة</label>
                    <Input
                      value={draft.city}
                      onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value }))}
                      className="rounded-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[hsl(228_26%_24%)]">العنوان بالتفصيل</label>
                    <Input
                      value={draft.street}
                      onChange={(e) => setDraft((d) => ({ ...d, street: e.target.value }))}
                      className="rounded-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-[hsl(228_26%_24%)]">الدور</label>
                      <Input
                        value={draft.floor}
                        onChange={(e) => setDraft((d) => ({ ...d, floor: e.target.value }))}
                        className="rounded-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-[hsl(228_26%_24%)]">الشقة</label>
                      <Input
                        value={draft.apartment}
                        onChange={(e) => setDraft((d) => ({ ...d, apartment: e.target.value }))}
                        className="rounded-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[hsl(228_26%_24%)]">هاتف التوصيل</label>
                    <Input
                      type="tel"
                      value={draft.phone}
                      onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
                      dir="ltr"
                      className="rounded-none"
                    />
                  </div>
                  <p className="text-xs text-[hsl(228_18%_45%)]">
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
                  className="flex-1 rounded-none"
                  onClick={closeEditing}
                  disabled={saving}
                >
                  إلغاء
                </Button>
              ) : null}
              <Button
                type="button"
                className="flex-1 rounded-none"
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
