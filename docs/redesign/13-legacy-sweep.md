# 13 — Legacy sweep inventory (backlog 11.7, 2026-10-17)

Inventory only. **Nothing was deleted or changed** in `app/ lib/ components/ hooks/ prisma/`; this item adds `knip.json`, the `knip` dev dependency and this document. The owner ticks the checklist at the end; each ticked PR becomes its own backlog item with the proof listed under it. Branch `outlets/legacy-sweep-inventory`, base `outlets/integration-3` @ e290a4d.

## Method

- **knip 6.41** with the repo's `knip.json` (entries: Next special files under `app/`, `middleware.ts`, `instrumentation*.ts`, `next.config.ts`, `tailwind.config.*`, `playwright.config.ts`, `vitest.config.*`, `prisma.config.ts`; ignored: `tests/**`, `scripts/**`, `tools/**`, `codex/**`, `prisma/migrations/**`, `docs/**`, `.claude/**`, `design-canvas/**`). Run: `npx knip --reporter json`. Colocated `*.test.ts` files are picked up by knip's vitest plugin, so an export used only by a unit test is NOT reported by knip; `tests/e2e/**` is ignored, so e2e-only use is reported and was re-checked by grep.
- **ts-prune** (`npx ts-prune -p tsconfig.json`, ran fine): 736 lines in total, 312 inside `app/ lib/ components/ hooks/ contexts/` once route/page/layout files and tests are excluded; 259 of those are "used in module" and **53 are unused**. The 53 are a subset of knip's findings (ts-prune additionally lists the symbols inside knip's unused files); it adds nothing knip missed.
- **Cross-check by `git grep -w <name>`** over `app lib components hooks contexts tests scripts tools` for every one of the 209 export/type hits. Classes: **dead** (the name appears only on its own definition line), **internal-only** (used inside its own file; only the `export` keyword is surplus), **name-collision / duplicate** (the name appears elsewhere but as a different declaration or a comment), **test-only**.
- Prisma models/fields: `git grep` of every model's delegate (`prisma.<model>.` / `tx.<model>.`) and type name outside `prisma/`, then every field of `Partner`, `RestockRequest`, `RestockRequestItem`, `RoutedOrder`, `PaymentAttempt`, `ViewLog`, `PartnerRequest` (word-match counts, then hand-check of every field with at most 2 hits). No Prisma client was constructed and no database was touched.
- Env vars: every key of `lib/env.ts` vs `env.<KEY>` / `process.env.<KEY>` elsewhere.
- Proof that the inventory changed nothing: `npx tsc --noEmit` and `npm run test` (results in the PR description / final report).

### Counts

| | knip | ts-prune | after grep cross-check |
|---|---|---|---|
| unused files | 7 | n/a | 7 confirmed (`lib/partner/index.ts` is a barrel whose modules are all imported directly) |
| unused exports + types | 125 + 84 = 209 | 53 (in scope) | **22 dead** (18 exports, 4 types) · **151 internal-only** · **34 name-collision/duplicate** · **1 test-only** (`BALANCE_EXPONENT`) · 1 unused `default` re-export (`lib/db.ts`) |
| duplicate exports | 2 (`lib/db.ts`, `lib/redis.ts`: named + default, default never imported) | — | 2 confirmed |
| unused deps | 3 (`@neondatabase/serverless`, `@prisma/adapter-neon`, `@radix-ui/react-radio-group`) + 2 devDeps (`eslint`, `eslint-config-next`) | — | 3 confirmed, 2 **false positives** (the flat config `eslint.config.mjs:13` does `compat.extends("next/core-web-vitals", "next/typescript")`) |
| unlisted deps | 4 (`@eslint/eslintrc`, `postcss-load-config`, `dotenv`, `@tanstack/table-core`) | — | hygiene only: transitive deps imported directly |
| Prisma models with zero refs | — | — | **0** of 42 (`OtpAuditLog`, `CouponUsage`, `ViewLog`, `AddToCartLog`, `ShippingRule` each have a live writer) |
| Prisma fields never read | — | — | 4 (PR-F) |
| env vars read nowhere | — | — | 1 (`NEXT_PUBLIC_API_URL`) |

## The table

Risk: **none** = no behaviour change possible; **low** = visible only in an edge state or covered by existing tests; **migration** = needs a Prisma migration; **owner** = needs an owner decision. Recommendation: **PR-x** = remove in that PR; **keep**; **after Q1**; **11.8**.

### PR-A — Placeholder + duplicate cleanup (touches live files, tiny)

