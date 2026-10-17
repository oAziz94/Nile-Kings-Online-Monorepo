# Partner types — what exists today and what each can do (2026-10-17)

Baseline for the next system extension (owner: "we need to extend our system for something, but first analyze what types of partners we have and what each can do"). Traced from `prisma/schema.prisma`, `app/api/partner/**`, `app/(partner)/partner/**`, `lib/inventory/partner-inventory.ts`, `lib/rerouting/assign.ts`, `lib/orders/partner-status-transition.ts`, `lib/checkout/instapay.ts`.

## 1. The two types

`Partner.partnerType` is an enum with exactly two values. Every other difference in the system derives from it plus one optional link.

| | **AGENT (وكيل)** | **DISTRIBUTOR (موزع)** |
|---|---|---|
| Public copy (`/partners`) | "يحتفظ بالمخزون ويشرف على الموزعين المرتبطين بحسابه" | "يبيع من مخزون الوكيل الخاص به ويطلب منه إعادة التوريد عند الحاجة" |
| Where their stock comes from | The factory: `StockReceipt` (intake), CSV import | Their agent: approved `RestockRequest` transfers units from the agent's `PartnerInventory` to theirs |
| Link | `distributors[]` (0..n distributors with `linkedAgentId = this`) | `linkedAgentId` → one agent (optional; a distributor with no agent is possible in data but has no supply path) |
| Login | `User.role = PARTNER`, `Partner.userId` | same |
| Onboarding | `PartnerRequest` (public form) → admin converts; admin can also create directly | same, admin picks the agent at conversion/creation |

Both types share the same record shape: governorate, phone, social links, `isActive`, `lowStockThreshold` + per-category/product overrides, working days, daily capacity, confirm/ship SLA hours, handover method (COURIER / PICKUP / OWN_DELIVERY), service areas (inform-only), alert prefs, `costRateBps` (the wholesale buying rate, admin-only write), dead-stock days, target cover days.

## 2. Capability matrix (server-side gates, not just menu visibility)

| Capability | AGENT | DISTRIBUTOR | Where gated |
|---|---|---|---|
| Own inventory list, ledger, movements, CSV export | ✅ | ✅ | `inventory`, `inventory/ledger`, `inventory/export` |
| Stock counts (adjustments with reason) | ✅ | ✅ | `stock/counts` page → inventory write path |
| Factory intake (`StockReceipt` create/apply, cost snapshotted at `costRateBps`) | ✅ | ❌ 403 | `receipts`, `receipts/[id]` |
| CSV stock import | ✅ | ❌ 403 | `inventory/import` |
| Receive routed orders (be a partner in a `ReroutingRule`) | ✅ | ✅ **(no type check in the rules API)** | `admin/rerouting-rules/[id]/partners` |
| See own orders list | ✅ | ✅ | `routed-orders` (any partner) |
| Open an order, change its status, bulk status, pick list | ✅ | ❌ 403 | `orders/[id]`, `routed-orders/bulk-status` |
| Restock requests — create (ask my agent) | ❌ 403 | ✅ | `restock-requests` POST |
| Restock requests — approve/reject/fulfil (transfer stock to the distributor) | ✅ | ❌ | `restock-requests/[id]` |
| Network page (distributor roster, their stock, their requests, fill rate) | ✅ | ❌ 403 | `distributors`, `distributors/[id]/stock`, `reports/network` |
| Reports: sales, fulfilment, inventory, money | ✅ | ✅ | `reports/*` |
| Report: network | ✅ | ❌ | `reports/network` |
| Settlement payments view (what I owe the factory) | ✅ | ✅ (no gate) | `payments` |
| Settings (thresholds, alerts, working days, capacity, SLA, handover, areas) | ✅ | ✅ | `settings`, `settings/thresholds` |
| Notifications bell + history | ✅ | ✅ | shared |
| InstaPay account shown to customers | per partner by **name** (hard-coded map in `lib/checkout/instapay.ts`: default, AlJamal Home, محمد عمران) | same mechanism | — |

## 3. How orders reach a partner (summary of the Q1 trace, 2026-10-15)

1. The storefront resolves the customer's governorate to the **priority-1 partner** of that governorate's `ReroutingRule`; only that partner's stock is shown.
2. Checkout passes that partner as authoritative; the order reserves at it; no fallback to partner 2.
3. The partner confirms (stock committed), processes, ships, delivers, or cancels (stock released). Each move writes `InventoryLedger` in the same transaction. SHIPPED → earlier is refused.
4. Admin can reassign an order to another partner manually (`assignOrderToPartner`, refuses terminal statuses).
5. Admin-created orders try partners in priority order and take the first that covers the whole cart.

## 4. Money model (decision 2026-09-13)

Wholesale at a transfer price: the partner buys stock from the factory at `costRateBps` of the selling price (per partner, admin-set) and collects the full price from the customer (COD at delivery or InstaPay into **the partner's own account**). Nothing is held by the company. The Money report has two sides: what the partner owes the factory for received stock minus `PartnerPayment`s, and what the partner has sold. For a distributor, "received stock" is what their agent transferred; the factory-facing debt is the **agent's** (the receipt is the agent's) — the distributor↔agent settlement is **outside the system today**.

## 5. Gaps and inconsistencies worth knowing before extending

- **G1 — A DISTRIBUTOR can receive orders but cannot act on them.** The rules API accepts any partner type, the orders list shows them, but `orders/[id]`, bulk status and the pick list are AGENT-only. If a distributor is ever put in a rule, their orders are stuck until the admin moves them. Decide: either distributors are never routed (enforce in the rules API) or they get the same order actions as agents.
- **G2 — Distributor with no agent** is representable (`linkedAgentId` nullable) but has no supply path and no network owner.
- **G3 — Distributor↔agent money** is not modelled (no price, no payment record between them). The factory sees only the agent's debt.
- **G4 — InstaPay account per partner is a hard-coded name map**, not a field on `Partner`. Every new partner with their own account needs a code change; a renamed partner silently falls back to the default account.
- **G5 — Round-robin pointer is dead code** (Q1); priority-1 always wins.
- **G6 — Capacity, SLA, working days and service areas are inform-only**; nothing routes or refuses on them (decision 2026-09-13, "routing effects are a later decision").
- **G7 — Handover method (COURIER / PICKUP / OWN_DELIVERY)** is stored and shown but does not change the courier export or the customer's shipping fee.

## 6. Live counts

Not read for this analysis (production read needs `.env.deploy`). Known partners from the InstaPay map and recent cases: جمال السيد عبدالعزيز (الجيزة, sole partner for كفر الشيخ via rule), AlJamal Home, محمد عمران. Ask the PM for a one-off count by type, governorate and rule membership when scoping the extension.
