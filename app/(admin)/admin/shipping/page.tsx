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
import { Truck, Plus } from "lucide-react";
import { GOVERNORATE_OPTIONS } from "@/lib/services/shipping";

type Rule = {
  id: string;
  provider: string;
  governorate: string;
  city: string | null;
  area: string | null;
  weightMin: number;
  weightMax: number;
  feePiastres: number;
  priority: number;
  active: boolean;
};

export default function AdminShippingPage() {
  const [rules, setRules] = React.useState<Rule[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    provider: "Egypt Post",
    governorate: "",
    city: "",
    area: "",
    weightMin: "0",
    weightMax: "100000",
    feePiastres: "0",
    priority: "0",
    active: true,
  });
  const { toast } = useToast();

  const load = React.useCallback(() => {
    fetch("/api/admin/shipping-rules", { credentials: "include" })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: { rules: Rule[] } }) => {
        if (json?.success && json.data?.rules) setRules(json.data.rules);
      })
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => load(), [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const weightMin = parseInt(form.weightMin, 10) || 0;
    const weightMax = parseInt(form.weightMax, 10) || 0;
    if (weightMin > weightMax) {
      toast({ title: "الحد الأدنى للوزن يجب أن يكون أقل من الحد الأقصى", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/shipping-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          provider: form.provider,
          governorate: form.governorate,
          city: form.city || null,
          area: form.area || null,
          weightMin,
          weightMax,
          feePiastres: Math.round(parseFloat(form.feePiastres) * 100) || 0,
          priority: parseInt(form.priority, 10) || 0,
          active: form.active,
        }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        toast({ title: "تم إنشاء قاعدة الشحن" });
        setOpen(false);
        setForm({ provider: "Egypt Post", governorate: "", city: "", area: "", weightMin: "0", weightMax: "100000", feePiastres: "0", priority: "0", active: true });
        load();
      } else {
        toast({ title: json?.error?.message ?? json?.error?.details?.overlappingRuleIds ? "تداخل مع قاعدة موجودة" : "فشل", variant: "destructive" });
      }
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
        <h1 className="text-2xl font-bold">قواعد الشحن</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" />
              إضافة قاعدة
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={create}>
              <DialogHeader>
                <DialogTitle>قاعدة شحن جديدة</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">تجنّب تداخل نطاقات الوزن لنفس المزود والوجهة.</p>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>المزود</Label>
                  <Select value={form.provider} onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}>
                    <option value="Egypt Post">Egypt Post</option>
                    <option value="Turbo">Turbo</option>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>المحافظة *</Label>
                  <Select value={form.governorate} onChange={(e) => setForm((f) => ({ ...f, governorate: e.target.value }))} required>
                    <option value="">اختر المحافظة</option>
                    {GOVERNORATE_OPTIONS.map((g) => (
                      <option key={g.value} value={g.value}>{g.label}</option>
                    ))}
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>الحد الأدنى للوزن (غ)</Label>
                    <Input type="number" min={0} value={form.weightMin} onChange={(e) => setForm((f) => ({ ...f, weightMin: e.target.value }))} />
                  </div>
                  <div className="grid gap-2">
                    <Label>الحد الأقصى للوزن (غ)</Label>
                    <Input type="number" min={0} value={form.weightMax} onChange={(e) => setForm((f) => ({ ...f, weightMax: e.target.value }))} />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>رسوم الشحن (ج.م)</Label>
                  <Input type="number" min={0} step={0.01} value={form.feePiastres} onChange={(e) => setForm((f) => ({ ...f, feePiastres: e.target.value }))} />
                </div>
                <div className="grid gap-2">
                  <Label>الأولوية (أعلى = أولوية أكبر)</Label>
                  <Input type="number" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} />
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
          <CardTitle>قائمة قواعد الشحن</CardTitle>
          <CardDescription>تحقق من عدم تداخل نطاقات الوزن لنفس المزود والوجهة.</CardDescription>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 py-16 text-center">
              <Truck className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-2">لا توجد قواعد شحن</p>
              <Button variant="outline" onClick={() => setOpen(true)}>إضافة أول قاعدة</Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>المزود</TableHead>
                  <TableHead>المحافظة</TableHead>
                  <TableHead>الوزن (غ)</TableHead>
                  <TableHead>الرسوم (ج.م)</TableHead>
                  <TableHead>الأولوية</TableHead>
                  <TableHead>الحالة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.provider}</TableCell>
                    <TableCell>{r.governorate}{r.city ? ` / ${r.city}` : ""}</TableCell>
                    <TableCell>{r.weightMin} – {r.weightMax}</TableCell>
                    <TableCell>{(r.feePiastres / 100).toFixed(0)}</TableCell>
                    <TableCell>{r.priority}</TableCell>
                    <TableCell><Badge variant={r.active ? "success" : "secondary"}>{r.active ? "نشط" : "معطّل"}</Badge></TableCell>
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