| Item | Kind | Evidence | Risk | Recommendation |
|---|---|---|---|---|
| `PLACEHOLDER_IMAGE` Unsplash constant x6 | dead branch / duplicate | defined in `app/(public)/cart/page.tsx:19`, `app/(public)/products/[slug]/product-page-content.tsx:35`, `components/cart/cart-drawer.tsx:19`, `components/checkout/order-review.tsx:7`, `components/shared/product-card.tsx:12`, and **`components/shared/quick-shop-modal.tsx:31`** (a sixth, not in the backlog list). Same photo `photo-1523381210434-271e8be1f52b` at three sizes; used as `item.imageUrl \|\| PLACEHOLDER_IMAGE` fallbacks; the PDP also keys `unoptimized` on it (`product-page-content.tsx:442,695`). `ProductImagePlaceholder` already exists (`components/shared/product-image-preview.tsx`, used in 4 files). | low (only for items without a photo; the PDP `unoptimized` checks must move with it) | PR-A. Then drop the `images.unsplash.com` remotePattern in `next.config.ts:8` (the only other mentions are strings in `lib/images/cloudinary-loader.test.ts:32,104`) |
| `DEFAULT_RECEIPT_FOOTER` = "شكراً لتسوقكم من ملوك النيل" | duplicate | `lib/sales/format.ts:9` (imported by `components/partner/sales/sale-receipt.tsx:11`) and `lib/partner/settings-schema.ts:55` (imported by `app/api/partner/settings/route.ts:11` and its test). Identical string. | none | PR-A: keep one, re-export from the other, update the importers |
| `RESERVED_FLOOR_MESSAGE` | duplicate | exported at `lib/inventory/apply-receipt.ts:30` (used :147) and re-declared non-exported at `lib/inventory/receipts.ts:197` (used :310) | none | PR-A |
| `toIsoDate` | duplicate | `lib/analytics/partner-reports.ts:65` (exported, 1 unit test) vs `lib/analytics/date-range.ts:5` (orphan file, PR-B) | none | PR-A/B: keep the `partner-reports.ts` one |
| `orderInclude` | duplicate | `lib/orders/partner-status-transition.ts:50` (exported, unused elsewhere) vs the local const `app/api/partner/orders/[id]/route.ts:26` | none | PR-A |
| Re-declared types: `ShippingProvider` (`lib/services/shipping.ts:15` and `lib/checkout/types.ts:28`), `TicketStatus`/`TicketMessage` (exported in `components/profile/order-ticket-types.ts`, re-declared in `app/(admin)/admin/order-tickets/**` and `orders/[id]/page.tsx:123`), `ColorOption` (`components/shared/color-swatches.tsx` vs `app/(admin)/admin/media/page.tsx:57`), `GovernorateOption` (`lib/storefront/bootstrap/governorate.ts` vs `components/storefront/governorate-selector.tsx:24`), barrel `lib/shipping/egypt-post-phase1/index.ts` re-exporting `constants.ts`/`calculator.ts` symbols | duplicate | these are the 34 "name found elsewhere" hits; I read the other-file matches: all are local re-declarations, comments or the barrel, none imports the flagged export | none | PR-A: import the exported one instead of re-declaring, or drop the surplus `export`; do only where files are touched anyway |
| `export default` in `lib/db.ts` and `lib/redis.ts` | duplicate | `git grep -E "import (prisma\|redis) from"` returns 0; all callers use the named export | none | PR-A |

### PR-B — Orphan files (7 knip hits and their satellites)

| Item | Kind | Evidence | Risk | Recommendation |
|---|---|---|---|---|
| `hooks/use-partner-dashboard.ts` (60 lines) | unused file | no importer (`usePartnerDashboard`: only its own file). Its only fetch is `GET /api/partner/dashboard` (`:46`), served by `app/api/partner/dashboard/route.ts`; nothing else calls that route. Superseded by `/api/partner/today`. | low | PR-B: remove hook **and** the `/api/partner/dashboard` route (owner nod, it is a route) |
| `components/shared/section-title.tsx` (55) | unused file | `SectionTitle` has no importer; only `00-feature-inventory/public/home.md` names the file | none | PR-B |
| `components/storefront/partner-registration-modal.tsx` (294) | unused file | `PartnerRegistrationModal` has no importer; only `docs/PARTNER_REGISTRATION_FEATURE.md:15` mentions it. The live flow is the `/partners` page + partner-requests API (keep). | low | PR-B; fix the doc line |
| `components/ui/radio-group.tsx` (35) + dep `@radix-ui/react-radio-group` | unused file + unused dep | no importer of `radio-group`; the dep is imported only by that file (`:4`). `01-design-system.md` lists radio-group in the primitive set. | low | **owner**: delete both, or keep as a deliberate design-system primitive. Recommendation: delete (re-add via shadcn when needed) |
| `lib/analytics/date-range.ts` (90) | unused file | `git grep "analytics/date-range"` in `*.ts/*.tsx` returns 0; its exports `resolveEndWhenStartChanges`, `clampStartDate`, `clampEndDate`, `rangeForPreset` are also ts-prune hits. Named in `00-feature-inventory/partner/reports.md:4,18` (historical). | none | PR-B |
| `lib/partner/index.ts` (3-line barrel) | unused file | `from "@/lib/partner"` returns 0; consumers import `resolve-threshold`, `cost-rate`, `working-day` directly | none | PR-B |
| `app/(admin)/admin/senior-promo-toggle.tsx` (84) | unused file | `SeniorPromoToggle` has no importer; `00-feature-inventory/admin/settings.md:41` already records it as orphaned. The API it calls, `/api/admin/settings/senior-promo`, **is** used by `admin/settings/page.tsx` and `profile/senior/page.tsx`: keep the route. | none | PR-B |

