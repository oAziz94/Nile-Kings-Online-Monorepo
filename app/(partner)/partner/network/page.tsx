"use client";

/**
 * Partner — Distributors roster (backlog 4.21). Read-only AGENT-only directory of every
 * DISTRIBUTOR linked beneath the current agent, rebuilt on the shared `DataTable` shell
 * per `00-feature-inventory/partner/distributors.md`. No API change: `GET
 * /api/partner/distributors` is untouched, same columns/labels/links/sort order.
 *
 * Role gate is client-side via `usePartnerMe()` (standing rule 3) rendering the explicit
 * "هذه الصفحة متاحة للوكلاء فقط" panel for a DISTRIBUTOR (standing rule 5) instead of the
 * old generic destructive-toast-on-403 behaviour — this is the task's named change from
 * strict parity (backlog 4.21 + the partner-portal standing rules supersede the
 * inventory's "moot in normal navigation" 403 toast path).
 */
import * as React from "react";
import { AlertTriangle, ShieldAlert, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, StatusBadge } from "@/components/dashboard/page-header";
import { PanelCard } from "@/components/dashboard/panel-card";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/shared/skeleton";
import { usePartnerMe } from "@/hooks/use-partner-me";
import { formatDateEn, formatNumberEn } from "@/lib/format-en-numbers";
import { cn } from "@/lib/utils";

type Distributor = {
  id: string;
  name: string;
  phone: string;
  governorate: string;
  facebookUrl: string | null;
  instagramUrl: string | null;
  tiktokUrl: string | null;
  youtubeUrl: string | null;
  websiteUrl: string | null;
  otherUrl: string | null;
  isActive: boolean;
  createdAt: string;
  user: { email: string | null } | null;
  inventoryTotals: { available: number; reserved: number; sellable: number };
};

async function fetchDistributors(): Promise<Distributor[]> {
  const res = await fetch("/api/partner/distributors", { credentials: "include" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(json?.error?.message ?? "فشل تحميل الموزعين");
  }
  return json.data.distributors ?? [];
}

function ContactLink({ href, label }: { href: string | null; label: string }) {
  if (!href) return null;
  return (
    <a
      className="text-xs font-semibold text-lapis-800 hover:underline"
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      {label}
    </a>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-[5px] text-xs font-extrabold",
        active ? "bg-malachite-bg text-malachite-text" : "bg-neutral-bg text-neutral-text"
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          active ? "bg-malachite-text" : "bg-neutral-text"
        )}
      />
      {active ? "نشط" : "معطّل"}
    </span>
  );
}

/** In-page role gate — standing rule 5: a wrong-role visit gets an explicit panel, not an empty table. */
function RoleGatePanel({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-[14px] border border-stone-200 bg-white py-14 text-center">
      <ShieldAlert className="h-9 w-9 text-stone-300" strokeWidth={1.5} />
      <p className="text-[15px] font-extrabold text-ink">{message}</p>
    </div>
  );
}

function LoadErrorPanel({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-2 rounded-[14px] border border-carnelian-500/30 bg-danger-bg py-14 text-center text-danger-text"
    >
      <AlertTriangle className="h-9 w-9" strokeWidth={1.5} />
      <p className="text-[15px] font-extrabold">فشل تحميل الموزعين</p>
      <Button type="button" variant="outline" className="mt-2 rounded-xl" onClick={onRetry}>
        إعادة المحاولة
      </Button>
    </div>
  );
}

