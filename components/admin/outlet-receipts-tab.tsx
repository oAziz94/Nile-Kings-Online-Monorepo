"use client";

import * as React from "react";
import { Loader2, Package, Plus } from "lucide-react";
import { PanelCard } from "@/components/dashboard/panel-card";
import { TableScroll } from "@/components/dashboard/table-scroll";
import { RecordReceiptDialog } from "@/components/admin/partner-finance-tab";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateEn, formatNumberEn } from "@/lib/format-en-numbers";

/**
 * الاستلامات tab on an outlet's admin profile (backlog 11.6): the outlet's stock receipts and the
 * existing "تسجيل استلام باسمه" action (`recordedBy ADMIN`). No cost columns: an outlet's FACTORY
 * receipts snapshot no cost (11.1), so there is no value / rate to show.
 */
type ReceiptRow = {
  id: string;
  kind: "FACTORY" | "COUNT" | string;
  reference: string | null;
  notes: string | null;
  createdAt: string;
  units: number;
  recordedBy: "PARTNER" | "ADMIN";
};

const KIND_LABEL: Record<string, string> = { FACTORY: "استلام من المصنع", COUNT: "جرد" };

export function OutletReceiptsTab({ partnerId }: { partnerId: string }) {
  const [rows, setRows] = React.useState<ReceiptRow[] | null>(null);
  const [error, setError] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  const load = React.useCallback(() => {
    fetch(`/api/admin/partners/${partnerId}/receipts?limit=200`, { credentials: "include" })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: { receipts: ReceiptRow[] } }) => {
        if (json?.success && json.data) setRows(json.data.receipts);
        else setError(true);
      })
      .catch(() => setError(true));
  }, [partnerId]);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <div data-testid="outlet-receipts-tab">
      <PanelCard
        title="الاستلامات"
        icon={<Package className="h-5 w-5 text-lapis-800" />}
        toolbar={
          <Button type="button" size="sm" className="rounded-full" onClick={() => setOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            تسجيل استلام باسمه
          </Button>
        }
      >
        {error ? (
          <p role="alert" className="py-6 text-center text-sm text-destructive">تعذّر تحميل الاستلامات</p>
        ) : rows === null ? (
          <div className="flex h-24 items-center justify-center text-sm text-ink-soft">
            <Loader2 className="ml-2 h-4 w-4 animate-spin" />
            جاري التحميل…
          </div>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-soft">لا توجد استلامات مسجّلة</p>
        ) : (
          <TableScroll>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الإيصال</TableHead>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>النوع</TableHead>
                  <TableHead>الكمية</TableHead>
                  <TableHead>سجّله</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} data-testid="receipt-row">
                    <TableCell className="font-mono text-xs">{r.reference ?? r.id.slice(0, 8)}</TableCell>
                    <TableCell>{formatDateEn(r.createdAt)}</TableCell>
                    <TableCell>{KIND_LABEL[r.kind] ?? r.kind}</TableCell>
                    <TableCell dir="ltr">{formatNumberEn(r.units)}</TableCell>
                    <TableCell>
                      <Badge variant={r.recordedBy === "ADMIN" ? "info" : "neutral"} className="rounded-full text-[11px] font-extrabold">
                        {r.recordedBy === "ADMIN" ? "المصنع (أنت)" : "المنفذ"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableScroll>
        )}
      </PanelCard>
      <RecordReceiptDialog partnerId={partnerId} open={open} onOpenChange={setOpen} onRecorded={load} />
    </div>
  );
}
