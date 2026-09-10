# Admin — Categories

Route(s): `app/(admin)/admin/categories/page.tsx` (single page — list + create/edit/delete all via dialogs, no separate `[id]`/`new` routes)
Key files: `components/dashboard/{empty-state,page-header,panel-card}.tsx`, `lib/admin/slug.ts` (`slugify`), `app/api/admin/categories/route.ts`, `app/api/admin/categories/[id]/route.ts`

## Business requirements
- **Goal/KPI**: operational efficiency for catalog organization — categories are the only grouping mechanism for products (flat, single-level; no subcategories, per the page's own description text: "تنظيم المنتجات في فئات بدون تصنيفات فرعية"). Category `sortOrder` and `slug` feed storefront navigation/URLs (`/categories/[slug]`), so this screen indirectly affects storefront IA and SEO (stable category URLs).
- **Trust/credibility signals**: none directly customer-facing on this screen itself, but category slugs are public URLs — changing a slug here changes a live storefront route, with no redirect/alias mechanism visible in the code (see Edge cases).
- **Friction points**: no way to reorder categories via drag-and-drop or bulk action — `sortOrder` is a manually-typed integer per category, edited one row at a time via the edit dialog. No search/filter on this list (acceptable given categories are typically a small, low-cardinality set, but worth confirming with PM if the catalog is expected to grow many categories).
- **Compliance/legal**: none specific.
- **Modern-look rationale**: none beyond consistency with other admin list screens (table + dialogs + `PanelCard`).

## Elements & behavior
- [ ] `PageHeader` — title "الفئات", description "تنظيم المنتجات في فئات بدون تصنيفات فرعية.", actions slot hosts all three dialogs' triggers/content (create dialog trigger button is the only one visibly rendered inline; edit/delete dialogs are conditionally rendered but mounted in the same actions slot, controlled by `editId`/`deleteId` state rather than a visible trigger button there).
- [ ] Single `GET /api/admin/categories` call on mount loads the full unpaginated list — **no pagination, no search box on this screen** (only list screen among the three read so far without one). Sorted `sortOrder asc, name asc` server-side.
- [ ] Table columns: الاسم, الرابط (raw `slug` text, not a link), ترتيب (`sortOrder` raw integer), عدد المنتجات (`productCount`, computed server-side via Prisma `_count.products`), إجراءات (Edit pencil icon-button, Delete trash icon-button — **disabled when `productCount > 0`**).
- [ ] "إضافة فئة" (create) dialog — fields: الاسم (required, trimmed), الرابط/slug (optional — server derives from name via `slugify()` if blank, then lowercases and strips to `[a-z0-9-]`, falling back to literal `"cat"` if that yields empty). No `sortOrder` field on create (defaults to `0` server-side if omitted — meaning every newly created category sorts first among `asc`-ordered ties unless later edited). Client validation: only checks `name.trim()` (toast "الاسم مطلوب" if empty). On success: toast "تم إنشاء الفئة", dialog closes, form fields reset, list reloads.
- [ ] "تعديل" (edit) dialog — same fields as create **plus** ترتيب العرض (`sortOrder`, numeric input, parsed via `Number(...) || 0`). Uses `PATCH /api/admin/categories/{id}`. Same client validation (name required). On success: toast "تم تحديث الفئة", dialog closes, list reloads.
- [ ] "حذف" (delete) confirmation dialog — static warning text "هل أنت متأكد من حذف هذه الفئة؟ لا يمكن حذف فئة تحتوي على منتجات." (cannot delete a category containing products) — this is stated proactively in the confirmation copy itself, not just as a fallback error. Uses `DELETE /api/admin/categories/{id}`. Delete button shows "جاري الحذف…" while in flight.
- [ ] Server-side slug-uniqueness check on both create and edit (409 "الرابط (slug) مستخدم مسبقاً" on conflict) — same pattern as products.
- [ ] Server-side delete guard: 400 "لا يمكن حذف فئة تحتوي منتجات" if `_count.products > 0` — mirrored client-side by disabling the delete button whenever `productCount > 0`, so in normal use the confirmation dialog for a non-empty category is never reachable at all (the trash icon itself is disabled, not just the confirm action).
- [ ] No bulk actions (no multi-select, no bulk delete/reorder) anywhere on this screen.
- [ ] `Product.category` relation uses `onDelete: Restrict` at the DB level (`prisma/schema.prisma`), which is consistent with (and doubly enforces, beneath the app-level count check) the "can't delete a category with products" rule.

## States
- [ ] Empty state — `EmptyState`, `Folder` icon, title "لا توجد فئات", description "أضف فئة لتنظيم المنتجات." (shown whenever the list is empty; no distinct "no search results" variant since there's no search on this screen).
- [ ] Loading state — single full-width `Skeleton` block (`h-64`) replacing the entire page content (header included) until the initial fetch settles; no separate skeleton for header vs. table.
- [ ] Error state — **no explicit error toast/banner on the initial list load.** If `GET /api/admin/categories` fails, the `.then` callback is simply never satisfied with valid data (no `.catch` at all on the load fetch), `list` stays `null`, but `loading` still flips false via `.finally` — the page then renders `categories = list ?? []` as an **empty list**, indistinguishable from "no categories exist" (same `EmptyState` copy, no error indication). This is a real inconsistency vs. products/dashboard, which do have `.catch`+toast on their loads. Mutation errors (create/edit/delete), by contrast, do show destructive toasts with the server message or a generic "فشل"/"خطأ في الاتصال" fallback.
- [ ] Permission-restricted state — enforced at `app/(admin)/layout.tsx` only (see dashboard.md); this page and its API routes have no additional role distinction.

## Edge cases
- [ ] Deleting a category with products — fully blocked (button disabled client-side; 400 guard server-side; DB-level `Restrict` as a last resort) — there is no reassign-products-then-delete flow; an admin must first move/delete every product out of a category before the category itself can be removed.
- [ ] Editing a category's slug while products reference it by `categoryId` (not by slug) — safe at the data level (products don't denormalize category slug), but the storefront URL `/categories/{old-slug}` immediately 404s/changes with no redirect, since `Category.slug` is the live lookup key and there's no slug-history/alias table in the schema. `[NEEDS PM INPUT: confirm whether category-slug changes need a redirect strategy for SEO/bookmarked links, or whether this is accepted as rare/low-risk]`.
- [ ] Two categories created concurrently with names that slugify to the same value — second request gets 409 on the uniqueness check; no auto-suffixing (e.g. `-2`) the way some systems do.
- [ ] `sortOrder` ties — secondary sort is alphabetical by `name`, so ties are stable and predictable, not insertion-order-dependent.
- [ ] Extremely large `productCount` — displayed as a raw number with no formatting/truncation; not expected to be an issue at this catalog's scale but noted since other screens (e.g. dashboard) use `formatNumberEn` for numeric display and this one doesn't.

## Notes
- This is the only one of the three screens inventoried so far (dashboard, products, categories) whose initial data-load fetch has **no** `.catch()` handler — a network failure here silently degrades to "no categories" rather than surfacing an error. Flag this as a parity bug worth *fixing* (not preserving) during the rebuild, or at minimum flag it back to the PM since "silent empty state on fetch failure" is a real support-ticket risk (an admin could believe all categories were deleted).
- No admin/superadmin distinction — consistent with every other screen in this batch.
- Categories are flat/single-level by explicit product design (stated in the page's own description copy), not just a current limitation — do not add subcategory nesting in the redesign without a product decision.
- No `[id]` or `new` sub-routes exist for this surface at all — everything (list, create, edit, delete) lives in one page file and three `Dialog`s, unlike Products/Orders which use dedicated `[id]`/`new` routes. This is a smaller, simpler CRUD surface by design given the low complexity/cardinality of categories.
