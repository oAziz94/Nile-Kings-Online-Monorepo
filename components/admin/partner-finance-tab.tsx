"use client";

import * as React from "react";
import { Banknote, Loader2, Package, Plus, TrendingUp, Wallet } from "lucide-react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PanelCard } from "@/components/dashboard/panel-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/dashboard/table-scroll";
import { useToast } from "@/hooks/use-toast";
import { piastresToEgp } from "@/lib/catalog";
import { formatDateEn, formatNumberEn } from "@/lib/format-en-numbers";

/**
 * الحساب المالي tab on the partner profile (backlog 9.4a (e)). Four tiles + receipts table
 * ("سجّله" from `recordedBy`) + "تسجيل استلام باسمه" (calls the new admin receipts route,
 * B3) + payments table + "تسجيل دفعة" (5.1's admin-minimum panel, moved here from the
 * deleted `PartnerAccountPanel`) + the cost-rate box.
 */

type ReceiptRow = { id: string; reference: string | null; createdAt: string; units: number; totalCostPiastres: number; recordedBy: "PARTNER" | "ADMIN"; rateBps: number | null };
type PaymentRow = { id: string; kind: "DOWN_PAYMENT" | "INSTALLMENT"; amountPiastres: number; paidAt: string; dueAt: string | null; reference: string | null };

type FinanceData = {
  costRateBps: number;
  marginBps: number;
  networkDefaultCostRateBps: number;
  receivedAllTimePiastres: number;
  receivedAllTimeUnits: number;
  paidAllTimePiastres: number;
  paidCount: number;
  balancePiastres: number;
  nextDue: { amountPiastres: number; dueAt: string } | null;
  receipts: ReceiptRow[];
  payments: PaymentRow[];
};

function egp(piastres: number): string {
  return `${formatNumberEn(piastresToEgp(piastres))} ج.م`;
}

const KIND_LABEL: Record<PaymentRow["kind"], string> = { DOWN_PAYMENT: "دفعة مقدمة", INSTALLMENT: "قسط" };

