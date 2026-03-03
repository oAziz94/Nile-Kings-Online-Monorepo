"use client";

import * as React from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/shared/skeleton";
import { Ticket, Plus } from "lucide-react";

type Coupon = {
  id: string;
  code: string;
  discountType: string;
  discountValue: number;
  minOrderPiastres: number | null;
  maxUses: number | null;
  usedCount: number;
  validFrom: string;
  validUntil: string | null;
  active: boolean;
};

export default function AdminCouponsPage() {
  const [list, setList] = React.useState<Coupon[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    code: "",
    discountType: "PERCENT" as "PERCENT" | "FIXED",
    discountValue: "10",
    minOrderPiastres: "",
    maxUses: "",
    active: true,
  });
  const { toast } = useToast();

  const load = React.useCallback(() => {
    fetch("/api/admin/coupons", { credentials: "include" })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: Coupon[] }) => {
        if (json?.success && Array.isArray(json.data)) setList(json.data);
      })
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => load(), [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = form.code.trim().toUpperCase();
    if (!code) {
      toast({ title: "كود الكوبون مطلوب", variant: "destructive" });
      return;
    }
    const discountValue = form.discountType === "PERCENT" ? Math.min(100, Math.max(1, parseInt(form.discountValue, 10) || 0)) : Math.max(0, parseFloat(form.discountValue) || 0);
    if (form.discountType === "PERCENT" && (discountValue < 1 || discountValue > 100)) {
      toast({ title: "النسبة المئوية بين 1 و 100", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          code,
          discountType: form.discountType,
          discountValue: form.discountType === "FIXED" ? Math.round(discountValue * 100) : discountValue,
          minOrderPiastres: form.minOrderPiastres === "" ? null : Math.round(parseFloat(form.minOrderPiastres) * 100),
          maxUses: form.maxUses === "" ? null : parseInt(form.maxUses, 10),
          active: form.active,
        }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        toast({ title: "تم إنشاء الكوبون" });
        setOpen(false);
        setForm({ code: "", discountType: "PERCENT", discountValue: "10", minOrderPiastres: "", maxUses: "", active: true });
        load();
      } else toast({ title: json?.error?.message ?? "فشل", variant: "destructive" });
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton className="h-64 w-full rounded-2xl" />;

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">الكوبونات</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" />
              إضافة كوبون
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={create}>
              <DialogHeader>
                <DialogTitle>كوبون جديد</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>الكود *</Label>
                  <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="SUMMER20" required />
                </div>
                <div className="grid gap-2">
                  <Label>نوع الخصم</Label>
                  <Select value={form.discountType} onChange={(e) => setForm((f) => ({ ...f, discountType: e.target.value as "PERCENT" | "FIXED" }))}>
                    <option value="PERCENT">نسبة مئوية</option>
                    <option value="FIXED">قيمة ثابتة (ج.م)</option>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>{form.discountType === "PERCENT" ? "النسبة (1–100)" : "القيمة (ج.م)"}</Label>
                  <Input type="number" min={form.discountType === "PERCENT" ? 1 : 0} max={form.discountType === "PERCENT" ? 100 : undefined} step={0.01} value={form.discountValue} onChange={(e) => setForm((f) => ({ ...f, discountValue: e.target.value }))} />
                </div>
                <div className="grid gap-2">
                  <Label>الحد الأدنى للطلب (ج.م)</Label>
                  <Input type="number" min={0} step={0.01} value={form.minOrderPiastres} onChange={(e) => setForm((f) => ({ ...f, minOrderPiastres: e.target.value }))} placeholder="0" />
                </div>
                <div className="grid gap-2">
                  <Label>الحد الأقصى لمرات الاستخدام</Label>
                  <Input type="number" min={0} value={form.maxUses} onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))} placeholder="غير محدود" />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} className="rounded border-input" />
                  <Label>نشط</Label>
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">إلغاء</Button>
                </DialogClose>
                <Button type="submit" disabled={saving}>{saving ? "جاري…" : "إنشاء"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>قائمة الكوبونات</CardTitle>
          <CardDescription>إدارة أكواد الخصم.</CardDescription>
        </CardHeader>
        <CardContent>
          {list.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 py-16 text-center">
              <Ticket className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-2">لا توجد كوبونات</p>
              <Button variant="outline" onClick={() => setOpen(true)}>إضافة أول كوبون</Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الكود</TableHead>
                  <TableHead>الخصم</TableHead>
                  <TableHead>الحد الأدنى للطلب</TableHead>
                  <TableHead>المستخدم / الأقصى</TableHead>
                  <TableHead>الحالة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono font-medium">{c.code}</TableCell>
                    <TableCell>{c.discountType === "PERCENT" ? `${c.discountValue}%` : `${(c.discountValue / 100).toFixed(0)} ج.م`}</TableCell>
                    <TableCell>{c.minOrderPiastres != null ? `${(c.minOrderPiastres / 100).toFixed(0)} ج.م` : "—"}</TableCell>
                    <TableCell>{c.usedCount}{c.maxUses != null ? ` / ${c.maxUses}` : ""}</TableCell>
                    <TableCell><Badge variant={c.active ? "success" : "secondary"}>{c.active ? "نشط" : "معطّل"}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
