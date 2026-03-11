"use client";

import * as React from "react";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/shared/skeleton";
import { Users, Search } from "lucide-react";
import { formatDateEn } from "@/lib/format-en-numbers";

type Client = {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  seniorVerified: boolean;
  createdAt: string;
  _count: { orders: number; savedAddresses: number };
};

export default function AdminClientsPage() {
  const [clients, setClients] = React.useState<Client[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [debouncedQ, setDebouncedQ] = React.useState("");
  const { toast } = useToast();

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  React.useEffect(() => {
    const params = new URLSearchParams({ limit: "30" });
    if (debouncedQ) params.set("q", debouncedQ);
    fetch(`/api/admin/clients?${params}`, { credentials: "include" })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: { clients: Client[]; total: number } }) => {
        if (json?.success && json.data) {
          setClients(json.data.clients);
          setTotal(json.data.total);
        }
      })
      .catch(() => toast({ title: "فشل تحميل العملاء", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [debouncedQ, toast]);

  if (loading && clients.length === 0) return <Skeleton className="h-64 w-full rounded-2xl" />;

  return (
    <div dir="rtl" className="space-y-6">
      <h1 className="text-2xl font-bold">العملاء</h1>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle>قائمة العملاء</CardTitle>
            <CardDescription>عرض العملاء وملفاتهم الشخصية (الاسم، الهاتف، العناوين، الطلبات).</CardDescription>
          </div>
          <div className="relative w-64">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="بحث بالهاتف أو الاسم أو البريد..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {clients.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 py-16 text-center">
              <Users className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="mb-2 text-muted-foreground">
                {debouncedQ ? "لا توجد نتائج للبحث" : "لا يوجد عملاء"}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
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
          )}
          {total > clients.length && (
            <p className="mt-4 text-sm text-muted-foreground">
              عرض {clients.length} من {total}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
