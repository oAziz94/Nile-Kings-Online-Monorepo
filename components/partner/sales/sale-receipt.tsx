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
 * prints regardless of how the portal shell is structured. The final look is the owner's call in 11.9.
 */

const PRINT_CSS = `
@page { size: 80mm auto; margin: 4mm; }
#receipt-print-root { display: none; }
@media print {
  html, body { background: #fff !important; height: auto !important; overflow: visible !important; }
  body > *:not(#receipt-print-root) { display: none !important; }
  #receipt-print-root { display: block; position: relative; color: #000; background: #fff; font-size: 11px; line-height: 1.45; }
  #receipt-print-root, #receipt-print-root * { color: #000 !important; background: transparent !important; box-shadow: none !important; }
}
`;

type Sale = StoreSaleDetail;

function Slip({ sale }: { sale: Sale }) {
  const storeName = sale.partner.storeName?.trim() || sale.partner.name;
  const footer = sale.partner.receiptFooter?.trim() || DEFAULT_RECEIPT_FOOTER;
  const itemCount = sale.items.reduce((s, i) => s + i.quantity, 0);
  return (
    <div dir="rtl" className="mx-auto w-full" style={{ position: "relative", fontFamily: "var(--font-plex-arabic), sans-serif" }} data-testid="receipt-slip">
      {sale.status === "VOIDED" && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: "rotate(-30deg)",
            fontSize: "42px",
            fontWeight: 800,
            border: "none",
            opacity: 0.25,
            pointerEvents: "none",
          }}
        >
          ملغي
        </div>
      )}
      <div style={{ textAlign: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/logo-lapis-mark.png"
          alt=""
          style={{ width: "28mm", height: "auto", margin: "0 auto 2mm", filter: "grayscale(1) contrast(1.6)" }}
        />
        <div style={{ fontWeight: 800, fontSize: "14px" }}>{storeName}</div>
        {sale.partner.storeAddress && <div>{sale.partner.storeAddress}</div>}
        {sale.partner.phone && (
          <div dir="ltr" style={{ fontFamily: "var(--font-archivo), sans-serif" }}>{sale.partner.phone}</div>
        )}
      </div>
      <hr style={{ border: 0, borderTop: "1px dashed #000", margin: "3mm 0" }} />
      <div style={{ fontWeight: 700 }}>
        إيصال رقم <bdi dir="ltr" style={{ fontFamily: "var(--font-archivo), sans-serif" }}>{sale.receiptNo}</bdi>
      </div>
      <div>
        <bdi dir="ltr" style={{ fontFamily: "var(--font-archivo), sans-serif" }}>{formatSaleDateTime(sale.soldAt)}</bdi>
      </div>
      {sale.sellerName && <div>البائع: {sale.sellerName}</div>}
      {sale.status === "VOIDED" && sale.voidReason && <div>سبب الإلغاء: {sale.voidReason}</div>}
      <hr style={{ border: 0, borderTop: "1px dashed #000", margin: "3mm 0" }} />
      {sale.items.map((i) => (
        <div key={i.id} style={{ marginBottom: "2mm" }} data-testid="receipt-line">
          <div style={{ fontWeight: 700 }}>{i.productName}</div>
          <div>
            {i.variantName} · <bdi dir="ltr" style={{ fontFamily: "var(--font-archivo), sans-serif" }}>{i.sku}</bdi>
          </div>
          <div dir="ltr" style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-archivo), sans-serif" }}>
            <span>{formatEgp(i.quantity * i.unitPricePiastres)}</span>
            <span>
              {i.quantity} × {formatEgp(i.unitPricePiastres)} =
            </span>
          </div>
        </div>
      ))}
      <hr style={{ border: 0, borderTop: "1px dashed #000", margin: "3mm 0" }} />
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>عدد القطع</span>
        <bdi dir="ltr" style={{ fontFamily: "var(--font-archivo), sans-serif" }}>{itemCount}</bdi>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: "14px" }}>
        <span>الإجمالي</span>
        <bdi dir="ltr" style={{ fontFamily: "var(--font-archivo), sans-serif" }} data-testid="receipt-total">
          {formatEgp(sale.subtotalPiastres)}
        </bdi>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>طريقة الدفع</span>
        <span>{PAYMENT_METHOD_LABELS[sale.paymentMethod]}</span>
      </div>
      <hr style={{ border: 0, borderTop: "1px dashed #000", margin: "3mm 0" }} />
      <div style={{ textAlign: "center", whiteSpace: "pre-line" }}>{footer}</div>
    </div>
  );
}

export function SaleReceipt({ sale, canVoid = false }: { sale: Sale; canVoid?: boolean }) {
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
            <Button asChild>
              <Link href="/partner/sales/new">
                <Plus aria-hidden />
                بيع جديد
              </Link>
            </Button>
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
        <div className="mt-1 flex items-center justify-between">
          <span className="font-bold text-ink">الإجمالي</span>
          <span dir="ltr" className="font-archivo text-xl font-extrabold text-ink" data-testid="screen-total">
            {formatEgp(sale.subtotalPiastres)}
          </span>
        </div>
      </section>

      {!voided && <VoidSaleControl saleId={sale.id} receiptNo={sale.receiptNo} canVoid={canVoid} />}

      {portalRoot && createPortal(<Slip sale={sale} />, portalRoot)}
    </div>
  );
}
