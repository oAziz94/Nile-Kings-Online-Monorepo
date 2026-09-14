/**
 * Arabic labels for `AdminAuditLog.action` values — the السجل screen's "الإجراء" column and
 * its action filter (backlog 9.7 review fix: both showed raw action codes like
 * `status_change`/`stock_correction`). Covers every action any route/lib function writes
 * today (grepped `action: "..."` across `app/api` and `lib`, plus the ternary-computed ones
 * in `lib/orders/assign-partner.ts`, `app/api/admin/rerouting-rules/[id]/partners/[linkId]/
 * route.ts` and `app/api/admin/order-tickets/[id]/route.ts`) — kept in sync with
 * `describe-admin-audit.test.ts`'s own cases by `describe-admin-audit.test.ts`'s "every
 * action has a label" test.
 */
export const ACTION_LABELS: Record<string, string> = {
  create: "إنشاء",
  update: "تعديل",
  delete: "حذف",
  grant_admin: "منح صلاحية مسؤول",
  revoke_admin: "سحب صلاحية مسؤول",
  add_partner: "إضافة شريك",
  remove_partner: "إزالة شريك",
  pause_partner: "إيقاف شريك",
  resume_partner: "تفعيل شريك",
  set_mode: "تغيير وضع التوجيه",
  stock_correction: "تصحيح مخزون",
  assign: "إسناد",
  reassign: "إعادة إسناد",
  status_change: "تغيير الحالة",
  proof_of_delivery: "إثبات تسليم",
  ticket_reply: "رد على سؤال",
  ticket_close: "إغلاق سؤال",
  ticket_reopen: "إعادة فتح سؤال",
  sync: "مزامنة مع Cloudinary",
  media_assign: "إسناد صورة",
  media_hero: "تعيين صورة رئيسية",
  media_replace: "استبدال صورة",
  color_add: "إضافة لون",
  color_visibility: "تغيير ظهور لون",
  color_rename: "تعديل بيانات لون",
  gallery_reorder: "إعادة ترتيب معرض لون",
  gallery_remove: "إزالة صورة من معرض لون",
  bulk_edit: "تعديل جماعي",
};

export function actionLabelAr(action: string): string {
  return ACTION_LABELS[action] ?? action;
}