### PR-C — Dead exports (22; remove the symbol, not just the keyword)

| Item | Kind | Evidence | Risk | Recommendation |
|---|---|---|---|---|
| `getCourierFacingShippingPiastres` `lib/services/shipping.ts:18` | unused export | 1 grep hit (definition) | none | PR-C |
| `getOrderFunnel` + type `OrderFunnelRow` `lib/analytics/queries.ts:379,374` | unused export | 1 hit each | none | PR-C |
| `actionLabelAr` `lib/audit/action-labels.ts:44` | unused export | 1 hit | none | PR-C |
| `getGovernoratesWithAreas` `lib/data/egypt-areas.ts:210` | unused export | 1 hit | none | PR-C |
| `getSellableQuantityForPartnerVariant` `lib/inventory/partner-inventory.ts:108` | unused export | 1 hit | none | PR-C |
| `PARTNER_NAV_BOXES_ICON` `components/partner/partner-nav-config.ts:141` | unused export | 1 hit | none | PR-C |
| `listAllCloudinaryResources` `lib/media/cloudinary-admin.ts:59` | unused export | 1 hit | none | PR-C |
| `formatDateEnShort` `lib/format-en-numbers.ts:26` | unused export | 1 hit | none | PR-C |
| `ORDER_STATUS_BADGE_CLASSES` `lib/constants/order-status.ts:27` | unused export | 1 hit | none | PR-C |
| `DEFAULT_ITEM_WEIGHT_GRAMS` `lib/checkout/types.ts:46` | unused export | 1 hit | none | PR-C |
| `getDefaultCostRateBps` `lib/partner/cost-rate.ts:23` | unused export | 1 hit besides the dead barrel `lib/partner/index.ts` | none | PR-C after PR-B |
| `isNotificationKind`, `NOTIFICATION_KIND_LABEL` `lib/notifications/kinds.ts:18,23` | unused export | 1 hit each. **Keep `NOTIFICATION_KINDS`** (rows may exist; see 11.8 note) | none | PR-C |
| `piastresToEgpDisplay` `components/checkout/types.ts:89` | unused export | 1 hit | none | PR-C |
| `decryptNationalId` `lib/senior/encrypt.ts:48` | unused export | 1 hit. **Sensitive**: the only decryptor for stored senior national IDs; removing it makes those rows unreadable by the app. | owner | keep unless the owner confirms stored IDs are never read back |
| `PeriodBarButton` `components/partner/reports/period-bar.tsx:110` | unused export | 1 hit | none | PR-C |
| types `CategoryPublic` (`lib/catalog.ts:10`), `ApiResponse` (`lib/api/response.ts:18`), `PartnerRequestBody` (`lib/partner-request-schema.ts:32`), `AnalyticsDateRange` (`lib/analytics/types.ts:5`) | unused type | 1 hit each | none | PR-C |
| `orderToCourierRow`, `TEMPLATE_CITY_VALUES` `lib/courier-export.ts:232,36` | unused export | 1 hit each (the rest of the file is used by `csv-export` and `routed-orders/export`) | none | PR-C |
| `BALANCE_EXPONENT` `components/shared/catalog-image.tsx:30` | test-only export | used by one unit test only | none | keep |
| 151 further exports used only inside their own file (appendix) | surplus `export` keyword | grep: at least 2 hits, all in the defining file | none | **keep**; only worth acting on if the owner wants knip in CI (then set `ignoreExportsUsedInFile` or drop the keyword) |

### PR-D — Unused dependencies, env var, image loader

| Item | Kind | Evidence | Risk | Recommendation |
|---|---|---|---|---|
| `cloudinaryLoader` `lib/images/cloudinary-loader.ts:105` | unused export (**test-only**) | not flagged by knip because `lib/images/cloudinary-loader.test.ts` imports it. Non-test uses: 0 (`git grep -w cloudinaryLoader` finds the file, its test, and three comments: `product-page-content.tsx:33`, `cloudinary-loader.ts:81`, `tests/e2e/image-fit.spec.ts:44`); no `loaderFile` in `next.config.ts`. Its doc says "no longer used by `CatalogImage` since 10.42 … Kept, with its unit tests, in case a surface ever needs Cloudinary-side delivery". The live sibling `cloudinaryOriginSrc` (used by `catalog-image.tsx:3`) stays. | low | PR-D: delete `cloudinaryLoader` and its 9 test cases (lines 41-117), keep `cloudinaryOriginSrc`/`withTransform`/`ORIGIN_MAX_WIDTH`; fix the comment in `product-page-content.tsx:33` |
| `@neondatabase/serverless`, `@prisma/adapter-neon` | unused dep | `package.json:31-32`; no import anywhere; `lib/db.ts` builds a plain `PrismaClient`; no `driverAdapters` preview feature in `prisma/schema.prisma` | low (lockfile) | PR-D |
| `NEXT_PUBLIC_API_URL` | env var read nowhere | only `lib/env.ts:12` (schema) and `:56` (parse); no consumer | none | PR-D (it can also leave the Vercel env) |
| `process.env.*` read directly but absent from `lib/env.ts` (`NEXT_PUBLIC_WHATSAPP_NUMBER`, `NEXT_PUBLIC_CUSTOMER_SERVICE_PHONE`, `NEXT_PUBLIC_GA4_MEASUREMENT_ID`, `NEXT_PUBLIC_FACEBOOK_URL`, `NEXT_PUBLIC_META_PIXEL_ID`, `NEXT_PUBLIC_BRAND_NAME`, `SENTRY_*`, `VERCEL_URL`, `VERCEL_ENV`, `NEXT_RUNTIME`, `ALLOW_TEST_UPLOAD_FOLDER`) | schema gap (not dead) | live reads | none | note only |
| `eslint`, `eslint-config-next` | knip false positive | `eslint.config.mjs:13` | — | keep |

