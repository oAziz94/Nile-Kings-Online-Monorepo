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
import { Loader2, ShieldCheck } from "lucide-react";
import { formatDateEn } from "@/lib/format-en-numbers";
import { cn } from "@/lib/utils";

type AdminUser = {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  role: "CUSTOMER" | "ADMIN";
  seniorVerified: boolean;
  createdAt: string;
  _count: { orders: number; savedAddresses: number };
};

export default function AdminAccountsPage() {
  const [admins, setAdmins] = React.useState<AdminUser[]>([]);
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
      role: "ADMIN",
      limit: String(pageSize),
      offset: String(page * pageSize),
    });
    if (debouncedQ) params.set("q", debouncedQ);
    fetch(`/api/admin/clients?${params}`, { credentials: "include", signal: ac.signal })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: { clients: AdminUser[]; total: number } }) => {
        if (ac.signal.aborted) return;
        if (json?.success && json.data) {
          setAdmins(json.data.clients);
          setTotal(json.data.total);
        }
      })
      .catch(() => {
        if (!ac.signal.aborted) toast({ title: "فشل تحميل المسؤولين", variant: "destructive" });
      })
      .finally(() => {
        if (!ac.signal.aborted) {
          setLoading(false);
          setFetching(false);
        }
      });
    return () => ac.abort();
  }, [debouncedQ, page, pageSize, toast]);

  if (loading && admins.length === 0) return <Skeleton className="h-64 w-full rounded-lg" />;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="المسؤولون"
        description="حسابات الفريق التي لديها صلاحية دخول لوحة الإدارة."
      />

      <AdminPanelCard
        title="قائمة المسؤولين"
        icon={<ShieldCheck className="h-5 w-5 text-burgundy" />}
        toolbar={
          <AdminSearchInput
            value={search}
            onChange={setSearch}
            placeholder="بحث بالهاتف أو الاسم…"
            className="w-64"
          />
        }
      >
        {fetching && admins.length > 0 && (
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            جاري التحديث…
          </div>
        )}
        {admins.length === 0 && !fetching ? (
          <AdminEmptyState
            icon={<ShieldCheck className="h-12 w-12" />}
            title={debouncedQ ? "لا توجد نتائج للبحث" : "لا يوجد مسؤولون"}
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table className={cn(fetching && "opacity-70")}>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>الهاتف</TableHead>
                  <TableHead>الاسم</TableHead>
                  <TableHead>الصلاحية</TableHead>
                  <TableHead>البريد</TableHead>
                  <TableHead>الطلبات كعميل</TableHead>
                  <TableHead>تاريخ الإنشاء</TableHead>
                  <TableHead className="text-left">ملف التعريف</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {admins.map((admin) => (
                  <TableRow key={admin.id}>
                    <TableCell className="font-mono">{admin.phone}</TableCell>
                    <TableCell>{admin.name?.trim() || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="default">مسؤول</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{admin.email ?? "—"}</TableCell>
                    <TableCell>{admin._count.orders}</TableCell>
                    <TableCell>{formatDateEn(admin.createdAt)}</TableCell>
                    <TableCell className="text-left">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/admin/clients/${admin.id}`}>عرض الملف</Link>
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
