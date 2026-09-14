/**
 * Order items — read-only summary + the editable panel (quantity edit, add-from-stock
 * search, "حفظ البنود وإعادة الحساب") (backlog 9.3 a). Extracted verbatim from
 * `app/(partner)/partner/orders/[id]/page.tsx` so the partner page's rendered `<main>`
 * stays class-for-class identical (only the JSX moved) and the admin detail (9.3 c) reuses
 * the same markup and behaviour instead of a re-implementation (rule B3).
 *
 * `belowSaveButton` is an optional slot rendered exactly where the partner page's manual
 * status-change toggle used to live (bottom of the editable panel) — the partner page keeps
 * passing that toggle so its DOM is unchanged; the admin page may omit it or pass its own.
 */
import * as React from "react";
import { Package } from "lucide-react";
import { PanelCard } from "@/components/dashboard/panel-card";
import { TableScroll } from "@/components/dashboard/table-scroll";
import { Button } from "@/components/ui/button";
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
import { OrderMoneyBox, type OrderMoneyBoxProps } from "@/components/orders/order-money-box";

export type OrderItemRow = {
  id: string;
  productName: string;
  variantName: string;
  sku: string;
  quantity: number;
  unitPricePiastres: number;
  totalPiastres: number;
  /** Present on the admin detail only — lets `getSize` apply the kids size relabelling
   * (`getDisplaySizeLabel`/`isKidsCategory`); the partner page never sets this. */
  categorySlug?: string;
};

export type EditableOrderItem = {
  variantId: string;
  productName: string;
  variantName: string;
  unitPricePiastres: number;
  quantity: number;
  imageUrl: string | null;
};

export type OrderVariantOption = {
  id: string;
  label: string;
  pricePiastres: number;
};

/** Default size/colour parsing — the partner page's own heuristic on `variantName`
 * (no `categorySlug`-aware kids relabelling; the admin detail passes its own `getSize`
 * for that). */
function defaultGetSize(item: { variantName: string }): string {
  const variantName = item.variantName;
  const parts = variantName.split("-");
  if (parts.length < 2) return variantName;
  const lastPart = parts[parts.length - 1];
  const secondLastPart = parts[parts.length - 2];
  const sizePattern = /^(S|M|L|XL|XXL|XXXL|XS|[0-9]+[a-zA-Z]*|[0-9]+[Xx][0-9]+|[0-9]+\/[0-9]+|one\s*size|free\s*size)$/i;
  const hasArabic = /[؀-ۿ]/.test(lastPart);
  if (hasArabic && secondLastPart) return secondLastPart;
  if (sizePattern.test(lastPart)) return lastPart;
  if (secondLastPart && sizePattern.test(secondLastPart)) return secondLastPart;
  return lastPart;
}

function defaultGetColor(item: { variantName: string }): string {
  const parts = item.variantName.split("-");
  const arabicPart = parts.find((part) => /[؀-ۿ]/.test(part));
  return arabicPart || "—";
}

export type OrderItemsTableProps = {
  items: OrderItemRow[];
  money: OrderMoneyBoxProps;
  editableItems: EditableOrderItem[];
  onChangeQty: (variantId: string, quantity: number) => void;
  onRemoveItem: (variantId: string) => void;
  variantSearch: string;
  onVariantSearchChange: (value: string) => void;
  variantOptions: OrderVariantOption[];
  selectedVariantId: string;
  onSelectVariant: (value: string) => void;
  newItemQty: number;
  onNewItemQtyChange: (value: number) => void;
  onAddSelectedVariant: () => void;
  onSaveItems: () => void;
  savingItems: boolean;
  getSize?: (item: OrderItemRow) => string;
  getColor?: (item: OrderItemRow) => string;
  belowSaveButton?: React.ReactNode;
};

