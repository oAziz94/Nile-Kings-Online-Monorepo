"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { GOVERNORATE_OPTIONS } from "@/lib/services/shipping";

export default function NewReroutingRulePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [governorate, setGovernorate] = React.useState("");
  const [isActive, setIsActive] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!governorate.trim()) {
      toast({ title: "اختر المحافظة", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/rerouting-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ governorate: governorate.trim(), isActive }),
      });
      const json = await res.json();
      if (res.ok && json?.success && json?.data?.id) {
        toast({ title: "تم إنشاء قاعدة التوجيه" });
        router.push(`/admin/rerouting-rules/${json.data.id}`);
      } else {
        toast({ title: json?.error?.message ?? "فشل الحفظ", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div dir="rtl" className="space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/admin/rerouting-rules">← قواعد التوجيه</Link>
      </Button>
      <h1 className="text-2xl font-bold">قاعدة توجيه جديدة</h1>
      <Card>
        <CardHeader>
          <CardTitle>إضافة قاعدة لمحافظة</CardTitle>
          <CardDescription>اختر المحافظة. بعد الحفظ يمكنك إضافة الشركاء من صفحة التفاصيل.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4 max-w-md">
            <div className="grid gap-2">
              <Label htmlFor="governorate">المحافظة</Label>
              <Select
                id="governorate"
                value={governorate}
                onChange={(e) => setGovernorate(e.target.value)}
                required
              >
                <option value="">— اختر المحافظة —</option>
                {GOVERNORATE_OPTIONS.map((g) => (
                  <option key={g.value} value={g.value}>{g.label}</option>
                ))}
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="isActive">الحالة</Label>
              <Select
                id="isActive"
                value={isActive ? "true" : "false"}
                onChange={(e) => setIsActive(e.target.value === "true")}
              >
                <option value="true">مفعّل</option>
                <option value="false">معطّل</option>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? "جاري الحفظ…" : "حفظ"}
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href="/admin/rerouting-rules">إلغاء</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
