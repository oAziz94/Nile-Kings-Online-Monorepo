"use client";

import * as React from "react";
import { History } from "lucide-react";
import { PanelCard } from "@/components/dashboard/panel-card";
import { formatRelativeTimeAr } from "@/lib/format-relative-time-ar";

type AuditRow = { id: string; actorName: string; sentence: string; createdAt: string };

/**
 * "من غيّر إعدادات هذا الشريك ومتى" (backlog 9.7 (d)) — the last five `AdminAuditLog` rows
 * for `entityType: "partner"`, `entityId: <partnerId>`, under the profile settings tab's save
 * button. Reads the same `GET /api/admin/audit?entityType&entityId` the السجل screen and the
 * order timeline read — no new endpoint.
 */
export function PartnerSettingsAuditHistory({ partnerId }: { partnerId: string }) {
  const [rows, setRows] = React.useState<AuditRow[] | null>(null);

  React.useEffect(() => {
    let alive = true;
    fetch(`/api/admin/audit?entityType=partner&entityId=${partnerId}&limit=5`, { credentials: "include" })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: { items?: AuditRow[] } }) => {
        if (alive && json?.success) setRows(json.data?.items ?? []);
      })
      .catch(() => {
        if (alive) setRows([]);
      });
    return () => {
      alive = false;
    };
  }, [partnerId]);

  if (rows === null) return null;

  return (
    <PanelCard title="من غيّر إعدادات هذا الشريك" icon={<History className="h-4 w-4 text-lapis-800" />} noPadding>
      {rows.length === 0 ? (
        <p className="p-5 text-sm text-ink-soft">لا توجد تغييرات مسجلة بعد.</p>
      ) : (
        <div>
          {rows.map((row) => (
            <div key={row.id} className="border-t border-stone-100 px-5 py-2.5 text-xs leading-relaxed first:border-t-0">
              <span className="font-extrabold text-ink">{row.actorName}</span> <span className="text-ink">{row.sentence}</span>
              <p className="text-[11px] text-ink-soft">{formatRelativeTimeAr(row.createdAt)}</p>
            </div>
          ))}
        </div>
      )}
    </PanelCard>
  );
}
