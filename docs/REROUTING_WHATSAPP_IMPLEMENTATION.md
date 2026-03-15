# Governorate-Based Rerouting & WhatsApp – Implementation Summary

## 1. Summary of Files Changed / Added

### Database (Prisma)
- **prisma/schema.prisma** – Added:
  - `ReroutingRule` (governorate, isActive, lastAssignedPartnerId)
  - `ReroutingRulePartner` (ruleId, partnerId, isActive, priority)
  - `RoutedOrder` (orderId, governorate, ruleId, partnerId, assignmentSequence, assignmentMode, status, timestamps, proofImageUrl, proofImagePublicId, notes)
  - Enums: `RoutedOrderStatus`, `AssignmentMode`
  - Relations on `Order` (routedOrder), `Partner` (rulePartners, routedOrdersAsPartner, lastAssignedInRules)
- **prisma/migrations/20260315100000_governorate_rerouting_whatsapp/migration.sql** – New migration (apply with `npx prisma migrate deploy` or `npx prisma db push`).

### Services & Rerouting Logic
- **lib/services/whatsapp.ts** – WhatsApp service using **Meta WhatsApp Cloud API** (no Twilio). `getWhatsAppService().sendOrderAssignment(phone, message)`, `normalizePhoneForWhatsApp(phone)`. Optional Noop when not configured.
- **lib/rerouting/message.ts** – Builds full Arabic order-assignment message (order #, date, customer, address, payment, products).
- **lib/rerouting/assign.ts** – `assignOrderToGovernorate(orderId)` – round-robin assignment, creates RoutedOrder, sends WhatsApp (non-blocking; failure does not break order creation).

### API
- **app/api/checkout/place-order/route.ts** – After successful `placeOrder`, calls `assignOrderToGovernorate` in try/catch.
- **app/api/admin/rerouting-rules/** – CRUD for rules and rule partners.
- **app/api/admin/routed-orders/** – List, get one, PATCH status/notes/proof, POST reassign.
- **app/api/admin/upload/route.ts** – Optional `folder` for proof images; returns `publicId`.
- **app/api/admin/whatsapp-test/route.ts** – POST `{ to, message? }` – admin-only test send for Meta WhatsApp (approved test number).

### Admin UI
- **app/(admin)/layout.tsx** – Nav: "قواعد التوجيه", "الطلبات الموجهة".
- **app/(admin)/admin/rerouting-rules/** – List, create, detail (partners, enable/disable).
- **app/(admin)/admin/routed-orders/** – List, detail (status, notes, proof, reassign).
- **app/(admin)/admin/settings/page.tsx** – "اختبار واتساب (Meta Cloud API)" card: send test message to a phone number.

### Config & Env
- **lib/env.ts** – Optional Meta WhatsApp vars: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_API_URL`, `WHATSAPP_BUSINESS_ACCOUNT_ID`.
- **.env** – Meta WhatsApp block (no Twilio vars for WhatsApp).

### Test script
- **scripts/test-whatsapp-send.mjs** – CLI: `node scripts/test-whatsapp-send.mjs 01012345678` sends a test message using `.env` and Meta Cloud API.

---

## 2. WhatsApp Environment Variables (Meta Cloud API)

| Variable | Required | Description |
|----------|----------|-------------|
| `WHATSAPP_PHONE_NUMBER_ID` | No* | Meta Cloud API Phone Number ID. If unset, assignment still runs but no WhatsApp is sent. |
| `WHATSAPP_ACCESS_TOKEN` | No* | Meta Cloud API access token (permanent or system user). |
| `WHATSAPP_API_URL` | No | Base URL; default `https://graph.facebook.com/v18.0`. |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | No | Reserved for future use. |
| `WHATSAPP_ORDER_TEMPLATE_NAME` | No** | **Required for business-initiated messages.** Pre-approved template name (e.g. `order_assignment`). See §2.1. |
| `WHATSAPP_ORDER_TEMPLATE_LANGUAGE` | No | Template language code; default `ar`. |

\* Both `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_ACCESS_TOKEN` must be set for WhatsApp sending to be enabled. No Twilio variables are used for this feature.

\** Meta only allows **template messages** when the business starts the conversation (partner has not messaged you in the last 24 hours). If you don’t set `WHATSAPP_ORDER_TEMPLATE_NAME`, free-form text is used and will fail unless the partner recently chatted with your business number.

### 2.1 Create a message template (required for order notifications)

1. In [Meta Business Suite](https://business.facebook.com/) → **WhatsApp Manager** → **Message templates** (or Meta for Developers → your app → WhatsApp → Message Templates).
2. Create a new template, e.g. **Name**: `order_assignment`, **Category**: Utility, **Language**: Arabic.
3. **Body** with one variable for the order details, e.g.  
   `لديك طلب جديد مُعيَّن لك.\n\n{{1}}`  
   (The app will pass the full order details as `{{1}}`; max ~1000 characters.)
4. Submit for approval. After it’s approved, set in `.env`:
   - `WHATSAPP_ORDER_TEMPLATE_NAME=order_assignment`
   - `WHATSAPP_ORDER_TEMPLATE_LANGUAGE=ar` (optional, default is `ar`).
5. Restart the app and place a test order; the partner should receive the template message.

---

## 3. Testing WhatsApp

- **Admin UI**: الإعدادات → "اختبار واتساب (Meta Cloud API)" → enter phone (e.g. `01012345678`) → "إرسال رسالة اختبار". Requires the number to be approved/test number in your Meta app.
- **CLI**: `node scripts/test-whatsapp-send.mjs 01012345678` (loads `.env` from project root).

---

## 4. Database Migrations / Schema

- New tables: `ReroutingRule`, `ReroutingRulePartner`, `RoutedOrder`.
- New enums: `RoutedOrderStatus`, `AssignmentMode`.
- Apply: `npx prisma migrate deploy` (or `npx prisma db push`). Migration: `prisma/migrations/20260315100000_governorate_rerouting_whatsapp/`.

---

## 5. Test Checklist

- [ ] **Rule creation** – Create a rule for a governorate (e.g. القاهرة); verify it appears in قواعد التوجيه.
- [ ] **Partner linking** – On rule detail, add one or more partners; verify list and enable/disable per partner.
- [ ] **Cairo/Alex routing** – Place orders for القاهرة and الإسكندرية; verify RoutedOrder with correct governorate.
- [ ] **Round-robin** – Multiple orders for one governorate with 2+ partners; verify alternating assignment.
- [ ] **WhatsApp sending** – Set `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_ACCESS_TOKEN`; place order or use admin test; verify message received; RoutedOrder status NOTIFIED and notifiedAt set.
- [ ] **Unrouted fallback** – Order for governorate with no rule or no active partners → UNROUTED.
- [ ] **Status / proof / notes / reassign** – Update status, upload proof, edit notes, manual reassign.
- [ ] **Admin-only** – قواعد التوجيه and الطلبات الموجهة only when admin.

---

## 6. Optional / Notes

- **Manual reassign + WhatsApp**: Reassign API does not send WhatsApp to the new partner; can be added later.
- **Proof upload folder**: Cloudinary `nile-kings/routed-proofs` when `folder: "routed-proofs"` or `"proofs"`.
- **Round-robin**: Partners ordered by `priority` (asc) then `createdAt` (asc).
- **Phone normalization**: Egyptian `010xxxxxxxx` → `2010xxxxxxxx`; `+2010xxxxxxxx` → `2010xxxxxxxx` for Meta API.