const columns: ColumnDef<Distributor, unknown>[] = [
  {
    id: "name",
    header: "الاسم",
    enableSorting: false,
    cell: ({ row }) => <span className="font-bold text-ink">{row.original.name}</span>,
  },
  {
    id: "governorate",
    header: "المحافظة",
    enableSorting: false,
    cell: ({ row }) => row.original.governorate,
  },
  {
    id: "phone",
    header: "الهاتف",
    enableSorting: false,
    cell: ({ row }) => (
      <span dir="ltr" className="block text-right font-mono text-sm">
        {row.original.phone}
      </span>
    ),
  },
  {
    id: "email",
    header: "البريد",
    enableSorting: false,
    cell: ({ row }) => row.original.user?.email ?? "—",
  },
  {
    id: "contact",
    header: "التواصل",
    enableSorting: false,
    cell: ({ row }) => {
      const d = row.original;
      const links = [
        { href: d.facebookUrl, label: "Facebook" },
        { href: d.instagramUrl, label: "Instagram" },
        { href: d.tiktokUrl, label: "TikTok" },
        { href: d.youtubeUrl, label: "YouTube" },
        { href: d.websiteUrl, label: "Website" },
        { href: d.otherUrl, label: "Other" },
      ];
      const hasAny = links.some((l) => l.href);
      return (
        <div className="flex flex-wrap gap-2">
          {links.map((l) => (
            <ContactLink key={l.label} href={l.href} label={l.label} />
          ))}
          {!hasAny && "—"}
        </div>
      );
    },
  },
  {
    id: "inventory",
    header: "المخزون",
    enableSorting: false,
    cell: ({ row }) => {
      const t = row.original.inventoryTotals;
      return (
        <div className="space-y-1 text-xs text-ink-soft">
          <p>متاح: {formatNumberEn(t.available)}</p>
          <p>محجوز: {formatNumberEn(t.reserved)}</p>
          <p>قابل للبيع: {formatNumberEn(t.sellable)}</p>
        </div>
      );
    },
  },
  {
    id: "status",
    header: "الحالة",
    enableSorting: false,
    cell: ({ row }) => <StatusPill active={row.original.isActive} />,
  },
  {
    id: "createdAt",
    header: "تاريخ الربط",
    enableSorting: false,
    cell: ({ row }) => formatDateEn(row.original.createdAt),
  },
];

export default function PartnerDistributorsPage() {
  const { data: partner, isLoading: partnerLoading, isError: partnerError, refetch: refetchPartner } =
    usePartnerMe();

  const isAgent = partner?.partnerType === "AGENT";

  const {
    data: distributors,
    isLoading: listLoading,
    isFetching: listFetching,
    isError: listError,
    refetch: refetchList,
  } = useQuery({
    queryKey: ["partner-distributors"],
    queryFn: fetchDistributors,
    enabled: isAgent,
  });

  const actions = (
    <Button
      type="button"
      variant="outline"
      className="rounded-xl"
      onClick={() => refetchList()}
      disabled={!isAgent || listFetching}
    >
      تحديث
    </Button>
  );

  let body: React.ReactNode;

  if (partnerLoading) {
    body = (
      <div className="space-y-2 rounded-[14px] border border-stone-200 bg-white p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-md" />
        ))}
      </div>
    );
  } else if (partnerError) {
    body = <LoadErrorPanel onRetry={() => refetchPartner()} />;
  } else if (!isAgent) {
    body = <RoleGatePanel message="هذه الصفحة متاحة للوكلاء فقط" />;
  } else if (listError) {
    body = <LoadErrorPanel onRetry={() => refetchList()} />;
  } else {
    body = (
      <DataTable
        columns={columns}
        data={distributors ?? []}
        loading={listLoading}
        getRowId={(row) => row.id}
        emptyTitle="لا يوجد موزعون مرتبطون بعد"
        emptyIcon={<Users className="h-8 w-8" strokeWidth={1.5} />}
        className={cn(listFetching && !listLoading && "opacity-70")}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="الموزعون"
        description="الموزعون المرتبطون بحسابك وبيانات التواصل والمخزون المختصر."
        badge={<StatusBadge>وكلاء فقط</StatusBadge>}
        actions={actions}
      />

      <PanelCard title="الموزعون المرتبطون" icon={<Users className="h-5 w-5 text-lapis-800" />} noPadding>
        <div className="p-4 sm:p-[22px]">{body}</div>
      </PanelCard>
    </div>
  );
}