export function OrderItemsTable({
  items,
  money,
  editableItems,
  onChangeQty,
  onRemoveItem,
  variantSearch,
  onVariantSearchChange,
  variantOptions,
  selectedVariantId,
  onSelectVariant,
  newItemQty,
  onNewItemQtyChange,
  onAddSelectedVariant,
  onSaveItems,
  savingItems,
  getSize = defaultGetSize,
  getColor = defaultGetColor,
  belowSaveButton,
}: OrderItemsTableProps) {
  return (
    <>
      <PanelCard title={`القطع (${items.length})`} icon={<Package className="h-5 w-5 text-lapis-800" />}>
        <TableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>المنتج</TableHead>
                <TableHead>المقاس · اللون</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>الكمية</TableHead>
                <TableHead>السعر</TableHead>
                <TableHead>الإجمالي</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-bold">{item.productName}</TableCell>
                  <TableCell className="text-ink-soft">
                    {getSize(item)} · {getColor(item)}
                  </TableCell>
                  <TableCell dir="ltr" className="text-xs text-ink-soft">{item.sku}</TableCell>
                  <TableCell dir="ltr">{item.quantity}</TableCell>
                  <TableCell dir="ltr">{(item.unitPricePiastres / 100).toFixed(0)}</TableCell>
                  <TableCell dir="ltr" className="font-extrabold">{(item.totalPiastres / 100).toFixed(0)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableScroll>
        <OrderMoneyBox {...money} />
      </PanelCard>

      {/* Item-edit + manual status change: preserved feature-parity from the v1 AGENT
          editing screen (`orders.md`), tucked below the read-only summary rather than
          the artboard's static table, since the artboard doesn't model this capability. */}
      <PanelCard title="تعديل بنود الطلب" description="لإضافة أو حذف بند أو تعديل الكمية." icon={<Package className="h-5 w-5 text-lapis-800" />}>
        <TableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>المنتج / المتغير</TableHead>
                <TableHead>الكمية</TableHead>
                <TableHead>إجراء</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {editableItems.map((item) => (
                <TableRow key={item.variantId}>
                  <TableCell>{item.productName} – {item.variantName}</TableCell>
                  <TableCell>
                    <input
                      type="number"
                      min={1}
                      aria-label={`الكمية — ${item.productName}`}
                      value={item.quantity}
                      onChange={(e) => onChangeQty(item.variantId, Number(e.target.value))}
                      className="h-9 w-24 rounded-lg border border-stone-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
                    />
                  </TableCell>
                  <TableCell>
                    <Button variant="destructive" size="sm" className="rounded-full" onClick={() => onRemoveItem(item.variantId)}>
                      حذف
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableScroll>
        <div className="mt-4 space-y-2 rounded-xl border border-stone-200 p-3">
          <Label htmlFor="add-item-search">إضافة بند من مخزونك</Label>
          <input
            id="add-item-search"
            className="flex h-10 w-full rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
            placeholder="ابحث عن منتج"
            value={variantSearch}
            onChange={(e) => onVariantSearchChange(e.target.value)}
          />
          <div className="flex flex-wrap items-end gap-2">
            <Select aria-label="اختر متغيرًا" value={selectedVariantId} onChange={(e) => onSelectVariant(e.target.value)} className="min-w-64 rounded-lg">
              <option value="">اختر متغيرًا</option>
              {variantOptions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label} - {(v.pricePiastres / 100).toFixed(0)} ج.م
                </option>
              ))}
            </Select>
            <input
              type="number"
              min={1}
              aria-label="الكمية المضافة"
              value={newItemQty}
              onChange={(e) => onNewItemQtyChange(Math.max(1, Number(e.target.value) || 1))}
              className="h-10 w-24 rounded-lg border border-stone-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
            />
            <Button className="rounded-full" onClick={onAddSelectedVariant} disabled={!selectedVariantId}>إضافة</Button>
          </div>
        </div>
        <Button className="mt-4 rounded-full" onClick={onSaveItems} disabled={savingItems || editableItems.length === 0}>
          {savingItems ? "جاري…" : "حفظ البنود وإعادة الحساب"}
        </Button>

        {belowSaveButton}
      </PanelCard>
    </>
  );
}
