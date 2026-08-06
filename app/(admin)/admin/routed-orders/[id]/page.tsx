"use client";

import * as React from "react";
import { useParams } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/shared/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Upload } from "lucide-react";
import { formatDateEn } from "@/lib/format-en-numbers";

const ROUTED_STATUSES = [
  "ASSIGNED",
  "NOTIFIED",
  "ACCEPTED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "FAILED",
  "CANCELLED",
  "UNROUTED",
] as const;

const ROUTED_STATUS_LABELS: Record<string, string> = {
  ASSIGNED: "مُعيَّن",
  NOTIFIED: "تم الإشعار",
  ACCEPTED: "مقبول",
  OUT_FOR_DELIVERY: "خارج للتوصيل",
  DELIVERED: "تم التسليم",
  FAILED: "فشل",
  CANCELLED: "ملغي",
  UNROUTED: "غير موجه",
};

const MODE_LABELS: Record<string, string> = { AUTO: "تلقائي", MANUAL: "يدوي" };

type RoutedOrderDetail = {
  id: string;
  orderId: string;
  governorate: string;
  ruleId: string | null;
  partnerId: string | null;
  assignmentSequence: number;
  assignmentMode: string;
  status: string;
  notifiedAt: string | null;
  assignedAt: string;
  acceptedAt: string | null;
  deliveredAt: string | null;
  proofImageUrl: string | null;
  proofImagePublicId: string | null;
  notes: string | null;
  notificationError: string | null;
  order: {
    id: string;
    totalPiastres: number;
    createdAt: string;
    user: { phone: string; name: string | null };
    items: { productName: string; variantName: string; quantity: number; totalPiastres: number }[];
  };
  partner: { id: string; name: string; phone: string; partnerType: string } | null;
  rule: { id: string; governorate: string } | null;
};