### PR-E — Routes with no caller (owner decision)

| Item | Kind | Evidence | Risk | Recommendation |
|---|---|---|---|---|
| `POST /api/admin/orders/courier-export` | unused route | no `fetch`/link in app, components, hooks, lib or tests (the admin orders page calls only `/api/admin/orders/csv-export`, `app/(admin)/admin/orders/page.tsx:247`); it builds the courier XLSX via `lib/courier-export.ts` | owner (may be called by hand) | **owner**; if removed, `buildCourierXlsx` stays (used by `app/api/partner/routed-orders/export/route.ts`) |
| `GET /api/partner/payments` | e2e-only route | only caller is `tests/e2e/partner-v2-foundation.spec.ts:270`; the partner UI reads payments through the money report | owner | keep until the partner payments view is decided |
| `GET /api/health` | no in-repo caller | external uptime probe | — | keep |

### PR-F — Orphan Prisma fields (each needs a migration)

| Item | Kind | Evidence | Risk | Recommendation |
|---|---|---|---|---|
| `Partner.alertsSeenAt` (`prisma/schema.prisma:654`) | orphan field | zero references in `app lib components hooks tests`; present only in the schema and migration `20260914110000_admin_and_partner_v2_additive` | migration | PR-F: `DROP COLUMN` |
| `RoutedOrder.notifiedAt`, `RoutedOrder.notificationError` (`schema.prisma:1028,1035`) | write-null-only fields | the only code mentions are `lib/orders/assign-partner.ts:120-121` setting both to `null`; never set non-null, never read | migration | PR-F: drop both and the two lines |
| `RoutedOrder.assignmentSequence` (`schema.prisma:1025`) | write-only field | only writer is the round-robin branch `lib/rerouting/assign.ts:117`; never read | migration | **after Q1**, with PR-G |
| `PaymentAttempt.providerRef` (`schema.prisma:551`) | write-only field | written at `lib/checkout/place-order.ts:387,397` (`dummy-<orderId>` for PAYMOB, else undefined); never read; `@@index([providerRef])` at :560 | migration | **owner**: keep until a real gateway exists |
| `RestockRequest`, `RestockRequestItem` (all fields) | live today | read by the network feature | — | **11.8** |
| `ViewLog`, `PartnerRequest`, all other `Partner`/`PaymentAttempt`/`RoutedOrder` fields | live | every field has a reader or writer; `ViewLog` is read at `lib/storefront-data.ts:101` and `app/api/products/recommendations/route.ts:43` | — | keep |

### PR-G — Round-robin (blocked on Q1)

| Item | Kind | Evidence | Risk | Recommendation |
|---|---|---|---|---|
| Round-robin branch `lib/rerouting/assign.ts:76-143` (rule lookup, `lastAssignedPartnerId` pointer, `assignmentSequence`, the `notifyOrderAssigned` call inside it) | dead branch in production, live in tests | The branch runs only when `order.assignedPartnerId` is null (`:41` returns earlier otherwise). Callers of `assignOrderToGovernorate`: `app/api/checkout/place-order/route.ts:117` and `app/api/admin/orders/route.ts:213`, both right after `placeOrder`. The **only** `tx.order.create` in `app lib scripts tools` is `lib/checkout/place-order.ts:308`, which always sets `assignedPartnerId: selectedPartner.partnerId` (`:325`) and fails the order with `NO_PARTNER` otherwise. Nothing writes `assignedPartnerId: null` (`app/api/admin/orders/route.ts:72`, `lib/admin/orders-list.ts:35`, `lib/admin/today.ts:116` are filters). So no current write path reaches the branch; only legacy pre-9.9 rows and the specs below do. The UNROUTED paths at `:64-97` belong to the same dead region. **Caveat:** the pointer is also *read* at `lib/inventory/partner-inventory.ts:205` (the admin-created-order ordering in `findFulfillablePartnerForGovernorate`), so Q1's answer decides whether the pointer dies or becomes the real fallback. | owner + migration | **after Q1**. If round-robin is dropped: remove `assign.ts:76-143`, `ReroutingRule.lastAssignedPartnerId` (+ relation `ReroutingRuleLastPartner`), `RoutedOrder.assignmentSequence`, the rotation at `partner-inventory.ts:205-209`, e2e cases in `tests/e2e/admin-v2-routing.spec.ts` ("round-robin assigns both partners in turn", "pause_partner is audit-logged and round-robin then only picks the active one"), the second case of `lib/rerouting/assign-notify.test.ts` (`:96-111`), and mark `11-partner-types-analysis.md` G5 resolved. If Q1 chooses rotation, nothing here is dead. |

