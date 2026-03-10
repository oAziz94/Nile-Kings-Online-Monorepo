"use client";

import * as React from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/shared/skeleton";

type OtpRules = {
  expiryMinutes: number;
  cooldownSeconds: number;
  maxVerifyAttempts: number;
  lockMinutes: number;
};

export default function AdminSettingsPage() {
  const [codFeePercent, setCodFeePercent] = React.useState<number | "">("");
  const [otpRules, setOtpRules] = React.useState<OtpRules | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [savingCod, setSavingCod] = React.useState(false);
  const [savingOtp, setSavingOtp] = React.useState(false);
  const [otpForm, setOtpForm] = React.useState({ expiryMinutes: "", cooldownSeconds: "", maxVerifyAttempts: "", lockMinutes: "" });
  const { toast } = useToast();

  React.useEffect(() => {
    Promise.all([
      fetch("/api/admin/settings/cod-fee", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/admin/settings/otp-rules", { credentials: "include" }).then((r) => r.json()),
    ])
      .then(([codRes, otpRes]) => {
        if (codRes?.success && codRes.data && typeof codRes.data.codFeePercent === "number") {
          setCodFeePercent(codRes.data.codFeePercent);
        }
        if (otpRes?.success && otpRes.data) {
          setOtpRules(otpRes.data);
          setOtpForm({
            expiryMinutes: String(otpRes.data.expiryMinutes),
            cooldownSeconds: String(otpRes.data.cooldownSeconds),
            maxVerifyAttempts: String(otpRes.data.maxVerifyAttempts),
            lockMinutes: String(otpRes.data.lockMinutes),
          });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const saveCodFee = async (e: React.FormEvent) => {
    e.preventDefault();
    const percentVal = codFeePercent === "" ? 0 : Number(codFeePercent);
    if (percentVal < 0 || percentVal > 100) {
      toast({ title: "النسبة يجب أن تكون بين 0 و 100", variant: "destructive" });
      return;
    }
    setSavingCod(true);
    try {
      const res = await fetch("/api/admin/settings/cod-fee", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ codFeePiastres: 0, codFeePercent: percentVal }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        setCodFeePercent(json.data.codFeePercent);
        toast({ title: "تم حفظ رسوم الدفع عند الاستلام" });
      } else toast({ title: json?.error?.message ?? "فشل", variant: "destructive" });
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setSavingCod(false);
    }
  };

  const saveOtpRules = async (e: React.FormEvent) => {
    e.preventDefault();
    const expiryMinutes = parseInt(otpForm.expiryMinutes, 10);
    const cooldownSeconds = parseInt(otpForm.cooldownSeconds, 10);
    const maxVerifyAttempts = parseInt(otpForm.maxVerifyAttempts, 10);
    const lockMinutes = parseInt(otpForm.lockMinutes, 10);
    if ([expiryMinutes, cooldownSeconds, maxVerifyAttempts, lockMinutes].some((n) => !Number.isFinite(n) || n < 0)) {
      toast({ title: "قيم صحيحة مطلوبة", variant: "destructive" });
      return;
    }
    setSavingOtp(true);
    try {
      const res = await fetch("/api/admin/settings/otp-rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          expiryMinutes: Math.min(60, Math.max(1, expiryMinutes)),
          cooldownSeconds: Math.min(300, Math.max(0, cooldownSeconds)),
          maxVerifyAttempts: Math.min(10, Math.max(1, maxVerifyAttempts)),
          lockMinutes: Math.min(60, Math.max(1, lockMinutes)),
        }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        setOtpRules(json.data);
        setOtpForm({
          expiryMinutes: String(json.data.expiryMinutes),
          cooldownSeconds: String(json.data.cooldownSeconds),
          maxVerifyAttempts: String(json.data.maxVerifyAttempts),
          lockMinutes: String(json.data.lockMinutes),
        });
        toast({ title: "تم حفظ إعدادات OTP" });
      } else toast({ title: json?.error?.message ?? "فشل", variant: "destructive" });
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setSavingOtp(false);
    }
  };

  if (loading) return <Skeleton className="h-96 w-full rounded-2xl" />;

  return (
    <div dir="rtl" className="space-y-6">
      <h1 className="text-2xl font-bold">الإعدادات</h1>

      <Card>
        <CardHeader>
          <CardTitle>رسوم الدفع عند الاستلام (COD)</CardTitle>
          <CardDescription>نسبة مئوية من (مجموع المنتجات + التوصيل − الخصم إن وُجد). مثال: 2 = 2٪ من هذا المجموع.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveCodFee} className="flex flex-wrap items-end gap-4">
            <div className="grid gap-2">
              <Label htmlFor="cod-fee-percent">النسبة (٪)</Label>
              <Input
                id="cod-fee-percent"
                type="number"
                min={0}
                max={100}
                step={0.1}
                placeholder="0"
                value={codFeePercent}
                onChange={(e) => setCodFeePercent(e.target.value === "" ? "" : parseFloat(e.target.value) || 0)}
              />
            </div>
            <Button type="submit" disabled={savingCod}>{savingCod ? "جاري…" : "حفظ"}</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>قواعد OTP</CardTitle>
          <CardDescription>مدة صلاحية الكود، المهلة بين الطلبات، عدد المحاولات، مدة القفل.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveOtpRules} className="space-y-4 max-w-md">
            <div className="grid gap-2">
              <Label>مدة صلاحية الكود (دقيقة)</Label>
              <Input
                type="number"
                min={1}
                max={60}
                value={otpForm.expiryMinutes}
                onChange={(e) => setOtpForm((f) => ({ ...f, expiryMinutes: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>المهلة بين طلبات الإرسال (ثانية)</Label>
              <Input
                type="number"
                min={0}
                max={300}
                value={otpForm.cooldownSeconds}
                onChange={(e) => setOtpForm((f) => ({ ...f, cooldownSeconds: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>الحد الأقصى لمحاولات التحقق قبل القفل</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={otpForm.maxVerifyAttempts}
                onChange={(e) => setOtpForm((f) => ({ ...f, maxVerifyAttempts: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>مدة القفل (دقيقة)</Label>
              <Input
                type="number"
                min={1}
                max={60}
                value={otpForm.lockMinutes}
                onChange={(e) => setOtpForm((f) => ({ ...f, lockMinutes: e.target.value }))}
              />
            </div>
            <Button type="submit" disabled={savingOtp}>{savingOtp ? "جاري…" : "حفظ إعدادات OTP"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
