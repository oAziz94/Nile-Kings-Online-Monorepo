"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { User, MapPin, Package } from "lucide-react";
import { formatDateEn } from "@/lib/format-en-numbers";
import { piastresToEgp } from "@/lib/catalog";
import { formatNumberEn } from "@/lib/format-en-numbers";

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

export default function AdminClientProfilePage() {
  const params = useParams();
  const id = params.id as string;
  const { toast } = useToast();
  const [client, setClient] = React.useState<ClientProfile | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!id) return;
    fetch(`/api/admin/clients/${id}`, { credentials: "include" })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: ClientProfile }) => {
        if (json?.success && json.data) setClient(json.data);
      })
      .catch(() => toast({ title: "فشل تحميل ملف العميل", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [id, toast]);

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
    </div>
  );
}
