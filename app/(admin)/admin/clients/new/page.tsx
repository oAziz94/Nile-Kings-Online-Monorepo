"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { GOVERNORATE_OPTIONS } from "@/lib/services/shipping";
import { UserPlus, Loader2 } from "lucide-react";

export default function NewClientPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [saving, setSaving] = React.useState(false);
  const [phone, setPhone] = React.useState("");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [addressLabel, setAddressLabel] = React.useState("المنزل");
  const [governorate, setGovernorate] = React.useState("");
  const [city, setCity] = React.useState("");
  const [area, setArea] = React.useState("");
  const [street, setStreet] = React.useState("");
  const [addressPhone, setAddressPhone] = React.useState("");
  const [notes, setNotes] = React.useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim() || !name.trim() || name.trim().length < 2) {
      toast({ title: "الهاتف والاسم مطلوبان", variant: "destructive" });
      return;
    }
    if (password.length < 8) {
      toast({ title: "كلمة المرور 8 أحرف على الأقل", variant: "destructive" });
      return;
    }
    if (!governorate || !city.trim() || !area.trim() || !street.trim() || !addressPhone.trim()) {
      toast({ title: "جميع حقول العنوان مطلوبة", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          phone: phone.trim(),
          name: name.trim(),
          email: email.trim() || undefined,
          password,
          address: {
            label: addressLabel.trim() || null,
            governorate,
            city: city.trim(),
            area: area.trim(),
            street: street.trim(),
            notes: notes.trim() || null,
            phone: addressPhone.trim(),
            isDefault: true,
          },
        }),
      });
      const json = await res.json();
      if (res.ok && json?.success && json.data?.user?.id) {
        toast({ title: json.message ?? "تم إنشاء العميل" });
        router.push(`/admin/clients/${json.data.user.id}`);
      } else {
        toast({ title: json?.error?.message ?? "فشل الإنشاء", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="عميل جديد"
        description="إنشاء حساب عميل بكلمة مرور وعنوان توصيل افتراضي."
        actions={
          <Button variant="outline" className="rounded-xl" asChild>
            <Link href="/admin/clients">← القائمة</Link>
          </Button>
        }
      />

      <form onSubmit={submit} className="mx-auto max-w-2xl space-y-6">
        <Card className="rounded-2xl shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-burgundy" />
              بيانات الحساب
            </CardTitle>
            <CardDescription>رقم الجوال فريد — يُستخدم لتسجيل الدخول.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone">رقم الجوال</Label>
              <Input
                id="phone"
                dir="ltr"
                className="font-mono"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+2010..."
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">الاسم</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">البريد (اختياري)</Label>
              <Input
                id="email"
                type="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">كلمة المرور</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-card">
          <CardHeader>
            <CardTitle>عنوان التوصيل الافتراضي</CardTitle>
            <CardDescription>يُستخدم عند إنشاء طلبات لهذا العميل من لوحة الإدارة.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="addressLabel">التسمية</Label>
              <Input
                id="addressLabel"
                value={addressLabel}
                onChange={(e) => setAddressLabel(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="governorate">المحافظة</Label>
              <Select
                id="governorate"
                value={governorate}
                onChange={(e) => setGovernorate(e.target.value)}
                required
              >
                <option value="">اختر المحافظة</option>
                {GOVERNORATE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="city">المدينة</Label>
                <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="area">المنطقة</Label>
                <Input id="area" value={area} onChange={(e) => setArea(e.target.value)} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="street">العنوان بالتفصيل</Label>
              <Input id="street" value={street} onChange={(e) => setStreet(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="addressPhone">هاتف التوصيل</Label>
              <Input
                id="addressPhone"
                dir="ltr"
                className="font-mono"
                value={addressPhone}
                onChange={(e) => setAddressPhone(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">ملاحظات (اختياري)</Label>
              <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" className="rounded-xl" asChild>
            <Link href="/admin/clients">إلغاء</Link>
          </Button>
          <Button type="submit" className="rounded-xl" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            إنشاء العميل
          </Button>
        </div>
      </form>
    </div>
  );
}
