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
} from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/shared/skeleton";
import { PaginationBar } from "@/components/dashboard/pagination";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { PanelCard } from "@/components/dashboard/panel-card";
import { SearchInput } from "@/components/dashboard/search-input";
import { Ticket, Plus, Loader2, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Coupon = {
  id: string;
  code: string;
  discountType: string;
  discountValue: number;
  bogoPayQuantity: number | null;
  bogoFreeQuantity: number | null;
  bogoSameVariantOnly: boolean;
  showPromotionPopup: boolean;
  promotionPopupMessage: string | null;
  minOrderPiastres: number | null;
  maxUses: number | null;
  usedCount: number;
  validFrom: string;
  validUntil: string | null;
  active: boolean;
};

type FormState = {
  code: string;
  discountType: "PERCENT" | "FIXED" | "BOGO_QTY";
  discountValue: string;
  bogoPayQuantity: string;
  bogoFreeQuantity: string;
  bogoSameVariantOnly: boolean;
  showPromotionPopup: boolean;
  promotionPopupMessage: string;
  minOrderPiastres: string;
  maxUses: string;
  active: boolean;
};

function emptyForm(): FormState {
  return {
    code: "",
    discountType: "PERCENT",
    discountValue: "10",
    bogoPayQuantity: "2",
    bogoFreeQuantity: "1",
    bogoSameVariantOnly: true,
    showPromotionPopup: false,
    promotionPopupMessage: "",
    minOrderPiastres: "",
    maxUses: "",
    active: true,
  };
}

function couponToForm(c: Coupon): FormState {
  return {
    code: c.code,
    discountType: c.discountType as FormState["discountType"],
    discountValue:
      c.discountType === "FIXED"
        ? String(c.discountValue / 100)
        : c.discountType === "PERCENT"
          ? String(c.discountValue)
          : "0",
    bogoPayQuantity: String(c.bogoPayQuantity ?? 2),
    bogoFreeQuantity: String(c.bogoFreeQuantity ?? 1),
    bogoSameVariantOnly: c.bogoSameVariantOnly,
    showPromotionPopup: c.showPromotionPopup,
    promotionPopupMessage: c.promotionPopupMessage ?? "",
    minOrderPiastres: c.minOrderPiastres != null ? String(c.minOrderPiastres / 100) : "",
    maxUses: c.maxUses != null ? String(c.maxUses) : "",
    active: c.active,
  };
}

function validateCouponForm(form: FormState): string | null {
  if (!form.code.trim()) return "كود الكوبون مطلوب";
  if (form.showPromotionPopup && !form.promotionPopupMessage.trim()) {
    return "أدخل نص الرسالة عند تفعيل النافذة المنبثقة";
  }
  if (form.discountType === "PERCENT") {
    const v = parseInt(form.discountValue, 10) || 0;
    if (v < 1 || v > 100) return "النسبة المئوية بين 1 و 100";
  }
  if (form.discountType === "BOGO_QTY") {
    const pay = Math.trunc(parseInt(form.bogoPayQuantity, 10) || 0);
    const free = Math.trunc(parseInt(form.bogoFreeQuantity, 10) || 0);
    if (pay < 1 || free < 1) return "أدخل كميات صحيحة (1 على الأقل) للعرض";
  }
  return null;
}

/** Body for POST create (omits non-BOGO bogo fields). */
function formToCreateBody(form: FormState): Record<string, unknown> {
  const pay = Math.trunc(parseInt(form.bogoPayQuantity, 10) || 0);
  const free = Math.trunc(parseInt(form.bogoFreeQuantity, 10) || 0);
  let discountValue = 0;
  if (form.discountType === "PERCENT") {
    discountValue = Math.min(100, Math.max(1, parseInt(form.discountValue, 10) || 0));
  } else if (form.discountType === "FIXED") {
    discountValue = Math.round((parseFloat(form.discountValue) || 0) * 100);
  }
  const body: Record<string, unknown> = {
    code: form.code.trim().toUpperCase(),
    discountType: form.discountType,
    discountValue,
    showPromotionPopup: form.showPromotionPopup,
    promotionPopupMessage: form.showPromotionPopup ? form.promotionPopupMessage.trim().slice(0, 8000) : null,
    minOrderPiastres: form.minOrderPiastres === "" ? null : Math.round(parseFloat(form.minOrderPiastres) * 100),
    maxUses: form.maxUses === "" ? null : parseInt(form.maxUses, 10),
    active: form.active,
  };
  if (form.discountType === "BOGO_QTY") {
    body.bogoPayQuantity = pay;
    body.bogoFreeQuantity = free;
    body.bogoSameVariantOnly = form.bogoSameVariantOnly;
  }
  return body;
}

/** Body for PATCH (always includes type + discountValue so switches stay consistent). */
function formToPatchBody(form: FormState): Record<string, unknown> {
  const pay = Math.trunc(parseInt(form.bogoPayQuantity, 10) || 0);
  const free = Math.trunc(parseInt(form.bogoFreeQuantity, 10) || 0);
  let discountValue = 0;
  if (form.discountType === "PERCENT") {
    discountValue = Math.min(100, Math.max(1, parseInt(form.discountValue, 10) || 0));
  } else if (form.discountType === "FIXED") {
    discountValue = Math.round((parseFloat(form.discountValue) || 0) * 100);
  }
  const body: Record<string, unknown> = {
    code: form.code.trim().toUpperCase(),
    discountType: form.discountType,
    discountValue,
    showPromotionPopup: form.showPromotionPopup,
    promotionPopupMessage: form.showPromotionPopup ? form.promotionPopupMessage.trim().slice(0, 8000) : null,
    minOrderPiastres: form.minOrderPiastres === "" ? null : Math.round(parseFloat(form.minOrderPiastres) * 100),
    maxUses: form.maxUses === "" ? null : parseInt(form.maxUses, 10),
    active: form.active,
  };
  if (form.discountType === "BOGO_QTY") {
    body.bogoPayQuantity = pay;
    body.bogoFreeQuantity = free;
    body.bogoSameVariantOnly = form.bogoSameVariantOnly;
  }
  return body;
}

function formatCouponDiscount(c: Coupon): string {
  if (c.discountType === "BOGO_QTY") {
    const p = c.bogoPayQuantity ?? 0;
    const f = c.bogoFreeQuantity ?? 0;
    const scope = c.bogoSameVariantOnly ? "نفس المتغير" : "مختلط";
    return `اشترِ ${p} واحصل على ${f} مجاناً (${scope})`;
  }
  if (c.discountType === "PERCENT") return `${c.discountValue}%`;
  return `${(c.discountValue / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ج.م`;
}

function CouponFormFields({
  form,
  setForm,
  bogoSameId,
  promoPopupId,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  bogoSameId: string;
  promoPopupId: string;
}) {
  return (
    <div className="grid gap-4 py-4">
      <div className="grid gap-2">
        <Label>الكود *</Label>
        <Input
          value={form.code}
          onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
          placeholder="SUMMER20"
          required
        />
      </div>
      <div className="grid gap-2">
        <Label>نوع الخصم</Label>
        <Select
          value={form.discountType}
          onChange={(e) =>
            setForm((f) => ({ ...f, discountType: e.target.value as FormState["discountType"] }))
          }
        >
          <option value="PERCENT">نسبة مئوية</option>
          <option value="FIXED">قيمة ثابتة (ج.م)</option>
          <option value="BOGO_QTY">عرض كمية (اشترِ X واحصل على Y مجاناً)</option>
        </Select>
      </div>
      {form.discountType !== "BOGO_QTY" ? (
        <div className="grid gap-2">
          <Label>{form.discountType === "PERCENT" ? "النسبة (1–100)" : "القيمة (ج.م)"}</Label>
          <Input
            type="number"
            min={form.discountType === "PERCENT" ? 1 : 0}
            max={form.discountType === "PERCENT" ? 100 : undefined}
            step={0.01}
            value={form.discountValue}
            onChange={(e) => setForm((f) => ({ ...f, discountValue: e.target.value }))}
          />
        </div>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
            <div className="grid gap-2">
              <Label>عدد القطع المدفوعة في الدورة</Label>
              <Input
                type="number"
                min={1}
                max={999}
                value={form.bogoPayQuantity}
                onChange={(e) => setForm((f) => ({ ...f, bogoPayQuantity: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>عدد القطع المجانية في الدورة</Label>
              <Input
                type="number"
                min={1}
                max={999}
                value={form.bogoFreeQuantity}
                onChange={(e) => setForm((f) => ({ ...f, bogoFreeQuantity: e.target.value }))}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            مثال: 2 مدفوعة + 1 مجانية = عند شراء 3 قطع من نفس المتغير تُحتسب واحدة مجاناً (حسب إعداد التجميع أدناه).
          </p>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.bogoSameVariantOnly}
              onChange={(e) => setForm((f) => ({ ...f, bogoSameVariantOnly: e.target.checked }))}
              className="rounded border-input"
              id={bogoSameId}
            />
            <Label htmlFor={bogoSameId} className="font-normal">
              يطبق على نفس المنتج والمتغير فقط
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            عند إلغاء التفعيل، تُجمع كل القطع في السلة وتُطبق الدورة على الإجمالي (تُخصم أرخص القطع في كل مجموعة).
          </p>
        </>
      )}
      <div className="grid gap-2">
        <Label>رسالة ترويجية في الموقع (نافذة منبثقة)</Label>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.showPromotionPopup}
            onChange={(e) => setForm((f) => ({ ...f, showPromotionPopup: e.target.checked }))}
            className="rounded border-input"
            id={promoPopupId}
          />
          <Label htmlFor={promoPopupId} className="font-normal">
            إظهار الرسالة عند زيارة الموقع (تُخفى بعد «إغلاق» حتى إغلاق المتصفح أو التبويب)
          </Label>
        </div>
        <textarea
          className={cn(
            "flex min-h-[88px] w-full rounded-2xl border border-input bg-background px-4 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          )}
          dir="rtl"
          placeholder="مثال: استخدم كود TSHIRT3 عند الدفع — اشترِ 2 تيشرت واحصل على الثالث مجاناً"
          value={form.promotionPopupMessage}
          onChange={(e) => setForm((f) => ({ ...f, promotionPopupMessage: e.target.value }))}
        />
      </div>
      <div className="grid gap-2">
        <Label>الحد الأدنى للطلب (ج.م)</Label>
        <Input
          type="number"
          min={0}
          step={0.01}
          value={form.minOrderPiastres}
          onChange={(e) => setForm((f) => ({ ...f, minOrderPiastres: e.target.value }))}
          placeholder="0"
        />
      </div>
      <div className="grid gap-2">
        <Label>الحد الأقصى لمرات الاستخدام</Label>
        <Input
          type="number"
          min={0}
          value={form.maxUses}
          onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))}
          placeholder="غير محدود"
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={form.active}
          onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
          className="rounded border-input"
        />
        <Label>نشط</Label>
      </div>
    </div>
  );
}

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
  const [couponDialogOpen, setCouponDialogOpen] = React.useState(false);
  const [couponDialogMode, setCouponDialogMode] = React.useState<"create" | "edit">("create");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<FormState>(() => emptyForm());
  const [saving, setSaving] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<Coupon | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const formIds = React.useId();
  const bogoSameId = `${formIds}-bogo-same`;
  const promoPopupId = `${formIds}-promo-popup`;
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

  const openCreate = () => {
    setCouponDialogMode("create");
    setEditingId(null);
    setForm(emptyForm());
    setCouponDialogOpen(true);
  };

  const openEdit = (c: Coupon) => {
    setCouponDialogMode("edit");
    setEditingId(c.id);
    setForm(couponToForm(c));
    setCouponDialogOpen(true);
  };

  const onCouponDialogOpenChange = (open: boolean) => {
    setCouponDialogOpen(open);
    if (!open) setEditingId(null);
  };

  const submitCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateCouponForm(form);
    if (err) {
      toast({ title: err, variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (couponDialogMode === "create") {
        const res = await fetch("/api/admin/coupons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(formToCreateBody(form)),
        });
        const json = await res.json();
        if (res.ok && json?.success) {
          toast({ title: "تم إنشاء الكوبون" });
          setCouponDialogOpen(false);
          setForm(emptyForm());
          setPage(0);
          setRefreshToken((x) => x + 1);
        } else toast({ title: json?.error?.message ?? "فشل", variant: "destructive" });
      } else if (editingId) {
        const res = await fetch(`/api/admin/coupons/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(formToPatchBody(form)),
        });
        const json = await res.json();
        if (res.ok && json?.success) {
          toast({ title: "تم حفظ التعديلات" });
          setCouponDialogOpen(false);
          setEditingId(null);
          setRefreshToken((x) => x + 1);
        } else toast({ title: json?.error?.message ?? "فشل", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/coupons/${deleteTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        toast({ title: "تم حذف الكوبون" });
        setDeleteOpen(false);
        setDeleteTarget(null);
        setRefreshToken((x) => x + 1);
      } else toast({ title: json?.error?.message ?? "فشل الحذف", variant: "destructive" });
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  if (loading && list.length === 0) return <Skeleton className="h-64 w-full rounded-2xl" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="الكوبونات"
        description="إنشاء وتعديل أكواد الخصم والعروض الترويجية."
        actions={
          <Button type="button" className="rounded-xl" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            إضافة كوبون
          </Button>
        }
      />

      <Dialog open={couponDialogOpen} onOpenChange={onCouponDialogOpenChange}>
        <DialogContent>
          <form onSubmit={submitCoupon}>
            <DialogHeader>
              <DialogTitle>{couponDialogMode === "create" ? "كوبون جديد" : "تعديل الكوبون"}</DialogTitle>
            </DialogHeader>
            <CouponFormFields
              form={form}
              setForm={setForm}
              bogoSameId={bogoSameId}
              promoPopupId={promoPopupId}
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  إلغاء
                </Button>
              </DialogClose>
              <Button type="submit" disabled={saving}>
                {saving ? "جاري…" : couponDialogMode === "create" ? "إنشاء" : "حفظ"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onOpenChange={(o) => {
          if (deleting) return;
          setDeleteOpen(o);
          if (!o) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>حذف الكوبون؟</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            سيتم حذف الكوبون{" "}
            <span className="font-mono font-semibold text-foreground">{deleteTarget?.code}</span> نهائياً. سجلات
            الاستخدام المرتبطة تُحذف معه.
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" disabled={deleting} onClick={() => setDeleteOpen(false)}>
              إلغاء
            </Button>
            <Button type="button" variant="destructive" disabled={deleting} onClick={confirmDelete}>
              {deleting ? "جاري الحذف…" : "حذف"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PanelCard
        title="قائمة الكوبونات"
        icon={<Ticket className="h-5 w-5 text-burgundy" />}
        toolbar={
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="بحث بكود الكوبون…"
          />
        }
      >
          {fetching && list.length > 0 && (
            <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              جاري التحديث…
            </div>
          )}
          {list.length === 0 && !fetching ? (
            <EmptyState
              icon={<Ticket className="h-12 w-12" />}
              title={debouncedQ ? "لا توجد نتائج للبحث" : "لا توجد كوبونات"}
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border/60">
            <Table className={cn(fetching && "opacity-70")}>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>الكود</TableHead>
                  <TableHead>الخصم</TableHead>
                  <TableHead>نافذة الموقع</TableHead>
                  <TableHead>الحد الأدنى للطلب</TableHead>
                  <TableHead>المستخدم / الأقصى</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="w-[120px] text-left">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono font-medium">{c.code}</TableCell>
                    <TableCell className="max-w-[220px] text-sm">{formatCouponDiscount(c)}</TableCell>
                    <TableCell>
                      <Badge variant={c.showPromotionPopup ? "default" : "secondary"}>
                        {c.showPromotionPopup ? "نعم" : "لا"}
                      </Badge>
                    </TableCell>
                    <TableCell>{c.minOrderPiastres != null ? `${(c.minOrderPiastres / 100).toFixed(0)} ج.م` : "—"}</TableCell>
                    <TableCell>
                      {c.usedCount}
                      {c.maxUses != null ? ` / ${c.maxUses}` : ""}
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.active ? "success" : "secondary"}>{c.active ? "نشط" : "معطّل"}</Badge>
                    </TableCell>
                    <TableCell className="text-left">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="تعديل"
                          onClick={() => openEdit(c)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          title="حذف"
                          onClick={() => {
                            setDeleteTarget(c);
                            setDeleteOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
          {total > 0 && (
            <PaginationBar
              className="mt-6"
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              disabled={fetching}
            />
          )}
      </PanelCard>
    </div>
  );
}
