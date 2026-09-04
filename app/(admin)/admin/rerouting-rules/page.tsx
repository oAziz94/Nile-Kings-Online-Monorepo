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
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { PanelCard } from "@/components/dashboard/panel-card";
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
    <div className="space-y-6">
      <PageHeader
        title="قواعد التوجيه"
        description="تعيين الطلبات للشركاء حسب المحافظة (round-robin)."
        actions={
          <Button asChild className="rounded-xl">
            <Link href="/admin/rerouting-rules/new">
              <Plus className="ml-2 h-4 w-4" />
              قاعدة جديدة
            </Link>
          </Button>
        }
      />
      <PanelCard
        title="قواعد التوجيه حسب المحافظة"
        icon={<Route className="h-5 w-5 text-burgundy" />}
      >
          {rules.length === 0 ? (
            <EmptyState
              icon={<Route className="h-12 w-12" />}
              title="لا توجد قواعد توجيه"
              description="أنشئ قاعدة لربط المحافظات بالشركاء."
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border/60">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
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
            </div>
          )}
      </PanelCard>
    </div>
  );
}