export default function AdminRoutedOrderDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { toast } = useToast();
  const [routed, setRouted] = React.useState<RoutedOrderDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [updating, setUpdating] = React.useState(false);
  const [status, setStatus] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [proofUrl, setProofUrl] = React.useState("");
  const [proofPublicId, setProofPublicId] = React.useState("");
  const [proofUploading, setProofUploading] = React.useState(false);
  const [reassignOpen, setReassignOpen] = React.useState(false);
  const [reassignPartnerId, setReassignPartnerId] = React.useState("");
  const [reassignNotes, setReassignNotes] = React.useState("");
  const [reassignLoading, setReassignLoading] = React.useState(false);
  const [partners, setPartners] = React.useState<{ id: string; name: string; phone: string; partnerType: string }[]>([]);
  const proofInputRef = React.useRef<HTMLInputElement>(null);

  const fetchDetail = React.useCallback(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/admin/routed-orders/${id}`, { credentials: "include" })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: RoutedOrderDetail }) => {
        if (json?.success && json.data) {
          setRouted(json.data);
          setStatus(json.data.status);
          setNotes(json.data.notes ?? "");
          setProofUrl(json.data.proofImageUrl ?? "");
          setProofPublicId(json.data.proofImagePublicId ?? "");
        }
      })
      .catch(() => toast({ title: "فشل تحميل السجل", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [id, toast]);

  React.useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  React.useEffect(() => {
    if (!reassignOpen) return;
    Promise.all([
      fetch("/api/admin/partners?partnerType=AGENT&limit=100", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/admin/partners?partnerType=DISTRIBUTOR&limit=100", { credentials: "include" }).then((r) => r.json()),
    ]).then(([a, b]) => {
      const list = [...(a?.data?.partners ?? []), ...(b?.data?.partners ?? [])];
      setPartners(list);
      if (!reassignPartnerId && list.length) setReassignPartnerId(list[0]?.id ?? "");
    });
  }, [reassignOpen]);

  const saveStatus = async () => {
    if (!routed || status === routed.status) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/admin/routed-orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        setRouted(json.data);
        toast({ title: "تم تحديث الحالة" });
      } else toast({ title: json?.error?.message ?? "فشل التحديث", variant: "destructive" });
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setUpdating(false);
    }
  };

  const saveNotes = async () => {
    setUpdating(true);
    try {
      const res = await fetch(`/api/admin/routed-orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ notes: notes.trim() || null }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        setRouted(json.data);
        toast({ title: "تم حفظ الملاحظات" });
      } else toast({ title: json?.error?.message ?? "فشل", variant: "destructive" });
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setUpdating(false);
    }
  };

  const saveProof = async () => {
    if (!proofUrl.trim()) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/admin/routed-orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ proofImageUrl: proofUrl.trim(), proofImagePublicId: proofPublicId || null }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        setRouted(json.data);
        toast({ title: "تم حفظ صورة الإثبات" });
      } else toast({ title: json?.error?.message ?? "فشل", variant: "destructive" });
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setUpdating(false);
    }
  };

  const handleProofFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const type = file.type.toLowerCase();
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowed.includes(type)) {
      toast({ title: "نوع الملف غير مدعوم. استخدم JPG أو PNG أو WebP", variant: "destructive" });
      return;
    }
    setProofUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(buf).reduce((acc, byte) => acc + String.fromCharCode(byte), "")
      );
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          image: `data:${file.type};base64,${base64}`,
          contentType: file.type,
          folder: "routed-proofs",
        }),
      });
      const json = await res.json();
      if (res.ok && json?.data?.url) {
        setProofUrl(json.data.url);
        if (json.data.publicId) setProofPublicId(json.data.publicId);
        toast({ title: "تم رفع الصورة. احفظ لتسجيلها في السجل." });
      } else toast({ title: json?.error?.message ?? "فشل الرفع", variant: "destructive" });
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setProofUploading(false);
      e.target.value = "";
    }
  };

  const doReassign = async () => {
    if (!reassignPartnerId.trim()) return;
    setReassignLoading(true);
    try {
      const res = await fetch(`/api/admin/routed-orders/${id}/reassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ partnerId: reassignPartnerId.trim(), notes: reassignNotes.trim() || undefined }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        setRouted(json.data);
        setReassignOpen(false);
        toast({ title: "تم إعادة التعيين" });
      } else toast({ title: json?.error?.message ?? "فشل إعادة التعيين", variant: "destructive" });
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setReassignLoading(false);
    }
  };

  if (loading || !routed) return <Skeleton className="h-96 w-full rounded-2xl" />;

  return (
    <div dir="rtl" className="space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/admin/routed-orders">← الطلبات الموجهة</Link>
      </Button>
      <h1 className="text-2xl font-bold">طلب موجه #{routed.orderId.slice(-8)}</h1>

      <Card>
        <CardHeader>
          <CardTitle>الحالة والملاحظات</CardTitle>
          <CardDescription>تحديث حالة التوجيه وإثبات التسليم.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="grid gap-2">
              <Label>حالة التوجيه</Label>
              <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-48">
                {ROUTED_STATUSES.map((s) => (
                  <option key={s} value={s}>{ROUTED_STATUS_LABELS[s]}</option>
                ))}
              </Select>
            </div>
            <Button onClick={saveStatus} disabled={updating || status === routed.status}>
              {updating ? "جاري…" : "حفظ الحالة"}
            </Button>
            <Badge variant="outline">{ROUTED_STATUS_LABELS[routed.status] ?? routed.status}</Badge>
          </div>
          <div className="grid gap-2">
            <Label>ملاحظات</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ملاحظات إضافية"
              className="max-w-md"
            />
            <Button variant="outline" size="sm" onClick={saveNotes} disabled={updating}>
              حفظ الملاحظات
            </Button>
          </div>
        </CardContent>
      </Card>

      {routed.notificationError && (
        <Card className="border-amber-500 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-600">
          <CardHeader>
            <CardTitle className="text-amber-800 dark:text-amber-200">لم يُرسل إشعار واتساب</CardTitle>
            <CardDescription>
              تم تعيين الطلب للشريك لكن إرسال رسالة واتساب فشل. تأكد من ضبط WAPILOT_INSTANCE_ID و WAPILOT_API_TOKEN.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-amber-900 dark:text-amber-100 font-mono break-all">{routed.notificationError}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>إثبات التسليم (صورة)</CardTitle>
          <CardDescription>رفع صورة إثبات (JPG, PNG, WebP) وحفظ الرابط في السجل.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {proofUrl && (
            <div className="rounded-2xl border overflow-hidden inline-block">
              <img src={proofUrl} alt="إثبات" className="max-h-48 object-contain" />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <input
              ref={proofInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleProofFile}
              disabled={proofUploading}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => proofInputRef.current?.click()}
              disabled={proofUploading}
            >
              <Upload className="ml-2 h-4 w-4" />
              {proofUploading ? "جاري الرفع…" : "رفع صورة"}
            </Button>
            <Input
              placeholder="أو الصق رابط الصورة"
              value={proofUrl}
              onChange={(e) => setProofUrl(e.target.value)}
              className="max-w-sm"
            />
            <Button onClick={saveProof} disabled={updating || !proofUrl.trim()}>
              حفظ صورة الإثبات
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>التعيين</CardTitle>
          <CardDescription>الشريك المُعيَّن وطريقة التعيين. يمكن إعادة التعيين يدوياً.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <p><strong>المحافظة:</strong> {routed.governorate}</p>
          <p><strong>الشريك:</strong> {routed.partner ? `${routed.partner.name} (${routed.partner.phone})` : "—"}</p>
          <p><strong>نوع الشريك:</strong> {routed.partner ? (routed.partner.partnerType === "AGENT" ? "وكيل" : "موزع") : "—"}</p>
          <p><strong>طريقة التعيين:</strong> {MODE_LABELS[routed.assignmentMode] ?? routed.assignmentMode}</p>
          <p><strong>تاريخ التعيين:</strong> {formatDateEn(routed.assignedAt)}</p>
          {routed.notifiedAt && <p><strong>تاريخ الإشعار:</strong> {formatDateEn(routed.notifiedAt)}</p>}
          <Button variant="outline" size="sm" onClick={() => setReassignOpen(true)}>
            إعادة تعيين يدوي
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>تفاصيل الطلب</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p><strong>العميل:</strong> {routed.order?.user?.name ?? "—"} ({routed.order?.user?.phone})</p>
          <p><strong>الإجمالي:</strong> {((routed.order?.totalPiastres ?? 0) / 100).toFixed(0)} ج.م</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>المنتج / المتغير</TableHead>
                <TableHead>الكمية</TableHead>
                <TableHead>الإجمالي</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(routed.order?.items ?? []).map((item, i) => (
                <TableRow key={i}>
                  <TableCell>{item.productName} – {item.variantName}</TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>{(item.totalPiastres / 100).toFixed(0)} ج.م</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/admin/orders/${routed.orderId}`}>فتح الطلب الأصلي</Link>
          </Button>
        </CardContent>
      </Card>

      <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إعادة تعيين الشريك</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>الشريك الجديد</Label>
              <Select value={reassignPartnerId} onChange={(e) => setReassignPartnerId(e.target.value)}>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} – {p.phone} ({p.partnerType === "AGENT" ? "وكيل" : "موزع"})
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>ملاحظة (اختياري)</Label>
              <Input
                value={reassignNotes}
                onChange={(e) => setReassignNotes(e.target.value)}
                placeholder="سبب إعادة التعيين"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassignOpen(false)}>إلغاء</Button>
            <Button onClick={doReassign} disabled={reassignLoading || !reassignPartnerId}>
              {reassignLoading ? "جاري…" : "إعادة التعيين"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
