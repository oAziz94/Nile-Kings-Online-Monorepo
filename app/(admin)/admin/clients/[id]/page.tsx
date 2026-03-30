"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { User, MapPin, Package, Loader2, Pencil } from "lucide-react";
import { formatDateEn } from "@/lib/format-en-numbers";
import { piastresToEgp } from "@/lib/catalog";
import { formatNumberEn } from "@/lib/format-en-numbers";
import { GOVERNORATE_OPTIONS } from "@/lib/services/shipping";

const STATUS_LABELS: Record<string, string> = {
  CREATED: "قيد الانشاء",
  CONFIRMED: "مؤكد",
  PROCESSING: "قيد التجهيز",
  READY_TO_SHIP: "جاهز للشحن",
  SHIPPED: "تم الشحن",
  DELIVERED: "تم التسليم",
  CANCELLED: "ملغي",
};

type SavedAddress = {
  id: string;
  label: string | null;
  governorate: string;
  city: string | null;
  area: string | null;
  street: string;
  building: string | null;
  floor: string | null;
  apartment: string | null;
  notes: string | null;
  phone: string;
  isDefault: boolean;
};

type OrderSummary = {
  id: string;
  status: string;
  totalPiastres: number;
  paymentMethod: string;
  createdAt: string;
};

type ClientProfile = {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  seniorVerified: boolean;
  createdAt: string;
  updatedAt: string;
  savedAddresses: SavedAddress[];
  orders: OrderSummary[];
  _count: { orders: number };
};

type AddressForm = {
  label: string;
  governorate: string;
  area: string;
  street: string;
  notes: string;
  phone: string;
  isDefault: boolean;
};