### PR-H — Agent-distributor network feature (this is 11.8)

| Item | Kind | Evidence | Risk | Recommendation |
|---|---|---|---|---|
| Plan §4 paths: `app/(partner)/partner/network` (2 files, 155 lines), `distributors` (14), `distributor-requests` (14), `restock-requests` (15); `app/api/partner/distributors` (2 files, 175), `app/api/partner/restock-requests` (2, 243), `app/api/partner/reports/network` (23); `lib/inventory/restock-requests.ts` (225); `lib/analytics/partner-network-report.ts` (262, + test); `components/partner/network` (2, 448); `components/partner/restock` (4, 278) | live today, removable with the models | all present and reachable until 11.8 | migration (zero-row assertion) | **11.8** as already specced |
| **Found now, not in plan §4 or the 11.8 text:** `app/(partner)/partner/stock/requests/` (`page.tsx` 534 lines + `layout.tsx`), the tab "طلبات التوريد" in `components/partner/stock/stock-tabs.tsx:26`, the link at `app/(partner)/partner/stock/page.tsx:404`, e2e at `partner-v2-stock.spec.ts:47,615,639` and the redirects asserted in `partner-v2-foundation.spec.ts:120-121` | network feature | this is the merged restock UI (5.4); the old `restock-requests` and `distributor-requests` page folders are now only redirects to it | — | add to 11.8 |
| `components/partner/reports/network-report-view.tsx` (166) | network feature | 11.8 names `components/partner/network-report-view.tsx`; the real path is under `reports/` | — | 11.8 (fix the path in the entry) |
| `components/partner/role-gate-panel.tsx` (`PartnerRoleGatePanel`: "هذه الصفحة متاحة للوكلاء فقط" / "هذه الصفحة متاحة للموزعين فقط") | wrong-role panel | imported by exactly three files, all network/restock: `app/(partner)/partner/network/page.tsx:22`, `app/(partner)/partner/stock/requests/page.tsx:31`, `components/partner/reports/network-report-view.tsx:18`. Three **copies** of a local `RoleGatePanel` with the agents-only copy: `app/(partner)/partner/stock/intake/[id]/page.tsx:56`, `intake/new/page.tsx:71`, `components/partner/stock/receipts-list.tsx:47` | low | 11.8 for the shared one; the three copies stay while agents-only pages exist (fold into one component then) |
| Admin copy "تابع لـ…" (comment `app/api/admin/partners/route.ts:66`; subtitle `app/(admin)/admin/partners/page.tsx:262`), `linkedAgent` in `app/(admin)/admin/partners/page.tsx:86`, `app/api/admin/partners/[id]/route.ts:34,66,129-151`, `app/api/admin/partner-requests/[id]/convert/route.ts:27-55`, the 400 "المنفذ لا يرتبط بوكيل" tested in `route.outlet.test.ts` x2, and the copy "الوكيل المرتبط" at `stock/requests/page.tsx:268` | linked-agent | 16 non-test files mention `linkedAgent`; 17 files contain "موزع" | migration | 11.8 plus the grep gate named there |
| Edit-only files that mention restock or the network and need changes, not deletion, in 11.8: `app/(partner)/partner/page.tsx`, `stock/page.tsx`, `stock/movements/page.tsx`, `stock/intake/new/page.tsx`, `app/api/partner/{dashboard,inventory,receipts,today}/route.ts`, `components/partner/{partner-nav-config.ts,stock/receipts-list.tsx,today/*}`, `hooks/use-partner-today.ts`, `lib/inventory/{partner-inventory,receipts}.ts`, `lib/partner/outlet-today.ts`, `lib/audit/describe-admin-audit.ts` (+ test), `app/(admin)/admin/audit/page.tsx`, `app/(public)/partners/page.tsx` | network feature | 35 files match `restock` / `RestockRequest` (case-insensitive) | — | 11.8 |

### PR-I — Keep / separate items

