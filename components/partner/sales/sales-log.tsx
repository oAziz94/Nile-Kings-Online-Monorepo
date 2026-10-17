"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Plus, Receipt, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { PageHeader } from "@/components/dashboard/page-header";
import { cn } from "@/lib/utils";
import { addDaysIsoUtc, cairoDateIso } from "@/lib/analytics/cairo-day";
import { PAYMENT_METHOD_LABELS, formatEgp, formatSaleDateTime } from "@/lib/sales/format";
import type { SaleListRow, SalesListResponse } from "@/lib/sales/list-sales";
import type { SalePaymentMethod } from "@/lib/sales/validation";

/**
 * Sales log (backlog 11.4, plan 12 section 3): KPIs for the selected range, presets, payment filter,
 * search, then cards on phones and the shared DataTable from `md`. Cursor-paged via
 * `GET /api/partner/sales`. Plain on purpose; the final look is the owner's call in 11.9.
 */

type Preset = "today" | "yesterday" | "7d" | "30d" | "custom";
const PRESETS: { id: Preset; label: string }[] = [
  { id: "today", label: "اليوم" },
  { id: "yesterday", label: "أمس" },
  { id: "7d", label: "7 أيام" },
  { id: "30d", label: "30 يوم" },
  { id: "custom", label: "مخصص" },
];
const PAYMENT_FILTERS: { id: SalePaymentMethod | ""; label: string }[] = [
  { id: "", label: "الكل" },
  { id: "CASH", label: PAYMENT_METHOD_LABELS.CASH },
  { id: "INSTAPAY", label: PAYMENT_METHOD_LABELS.INSTAPAY },
  { id: "CARD", label: PAYMENT_METHOD_LABELS.CARD },
];

export function presetRange(preset: Exclude<Preset, "custom">, todayIso: string): { from: string; to: string } {
  switch (preset) {
    case "today":
      return { from: todayIso, to: todayIso };
    case "yesterday": {
      const y = addDaysIsoUtc(todayIso, -1);
      return { from: y, to: y };
    }
    case "7d":
      return { from: addDaysIsoUtc(todayIso, -6), to: todayIso };
    case "30d":
      return { from: addDaysIsoUtc(todayIso, -29), to: todayIso };
  }
}

function StatusBadge() {
  return (
    <span className="rounded-full bg-[hsl(0_84%_94%)] px-2.5 py-0.5 text-xs font-bold text-destructive" data-testid="void-badge">
      ملغي
    </span>
  );
}

function Kpi({ label, value, testId, danger }: { label: string; value: string; testId: string; danger?: boolean }) {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-subtle sm:p-4">
      <div className="text-xs text-ink-soft">{label}</div>
      <div
        dir="ltr"
        className={cn("mt-1 text-end font-archivo text-lg font-extrabold sm:text-2xl", danger ? "text-destructive" : "text-ink")}
        data-testid={testId}
      >
        {value}
      </div>
    </div>
  );
}

