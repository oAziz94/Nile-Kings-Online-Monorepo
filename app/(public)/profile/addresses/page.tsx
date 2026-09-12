"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/shared/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { GOVERNORATE_OPTIONS } from "@/lib/services/shipping";
import { parseJsonResponse } from "@/lib/api/parse-json";
import { isSavedAddressIncomplete } from "@/lib/addresses/completeness";
import { MapPin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { authLabelClass, authFieldBoxClass, authBareInputClass, authBareSelectStyle } from "@/components/auth/auth-ui";
import { cn } from "@/lib/utils";

type SavedAddress = {
  id: string;
  label: string | null;
  governorate: string;
  city: string | null;
  area: string | null;
  street: string;
  building: string | null;
  floor: string | null;
  apartment: string | null;
  notes: string | null;
  phone: string;
  isDefault: boolean;
};

const emptyForm = {
  label: "",
  governorate: "",
  city: "",
  area: "",
  street: "",
  floor: "",
  apartment: "",
  notes: "",
  phone: "",
  isDefault: false,
};

const inkButtonClass = "h-14 rounded-none bg-[hsl(228_40%_14%)] text-papyrus hover:bg-[hsl(228_40%_20%)]";
const outlineButtonClass = "h-14 rounded-none border-[hsl(228_40%_14%)] text-[hsl(228_40%_14%)]";

function AddressesSkeleton() {
  return (
    <div role="status" aria-label="جارٍ تحميل العناوين" className="mt-8 flex flex-col gap-0 border-t border-[hsl(228_16%_84%)]">
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-3 border-b border-[hsl(228_16%_84%)] py-6">
          <Skeleton className="h-5 w-1/3 max-w-[220px]" />
          <Skeleton className="h-4 w-2/3 max-w-[360px]" />
          <Skeleton className="h-4 w-1/4 max-w-[140px]" />
        </div>
      ))}
    </div>
  );
}

function TextField({
  id,
  label,
  required,
  className,
  ...inputProps
}: React.InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; className?: string }) {
  return (
    <div className={cn("space-y-2.5", className)}>
      <label htmlFor={id} className={authLabelClass}>
        {label}
        {required && " *"}
      </label>
      <div className={authFieldBoxClass()}>
        <input id={id} required={required} className={authBareInputClass} {...inputProps} />
      </div>
    </div>
  );
}