| Item | Kind | Evidence | Risk | Recommendation |
|---|---|---|---|---|
| Hard-coded InstaPay partner map `lib/checkout/instapay.ts:6-12,15-26` ("AlJamal Home", "محمد عمران") | hard-coded config (gap G4) | live: `app/(public)/checkout/checkout-content.tsx:152` calls `getInstapayDetailsForPartner(summary?.partnerName)`. knip lists the nine constants as internal-only. | owner | **keep; separate backlog item** (move to `Partner` fields) |
| `tools/inventory-dashboard` | owner's local tool | outside the app bundle; ignored by knip | — | **keep** |
| Unlisted deps `dotenv` (`prisma.config.ts`), `postcss-load-config` (`postcss.config.mjs`), `@eslint/eslintrc` (`eslint.config.mjs`), `@tanstack/table-core` (`components/ui/data-table.tsx`) | hygiene | transitive deps imported directly | low | optional: add explicitly; not a removal |
| `tsconfig.tsbuildinfo` | generated file tracked in git | `git ls-files` lists it; it changes on every `tsc` run and pollutes `git grep` | low | owner decision: `git rm --cached` + `.gitignore` |

### PR-J — Stale docs (describe behaviour that is gone or about to go)

| Item | Kind | Evidence | Risk | Recommendation |
|---|---|---|---|---|
| `05-partner-portal-v2.md`: IA table rows "المخزون" (restock/distributor redirects, line 29) and "الشبكة (AGENT)" (line 30), line 83 (restock screens), §4.5 "الشبكة (AGENT)" (lines 85-87), §4.6 "Network (agent)" report row (line 97) | stale after 11.8 | the whole agent network is removed in 11.8; the file has 5 "distributor" and 5 "restock" hits | none | PR-J: mark "removed in 11.8" after it merges (do not rewrite history) |
| `06-admin-v2.md` lines 29 ("Applications + agents + distributors"), 53 ("every agent and distributor"), 55 ("linked agent"), 135 ("linked agent" row), 145 ("Restock requests distributor ↔ agent") | stale after 11.8 | 3 "distributor", 2 "linked agent", 1 "restock" hits | none | PR-J |
| `11-partner-types-analysis.md` §1-§2 (DISTRIBUTOR as the agent's downstream), gaps G1, G2, G3 (distributor routed / unlinked / money), G5 (round-robin dead; resolved by Q1) | stale after the 12-plan | the type was redefined as a physical outlet (D1-D12 in `12-distributor-store-plan.md`) | none | PR-J: banner "superseded by 12-distributor-store-plan.md"; G4, G6, G7 remain true |
| `00-feature-inventory/partner/{distributor-requests,distributors,restock-requests,dashboard}.md`, `admin/{partner-inventory,partners,rerouting-rules,routed-orders,categories,dashboard,settings}.md`, `auth/{login,register}.md` | stale after 11.8 | 10 inventory files match `network\|restock\|distributor-requests` | none | PR-J: banner; keep as history |
| `docs/PARTNER_REGISTRATION_FEATURE.md:15` | stale now | names the unused `partner-registration-modal.tsx` | none | with PR-B |
| `09-notifications-plan.md` | not in this worktree | untracked in the main tree, so it could not be sampled | — | re-sample once committed |

## What knip and the grep pass could not see

- Dynamic `import()` with template strings, computed `require`, and string-built URLs (`/api/...${id}`): the route-caller check is a literal-prefix grep over `app components hooks lib contexts`, so a route reached only from outside the repo or via a computed URL looks unused (hence PR-E is "owner").
- Individual HTTP-method exports of `route.ts` files (an unused `DELETE`, say) and Next metadata exports: entries are always treated as used.
- `tests/**`, `scripts/**`, `tools/**`, `codex/**` are ignored by config, so e2e-only and script-only consumers appear as unused in knip; they were re-checked by grep (found: `/api/partner/payments` e2e-only; none for scripts or tools).
- Prisma usage is name-based grep (no relation-traversal), so a relation field with a common name is judged by hand only for the models listed in the method.
- Docs: only 05, 06, 11 and the feature inventory were sampled.

## Owner checklist

Tick what goes. Each ticked PR is built as its own backlog item and must keep `npx tsc --noEmit`, `npm run lint` and `npm run test` green; proof to attach is listed.

- [ ] **PR-A** placeholders and duplicates (6 Unsplash constants to `ProductImagePlaceholder`, the `images.unsplash.com` remotePattern, `DEFAULT_RECEIPT_FOOTER`, `RESERVED_FLOOR_MESSAGE`, `toIsoDate`, `orderInclude`, default exports). Proof: `git grep unsplash` = 0 outside docs; screenshots of cart, drawer, order review, product card, PDP, quick-shop with a photo-less item at 375 and 1514 px; `lib/partner/settings-schema.test.ts`, `lib/inventory/receipts.test.ts`, `apply-receipt.test.ts` green.
- [ ] **PR-B** orphan files (hook + `/api/partner/dashboard`, `section-title`, `partner-registration-modal`, `date-range`, `lib/partner/index.ts`, `senior-promo-toggle`) and, if wanted, `components/ui/radio-group.tsx` + `@radix-ui/react-radio-group`. Proof: `npx knip` reports 0 unused files; `git grep` of each removed name = 0; `partner-v2-foundation` and `admin-v2-settings` specs green.
- [ ] **PR-C** the 22 dead exports (`decryptNationalId` stays unless told otherwise). Proof: knip export count drops accordingly; unit suite unchanged.
- [ ] **PR-D** `cloudinaryLoader` + its 9 cases, `@neondatabase/serverless`, `@prisma/adapter-neon`, `NEXT_PUBLIC_API_URL`. Proof: `npm ls` clean, `npm run test`, `tests/e2e/image-fit.spec.ts` green.
- [ ] **PR-E** decide `POST /api/admin/orders/courier-export` (remove / keep) and `GET /api/partner/payments` (keep until the payments view is decided).
- [ ] **PR-F** one migration dropping `Partner.alertsSeenAt`, `RoutedOrder.notifiedAt`, `RoutedOrder.notificationError` (rehearse on a backup branch first). `PaymentAttempt.providerRef` stays unless told.
- [ ] **PR-G** round-robin removal. Blocked on **Q1**; Q2 (10.28) and Q3 (10.36) are unaffected by this sweep.
- [ ] **PR-H = 11.8** network feature, now also covering `app/(partner)/partner/stock/requests`, the stock tab "طلبات التوريد", `components/partner/reports/network-report-view.tsx` (real path), `components/partner/role-gate-panel.tsx`, and the edit-only files listed.
- [ ] **PR-I** keep list confirmed (InstaPay map as its own item for G4, `tools/inventory-dashboard`); decide whether `tsconfig.tsbuildinfo` leaves git.
- [ ] **PR-J** stale-doc banners (05, 06, 11, feature inventory, `PARTNER_REGISTRATION_FEATURE.md`) after 11.8 merges.

## Appendix — 151 internal-only exports (surplus `export` keyword; no action recommended)

- `components/auth/auth-ui.tsx` — `authOutlineActionClass`, `AuthOutlineButton`
- `components/dashboard/dashboard-shell.tsx` — `DashboardTopbarSlotContext`, `NavIcon`, `ShellNavItem`, `ShellIdentity`, `ChromeAttr`
- `components/dashboard/kpi-card.tsx` — `KpiDeltaPill`
- `components/dashboard/sidebar-collapse.tsx` — `SIDEBAR_COLLAPSED_KEY`
- `components/orders/order-timeline.tsx` — `describeOrderAuditEntry`
- `components/partner/partner-nav-config.ts` — `OUTLET_MOBILE_TABS`, `PartnerNavItem`
- `components/partner/reports/headline-tiles.tsx` — `formatHeadlineValue`
- `components/partner/restock/status-pill.tsx` — `RESTOCK_STATUS_LABELS`
- `components/partner/restock/types.ts` — `RestockRequestPartyInfo`, `DestinationStock`
- `components/partner/sales/sales-log.tsx` — `presetRange`
- `components/profile/order-ticket-types.ts` — `TicketAuthorRole`
- `components/shared/size-chips.tsx` — `SizeOption`
- `components/shared/sort-dropdown.tsx` — `SORT_OPTIONS`
- `components/ui/badge.tsx` — `badgeVariants`
- `components/ui/button.tsx` — `buttonVariants`, `ButtonProps`
- `components/ui/card.tsx` — `CardFooter`
- `components/ui/dropdown-menu.tsx` — `DropdownMenuCheckboxItem`, `DropdownMenuRadioItem`, `DropdownMenuLabel`, `DropdownMenuShortcut`, `DropdownMenuGroup`, `DropdownMenuPortal`, `DropdownMenuSub`, `DropdownMenuSubContent`, `DropdownMenuSubTrigger`, `DropdownMenuRadioGroup`
- `components/ui/form.tsx` — `useFormField`
- `components/ui/input.tsx` — `InputProps`
- `components/ui/popover.tsx` — `PopoverAnchor`
- `components/ui/select.tsx` — `SelectProps`
- `components/ui/sheet.tsx` — `SheetPortal`, `SheetOverlay`
- `components/ui/table.tsx` — `TableFooter`, `TableCaption`
- `components/ui/textarea.tsx` — `TextareaProps`
- `components/ui/toast.tsx` — `ToastAction`
- `hooks/use-admin-me.ts` — `AdminMe`
- `hooks/use-partner-me.ts` — `PartnerMe`
- `hooks/use-partner-settings.ts` — `PartnerSettings`, `ThresholdsData`
- `hooks/use-partner-today.ts` — `PartnerTodayGroup`, `PartnerTodayTrendPoint`, `PartnerTodayResponse`
- `hooks/use-toast.ts` — `reducer`
- `hooks/use-variant-selection.ts` — `variantColorHex`
- `lib/addresses/completeness.ts` — `hasSavedAddressCity`
- `lib/admin/today.ts` — `AdminTodayQueues`, `AdminTodayKpis`, `AdminTodayTrendPoint`, `AdminRecentActivityRow`
- `lib/analytics/network-stock.ts` — `computeNetworkStockStatus`, `NetworkStockStatus`
- `lib/analytics/outlet-sales-report.ts` — `OutletSaleLine`, `OutletProductRow`, `OutletPaymentRow`, `OutletAttributeRow`, `OutletDayRow`, `OutletHourRow`, `OutletSalesBreakdowns`
- `lib/analytics/partner-fulfilment-report.ts` — `SlowestOrderRow`, `CancellationReasonRow`, `FulfilmentPartnerBreakdownRow`, `FulfilmentReportBreakdowns`
- `lib/analytics/partner-inventory-report.ts` — `InventoryPartnerBreakdownRow`, `InventoryReportBreakdowns`
- `lib/analytics/partner-money-report.ts` — `CollectedByMethodRow`, `CollectedByWeekPoint`, `MoneyPartnerBreakdownRow`, `MoneyReportBreakdowns`
- `lib/analytics/partner-network-report.ts` — `DistributorNetworkRow`, `NetworkReportBreakdowns`
- `lib/analytics/partner-reports.ts` — `ALL_TIME_FROM`, `DeltaDirection`, `ReportSeriesPoint`
- `lib/analytics/partner-sales-report.ts` — `ACCOMPLISHED_STATUSES`, `ACTIVE_STATUSES`, `statusesForOrderSet`, `PartnerBreakdownRow`
- `lib/analytics/partner-stock-totals.ts` — `STOCK_TOTALS_VELOCITY_WINDOW_DAYS`
- `lib/analytics/queries.ts` — `StockReportRow`, `OrderFunnelRow`
- `lib/api/response.ts` — `ApiSuccess`, `ApiError`
- `lib/audit/retention.ts` — `AUDIT_RETENTION_DAYS`
- `lib/auth/forgot-password.ts` — `verifyResetToken`
- `lib/auth/otp.ts` — `logOtpEvent`, `verifyOtp`, `VerifyOtpResult`
- `lib/cart/guest.ts` — `GUEST_COOKIE_NAME`, `guestCookieOptions`
- `lib/catalog-export.ts` — `CATALOG_EXPORT_HEADERS`, `CatalogExportVariant`
- `lib/catalog.ts` — `ProductListItemVariantInput`, `SortOption`
- `lib/checkout/instapay.ts` — `INSTAPAY_IPA`, `INSTAPAY_QR_IMAGE`, `ALJAMAL_HOME_PARTNER_NAME`, `ALJAMAL_HOME_INSTAPAY_IPA`, `ALJAMAL_HOME_INSTAPAY_QR_IMAGE`, `MOHAMED_OMRAN_PARTNER_NAME`, `MOHAMED_OMRAN_INSTAPAY_IPA`, `MOHAMED_OMRAN_INSTAPAY_QR_IMAGE`, `INSTAPAY_PLAY_STORE_URL`, `INSTAPAY_APP_STORE_URL`
- `lib/checkout/place-order.ts` — `OutOfStockItem`
- `lib/constants/order-ticket.ts` — `ORDER_TICKET_STATUS_LABELS`
- `lib/courier-export.ts` — `COURIER_EXPORT_HEADERS`, `CourierExportRow`
- `lib/inventory/apply-receipt.ts` — `RawReceiptLine`
- `lib/inventory/partner-inventory.ts` — `PartnerShortage`
- `lib/inventory/receipts.ts` — `RECEIPT_VALUE_HEADER`, `COUNT_VALUE_HEADER`
- `lib/menu-config.ts` — `MenuSectionItem`
- `lib/notifications/kinds.ts` — `NOTIFICATION_KINDS`
- `lib/notifications/retention.ts` — `NOTIFICATION_RETENTION_DAYS`
- `lib/notifications/unread-cache.ts` — `UNREAD_TTL_SEC`
- `lib/orders/order-sla.ts` — `slaHoursForOrderStatus`
- `lib/orders/partner-status-transition.ts` — `assertNotBackToCreated`
- `lib/partner/cost-rate.ts` — `DEFAULT_COST_RATE_BPS`, `SITE_SETTING_KEY_DEFAULT_COST_RATE_BPS`
- `lib/partner/outlet-today.ts` — `OUTLET_TREND_DAYS`, `OUTLET_RECENT_RECEIPTS`, `OUTLET_LOW_STOCK_ROWS`, `OutletPaymentMethod`
- `lib/partner/settings-schema.ts` — `WORKING_DAY_CODES`, `HANDOVER_METHODS`, `OUTLET_ONLY_SETTINGS_FIELDS`
- `lib/partner/working-day.ts` — `ISO_DAY_CODES`
- `lib/redis/otp-limits.ts` — `otpCooldownKey`, `otpLockKey`
- `lib/reports/print/build.ts` — `formatCount`, `formatPct1`
- `lib/reports/print/render.ts` — `PrintTile`
- `lib/sales/list-sales.ts` — `SALES_PAGE_SIZE`, `SALES_MAX_PAGE_SIZE`, `SaleStatusFilter`
- `lib/sales/validation.ts` — `MIN_LINE_QTY`
- `lib/services/pricing.ts` — `computeBogoQuantityDiscount`, `LineInput`
- `lib/services/whatsapp.ts` — `SendResult`
- `lib/settings.ts` — `SITE_SETTING_KEYS`
- `lib/storefront-location.ts` — `getStorefrontGovernorateFromCookies`
- `lib/storefront/bootstrap/coupon-messages.ts` — `CouponPopupMessage`
