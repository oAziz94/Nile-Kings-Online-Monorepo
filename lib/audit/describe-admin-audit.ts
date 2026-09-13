/**
 * Turns one `AdminAuditLog` row into a single Arabic sentence for اليوم's "آخر النشاط"
 * widget (backlog 9.2 d) and, later, 9.7's السجل screen. Pure (no Prisma, no actor lookup —
 * "من فعل" is resolved by the caller, joining `User` by `actorUserId` and showing "أنت"
 * when it is the caller; this function only describes "ماذا").
 */

export type AdminAuditRowLike = {
  action: string;
  entityType: string;
  entityLabel: string | null;
  before: unknown;
  after: unknown;
};

const ENTITY_LABEL_AR: Record<string, string> = {
  coupon: "الكوبون",
  partner: "الشريك",
  user: "المستخدم",
  settings: "الإعدادات",
  product: "المنتج",
};

/** Known diff fields worth naming explicitly, with an Arabic label and an optional
 * formatter (percent fields store basis points; everything else prints as-is). */
const FIELD_LABELS: Record<string, { label: string; format?: (v: unknown) => string }> = {
  costRateBps: { label: "نسبة الشراء", format: (v) => `${Math.round(Number(v) / 100)}%` },
  isActive: { label: "الحالة", format: (v) => (v ? "نشط" : "غير نشط") },
  name: { label: "الاسم" },
  governorate: { label: "المحافظة" },
  confirmSlaHours: { label: "مهلة التأكيد", format: (v) => `${v} ساعة` },
  shipSlaHours: { label: "مهلة الشحن", format: (v) => `${v} ساعة` },
  code: { label: "الكود" },
  active: { label: "الحالة", format: (v) => (v ? "مفعّل" : "معطّل") },
};

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function entityLabelAr(entityType: string): string {
  return ENTITY_LABEL_AR[entityType] ?? entityType;
}

/** "<field label>[ لـ<entityLabel>] <before> → <after>" — the canvas's own shape
 * ("نسبة الشراء لموزع القليوبية 75% → 70%"). */
function describeFieldChange(key: string, before: unknown, after: unknown, entityLabel: string): string {
  const meta = FIELD_LABELS[key];
  const fieldLabel = meta?.label ?? key;
  const fmt = meta?.format ?? ((v: unknown) => String(v ?? "—"));
  const subject = entityLabel ? `${fieldLabel} ل${entityLabel}` : fieldLabel;
  return `${subject} ${fmt(before)} → ${fmt(after)}`;
}

export function describeAdminAudit(row: AdminAuditRowLike): string {
  const label = row.entityLabel ?? "";

  if (row.action === "grant_admin") {
    return `منح صلاحية المسؤول لـ${label}`;
  }
  if (row.action === "revoke_admin") {
    return `أزال صلاحية المسؤول ${label}`;
  }

  const entityAr = entityLabelAr(row.entityType);

  if (row.action === "create") {
    return `أنشأ ${entityAr} ${label}`.trim();
  }
  if (row.action === "delete") {
    return `حذف ${entityAr} ${label}`.trim();
  }

  if (row.action === "update") {
    const before = asRecord(row.before);
    const after = asRecord(row.after);
    const keys = Object.keys(after).length > 0 ? Object.keys(after) : Object.keys(before);
    if (keys.length > 0) {
      // Prefer a single well-known field when the diff carries one — matches the canvas's
      // one-sentence example exactly rather than concatenating every changed key.
      const knownKey = keys.find((k) => FIELD_LABELS[k]);
      const key = knownKey ?? keys[0];
      const change = describeFieldChange(key, before[key], after[key], label);
      return `غيّر ${change}`;
    }
  }

  return `عدّل ${entityAr} ${label}`.trim();
}