export default function ProfileAddressesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [list, setList] = React.useState<SavedAddress[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [profilePhone, setProfilePhone] = React.useState<string>("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [showForm, setShowForm] = React.useState(false);
  const [form, setForm] = React.useState(emptyForm);
  const [submitting, setSubmitting] = React.useState(false);
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.data?.phone) setProfilePhone(data.data.phone);
      })
      .catch(() => {});
  }, []);

  const load = React.useCallback(() => {
    fetch("/api/profile/addresses", { credentials: "include" })
      .then(async (res) => {
        if (res.status === 401) {
          router.replace("/login?redirect=/profile/addresses");
          return null;
        }
        return parseJsonResponse<{ success?: boolean; data?: SavedAddress[] }>(res);
      })
      .then((json) => {
        if (json?.success && json.data) {
          const sorted = [...json.data].sort((a, b) => {
            const aIncomplete = isSavedAddressIncomplete(a) ? 0 : 1;
            const bIncomplete = isSavedAddressIncomplete(b) ? 0 : 1;
            return aIncomplete - bIncomplete;
          });
          setList(sorted);
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

  React.useEffect(() => load(), [load]);

  const openAdd = () => {
    setEditingId(null);
    setForm({ ...emptyForm, phone: profilePhone });
    setShowForm(true);
  };

  const openEdit = (a: SavedAddress) => {
    setEditingId(a.id);
    setForm({
      label: a.label ?? "",
      governorate: a.governorate,
      city: a.city ?? "",
      area: a.area ?? "",
      street: a.street,
      floor: a.floor ?? "",
      apartment: a.apartment ?? "",
      notes: a.notes ?? "",
      phone: a.phone,
      isDefault: a.isDefault,
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!form.governorate.trim() || !form.city.trim() || !form.area.trim() || !form.street.trim() || !form.phone.trim()) {
      toast({ title: "المحافظة والمدينة والمنطقة والعنوان بالتفصيل والهاتف مطلوبة", variant: "destructive" });
      return;
    }
    const body = {
      ...form,
      city: form.city.trim(),
      area: form.area || null,
      floor: form.floor || null,
      apartment: form.apartment || null,
      notes: form.notes || null,
      label: form.label || null,
    };
    const url = editingId ? `/api/profile/addresses/${editingId}` : "/api/profile/addresses";
    const method = editingId ? "PATCH" : "POST";
    setSubmitting(true);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const json = await parseJsonResponse<{ success?: boolean; error?: { message?: string } }>(res);
      if (json?.success) {
        toast({ title: editingId ? "تم تحديث العنوان" : "تمت إضافة العنوان" });
        load();
        closeForm();
      } else {
        toast({ title: json?.error?.message ?? "حدث خطأ", variant: "destructive" });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const setDefault = async (id: string) => {
    const res = await fetch(`/api/profile/addresses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ isDefault: true }),
    });
    const json = await parseJsonResponse<{ success?: boolean }>(res);
    if (json?.success) {
      toast({ title: "تم تعيين العنوان الافتراضي" });
      load();
    }
  };

  const confirmDelete = async () => {
    const id = pendingDeleteId;
    if (!id) return;
    const res = await fetch(`/api/profile/addresses/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    const json = await parseJsonResponse<{ success?: boolean; error?: { message?: string } }>(res);
    if (json?.success) {
      toast({ title: "تم حذف العنوان" });
      load();
      if (editingId === id) closeForm();
    } else {
      toast({ title: json?.error?.message ?? "حدث خطأ", variant: "destructive" });
    }
    setPendingDeleteId(null);
  };

  const formatAddress = (a: SavedAddress) => {
    const parts = [a.governorate, a.city, a.area, a.street].filter(Boolean);
    return parts.join("، ");
  };

  if (loading) {
    return (
      <div>
        <h2 className="font-amiri text-2xl font-bold text-[hsl(228_40%_14%)]">عناويني</h2>
        <AddressesSkeleton />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-amiri text-2xl font-bold text-[hsl(228_40%_14%)]">عناويني</h2>
        <Button onClick={openAdd} className={inkButtonClass} size="lg">
          عنوان جديد
        </Button>
      </div>

      {showForm && (
        <div className="mt-8 border-t border-[hsl(228_16%_84%)] pt-8">
          <h3 className="font-plex-arabic text-lg font-semibold text-[hsl(228_40%_14%)]">
            {editingId ? "تعديل العنوان" : "عنوان جديد"}
          </h3>
          <form onSubmit={submit} className="mt-6 grid gap-6 sm:grid-cols-2">
            <TextField
              id="address-label"
              label="تسمية (اختياري)"
              placeholder="مثال: المنزل"
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            />
            <div className="space-y-2.5">
              <label htmlFor="address-governorate" className={authLabelClass}>
                المحافظة *
              </label>
              <div className={authFieldBoxClass()}>
                <select
                  id="address-governorate"
                  value={form.governorate}
                  onChange={(e) => setForm((f) => ({ ...f, governorate: e.target.value }))}
                  required
                  dir="rtl"
                  style={authBareSelectStyle}
                  className="h-full w-full flex-1 cursor-pointer appearance-none rounded-none border-0 bg-transparent bg-no-repeat bg-[position:left_16px_center] px-4 font-plex-arabic text-[16px] text-[hsl(228_40%_14%)] focus-visible:outline-none"
                >
                  <option value="">اختر المحافظة</option>
                  {GOVERNORATE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <TextField
              id="address-city"
              label="المدينة"
              required
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            />
            <TextField
              id="address-phone"
              label="هاتف التوصيل"
              required
              type="tel"
              dir="ltr"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
            <TextField
              id="address-area"
              label="المنطقة"
              required
              value={form.area}
              onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))}
            />
            <TextField
              id="address-street"
              label="العنوان بالتفصيل"
              required
              className="sm:col-span-2"
              value={form.street}
              onChange={(e) => setForm((f) => ({ ...f, street: e.target.value }))}
            />
            <TextField
              id="address-notes"
              label="ملاحظات (اختياري)"
              className="sm:col-span-2"
              placeholder="أي ملاحظات للتوصيل"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
            <div className="flex gap-3 sm:col-span-2">
              <Button type="submit" className={inkButtonClass} disabled={submitting}>
                {submitting ? "جارٍ الحفظ…" : editingId ? "حفظ" : "إضافة"}
              </Button>
              <Button type="button" variant="outline" className={outlineButtonClass} onClick={closeForm} disabled={submitting}>
                إلغاء
              </Button>
            </div>
          </form>
        </div>
      )}

      {list.length === 0 && !showForm ? (
        <EmptyState
          className="mt-8"
          icon={<MapPin className="h-8 w-8" strokeWidth={1.3} />}
          title="لا توجد عناوين محفوظة."
          action={
            <Button onClick={openAdd} className={inkButtonClass}>
              إضافة عنوان
            </Button>
          }
        />
      ) : (
        <ul className="mt-8 list-none border-t border-[hsl(228_16%_84%)] p-0">
          {list.map((a) => (
            <li key={a.id} className="flex flex-wrap items-start justify-between gap-4 border-b border-[hsl(228_16%_84%)] py-6">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  {a.label && <span className="font-plex-arabic font-medium text-[hsl(228_40%_14%)]">{a.label}</span>}
                  {isSavedAddressIncomplete(a) && (
                    <span className="font-plex-arabic text-xs text-[hsl(38_65%_38%)]">يحتاج المدينة</span>
                  )}
                  {a.isDefault && <span className="font-plex-arabic text-xs text-gold-600">افتراضي</span>}
                </div>
                <p className="mt-1.5 text-sm text-[hsl(228_18%_45%)]">{formatAddress(a)}</p>
                <p className="mt-1 font-archivo text-sm text-[hsl(228_18%_45%)]" dir="ltr">
                  {a.phone}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-4 text-sm">
                <button
                  type="button"
                  onClick={() => openEdit(a)}
                  className="border-b border-transparent text-[hsl(228_40%_14%)] hover:border-gold-500"
                >
                  تعديل
                </button>
                {!a.isDefault && (
                  <button
                    type="button"
                    onClick={() => setDefault(a.id)}
                    className="border-b border-transparent text-[hsl(228_40%_14%)] hover:border-gold-500"
                  >
                    تعيين افتراضي
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPendingDeleteId(a.id)}
                  className="border-b border-transparent text-[hsl(6_58%_42%)] hover:border-[hsl(6_58%_42%)]"
                >
                  حذف
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={pendingDeleteId != null} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
        <DialogContent className="rounded-none border border-[hsl(228_16%_84%)] bg-papyrus">
          <DialogHeader>
            <DialogTitle className="font-amiri text-xl font-bold text-[hsl(228_40%_14%)]">حذف هذا العنوان؟</DialogTitle>
            <DialogDescription className="text-[hsl(228_18%_45%)]">
              لا يمكن التراجع عن هذا الإجراء بعد التأكيد.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className={cn(outlineButtonClass, "h-11")} onClick={() => setPendingDeleteId(null)}>
              إلغاء
            </Button>
            <Button className={cn(inkButtonClass, "h-11")} onClick={confirmDelete}>
              حذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