export function PartnerFinanceTab({ partnerId }: { partnerId: string }) {
  const { toast } = useToast();
  const [data, setData] = React.useState<FinanceData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [rateDraft, setRateDraft] = React.useState("");
  const [savingRate, setSavingRate] = React.useState(false);
  const [receiptOpen, setReceiptOpen] = React.useState(false);
  const [paymentOpen, setPaymentOpen] = React.useState(false);

  const load = React.useCallback(() => {
    fetch(`/api/admin/partners/${partnerId}/finance`, { credentials: "include" })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: FinanceData }) => {
        if (json?.success && json.data) {
          setData(json.data);
          setRateDraft(String(Math.round(json.data.costRateBps / 100)));
        }
      })
      .finally(() => setLoading(false));
  }, [partnerId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const saveRate = () => {
    const percent = Number(rateDraft);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      toast({ title: "النسبة يجب أن تكون بين 0 و100", variant: "destructive" });
      return;
    }
    setSavingRate(true);
    fetch(`/api/admin/partners/${partnerId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ costRateBps: Math.round(percent * 100) }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json?.success) {
          toast({ title: "تم حفظ نسبة الشراء" });
          load();
        } else toast({ title: json?.error?.message ?? "فشل الحفظ", variant: "destructive" });
      })
      .finally(() => setSavingRate(false));
  };

  if (loading || !data) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-ink-soft">
        <Loader2 className="ml-2 h-4 w-4 animate-spin" />
        جاري التحميل…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="استلم بسعر التكلفة" value={egp(data.receivedAllTimePiastres)} hint={`${formatNumberEn(data.receivedAllTimeUnits)} قطعة — منذ البداية`} icon={<Package className="h-5 w-5" />} accent="burgundy" />
        <KpiCard title="دفع للمصنع" value={egp(data.paidAllTimePiastres)} hint={`${formatNumberEn(data.paidCount)} دفعة`} icon={<Banknote className="h-5 w-5" />} accent="emerald" />
        <KpiCard
          title="المستحق الآن"
          value={egp(data.balancePiastres)}
          hint={data.nextDue ? `القسط القادم ${formatDateEn(data.nextDue.dueAt)}` : "لا يوجد قسط قادم مسجّل"}
          icon={<Wallet className="h-5 w-5" />}
          accent={data.balancePiastres > 0 ? "burgundy" : "slate"}
        />
        <KpiCard
          title="نسبة الشراء"
          value={`${formatNumberEn(Math.round(data.costRateBps / 100))}%`}
          hint={`الهامش ${formatNumberEn(Math.round(data.marginBps / 100))}% — الافتراضي ${formatNumberEn(Math.round(data.networkDefaultCostRateBps / 100))}%`}
          icon={<TrendingUp className="h-5 w-5" />}
          accent="gold"
        />
      </div>

      <PanelCard
        title="الإيصالات"
        icon={<Package className="h-5 w-5 text-lapis-800" />}
        toolbar={
          <Button type="button" size="sm" className="rounded-full" onClick={() => setReceiptOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            تسجيل استلام باسمه
          </Button>
        }
      >
        {data.receipts.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-soft">لا توجد إيصالات مسجّلة</p>
        ) : (
          <TableScroll>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الإيصال</TableHead>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>الكمية</TableHead>
                  <TableHead>سجّله</TableHead>
                  <TableHead>القيمة بالتكلفة</TableHead>
                  <TableHead>النسبة وقتها</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.receipts.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.reference ?? r.id.slice(0, 8)}</TableCell>
                    <TableCell>{formatDateEn(r.createdAt)}</TableCell>
                    <TableCell dir="ltr">{formatNumberEn(r.units)}</TableCell>
                    <TableCell>
                      <Badge variant={r.recordedBy === "ADMIN" ? "info" : "neutral"} className="rounded-full text-[11px] font-extrabold">
                        {r.recordedBy === "ADMIN" ? "المصنع (أنت)" : "الشريك"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-bold tabular-nums">{egp(r.totalCostPiastres)}</TableCell>
                    <TableCell dir="ltr">{r.rateBps !== null ? `${formatNumberEn(Math.round(r.rateBps / 100))}%` : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableScroll>
        )}
      </PanelCard>

      <PanelCard
        title="الدفعات"
        icon={<Banknote className="h-5 w-5 text-lapis-800" />}
        toolbar={
          <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={() => setPaymentOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            تسجيل دفعة
          </Button>
        }
      >
        {data.payments.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-soft">لا توجد دفعات مسجّلة</p>
        ) : (
          <TableScroll>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>النوع</TableHead>
                  <TableHead>المبلغ</TableHead>
                  <TableHead>تاريخ الدفع</TableHead>
                  <TableHead>الاستحقاق</TableHead>
                  <TableHead>مرجع</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{KIND_LABEL[p.kind]}</TableCell>
                    <TableCell className="font-bold tabular-nums">{egp(p.amountPiastres)}</TableCell>
                    <TableCell>{formatDateEn(p.paidAt)}</TableCell>
                    <TableCell>{p.dueAt ? formatDateEn(p.dueAt) : "—"}</TableCell>
                    <TableCell>{p.reference ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableScroll>
        )}
      </PanelCard>

      <PanelCard title="نسبة الشراء من سعر البيع" icon={<TrendingUp className="h-5 w-5 text-lapis-800" />}>
        <p className="mb-3 text-xs text-ink-soft">تُطبَّق على الاستلامات القادمة فقط — لا تُعيد كتابة إيصالات سابقة.</p>
        <div className="flex items-center gap-2">
          <Label htmlFor="finance-cost-rate" className="sr-only">نسبة الشراء من سعر البيع (%)</Label>
          <Input id="finance-cost-rate" type="number" inputMode="numeric" dir="ltr" min={0} max={100} value={rateDraft} onChange={(e) => setRateDraft(e.target.value)} className="w-28" />
          <span className="text-sm text-ink-soft">%</span>
          <Button type="button" size="sm" onClick={saveRate} disabled={savingRate}>
            {savingRate ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ"}
          </Button>
        </div>
      </PanelCard>

      <RecordReceiptDialog partnerId={partnerId} open={receiptOpen} onOpenChange={setReceiptOpen} onRecorded={load} />
      <RecordPaymentDialog partnerId={partnerId} open={paymentOpen} onOpenChange={setPaymentOpen} onRecorded={load} />
    </div>
  );
}

type VariantOption = { id: string; sku: string; label: string };

function RecordReceiptDialog({
  partnerId,
  open,
  onOpenChange,
  onRecorded,
}: {
  partnerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecorded: () => void;
}) {
  const { toast } = useToast();
  const [query, setQuery] = React.useState("");
  const [options, setOptions] = React.useState<VariantOption[]>([]);
  const [variantId, setVariantId] = React.useState("");
  const [quantity, setQuantity] = React.useState(1);
  const [lines, setLines] = React.useState<{ variantId: string; label: string; quantity: number }[]>([]);
  const [reference, setReference] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const params = new URLSearchParams({ limit: "20" });
      if (query.trim()) params.set("q", query.trim());
      fetch(`/api/admin/products?${params}`, { credentials: "include" })
        .then((r) => r.json())
        .then((json: { success?: boolean; data?: { products?: { name: string; variants: { id: string; sku: string; name: string; colorName: string | null }[] }[] } }) => {
          if (json?.success && json.data?.products) {
            setOptions(
              json.data.products.flatMap((p) =>
                p.variants.map((v) => ({ id: v.id, sku: v.sku, label: `${p.name} - ${v.name}${v.colorName ? ` - ${v.colorName}` : ""} - ${v.sku}` }))
              )
            );
          }
        })
        .catch(() => setOptions([]));
    }, 300);
    return () => clearTimeout(t);
  }, [query, open]);

  const addLine = () => {
    const opt = options.find((o) => o.id === variantId);
    if (!opt || quantity <= 0) return;
    setLines((cur) => {
      const existing = cur.find((l) => l.variantId === opt.id);
      if (existing) return cur.map((l) => (l.variantId === opt.id ? { ...l, quantity: l.quantity + quantity } : l));
      return [...cur, { variantId: opt.id, label: opt.label, quantity }];
    });
    setVariantId("");
    setQuantity(1);
  };

  const reset = () => {
    setLines([]);
    setReference("");
    setNotes("");
    setQuery("");
  };

  const submit = async () => {
    if (lines.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/partners/${partnerId}/receipts`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "FACTORY",
          reference: reference.trim() || null,
          notes: notes.trim() || null,
          lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        }),
      });
      const json = await res.json();
      if (json?.success) {
        toast({ title: "تم تسجيل الإيصال" });
        reset();
        onOpenChange(false);
        onRecorded();
      } else {
        toast({ title: json?.error?.message ?? "فشل تسجيل الإيصال", variant: "destructive" });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl border-stone-200 bg-white">
        <DialogHeader>
          <DialogTitle>تسجيل استلام باسم الشريك</DialogTitle>
          <DialogDescription>يُسجَّل كأنه أُدخل من المصنع — يظهر &quot;المصنع (أنت)&quot; في سجل الإيصالات.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_6rem_auto] sm:items-end">
            <div className="grid gap-2">
              <Label htmlFor="receipt-variant-q">بحث عن SKU</Label>
              <Input id="receipt-variant-q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="اسم المنتج أو SKU" />
              <Select value={variantId} onChange={(e) => setVariantId(e.target.value)}>
                <option value="">اختر متغيراً</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="receipt-qty">الكمية</Label>
              <Input id="receipt-qty" type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value) || 0)} />
            </div>
            <Button type="button" onClick={addLine} disabled={!variantId}>إضافة</Button>
          </div>
          {lines.length > 0 && (
            <ul className="space-y-1 text-sm">
              {lines.map((l) => (
                <li key={l.variantId} className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2">
                  <span>{l.label}</span>
                  <span dir="ltr">{formatNumberEn(l.quantity)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="receipt-reference">المرجع (اختياري)</Label>
              <Input id="receipt-reference" value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="receipt-notes">ملاحظات (اختياري)</Label>
              <Input id="receipt-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" className="rounded-full" disabled={submitting}>إلغاء</Button>
          </DialogClose>
          <Button className="rounded-full" onClick={submit} disabled={submitting || lines.length === 0}>
            {submitting ? "جاري التسجيل…" : "تسجيل الإيصال"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecordPaymentDialog({
  partnerId,
  open,
  onOpenChange,
  onRecorded,
}: {
  partnerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecorded: () => void;
}) {
  const { toast } = useToast();
  const [kind, setKind] = React.useState<PaymentRow["kind"]>("DOWN_PAYMENT");
  const [amount, setAmount] = React.useState("");
  const [paidAt, setPaidAt] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [dueAt, setDueAt] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const submit = async () => {
    const amountEgp = Number(amount);
    if (!Number.isFinite(amountEgp) || amountEgp <= 0) {
      toast({ title: "المبلغ يجب أن يكون رقماً موجباً", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/partners/${partnerId}/payments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          amountPiastres: Math.round(amountEgp * 100),
          paidAt: new Date(paidAt).toISOString(),
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
          reference: reference.trim() || null,
        }),
      });
      const json = await res.json();
      if (json?.success) {
        toast({ title: "تم تسجيل الدفعة" });
        setAmount("");
        setReference("");
        setDueAt("");
        onOpenChange(false);
        onRecorded();
      } else {
        toast({ title: json?.error?.message ?? "فشل تسجيل الدفعة", variant: "destructive" });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl border-stone-200 bg-white">
        <DialogHeader>
          <DialogTitle>تسجيل دفعة</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="pay-kind">النوع</Label>
            <Select id="pay-kind" value={kind} onChange={(e) => setKind(e.target.value as PaymentRow["kind"])}>
              <option value="DOWN_PAYMENT">دفعة مقدمة</option>
              <option value="INSTALLMENT">قسط</option>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pay-amount">المبلغ (ج.م)</Label>
            <Input id="pay-amount" type="number" inputMode="decimal" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pay-paid-at">تاريخ الدفع</Label>
            <Input id="pay-paid-at" type="date" dir="ltr" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </div>
          {kind === "INSTALLMENT" && (
            <div className="grid gap-2">
              <Label htmlFor="pay-due-at">تاريخ الاستحقاق (اختياري)</Label>
              <Input id="pay-due-at" type="date" dir="ltr" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            </div>
          )}
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="pay-reference">مرجع (اختياري)</Label>
            <Input id="pay-reference" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" className="rounded-full" disabled={submitting}>إلغاء</Button>
          </DialogClose>
          <Button className="rounded-full" onClick={submit} disabled={submitting}>
            {submitting ? "جاري التسجيل…" : "تسجيل الدفعة"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
