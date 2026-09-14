"use client";

/**
 * `/admin/audit` — السجل (backlog 9.7 (c)), rebuilt per `Audit.dc.html` (generator block 12):
 * متى · من · الصفة · الإجراء · على · التغيير, expand-to-diff, filters (الفاعل, النوع, الإجراء,
 * period), search, CSV export, cursor pagination on `GET /api/admin/audit`.
 */
import * as React from "react";
import Link from "next/link";
import { ChevronDown, Download, Search } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatDateEn } from "@/lib/format-en-numbers";
import { ACTION_LABELS } from "@/lib/audit/action-labels";
import { cn } from "@/lib/utils";

type AdminOption = { id: string; name: string | null; phone: string };

type AuditRow = {
  id: string;
  createdAt: string;
  actorUserId: string;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  entityLabel: string | null;
  sentence: string;
  before: unknown;
  after: unknown;
  reason: string | null;
  ip: string | null;
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  order: "طلب",
  partner: "شريك",
  coupon: "كوبون",
  user: "مستخدم",
  settings: "إعدادات",
  receipt: "إيصال",
  routing: "توجيه",
  partner_request: "طلب شراكة",
  ticket: "تذكرة",
  restock_request: "إعادة توريد",
  "partner-inventory": "مخزون شريك",
  product: "منتج",
};

const ENTITY_LINK: Record<string, (id: string) => string> = {
  order: (id) => `/admin/orders/${id}`,
  partner: (id) => `/admin/partners/${id}`,
  coupon: () => `/admin/coupons`,
  user: (id) => `/admin/clients/${id}`,
  settings: () => `/admin/settings`,
};

const PERIOD_PRESETS = [
  { id: "7d", label: "7 أيام" },
  { id: "30d", label: "30 يومًا" },
  { id: "90d", label: "90 يومًا" },
  { id: "custom", label: "مخصص" },
] as const;

