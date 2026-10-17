"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { SalesLog, SALES_LOG_QUERY_KEY } from "@/components/partner/sales/sales-log";
import { SaleReceipt } from "@/components/partner/sales/sale-receipt";
import { Sheet, SheetCloseButton, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { StoreSaleDetail } from "@/lib/sales/get-sale";

/**
 * المبيعات tab on an outlet's admin profile (backlog 11.6): the outlet's own sales log
 * (`SalesLog` pointed at the admin list route) with a receipt drawer that reuses `SaleReceipt` —
 * reprint, and إلغاء through the admin void route (any day, reason required, audited).
 */
export function OutletSalesTab({ partnerId }: { partnerId: string }) {
  const queryClient = useQueryClient();
  const [openId, setOpenId] = React.useState<string | null>(null);
  const baseUrl = `/api/admin/partners/${partnerId}/sales`;

  const sale = useQuery({
    queryKey: ["admin-outlet-sale", partnerId, openId],
    enabled: Boolean(openId),
    queryFn: async () => {
      const res = await fetch(`${baseUrl}/${openId}`, { credentials: "include" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "تعذّر تحميل الإيصال");
      return json.data.sale as unknown as StoreSaleDetail;
    },
    staleTime: 0,
  });

  const onVoided = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: [SALES_LOG_QUERY_KEY] });
    void queryClient.invalidateQueries({ queryKey: ["admin-outlet-sale", partnerId] });
  }, [queryClient, partnerId]);

  return (
    <div data-testid="outlet-sales-tab">
      <SalesLog baseUrl={baseUrl} onOpenSale={setOpenId} />
      <Sheet open={Boolean(openId)} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent side="right" className="max-w-lg overflow-y-auto" aria-describedby={undefined} data-testid="sale-drawer">
          <SheetHeader>
            <SheetTitle>تفاصيل الإيصال</SheetTitle>
            <SheetCloseButton />
          </SheetHeader>
          <div className="p-4">
            {sale.isLoading && (
              <div className="flex h-32 items-center justify-center text-sm text-ink-soft">
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                جاري التحميل…
              </div>
            )}
            {sale.isError && (
              <p role="alert" className="text-sm text-destructive">
                {(sale.error as Error).message}
              </p>
            )}
            {sale.data && (
              <SaleReceipt
                sale={sale.data}
                admin={{ voidUrl: `${baseUrl}/${sale.data.id}/void`, onVoided }}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
