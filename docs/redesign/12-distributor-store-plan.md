# Distributor = منفذ (physical outlet) — redesign plan (draft 2, 2026-10-17)

Owner decisions (2026-10-17), verbatim intent: agents keep selling online exactly as today. A **distributor** becomes a **physical store** that buys stock from the factory **upfront** (no debt tracking, units only), sells **only in its own shop**, and is **no longer linked to an agent**. The store logs every sale in our system with a printable receipt (receipt design comes after the plan is settled). Online and offline are **completely separate**: online reports stay as they are; offline sales are seen **per distributor** only, by the admin and by that distributor. Distributor stock is **excluded** from every admin stock total. No real distributors exist in production today, so there is no data migration. The agent↔distributor network feature **goes away**. Returns/exchanges are out of scope now but must not be designed out. No discounts. One shared login per store, used by an employee, picking items from a list and typing quantities, with internet.

## 1. Principles

1. **One codebase, one portal, two channels.** `Partner.partnerType` keeps its two values with new meaning: `AGENT` = online channel, `DISTRIBUTOR` = physical store. Same login, same shell, same inventory engine (`PartnerInventory`, `InventoryLedger`, counts, thresholds, intake receipts). What differs is the menu and the sales screen.
2. **Offline sales never touch the `Order` table.** They get their own tables, so every existing online report, KPI, notification and routing rule is untouched by construction.
3. **A distributor is never routed an online order.** Enforced server-side in the rules API (closes gap G1), not just by habit.
4. **Distributor stock is invisible to online totals.** Every admin aggregate over `PartnerInventory` filters `partner.partnerType = AGENT` unless the screen is explicitly the distributor's own page.
5. **Every stock change is a ledger line in the same transaction** (rule carried from 05 §6). A store sale is a ledger reason `STORE_SALE`; a void is `STORE_SALE_VOID`.
6. **Prices are snapshotted on the sale line** from the catalogue at the moment of sale (same rule as receipt lines), so a later price change never rewrites a receipt.

## 2. Data model (additive, then one removal phase)

```
model StoreSale {
  id             String   @id @default(cuid())
  partnerId      String                      // the store (partnerType DISTRIBUTOR)
  receiptNo      Int                         // per-store sequence, printed on the receipt
  status         StoreSaleStatus @default(COMPLETED)   // COMPLETED | VOIDED
  paymentMethod  StorePaymentMethod          // CASH | INSTAPAY | CARD
  customerPhone  String?                     // optional, normalised like User.phone
  customerName   String?
  sellerName     String?                     // free text: which employee rang it up (one login per store)
  subtotalPiastres Int                       // sum of lines; no discounts, no shipping
  notes          String?
  soldAt         DateTime @default(now())
  voidedAt       DateTime?
  voidReason     String?
  recordedByUserId String?
  createdAt      DateTime @default(now())
  partner Partner @relation(...)
  items   StoreSaleItem[]
  @@unique([partnerId, receiptNo])
  @@index([partnerId, soldAt])
  @@index([partnerId, status])
}
model StoreSaleItem {
  id            String @id @default(cuid())
  saleId        String
  variantId     String
  quantity      Int
  unitPricePiastres Int                      // catalogue price at sale time
  productName   String                       // snapshot for the receipt
  variantName   String                       // size / colour snapshot
  sku           String
  sale    StoreSale @relation(...)
  variant Variant   @relation(..., onDelete: Restrict)
  @@index([saleId]) @@index([variantId])
}
enum StoreSaleStatus { COMPLETED VOIDED }
enum StorePaymentMethod { CASH INSTAPAY CARD }
// InventoryLedgerReason gains STORE_SALE and STORE_SALE_VOID
// Partner gains: storeName String?, storeAddress String?, receiptFooter String? (printed thanks line; no tax fields, no policy line — D10/D12)
// No InstaPay field: the outlet takes its own money; the sale only records the payment TYPE (owner 2026-10-17).
```

`StockReceipt` is reused for the store's factory intake **as units only**: for a DISTRIBUTOR the `unitCostPiastres`/`totalCostPiastres` are null and the money report is not offered (they paid upfront). `linkedAgentId`, `RestockRequest*`, and the network feature are removed in the last phase.

**Why a per-store `receiptNo`:** the customer-facing receipt needs a short human number; the cuid stays the technical id. Assigned inside the sale transaction with `SELECT … FOR UPDATE` on the partner row.

**Void instead of delete:** a wrong entry is voided (stock returned by a `STORE_SALE_VOID` ledger line, receipt kept, marked ملغي). This is also the seam where returns/exchanges plug in later (a return = a negative sale referencing the original) without touching this design.

## 3. Screens

### Distributor portal (partnerType DISTRIBUTOR)
Menu: **اليوم · المبيعات · المخزون · التقارير · الإعدادات**. Removed for this type: الطلبات (online), الشبكة, طلبات التوريد, money report.

