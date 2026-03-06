"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GOVERNORATE_OPTIONS } from "@/lib/services/shipping";
import { parseJsonResponse } from "@/lib/api/parse-json";
import { MapPin, Plus, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  building: "",
  floor: "",
  apartment: "",
  notes: "",
  phone: "",
  isDefault: false,
};

export default function ProfileAddressesPage() {
  const { toast } = useToast();
  const [list, setList] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const load = () => {
    fetch("/api/profile/addresses", { credentials: "include" })
      .then(async (res) => {
        if (res.status === 401) window.location.href = "/login?redirect=/profile/addresses";
        return parseJsonResponse<{ success?: boolean; data?: SavedAddress[] }>(res);
      })
      .then((json) => {
        if (json?.success && json.data) setList(json.data);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => load(), []);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
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
      building: a.building ?? "",
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
    if (!form.governorate.trim() || !form.street.trim() || !form.phone.trim()) {
      toast({ title: "المحافظة والشارع والهاتف مطلوبة", variant: "destructive" });
      return;
    }
    const body = {
      ...form,
      city: form.city || null,
      area: form.area || null,
      building: form.building || null,
      floor: form.floor || null,
      apartment: form.apartment || null,
      notes: form.notes || null,
      label: form.label || null,
    };
    const url = editingId ? `/api/profile/addresses/${editingId}` : "/api/profile/addresses";
    const method = editingId ? "PATCH" : "POST";
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

  const remove = async (id: string) => {
    if (!confirm("حذف هذا العنوان؟")) return;
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
  };

  const formatAddress = (a: SavedAddress) => {
    const parts = [a.governorate, a.city, a.area, a.street].filter(Boolean);
    return parts.join("، ");
  };

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-foreground">عناويني</h1>
        <p className="mt-2 text-muted-foreground">جاري التحميل…</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">عناويني</h1>
          <p className="mt-1 text-sm text-muted-foreground">إدارة عناوين التوصيل</p>
        </div>
        <Button onClick={openAdd} className="rounded-2xl" size="sm">
          <Plus className="h-4 w-4 ml-2" />
          عنوان جديد
        </Button>
      </div>

      {showForm && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">
            {editingId ? "تعديل العنوان" : "عنوان جديد"}
          </h2>
          <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">تسمية (اختياري)</label>
              <Input
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="مثال: المنزل"
                className="rounded-xl"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">المحافظة *</label>
              <select
                value={form.governorate}
                onChange={(e) => setForm((f) => ({ ...f, governorate: e.target.value }))}
                className="flex h-10 w-full rounded-xl border border-input bg-background px-4 py-2 text-sm"
                required
                dir="rtl"
              >
                <option value="">اختر المحافظة</option>
                {GOVERNORATE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">المدينة</label>
              <Input
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                className="rounded-xl"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">المنطقة</label>
              <Input
                value={form.area}
                onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))}
                className="rounded-xl"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-foreground">الشارع *</label>
              <Input
                value={form.street}
                onChange={(e) => setForm((f) => ({ ...f, street: e.target.value }))}
                required
                className="rounded-xl"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">المبنى</label>
              <Input
                value={form.building}
                onChange={(e) => setForm((f) => ({ ...f, building: e.target.value }))}
                className="rounded-xl"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">هاتف التوصيل *</label>
              <Input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                required
                dir="ltr"
                className="rounded-xl"
              />
            </div>
            <div className="sm:col-span-2 flex gap-2">
              <Button type="submit" className="rounded-xl">{editingId ? "حفظ" : "إضافة"}</Button>
              <Button type="button" variant="outline" className="rounded-xl" onClick={closeForm}>إلغاء</Button>
            </div>
          </form>
        </div>
      )}

      {list.length === 0 && !showForm ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-8 text-center">
          <MapPin className="h-12 w-12 text-muted-foreground" />
          <p className="mt-4 text-muted-foreground">لا توجد عناوين محفوظة.</p>
          <Button onClick={openAdd} className="mt-4 rounded-2xl">إضافة عنوان</Button>
        </div>
      ) : (
        <ul className="mt-6 space-y-4">
          {list.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border bg-card p-4 sm:p-5"
            >
              <div>
                <div className="flex items-center gap-2">
                  {a.label && (
                    <span className="font-medium text-foreground">{a.label}</span>
                  )}
                  {a.isDefault && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      افتراضي
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{formatAddress(a)}</p>
                <p className="mt-1 text-sm text-muted-foreground" dir="ltr">{a.phone}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-xl"
                  onClick={() => openEdit(a)}
                  aria-label="تعديل"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                {!a.isDefault && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => setDefault(a.id)}
                  >
                    تعيين افتراضي
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-xl text-destructive hover:text-destructive"
                  onClick={() => remove(a.id)}
                  aria-label="حذف"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
