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
  routing: "التوجيه",
  "partner-inventory": "مخزون الشريك",
  order: "الطلب",
  receipt: "الإيصال",
  partner_request: "طلب الشريك",
  ticket: "التذكرة",
  restock_request: "طلب إعادة التوريد",
  media: "الصورة",
};

/** `Order.status` values, in Arabic — kept local (not imported from
 * `lib/constants/order-status.ts`) so this module stays pure/dependency-free per its doc
 * comment; the seven values are stable enough to duplicate here. */
const ORDER_STATUS_AR: Record<string, string> = {
  CREATED: "بانتظار التأكيد",
  CONFIRMED: "مؤكد",
  PROCESSING: "قيد التجهيز",
  READY_TO_SHIP: "جاهز للشحن",
  SHIPPED: "تم الشحن",
  DELIVERED: "تم التسليم",
  CANCELLED: "ملغي",
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
  status: { label: "الحالة", format: (v) => ORDER_STATUS_AR[String(v)] ?? String(v) },
  lowStockThreshold: { label: "حد المخزون المنخفض", format: (v) => `${v} قطعة` },
  deadStockDays: { label: "راكد بعد", format: (v) => `${v} يوم` },
  targetCoverDays: { label: "تغطية مستهدفة", format: (v) => `${v} يوم` },
  enabled: { label: "الحالة", format: (v) => (v ? "مفعّل" : "معطّل") },
  stockAvailable: { label: "المخزون المتاح" },
  alt: { label: "النص البديل" },
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

  // Backlog 9.5 — التوجيه/مخزون الشبكة writes, one Arabic sentence per action (not the
  // generic "عدّل <entity> <label>" fallback, which mixed English action names with Arabic
  // when these six actions were added and had no dedicated branch). `label` here is the
  // governorate for the five routing actions, the SKU for `stock_correction`.
  if (row.action === "add_partner") {
    const after = asRecord(row.after);
    const partnerName = String(after.partnerName ?? "");
    return `أضاف ${partnerName} إلى دور ${label}`.trim();
  }
  if (row.action === "remove_partner") {
    const before = asRecord(row.before);
    const partnerName = String(before.partnerName ?? "");
    return `أزال ${partnerName} من دور ${label}`.trim();
  }
  if (row.action === "pause_partner") {
    const after = asRecord(row.after);
    const partnerName = String(after.partnerName ?? "");
    return `أوقف ${partnerName} مؤقتًا في ${label}`.trim();
  }
  if (row.action === "resume_partner") {
    const after = asRecord(row.after);
    const partnerName = String(after.partnerName ?? "");
    return `أعاد تفعيل ${partnerName} في ${label}`.trim();
  }
  if (row.action === "set_mode") {
    const after = asRecord(row.after);
    return after.isActive
      ? `حوّل ${label} إلى التوجيه التلقائي`
      : `حوّل ${label} إلى الإسناد اليدوي`;
  }
  if (row.action === "stock_correction") {
    const before = asRecord(row.before);
    const after = asRecord(row.after);
    const partnerName = String(after.partnerName ?? "");
    const from = String(before.stockAvailable ?? "—");
    const to = String(after.stockAvailable ?? "—");
    return `صحّح مخزون ${label} عند ${partnerName} ${from} → ${to}`.trim();
  }

  // Backlog 9.7 (c) — order actions the 9.7 السجل screen surfaces alongside the six above:
  // assignment, status mirrors (admin PATCH and the partner-side mirror, 9.7 (e)), tickets
  // and proof-of-delivery. `label` is the order's `#12345678` short id for all of these.
  if (row.action === "assign") {
    return `أسند الطلب ${label}`.trim();
  }
  if (row.action === "reassign") {
    return `أعاد إسناد الطلب ${label}`.trim();
  }
  if (row.action === "status_change") {
    const before = asRecord(row.before);
    const after = asRecord(row.after);
    const from = ORDER_STATUS_AR[String(before.status)] ?? String(before.status ?? "—");
    const to = ORDER_STATUS_AR[String(after.status)] ?? String(after.status ?? "—");
    return `غيّر حالة الطلب ${label} ${from} → ${to}`.trim();
  }
  if (row.action === "ticket_reply") {
    return `رد على سؤال العميل في الطلب ${label}`.trim();
  }
  if (row.action === "ticket_close") {
    return `أغلق سؤال العميل في الطلب ${label}`.trim();
  }
  if (row.action === "ticket_reopen") {
    return `أعاد فتح سؤال العميل في الطلب ${label}`.trim();
  }
  if (row.action === "proof_of_delivery") {
    return `رفع إثبات تسليم الطلب ${label}`.trim();
  }

  // Backlog 9.8a — الصور library writes. `sync`'s label is a fixed "Cloudinary" (there is no
  // one entity the reconcile is "about"); the three selection-bar actions carry their subject
  // in `after` since one write can touch several assets at once.
  if (row.action === "sync" && row.entityType === "media") {
    const after = asRecord(row.after);
    const imported = Number(after.imported ?? 0);
    const missing = Number(after.missing ?? 0);
    const adopted = Number(after.adopted ?? 0);
    return `زامن مكتبة الصور مع Cloudinary: ${imported} مستوردة، ${missing} مفقودة، ${adopted} مرتبطة بروابط قديمة`;
  }
  if (row.action === "media_assign") {
    const after = asRecord(row.after);
    const count = Number(after.count ?? 1);
    const colorLabel = String(after.colorLabel ?? "");
    return `أسند ${count} صورة إلى ${label}${colorLabel ? ` · ${colorLabel}` : ""}`.trim();
  }
  if (row.action === "media_hero") {
    return `عيّن صورة رئيسية لـ${label}`.trim();
  }
  if (row.action === "media_replace") {
    return `استبدل الصورة ${label} بصورة جديدة`.trim();
  }

  if (row.action === "create") {
    return `أنشأ ${entityAr} ${label}`.trim();
  }
  if (row.action === "delete") {
    return `حذف ${entityAr} ${label}`.trim();
  }

  if (row.action === "update" && row.entityType === "restock_request") {
    return `نفّذ نقل المخزون لطلب إعادة التوريد ${label}`.trim();
  }

  if (row.action === "update") {
    const before = asRecord(row.before);
    const after = asRecord(row.after);
    // partner_request statuses (PENDING/CONTACTED/APPROVED/REJECTED) share the "status" key
    // name with order status, but are a different vocabulary — handled separately so the
    // shared FIELD_LABELS.status (order statuses) never mislabels them.
    if (row.entityType === "partner_request" && ("status" in before || "status" in after)) {
      const PARTNER_REQUEST_STATUS_AR: Record<string, string> = {
        PENDING: "بانتظار المراجعة",
        CONTACTED: "تم التواصل",
        APPROVED: "مقبول",
        REJECTED: "مرفوض",
      };
      const from = PARTNER_REQUEST_STATUS_AR[String(before.status)] ?? String(before.status ?? "—");
      const to = PARTNER_REQUEST_STATUS_AR[String(after.status)] ?? String(after.status ?? "—");
      return `غيّر حالة طلب الشريك ${label} ${from} → ${to}`.trim();
    }
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