- **اليوم:** today's sales count and revenue, units sold, low-stock queue, last 5 receipts. No order queue, no SLA.
- **المبيعات / بيع جديد (the counter screen):** search box over the store's own stock (name / SKU / colour), tap to add, quantity stepper, running total, payment method, optional customer phone/name, seller name remembered per device. Confirm → one transaction: lock stock rows, refuse if any line exceeds sellable units ("المتاح 2 فقط"), write the sale + lines + ledger, assign `receiptNo`. Then the receipt view with **طباعة** (browser print, A5/80 mm thermal friendly, logo, store name, receipt no, date, lines, total, footer text) and **بيع جديد**. Built mobile-first for a phone at the counter; also fine on a PC.
- **المبيعات / السجل:** list by day with filters (date range, payment method, voided), receipt reopen + reprint, void with reason (same day by default; admin can void any).
- **المخزون:** the existing inventory hub as is (list, counts, movements, intake from the factory via `StockReceipt` kind FACTORY, thresholds). The store **enters its own intake** when the factory delivery arrives, exactly like an agent; admin can also record it (`recordedBy ADMIN`, already supported).
- **التقارير:** sales (units, revenue, by product, by payment method, by day) and inventory (cover, dead stock, reorder suggestions — the formulas exist). No fulfilment, no network, no money.
- **الإعدادات:** store name/address/receipt footer, thresholds, alerts. Working days/capacity/SLA/handover/service areas are hidden for this type (they are online concepts).

### Admin
- **الشركاء:** the list keeps both types with the type filter; the create/convert dialogs lose the "linked agent" field. A distributor detail page shows **المخزون** (their own), **المبيعات** (list + totals per period, receipt reopen, void), **الاستلامات** (intake), **الإعدادات**. No performance/SLA tab for stores.
- **Everything else unchanged**, with distributor stock filtered out of: products list stock column and export, product detail partner stock, stock-cover, partner stock totals, the daily stock snapshot cron, the online analytics queries (list in §5).
- **Routing rules:** the partner picker only offers AGENT partners; the API refuses a DISTRIBUTOR (G1 closed).

### Storefront
Nothing changes. Stores are not visible to customers.

## 4. What gets removed (last phase, after the new flow is live)
`app/(partner)/partner/{network,distributors,distributor-requests,restock-requests}`, `app/api/partner/{distributors/**,restock-requests/**,reports/network}`, `lib/inventory/restock-requests.ts`, `lib/analytics/partner-network-report.ts`, the `RestockRequest*` models, `Partner.linkedAgentId`, the "تابع لـ" copy in admin, the public `/partners` descriptions (new copy: "الموزع يبيع من متجره ويستلم بضاعته من المصنع"). Dropped with a migration that first asserts zero rows.

## 5. Places that must exclude distributor stock (found 2026-10-17)
`app/api/admin/products/[id]/route.ts`, `app/api/admin/products/export-excel/route.ts`, `lib/analytics/partner-inventory-report.ts`, `lib/analytics/partner-sales-report.ts`, `lib/analytics/partner-stock-totals.ts`, `lib/analytics/queries.ts`, `lib/inventory/partner-inventory.ts` (storefront paths already take a partner id; the "network" helpers filter by type), the stock-snapshot cron. One shared helper `onlinePartnerFilter()` used by all of them, with a unit test per call site.

## 6. Phases (each is one verified backlog item; numbering 11.x)

| # | Item | Depends on |
|---|---|---|
| 11.1 | Schema: `StoreSale*`, enums, ledger reasons, `Partner.storeName/storeAddress/receiptFooter/instapayIpa`; routing API refuses DISTRIBUTOR; `onlinePartnerFilter()` applied at every §5 call site with tests | — |
| 11.2 | Distributor portal shell: type-aware menu, اليوم for stores, settings subset | 11.1 |
| 11.3 | Counter screen + sale transaction + receipt view (print CSS) | 11.1 |
| 11.4 | Sales log, reopen/reprint, void with reason + ledger | 11.3 |
| 11.5 | Store reports (sales, inventory) | 11.3 |
| 11.6 | Admin: distributor detail (inventory, sales, intake), create/convert without agent, partners list copy | 11.3 |
| 11.7 | Legacy sweep: inventory dead code with a tool (knip/ts-prune), owner confirms the list, remove (see §8) | — |
| 11.8 | Removal of the agent↔distributor network feature + migration asserting zero rows; public `/partners` copy | 11.2–11.6 live |
| 11.9 | Receipt design on the canvas with the owner, 80 mm thermal only, then its print CSS (see §9, D11) | 11.3 |

Rough size: 11.1–11.6 is comparable to the partner-portal v2 round (about two weeks of implementer/verifier runs at the current pace), 11.7–11.9 a few days.

