# Partner Registration Feature – Summary & Deliverables

## 1) Summary of Files Changed

### New files
- **prisma/migrations/20260315000000_add_partner_requests_and_partners/migration.sql** – Migration for `PartnerRequest` and `Partner` tables and enums.
- **lib/partner-request-schema.ts** – Zod schema and types for storefront partner request body (validation + sanitization).
- **lib/email.ts** – Optional SMTP-based email: sends partner request notification to `PARTNER_NOTIFICATION_EMAIL` (or fallback).
- **app/api/partner-requests/route.ts** – Public POST: create partner request, save to DB, send email.
- **app/api/admin/partner-requests/route.ts** – Admin GET: list partner requests (optional filters).
- **app/api/admin/partner-requests/[id]/route.ts** – Admin GET one, PATCH (status, notes).
- **app/api/admin/partner-requests/[id]/convert/route.ts** – Admin POST: convert request to partner (optionally link distributor to agent).
- **app/api/admin/partners/route.ts** – Admin GET (by `partnerType`), POST (create partner).
- **app/api/admin/partners/[id]/route.ts** – Admin GET one, PATCH.
- **components/storefront/partner-registration-modal.tsx** – Storefront modal form (agent/distributor) with RTL, validation, loading, success/error toasts.
- **app/(admin)/admin/partners/page.tsx** – Admin “شركاؤنا” page with 4 tabs: طلبات شراكة، وكلاء، موزعين، إدخال شريك جديد.
- **docs/PARTNER_REGISTRATION_FEATURE.md** – This file.

### Modified files
- **prisma/schema.prisma** – Added enums `PartnerRequestType`, `PartnerRequestStatus`, `PartnerType` and models `PartnerRequest`, `Partner`.
- **lib/env.ts** – Optional env vars for SMTP and partner notification email.
- **components/shared/menu-drawer.tsx** – Replaced “تسجيل وكيل اونلاين” / “تسجيل موزع اونلاين” links with buttons that open the registration modals.
- **app/(admin)/layout.tsx** – Added nav entry “شركاؤنا” → `/admin/partners`.
- **package.json** – Added `nodemailer` and `@types/nodemailer` (dev).

---

## 2) New Environment Variables

All of these are **optional**. If SMTP is not set, requests are still saved to the database but no email is sent.

| Variable | Description |
|----------|-------------|
| `SMTP_HOST` | SMTP server host (e.g. `smtp.gmail.com`). |
| `SMTP_PORT` | SMTP port (e.g. `587`). |
| `SMTP_SECURE` | `"true"` or `"false"` for TLS. |
| `SMTP_USER` | SMTP username (if auth required). |
| `SMTP_PASS` | SMTP password (if auth required). |
| `SMTP_EMAIL` | Sender email address (recommended). |
| `SMTP_FROM_NAME` | Sender display name (default: `Nile Kings Cotton`). |
| `SMTP_FROM` | Legacy fallback sender value (supported for backward compatibility). |
| `PARTNER_NOTIFICATION_EMAIL` | Recipient for new partner request notifications. Default fallback in code: `info@nilekingscotton.com`. |

Example (e.g. in `.env`):

```env
# Partner registration email (optional)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_EMAIL=noreply@nilekingscotton.com
SMTP_FROM_NAME=Nile Kings Cotton
PARTNER_NOTIFICATION_EMAIL=info@nilekingscotton.com
```

---

## 3) Migration Details

- **Migration name:** `20260315000000_add_partner_requests_and_partners`
- **Location:** `prisma/migrations/20260315000000_add_partner_requests_and_partners/migration.sql`

**Creates:**
- Enums: `PartnerRequestType` (AGENT, DISTRIBUTOR), `PartnerRequestStatus` (PENDING, CONTACTED, APPROVED, REJECTED), `PartnerType` (AGENT, DISTRIBUTOR).
- Table **PartnerRequest**: id, requestType, name, governorate, phone, facebookUrl, instagramUrl, tiktokUrl, youtubeUrl, websiteUrl, otherUrl, status, notes, createdAt, updatedAt.
- Table **Partner**: id, partnerType, name, governorate, phone, same social URL fields, linkedAgentId, isActive, notes, createdAt, updatedAt.
- Indexes and FK: `Partner.linkedAgentId` → `Partner.id` (ON DELETE SET NULL).

**Apply:**
- Development: `npx prisma migrate dev`
- Production: `npx prisma migrate deploy`

---

## 4) Test Checklist

### Storefront
- [ ] Open menu (e.g. mobile drawer); click **تسجيل وكيل اونلاين** → modal opens with title “أهلًا بك فى عالم شركاء ملوك النيل” and “طلب تسجيل وكيل أونلاين”.
- [ ] Close modal; click **تسجيل موزع اونلاين** → modal opens with “طلب تسجيل موزع أونلاين”.
- [ ] Submit with empty required fields → validation errors (الاسم، المحافظة، رقم التليفون).
- [ ] Fill الاسم، المحافظة، رقم التليفون; submit → loading state, then success toast and modal closes.
- [ ] Optional: fill some social links (Facebook, Instagram, etc.) and submit → saved and (if SMTP set) email received.
- [ ] RTL layout and Arabic labels/icons look correct; governorate dropdown shows Egyptian governorates.

### Admin dashboard (as admin)
- [ ] **شركاؤنا** appears in admin sidebar and links to `/admin/partners`.
- [ ] **طلبات شراكة:** List shows partner requests; columns: النوع، الاسم، المحافظة، رقم التليفون، تاريخ الطلب، الحالة، الإجراءات.
- [ ] **عرض التفاصيل** opens modal with full request details (and social links if any).
- [ ] **تغيير الحالة / إضافة ملاحظات** opens modal; change status (e.g. CONTACTED) and/or notes; save → list updates.
- [ ] **قبول وتحويل إلى شريك:** For an AGENT request → convert → new agent appears under “وكلاء”. For a DISTRIBUTOR request → optionally choose “الوكيل المرتبط” then convert → new distributor appears under “موزعين” and request status becomes APPROVED.
- [ ] **رفض** sets request status to REJECTED.
- [ ] **وكلاء:** List shows only agents; “عدد الموزعين المرتبطين” and “عرض التفاصيل” (with linked distributors in modal).
- [ ] **موزعين:** List shows only distributors; “الوكيل المرتبط” and “عرض التفاصيل”.
- [ ] **إدخال شريك جديد:** Choose نوع الشريك (وكيل / موزع); fill الاسم، المحافظة، رقم التليفون; for موزع optionally select وكيل; إضافة الشريك → partner appears in the corresponding tab.
- [ ] Non-admin user cannot access `/admin/partners` or partner admin APIs (redirect/403).

### API / backend
- [ ] `POST /api/partner-requests` with valid body (requestType, name, governorate, phone) → 200, record in DB, and (if SMTP configured) email to `PARTNER_NOTIFICATION_EMAIL`.
- [ ] Invalid or missing required fields → 400 with Arabic message.
- [ ] Admin routes without admin session → 401/403.

---

## 5) Security & Validation

- Storefront form: client-side validation; server-side validation and sanitization in `lib/partner-request-schema.ts` (trim, max lengths, optional URLs).
- All admin partner and partner-request routes use `requireAdmin()` (session + AdminPhone).
- Inputs stored with trimmed strings and nullable optional URLs; no raw HTML stored.
