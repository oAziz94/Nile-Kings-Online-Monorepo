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
import { AdminPaginationBar } from "@/components/admin/admin-pagination";
import { Ticket, Plus, Search, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [fetching, setFetching] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [debouncedQ, setDebouncedQ] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(20);
  const [refreshToken, setRefreshToken] = React.useState(0);
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

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  React.useEffect(() => {
    setPage(0);
  }, [debouncedQ]);

  React.useEffect(() => {
    const totalPages = total === 0 ? 1 : Math.max(1, Math.ceil(total / pageSize));
    if (page > totalPages - 1) setPage(Math.max(0, totalPages - 1));
  }, [total, pageSize, page]);

  React.useEffect(() => {
    const ac = new AbortController();
    setFetching(true);
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String(page * pageSize),
    });
    if (debouncedQ) params.set("q", debouncedQ);
    fetch(`/api/admin/coupons?${params}`, { credentials: "include", signal: ac.signal })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: { coupons: Coupon[]; total: number } }) => {
        if (ac.signal.aborted) return;
        if (json?.success && json.data && Array.isArray(json.data.coupons)) {
          setList(json.data.coupons);
          setTotal(json.data.total);
        }
      })
      .catch(() => {
        if (!ac.signal.aborted) toast({ title: "فشل تحميل الكوبونات", variant: "destructive" });
      })
      .finally(() => {
        if (!ac.signal.aborted) {
          setLoading(false);
          setFetching(false);
        }
      });
    return () => ac.abort();
  }, [debouncedQ, page, pageSize, refreshToken, toast]);

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
        setPage(0);
        setRefreshToken((x) => x + 1);
      } else toast({ title: json?.error?.message ?? "فشل", variant: "destructive" });
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading && list.length === 0) return <Skeleton className="h-64 w-full rounded-2xl" />;

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
        <CardHeader className="flex flex-col gap-4 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>قائمة الكوبونات</CardTitle>
            <CardDescription>إدارة أكواد الخصم.</CardDescription>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="بحث بكود الكوبون…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {fetching && list.length > 0 && (
            <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              جاري التحديث…
            </div>
          )}
          {list.length === 0 && !fetching ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 py-16 text-center">
              <Ticket className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-2">
                {debouncedQ ? "لا توجد نتائج للبحث" : "لا توجد كوبونات"}
              </p>
              <Button variant="outline" onClick={() => setOpen(true)}>إضافة أول كوبون</Button>
            </div>
          ) : (
            <Table className={cn(fetching && "opacity-70")}>
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
          {total > 0 && (
            <AdminPaginationBar
              className="mt-6"
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              disabled={fetching}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
