"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCircleQuestion, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PanelCard } from "@/components/dashboard/panel-card";
import { SearchInput } from "@/components/dashboard/search-input";
import { StatusPill, type StatusPillTone } from "@/components/dashboard/status-pill";
import { Button } from "@/components/ui/button";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { formatRelativeTimeAr } from "@/lib/format-relative-time-ar";
import { formatNumberEn } from "@/lib/format-en-numbers";
import {
  getOrderTicketStatusLabel,
  getOrderTicketSubjectLabel,
} from "@/lib/constants/order-ticket";
import { cn } from "@/lib/utils";

type TicketStatus = "OPEN" | "ANSWERED" | "CLOSED";

type TicketRow = {
  id: string;
  orderId: string;
  orderLabel: string;
  customerName: string | null;
  customerPhone: string;
  subject: string;
  status: TicketStatus;
  lastMessageExcerpt: string;
  lastMessageAuthorRole: "CUSTOMER" | "ADMIN" | null;
  lastMessageAt: string;
  createdAt: string;
  waitingSinceAt: string | null;
};

type Counts = { open: number; answered: number; closed: number };

const STATUS_TONE: Record<TicketStatus, StatusPillTone> = {
  OPEN: "warning",
  ANSWERED: "success",
  CLOSED: "neutral",
};

const TABS: { value: TicketStatus; label: string }[] = [
  { value: "OPEN", label: "بانتظار الرد" },
  { value: "ANSWERED", label: "تم الرد" },
  { value: "CLOSED", label: "مغلقة" },
];

const TAB_EMPTY_TITLE: Record<TicketStatus, string> = {
  OPEN: "لا توجد أسئلة بانتظار الرد",
  ANSWERED: "لا توجد أسئلة تم الرد عليها",
  CLOSED: "لا توجد أسئلة مغلقة",
};