export default function AdminClientProfilePage() {
  const params = useParams();
  const id = params.id as string;
  const { toast } = useToast();
  const [client, setClient] = React.useState<ClientProfile | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [editingAddressId, setEditingAddressId] = React.useState<string | null>(null);
  const [addressForm, setAddressForm] = React.useState<AddressForm | null>(null);
  const [savingAddress, setSavingAddress] = React.useState(false);

  const loadClient = React.useCallback(() => {
    if (!id) return;
    fetch(`/api/admin/clients/${id}`, { credentials: "include" })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: ClientProfile }) => {
        if (json?.success && json.data) setClient(json.data);
      })
      .catch(() => toast({ title: "فشل تحميل ملف العميل", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [id, toast]);

  React.useEffect(() => {
    loadClient();
  }, [loadClient]);

  const openAddressEditor = (addr: SavedAddress) => {
    setEditingAddressId(addr.id);
    setAddressForm({
      label: addr.label ?? "",
      governorate: addr.governorate ?? "",
      area: addr.area ?? "",
      street: addr.street ?? "",
      notes: addr.notes ?? "",
      phone: addr.phone ?? "",
      isDefault: addr.isDefault,
    });
  };

  const closeAddressEditor = () => {
    setEditingAddressId(null);
    setAddressForm(null);
    setSavingAddress(false);
  };

  const saveAddress = () => {
    if (!editingAddressId || !addressForm) return;
    if (!addressForm.governorate.trim() || !addressForm.area.trim() || !addressForm.street.trim() || !addressForm.phone.trim()) {
      toast({ title: "المحافظة والمنطقة والعنوان ورقم الهاتف مطلوبة", variant: "destructive" });
      return;
    }

    setSavingAddress(true);
    fetch(`/api/admin/clients/${id}/addresses/${editingAddressId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        label: addressForm.label.trim() || null,
        governorate: addressForm.governorate.trim(),
        area: addressForm.area.trim(),
        street: addressForm.street.trim(),
        notes: addressForm.notes.trim() || null,
        phone: addressForm.phone.trim(),
        isDefault: addressForm.isDefault,
      }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json?.success) {
          toast({ title: "تم تحديث العنوان" });
          closeAddressEditor();
          loadClient();
        } else {
          toast({ title: json?.error?.message ?? "فشل تحديث العنوان", variant: "destructive" });
        }
      })
      .catch(() => toast({ title: "فشل تحديث العنوان", variant: "destructive" }))
      .finally(() => setSavingAddress(false));
  };

  if (loading || !client) return <Skeleton className="h-96 w-full rounded-2xl" />;

  const displayName = client.name?.trim() || client.phone || "عميل";

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/clients">← العملاء</Link>
        </Button>
        <h1 className="text-2xl font-bold">ملف العميل</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            البيانات الأساسية
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p>
            <strong>الهاتف:</strong> <span className="font-mono">{client.phone}</span>
          </p>
          <p>
            <strong>الاسم:</strong> {displayName}
            {client.seniorVerified && (
              <Badge variant="secondary" className="mr-2 text-xs">
                كبار سن
              </Badge>
            )}
          </p>
          {client.email && (
            <p>
              <strong>البريد:</strong> {client.email}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            تاريخ التسجيل: {formatDateEn(client.createdAt)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            العناوين المحفوظة ({client.savedAddresses.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {client.savedAddresses.length === 0 ? (
            <p className="text-muted-foreground">لا توجد عناوين محفوظة.</p>
          ) : (
            <ul className="space-y-3">
              {client.savedAddresses.map((addr) => (
                <li
                  key={addr.id}
                  className="rounded-xl border border-border bg-muted/30 p-4 text-sm"
                >
                  {addr.label && (
                    <span className="font-medium text-foreground">{addr.label}</span>
                  )}
                  {addr.isDefault && (
                    <Badge variant="outline" className="mr-2 text-xs">
                      افتراضي
                    </Badge>
                  )}
                  <p className="mt-1 text-muted-foreground">
                    {addr.governorate}
                    {addr.city ? `، ${addr.city}` : ""}
                    {addr.area ? `، ${addr.area}` : ""} – {addr.street}
                    {addr.building ? `، مبنى ${addr.building}` : ""}
                    {addr.floor ? `، ط ${addr.floor}` : ""}
                    {addr.apartment ? `، شقة ${addr.apartment}` : ""}
                  </p>
                  <p className="mt-0.5 text-muted-foreground">هاتف العنوان: {addr.phone}</p>
                  {addr.notes && (
                    <p className="mt-0.5 text-muted-foreground">ملاحظات: {addr.notes}</p>
                  )}
                  <div className="mt-3">
                    <Button variant="outline" size="sm" onClick={() => openAddressEditor(addr)}>
                      <Pencil className="ml-1 h-4 w-4" />
                      تعديل العنوان
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            الطلبات ({client._count.orders})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {client.orders.length === 0 ? (
            <p className="text-muted-foreground">لا توجد طلبات.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الرقم</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>الإجمالي</TableHead>
                  <TableHead>التاريخ</TableHead>
                  <TableHead className="text-left">رابط</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {client.orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-sm">{o.id.slice(0, 8)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{STATUS_LABELS[o.status] ?? o.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {formatNumberEn(piastresToEgp(o.totalPiastres))} ج.م
                    </TableCell>
                    <TableCell>{formatDateEn(o.createdAt)}</TableCell>
                    <TableCell className="text-left">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/admin/orders/${o.id}`}>عرض الطلب</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {client._count.orders > client.orders.length && (
            <p className="mt-4 text-sm text-muted-foreground">
              عرض آخر {client.orders.length} طلب من إجمالي {client._count.orders}
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editingAddressId} onOpenChange={(open) => !open && closeAddressEditor()}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل عنوان محفوظ</DialogTitle>
          </DialogHeader>
          {addressForm && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">وصف العنوان</label>
                <Input
                  value={addressForm.label}
                  onChange={(e) => setAddressForm((s) => (s ? { ...s, label: e.target.value } : s))}
                  placeholder="المنزل / العمل"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">المحافظة *</label>
                <select
                  value={addressForm.governorate}
                  onChange={(e) => setAddressForm((s) => (s ? { ...s, governorate: e.target.value } : s))}
                  className="flex h-10 w-full rounded-xl border border-input bg-background px-4 py-2 text-sm"
                  required
                  dir="rtl"
                >
                  <option value="">اختر المحافظة</option>
                  {GOVERNORATE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">المنطقة *</label>
                <Input
                  value={addressForm.area}
                  onChange={(e) => setAddressForm((s) => (s ? { ...s, area: e.target.value } : s))}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium">العنوان بالتفصيل *</label>
                <Input
                  value={addressForm.street}
                  onChange={(e) => setAddressForm((s) => (s ? { ...s, street: e.target.value } : s))}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">هاتف التوصيل *</label>
                <Input
                  type="tel"
                  value={addressForm.phone}
                  onChange={(e) => setAddressForm((s) => (s ? { ...s, phone: e.target.value } : s))}
                  dir="ltr"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium">ملاحظات (اختياري)</label>
                <Input
                  value={addressForm.notes}
                  onChange={(e) => setAddressForm((s) => (s ? { ...s, notes: e.target.value } : s))}
                  placeholder="أي ملاحظات للتوصيل"
                />
              </div>
              <label className="sm:col-span-2 flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={addressForm.isDefault}
                  onChange={(e) => setAddressForm((s) => (s ? { ...s, isDefault: e.target.checked } : s))}
                  className="rounded border-input"
                />
                اجعل هذا العنوان افتراضي
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeAddressEditor} disabled={savingAddress}>
              إلغاء
            </Button>
            <Button onClick={saveAddress} disabled={savingAddress || !addressForm}>
              {savingAddress ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : null}
              حفظ التغييرات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
