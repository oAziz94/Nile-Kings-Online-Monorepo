"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
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
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/shared/skeleton";
import { TableScroll } from "@/components/dashboard/table-scroll";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

type PartnerLink = {
  id: string;
  partnerId: string;
  isActive: boolean;
  priority: number | null;
  partner: { id: string; name: string; phone: string; partnerType: string; governorate: string };
};

type Rule = {
  id: string;
  governorate: string;
  isActive: boolean;
  lastAssignedPartner: { id: string; name: string; phone: string; partnerType: string } | null;
  partners: PartnerLink[];
};

type PartnerOption = { id: string; name: string; phone: string; partnerType: string; governorate: string };

export default function AdminReroutingRuleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { toast } = useToast();
  const [rule, setRule] = React.useState<Rule | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [updating, setUpdating] = React.useState(false);
  const [addPartnerOpen, setAddPartnerOpen] = React.useState(false);
  const [partnerOptions, setPartnerOptions] = React.useState<PartnerOption[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = React.useState("");
  const [addPartnerLoading, setAddPartnerLoading] = React.useState(false);

  const fetchRule = React.useCallback(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/admin/rerouting-rules/${id}`, { credentials: "include" })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: Rule }) => {
        if (json?.success && json.data) setRule(json.data);
      })
      .catch(() => toast({ title: "فشل تحميل القاعدة", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [id, toast]);

  React.useEffect(() => {
    fetchRule();
  }, [fetchRule]);

  // Load partner options on page load so "Add Partner" button state is correct (not disabled)
  React.useEffect(() => {
    Promise.all([
      fetch("/api/admin/partners?partnerType=AGENT&limit=100", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/admin/partners?partnerType=DISTRIBUTOR&limit=100", { credentials: "include" }).then((r) => r.json()),
    ]).then(([a, b]) => {
      const agents = (a?.data?.partners ?? []) as PartnerOption[];
      const distributors = (b?.data?.partners ?? []) as PartnerOption[];
      setPartnerOptions([...agents, ...distributors]);
    });
  }, []);

  const updateRuleActive = async (isActive: boolean) => {
    setUpdating(true);
    try {
      const res = await fetch(`/api/admin/rerouting-rules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isActive }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        setRule(json.data);
        toast({ title: "تم تحديث الحالة" });
      } else toast({ title: json?.error?.message ?? "فشل التحديث", variant: "destructive" });
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setUpdating(false);
    }
  };

  const togglePartnerActive = async (linkId: string, isActive: boolean) => {
    try {
      const res = await fetch(`/api/admin/rerouting-rules/${id}/partners/${linkId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isActive }),
      });
      if (res.ok) {
        fetchRule();
        toast({ title: isActive ? "تم تفعيل الشريك" : "تم إيقاف الشريك" });
      } else {
        const json = await res.json();
        toast({ title: json?.error?.message ?? "فشل", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    }
  };

  const removePartner = async (linkId: string) => {
    try {
      const res = await fetch(`/api/admin/rerouting-rules/${id}/partners/${linkId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        fetchRule();
        toast({ title: "تم إزالة الشريك من القاعدة" });
      } else toast({ title: "فشل الحذف", variant: "destructive" });
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    }
  };

  const addPartner = async () => {
    if (!selectedPartnerId.trim()) return;
    setAddPartnerLoading(true);
    try {
      const res = await fetch(`/api/admin/rerouting-rules/${id}/partners`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ partnerId: selectedPartnerId.trim() }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        setAddPartnerOpen(false);
        setSelectedPartnerId("");
        fetchRule();
        toast({ title: "تم إضافة الشريك" });
      } else toast({ title: json?.error?.message ?? "فشل الإضافة", variant: "destructive" });
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setAddPartnerLoading(false);
    }
  };

  if (loading || !rule) return <Skeleton className="h-96 w-full rounded-2xl" />;

  const linkedIds = new Set(rule.partners.map((p) => p.partnerId));
  const availableOptions = partnerOptions.filter((p) => !linkedIds.has(p.id));

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">قاعدة التوجيه: {rule.governorate}</h1>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/rerouting-rules">← قواعد التوجيه</Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>الحالة</CardTitle>
            <CardDescription>تفعيل أو إيقاف القاعدة يؤثر على توجيه الطلبات الجديدة لهذه المحافظة.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={rule.isActive ? "default" : "secondary"}>{rule.isActive ? "مفعّل" : "معطّل"}</Badge>
            <Select
              value={rule.isActive ? "true" : "false"}
              onChange={(e) => updateRuleActive(e.target.value === "true")}
              disabled={updating}
              className="w-32"
            >
              <option value="true">مفعّل</option>
              <option value="false">معطّل</option>
            </Select>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>الشركاء المرتبطين</CardTitle>
            <CardDescription>يتم توزيع الطلبات عليهم بدوران (round-robin). آخر شريك مُعيَّن: {rule.lastAssignedPartner ? rule.lastAssignedPartner.name : "—"}</CardDescription>
          </div>
          <Button onClick={() => setAddPartnerOpen(true)} disabled={availableOptions.length === 0}>
            إضافة شريك
          </Button>
        </CardHeader>
        <CardContent>
          {rule.partners.length === 0 ? (
            <p className="text-muted-foreground py-4">لا يوجد شركاء. أضف شركاء لتفعيل التوجيه التلقائي.</p>
          ) : (
            <TableScroll>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الاسم</TableHead>
                  <TableHead>الهاتف</TableHead>
                  <TableHead>النوع</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="text-left">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rule.partners.map((link) => (
                  <TableRow key={link.id}>
                    <TableCell>{link.partner.name}</TableCell>
                    <TableCell>{link.partner.phone}</TableCell>
                    <TableCell>{link.partner.partnerType === "AGENT" ? "وكيل" : "موزع"}</TableCell>
                    <TableCell>
                      <Badge variant={link.isActive ? "default" : "secondary"}>
                        {link.isActive ? "مفعّل" : "معطّل"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-left">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => togglePartnerActive(link.id, !link.isActive)}
                      >
                        {link.isActive ? "إيقاف" : "تفعيل"}
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => removePartner(link.id)}>
                        إزالة
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </TableScroll>
          )}
        </CardContent>
      </Card>

      <Dialog open={addPartnerOpen} onOpenChange={setAddPartnerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إضافة شريك للقاعدة</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 py-4">
            <Label>الشريك</Label>
            <Select value={selectedPartnerId} onChange={(e) => setSelectedPartnerId(e.target.value)}>
              <option value="">— اختر —</option>
              {availableOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} – {p.phone} ({p.partnerType === "AGENT" ? "وكيل" : "موزع"})
                </option>
              ))}
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddPartnerOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={addPartner} disabled={!selectedPartnerId || addPartnerLoading}>
              {addPartnerLoading ? "جاري…" : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
