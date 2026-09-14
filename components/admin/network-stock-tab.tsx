"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Boxes, FileDown, Loader2, Save } from "lucide-react";
import { PaginationBar } from "@/components/dashboard/pagination";
import { PanelCard } from "@/components/dashboard/panel-card";
import { SearchInput } from "@/components/dashboard/search-input";
import { TableScroll } from "@/components/dashboard/table-scroll";
import { Badge, type BadgeProps } from "@/components/ui/badge";
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
import { formatNumberEn } from "@/lib/format-en-numbers";
import { formatCoverDays } from "@/lib/partner/stock-cover";
import { cn } from "@/lib/utils";

/**
 * مخزون الشبكة tab (backlog 9.5b, `/admin/partners?tab=network`) — every active partner ×
 * every SKU, from `GET /api/admin/network-stock` (`lib/analytics/network-stock.ts`, built on
 * the inventory report's own per-partner query, rule B3). Corrections go through the
 * existing `POST /api/admin/partner-inventory` (audit-logged there).
 */

type NetworkStockRow = {
  variantId: string;
  productId: string;
  categoryId: string;
  categoryName: string | null;
  productName: string;
  variantName: string;
  colorName: string | null;
  sku: string;
  sellable: number;
  daysOfCover: number | null;
  threshold: number;
  status: "out" | "low" | "ok";
  partnerId: string;
  partnerName: string;
};

type PartnerOption = { id: string; name: string };

const STATUS_VARIANT: Record<NetworkStockRow["status"], NonNullable<BadgeProps["variant"]>> = {
  out: "danger",
  low: "warning",
  ok: "success",
};
const STATUS_LABEL: Record<NetworkStockRow["status"], string> = {
  out: "نافد",
  low: "تحت الحد",
  ok: "سليم",
};

