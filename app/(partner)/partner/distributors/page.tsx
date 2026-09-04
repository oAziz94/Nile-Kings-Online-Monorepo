"use client";

import * as React from "react";
import { Loader2, RefreshCw, Users } from "lucide-react";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader, StatusBadge } from "@/components/dashboard/page-header";
import { PanelCard } from "@/components/dashboard/panel-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
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

function ContactLink({ href, label }: { href: string | null; label: string }) {
  if (!href) return null;
  return (
    <a className="text-xs font-medium text-burgundy hover:underline" href={href} target="_blank" rel="noreferrer">
      {label}
    </a>
  );
}

export default function PartnerDistributorsPage() {
  const { toast } = useToast();
  const [distributors, setDistributors] = React.useState<Distributor[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [fetching, setFetching] = React.useState(false);

  const load = React.useCallback(async () => {
    setFetching(true);
    try {
      const res = await fetch("/api/partner/distributors", { credentials: "include" });
      const json = await res.json();
      if (res.ok && json?.success) {
        setDistributors(json.data.distributors ?? []);
      } else {
        toast({ title: json?.error?.message ?? "فشل تحميل الموزعين", variant: "destructive" });
      }
    } catch (error) {
      toast({
        title: "فشل تحميل الموزعين",
        description: error instanceof Error ? error.message : "خطأ غير متوقع",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setFetching(false);
    }
  }, [toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="ml-2 h-4 w-4 animate-spin" />
        جاري تحميل الموزعين
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="الموزعون"
        description="الموزعون المرتبطون بحسابك وبيانات التواصل والمخزون المختصر."
        badge={<StatusBadge>وكلاء فقط</StatusBadge>}
        actions={
          <Button type="button" variant="outline" className="rounded-xl" onClick={load} disabled={fetching}>
            <RefreshCw className={cn("h-4 w-4", fetching && "animate-spin")} />
            تحديث
          </Button>
        }
      />

      <PanelCard title="الموزعون المرتبطون" icon={<Users className="h-5 w-5 text-burgundy" />}>
        {distributors.length === 0 ? (
          <EmptyState icon={<Users className="h-12 w-12" />} title="لا يوجد موزعون مرتبطون بعد" />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <Table className={cn(fetching && "opacity-70")}>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>الاسم</TableHead>
                  <TableHead>المحافظة</TableHead>
                  <TableHead>الهاتف</TableHead>
                  <TableHead>البريد</TableHead>
                  <TableHead>التواصل</TableHead>
                  <TableHead>المخزون</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>تاريخ الربط</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {distributors.map((distributor) => (
                  <TableRow key={distributor.id}>
                    <TableCell className="font-medium">{distributor.name}</TableCell>
                    <TableCell>{distributor.governorate}</TableCell>
                    <TableCell dir="ltr" className="text-right font-mono text-sm">
                      {distributor.phone}
                    </TableCell>
                    <TableCell>{distributor.user?.email ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <ContactLink href={distributor.facebookUrl} label="Facebook" />
                        <ContactLink href={distributor.instagramUrl} label="Instagram" />
                        <ContactLink href={distributor.tiktokUrl} label="TikTok" />
                        <ContactLink href={distributor.youtubeUrl} label="YouTube" />
                        <ContactLink href={distributor.websiteUrl} label="Website" />
                        <ContactLink href={distributor.otherUrl} label="Other" />
                        {!distributor.facebookUrl &&
                          !distributor.instagramUrl &&
                          !distributor.tiktokUrl &&
                          !distributor.youtubeUrl &&
                          !distributor.websiteUrl &&
                          !distributor.otherUrl &&
                          "—"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 text-xs">
                        <p>متاح: {formatNumberEn(distributor.inventoryTotals.available)}</p>
                        <p>محجوز: {formatNumberEn(distributor.inventoryTotals.reserved)}</p>
                        <p>قابل للبيع: {formatNumberEn(distributor.inventoryTotals.sellable)}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={distributor.isActive ? "success" : "secondary"}>
                        {distributor.isActive ? "نشط" : "معطّل"}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDateEn(distributor.createdAt)}</TableCell>
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
