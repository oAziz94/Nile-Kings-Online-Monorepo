"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/shared/skeleton";
import { PaginationBar } from "@/components/dashboard/pagination";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { PanelCard } from "@/components/dashboard/panel-card";
import { SearchInput } from "@/components/dashboard/search-input";
import { Users, Loader2, UserPlus, ShieldCheck } from "lucide-react";
import { formatDateEn } from "@/lib/format-en-numbers";
import { cn } from "@/lib/utils";
import { AdminsTab } from "@/components/admin/admins-tab";

const TABS = [
  { id: "clients", label: "العملاء" },
  { id: "admins", label: "المسؤولون" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function AdminClientsPageWrapper() {
  return (
    <React.Suspense fallback={<Skeleton className="h-64 w-full rounded-lg" />}>
      <AdminClientsTabs />
    </React.Suspense>
  );
}

function AdminClientsTabs() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") as TabId | null;
  const tab: TabId = TABS.some((t) => t.id === tabParam) ? (tabParam as TabId) : "clients";

  const setTab = (next: TabId) => {
    router.replace(next === "clients" ? "/admin/clients" : `/admin/clients?tab=${next}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={tab === "admins" ? "المسؤولون" : "العملاء"}
        description={
          tab === "admins"
            ? "حسابات الفريق التي لديها صلاحية دخول لوحة الإدارة."
            : "حسابات العملاء فقط، مع العناوين والطلبات المرتبطة بكل عميل."
        }
        actions={
          tab === "clients" ? (
            <Button asChild className="rounded-md">
              <Link href="/admin/clients/new">
                <UserPlus className="h-4 w-4" />
                عميل جديد
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div role="tablist" aria-label="أقسام صفحة العملاء" className="flex flex-wrap gap-1 rounded-2xl bg-white p-1.5 shadow-soft">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-xl px-3.5 py-2 text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500",
              tab === t.id ? "bg-lapis-800 text-white" : "text-ink-soft hover:bg-stone-50"
            )}
          >
            {t.id === "admins" && <ShieldCheck className="ml-1 inline h-3.5 w-3.5" />}
            {t.label}
          </button>
        ))}
      </div>

      {tab === "admins" ? <AdminsTab /> : <AdminClientsList />}
    </div>
  );
}

type Client = {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  role: "CUSTOMER" | "ADMIN";
  seniorVerified: boolean;
  createdAt: string;
  _count: { orders: number; savedAddresses: number };
};

function AdminClientsList() {
  const [clients, setClients] = React.useState<Client[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [fetching, setFetching] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [debouncedQ, setDebouncedQ] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(20);
  const { toast } = useToast();

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  React.useEffect(() => {
    setPage(0);
  }, [debouncedQ]);

  React.useEffect(() => {
    const totalPages = total === 0 ? 1 : Math.max(1, Math.ceil(total / pageSize));
    if (page > totalPages - 1) setPage(Math.max(0, totalPages - 1));
  }, [total, pageSize, page]);

  React.useEffect(() => {
    const ac = new AbortController();
    setFetching(true);
    const params = new URLSearchParams({
      role: "CUSTOMER",
      limit: String(pageSize),
      offset: String(page * pageSize),
    });
    if (debouncedQ) params.set("q", debouncedQ);
    fetch(`/api/admin/clients?${params}`, { credentials: "include", signal: ac.signal })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: { clients: Client[]; total: number } }) => {
        if (ac.signal.aborted) return;
        if (json?.success && json.data) {
          setClients(json.data.clients);
          setTotal(json.data.total);
        }
      })
      .catch(() => {
        if (!ac.signal.aborted) toast({ title: "فشل تحميل القائمة", variant: "destructive" });
      })
      .finally(() => {
        if (!ac.signal.aborted) {
          setLoading(false);
          setFetching(false);
        }
      });
    return () => ac.abort();
  }, [debouncedQ, page, pageSize, toast]);

  if (loading && clients.length === 0) return <Skeleton className="h-64 w-full rounded-lg" />;

  return (
    <>
      <PanelCard
        title="قائمة العملاء"
        icon={<Users className="h-5 w-5 text-burgundy" />}
        toolbar={
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="بحث بالهاتف أو الاسم…"
            className="w-64"
          />
        }
      >
          {fetching && clients.length > 0 && (
            <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              جاري التحديث…
            </div>
          )}
          {clients.length === 0 && !fetching ? (
            <EmptyState
              icon={<Users className="h-12 w-12" />}
              title={debouncedQ ? "لا توجد نتائج للبحث" : "لا يوجد عملاء"}
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
            <Table className={cn(fetching && "opacity-70")}>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>الهاتف</TableHead>
                  <TableHead>الاسم</TableHead>
                  <TableHead>البريد</TableHead>
                  <TableHead>العناوين</TableHead>
                  <TableHead>الطلبات</TableHead>
                  <TableHead>التسجيل</TableHead>
                  <TableHead className="text-left">ملف التعريف</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono">{c.phone}</TableCell>
                    <TableCell>
                      {c.name?.trim() || "—"}
                      {c.seniorVerified && (
                        <Badge variant="secondary" className="mr-1 text-xs">
                          كبار سن
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.email ?? "—"}</TableCell>
                    <TableCell>{c._count.savedAddresses}</TableCell>
                    <TableCell>{c._count.orders}</TableCell>
                    <TableCell>{formatDateEn(c.createdAt)}</TableCell>
                    <TableCell className="text-left">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/admin/clients/${c.id}`}>عرض الملف</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
          {total > 0 && (
            <PaginationBar
              className="mt-6"
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              disabled={fetching}
            />
          )}
      </PanelCard>
    </>
  );
}