**Gap G4 (agents' InstaPay accounts hard-coded by name) is NOT part of this plan** — it concerns the online channel and stays a separate small backlog item.

## 7. Decisions (owner, 2026-10-17)
- **D1 — Receipt format:** owner asked for research (see §9); design supports both 80 mm thermal and A5 through print CSS.
- **D2 — Void window:** outlet same day only; admin any time. ✅
- **D3 — Customer phone:** optional free field, normalised, linkable later. ✅
- **D4 — Payments:** the system takes no money; it records the type only: CASH / INSTAPAY / CARD. ✅
- **D5 — Factory intake:** the outlet enters its own intake when goods arrive (same screen as agents). ✅
- **D6 — Prices:** always the catalogue price; an outlet cannot change a unit price; no discounts. ✅
- **D7 — Name:** **منفذ** everywhere in the UI (plural منافذ). Code keeps `DISTRIBUTOR`. ✅
- **D8 — Logins:** one shared login per outlet; no per-employee logins; `sellerName` is free text on the sale. ✅
- **D9 — InstaPay field on the partner:** dropped; not needed for outlets. ✅
- **D10 — Taxes:** none for now; no tax number, no VAT line on the receipt (owner 2026-10-17). `taxRegistrationNo` stays out of the schema until needed.
- **D11 — Receipt format:** **80 mm thermal only**, "with a very nice design" — a proper design round (11.9) on the canvas before the print CSS is final; A5 dropped.
- **D12 — Exchange policy line:** none printed. The footer is the thanks line only (`receiptFooter` optional, default "شكراً لتسوقكم من ملوك النيل").

## 8. Legacy sweep (owner 2026-10-17: "remove the unusable code that we don't need anymore to clean our old decisions")
Item 11.7 runs a dead-code inventory (knip or ts-prune over `app/`, `lib/`, `components/`, `hooks/`, plus a Prisma-model usage check) and brings the owner one list to confirm before deletion. Known candidates already: the agent↔distributor network feature (11.8), `cloudinaryLoader` in `lib/images/cloudinary-loader.ts` (unused since 10.42), the dead round-robin branch in `lib/rerouting/assign.ts` (**only after Q1 is decided**), the `PLACEHOLDER_IMAGE` Unsplash constants (replace with the neutral placeholder), any `*.test.ts` fakes for removed features, and docs sections describing removed behaviour. Rule: one PR per removal group, each with the counts/tests proving nothing referenced it; never remove a Prisma model without a migration that first asserts zero rows.

## 9. Receipt research (2026-10-17)
**Legal side (Egypt).** The Egyptian Tax Authority's B2C e-receipt system applies to taxpayers **named on the ETA's published lists** (latest expansion: Resolution 281/2025, effective 15 Sep 2025). Listed businesses must register each POS device and submit signed JSON receipts to the ETA platform within a short window; a printed or PDF receipt alone does not satisfy that obligation. Secondary sources disagree on details (24 h vs 72 h, a 2026 QR requirement), so: **the owner confirms with his accountant whether the outlets fall under an ETA list.** If not, a plain printed receipt is fine and this plan stands. If yes later, ETA integration is a separate project (device registration, signing, submission); the data we capture per sale is already what such a submission needs (seller identity, receipt no, date/time, lines with code/qty/unit price, totals, payment method), so nothing here is wasted.

**Common practice for clothing receipts (vendor POS documentation, no formal standard).** Header: logo, outlet name, address, phone, optional tax registration no. Body: receipt no, date and time, seller name, one line per item as **product – size – colour – SKU · qty × unit price = line total** (SKU on the receipt speeds up exchanges), item count, total. Footer: payment method, an exchange-policy line (e.g. "الاستبدال خلال 14 يوم بالفاتورة وبحالة سليمة"), thanks line. 80 mm thermal paper fits about 42 characters per line, so the layout uses flexible columns and wraps product names; the same template prints on A5 with the logo larger. No barcode/QR on v1 (nothing scans it); a QR with the receipt no can be added if ETA ever requires it.

Sources: [Comarch — Egypt expands e-receipt requirements from Sep 2025](https://www.comarch.com/trade-and-services/data-management/legal-regulation-changes/egypt-expands-e-receipt-requirements-for-b2c-transactions-from-september-2025/), [Flick — Egypt B2C e-receipt mandate](https://www.flick.network/en-eg/egypt-b2c-e-receipt-mandate), [e-invoicing.org — Egypt 2026](https://e-invoicing.org/egypt/), [invoicedataextraction — Egypt e-receipt compliance guide](https://invoicedataextraction.com/blog/egypt-electronic-receipt-compliance-guide), [WCPOS — thermal templates](https://docs.wcpos.com/receipts/thermal-templates), [Stockagile — sales ticket configuration](https://support.stockagile.com/en/articles/10477052-sales-ticket-and-return-policy-configuration).