export function NetworkStockTab() {
  const { toast } = useToast();
  const searchParams = useSearchParams();

  const [rows, setRows] = React.useState<NetworkStockRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [fetching, setFetching] = React.useState(false);
  const [search, setSearch] = React.useState(searchParams.get("q") ?? "");
  const [debouncedQ, setDebouncedQ] = React.useState(searchParams.get("q") ?? "");
  const [partnerFilter, setPartnerFilter] = React.useState(searchParams.get("partner") ?? "");
  const [categoryFilter, setCategoryFilter] = React.useState("");
  const [belowThresholdOnly, setBelowThresholdOnly] = React.useState(true);
  const [outOnly, setOutOnly] = React.useState(false);
  const [page, setPage] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(50);
  const [partnerOptions, setPartnerOptions] = React.useState<PartnerOption[]>([]);
  const [categoryOptions, setCategoryOptions] = React.useState<{ id: string; name: string }[]>([]);
  const [corrections, setCorrections] = React.useState<Record<string, { qty: string; reason: string }>>({});
  const [savingKey, setSavingKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);
  React.useEffect(() => setPage(0), [debouncedQ, partnerFilter, categoryFilter, belowThresholdOnly, outOnly]);

  React.useEffect(() => {
    fetch("/api/admin/partners?health=1&limit=200", { credentials: "include" })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: { partners: { id: string; name: string; isActive: boolean }[] } }) => {
        if (json?.success && json.data) {
          setPartnerOptions(json.data.partners.filter((p) => p.isActive).map((p) => ({ id: p.id, name: p.name })));
        }
      })
      .catch(() => {});
  }, []);

  const load = React.useCallback(async () => {
    setFetching(true);
    const params = new URLSearchParams({ limit: String(pageSize), offset: String(page * pageSize) });
    if (debouncedQ) params.set("q", debouncedQ);
    if (partnerFilter) params.set("partnerId", partnerFilter);
    if (categoryFilter) params.set("categoryId", categoryFilter);
    params.set("belowThresholdOnly", belowThresholdOnly ? "1" : "0");
    if (outOnly) params.set("outOnly", "1");
    try {
      const res = await fetch(`/api/admin/network-stock?${params}`, { credentials: "include" });
      const json = await res.json();
      if (res.ok && json?.success) {
        setRows(json.data.rows ?? []);
        setTotal(json.data.total ?? 0);
        const categories = new Map<string, string>();
        for (const r of json.data.rows as NetworkStockRow[]) {
          if (r.categoryName) categories.set(r.categoryId, r.categoryName);
        }
        setCategoryOptions((current) => {
          const merged = new Map(current.map((c) => [c.id, c.name]));
          for (const [id, name] of categories) merged.set(id, name);
          return Array.from(merged, ([id, name]) => ({ id, name }));
        });
      } else {
        toast({ title: json?.error?.message ?? "فشل تحميل مخزون الشبكة", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "فشل تحميل مخزون الشبكة", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setLoading(false);
      setFetching(false);
    }
  }, [debouncedQ, partnerFilter, categoryFilter, belowThresholdOnly, outOnly, page, pageSize, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  function rowKey(r: NetworkStockRow) {
    return `${r.partnerId}:${r.variantId}`;
  }

  async function saveCorrection(r: NetworkStockRow) {
    const key = rowKey(r);
    const draft = corrections[key];
    const qty = Number.parseInt(draft?.qty ?? "", 10);
    if (!Number.isInteger(qty) || qty < 0) {
      toast({ title: "أدخل كمية صحيحة", variant: "destructive" });
      return;
    }
    setSavingKey(key);
    try {
      const res = await fetch("/api/admin/partner-inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ partnerId: r.partnerId, variantId: r.variantId, stockAvailable: qty, notes: draft?.reason?.trim() || null }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        toast({ title: "تم حفظ التصحيح" });
        setCorrections((c) => {
          const next = { ...c };
          delete next[key];
          return next;
        });
        load();
      } else {
        toast({ title: json?.error?.message ?? "فشل الحفظ", variant: "destructive" });
      }
    } finally {
      setSavingKey(null);
    }
  }

  function exportCsv() {
    const params = new URLSearchParams({ format: "csv" });
    if (debouncedQ) params.set("q", debouncedQ);
    if (partnerFilter) params.set("partnerId", partnerFilter);
    if (categoryFilter) params.set("categoryId", categoryFilter);
    params.set("belowThresholdOnly", belowThresholdOnly ? "1" : "0");
    if (outOnly) params.set("outOnly", "1");
    window.open(`/api/admin/network-stock?${params}`, "_blank");
  }

  return (
    <PanelCard title="مخزون الشبكة" icon={<Boxes className="h-5 w-5 text-lapis-800" />} noPadding>
      <div className="flex flex-wrap items-center gap-2.5 px-4 py-3.5 sm:px-[22px]">
        <SearchInput value={search} onChange={setSearch} placeholder="SKU أو اسم المنتج" className="sm:w-64" />
        <Select value={partnerFilter} onChange={(e) => setPartnerFilter(e.target.value)} className="h-8 w-auto rounded-full border-stone-200 px-3 text-xs" aria-label="الشريك">
          <option value="">كل الشركاء</option>
          {partnerOptions.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
        <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="h-8 w-auto rounded-full border-stone-200 px-3 text-xs" aria-label="الفئة">
          <option value="">كل الفئات</option>
          {categoryOptions.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
        <button
          type="button"
          aria-pressed={belowThresholdOnly}
          onClick={() => setBelowThresholdOnly((v) => !v)}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500",
            belowThresholdOnly ? "border-lapis-800 bg-lapis-800 text-white" : "border-stone-200 bg-white text-ink"
          )}
        >
          تحت الحد فقط
        </button>
        <button
          type="button"
          aria-pressed={outOnly}
          onClick={() => setOutOnly((v) => !v)}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500",
            outOnly ? "border-carnelian-500 bg-carnelian-50 text-danger-text" : "border-stone-200 bg-white text-ink"
          )}
        >
          نافد فقط
        </button>
        <Button type="button" variant="outline" size="sm" className="mr-auto rounded-full" onClick={exportCsv}>
          <FileDown className="h-3.5 w-3.5" />
          تصدير CSV
        </Button>
      </div>

      {fetching && rows.length > 0 && (
        <div className="flex items-center gap-2 border-b border-stone-200 px-4 py-2 text-sm text-ink-soft sm:px-[22px]">
          <Loader2 className="h-4 w-4 animate-spin" />
          جاري التحديث…
        </div>
      )}

      {loading ? (
        <div className="flex h-40 items-center justify-center text-sm text-ink-soft">
          <Loader2 className="ml-2 h-4 w-4 animate-spin" />
          جاري التحميل
        </div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-ink-soft">لا توجد نتائج</div>
      ) : (
        <TableScroll>
          <Table className={cn(fetching && "opacity-70")}>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>SKU</TableHead>
                <TableHead>المنتج</TableHead>
                <TableHead>المقاس</TableHead>
                <TableHead>اللون</TableHead>
                <TableHead>الشريك</TableHead>
                <TableHead>قابل للبيع</TableHead>
                <TableHead>تغطية</TableHead>
                <TableHead>الحد</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead className="text-left">تصحيح</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const key = rowKey(r);
                const draft = corrections[key] ?? { qty: "", reason: "" };
                return (
                  <TableRow key={key} data-testid={`network-stock-row-${r.variantId}-${r.partnerId}`}>
                    <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                    <TableCell className="font-medium">{r.productName}</TableCell>
                    <TableCell>{r.variantName}</TableCell>
                    <TableCell>{r.colorName ?? "—"}</TableCell>
                    <TableCell>{r.partnerName}</TableCell>
                    <TableCell>
                      <span dir="ltr" className={cn(r.sellable <= 0 && "font-extrabold text-danger-text")}>{formatNumberEn(r.sellable)}</span>
                    </TableCell>
                    <TableCell dir="ltr">{formatCoverDays(r.daysOfCover)}</TableCell>
                    <TableCell dir="ltr">{formatNumberEn(r.threshold)}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[r.status]} className="rounded-full text-[11px] font-extrabold">
                        {STATUS_LABEL[r.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-left">
                      <div className="flex items-center gap-1.5">
                        <Input
                          inputMode="numeric"
                          aria-label={`كمية جديدة — ${r.sku} — ${r.partnerName}`}
                          placeholder={String(r.sellable)}
                          value={draft.qty}
                          onChange={(e) => setCorrections((c) => ({ ...c, [key]: { ...draft, qty: e.target.value } }))}
                          className="h-9 w-20 rounded-md"
                        />
                        <Input
                          aria-label={`سبب التصحيح — ${r.sku} — ${r.partnerName}`}
                          placeholder="السبب"
                          value={draft.reason}
                          onChange={(e) => setCorrections((c) => ({ ...c, [key]: { ...draft, reason: e.target.value } }))}
                          className="h-9 w-28 rounded-md"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant={draft.qty ? "default" : "outline"}
                          className="rounded-md"
                          disabled={!draft.qty || savingKey === key}
                          onClick={() => saveCorrection(r)}
                        >
                          {savingKey === key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableScroll>
      )}
      {total > 0 && (
        <div className="border-t border-stone-200 px-4 py-4 sm:px-[22px]">
          <PaginationBar page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} disabled={fetching} pageSizeOptions={[50, 100]} />
        </div>
      )}
    </PanelCard>
  );
}
