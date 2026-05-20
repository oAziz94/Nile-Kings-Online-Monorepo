"use client";

import * as React from "react";
import Link from "next/link";
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
import { AdminPaginationBar } from "@/components/admin/admin-pagination";
import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPanelCard } from "@/components/admin/admin-panel-card";
import { AdminSearchInput } from "@/components/admin/admin-search-input";
import { Users, Loader2 } from "lucide-react";
import { formatDateEn } from "@/lib/format-en-numbers";
import { cn } from "@/lib/utils";

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

export default function AdminClientsPage() {
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

  if (loading && clients.length === 0) return <Skeleton className="h-64 w-full rounded-2xl" />;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="العملاء والمسؤولون"
        description="البحث بالهاتف أو الاسم أو البريد، وعرض الملفات والطلبات."
      />
      <AdminPanelCard
        title="قائمة المستخدمين"
        icon={<Users className="h-5 w-5 text-burgundy" />}
        toolbar={
          <AdminSearchInput
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
            <AdminEmptyState
              icon={<Users className="h-12 w-12" />}
              title={debouncedQ ? "لا توجد نتائج للبحث" : "لا يوجد مستخدمون"}
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border/60">
            <Table className={cn(fetching && "opacity-70")}>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>الهاتف</TableHead>
                  <TableHead>الاسم</TableHead>
                  <TableHead>النوع</TableHead>
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
                    <TableCell>
                      {c.role === "ADMIN" ? (
                        <Badge variant="default">مسؤول</Badge>
                      ) : (
                        <Badge variant="outline">عميل</Badge>
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
            <AdminPaginationBar
              className="mt-6"
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              disabled={fetching}
            />
          )}
      </AdminPanelCard>
    </div>
  );
}
