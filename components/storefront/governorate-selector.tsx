"use client";

import * as React from "react";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { parseJsonResponse } from "@/lib/api/parse-json";

type GovernorateOption = { value: string; label: string };

export function GovernorateSelector() {
  const [options, setOptions] = React.useState<GovernorateOption[]>([]);
  const [governorate, setGovernorate] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [editing, setEditing] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/storefront/governorate", { credentials: "include", cache: "no-store" })
      .then((res) =>
        parseJsonResponse<{
          success?: boolean;
          data?: { governorate: string | null; options: GovernorateOption[] };
        }>(res)
      )
      .then((json) => {
        if (cancelled) return;
        const nextGovernorate = json?.data?.governorate ?? null;
        setOptions(json?.data?.options ?? []);
        setGovernorate(nextGovernorate);
        setDraft(nextGovernorate ?? "");
        setEditing(!nextGovernorate);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveGovernorate() {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await fetch("/api/storefront/governorate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ governorate: draft }),
      });
      const json = await parseJsonResponse<{ success?: boolean; data?: { governorate: string } }>(res);
      if (res.ok && json?.success && json.data?.governorate) {
        // Hard reload, not router.refresh(): every product/category/cart page reads the
        // governorate cookie server-side to resolve the partner whose stock to show, and several
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
      {governorate && !editing ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="fixed bottom-4 left-4 z-[95] flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-lg transition-colors hover:bg-muted"
        >
          <MapPin className="h-4 w-4 text-burgundy" />
          {governorate}
        </button>
      ) : null}

      {editing ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/45 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 text-right shadow-2xl" dir="rtl">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-burgundy/10 text-burgundy">
                <MapPin className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-foreground">اختار محافظة التوصيل</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  سنعرض توفر المقاسات حسب مخزون الوكيل المسؤول عن محافظتك.
                </p>
              </div>
            </div>

            <div className="mt-5">
              <label className="mb-2 block text-sm font-medium text-foreground">المحافظة</label>
              <Select
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
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

            <div className="mt-5 flex gap-2">
              {governorate ? (
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 rounded-xl"
                  onClick={() => {
                    setDraft(governorate);
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
                onClick={saveGovernorate}
                disabled={!draft || saving}
              >
                {saving ? "جاري الحفظ..." : "حفظ المحافظة"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