async function fetchPage(url: string): Promise<SalesListResponse> {
  const res = await fetch(url, { credentials: "include" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "تعذّر تحميل المبيعات");
  return json.data as SalesListResponse;
}

export function SalesLog() {
  const router = useRouter();
  const todayIso = React.useMemo(() => cairoDateIso(new Date()), []);
  const [preset, setPreset] = React.useState<Preset>("today");
  const [customFrom, setCustomFrom] = React.useState(todayIso);
  const [customTo, setCustomTo] = React.useState(todayIso);
  const [payment, setPayment] = React.useState<SalePaymentMethod | "">("");
  const [term, setTerm] = React.useState("");
  const [q, setQ] = React.useState("");

  React.useEffect(() => {
    const t = setTimeout(() => setQ(term.trim()), 300);
    return () => clearTimeout(t);
  }, [term]);

  const range = preset === "custom" ? { from: customFrom, to: customTo } : presetRange(preset, todayIso);
  const rangeValid = Boolean(range.from && range.to && range.from <= range.to);

  const query = useInfiniteQuery({
    queryKey: ["partner-sales-log", range.from, range.to, payment, q],
    enabled: rangeValid,
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams({ from: range.from, to: range.to, limit: "30" });
      if (payment) p.set("paymentMethod", payment);
      if (q) p.set("q", q);
      if (pageParam) p.set("cursor", pageParam);
      return fetchPage(`/api/partner/sales?${p.toString()}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 0,
  });

  const rows = React.useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  const totals = query.data?.pages[0]?.totals;

  const columns = React.useMemo<ColumnDef<SaleListRow, unknown>[]>(
    () => [
      {
        id: "receipt",
        header: "إيصال",
        cell: ({ row }) => (
          <Link
            href={`/partner/sales/${row.original.id}`}
            className="font-archivo font-bold text-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={(e) => e.stopPropagation()}
          >
            <bdi dir="ltr">#{row.original.receiptNo}</bdi>
          </Link>
        ),
      },
      {
        id: "time",
        header: "الوقت",
        cell: ({ row }) => (
          <bdi dir="ltr" className="font-archivo text-ink-soft">
            {formatSaleDateTime(row.original.soldAt)}
          </bdi>
        ),
      },
      {
        id: "items",
        header: "القطع",
        cell: ({ row }) => <bdi dir="ltr" className="font-archivo">{row.original.itemCount}</bdi>,
      },
      {
        id: "payment",
        header: "الدفع",
        cell: ({ row }) => PAYMENT_METHOD_LABELS[row.original.paymentMethod],
      },
      {
        id: "customer",
        header: "العميل",
        cell: ({ row }) => row.original.customerName || (row.original.customerPhone ? <bdi dir="ltr">{row.original.customerPhone}</bdi> : "-"),
      },
      {
        id: "total",
        header: "الإجمالي",
        cell: ({ row }) => (
          <bdi dir="ltr" className={cn("font-archivo font-bold", row.original.status === "VOIDED" && "text-ink-soft line-through")}>
            {formatEgp(row.original.subtotalPiastres)}
          </bdi>
        ),
      },
      {
        id: "status",
        header: "الحالة",
        cell: ({ row }) => (row.original.status === "VOIDED" ? <StatusBadge /> : null),
      },
    ],
    []
  );

  const filtersActive = Boolean(payment || q);

  return (
    <div>
      <PageHeader
        title="المبيعات"
        description="كل إيصالات المنفذ. افتح إيصالاً لإعادة طباعته أو إلغائه."
        actions={
          <Button asChild>
            <Link href="/partner/sales/new">
              <Plus aria-hidden />
              بيع جديد
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-3 gap-2 sm:gap-3" data-testid="sales-kpis">
        <Kpi label="عدد الإيصالات" value={totals ? String(totals.count) : "-"} testId="kpi-count" />
        <Kpi label="الإيرادات" value={totals ? formatEgp(totals.revenuePiastres) : "-"} testId="kpi-revenue" />
        <Kpi label="ملغاة" value={totals ? String(totals.voidedCount) : "-"} testId="kpi-voided" danger={Boolean(totals?.voidedCount)} />
      </div>

      <div className="mt-4 space-y-3">
        <div role="radiogroup" aria-label="الفترة" className="flex gap-1 overflow-x-auto rounded-full bg-secondary p-1">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={preset === p.id}
              onClick={() => setPreset(p.id)}
              className={cn(
                "h-10 shrink-0 grow rounded-full px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                preset === p.id ? "bg-primary text-primary-foreground" : "text-ink hover:bg-hover"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {preset === "custom" && (
          <div className="grid grid-cols-2 gap-3 sm:max-w-md">
            <div>
              <Label htmlFor="sales-from">من</Label>
              <Input id="sales-from" type="date" dir="ltr" value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="sales-to">إلى</Label>
              <Input id="sales-to" type="date" dir="ltr" value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)} />
            </div>
          </div>
        )}
        {!rangeValid && <p className="text-sm text-destructive">اختر فترة صحيحة (تاريخ البداية قبل النهاية).</p>}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative sm:max-w-sm sm:grow">
            <Search aria-hidden className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
            <Input
              aria-label="بحث في الإيصالات"
              placeholder="رقم الإيصال أو هاتف أو اسم العميل"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              className="ps-9"
              data-testid="sales-search"
            />
          </div>
          <div role="radiogroup" aria-label="طريقة الدفع" className="flex gap-1 overflow-x-auto rounded-full bg-secondary p-1">
            {PAYMENT_FILTERS.map((p) => (
              <button
                key={p.id || "all"}
                type="button"
                role="radio"
                aria-checked={payment === p.id}
                onClick={() => setPayment(p.id)}
                className={cn(
                  "h-9 shrink-0 grow rounded-full px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  payment === p.id ? "bg-primary text-primary-foreground" : "text-ink hover:bg-hover"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4">
        {query.isError ? (
          <div className="rounded-2xl bg-white p-6 text-center shadow-subtle" role="alert">
            <p className="text-sm text-destructive">{(query.error as Error).message}</p>
            <Button type="button" variant="outline" className="mt-3" onClick={() => void query.refetch()}>
              إعادة المحاولة
            </Button>
          </div>
        ) : (
          <>
            {/* Phone: cards */}
            <ul className="space-y-2 md:hidden" aria-label="الإيصالات" data-testid="sales-cards">
              {query.isLoading && rangeValid && <li className="rounded-2xl bg-white p-4 text-sm text-ink-soft shadow-subtle">جارٍ التحميل...</li>}
              {rows.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/partner/sales/${r.id}`}
                    className="block rounded-2xl bg-white p-3 shadow-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    data-testid="sale-card"
                    data-receipt={r.receiptNo}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-archivo font-bold text-ink">
                        إيصال <bdi dir="ltr">#{r.receiptNo}</bdi>
                      </span>
                      <span className="flex items-center gap-2">
                        {r.status === "VOIDED" && <StatusBadge />}
                        <bdi dir="ltr" className={cn("font-archivo font-extrabold text-ink", r.status === "VOIDED" && "text-ink-soft line-through")}>
                          {formatEgp(r.subtotalPiastres)}
                        </bdi>
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-ink-soft">
                      <bdi dir="ltr" className="font-archivo">{formatSaleDateTime(r.soldAt)}</bdi>
                      <span>
                        <bdi dir="ltr" className="font-archivo">{r.itemCount}</bdi> قطع
                      </span>
                      <span>{PAYMENT_METHOD_LABELS[r.paymentMethod]}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            {/* md+: shared DataTable */}
            <div className="hidden md:block" data-testid="sales-table">
              <DataTable<SaleListRow>
                columns={columns}
                data={rows}
                loading={query.isLoading && rangeValid}
                getRowId={(r) => r.id}
                onRowClick={(r) => router.push(`/partner/sales/${r.id}`)}
                getRowProps={(r) => ({ "data-testid": "sale-row", "data-receipt": r.receiptNo }) as React.HTMLAttributes<HTMLTableRowElement>}
                emptyTitle="لا توجد إيصالات"
                emptyDescription={filtersActive ? "جرّب تغيير البحث أو الفلاتر." : "لا مبيعات في هذه الفترة."}
                emptyIcon={<Receipt className="h-8 w-8" strokeWidth={1.5} />}
              />
            </div>
            {!query.isLoading && rows.length === 0 && (
              <p className="rounded-2xl bg-white p-6 text-center text-sm text-ink-soft shadow-subtle md:hidden" data-testid="sales-empty">
                {filtersActive ? "لا نتائج للبحث أو الفلاتر الحالية." : "لا مبيعات في هذه الفترة."}
              </p>
            )}
            {query.hasNextPage && (
              <div className="mt-3 text-center">
                <Button type="button" variant="outline" onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage}>
                  {query.isFetchingNextPage ? "جارٍ التحميل..." : "عرض المزيد"}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
