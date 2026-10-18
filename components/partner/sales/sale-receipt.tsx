"use client";

import * as React from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Plus, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { VoidSaleControl } from "@/components/partner/sales/void-sale-dialog";
import type { StoreSaleDetail } from "@/lib/sales/get-sale";
import { DEFAULT_RECEIPT_FOOTER, PAYMENT_METHOD_LABELS, formatEgp, formatSaleDateTime } from "@/lib/sales/format";

/**
 * Receipt view (backlog 11.3, plan 12 section 3/9). Screen: a plain summary card + lines + actions.
 * Print: the same data as an 80 mm thermal slip, rendered into a portal that is a direct child of
 * <body>; the print stylesheet hides every other body child, so the portal is the only thing that
 * prints regardless of how the portal shell is structured. Look: owner-approved direction C with B's black total bar (11.9).
 */

const PRINT_CSS = `
@page { size: 80mm auto; margin: 4mm; }
#receipt-print-root { display: none; }
@media print {
  html, body { background: #fff !important; height: auto !important; overflow: visible !important; }
  body > *:not(#receipt-print-root) { display: none !important; }
  #receipt-print-root { display: block; position: relative; color: #000; background: #fff; font-size: 11px; line-height: 1.45; }
  #receipt-print-root, #receipt-print-root * { color: #000 !important; background: transparent !important; box-shadow: none !important; }
  #receipt-print-root .receipt-total-bar, #receipt-print-root .receipt-total-bar * { background: #000 !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

type Sale = StoreSaleDetail;

const NUM = { fontFamily: "var(--font-archivo), sans-serif" } as const;
const SUB = { fontSize: "10.5px", color: "#444" } as const;

function Slip({ sale }: { sale: Sale }) {
  const storeName = sale.partner.storeName?.trim() || sale.partner.name;
  const footer = sale.partner.receiptFooter?.trim() || DEFAULT_RECEIPT_FOOTER;
  const itemCount = sale.items.reduce((s, i) => s + i.quantity, 0);
  return (
    <div dir="rtl" className="mx-auto w-full" style={{ position: "relative", overflow: "hidden", fontFamily: "var(--font-cairo), sans-serif", fontSize: "11px", lineHeight: 1.45 }} data-testid="receipt-slip">
      {sale.status === "VOIDED" && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "42px",
            fontWeight: 800,
            border: "none",
            opacity: 0.25,
            pointerEvents: "none",
          }}
        >
          {/* Only the word rotates; rotating the inset:0 box widened the print page (11.9 verifier). */}
          <span style={{ display: "inline-block", transform: "rotate(-30deg)" }}>ملغي</span>
        </div>
      )}
      <div style={{ textAlign: "center", borderTop: "3px double #000", borderBottom: "3px double #000", padding: "2mm 0", marginBottom: "2mm" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/logo-lapis-mark.png"
          alt=""
          style={{ width: "22mm", height: "auto", margin: "0 auto 1.5mm", display: "block", filter: "grayscale(1) contrast(1.6)" }}
        />
        <div style={{ fontFamily: "var(--font-amiri), serif", fontWeight: 800, fontSize: "22px", lineHeight: 1.3 }}>{storeName}</div>
        <div style={{ fontSize: "10px", letterSpacing: "2px", color: "#444" }}>قطن ملوك النيل</div>
        {sale.partner.storeAddress && <div style={{ marginTop: "0.5mm" }}>{sale.partner.storeAddress}</div>}
        {sale.partner.phone && (
          <div dir="ltr" style={NUM}>{sale.partner.phone}</div>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11.5px" }}>
        <span style={{ fontWeight: 700 }}>
          إيصال رقم <bdi dir="ltr" style={NUM}>{sale.receiptNo}</bdi>
        </span>
        <bdi dir="ltr" style={NUM}>{formatSaleDateTime(sale.soldAt)}</bdi>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11.5px", marginTop: "1mm" }}>
        <span>{sale.sellerName ? `البائع: ${sale.sellerName}` : ""}</span>
        <span>الدفع: {PAYMENT_METHOD_LABELS[sale.paymentMethod]}</span>
      </div>
      {sale.status === "VOIDED" && sale.voidReason && <div style={{ marginTop: "1mm" }}>سبب الإلغاء: {sale.voidReason}</div>}
      <hr style={{ border: 0, borderTop: "1px solid #000", margin: "2mm 0" }} />
      {sale.items.map((i, idx) => (
        <div
          key={i.id}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: "2mm",
            alignItems: "baseline",
            padding: "1.5mm 0",
            borderBottom: idx < sale.items.length - 1 ? "1px solid #ddd" : "none",
          }}
          data-testid="receipt-line"
        >
          <div>
            <div style={{ fontWeight: 700 }}>{i.productName}</div>
            <div style={SUB}>
              {i.variantName} · <bdi dir="ltr" style={NUM}>{i.sku}</bdi>
            </div>
          </div>
          <div dir="ltr" style={{ textAlign: "right", ...NUM }}>
            <div style={{ fontWeight: 700 }}>{formatEgp(i.quantity * i.unitPricePiastres)}</div>
            <div style={{ fontSize: "10px", color: "#444" }}>
              {i.quantity} × {formatEgp(i.unitPricePiastres)}
            </div>
          </div>
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2mm" }}>
        <span>عدد القطع</span>
        <bdi dir="ltr" style={NUM}>{itemCount}</bdi>
      </div>
      <div
        className="receipt-total-bar"
        style={{ background: "#000", color: "#fff", padding: "2mm 2.5mm", marginTop: "1.5mm", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}
      >
        <span style={{ fontWeight: 700 }}>الإجمالي</span>
        <span>
          <bdi dir="ltr" style={{ ...NUM, fontSize: "22px", fontWeight: 700 }} data-testid="receipt-total">
            {formatEgp(sale.subtotalPiastres)}
          </bdi>{" "}
          <small style={{ fontSize: "11px", fontWeight: 600 }}>ج.م</small>
        </span>
      </div>
      <div style={{ textAlign: "center", marginTop: "3mm", fontFamily: "var(--font-amiri), serif", fontSize: "13px" }}>
        <span aria-hidden style={{ display: "block", letterSpacing: "6px", fontSize: "11px", color: "#777" }}>✦ ✦ ✦</span>
        <div style={{ whiteSpace: "pre-line" }}>{footer}</div>
      </div>
    </div>
  );
}

/**
 * `admin` (backlog 11.6) turns the same receipt into the admin drawer's content: no "بيع جديد" link,
 * void goes through the admin route (any day, reason required) and `onVoided` refetches.
 */
export function SaleReceipt({
  sale,
  canVoid = false,
  admin,
}: {
  sale: Sale;
  canVoid?: boolean;
  admin?: { voidUrl: string; onVoided: () => void };
}) {
  const [portalRoot, setPortalRoot] = React.useState<HTMLElement | null>(null);
  React.useEffect(() => {
    const el = document.createElement("div");
    el.id = "receipt-print-root";
    document.body.appendChild(el);
    setPortalRoot(el);
    return () => {
      document.body.removeChild(el);
    };
  }, []);

  const itemCount = sale.items.reduce((s, i) => s + i.quantity, 0);
  const voided = sale.status === "VOIDED";

  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <PageHeader
        title={`إيصال رقم ${sale.receiptNo}`}
        description={formatSaleDateTime(sale.soldAt)}
        badge={voided ? <span className="rounded-full bg-[hsl(0_84%_94%)] px-2.5 py-0.5 text-xs font-bold text-destructive">ملغي</span> : undefined}
        actions={
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => window.print()} data-testid="receipt-print">
              <Printer aria-hidden />
              طباعة
            </Button>
            {!admin && (
              <Button asChild>
                <Link href="/partner/sales/new">
                  <Plus aria-hidden />
                  بيع جديد
                </Link>
              </Button>
            )}
          </div>
        }
      />

      {voided && (
        <section
          className="mb-3 max-w-xl rounded-2xl bg-[hsl(0_84%_97%)] p-4 text-sm"
          aria-label="بيانات الإلغاء"
          data-testid="void-info"
        >
          <div className="font-bold text-destructive">هذا الإيصال ملغي</div>
          {sale.voidReason && (
            <div className="mt-1 text-ink">
              السبب: <span data-testid="void-reason-text">{sale.voidReason}</span>
            </div>
          )}
          {sale.voidedAt && (
            <div className="mt-1 text-xs text-ink-soft">
              بتاريخ <bdi dir="ltr" className="font-archivo">{formatSaleDateTime(sale.voidedAt)}</bdi>
            </div>
          )}
        </section>
      )}

      <section className="max-w-xl rounded-2xl bg-white p-4 shadow-subtle sm:p-5" aria-label="تفاصيل الإيصال" data-testid="receipt-card">
        <div className="mb-4 border-b border-[hsl(228_16%_90%)] pb-3 text-center">
          <div className="font-amiri text-xl font-extrabold text-ink">{sale.partner.storeName?.trim() || sale.partner.name}</div>
          <div className="text-[10px] tracking-[0.2em] text-ink-soft">قطن ملوك النيل</div>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-ink-soft">طريقة الدفع</dt>
          <dd className="font-bold text-ink">{PAYMENT_METHOD_LABELS[sale.paymentMethod]}</dd>
          {sale.sellerName && (
            <>
              <dt className="text-ink-soft">البائع</dt>
              <dd className="font-bold text-ink">{sale.sellerName}</dd>
            </>
          )}
          {sale.customerName && (
            <>
              <dt className="text-ink-soft">العميل</dt>
              <dd className="font-bold text-ink">{sale.customerName}</dd>
            </>
          )}
          {sale.customerPhone && (
            <>
              <dt className="text-ink-soft">هاتف العميل</dt>
              <dd dir="ltr" className="text-end font-archivo font-bold text-ink">{sale.customerPhone}</dd>
            </>
          )}
          {sale.notes && (
            <>
              <dt className="text-ink-soft">ملاحظات</dt>
              <dd className="text-ink">{sale.notes}</dd>
            </>
          )}
        </dl>

        <ul className="mt-4 divide-y divide-[hsl(228_16%_90%)] border-t border-[hsl(228_16%_90%)]">
          {sale.items.map((i) => (
            <li key={i.id} className="flex items-start justify-between gap-3 py-3 text-sm" data-testid="screen-line">
              <div className="min-w-0">
                <div className="font-bold text-ink">{i.productName}</div>
                <div className="text-xs text-ink-soft">
                  {i.variantName} · <bdi dir="ltr" className="font-archivo">{i.sku}</bdi>
                </div>
              </div>
              <div className="shrink-0 text-end">
                <bdi dir="ltr" className="font-archivo text-xs text-ink-soft">{i.quantity} × {formatEgp(i.unitPricePiastres)}</bdi>
                <div dir="ltr" className="font-archivo font-bold text-ink">{formatEgp(i.quantity * i.unitPricePiastres)}</div>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-2 flex items-center justify-between border-t border-[hsl(228_16%_86%)] pt-3 text-sm text-ink-soft">
          <span>عدد القطع</span>
          <bdi dir="ltr" className="font-archivo">{itemCount}</bdi>
        </div>
        <div className="mt-2 flex items-center justify-between rounded-xl bg-ink px-4 py-2.5 text-white">
          <span className="font-bold">الإجمالي</span>
          <span dir="ltr" className="font-archivo text-xl font-extrabold" data-testid="screen-total">
            {formatEgp(sale.subtotalPiastres)}
          </span>
        </div>
      </section>

      {!voided && <VoidSaleControl
          saleId={sale.id}
          receiptNo={sale.receiptNo}
          canVoid={admin ? true : canVoid}
          url={admin?.voidUrl}
          onVoided={admin?.onVoided}
        />}

      {portalRoot && createPortal(<Slip sale={sale} />, portalRoot)}
    </div>
  );
}