export default function AdminOrderTicketsPage() {
  const router = useRouter();
  const [tab, setTab] = React.useState<TicketStatus>("OPEN");
  const [search, setSearch] = React.useState("");
  const [debouncedQ, setDebouncedQ] = React.useState("");
  const [tickets, setTickets] = React.useState<TicketRow[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [counts, setCounts] = React.useState<Counts>({ open: 0, answered: 0, closed: 0 });
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = React.useCallback(
    async (cursor?: string) => {
      if (cursor) setLoadingMore(true);
      else setLoading(true);
      const params = new URLSearchParams({ status: tab, take: "25" });
      if (debouncedQ) params.set("q", debouncedQ);
      if (cursor) params.set("cursor", cursor);
      try {
        const res = await fetch(`/api/admin/order-tickets?${params.toString()}`, { credentials: "include" });
        const json = await res.json();
        if (res.ok && json?.success) {
          setTickets((prev) => (cursor ? [...prev, ...json.data.tickets] : json.data.tickets));
          setNextCursor(json.data.nextCursor ?? null);
          setCounts(json.data.counts ?? { open: 0, answered: 0, closed: 0 });
          setLoadError(null);
        } else {
          setLoadError(json?.error?.message ?? "فشل تحميل الأسئلة");
        }
      } catch {
        setLoadError("فشل تحميل الأسئلة");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [tab, debouncedQ]
  );

  React.useEffect(() => {
    load();
  }, [load]);

  const columns = React.useMemo<ColumnDef<TicketRow, unknown>[]>(
    () => [
      {
        id: "order",
        header: "الطلب",
        cell: ({ row }) => (
          <Link
            href={`/admin/order-tickets/${row.original.id}`}
            className="font-mono text-xs font-bold text-lapis-800 hover:underline"
            dir="ltr"
            onClick={(e) => e.stopPropagation()}
          >
            {row.original.orderLabel}
          </Link>
        ),
      },
      {
        id: "customer",
        header: "العميل",
        cell: ({ row }) => (
          <div>
            <p className="font-bold text-ink">{row.original.customerName ?? "عميل بدون اسم"}</p>
            <p dir="ltr" className="text-xs text-ink-soft">
              {row.original.customerPhone}
            </p>
          </div>
        ),
      },
      {
        id: "subject",
        header: "الموضوع",
        cell: ({ row }) => (
          <span className="text-ink-soft">{getOrderTicketSubjectLabel(row.original.subject)}</span>
        ),
      },
      {
        id: "status",
        header: "الحالة",
        cell: ({ row }) => (
          <StatusPill tone={STATUS_TONE[row.original.status]}>
            {getOrderTicketStatusLabel(row.original.status)}
          </StatusPill>
        ),
      },
      {
        id: "lastMessage",
        header: "آخر رسالة",
        cell: ({ row }) => (
          <div className="max-w-xs">
            <p className="truncate text-ink">{row.original.lastMessageExcerpt || "—"}</p>
            {row.original.lastMessageAuthorRole && (
              <span className="text-xs text-ink-soft">
                {row.original.lastMessageAuthorRole === "CUSTOMER" ? "العميل" : "أنت"}
              </span>
            )}
          </div>
        ),
      },
      {
        id: "since",
        header: "منذ",
        cell: ({ row }) => (
          <span className="text-ink-soft">
            {formatRelativeTimeAr(row.original.waitingSinceAt ?? row.original.lastMessageAt)}
          </span>
        ),
      },
    ],
    []
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="أسئلة العملاء"
        description="أسئلة العملاء عن طلباتهم، والرد عليها."
        actions={
          <Button type="button" variant="outline" className="rounded-full" onClick={() => load()} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            تحديث
          </Button>
        }
      />

      <PanelCard
        title="قائمة الأسئلة"
        icon={<MessageCircleQuestion className="h-5 w-5 text-lapis-800" />}
        noPadding
      >
        <div
          role="tablist"
          aria-label="حالة الأسئلة"
          className="flex gap-1 overflow-x-auto border-b border-stone-200 px-4 pt-2 sm:px-[22px]"
        >
          {TABS.map((t) => {
            const active = tab === t.value;
            const count = counts[t.value.toLowerCase() as keyof Counts] ?? 0;
            return (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                onClick={() => setTab(t.value)}
                onKeyDown={(e) => {
                  const tabs = Array.from(
                    e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []
                  );
                  const i = tabs.indexOf(e.currentTarget);
                  if (i < 0) return;
                  const next =
                    e.key === "ArrowLeft" ? i + 1 : e.key === "ArrowRight" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
                  if (next === null) return;
                  e.preventDefault();
                  const target = tabs[(next + tabs.length) % tabs.length];
                  target.focus();
                  target.click();
                }}
                className={cn(
                  "flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2",
                  active ? "border-gold-500 text-lapis-800" : "border-transparent text-ink-soft hover:text-ink"
                )}
              >
                {t.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0 text-[11px] font-extrabold leading-[18px]",
                    active ? "bg-lapis-50 text-lapis-800" : "bg-stone-100 text-ink-soft"
                  )}
                >
                  {formatNumberEn(count)}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3.5 sm:px-[22px]">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="ابحث برقم الطلب أو اسم العميل أو الهاتف"
            className="sm:w-80"
          />
        </div>

        {loadError && tickets.length === 0 && !loading ? (
          <div role="alert" className="m-4 flex flex-col items-start gap-2 rounded-xl border border-danger-text/30 bg-danger-bg p-4 text-sm text-danger-text sm:m-[22px]">
            <p className="font-bold">{loadError}</p>
            <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={() => load()}>
              إعادة المحاولة
            </Button>
          </div>
        ) : (
          <div className="p-4 sm:p-[22px]">
            {/* Mobile (< sm): card rows, same data as the desktop DataTable. */}
            <div className="space-y-3 sm:hidden">
              {!loading && tickets.length === 0 && (
                <p className="py-8 text-center text-sm text-ink-soft">
                  {debouncedQ ? "لا توجد نتائج للبحث" : TAB_EMPTY_TITLE[tab]}
                </p>
              )}
              {tickets.map((t) => (
                <Link
                  key={t.id}
                  href={`/admin/order-tickets/${t.id}`}
                  className="block rounded-2xl border border-stone-200 bg-white p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span dir="ltr" className="font-mono text-xs font-bold text-lapis-800">
                      {t.orderLabel}
                    </span>
                    <StatusPill tone={STATUS_TONE[t.status]}>{getOrderTicketStatusLabel(t.status)}</StatusPill>
                  </div>
                  <p className="mt-2 text-sm font-bold text-ink">{t.customerName ?? "عميل بدون اسم"}</p>
                  <p dir="ltr" className="text-xs text-ink-soft">
                    {t.customerPhone}
                  </p>
                  <p className="mt-2 text-xs text-ink-soft">{getOrderTicketSubjectLabel(t.subject)}</p>
                  {t.lastMessageExcerpt && (
                    <p className="mt-1 truncate text-sm text-ink">{t.lastMessageExcerpt}</p>
                  )}
                  <p className="mt-2 text-xs text-ink-soft">
                    {formatRelativeTimeAr(t.waitingSinceAt ?? t.lastMessageAt)}
                  </p>
                </Link>
              ))}
            </div>
            <div className="hidden sm:block">
              <DataTable
                columns={columns}
                data={tickets}
                getRowId={(t) => t.id}
                onRowClick={(t) => router.push(`/admin/order-tickets/${t.id}`)}
                loading={loading}
                emptyTitle={debouncedQ ? "لا توجد نتائج للبحث" : TAB_EMPTY_TITLE[tab]}
              />
            </div>
            {nextCursor && (
              <div className="mt-4 flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => load(nextCursor)}
                  disabled={loadingMore}
                >
                  {loadingMore ? "جاري التحميل…" : "تحميل المزيد"}
                </Button>
              </div>
            )}
          </div>
        )}
      </PanelCard>
    </div>
  );
}
