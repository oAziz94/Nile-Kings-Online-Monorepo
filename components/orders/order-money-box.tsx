/**
 * Order money summary (backlog 9.3 a, `docs/redesign/03-backlog.md` "9.3 — الطلبات":
 * "order-money-box.tsx (القطع/الشحن/رسوم الدفع/الإجمالي)"). Extracted verbatim from
 * `app/(partner)/partner/orders/[id]/page.tsx`'s items-panel footer so the partner and
 * admin order details render the exact same markup (rule B2/B3) — this file changes
 * nothing about the partner's rendered output, only where the JSX lives.
 */
export type OrderMoneyBoxProps = {
  subtotalPiastres: number;
  discountPiastres: number;
  seniorFreeValuePiastres: number;
  shippingPiastres: number;
  shippingProvider: string;
  codFeePiastres: number;
  totalPiastres: number;
  couponCode: string | null;
};

export function OrderMoneyBox({
  subtotalPiastres,
  discountPiastres,
  seniorFreeValuePiastres,
  shippingPiastres,
  shippingProvider,
  codFeePiastres,
  totalPiastres,
  couponCode,
}: OrderMoneyBoxProps) {
  return (
    <div className="mt-4 flex flex-col gap-1 border-t border-stone-100 pt-4 text-sm text-ink">
      <p>المجموع الفرعي: {(subtotalPiastres / 100).toFixed(0)} ج.م</p>
      {discountPiastres + seniorFreeValuePiastres > 0 && (
        <p>
          الخصم: {((discountPiastres + seniorFreeValuePiastres) / 100).toFixed(0)} ج.م{" "}
          {couponCode && `(${couponCode})`}
        </p>
      )}
      <p>
        الشحن: {(shippingPiastres / 100).toFixed(0)} ج.م ({shippingProvider})
      </p>
      {codFeePiastres > 0 && <p>رسوم الدفع عند الاستلام: {(codFeePiastres / 100).toFixed(0)} ج.م</p>}
      <p className="font-extrabold">الإجمالي المحصّل: {(totalPiastres / 100).toFixed(0)} ج.م</p>
    </div>
  );
}
