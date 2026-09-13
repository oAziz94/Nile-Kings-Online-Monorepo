"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDateEn, formatNumberEn } from "@/lib/format-en-numbers";

/**
 * Admin minimum for the partner portal v2 (backlog 5.1 §4.7 / task text "Admin minimum"):
 * on the existing partner detail dialog, (a) edit `costRateBps` and (b) record + list
 * `PartnerPayment` rows. Both behind `requireAdmin()` server-side; this is presentation
 * only, calling the two new routes directly (no shared hook — scoped to this one dialog).
 */

type Payment = {
  id: string;
  kind: "DOWN_PAYMENT" | "INSTALLMENT";
  amountPiastres: number;
  paidAt: string;
  dueAt: string | null;
  reference: string | null;
  stockReceipt: { id: string; reference: string | null } | null;
};

const KIND_LABEL: Record<Payment["kind"], string> = {
  DOWN_PAYMENT: "دفعة مقدمة",
  INSTALLMENT: "قسط",
};

export function PartnerAccountPanel({ partnerId, costRateBps }: { partnerId: string; costRateBps: number }) {
  const [rate, setRate] = React.useState(String(Math.round(costRateBps / 100)));
  const [savingRate, setSavingRate] = React.useState(false);

  const [payments, setPayments] = React.useState<Payment[] | null>(null);
  const [loadingPayments, setLoadingPayments] = React.useState(true);

  const [kind, setKind] = React.useState<Payment["kind"]>("DOWN_PAYMENT");
  const [amount, setAmount] = React.useState("");
  const [paidAt, setPaidAt] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [dueAt, setDueAt] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadPayments = React.useCallback(() => {
    setLoadingPayments(true);
    fetch(`/api/admin/partners/${partnerId}/payments`, { credentials: "include" })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: { payments: Payment[] } }) => {
        if (json?.success && json.data) setPayments(json.data.payments);
      })
      .finally(() => setLoadingPayments(false));
  }, [partnerId]);

  React.useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const saveRate = () => {
    const percent = Number(rate);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      setError("النسبة يجب أن تكون بين 0 و100");
      return;
    }
    setSavingRate(true);
    setError(null);
    fetch(`/api/admin/partners/${partnerId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ costRateBps: Math.round(percent * 100) }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (!json?.success) setError(json?.error?.message ?? "فشل الحفظ");
      })
      .finally(() => setSavingRate(false));
  };

  const submitPayment = () => {
    const amountEgp = Number(amount);
    if (!Number.isFinite(amountEgp) || amountEgp <= 0) {
      setError("المبلغ يجب أن يكون رقماً موجباً");
      return;
    }
    setSubmitting(true);
    setError(null);
    fetch(`/api/admin/partners/${partnerId}/payments`, {
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
    })
      .then((r) => r.json())
      .then((json) => {
        if (json?.success) {
          setAmount("");
          setReference("");
          setDueAt("");
          loadPayments();
        } else setError(json?.error?.message ?? "فشل تسجيل الدفعة");
      })
      .finally(() => setSubmitting(false));
  };

  return (
    <div className="space-y-4 border-t border-border pt-4">
      <div>
        <label htmlFor="partner-cost-rate" className="mb-1 block text-sm font-bold">نسبة الشراء من سعر البيع (%)</label>
        <div className="flex items-center gap-2">
          <Input
            id="partner-cost-rate"
            type="number"
            inputMode="numeric"
            dir="ltr"
            min={0}
            max={100}
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            className="w-28"
          />
          <Button type="button" size="sm" variant="outline" onClick={saveRate} disabled={savingRate}>
            {savingRate ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ"}
          </Button>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-bold">تسجيل دفعة</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div>
            <label htmlFor="partner-payment-kind" className="mb-1 block text-xs text-muted-foreground">النوع</label>
            <Select id="partner-payment-kind" value={kind} onChange={(e) => setKind(e.target.value as Payment["kind"])}>
              <option value="DOWN_PAYMENT">دفعة مقدمة</option>
              <option value="INSTALLMENT">قسط</option>
            </Select>
          </div>
          <div>
            <label htmlFor="partner-payment-amount" className="mb-1 block text-xs text-muted-foreground">المبلغ (ج.م)</label>
            <Input
              id="partner-payment-amount"
              type="number"
              inputMode="decimal"
              dir="ltr"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="partner-payment-paid-at" className="mb-1 block text-xs text-muted-foreground">تاريخ الدفع</label>
            <Input id="partner-payment-paid-at" type="date" dir="ltr" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </div>
          <div>
            <label htmlFor="partner-payment-reference" className="mb-1 block text-xs text-muted-foreground">مرجع (اختياري)</label>
            <Input
              id="partner-payment-reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
        </div>
        {kind === "INSTALLMENT" && (
          <div className="mt-2 max-w-[220px]">
            <label htmlFor="partner-payment-due-at" className="mb-1 block text-xs text-muted-foreground">تاريخ الاستحقاق (اختياري)</label>
            <Input id="partner-payment-due-at" type="date" dir="ltr" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </div>
        )}
        {error && <p className="mt-2 text-sm font-semibold text-destructive">{error}</p>}
        <Button type="button" size="sm" className="mt-2" onClick={submitPayment} disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "تسجيل الدفعة"}
        </Button>
      </div>

      <div>
        <p className="mb-2 text-sm font-bold">سجل الدفعات</p>
        {loadingPayments ? (
          <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
        ) : !payments || payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد دفعات مسجلة</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                <span>
                  {KIND_LABEL[p.kind]} — {formatNumberEn(Math.round(p.amountPiastres) / 100)} ج.م
                  {p.reference ? ` · ${p.reference}` : ""}
                </span>
                <span className="text-xs text-muted-foreground">{formatDateEn(p.paidAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
