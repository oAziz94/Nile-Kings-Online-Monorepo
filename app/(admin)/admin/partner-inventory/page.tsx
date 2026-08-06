"use client";

import * as React from "react";
import { Boxes, Loader2, PackageSearch, Save, Search } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPanelCard } from "@/components/admin/admin-panel-card";
import { AdminTableScroll } from "@/components/admin/admin-table-scroll";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

type PartnerOption = {
  id: string;
  name: string;
  phone: string;
  partnerType: string;
  governorate: string;
};

type ProductOption = {
  id: string;
  name: string;
  slug: string;
  variants: {
    id: string;
    sku: string;
    name: string;
    colorName: string | null;
  }[];
};

type InventoryRow = {
  id: string;
  partnerId: string;
  variantId: string;
  stockAvailable: number;
  stockReserved: number;
  partner: PartnerOption;
  variant: {
    id: string;
    sku: string;
    name: string;
    colorName: string | null;
    product: { id: string; name: string; slug: string };
  };
};

function variantLabel(v: { sku: string; name: string; colorName: string | null }) {
  return `${v.sku} · ${v.name}${v.colorName ? ` · ${v.colorName}` : ""}`;
}

export default function AdminPartnerInventoryPage() {
  const { toast } = useToast();
  const [partners, setPartners] = React.useState<PartnerOption[]>([]);
  const [products, setProducts] = React.useState<ProductOption[]>([]);
  const [inventory, setInventory] = React.useState<InventoryRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [partnerId, setPartnerId] = React.useState("");
  const [productId, setProductId] = React.useState("");
  const [variantId, setVariantId] = React.useState("");
  const [available, setAvailable] = React.useState("");
  const [reserved, setReserved] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [query, setQuery] = React.useState("");

  const selectedProduct = products.find((product) => product.id === productId);
  const variants = selectedProduct?.variants ?? [];

  const loadOptions = React.useCallback(async () => {
    const [agentsRes, distributorsRes, productsRes] = await Promise.all([
      fetch("/api/admin/partners?partnerType=AGENT&limit=200", { credentials: "include" }),
      fetch("/api/admin/partners?partnerType=DISTRIBUTOR&limit=200", { credentials: "include" }),
      fetch("/api/admin/products?limit=100&active=true", { credentials: "include" }),
    ]);
    const [agentsJson, distributorsJson, productsJson] = await Promise.all([
      agentsRes.json(),
      distributorsRes.json(),
      productsRes.json(),
    ]);
    setPartners([
      ...(agentsJson?.data?.partners ?? []),
      ...(distributorsJson?.data?.partners ?? []),
    ]);
    setProducts(productsJson?.data?.products ?? []);
  }, []);

  const loadInventory = React.useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "200" });
    if (partnerId) params.set("partnerId", partnerId);
    if (variantId) params.set("variantId", variantId);
    const res = await fetch(`/api/admin/partner-inventory?${params}`, { credentials: "include" });
    const json = await res.json();
    if (json?.success) setInventory(json.data.inventory ?? []);
    setLoading(false);
  }, [partnerId, variantId]);

  React.useEffect(() => {
    loadOptions().catch(() => toast({ title: "فشل تحميل الاختيارات", variant: "destructive" }));
  }, [loadOptions, toast]);

  React.useEffect(() => {
    loadInventory().catch(() => toast({ title: "فشل تحميل المخزون", variant: "destructive" }));
  }, [loadInventory, toast]);

  React.useEffect(() => {
    setVariantId("");
  }, [productId]);

  const filteredInventory = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return inventory;
    return inventory.filter((row) => {
      const haystack = [
        row.partner.name,
        row.partner.phone,
        row.partner.governorate,
        row.variant.sku,
        row.variant.product.name,
        row.variant.name,
        row.variant.colorName ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [inventory, query]);

  const selectedInventory = inventory.find(
    (row) => row.partnerId === partnerId && row.variantId === variantId
  );

  React.useEffect(() => {
    if (selectedInventory) {
      setAvailable(String(selectedInventory.stockAvailable));
      setReserved(String(selectedInventory.stockReserved));
    } else {
      setAvailable("");
      setReserved("");
    }
  }, [selectedInventory?.id, selectedInventory?.stockAvailable, selectedInventory?.stockReserved]);

  const saveAdjustment = async () => {
    const stockAvailable = Number.parseInt(available, 10);
    const stockReserved = reserved.trim() ? Number.parseInt(reserved, 10) : 0;
    if (!partnerId || !variantId || !Number.isFinite(stockAvailable) || stockAvailable < 0) {
      toast({ title: "اختر الشريك والمتغير وأدخل المتاح", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/partner-inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          partnerId,
          variantId,
          stockAvailable,
          stockReserved,
          notes: notes.trim() || null,
        }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        toast({ title: "تم حفظ المخزون" });
        setNotes("");
        await loadInventory();
      } else {
        toast({ title: json?.error?.message ?? "فشل حفظ المخزون", variant: "destructive" });
      }
    } finally {
      setSaving(false);
    }
  };

  const totals = filteredInventory.reduce(
    (acc, row) => {
      acc.available += row.stockAvailable;
      acc.reserved += row.stockReserved;
      return acc;
    },
    { available: 0, reserved: 0 }
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="مخزون الشركاء"
        description="إدارة المخزون الحقيقي لكل وكيل أو موزع، مع بقاء مخزون المتغيرات القديم للقراءة التوافقية فقط."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <AdminPanelCard
          title="المخزون"
          icon={<Boxes className="h-5 w-5 text-burgundy" />}
          toolbar={
            <div className="relative w-full sm:w-72">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="بحث بالشريك أو SKU"
                className="pr-9"
              />
            </div>
          }
        >
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">صفوف ظاهرة</p>
              <p className="mt-1 text-xl font-bold">{filteredInventory.length}</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">إجمالي المتاح</p>
              <p className="mt-1 text-xl font-bold">{totals.available}</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">إجمالي المحجوز</p>
              <p className="mt-1 text-xl font-bold">{totals.reserved}</p>
            </div>
          </div>

          {loading ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              جاري التحميل
            </div>
          ) : (
            <AdminTableScroll>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الشريك</TableHead>
                    <TableHead>المنتج</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>متاح</TableHead>
                    <TableHead>محجوز</TableHead>
                    <TableHead>قابل للبيع</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInventory.map((row) => {
                    const sellable = Math.max(0, row.stockAvailable - row.stockReserved);
                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="font-medium">{row.partner.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {row.partner.partnerType === "AGENT" ? "وكيل" : "موزع"} · {row.partner.governorate}
                          </div>
                        </TableCell>
                        <TableCell>{row.variant.product.name}</TableCell>
                        <TableCell className="font-mono text-xs">{row.variant.sku}</TableCell>
                        <TableCell>{row.stockAvailable}</TableCell>
                        <TableCell>{row.stockReserved}</TableCell>
                        <TableCell>
                          <Badge variant={sellable > 0 ? "default" : "destructive"}>{sellable}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </AdminTableScroll>
          )}
        </AdminPanelCard>

        <AdminPanelCard title="تعديل سريع" icon={<PackageSearch className="h-5 w-5 text-burgundy" />}>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">الشريك</label>
              <Select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
                <option value="">اختر الشريك</option>
                {partners.map((partner) => (
                  <option key={partner.id} value={partner.id}>
                    {partner.name} · {partner.partnerType === "AGENT" ? "وكيل" : "موزع"}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">المنتج</label>
              <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">اختر المنتج</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>{product.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">المتغير</label>
              <Select value={variantId} onChange={(e) => setVariantId(e.target.value)} disabled={!productId}>
                <option value="">اختر المتغير</option>
                {variants.map((variant) => (
                  <option key={variant.id} value={variant.id}>{variantLabel(variant)}</option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">المتاح</label>
                <Input
                  inputMode="numeric"
                  value={available}
                  onChange={(e) => setAvailable(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">المحجوز</label>
                <Input
                  inputMode="numeric"
                  value={reserved}
                  onChange={(e) => setReserved(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">ملاحظة دفتر الحركة</label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="سبب التعديل" />
            </div>
            <Button onClick={saveAdjustment} disabled={saving} className="w-full gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              حفظ التعديل
            </Button>
          </div>
        </AdminPanelCard>
      </div>
    </div>
  );
}