function periodToRange(preset: string, customFrom: string, customTo: string): { from?: string; to?: string } {
  if (preset === "custom") return { from: customFrom || undefined, to: customTo || undefined };
  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default function AdminAuditPage() {
  const [q, setQ] = React.useState("");
  const [entityType, setEntityType] = React.useState("");
  const [action, setAction] = React.useState("");
  // PM ruling (9.7 review): per-admin, not just a role toggle — "" (الكل), `user:<id>`
  // (one admin, by name) or `group:PARTNER` (الشركاء, every partner-actor row).
  const [actorSelection, setActorSelection] = React.useState("");
  const [admins, setAdmins] = React.useState<AdminOption[]>([]);
  const [preset, setPreset] = React.useState<string>("30d");
  const [customFrom, setCustomFrom] = React.useState("");
  const [customTo, setCustomTo] = React.useState("");

  const [rows, setRows] = React.useState<AuditRow[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [entityTypes, setEntityTypes] = React.useState<string[]>([]);
  const [actions, setActions] = React.useState<string[]>([]);

  React.useEffect(() => {
    // Every admin, for the الفاعل filter — the same `role=ADMIN` list the المسؤولون tab uses.
    fetch("/api/admin/clients?role=ADMIN&limit=200", { credentials: "include" })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: { clients: AdminOption[] } }) => {
        if (json?.success && json.data) setAdmins(json.data.clients);
      })
      .catch(() => undefined);
  }, []);

  const buildParams = React.useCallback(
    (cursor?: string) => {
      const { from, to } = periodToRange(preset, customFrom, customTo);
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (entityType) params.set("entityType", entityType);
      if (action) params.set("action", action);
      if (actorSelection.startsWith("user:")) params.set("actorUserId", actorSelection.slice(5));
      else if (actorSelection.startsWith("group:")) params.set("actorRole", actorSelection.slice(6));
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      params.set("limit", "50");
      if (cursor) params.set("cursor", cursor);
      return params;
    },
    [q, entityType, action, actorSelection, preset, customFrom, customTo]
  );

  const load = React.useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/audit?${buildParams().toString()}`, { credentials: "include" })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: { items: AuditRow[]; nextCursor: string | null } }) => {
        if (json?.success && json.data) {
          setRows(json.data.items);
          setNextCursor(json.data.nextCursor);
          setEntityTypes((prev) => Array.from(new Set([...prev, ...json.data!.items.map((r) => r.entityType)])));
          setActions((prev) => Array.from(new Set([...prev, ...json.data!.items.map((r) => r.action)])));
        }
      })
      .finally(() => setLoading(false));
  }, [buildParams]);

  React.useEffect(() => {
    load();
  }, [load]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/admin/audit?${buildParams(nextCursor).toString()}`, { credentials: "include" });
      const json = await res.json();
      if (json?.success && json.data) {
        setRows((prev) => [...prev, ...json.data.items]);
        setNextCursor(json.data.nextCursor);
      }
    } finally {
      setLoadingMore(false);
    }
  };

  const csvHref = `/api/admin/audit?${buildParams().toString()}&format=csv`;

  return (
    <div className="space-y-6">
      <PageHeader title="السجل" description="من فعل ماذا ومتى · كل تغيير في المال أو المخزون أو الحالة أو الكتالوج أو الإعدادات" />

      <div className="overflow-hidden rounded-2xl bg-white shadow-soft">
        <div className="flex flex-wrap items-center gap-2 border-b border-stone-100 p-4">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="رقم طلب أو شريك أو SKU أو اسم"
              className="h-10 rounded-lg pr-10"
            />
          </div>

          <Label htmlFor="audit-filter-actor" className="sr-only">الفاعل</Label>
          <Select id="audit-filter-actor" value={actorSelection} onChange={(e) => setActorSelection(e.target.value)} className="h-10 w-auto rounded-full">
            <option value="">الفاعل: الكل</option>
            <option value="group:PARTNER">الشركاء</option>
            {admins.map((a) => (
              <option key={a.id} value={`user:${a.id}`}>{a.name?.trim() || a.phone}</option>
            ))}
          </Select>

          <Label htmlFor="audit-filter-type" className="sr-only">النوع</Label>
          <Select id="audit-filter-type" value={entityType} onChange={(e) => setEntityType(e.target.value)} className="h-10 w-auto rounded-full">
            <option value="">النوع: الكل</option>
            {entityTypes.map((t) => (
              <option key={t} value={t}>{ENTITY_TYPE_LABELS[t] ?? t}</option>
            ))}
          </Select>

          <Label htmlFor="audit-filter-action" className="sr-only">الإجراء</Label>
          <Select id="audit-filter-action" value={action} onChange={(e) => setAction(e.target.value)} className="h-10 w-auto rounded-full">
            <option value="">الإجراء: الكل</option>
            {actions.map((a) => (
              <option key={a} value={a}>{ACTION_LABELS[a] ?? a}</option>
            ))}
          </Select>

          <div className="flex items-center gap-1.5">
            {PERIOD_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPreset(p.id)}
                aria-pressed={preset === p.id}
                className={cn(
                  "flex h-9 items-center rounded-full px-3 text-xs font-bold",
                  preset === p.id ? "bg-lapis-800 text-white" : "border border-stone-200 bg-white text-ink"
                )}
              >
                {p.label}
              </button>
            ))}
            {preset === "custom" && (
              <>
                <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-9 w-36" />
                <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-9 w-36" />
              </>
            )}
          </div>

          <a href={csvHref} className="mr-auto">
            <Button type="button" variant="outline" size="sm" className="rounded-full">
              <Download className="h-4 w-4" />
              CSV للفترة
            </Button>
          </a>
        </div>

        {loading ? (
          <p className="p-8 text-center text-sm text-ink-soft">جاري التحميل…</p>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-ink-soft">لا توجد سجلات مطابقة</p>
        ) : (
          <div data-testid="audit-rows">
            <div className="hidden grid-cols-[130px_140px_90px_110px_1fr_1fr_28px] gap-2 border-b border-stone-100 bg-stone-50 px-4 py-2 text-[11px] font-extrabold text-ink-soft sm:grid">
              <span>متى</span>
              <span>من</span>
              <span>الصفة</span>
              <span>الإجراء</span>
              <span>على</span>
              <span>التغيير</span>
              <span />
            </div>
            {rows.map((row) => {
              const isOpen = expanded === row.id;
              const linker = ENTITY_LINK[row.entityType];
              return (
                <div key={row.id} className="border-b border-stone-100 last:border-0">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : row.id)}
                    aria-expanded={isOpen}
                    className="grid w-full grid-cols-1 gap-1 px-4 py-3 text-right text-xs sm:grid-cols-[130px_140px_90px_110px_1fr_1fr_28px] sm:items-center sm:gap-2"
                  >
                    <span className="text-ink-soft" dir="ltr">{formatDateEn(row.createdAt, { hour: "numeric", minute: "2-digit" })}</span>
                    <span className="font-bold text-ink">{row.actorName}</span>
                    <span>
                      <Badge variant={row.actorRole === "PARTNER" ? "neutral" : "info"} className="rounded-full text-[10px]">
                        {row.actorRole === "PARTNER" ? "شريك" : row.actorRole === "ADMIN" ? "مسؤول" : row.actorRole}
                      </Badge>
                    </span>
                    <span className="text-ink">{ACTION_LABELS[row.action] ?? row.action}</span>
                    <span className="font-bold text-lapis-800">{row.entityLabel ?? row.entityId}</span>
                    <span className="truncate text-ink-soft">{row.sentence}</span>
                    <ChevronDown className={cn("h-4 w-4 text-stone-300 transition-transform", isOpen && "rotate-180")} />
                  </button>
                  {isOpen && (
                    <div className="space-y-2 bg-stone-50 px-4 pb-4 text-xs">
                      <p className="font-bold text-ink">{row.sentence}</p>
                      {row.before !== null && row.before !== undefined && (
                        <p><span className="font-bold text-ink-soft">قبل: </span><code className="break-all">{JSON.stringify(row.before)}</code></p>
                      )}
                      {row.after !== null && row.after !== undefined && (
                        <p><span className="font-bold text-ink-soft">بعد: </span><code className="break-all">{JSON.stringify(row.after)}</code></p>
                      )}
                      {row.reason && <p><span className="font-bold text-ink-soft">السبب: </span>{row.reason}</p>}
                      {row.ip && <p><span className="font-bold text-ink-soft">IP: </span>{row.ip}</p>}
                      {linker && (
                        <Link href={linker(row.entityId)} className="inline-block font-bold text-lapis-800 hover:underline">
                          فتح ←
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {nextCursor && !loading && (
          <div className="flex justify-center border-t border-stone-100 p-4">
            <Button type="button" variant="outline" onClick={loadMore} disabled={loadingMore} className="rounded-full">
              {loadingMore ? "جاري التحميل…" : "تحميل المزيد"}
            </Button>
          </div>
        )}
      </div>

      <p className="text-center text-xs text-ink-soft">يُحتفظ بالمال والمخزون للأبد، والباقي 400 يومًا</p>
    </div>
  );
}
