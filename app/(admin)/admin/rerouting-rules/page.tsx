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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/shared/skeleton";
import { Route, Plus } from "lucide-react";

type Rule = {
  id: string;
  governorate: string;
  isActive: boolean;
  lastAssignedPartnerId: string | null;
  _count: { partners: number };
  lastAssignedPartner: { id: string; name: string; phone: string; partnerType: string } | null;
};

export default function AdminReroutingRulesPage() {
  const [rules, setRules] = React.useState<Rule[]>([]);
  const [loading, setLoading] = React.useState(true);
  const { toast } = useToast();

  const fetchRules = React.useCallback(() => {
    setLoading(true);
    fetch("/api/admin/rerouting-rules", { credentials: "include" })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: { rules: Rule[] } }) => {
        if (json?.success && json.data) setRules(json.data.rules);
      })
      .catch(() => toast({ title: "فشل تحميل قواعد التوجيه", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [toast]);

  React.useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  if (loading) return <Skeleton className="h-64 w-full rounded-2xl" />;

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">قواعد التوجيه</h1>
        <Button asChild>
          <Link href="/admin/rerouting-rules/new">
            <Plus className="ml-2 h-4 w-4" />
            قاعدة جديدة
          </Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>قواعد التوجيه حسب المحافظة</CardTitle>
          <CardDescription>
            تعيين الطلبات للشركاء حسب محافظة العميل (دوران round-robin). تفعيل/إلغاء القاعدة وإدارة الشركاء من صفحة التفاصيل.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 py-16 text-center">
              <Route className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-2">لا توجد قواعد توجيه</p>
              <Button asChild variant="outline">
                <Link href="/admin/rerouting-rules/new">إضافة قاعدة</Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>المحافظة</TableHead>
                  <TableHead>عدد الشركاء</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>آخر شريك مُعيَّن</TableHead>
                  <TableHead className="text-left">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.governorate}</TableCell>
                    <TableCell>{r._count.partners}</TableCell>
                    <TableCell>
                      <Badge variant={r.isActive ? "default" : "secondary"}>
                        {r.isActive ? "مفعّل" : "معطّل"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {r.lastAssignedPartner
                        ? `${r.lastAssignedPartner.name} (${r.lastAssignedPartner.partnerType === "AGENT" ? "وكيل" : "موزع"})`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-left">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/admin/rerouting-rules/${r.id}`}>تفاصيل / تعديل</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
