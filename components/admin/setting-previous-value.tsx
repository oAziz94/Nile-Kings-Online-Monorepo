"use client";

import * as React from "react";
import { formatRelativeTimeAr } from "@/lib/format-relative-time-ar";

/**
 * "السابق 2% · أمس 11:05 · أنت" (backlog 9.7 (b)) — under every settings field that has an
 * audit history, the newest `AdminAuditLog` row for that entity carrying a diff on `field`.
 * Reads the same `GET /api/admin/audit?entityType&entityId` every in-context audit consumer
 * uses (no new endpoint); `format` turns the raw before-value into the same text the field's
 * own input shows (e.g. "2%" for a percent stored as a plain number).
 */
export function SettingPreviousValue({
  entityType,
  entityId,
  field,
  format,
}: {
  entityType: string;
  entityId: string;
  field: string;
  format: (v: unknown) => string;
}) {
  const [note, setNote] = React.useState<{ value: string; when: string; actorName: string } | null>(null);
  const [checked, setChecked] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    fetch(`/api/admin/audit?entityType=${entityType}&entityId=${entityId}&limit=10`, { credentials: "include" })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: { items?: Array<{ before: unknown; createdAt: string; actorName: string }> } }) => {
        if (!alive || !json?.success) return;
        const items = json.data?.items ?? [];
        const row = items.find((r) => r.before && typeof r.before === "object" && field in (r.before as Record<string, unknown>));
        if (row) {
          const before = (row.before as Record<string, unknown>)[field];
          setNote({ value: format(before), when: formatRelativeTimeAr(row.createdAt), actorName: row.actorName });
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setChecked(true);
      });
    return () => {
      alive = false;
    };
  }, [entityType, entityId, field, format]);

  if (!checked || !note) return null;

  return (
    <p className="mt-0.5 text-[11px] text-ink-soft">
      السابق {note.value} · {note.when} · {note.actorName}
    </p>
  );
}
